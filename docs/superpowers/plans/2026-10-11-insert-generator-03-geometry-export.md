# Plan 3 — Geometry & Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a `TraySpec` into a watertight, support-free, printable manifold mesh (in a Web Worker), check it for overhangs and thin features, and write the parts as 3MF, binary STL and zip files.

**Architecture:** Geometry is split into a pure planning step (`plan*.ts`: validation, finger-pocket, scoop, corner-relief and corner-radius math, no WASM, fast tests) and a thin CSG step (`tray.ts`) that builds every convex piece with `Manifold.hull` over points we generate ourselves (so a ring and its inset copy share vertex angles and a lofted 45° chamfer is exact) and combines them with boolean ops, freeing every WASM object through a `Scope`. `checkPrintability` works on the finished mesh only (downward normals + BVH ray-cast thickness); a module Web Worker wraps `buildTray` behind a promise client. `export/` writes 3MF as a streamed OPC zip (fflate), binary STL, zips, safe file names and a bed grid.

**Tech Stack:** TypeScript 6 (strict), manifold-3d 3.5.4 (single-threaded WASM, the package default), fflate 0.8, Vite 6 workers (`worker.format: "es"`, WASM via `?url`), Vitest 5 (node env for WASM tests, jsdom env for three's `3MFLoader`).

**Spec:** [`docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md`](../specs/2026-10-11-boardgame-insert-generator-design.md) (§3 rules 6–8, §4, §5 `TraySpec`, §6, §8.3, §9, §11) and the roadmap [`docs/superpowers/plans/2026-10-11-insert-generator-00-roadmap.md`](2026-10-11-insert-generator-00-roadmap.md) (§4 contracts are binding).

## Global Constraints

- App lives in `apps/insert-generator/`. Built app: `package.json`, `npm run build` outputs `dist/`, `vite.config.ts` sets `base: "./"`, `app.json` has `{ title, description }`.
- Node 22 (`.nvmrc`). Dependency versions (exact ranges): `vite ^6.4.0`, `vitest ^5.0.3`, `typescript ^6.0.3`, `preact ^10.29.8`, `@preact/signals ^2.11.3`, `@preact/preset-vite ^2.10.6`, `manifold-3d ^3.5.4` (single-threaded build only), `three ^0.186.1`, `@types/three ^0.186.0`, `fflate ^0.8.3`, `fast-check ^4.10.2`, `jsdom ^30.1.2`, `@testing-library/preact ^3.2.4`, `rollup-plugin-license ^3.7.1`, `@types/node ^22.0.0` (type-only, for `tsconfig.node.json`). No copyleft dependencies.
- TypeScript strictness from `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` → use `import type`). App `tsconfig.json` (covers `src/`, no Node types): `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`. `tsconfig.node.json` covers the Node-side config files (`vite.config.ts`, later `licenses.config.ts`) with `"types": ["node"]`.
- Lint: root `eslint.config.mjs` (non-type-checked `strict` + `stylistic`, `curly: all`, `eqeqeq`, `prefer-template`, `no-param-reassign`, `no-console` except warn/error). Prettier: `printWidth` from `.prettierrc.json`. Stylelint for CSS. html-validate for `index.html`.
- The app's `build` script: `vitest run && tsc --noEmit && tsc --noEmit -p tsconfig.node.json && vite build` (plan 5 appends `&& node scripts/smoke-dist.mjs dist`); `npm run typecheck` runs both `tsc` checks. Tests run in CI via `npm run build:all`.
- `Math.random` is banned in `apps/insert-generator/src/layout/**` (root ESLint rule, plan 1).
- All lengths are millimetres. Inside `layout/`, lengths are integer 0.01 mm units (`Units` helpers, plan 4); `TraySpec` stores mm rounded to 0.01.
- Versions start at app `0.1.0`, `SCHEMA_VERSION = "0.1.0"`, `GEOMETRY_VERSION = "0.1.0"`. Pre-1.0 makes no compatibility promise (spec §9).
- Never use `localStorage` without `try/catch`. No network calls at runtime.
- Commits: plain imperative messages (e.g. `Add card sizing`). **No `Co-Authored-By` or any trailer.** Commit after every task.
- Run tests from the app folder: `cd apps/insert-generator && npx vitest run <path>`. Run repo checks from the root: `npm run lint`, `npm run format:check`, `npm run verify`.

## Review Focus

- Thin walls (wall setting 1.2 mm) with the default 3 mm outer corner radius leave only ≈ 0.45 mm of plastic between the rounded outer corner and a compartment corner; expected: the corner radius is reduced per tray so every corner keeps ≥ 0.8 mm (Task 3 `plan-corners.test.ts`, Task 5 `tray.test.ts`).
- Compartments closer than 0.8 mm to each other (a thin divider from a rounding or fill bug), touching or overlapping each other, or cutting into the outer wall; expected: all rejected with a `TraySpecError` naming the compartments, never built (Task 3 `plan.test.ts`, Task 5 `tray.test.ts`). `checkPrintability` is a test-time verifier, not run in production.
- Shallow trays where `scoopRadius` (12 mm) exceeds the compartment depth; expected: the fillet radius is clamped to the depth, the tray keeps its height and stays printable (Task 3 `plan.test.ts`, Task 5 `tray.test.ts`).
- A `TraySpec` from a newer-minor project file with an unknown feature `type`, compartment `kind` or `part`; expected: `UnsupportedFeatureError`, surfaced by the worker as an `error` response with a readable message instead of a crash (Task 3 `plan.test.ts`, Task 5 `tray.test.ts`, Task 6 `worker-core.test.ts`).
- Part names with umlauts, emoji, slashes, path segments, control characters, empty or very long text; expected: ASCII-only, non-empty, bounded `NN-…` file names and XML-safe 3MF object names (Task 7 `names.test.ts`, Task 8 `threemf.test.ts`).

---

## Design notes (read before Task 3)

**Frames.** Mesh frame = tray-local: origin at the outer min corner, z = 0 at the bottom, `w` along X, `d` along Y (roadmap §4.3). Compartment rectangles are tray-local.

**What the geometry reads from settings.** Only `bottomChamfer`, `cornerRadius` and `lip.{height, thickness, ledge}`. Scoop radii, finger-pocket sizes and relief diameters come from the `TraySpec` features; `spec.lip` (not `settings.lip.enabled`) decides whether a lip is built.

**Outer block.** Rounded rectangle (`cornerRadius`) with a 45° bottom chamfer `c` (`bottomChamfer`; `max(bottomChamfer, 0.5)` when `level > 0`; spacers use `bottomChamfer`). Built as the hull of three rings: the outer ring inset by `c` with radius `R − c` at z = 0, the outer ring at z = c and at z = h. Both rings use the same `n` segments per quarter at the same angles, so every chamfer facet is planar: on straight sides its normal has `normal.z = −1/√2 = −0.70711`; on corner facets `normal.z = −cos(Δ/2)/√(1 + cos²(Δ/2)) > −0.70711` (steeper, i.e. less overhang). The overhang test is `normal.z < −0.71`, so 45° passes with a margin of 0.0029 (float32 noise on a 0.4 mm facet is ≈ 1e-4). This needs `R ≥ c` (a tighter corner over a 45° chamfer would produce facets flatter than 45°), so the effective radius is never below the chamfer.

**Effective corner radius.** `R = min(cornerRadius, min(w, d)/2 − 0.01)`, reduced so every compartment corner, slot corner and relief disc keeps `MIN_FEATURE + 0.1` mm (the 0.1 covers the polygonal arc lying up to 0.08 mm inside the true arc) to the rounded outer corner: `R − hypot(R − p, R − q) − ρ ≥ m` ⇔ `R ≤ p + q − m + √(2(p − m)(q − m))`, where `p, q` are the disc centre's distances to the corner's two outer faces. Then `R = max(R, c)`. With walls ≥ 1.6 mm the default 3 mm stays; with 1.2 mm walls it becomes 1.924 mm.

**Locating lip** (`spec.lip`). Ring between the outer ring and the outer ring inset by `t = lip.thickness` (radius `max(R − t, 0)`), from `h − 0.5` (overlapping the solid outer wall) to `h + lip.height`, minus a hull "chamfer cutter" from the inner ring at `top − c` to the ring inset `t − c` at `top`, with `c = min(0.6, t − 0.6)`: a `c` × 45° chamfer on the inner top edge and a flat top of `t − c` ≥ 0.6 mm (0.6 × 45° and 0.6 mm at the default 1.2 mm). The chamfer faces up-inward, so it can never overhang. Compartments of a lipped tray must stay `max(wall, t + ledge)` (2.9 mm) from the outer faces; the band between the lip and the compartments is the ledge.

**Compartments.** Each compartment is a cutter subtracted from the block: a rounded-rectangle prism (inner corner radius 0.5 mm) from `floorZ` up past the top, so raised floors are simply solid material below `floorZ`.

- **Finger pockets** (`{ type: "fingerPocket", side, at, width, reach, depth }`): the compartment rectangle includes a band `reach` deep along `side`; the band stays solid up to the rim except for a U-slot `width` wide, centred on `at` (tray-local x for front/back, y for left/right), running across the band, cut `depth` below the rim (never below `floorZ`) with a half-cylinder bottom of radius `width/2`. Across the band it runs `SLOT_CONTENT_OVERLAP` (0.5 mm, at most half the contents) into the contents. Along the side the slot may extend past its compartment through dividers, but if it would reach into the outer wall the spec is rejected (`TraySpecError`) — nothing is ever cut through an outer wall (rule 8). It must also keep the finger slot clearance (roadmap §4.6): 0.8 mm from other compartments' contents (except where they only reach its 0.5 mm overlap) and from other slots, except neighbouring twins on its band line, which merge into one channel when their centres are at most `maxChannelSpacing(r)` apart, and the slot on the opposite side of its own compartment. A well face it meets within its overlap (its own or a twin's) lies at most `maxWellFaceOffset(r)` from the nearest covering slot's centre when that centre is on the face's solid side; when it is on the contents' side and the next slot toward the solid side merges with it, the half ridge the face leaves is ≥ 0.8 mm wide 0.8 mm below its peak (`cutRidgeWidth`); a face no slot covers keeps 0.8 mm from the slots' ends. So every piece of material there is ≥ 0.8 mm wide 0.8 mm below its top (`test-wedge.ts` measures it). These predicates live once in `model/slot-rules.ts`: sizing places slots with them at tolerance 0, planTray checks with `SPEC_TOLERANCE`.
- **Scoop** (`{ type: "scoop", side, r }`): a concave quarter-round fillet between the floor and the wall on `side`: the solid `r × r` corner region minus a cylinder of radius `r` whose vertices sit exactly at 0°/90°/180°/270°, so it meets floor and wall tangentially. `r` is clamped to the compartment depth and to its size across the side; below 0.5 mm it is dropped. All fillet normals point up.
- **Corner relief** (`{ type: "cornerRelief", d }`): a vertical cylinder at each content corner whose circle passes through the corner and is centred on the corner's diagonal, so it cuts `r·(1 − 1/√2)` into both adjoining walls. `r = min(d/2, budget/(1 − 1/√2))` where the budget is the material above 0.8 mm on that side (half of it toward another compartment, which may have reliefs too, or toward its finger slots); reliefs under 0.3 mm are dropped. Between two Ø3 tile wells with a 1.2 mm divider the reliefs facing the divider shrink to r = 0.683 mm.

**Validation** (`TraySpecError`, a `RangeError` named `"TraySpecError"`; message starts with `Tray <key>:`): non-positive or non-finite sizes, tray too small for its chamfer, wall < `MIN_WALL_MM` (0.9 mm = `MIN_FEATURE_MM + CORNER_MARGIN`, non-solid parts), lip thickness < `MIN_WALL_MM`, lip height not above the lip chamfer, `floorZ` outside (0, h), compartments less than 0.8 mm apart (along x or y; touching and overlapping included), compartments closer than the (lipped) outer wall to an outer face, finger pockets that would reach into the outer wall or break the finger slot clearance rule, reach bands that leave less than `MIN_POCKET_CONTENT` (1 mm) for the contents, and a bottom chamfer the walls, floors or corners cannot take. Every limit is compared with `SPEC_TOLERANCE` (0.005 mm): TraySpec numbers sit on the 0.01 mm grid, so a spec exactly on a limit passes despite float noise in sums and differences. Unknown `part`, compartment `kind` or feature `type` (checked against `KNOWN_PARTS`, `KNOWN_COMPARTMENT_KINDS`, `KNOWN_FEATURE_TYPES` from `types.ts`, in every compartment): `UnsupportedFeatureError`. Otherwise, compartments of solid leftovers and spacers are ignored.

**Printability check (mesh only).** Overhangs: triangles with area ≥ 1e-4 mm², `normal.z < −0.71` and any vertex above z = 0.001. Minimum feature (an estimate, sampled at triangle centroids): from each wall face (`|normal.z| < 0.02`) a horizontal ray goes into the material and stops at the nearest accepted wall exit face (sloped exits are skipped, so thickness can be overestimated, never underestimated); from each horizontal face (`|normal.z| > 0.98`) a vertical ray stops at the nearest opposite horizontal face. Sloped faces are not sampled, so the sloped tops of dividers under a finger slot are not reported as knife edges. Because only centroids are sampled, a polygon vertex can be up to the facet sagitta thinner than reported; the planning rules above guarantee the 0.8 mm minimum (lip thickness ≥ 0.9 mm so concentric polygon rings keep ≥ 0.8 at corner facets), the check verifies it. Measured values compare with a 1e-3 mm `THICKNESS_TOLERANCE` and are printed with 3 decimals. An empty mesh or one without usable triangles gives `ok: false`, `minFeatureMm: 0`, "nothing to measure"; if every ray misses, the smallest bounding-box extent is used (still compared with 0.8). The check costs about 1 s per 50k triangles. It is a test-time verifier: planTray rejects every spec that would build a feature under 0.8 mm, so production builds don't run it; the tests run it on built meshes to confirm the planning rules leave nothing thinner.

**Memory.** Every `Manifold` created in a build is registered with a `Scope` (`scope.track(...)`) and deleted in `withScope`'s `finally`, also on throw. Meshes are copied out of the kernel's buffers before they are transferred to the main thread.

**Bundling note for other plans.** Main-thread and layout code should import `GEOMETRY_VERSION` from `src/geometry/version` and types from `src/geometry/types`; importing `src/geometry/index` pulls `manifold-3d` (and its WASM asset) into that bundle.

---

### Task 1: Dependencies, geometry types, version and memory scope

**Files:**

- Modify: `apps/insert-generator/package.json`, `apps/insert-generator/package-lock.json` (only through `npm install`; never rewrite `package.json` by hand)
- Create: `apps/insert-generator/src/geometry/types.ts`
- Create: `apps/insert-generator/src/geometry/version.ts`
- Create: `apps/insert-generator/src/geometry/errors.ts`
- Create: `apps/insert-generator/src/geometry/scope.ts`
- Test: `apps/insert-generator/src/geometry/basics.test.ts`

**Interfaces:**

- Consumes: `Settings`, `TraySpec` from `src/model/types.ts` (plan 1, roadmap §4.1).
- Produces:
  - `src/geometry/types.ts`: `Mesh`, `PrintabilityReport`, `GeometryRequest`, `GeometryResponse`, and the readonly arrays `KNOWN_PARTS` (`tray`, `leftover`, `spacer`), `KNOWN_COMPARTMENT_KINDS` (`well`, `scoop`, `pocket`, `spare`), `KNOWN_FEATURE_TYPES` (`fingerPocket`, `scoop`, `cornerRelief`) exactly as roadmap §4.3. The file imports only types, so the main thread (plan 5's `app/support.ts`) can import the lists without pulling in manifold-3d.
  - `src/geometry/version.ts`: `export const GEOMETRY_VERSION = "0.1.0";`
  - `src/geometry/errors.ts`: `export class UnsupportedFeatureError extends Error { readonly feature: string; constructor(feature: string) }`
  - `src/geometry/scope.ts`: `interface Deletable { delete(): void }`, `class Scope { track<T extends Deletable>(item: T): T; dispose(): void }`, `function withScope<T>(fn: (scope: Scope) => T): T`

- [ ] **Step 1: Add the runtime dependencies**

Run from `apps/insert-generator`:

```bash
npm install manifold-3d@^3.5.4 fflate@^0.8.3
```

`npm install` adds or updates only these two entries and leaves the rest of `package.json` alone. If plan 1 already installed one of them (e.g. `fflate` for URL compression), that entry stays as it is. Do not replace or hand-edit `package.json`.

Expected: `package.json` `dependencies` contain `"fflate": "^0.8.3"` and `"manifold-3d": "^3.5.4"`, every entry from plan 1 is still there (`git diff package.json` shows at most these two lines added), and `package-lock.json` is updated. manifold-3d 3.5.4 ships one single-threaded build (`manifold.js` + `manifold.wasm`, no `SharedArrayBuffer`), which is what GitHub Pages needs.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { GEOMETRY_VERSION } from "./version";
import { UnsupportedFeatureError } from "./errors";
import { Scope, withScope } from "./scope";

function item(log: string[], name: string) {
  return { delete: () => log.push(name) };
}

describe("withScope", () => {
  it("deletes every tracked object in reverse order and returns the result", () => {
    const log: string[] = [];
    const result = withScope((scope) => {
      scope.track(item(log, "a"));
      scope.track(item(log, "b"));
      return 42;
    });
    expect(result).toBe(42);
    expect(log).toEqual(["b", "a"]);
  });

  it("deletes tracked objects when the body throws", () => {
    const log: string[] = [];
    expect(() =>
      withScope((scope) => {
        scope.track(item(log, "a"));
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(log).toEqual(["a"]);
  });

  it("track returns the object it was given", () => {
    const scope = new Scope();
    const thing = item([], "x");
    expect(scope.track(thing)).toBe(thing);
    scope.dispose();
  });
});

describe("UnsupportedFeatureError and GEOMETRY_VERSION", () => {
  it("names the unknown feature", () => {
    const err = new UnsupportedFeatureError("magnet");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UnsupportedFeatureError");
    expect(err.feature).toBe("magnet");
    expect(err.message).toMatch(/"magnet".*newer app version/);
  });

  it("starts at 0.1.0", () => {
    expect(GEOMETRY_VERSION).toBe("0.1.0");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/geometry/basics.test.ts`
Expected: FAIL — `Cannot find module './version'` (the modules don't exist yet).

- [ ] **Step 4: Write the implementation**

`src/geometry/types.ts` (roadmap §4.3, verbatim):

```ts
import type { CompartmentSpec, FeatureSpec, Settings, TraySpec } from "../model/types";

// The part, compartment kind and feature values this geometry version can build. A stored
// tray using anything else (a newer-minor file, spec §9) is refused with
// UnsupportedFeatureError; the UI checks the same lists before calling the worker.
export const KNOWN_PARTS: readonly TraySpec["part"][] = ["tray", "leftover", "spacer"];
export const KNOWN_COMPARTMENT_KINDS: readonly CompartmentSpec["kind"][] = [
  "well",
  "scoop",
  "pocket",
  "spare",
];
export const KNOWN_FEATURE_TYPES: readonly FeatureSpec["type"][] = [
  "fingerPocket",
  "scoop",
  "cornerRelief",
];

export interface Mesh {
  positions: Float32Array; // xyz per vertex, mm
  indices: Uint32Array; // 3 per triangle, CCW seen from outside
}

export interface PrintabilityReport {
  ok: boolean;
  overhangTriangles: number; // normal.z < −0.71 and not at z = 0
  minFeatureMm: number; // estimated thinnest wall/lip
  problems: string[];
}

export type GeometryRequest =
  | { type: "build"; requestId: number; spec: TraySpec; settings: Settings }
  | { type: "cancel"; requestId: number };

export type GeometryResponse =
  | { type: "built"; requestId: number; key: string; mesh: Mesh; volumeMm3: number }
  | { type: "error"; requestId: number; key: string; message: string };
```

`src/geometry/version.ts`:

```ts
// Semver of the tray geometry generator (spec §9). Bump PATCH for mesh-only
// changes, MINOR for new optional features, MAJOR when trays exported before
// and after would no longer mate (outer size, lip, insets, compartment sizes).
export const GEOMETRY_VERSION = "0.1.0";
```

`src/geometry/errors.ts`:

```ts
// Thrown when a TraySpec (usually from a newer-minor project file) uses a
// part or feature this geometry version does not know. Such trays are shown
// but cannot be built or exported (spec §9).
export class UnsupportedFeatureError extends Error {
  readonly feature: string;

  constructor(feature: string) {
    super(`Unsupported tray feature "${feature}": this tray was made with a newer app version`);
    this.name = "UnsupportedFeatureError";
    this.feature = feature;
  }
}
```

`src/geometry/scope.ts`:

```ts
// manifold-3d objects live in WASM memory and are never garbage-collected.
// Every Manifold created during a build is registered with a Scope and freed
// in one place, even when the build throws.

export interface Deletable {
  delete(): void;
}

export class Scope {
  private readonly items: Deletable[] = [];

  track<T extends Deletable>(item: T): T {
    this.items.push(item);
    return item;
  }

  dispose(): void {
    while (this.items.length > 0) {
      this.items.pop()?.delete();
    }
  }
}

export function withScope<T>(fn: (scope: Scope) => T): T {
  const scope = new Scope();
  try {
    return fn(scope);
  } finally {
    scope.dispose();
  }
}
```

- [ ] **Step 5: Run the test and the type check**

Run: `npx vitest run src/geometry/basics.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/geometry/types.ts src/geometry/version.ts src/geometry/errors.ts src/geometry/scope.ts src/geometry/basics.test.ts
git commit -m "Add geometry types, version and WASM memory scope"
```

---

### Task 2: Manifold loader and convex solid helpers

**Files:**

- Create: `apps/insert-generator/src/geometry/load.ts`
- Create: `apps/insert-generator/src/geometry/shapes.ts`
- Test: `apps/insert-generator/src/geometry/shapes.test.ts`

**Interfaces:**

- Consumes: `Scope` (Task 1); `ManifoldToplevel`, `Manifold`, `Vec2`, `Vec3` types and the default export `Module(config?: { locateFile: () => string }): Promise<ManifoldToplevel>` from `manifold-3d`; `Manifold.hull(points: Vec3[]): Manifold`.
- Produces:
  - `src/geometry/load.ts`: `loadManifold(wasmUrl?: string): Promise<ManifoldToplevel>` — loads once, calls `setup()`, forgets a failed load so the next call retries.
  - `src/geometry/shapes.ts`:
    - `interface Layer { ring: Vec2[]; z: number }`
    - `quarterSegments(r: number): number` (2…16 segments per 90°)
    - `roundedRectRing(x0: number, y0: number, x1: number, y1: number, r: number, n: number): Vec2[]`
    - `circleRing(cx: number, cy: number, r: number, segments: number): Vec2[]`
    - `hullPoints(m: ManifoldToplevel, scope: Scope, points: Vec3[]): Manifold`
    - `loft(m: ManifoldToplevel, scope: Scope, layers: Layer[]): Manifold`
    - `prism(m: ManifoldToplevel, scope: Scope, ring: Vec2[], z0: number, z1: number): Manifold`
    - `box(m: ManifoldToplevel, scope: Scope, min: Vec3, max: Vec3): Manifold`
    - `horizontalCylinder(m: ManifoldToplevel, scope: Scope, axis: "x" | "y", from: number, to: number, a: number, z: number, r: number): Manifold`
  - Every returned `Manifold` is already tracked by the given `Scope`.

WASM tests start with `// @vitest-environment node`: manifold.js reads `manifold.wasm` from disk with `node:fs` when it runs in Node, whatever the project's default test environment is.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { loadManifold } from "./load";
import { withScope } from "./scope";
import {
  box,
  circleRing,
  horizontalCylinder,
  loft,
  prism,
  quarterSegments,
  roundedRectRing,
} from "./shapes";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

describe("loadManifold", () => {
  it("returns the same initialised module on every call", async () => {
    expect(await loadManifold()).toBe(m);
    expect(typeof m.Manifold.hull).toBe("function");
  });
});

describe("rings", () => {
  it("uses 2…16 segments per quarter", () => {
    expect([0, 0.5, 3, 12, 100].map(quarterSegments)).toEqual([2, 2, 6, 16, 16]);
  });

  it("puts corner arcs on fixed angles so inset rings line up", () => {
    const outer = roundedRectRing(0, 0, 20, 10, 3, 6);
    const inner = roundedRectRing(0.4, 0.4, 19.6, 9.6, 2.6, 6);
    expect(outer).toHaveLength(28);
    expect(inner).toHaveLength(28);
    outer.forEach(([x, y], i) => {
      const [ix = 0, iy = 0] = inner[i] ?? [];
      // every inner vertex is its outer vertex moved 0.4 toward the arc centre
      expect(Math.hypot(x - ix, y - iy)).toBeCloseTo(0.4, 9);
    });
  });

  it("returns a plain rectangle for radius 0", () => {
    expect(roundedRectRing(1, 2, 3, 4, 0, 6)).toEqual([
      [1, 2],
      [3, 2],
      [3, 4],
      [1, 4],
    ]);
  });

  it("starts circles at angle 0 with a vertex on every axis", () => {
    const ring = circleRing(0, 0, 2, 8);
    expect(ring[0]).toEqual([2, 0]);
    expect(ring[2]?.[0]).toBeCloseTo(0, 12);
    expect(ring[2]?.[1]).toBeCloseTo(2, 12);
  });
});

describe("solids", () => {
  it("box and prism have exact volumes", () => {
    withScope((scope) => {
      expect(box(m, scope, [0, 0, 0], [2, 3, 4]).volume()).toBeCloseTo(24, 9);
      const square = roundedRectRing(0, 0, 10, 10, 0, 1);
      expect(prism(m, scope, square, 1, 3).volume()).toBeCloseTo(200, 9);
    });
  });

  it("a loft of a ring and its 1 mm inset over 1 mm is a 45° frustum", () => {
    withScope((scope) => {
      const solid = loft(m, scope, [
        { ring: roundedRectRing(1, 1, 9, 9, 0, 1), z: 0 },
        { ring: roundedRectRing(0, 0, 10, 10, 0, 1), z: 1 },
      ]);
      // square frustum: h/3 · (A1 + A2 + √(A1·A2)) = (64 + 100 + 80) / 3
      expect(solid.volume()).toBeCloseTo(244 / 3, 9);
    });
  });

  it("horizontal cylinders run along the requested axis", () => {
    withScope((scope) => {
      const alongX = horizontalCylinder(m, scope, "x", 0, 10, 5, 5, 2).boundingBox();
      expect(alongX.min[0]).toBeCloseTo(0, 9);
      expect(alongX.max[0]).toBeCloseTo(10, 9);
      expect(alongX.min[1]).toBeCloseTo(3, 9);
      expect(alongX.max[2]).toBeCloseTo(7, 9);
      const alongY = horizontalCylinder(m, scope, "y", 0, 10, 5, 5, 2).boundingBox();
      expect(alongY.max[1]).toBeCloseTo(10, 9);
      expect(alongY.min[0]).toBeCloseTo(3, 9);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/geometry/shapes.test.ts`
Expected: FAIL — `Cannot find module './load'`.

- [ ] **Step 3: Write the implementation**

`src/geometry/load.ts`:

```ts
import Module from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";

let cached: Promise<ManifoldToplevel> | null = null;

// Loads and initialises the single-threaded manifold WASM module once.
// - Node (vitest): call without arguments; manifold.js finds manifold.wasm
//   next to itself.
// - Browser/worker: pass the URL from `import wasmUrl from
//   "manifold-3d/manifold.wasm?url"` so Vite emits the asset and the
//   relative base works under any subpath.
// The first call wins; a failed load is forgotten so the next call retries.
export function loadManifold(wasmUrl?: string): Promise<ManifoldToplevel> {
  if (cached === null) {
    const config = wasmUrl === undefined ? undefined : { locateFile: () => wasmUrl };
    const loading = Module(config).then((m) => {
      m.setup();
      return m;
    });
    loading.catch(() => {
      if (cached === loading) {
        cached = null;
      }
    });
    cached = loading;
  }
  return cached;
}
```

`src/geometry/shapes.ts`:

```ts
import type { Manifold, ManifoldToplevel, Vec2, Vec3 } from "manifold-3d";
import type { Scope } from "./scope";

// Every solid here is convex and built with Manifold.hull over points we
// generate ourselves. That keeps arcs on fixed angles (k · 90° / n), so a
// ring and its inset copy have matching vertices and a lofted 45° chamfer is
// made of exact 45° (or steeper) facets.

export interface Layer {
  ring: Vec2[];
  z: number;
}

// Segments per 90° of arc: 2 for tiny radii, up to 16 (64 per circle).
export function quarterSegments(r: number): number {
  return Math.min(16, Math.max(2, Math.ceil(r * 2)));
}

// Rectangle [x0, x1] × [y0, y1] with corner radius r, counter-clockwise.
// n = segments per corner; pass the same n to rings that are lofted together.
export function roundedRectRing(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  n: number,
): Vec2[] {
  if (r <= 1e-6) {
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
  }
  const corners: [number, number, number][] = [
    [x1 - r, y0 + r, -90],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, 90],
    [x0 + r, y0 + r, 180],
  ];
  const pts: Vec2[] = [];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= n; k += 1) {
      const a = ((a0 + (90 * k) / n) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

// Circle with `segments` vertices (a multiple of 4), the first at angle 0,
// so there are vertices exactly at 0°, 90°, 180° and 270°.
export function circleRing(cx: number, cy: number, r: number, segments: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let k = 0; k < segments; k += 1) {
    const a = (2 * Math.PI * k) / segments;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

export function hullPoints(m: ManifoldToplevel, scope: Scope, points: Vec3[]): Manifold {
  return scope.track(m.Manifold.hull(points));
}

// Convex hull of horizontal rings placed at their z (a loft of convex rings).
export function loft(m: ManifoldToplevel, scope: Scope, layers: Layer[]): Manifold {
  const points: Vec3[] = [];
  for (const { ring, z } of layers) {
    for (const [x, y] of ring) {
      points.push([x, y, z]);
    }
  }
  return hullPoints(m, scope, points);
}

export function prism(
  m: ManifoldToplevel,
  scope: Scope,
  ring: Vec2[],
  z0: number,
  z1: number,
): Manifold {
  return loft(m, scope, [
    { ring, z: z0 },
    { ring, z: z1 },
  ]);
}

export function box(m: ManifoldToplevel, scope: Scope, min: Vec3, max: Vec3): Manifold {
  return prism(m, scope, roundedRectRing(min[0], min[1], max[0], max[1], 0, 1), min[2], max[2]);
}

// Horizontal cylinder of radius r whose axis runs along X (axis "x") or Y
// (axis "y") from `from` to `to`, through the point (a, z) where a is the
// cross-axis coordinate (y for axis "x", x for axis "y").
export function horizontalCylinder(
  m: ManifoldToplevel,
  scope: Scope,
  axis: "x" | "y",
  from: number,
  to: number,
  a: number,
  z: number,
  r: number,
): Manifold {
  const points: Vec3[] = [];
  for (const [u, v] of circleRing(a, z, r, 4 * quarterSegments(r))) {
    for (const e of [from, to]) {
      points.push(axis === "x" ? [e, u, v] : [u, e, v]);
    }
  }
  return hullPoints(m, scope, points);
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run src/geometry/shapes.test.ts && npx tsc --noEmit`
Expected: PASS (8 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/load.ts src/geometry/shapes.ts src/geometry/shapes.test.ts
git commit -m "Add manifold loader and convex solid helpers"
```

---

### Task 3: Tray planning (validation, pockets, scoops, reliefs, corner radius)

**Files:**

- Create: `apps/insert-generator/src/geometry/plan-types.ts`
- Create: `apps/insert-generator/src/geometry/plan-corners.ts`
- Create: `apps/insert-generator/src/geometry/plan.ts`
- Create: `apps/insert-generator/src/geometry/test-specs.ts` (fixtures shared by geometry and export tests)
- Test: `apps/insert-generator/src/geometry/plan.test.ts`
- Test: `apps/insert-generator/src/geometry/plan-corners.test.ts`

**Interfaces:**

- Consumes: `TraySpec`, `CompartmentSpec`, `FeatureSpec`, `Settings`, `Side` (roadmap §4.1); `DEFAULT_SETTINGS` from `src/model/settings.ts` (roadmap §4.5); `UnsupportedFeatureError` (Task 1).
- Produces:
  - `src/geometry/plan-types.ts`: constants (no `MIN_FEATURE` or `UPPER_MIN_CHAMFER`: see the note in Step 4) `INNER_CORNER_RADIUS = 0.5`, `LIP_CHAMFER = 0.6`, `MIN_RELIEF_RADIUS = 0.3`, `MIN_SCOOP_RADIUS = 0.5`, `SPEC_TOLERANCE = 0.005`, `CORNER_MARGIN = 0.1`, `RELIEF_CUT = 1 − 1/√2`; interfaces `Rect { x0; y0; x1; y1 }`, `SlotPlan extends Rect { side: Side; bottomZ: number; radius: number }`, `ScoopPlan { side: Side; r: number }`, `ReliefPlan { cx: number; cy: number; r: number }`, `CompartmentPlan { index; rect: Rect; content: Rect; floorZ; slots: SlotPlan[]; scoops: ScoopPlan[]; reliefs: ReliefPlan[] }`, `LipPlan { height; thickness; chamfer }`, `TrayPlan { w; d; h; topZ; chamfer; cornerRadius; outerWall; lip: LipPlan | null; compartments: CompartmentPlan[] }` (all numbers in mm).
  - `src/geometry/plan-corners.ts`: `interface TraySize { w: number; d: number }`, `sideBudget(size: TraySize, plans: CompartmentPlan[], self: CompartmentPlan, side: Side): number`, `planReliefs(size: TraySize, plans: CompartmentPlan[], self: CompartmentPlan, diameter: number): ReliefPlan[]`, `maxCornerRadius(p: number, q: number, rho: number): number`, `planCornerRadius(size: TraySize, setting: number, chamfer: number, compartments: CompartmentPlan[]): number`.
  - `src/geometry/plan.ts`: `planTray(spec: TraySpec, settings: Settings): TrayPlan` (throws `RangeError` / `UnsupportedFeatureError`, see Design notes; the known values come from `KNOWN_PARTS`, `KNOWN_COMPARTMENT_KINDS`, `KNOWN_FEATURE_TYPES` in `types.ts`, Task 1; an unknown kind throws `UnsupportedFeatureError("kind:<kind>")`, an unknown part `"part:<part>"`).
  - `src/geometry/test-specs.ts`: `GEO: Settings`, `traySpec(over)`, `compartment(over)`, `strip(widths, y, d, start, divider, make)`, `pocket(side, at, depth, width = 22, reach = 12): FeatureSpec`, and one fixture per tray type: `plainBox`, `cardUpright`, `flatCards`, `scoopBulk`, `hexTiles`, `miniPockets`, `customBlock`, `spareLeftover`, `solidLeftover`, `spacer`, `lippedLower`, `upperLevel1`.

- [ ] **Step 1: Write the fixtures**

`src/geometry/test-specs.ts` pins the geometry settings in `GEO` so the tests don't depend on future default changes. `cardUpright`'s third deck is only 15 mm wide: its 22 mm slots are shifted (`at = 61.8`) to stay out of the outer wall and cross the divider into the middle deck's slots, 20 mm from their centres, so the two merge into one channel (at most `maxChannelSpacing(11)` = 20.06 mm). `slotIntoSpare` is the sizing output that once left a 0.04 mm feather (rejected now); `slotBesideSlack` is the same tray as sizing emits it today.

```ts
// TraySpec fixtures for geometry and export tests, one per tray type.
// Numbers follow spec §6/§7.1 with the geometry settings pinned in GEO.
import type { CompartmentSpec, FeatureSpec, Settings, Side, TraySpec } from "../model/types";
import { DEFAULT_SETTINGS } from "../model/settings";

export const GEO: Settings = {
  ...DEFAULT_SETTINGS,
  wall: 1.6,
  floor: 1.2,
  divider: 1.2,
  bottomChamfer: 0.4,
  cornerRadius: 3,
  scoopRadius: 12,
  fingerPocket: { width: 22, reach: 12 },
  lip: { enabled: true, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 },
};

export function traySpec(
  over: Partial<TraySpec> & Pick<TraySpec, "key" | "w" | "d" | "h">,
): TraySpec {
  return {
    part: "tray",
    path: "0",
    stack: 0,
    level: 0,
    x: 0,
    y: 0,
    z: 0,
    rotated: false,
    wall: 1.6,
    floor: 1.2,
    lip: false,
    solid: false,
    compartments: [],
    ...over,
  };
}

export function compartment(
  over: Partial<CompartmentSpec> & Pick<CompartmentSpec, "x" | "y" | "w" | "d">,
): CompartmentSpec {
  return { floorZ: 1.2, kind: "well", contents: "test", features: [], ...over };
}

// Compartments laid out left to right with `divider` between them.
export function strip(
  widths: number[],
  y: number,
  d: number,
  start: number,
  divider: number,
  make: (x: number, w: number, i: number) => Partial<CompartmentSpec>,
): CompartmentSpec[] {
  let x = start;
  return widths.map((w, i) => {
    const c = compartment({ x, y, w, d, ...make(x, w, i) });
    x += w + divider;
    return c;
  });
}

// 100 × 60 × 30 box with one 96.8 × 56.8 well, floor 1.2.
export const plainBox = traySpec({
  key: "plain:p0:0",
  w: 100,
  d: 60,
  h: 30,
  compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8 })],
});

export function pocket(side: Side, at: number, depth: number, width = 22, reach = 12): FeatureSpec {
  return { type: "fingerPocket", side, at, width, reach, depth };
}

// Three sleeved Standard decks standing on their long edge (well 68 high,
// 92.5 long + 2 × 12 reach), the last deck only 15 wide so its pockets
// cross the divider into the middle deck's pockets.
export const cardUpright = traySpec({
  key: "cards:p0:0",
  w: 1.6 + 24 + 1.2 + 30 + 1.2 + 15 + 1.6,
  d: 1.6 + 116.5 + 1.6,
  h: 1.2 + 68,
  compartments: strip([24, 30, 15], 1.6, 116.5, 1.6, 1.2, (x, w, i) => {
    const at = i === 2 ? 74.6 - 1.6 - 11 : x + w / 2;
    return {
      contents: `Deck ${i + 1}`,
      features: [pocket("front", at, 68 / 3), pocket("back", at, 68 / 3)],
    };
  }),
});

// Flat cards: one well, full-depth pockets on both short sides.
export const flatCards = traySpec({
  key: "flat:p0:0",
  w: 1.6 + 116.5 + 1.6,
  d: 1.6 + 68 + 1.6,
  h: 1.2 + 20,
  compartments: [
    compartment({
      x: 1.6,
      y: 1.6,
      w: 116.5,
      d: 68,
      features: [pocket("left", 1.6 + 34, 20), pocket("right", 1.6 + 34, 20)],
    }),
  ],
});

// Bulk: three scoop compartments with a front fillet r = 12.
export const scoopBulk = traySpec({
  key: "bulk:p0:0",
  w: 1.6 + 40 * 3 + 1.2 * 2 + 1.6,
  d: 60,
  h: 30,
  compartments: strip([40, 40, 40], 1.6, 56.8, 1.6, 1.2, () => ({
    kind: "scoop",
    features: [{ type: "scoop", side: "front", r: 12 }],
  })),
});

// Hex tiles (flatToFlat 40 → corner-to-corner 46.19 + 1 clearance), two
// columns with Ø3 corner reliefs, 15 tiles × 2 mm high.
export const hexTiles = traySpec({
  key: "tiles:p0:0",
  w: 1.6 + 47.2 * 2 + 1.2 + 1.6,
  d: 1.6 + 41 + 1.6,
  h: 1.2 + 31,
  compartments: strip([47.2, 47.2], 1.6, 41, 1.6, 1.2, () => ({
    features: [{ type: "cornerRelief", d: 3 }],
  })),
});

// Minis pockets: figure depths differ, so two pockets have raised solid floors.
export const miniPockets = traySpec({
  key: "minis:p0:0",
  w: 1.6 + 30 * 3 + 1.2 * 2 + 1.6,
  d: 1.6 + 30 + 1.6,
  h: 1.2 + 40,
  compartments: strip([30, 30, 30], 1.6, 30, 1.6, 1.2, (x, w, i) => ({
    kind: "pocket",
    floorZ: [1.2, 11.2, 21.2][i] ?? 1.2,
    features: [pocket("front", x + w / 2, 40 / 3, 20, 6)],
  })),
});

// Custom block: a plain well with corner reliefs and one full-depth pocket.
export const customBlock = traySpec({
  key: "custom:p0:0",
  w: 1.6 + 50 + 1.6,
  d: 1.6 + 40 + 12 + 1.6,
  h: 1.2 + 15,
  compartments: [
    compartment({
      x: 1.6,
      y: 1.6,
      w: 50,
      d: 52,
      features: [{ type: "cornerRelief", d: 3 }, pocket("back", 1.6 + 25, 15)],
    }),
  ],
});

export const spareLeftover = traySpec({
  key: "leftover:0",
  part: "leftover",
  w: 40,
  d: 70,
  h: 30,
  compartments: [
    compartment({ x: 1.6, y: 1.6, w: 36.8, d: 66.8, kind: "spare", contents: "spare" }),
  ],
});

export const solidLeftover = traySpec({
  key: "leftover:1",
  part: "leftover",
  solid: true,
  w: 20,
  d: 70,
  h: 30,
});

export const spacer = traySpec({
  key: "cards:p0:0:spacer",
  part: "spacer",
  path: "",
  solid: true,
  w: 92.5,
  d: 8,
  h: 63,
});

// Bottom tray of a two-stack: lipped wall max(1.6, 1.2 + 1.7) = 2.9.
export const lippedLower = traySpec({
  key: "lower:p0:0",
  w: 100,
  d: 60,
  h: 25,
  lip: true,
  compartments: [compartment({ x: 2.9, y: 2.9, w: 94.2, d: 54.2 })],
});

// Upper tray on it: inset 1.45 per side, h ≥ lip height + 3, chamfer ≥ 0.5.
export const upperLevel1 = traySpec({
  key: "upper:p0:0",
  level: 1,
  w: 100 - 2 * 1.45,
  d: 60 - 2 * 1.45,
  h: 20,
  compartments: [compartment({ x: 1.6, y: 1.6, w: 100 - 2.9 - 3.2, d: 60 - 2.9 - 3.2 })],
});
```

- [ ] **Step 2: Write the failing tests**

`src/geometry/plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planTray } from "./plan";
import { UnsupportedFeatureError } from "./errors";
import type { FeatureSpec, TraySpec } from "../model/types";
import {
  GEO,
  cardUpright,
  compartment,
  customBlock,
  lippedLower,
  plainBox,
  pocket,
  scoopBulk,
  spacer,
  traySpec,
  upperLevel1,
} from "./test-specs";

describe("planTray basics", () => {
  it("uses the settings chamfer on level 0 and at least 0.5 on upper levels", () => {
    expect(planTray(plainBox, GEO).chamfer).toBe(0.4);
    expect(planTray(upperLevel1, GEO).chamfer).toBe(0.5);
    expect(planTray(upperLevel1, { ...GEO, bottomChamfer: 0.8 }).chamfer).toBe(0.8);
    expect(planTray(spacer, GEO).chamfer).toBe(0.4);
  });

  it("adds the lip from settings and widens the outer wall", () => {
    const plan = planTray(lippedLower, GEO);
    expect(plan.lip).toEqual({ height: 2, thickness: 1.2, chamfer: 0.6 });
    expect(plan.outerWall).toBeCloseTo(2.9, 9);
    expect(plan.topZ).toBe(27);
    expect(planTray(plainBox, GEO).lip).toBeNull();
  });

  it("keeps the default corner radius when walls are thick enough", () => {
    expect(planTray(plainBox, GEO).cornerRadius).toBe(3);
  });

  it("ignores compartments of solid parts", () => {
    expect(planTray({ ...plainBox, solid: true }, GEO).compartments).toEqual([]);
    expect(planTray(spacer, GEO).compartments).toEqual([]);
  });
});

describe("finger pockets", () => {
  it("leaves the reach band solid and cuts a U-slot in it", () => {
    const plan = planTray(cardUpright, GEO);
    const deck = plan.compartments[0];
    expect(deck?.content).toEqual({ x0: 1.6, y0: 13.6, x1: 25.6, y1: 106.1 });
    expect(deck?.slots).toHaveLength(2);
    const front = deck?.slots[0];
    expect(front?.x0).toBeCloseTo(2.6, 9);
    expect(front?.x1).toBeCloseTo(24.6, 9);
    expect(front?.y0).toBe(1.6);
    expect(front?.y1).toBeCloseTo(14.1, 9);
    expect(front?.radius).toBe(11);
    expect(front?.bottomZ).toBeCloseTo(69.2 - 68 / 3, 9);
  });

  it("clamps the pocket depth to the compartment floor", () => {
    const spec = traySpec({
      key: "deep",
      w: 60,
      d: 60,
      h: 10,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 56.8, d: 56.8, features: [pocket("front", 30, 50)] }),
      ],
    });
    expect(planTray(spec, GEO).compartments[0]?.slots[0]?.bottomZ).toBeCloseTo(1.2, 9);
  });

  it("rejects a pocket that would cut through the outer wall", () => {
    const spec = traySpec({
      key: "edge",
      w: 40,
      d: 60,
      h: 20,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 36.8, d: 56.8, features: [pocket("front", 5, 5)] }),
      ],
    });
    expect(() => planTray(spec, GEO)).toThrow(/cut through the outer wall/);
  });

  it("rejects a reach that leaves no room for the contents", () => {
    const spec = traySpec({
      key: "reach",
      w: 60,
      d: 30,
      h: 20,
      compartments: [
        compartment({
          x: 1.6,
          y: 1.6,
          w: 56.8,
          d: 26.8,
          features: [pocket("front", 30, 5, 22, 13), pocket("back", 30, 5, 22, 13)],
        }),
      ],
    });
    expect(() => planTray(spec, GEO)).toThrow(/no room/);
  });
});

describe("limits", () => {
  it("accepts specs exactly on a limit despite float noise (sizing output, 0.01 mm grid)", () => {
    // Content 8.29 − 7.29 = 0.9999999999999991 mm: exactly the 1 mm minimum.
    const narrow = traySpec({
      key: "narrow",
      w: 20,
      d: 30,
      h: 10,
      compartments: [
        compartment({ x: 7.29, y: 1.6, w: 1, d: 26.8, features: [pocket("front", 7.79, 3, 1)] }),
      ],
    });
    expect(planTray(narrow, GEO).compartments[0]?.content.x0).toBe(7.29);
    // Chamfer 2.27: h ≥ 2.27 + 0.8 = 3.0700000000000003 and min(w, d) ≥ 6.140000000000001.
    const steep = { ...GEO, bottomChamfer: 2.27 };
    const low = traySpec({
      key: "low",
      w: 60,
      d: 60,
      h: 3.07,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 56.8, d: 56.8 })],
    });
    expect(planTray(low, steep).chamfer).toBe(2.27);
    expect(planTray({ ...spacer, d: 6.14, h: 3.07 }, steep).chamfer).toBe(2.27);
  });
});

describe("scoops", () => {
  it("uses the requested radius when it fits", () => {
    expect(planTray(scoopBulk, GEO).compartments[0]?.scoops).toEqual([{ side: "front", r: 12 }]);
  });

  it("clamps the radius to the compartment depth on a shallow tray", () => {
    const shallow = { ...scoopBulk, h: 8 };
    const scoops = planTray(shallow, GEO).compartments.map((c) => c.scoops[0]?.r);
    expect(scoops).toEqual([6.8, 6.8, 6.8]);
  });
});

describe("validation", () => {
  it("rejects compartments that cut into the outer wall", () => {
    const spec = { ...plainBox, compartments: [compartment({ x: 0.5, y: 1.6, w: 97.9, d: 56.8 })] };
    expect(() => planTray(spec, GEO)).toThrow(RangeError);
    expect(() => planTray({ ...lippedLower, compartments: plainBox.compartments }, GEO)).toThrow(
      /outer wall/,
    );
  });

  it("rejects overlapping or touching compartments", () => {
    const spec = traySpec({
      key: "touch",
      w: 1.6 + 40 + 40 + 1.6,
      d: 40,
      h: 20,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 40, d: 36.8 }),
        compartment({ x: 41.6, y: 1.6, w: 40, d: 36.8 }),
      ],
    });
    expect(() => planTray(spec, GEO)).toThrow(/compartments 0 and 1 overlap or touch/);
  });

  it("accepts a thin divider (printability reports it)", () => {
    const spec = traySpec({
      key: "thin-divider",
      w: 1.6 + 40 + 0.3 + 40 + 1.6,
      d: 40,
      h: 20,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 40, d: 36.8 }),
        compartment({ x: 41.9, y: 1.6, w: 40, d: 36.8 }),
      ],
    });
    expect(planTray(spec, GEO).compartments).toHaveLength(2);
  });

  it("rejects floors outside the tray and non-positive sizes", () => {
    expect(() =>
      planTray(
        {
          ...plainBox,
          compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8, floorZ: 30 })],
        },
        GEO,
      ),
    ).toThrow(/floor/);
    expect(() => planTray({ ...plainBox, w: 0 }, GEO)).toThrow(/positive/);
    expect(() => planTray({ ...plainBox, w: Number.NaN }, GEO)).toThrow(/positive/);
  });

  it("throws UnsupportedFeatureError for unknown feature types, compartment kinds and parts", () => {
    const magnet = { type: "magnet", d: 6 } as unknown as FeatureSpec;
    const spec = {
      ...customBlock,
      compartments: [{ ...compartment({ x: 1.6, y: 1.6, w: 50, d: 52 }), features: [magnet] }],
    };
    expect(() => planTray(spec, GEO)).toThrow(UnsupportedFeatureError);
    expect(() => planTray(spec, GEO)).toThrow(/magnet/);
    const lid = { ...plainBox, part: "lid" } as unknown as TraySpec;
    expect(() => planTray(lid, GEO)).toThrow(UnsupportedFeatureError);
    const hollow = {
      ...customBlock,
      compartments: [{ ...compartment({ x: 1.6, y: 1.6, w: 50, d: 52 }), kind: "hollow" }],
    } as unknown as TraySpec;
    expect(() => planTray(hollow, GEO)).toThrow(/kind:hollow/);
  });
});
```

`src/geometry/plan-corners.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planTray } from "./plan";
import { maxCornerRadius } from "./plan-corners";
import { MIN_FEATURE } from "./plan-types";
import { GEO, compartment, hexTiles, traySpec } from "./test-specs";

describe("corner reliefs", () => {
  it("passes each relief circle through its content corner", () => {
    const plan = planTray(hexTiles, GEO);
    const first = plan.compartments[0];
    expect(first?.reliefs).toHaveLength(4);
    for (const r of first?.reliefs ?? []) {
      const cornerX = r.cx < 20 ? 1.6 : 48.8;
      const cornerY = r.cy < 20 ? 1.6 : 42.6;
      expect(Math.hypot(r.cx - cornerX, r.cy - cornerY)).toBeCloseTo(r.r, 9);
    }
  });

  it("uses the full Ø3 toward outer walls and shrinks reliefs beside a 1.2 mm divider", () => {
    const radii = planTray(hexTiles, GEO).compartments[0]?.reliefs.map((r) =>
      Number(r.r.toFixed(3)),
    );
    // left corners face the 1.6 wall; right corners face the divider:
    // budget (1.2 − 0.8) / 2 = 0.2 mm → r = 0.2 / (1 − 1/√2) = 0.683
    expect(radii).toEqual([1.5, 0.683, 0.683, 1.5]);
  });

  it("drops reliefs when there is no material to spare", () => {
    const spec = traySpec({
      key: "thin",
      w: 1.6 + 20 + 0.9 + 20 + 1.6,
      d: 30,
      h: 20,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 20, d: 26.8, features: [{ type: "cornerRelief", d: 3 }] }),
        compartment({
          x: 22.5,
          y: 1.6,
          w: 20,
          d: 26.8,
          features: [{ type: "cornerRelief", d: 3 }],
        }),
      ],
    });
    const plan = planTray(spec, GEO);
    expect(plan.compartments[0]?.reliefs).toHaveLength(2);
  });
});

describe("outer corner radius", () => {
  it("matches the closed form for a sharp corner at the wall", () => {
    // a = b = wall, m = 0.8 + 0.1 margin: R = 2w − m + √2 (w − m)
    expect(maxCornerRadius(1.2, 1.2, 0)).toBeCloseTo(2 * 1.2 - 0.9 + Math.SQRT2 * 0.3, 9);
  });

  it("keeps a disc that hugs a straight face out of the arc zone", () => {
    expect(maxCornerRadius(0.85, 3, 0)).toBe(3);
    expect(maxCornerRadius(2.2, 2.5, 1.4)).toBe(2.5);
  });

  it("shrinks the radius for 1.2 mm walls so the corner stays ≥ 0.8 mm", () => {
    const thin = traySpec({
      key: "thin-wall",
      wall: 1.2,
      w: 50,
      d: 50,
      h: 20,
      compartments: [compartment({ x: 1.2, y: 1.2, w: 47.6, d: 47.6 })],
    });
    const plan = planTray(thin, GEO);
    expect(plan.cornerRadius).toBeCloseTo(1.924, 3);
    const r = plan.cornerRadius;
    expect(r - Math.hypot(r - 1.2, r - 1.2)).toBeGreaterThanOrEqual(MIN_FEATURE - 1e-9);
  });

  it("never goes below the bottom chamfer", () => {
    const tiny = traySpec({ key: "r0", w: 30, d: 30, h: 10 });
    expect(planTray(tiny, { ...GEO, cornerRadius: 0 }).cornerRadius).toBe(0.4);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/geometry/plan.test.ts src/geometry/plan-corners.test.ts`
Expected: FAIL — `Cannot find module './plan'`.

- [ ] **Step 4: Write the implementation**

> **Note (from plan 2's final review):** do not define `MIN_FEATURE = 0.8` or `UPPER_MIN_CHAMFER = 0.5` in `plan-types.ts`. Import the shared `MIN_FEATURE_MM` and `UPPER_MIN_CHAMFER` from `src/model/settings.ts` (spec §6.1) and use `MIN_FEATURE_MM` wherever this plan writes `MIN_FEATURE` (`plan.ts`, `plan-corners.ts`, `printability.ts` and their tests); `plan.ts` imports `UPPER_MIN_CHAMFER` from there too, not from `./plan-types`. Sizing imports both the same way, so both sides of the TraySpec contract share one value.

`src/geometry/plan-types.ts`:

```ts
import type { Side } from "../model/types";

// Constants and result types of tray planning (plan.ts). A TrayPlan holds
// every number tray.ts needs to build the solid. The minimum feature width
// (MIN_FEATURE_MM) and the upper trays' minimum bottom chamfer (UPPER_MIN_CHAMFER)
// come from ../model/settings (see the note above) and are not defined here.

export const INNER_CORNER_RADIUS = 0.5; // spec §6.1: wells' inner vertical corners ≤ 0.5
export const LIP_CHAMFER = 0.6; // spec §6.1: 0.6 × 45° on the lip's inner top edge
export const MIN_RELIEF_RADIUS = 0.3; // smaller corner reliefs are dropped
export const MIN_SCOOP_RADIUS = 0.5; // smaller scoop fillets are dropped
export const SPEC_TOLERANCE = 0.005; // TraySpec numbers are rounded to 0.01 mm
export const CORNER_MARGIN = 0.1; // the outer arc polygon lies up to 0.08 mm inside the true arc
export const RELIEF_CUT = 1 - Math.SQRT1_2; // wall depth a relief through the corner cuts, per mm of radius

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// U-slot cut down from the top. Footprint x0..x1 × y0..y1; its round bottom
// (radius) is a half-cylinder whose axis runs across the side's wall (along
// Y for front/back, along X for left/right); its lowest line is bottomZ.
export interface SlotPlan extends Rect {
  side: Side;
  bottomZ: number;
  radius: number;
}

export interface ScoopPlan {
  side: Side;
  r: number;
}

// Vertical cylinder from the compartment floor up; its circle passes through
// the content corner.
export interface ReliefPlan {
  cx: number;
  cy: number;
  r: number;
}

export interface CompartmentPlan {
  index: number;
  rect: Rect; // the CompartmentSpec rectangle
  content: Rect; // rect minus finger-pocket reach bands; cut down to floorZ
  floorZ: number;
  slots: SlotPlan[];
  scoops: ScoopPlan[];
  reliefs: ReliefPlan[];
}

export interface LipPlan {
  height: number;
  thickness: number;
  chamfer: number;
}

export interface TrayPlan {
  w: number;
  d: number;
  h: number;
  topZ: number; // h + lip height
  chamfer: number; // outer bottom edge, 45°
  cornerRadius: number; // effective outer vertical corner radius
  outerWall: number; // compartments keep at least this distance to the outer faces
  lip: LipPlan | null;
  compartments: CompartmentPlan[];
}
```

`src/geometry/plan-corners.ts`:

```ts
import type { Side } from "../model/types";
import { CORNER_MARGIN, MIN_FEATURE, MIN_RELIEF_RADIUS, RELIEF_CUT } from "./plan-types";
import type { CompartmentPlan, ReliefPlan } from "./plan-types";

export interface TraySize {
  w: number;
  d: number;
}

// Material on one side of a content rectangle that a corner relief may cut
// into: everything above MIN_FEATURE toward an outer face, half of it toward
// another compartment (which may have reliefs of its own).
export function sideBudget(
  size: TraySize,
  plans: CompartmentPlan[],
  self: CompartmentPlan,
  side: Side,
): number {
  const c = self.content;
  const toFace = { front: c.y0, back: size.d - c.y1, left: c.x0, right: size.w - c.x1 }[side];
  let budget = toFace - MIN_FEATURE;
  for (const other of plans) {
    if (other === self) {
      continue;
    }
    const o = other.rect;
    const overlapsX = o.x0 < c.x1 && o.x1 > c.x0;
    const overlapsY = o.y0 < c.y1 && o.y1 > c.y0;
    let gap = Number.POSITIVE_INFINITY;
    if (side === "front" && overlapsX && o.y1 <= c.y0) {
      gap = c.y0 - o.y1;
    } else if (side === "back" && overlapsX && o.y0 >= c.y1) {
      gap = o.y0 - c.y1;
    } else if (side === "left" && overlapsY && o.x1 <= c.x0) {
      gap = c.x0 - o.x1;
    } else if (side === "right" && overlapsY && o.x0 >= c.x1) {
      gap = o.x0 - c.x1;
    }
    budget = Math.min(budget, (gap - MIN_FEATURE) / 2);
  }
  return budget;
}

// Ø`diameter` reliefs at the four content corners. Each circle passes
// through its corner and is centred on the corner's diagonal, so it cuts
// r·(1 − 1/√2) into both adjoining walls; r shrinks to fit the side budgets
// and reliefs below MIN_RELIEF_RADIUS are dropped.
export function planReliefs(
  size: TraySize,
  plans: CompartmentPlan[],
  self: CompartmentPlan,
  diameter: number,
): ReliefPlan[] {
  if (!(diameter > 0)) {
    return [];
  }
  const budget: Record<Side, number> = {
    front: sideBudget(size, plans, self, "front"),
    back: sideBudget(size, plans, self, "back"),
    left: sideBudget(size, plans, self, "left"),
    right: sideBudget(size, plans, self, "right"),
  };
  const c = self.content;
  const maxR = Math.min(diameter / 2, (c.x1 - c.x0) / 2, (c.y1 - c.y0) / 2);
  const corners: [number, number, number, number, Side, Side][] = [
    [c.x0, c.y0, 1, 1, "left", "front"],
    [c.x1, c.y0, -1, 1, "right", "front"],
    [c.x1, c.y1, -1, -1, "right", "back"],
    [c.x0, c.y1, 1, -1, "left", "back"],
  ];
  const reliefs: ReliefPlan[] = [];
  for (const [x, y, sx, sy, sideX, sideY] of corners) {
    const r = Math.min(maxR, budget[sideX] / RELIEF_CUT, budget[sideY] / RELIEF_CUT);
    if (r >= MIN_RELIEF_RADIUS) {
      const inset = r * Math.SQRT1_2;
      reliefs.push({ cx: x + sx * inset, cy: y + sy * inset, r });
    }
  }
  return reliefs;
}

// Largest outer corner radius that keeps MIN_FEATURE + CORNER_MARGIN between
// the rounded outer corner and a cut disc whose centre is p and q from the
// corner's two outer faces (radius rho; 0 for a sharp cut corner). Solves
// R − hypot(R − p, R − q) = m, m = MIN_FEATURE + CORNER_MARGIN + rho, i.e.
// R² − 2(p + q − m)R + p² + q² − m² = 0, for the larger root.
export function maxCornerRadius(p: number, q: number, rho: number): number {
  const m = MIN_FEATURE + CORNER_MARGIN + rho;
  if (p < m || q < m) {
    // Too close to a straight face for any arc: keep the disc out of the arc
    // zone (it is in the zone only while p < R and q < R).
    return Math.max(p, q);
  }
  return p + q - m + Math.sqrt(2 * (p - m) * (q - m));
}

// Effective outer corner radius: the setting, reduced so no compartment
// corner, slot corner or relief comes closer than MIN_FEATURE to a rounded
// outer corner, never below the bottom chamfer (a 45° chamfer under a corner
// tighter than the chamfer would overhang).
export function planCornerRadius(
  size: TraySize,
  setting: number,
  chamfer: number,
  compartments: CompartmentPlan[],
): number {
  let r = Math.max(0, Math.min(setting, Math.min(size.w, size.d) / 2 - 0.01));
  const discs: [number, number, number][] = [];
  for (const c of compartments) {
    for (const rect of [c.rect, ...c.slots]) {
      discs.push(
        [rect.x0, rect.y0, 0],
        [rect.x1, rect.y0, 0],
        [rect.x1, rect.y1, 0],
        [rect.x0, rect.y1, 0],
      );
    }
    for (const relief of c.reliefs) {
      discs.push([relief.cx, relief.cy, relief.r]);
    }
  }
  for (const [x, y, rho] of discs) {
    const p = Math.min(x, size.w - x);
    const q = Math.min(y, size.d - y);
    if (p < r && q < r) {
      r = Math.min(r, maxCornerRadius(p, q, rho));
    }
  }
  return Math.max(r, chamfer);
}
```

`src/geometry/plan.ts`:

```ts
import type { CompartmentSpec, Settings, Side, TraySpec } from "../model/types";
import { UnsupportedFeatureError } from "./errors";
import { planCornerRadius, planReliefs } from "./plan-corners";
import {
  LIP_CHAMFER,
  MIN_FEATURE,
  MIN_SCOOP_RADIUS,
  SPEC_TOLERANCE as TOL,
  UPPER_MIN_CHAMFER,
} from "./plan-types";
import type { CompartmentPlan, LipPlan, Rect, ScoopPlan, SlotPlan, TrayPlan } from "./plan-types";
import { KNOWN_COMPARTMENT_KINDS, KNOWN_FEATURE_TYPES, KNOWN_PARTS } from "./types";

// Pure geometry planning: validates a TraySpec and turns it into exact
// numbers (chamfer, corner radius, lip, per-compartment cut regions).
// tray.ts only turns a TrayPlan into solids, so every rule lives here and is
// tested without WASM.

const SIDES: readonly Side[] = ["front", "back", "left", "right"];

function fail(spec: TraySpec, message: string): never {
  throw new RangeError(`Tray ${spec.key}: ${message}`);
}

function isPositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function bottomChamfer(spec: TraySpec, settings: Settings): number {
  const base = Math.max(0, settings.bottomChamfer);
  if (spec.part === "spacer" || spec.level === 0) {
    return base;
  }
  return Math.max(base, UPPER_MIN_CHAMFER);
}

function planLip(spec: TraySpec, settings: Settings): LipPlan | null {
  if (!spec.lip) {
    return null;
  }
  const { height, thickness } = settings.lip;
  if (!Number.isFinite(thickness) || !(thickness >= MIN_FEATURE - TOL)) {
    fail(spec, `lip thickness ${thickness} mm is below ${MIN_FEATURE} mm`);
  }
  const chamfer = Math.min(LIP_CHAMFER, thickness / 2);
  if (!Number.isFinite(height) || !(height > chamfer)) {
    fail(spec, `lip height ${height} mm must exceed its ${chamfer} mm chamfer`);
  }
  return { height, thickness, chamfer };
}

function isKnown(known: readonly string[], value: unknown): boolean {
  return typeof value === "string" && known.includes(value);
}

// Values from a newer-minor file that this version can't build (spec §9).
function checkKnown(spec: TraySpec): void {
  if (!isKnown(KNOWN_PARTS, spec.part)) {
    throw new UnsupportedFeatureError(`part:${String(spec.part)}`);
  }
  for (const c of spec.compartments) {
    if (!isKnown(KNOWN_COMPARTMENT_KINDS, c.kind)) {
      throw new UnsupportedFeatureError(`kind:${String(c.kind)}`);
    }
    for (const f of c.features) {
      if (!isKnown(KNOWN_FEATURE_TYPES, f.type)) {
        throw new UnsupportedFeatureError(String((f as { type: unknown }).type));
      }
    }
  }
}

function sideOf(spec: TraySpec, side: unknown): Side {
  if (typeof side === "string" && (SIDES as readonly string[]).includes(side)) {
    return side as Side;
  }
  return fail(spec, `unknown side "${String(side)}"`);
}

function checkRect(spec: TraySpec, index: number, c: CompartmentSpec, outerWall: number): Rect {
  if (![c.x, c.y].every(Number.isFinite) || !isPositive(c.w) || !isPositive(c.d)) {
    fail(spec, `compartment ${index} has an invalid size or position`);
  }
  if (!(c.floorZ > 0) || !(c.floorZ < spec.h)) {
    fail(spec, `compartment ${index} floor ${c.floorZ} mm is outside 0…${spec.h} mm`);
  }
  const rect: Rect = { x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.d };
  if (
    rect.x0 < outerWall - TOL ||
    rect.y0 < outerWall - TOL ||
    rect.x1 > spec.w - outerWall + TOL ||
    rect.y1 > spec.d - outerWall + TOL
  ) {
    fail(spec, `compartment ${index} cuts into the ${outerWall} mm outer wall`);
  }
  return rect;
}

function checkSeparated(spec: TraySpec, rects: Rect[]): void {
  rects.forEach((a, i) => {
    rects.forEach((b, j) => {
      if (j <= i) {
        return;
      }
      const gapX = Math.max(b.x0 - a.x1, a.x0 - b.x1);
      const gapY = Math.max(b.y0 - a.y1, a.y0 - b.y1);
      if (gapX < 2 * TOL && gapY < 2 * TOL) {
        fail(spec, `compartments ${i} and ${j} overlap or touch`);
      }
    });
  });
}

interface Pocket {
  side: Side;
  at: number;
  width: number;
  reach: number;
  depth: number;
}

// Finger pocket (spec §6.1), as geometry reads FeatureSpec "fingerPocket":
// - the compartment rectangle includes a band `reach` deep along `side`;
//   the band stays solid up to the rim except for the slot;
// - the slot is `width` wide, centred on `at` (tray-local x for front/back,
//   y for left/right), runs across the band, and is cut down `depth` below
//   the rim (never below the compartment floor) with a round bottom;
// - along the side it may extend past the compartment through dividers,
//   but never into the outer wall (RangeError).
function planSlot(
  spec: TraySpec,
  p: Pocket,
  rect: Rect,
  content: Rect,
  floorZ: number,
  outerWall: number,
): SlotPlan {
  const half = p.width / 2;
  const lo = p.at - half;
  const hi = p.at + half;
  const alongX = p.side === "front" || p.side === "back";
  const limit = alongX ? spec.w : spec.d;
  if (lo < outerWall - TOL || hi > limit - outerWall + TOL) {
    fail(spec, `a finger pocket at ${p.at} mm would cut through the outer wall`);
  }
  const overlap = Math.min(0.5, (alongX ? content.y1 - content.y0 : content.x1 - content.x0) / 2);
  const bottomZ = spec.h - Math.min(p.depth, spec.h - floorZ);
  const common = { side: p.side, bottomZ, radius: half };
  switch (p.side) {
    case "front":
      return { ...common, x0: lo, x1: hi, y0: rect.y0, y1: content.y0 + overlap };
    case "back":
      return { ...common, x0: lo, x1: hi, y0: content.y1 - overlap, y1: rect.y1 };
    case "left":
      return { ...common, x0: rect.x0, x1: content.x0 + overlap, y0: lo, y1: hi };
    case "right":
      return { ...common, x0: content.x1 - overlap, x1: rect.x1, y0: lo, y1: hi };
  }
}

function planCompartment(
  spec: TraySpec,
  index: number,
  c: CompartmentSpec,
  rect: Rect,
  outerWall: number,
): { plan: CompartmentPlan; reliefDiameter: number } {
  const pockets: Pocket[] = [];
  const scoopRequests: ScoopPlan[] = [];
  let reliefDiameter = 0;
  for (const feature of c.features) {
    if (feature.type === "fingerPocket") {
      if (
        ![feature.width, feature.reach, feature.depth].every(isPositive) ||
        !Number.isFinite(feature.at)
      ) {
        fail(spec, `compartment ${index} has an invalid finger pocket`);
      }
      pockets.push({ ...feature, side: sideOf(spec, feature.side) });
    } else if (feature.type === "scoop") {
      scoopRequests.push({ side: sideOf(spec, feature.side), r: feature.r });
    } else {
      reliefDiameter = Math.max(reliefDiameter, feature.d);
    }
  }

  const band = (side: Side): number =>
    Math.max(0, ...pockets.filter((p) => p.side === side).map((p) => p.reach));
  const content: Rect = {
    x0: rect.x0 + band("left"),
    y0: rect.y0 + band("front"),
    x1: rect.x1 - band("right"),
    y1: rect.y1 - band("back"),
  };
  // TOL: TraySpec numbers are on the 0.01 mm grid, but their differences carry float noise
  // (8.29 − 7.29 = 0.9999999999999991), so a value exactly on a limit must pass.
  if (content.x1 - content.x0 < 1 - TOL || content.y1 - content.y0 < 1 - TOL) {
    fail(spec, `compartment ${index}: finger-pocket reach leaves no room for the contents`);
  }

  const slots = pockets.map((p) => planSlot(spec, p, rect, content, c.floorZ, outerWall));
  // Scoop radius: never deeper than the compartment or wider than it is across.
  const scoops: ScoopPlan[] = [];
  for (const s of scoopRequests) {
    const across =
      s.side === "front" || s.side === "back" ? content.y1 - content.y0 : content.x1 - content.x0;
    const r = Math.min(s.r, spec.h - c.floorZ, across);
    if (r >= MIN_SCOOP_RADIUS) {
      scoops.push({ side: s.side, r });
    }
  }
  return {
    plan: { index, rect, content, floorZ: c.floorZ, slots, scoops, reliefs: [] },
    reliefDiameter,
  };
}

// Validates `spec` and computes everything buildTray needs.
// Throws UnsupportedFeatureError for an unknown part, compartment kind or
// feature type (a newer-minor file) and RangeError for a spec that can't be built safely:
// non-positive sizes, a floor outside the tray, compartments that overlap,
// touch, or come closer to an outer face than the (lipped) outer wall, and
// finger pockets that would cut through an outer wall.
export function planTray(spec: TraySpec, settings: Settings): TrayPlan {
  checkKnown(spec);
  if (![spec.w, spec.d, spec.h].every(isPositive)) {
    fail(spec, "outer size must be positive");
  }
  const chamfer = bottomChamfer(spec, settings);
  // With TOL, like every limit here: 2.27 + 0.8 = 3.0700000000000003 must accept h = 3.07.
  if (
    Math.min(spec.w, spec.d) < 2 * (chamfer + MIN_FEATURE) - TOL ||
    spec.h < chamfer + MIN_FEATURE - TOL
  ) {
    fail(spec, `outer size ${spec.w} × ${spec.d} × ${spec.h} mm is too small`);
  }
  const lip = planLip(spec, settings);
  const solid = spec.solid || spec.part === "spacer";
  if (!solid && !(spec.wall >= MIN_FEATURE - TOL)) {
    fail(spec, `wall ${spec.wall} mm is below ${MIN_FEATURE} mm`);
  }
  const outerWall = lip ? Math.max(spec.wall, lip.thickness + settings.lip.ledge) : spec.wall;

  const specs = solid ? [] : spec.compartments;
  const rects = specs.map((c, i) => checkRect(spec, i, c, outerWall));
  checkSeparated(spec, rects);
  const planned = specs.map((c, i) =>
    planCompartment(spec, i, c, rects[i] ?? fail(spec, "internal: missing rect"), outerWall),
  );
  const plans = planned.map((p) => p.plan);
  const compartments = planned.map(({ plan, reliefDiameter }) => ({
    ...plan,
    reliefs: planReliefs(spec, plans, plan, reliefDiameter),
  }));

  return {
    w: spec.w,
    d: spec.d,
    h: spec.h,
    topZ: spec.h + (lip ? lip.height : 0),
    chamfer,
    cornerRadius: planCornerRadius(spec, settings.cornerRadius, chamfer, compartments),
    outerWall,
    lip,
    compartments,
  };
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/geometry/plan.test.ts src/geometry/plan-corners.test.ts && npx tsc --noEmit`
Expected: PASS (23 tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/plan-types.ts src/geometry/plan-corners.ts src/geometry/plan.ts src/geometry/test-specs.ts src/geometry/plan.test.ts src/geometry/plan-corners.test.ts
git commit -m "Add tray geometry planning and validation"
```

---

### Task 4: Mesh printability check

**Files:**

- Create: `apps/insert-generator/src/geometry/triangles.ts`
- Create: `apps/insert-generator/src/geometry/bvh.ts`
- Create: `apps/insert-generator/src/geometry/printability.ts`
- Create: `apps/insert-generator/src/geometry/test-mesh.ts` (test helpers: topology, bounds, signed volume, cube mesh)
- Test: `apps/insert-generator/src/geometry/printability.test.ts`

**Interfaces:**

- Consumes: `Mesh`, `PrintabilityReport` (Task 1); `MIN_FEATURE` (Task 3).
- Produces:
  - `src/geometry/triangles.ts`: `type Point = [number, number, number]`, `interface Triangles { count; normals: Float64Array; centroids: Float64Array; areas: Float64Array; minZ: Float64Array; maxZ: Float64Array }`, `vertex(mesh: Mesh, index: number): Point`, `corners(mesh: Mesh, tri: number): [Point, Point, Point]`, `triangles(mesh: Mesh): Triangles`.
  - `src/geometry/bvh.ts`: `interface Bvh`, `buildBvh(mesh: Mesh, centroids: Float64Array): Bvh`, `nearestHit(bvh: Bvh, origin: number[], dir: number[], accept: (tri: number) => boolean): number` (`Infinity` when nothing is hit).
  - `src/geometry/printability.ts`: `OVERHANG_NZ = -0.71`, `checkPrintability(mesh: Mesh): PrintabilityReport`.
  - `src/geometry/test-mesh.ts`: `interface Topology { closed: boolean; genus: number; vertices: number; triangles: number }`, `topology(mesh: Mesh): Topology`, `bounds(mesh: Mesh): { min: [number, number, number]; max: [number, number, number] }`, `signedVolume(mesh: Mesh): number`, `cubeMesh(s?: number): Mesh`.

- [ ] **Step 1: Write the test helpers**

`src/geometry/test-mesh.ts` (used by this and later tasks' tests):

```ts
// Test helpers: mesh topology and bounds.
import type { Mesh } from "./types";

export interface Topology {
  closed: boolean; // every directed edge has exactly one opposite edge
  genus: number;
  vertices: number;
  triangles: number;
}

export function topology(mesh: Mesh): Topology {
  const edges = new Map<string, number>();
  const tris = mesh.indices.length / 3;
  for (let t = 0; t < tris; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = mesh.indices[t * 3 + k] ?? 0;
      const b = mesh.indices[t * 3 + ((k + 1) % 3)] ?? 0;
      const key = `${a},${b}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let closed = true;
  for (const [key, count] of edges) {
    const [a, b] = key.split(",");
    if (count !== 1 || edges.get(`${b},${a}`) !== 1) {
      closed = false;
    }
  }
  const vertices = mesh.positions.length / 3;
  const euler = vertices - edges.size / 2 + tris;
  return { closed, genus: (2 - euler) / 2, vertices, triangles: tris };
}

export function bounds(mesh: Mesh): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const v = mesh.positions[i + k] ?? 0;
      min[k] = Math.min(min[k] ?? Infinity, v);
      max[k] = Math.max(max[k] ?? -Infinity, v);
    }
  }
  return { min, max };
}

// Signed volume (positive for outward CCW winding).
export function signedVolume(mesh: Mesh): number {
  const p = mesh.positions;
  const ix = mesh.indices;
  let sum = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = (ix[t] ?? 0) * 3;
    const b = (ix[t + 1] ?? 0) * 3;
    const c = (ix[t + 2] ?? 0) * 3;
    const ax = p[a] ?? 0;
    const ay = p[a + 1] ?? 0;
    const az = p[a + 2] ?? 0;
    const bx = p[b] ?? 0;
    const by = p[b + 1] ?? 0;
    const bz = p[b + 2] ?? 0;
    const cx = p[c] ?? 0;
    const cy = p[c + 1] ?? 0;
    const cz = p[c + 2] ?? 0;
    sum += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return sum / 6;
}

// Cube 0..s mesh (8 vertices, 12 triangles, CCW outward) for export tests.
export function cubeMesh(s = 10): Mesh {
  const positions = new Float32Array([
    0,
    0,
    0,
    s,
    0,
    0,
    s,
    s,
    0,
    0,
    s,
    0,
    0,
    0,
    s,
    s,
    0,
    s,
    s,
    s,
    s,
    0,
    s,
    s,
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0,
    4, 3, 4, 7,
  ]);
  return { positions, indices };
}
```

- [ ] **Step 2: Write the failing test**

`src/geometry/printability.test.ts` — the 45° edge case is pinned explicitly: a frustum whose sides drop 2 mm over 2 mm (`normal.z = −0.7071`) passes, 2.2 mm over 2 mm (47.7° from vertical) fails:

```ts
import { describe, expect, it } from "vitest";
import { checkPrintability } from "./printability";
import { cubeMesh } from "./test-mesh";
import type { Mesh } from "./types";

function translate(mesh: Mesh, dz: number): Mesh {
  const positions = mesh.positions.slice();
  for (let i = 2; i < positions.length; i += 3) {
    positions[i] = (positions[i] ?? 0) + dz;
  }
  return { positions, indices: mesh.indices };
}

// Square frustum 0..10 at the top (z = h), inset `inset` at the bottom
// (z = 0): its sides face down at atan(inset / h) from vertical.
function frustum(inset: number, h: number, z0 = 0): Mesh {
  const a = inset;
  const b = 10 - inset;
  const positions = new Float32Array([
    a,
    a,
    z0,
    b,
    a,
    z0,
    b,
    b,
    z0,
    a,
    b,
    z0,
    0,
    0,
    z0 + h,
    10,
    0,
    z0 + h,
    10,
    10,
    z0 + h,
    0,
    10,
    z0 + h,
  ]);
  return { positions, indices: cubeMesh().indices };
}

describe("checkPrintability", () => {
  it("accepts a cube on the bed and measures its thickness", () => {
    const report = checkPrintability(cubeMesh(10));
    expect(report).toEqual({ ok: true, overhangTriangles: 0, minFeatureMm: 10, problems: [] });
  });

  it("flags a down-facing face above the bed", () => {
    const report = checkPrintability(translate(cubeMesh(10), 5));
    expect(report.overhangTriangles).toBe(2);
    expect(report.ok).toBe(false);
    expect(report.problems[0]).toMatch(/2 triangles overhang/);
  });

  it("accepts exactly 45° (normal.z = −0.7071 > −0.71)", () => {
    expect(checkPrintability(frustum(2, 2)).overhangTriangles).toBe(0);
  });

  it("rejects faces overhanging more than 45°", () => {
    // inset 2.2 over 2 mm height: 47.7° from vertical
    expect(checkPrintability(frustum(2.2, 2)).overhangTriangles).toBe(8);
  });

  it("reports features thinner than 0.8 mm", () => {
    const report = checkPrintability(cubeMesh(0.5));
    expect(report.minFeatureMm).toBeCloseTo(0.5, 5);
    expect(report.ok).toBe(false);
    expect(report.problems).toEqual(["thinnest feature is 0.50 mm (minimum 0.8 mm)"]);
  });

  it("ignores degenerate triangles", () => {
    const cube = cubeMesh(10);
    const indices = new Uint32Array([...cube.indices, 0, 1, 1]);
    expect(checkPrintability({ positions: cube.positions, indices }).ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/geometry/printability.test.ts`
Expected: FAIL — `Cannot find module './printability'`.

- [ ] **Step 4: Write the implementation**

`src/geometry/triangles.ts`:

```ts
import type { Mesh } from "./types";

// Per-triangle data in float64: unit normal, centroid, area, bounds.
export interface Triangles {
  count: number;
  normals: Float64Array; // 3 per triangle (0,0,0 when degenerate)
  centroids: Float64Array; // 3 per triangle
  areas: Float64Array;
  minZ: Float64Array;
  maxZ: Float64Array;
}

export type Point = [number, number, number];

export function vertex(mesh: Mesh, index: number): Point {
  const p = mesh.positions;
  return [p[index * 3] ?? 0, p[index * 3 + 1] ?? 0, p[index * 3 + 2] ?? 0];
}

export function corners(mesh: Mesh, tri: number): [Point, Point, Point] {
  const ix = mesh.indices;
  return [
    vertex(mesh, ix[tri * 3] ?? 0),
    vertex(mesh, ix[tri * 3 + 1] ?? 0),
    vertex(mesh, ix[tri * 3 + 2] ?? 0),
  ];
}

export function triangles(mesh: Mesh): Triangles {
  const count = Math.floor(mesh.indices.length / 3);
  const normals = new Float64Array(count * 3);
  const centroids = new Float64Array(count * 3);
  const areas = new Float64Array(count);
  const minZ = new Float64Array(count);
  const maxZ = new Float64Array(count);
  for (let t = 0; t < count; t += 1) {
    const [a, b, c] = corners(mesh, t);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    areas[t] = len / 2;
    if (len > 0) {
      normals[t * 3] = nx / len;
      normals[t * 3 + 1] = ny / len;
      normals[t * 3 + 2] = nz / len;
    }
    centroids[t * 3] = (a[0] + b[0] + c[0]) / 3;
    centroids[t * 3 + 1] = (a[1] + b[1] + c[1]) / 3;
    centroids[t * 3 + 2] = (a[2] + b[2] + c[2]) / 3;
    minZ[t] = Math.min(a[2], b[2], c[2]);
    maxZ[t] = Math.max(a[2], b[2], c[2]);
  }
  return { count, normals, centroids, areas, minZ, maxZ };
}
```

`src/geometry/bvh.ts`:

```ts
import type { Mesh } from "./types";
import { corners } from "./triangles";

// Small bounding-volume hierarchy for nearest-hit ray queries on a mesh.

interface Node {
  min: [number, number, number];
  max: [number, number, number];
  left: Node | null;
  right: Node | null;
  tris: number[]; // leaf triangles (empty for inner nodes)
}

export interface Bvh {
  mesh: Mesh;
  root: Node | null;
}

const LEAF_SIZE = 8;

function bounds(mesh: Mesh, tris: number[]): Pick<Node, "min" | "max"> {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) {
    for (const p of corners(mesh, t)) {
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k] ?? Infinity, p[k] ?? 0);
        max[k] = Math.max(max[k] ?? -Infinity, p[k] ?? 0);
      }
    }
  }
  return { min, max };
}

function build(mesh: Mesh, tris: number[], centroids: Float64Array): Node {
  const { min, max } = bounds(mesh, tris);
  if (tris.length <= LEAF_SIZE) {
    return { min, max, left: null, right: null, tris };
  }
  const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const axis = extent.indexOf(Math.max(...extent));
  const sorted = [...tris].sort(
    (a, b) => (centroids[a * 3 + axis] ?? 0) - (centroids[b * 3 + axis] ?? 0),
  );
  const mid = sorted.length >> 1;
  return {
    min,
    max,
    left: build(mesh, sorted.slice(0, mid), centroids),
    right: build(mesh, sorted.slice(mid), centroids),
    tris: [],
  };
}

export function buildBvh(mesh: Mesh, centroids: Float64Array): Bvh {
  const count = Math.floor(mesh.indices.length / 3);
  const all = Array.from({ length: count }, (_, i) => i);
  return { mesh, root: count === 0 ? null : build(mesh, all, centroids) };
}

// Distance along the ray to the box, or Infinity if missed.
function hitBox(node: Node, o: number[], inv: number[], best: number): number {
  let tmin = 0;
  let tmax = best;
  for (let k = 0; k < 3; k += 1) {
    const ok = o[k] ?? 0;
    const ik = inv[k] ?? 0;
    const lo = node.min[k] ?? 0;
    const hi = node.max[k] ?? 0;
    if (!Number.isFinite(ik)) {
      if (ok < lo || ok > hi) {
        return Infinity;
      }
      continue;
    }
    let t0 = (lo - ok) * ik;
    let t1 = (hi - ok) * ik;
    if (t0 > t1) {
      [t0, t1] = [t1, t0];
    }
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmin > tmax) {
      return Infinity;
    }
  }
  return tmin;
}

// Möller–Trumbore; returns t > 0 or Infinity.
function hitTriangle(mesh: Mesh, tri: number, o: number[], dir: number[]): number {
  const [a, b, c] = corners(mesh, tri);
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const d0 = dir[0] ?? 0;
  const d1 = dir[1] ?? 0;
  const d2 = dir[2] ?? 0;
  const px = d1 * (e2[2] ?? 0) - d2 * (e2[1] ?? 0);
  const py = d2 * (e2[0] ?? 0) - d0 * (e2[2] ?? 0);
  const pz = d0 * (e2[1] ?? 0) - d1 * (e2[0] ?? 0);
  const det = (e1[0] ?? 0) * px + (e1[1] ?? 0) * py + (e1[2] ?? 0) * pz;
  if (Math.abs(det) < 1e-12) {
    return Infinity;
  }
  const inv = 1 / det;
  const sx = (o[0] ?? 0) - a[0];
  const sy = (o[1] ?? 0) - a[1];
  const sz = (o[2] ?? 0) - a[2];
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < -1e-9 || u > 1 + 1e-9) {
    return Infinity;
  }
  const qx = sy * (e1[2] ?? 0) - sz * (e1[1] ?? 0);
  const qy = sz * (e1[0] ?? 0) - sx * (e1[2] ?? 0);
  const qz = sx * (e1[1] ?? 0) - sy * (e1[0] ?? 0);
  const v = (d0 * qx + d1 * qy + d2 * qz) * inv;
  if (v < -1e-9 || u + v > 1 + 1e-9) {
    return Infinity;
  }
  const t = ((e2[0] ?? 0) * qx + (e2[1] ?? 0) * qy + (e2[2] ?? 0) * qz) * inv;
  return t > 1e-6 ? t : Infinity;
}

// Nearest t > 0 along origin + t·dir over triangles accepted by `accept`.
export function nearestHit(
  bvh: Bvh,
  origin: number[],
  dir: number[],
  accept: (tri: number) => boolean,
): number {
  if (bvh.root === null) {
    return Infinity;
  }
  const inv = dir.map((v) => 1 / v);
  let best = Infinity;
  const stack: Node[] = [bvh.root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || hitBox(node, origin, inv, best) === Infinity) {
      continue;
    }
    if (node.left !== null && node.right !== null) {
      stack.push(node.left, node.right);
      continue;
    }
    for (const tri of node.tris) {
      if (accept(tri)) {
        best = Math.min(best, hitTriangle(bvh.mesh, tri, origin, dir));
      }
    }
  }
  return best;
}
```

`src/geometry/printability.ts`:

```ts
import type { Mesh, PrintabilityReport } from "./types";
import { MIN_FEATURE } from "./plan-types";
import { buildBvh, nearestHit } from "./bvh";
import { triangles } from "./triangles";

export const OVERHANG_NZ = -0.71; // a 45° face has normal.z = −0.7071, which passes
const BED_Z = 1e-3; // triangles entirely below this lie on the bed
const MIN_AREA = 1e-4; // mm²; ignore slivers whose float32 normals are noise
const VERTICAL = 0.02; // |normal.z| below this: a wall face
const HORIZONTAL = 0.98; // |normal.z| above this: a floor, top or bottom face

// Rule 6 + minimum feature check on a finished mesh.
// - Overhangs: triangles facing down more steeply than 45° (normal.z < −0.71)
//   that are not on the bed (z = 0).
// - Minimum feature: from the centroid of every wall face a horizontal ray
//   goes into the material and stops at the nearest wall face it leaves
//   through; from every horizontal face a vertical ray stops at the nearest
//   opposite horizontal face. The shortest such distance is the thinnest
//   wall, divider, lip or floor. Sloped faces (chamfers, scoop fillets, slot
//   bottoms) are not sampled, so sloped tops of walls are not reported as thin.
export function checkPrintability(mesh: Mesh): PrintabilityReport {
  const tri = triangles(mesh);
  const nz = (t: number): number => tri.normals[t * 3 + 2] ?? 0;
  let overhangTriangles = 0;
  for (let t = 0; t < tri.count; t += 1) {
    if ((tri.areas[t] ?? 0) >= MIN_AREA && nz(t) < OVERHANG_NZ && (tri.maxZ[t] ?? 0) > BED_Z) {
      overhangTriangles += 1;
    }
  }

  const bvh = buildBvh(mesh, tri.centroids);
  let minFeatureMm = Infinity;
  for (let t = 0; t < tri.count; t += 1) {
    if ((tri.areas[t] ?? 0) < MIN_AREA) {
      continue;
    }
    const n = [tri.normals[t * 3] ?? 0, tri.normals[t * 3 + 1] ?? 0, nz(t)];
    const origin = [
      tri.centroids[t * 3] ?? 0,
      tri.centroids[t * 3 + 1] ?? 0,
      tri.centroids[t * 3 + 2] ?? 0,
    ];
    let dir: number[];
    let accept: (other: number) => boolean;
    if (Math.abs(nz(t)) < VERTICAL) {
      const len = Math.hypot(n[0] ?? 0, n[1] ?? 0);
      dir = [-(n[0] ?? 0) / len, -(n[1] ?? 0) / len, 0];
      accept = (o) =>
        o !== t &&
        (tri.areas[o] ?? 0) >= MIN_AREA &&
        Math.abs(nz(o)) < VERTICAL &&
        (tri.normals[o * 3] ?? 0) * (dir[0] ?? 0) + (tri.normals[o * 3 + 1] ?? 0) * (dir[1] ?? 0) >
          0.5;
    } else if (Math.abs(nz(t)) > HORIZONTAL) {
      const down = nz(t) > 0 ? -1 : 1;
      dir = [0, 0, down];
      accept = (o) => o !== t && (tri.areas[o] ?? 0) >= MIN_AREA && nz(o) * down > HORIZONTAL;
    } else {
      continue;
    }
    minFeatureMm = Math.min(minFeatureMm, nearestHit(bvh, origin, dir, accept));
  }

  const problems: string[] = [];
  if (overhangTriangles > 0) {
    problems.push(`${overhangTriangles} triangles overhang more than 45° above the bed`);
  }
  if (minFeatureMm < MIN_FEATURE - 1e-3) {
    problems.push(`thinnest feature is ${minFeatureMm.toFixed(2)} mm (minimum ${MIN_FEATURE} mm)`);
  }
  return { ok: problems.length === 0, overhangTriangles, minFeatureMm, problems };
}
```

- [ ] **Step 5: Run the test and the type check**

Run: `npx vitest run src/geometry/printability.test.ts && npx tsc --noEmit`
Expected: PASS (6 tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/triangles.ts src/geometry/bvh.ts src/geometry/printability.ts src/geometry/test-mesh.ts src/geometry/printability.test.ts
git commit -m "Add mesh printability check"
```

---

### Task 5: Build tray meshes with manifold

**Files:**

- Create: `apps/insert-generator/src/geometry/tray.ts`
- Create: `apps/insert-generator/src/geometry/index.ts`
- Test: `apps/insert-generator/src/geometry/tray.test.ts`

**Interfaces:**

- Consumes: `planTray`, `TrayPlan`, `CompartmentPlan`, `LipPlan`, `Rect`, `ScoopPlan`, `SlotPlan`, `INNER_CORNER_RADIUS` (Task 3); `withScope`, `Scope` (Task 1); shape helpers (Task 2); `loadManifold` (Task 2); `checkPrintability` (Task 4); fixtures and mesh helpers (Tasks 3, 4).
- Produces:
  - `src/geometry/tray.ts`: `buildTray(m: ManifoldToplevel, spec: TraySpec, settings: Settings): { mesh: Mesh; volumeMm3: number }` — roadmap §4.3 signature. Throws `RangeError` / `UnsupportedFeatureError` from `planTray`, `Error("Tray <key>: geometry kernel failed (<status>)")` if `status()` is not `"NoError"`.
  - `src/geometry/index.ts`: re-exports `loadManifold`, `buildTray`, `checkPrintability`, `UnsupportedFeatureError`, `GEOMETRY_VERSION` and the types `GeometryRequest`, `GeometryResponse`, `Mesh`, `PrintabilityReport` (roadmap §4.3).

Expected volumes use true circles: block `A·h − (P·c²/2 − π·c³/3)` with `A = w·d − (4 − π)R²`, `P = 2(w + d) − (8 − 2π)R`; a well `(w·d − (4 − π)·0.5²)·depth`. The meshes use polygons (6 segments per quarter for R = 3), so the tolerance is 0.2 % (0.3 % with scoop fillets).

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import type { TraySpec } from "../model/types";
import { loadManifold } from "./load";
import { buildTray } from "./tray";
import { checkPrintability } from "./printability";
import { UnsupportedFeatureError } from "./errors";
import { bounds, signedVolume, topology } from "./test-mesh";
import {
  GEO,
  cardUpright,
  compartment,
  customBlock,
  flatCards,
  hexTiles,
  lippedLower,
  miniPockets,
  plainBox,
  scoopBulk,
  solidLeftover,
  spacer,
  spareLeftover,
  traySpec,
  upperLevel1,
} from "./test-specs";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

// Rounded-rectangle prism with a 45° bottom chamfer c (true circles):
// area A = w·d − (4 − π)R², perimeter P = 2(w + d) − (8 − 2π)R,
// chamfer removes P·c²/2 − π·c³/3.
function blockVolume(w: number, d: number, h: number, r: number, c: number): number {
  const area = w * d - (4 - Math.PI) * r * r;
  const perimeter = 2 * (w + d) - (8 - 2 * Math.PI) * r;
  return area * h - ((perimeter * c * c) / 2 - (Math.PI * c * c * c) / 3);
}

function wellVolume(w: number, d: number, depth: number): number {
  return (w * d - (4 - Math.PI) * 0.25) * depth;
}

function expectWellFormed(spec: TraySpec, topZ = spec.h) {
  const { mesh, volumeMm3 } = buildTray(m, spec, GEO);
  const topo = topology(mesh);
  expect(topo.closed).toBe(true);
  expect(topo.genus).toBe(0);
  const b = bounds(mesh);
  expect(b.min[0]).toBeCloseTo(0, 4);
  expect(b.min[1]).toBeCloseTo(0, 4);
  expect(b.min[2]).toBeCloseTo(0, 4);
  expect(b.max[0]).toBeCloseTo(spec.w, 3);
  expect(b.max[1]).toBeCloseTo(spec.d, 3);
  expect(b.max[2]).toBeCloseTo(topZ, 3);
  expect(signedVolume(mesh)).toBeCloseTo(volumeMm3, 0);
  const report = checkPrintability(mesh);
  expect(report.problems).toEqual([]);
  expect(report.ok).toBe(true);
  expect(report.overhangTriangles).toBe(0);
  expect(report.minFeatureMm).toBeGreaterThanOrEqual(0.8 - 1e-3);
  return { mesh, volumeMm3, report };
}

describe("buildTray per tray type", () => {
  it("plain box: volume = block − well", () => {
    const { volumeMm3 } = expectWellFormed(plainBox);
    const expected = blockVolume(100, 60, 30, 3, 0.4) - wellVolume(96.8, 56.8, 28.8);
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.002);
  });

  it("upright cards: three decks, finger slots crossing into the neighbour deck", () => {
    const { volumeMm3 } = expectWellFormed(cardUpright);
    const solidBlock = blockVolume(cardUpright.w, cardUpright.d, cardUpright.h, 3, 0.4);
    const wells = [24, 30, 15].reduce((sum, w) => sum + wellVolume(w, 92.5, 68), 0);
    // the reach bands are solid except for the slots, so the tray is heavier than block − wells·full
    expect(volumeMm3).toBeLessThan(solidBlock - wells);
    expect(volumeMm3).toBeGreaterThan(solidBlock - wells - 6 * 22 * 12 * (68 / 3));
  });

  it("flat cards: full-depth slots on both short sides", () => {
    expectWellFormed(flatCards);
  });

  it("scoop bulk: fillets add r²(1 − π/4) per mm of wall", () => {
    const { volumeMm3 } = expectWellFormed(scoopBulk);
    const fillets = 3 * 144 * (1 - Math.PI / 4) * 40;
    const expected =
      blockVolume(scoopBulk.w, 60, 30, 3, 0.4) - 3 * wellVolume(40, 56.8, 28.8) + fillets;
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.003);
  });

  it("hex tiles: corner reliefs keep every wall and divider ≥ 0.8 mm", () => {
    const { volumeMm3 } = expectWellFormed(hexTiles);
    const plain =
      blockVolume(hexTiles.w, hexTiles.d, hexTiles.h, 3, 0.4) - 2 * wellVolume(47.2, 41, 31);
    expect(volumeMm3).toBeLessThan(plain);
  });

  it("minis pockets: raised floors stay solid", () => {
    const { volumeMm3 } = expectWellFormed(miniPockets);
    const noRaise =
      blockVolume(miniPockets.w, miniPockets.d, miniPockets.h, 3, 0.4) - 3 * wellVolume(30, 30, 40);
    // raised floors add 10 and 20 mm of solid under two pockets
    expect(volumeMm3 - noRaise).toBeGreaterThan(30 * 30 * 30 * 0.95);
  });

  it("custom block: reliefs plus one full-depth pocket", () => {
    expectWellFormed(customBlock);
  });

  it("spare leftover: one open compartment", () => {
    const { volumeMm3 } = expectWellFormed(spareLeftover);
    const expected = blockVolume(40, 70, 30, 3, 0.4) - wellVolume(36.8, 66.8, 28.8);
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.002);
  });

  it("solid leftover and spacer: closed blocks", () => {
    const solid = expectWellFormed(solidLeftover);
    expect(
      Math.abs(solid.volumeMm3 - blockVolume(20, 70, 30, 3, 0.4)) / solid.volumeMm3,
    ).toBeLessThan(0.002);
    const sp = expectWellFormed(spacer);
    expect(Math.abs(sp.volumeMm3 - blockVolume(92.5, 8, 63, 3, 0.4)) / sp.volumeMm3).toBeLessThan(
      0.002,
    );
  });

  it("lipped lower tray: lip adds height and a chamfered ring", () => {
    const { volumeMm3 } = expectWellFormed(lippedLower, 27);
    const t = 1.2;
    const ch = 0.6;
    const perimeter = 2 * (100 + 60) - (8 - 2 * Math.PI) * 3;
    const ringArea = perimeter * t - Math.PI * t * t;
    const chamfer = ((ch * ch) / 2) * (perimeter - 2 * Math.PI * (t - ch / 3));
    const expected =
      blockVolume(100, 60, 25, 3, 0.4) - wellVolume(94.2, 54.2, 23.8) + ringArea * 2 - chamfer;
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.002);
  });

  it("level-1 upper tray: 0.5 mm bottom chamfer", () => {
    const { volumeMm3 } = expectWellFormed(upperLevel1);
    const expected = blockVolume(97.1, 57.1, 20, 3, 0.5) - wellVolume(93.9, 53.9, 18.8);
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.002);
  });
});

describe("buildTray review focus", () => {
  it("thin walls (1.2 mm) still keep ≥ 0.8 mm at the rounded corners", () => {
    const thin = traySpec({
      key: "thin-wall",
      wall: 1.2,
      w: 60,
      d: 40,
      h: 20,
      compartments: [
        compartment({
          x: 1.2,
          y: 1.2,
          w: 57.6,
          d: 37.6,
          features: [{ type: "cornerRelief", d: 3 }],
        }),
      ],
    });
    expectWellFormed(thin);
  });

  it("a 0.3 mm divider builds but is reported as too thin", () => {
    const spec = traySpec({
      key: "thin-divider",
      w: 1.6 + 40 + 0.3 + 40 + 1.6,
      d: 40,
      h: 20,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 40, d: 36.8 }),
        compartment({ x: 41.9, y: 1.6, w: 40, d: 36.8 }),
      ],
    });
    const { mesh } = buildTray(m, spec, GEO);
    expect(topology(mesh).closed).toBe(true);
    const report = checkPrintability(mesh);
    expect(report.ok).toBe(false);
    expect(report.minFeatureMm).toBeCloseTo(0.3, 2);
    expect(report.problems.join(" ")).toMatch(/0\.30 mm/);
  });

  it("a shallow scoop tray keeps its height (radius clamped to the depth)", () => {
    expectWellFormed({ ...scoopBulk, h: 8 });
  });

  it("unknown features from a newer app throw UnsupportedFeatureError", () => {
    const spec = {
      ...plainBox,
      compartments: [
        { ...compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8 }), features: [{ type: "magnet" }] },
      ],
    } as unknown as TraySpec;
    expect(() => buildTray(m, spec, GEO)).toThrow(UnsupportedFeatureError);
  });

  it("does not leak WASM memory across many builds", () => {
    for (let i = 0; i < 30; i += 1) {
      buildTray(m, hexTiles, GEO);
    }
    expect(() => buildTray(m, scoopBulk, GEO)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/geometry/tray.test.ts`
Expected: FAIL — `Cannot find module './tray'`.

- [ ] **Step 3: Write the implementation**

`src/geometry/tray.ts`:

```ts
import type { Manifold, ManifoldToplevel, Vec3 } from "manifold-3d";
import type { Settings, TraySpec } from "../model/types";
import type { Mesh } from "./types";
import { planTray } from "./plan";
import { INNER_CORNER_RADIUS } from "./plan-types";
import type { CompartmentPlan, LipPlan, Rect, ScoopPlan, SlotPlan, TrayPlan } from "./plan-types";
import { withScope } from "./scope";
import type { Scope } from "./scope";
import {
  box,
  circleRing,
  horizontalCylinder,
  hullPoints,
  loft,
  prism,
  quarterSegments,
  roundedRectRing,
} from "./shapes";

const OVERSHOOT = 1; // cutters extend this far above the top so no face is coplanar with it
const EPS = 0.01; // small overlap to avoid coplanar faces between solids
const LIP_OVERLAP = 0.5; // the lip ring reaches this far down into the solid outer wall

function buildOuter(m: ManifoldToplevel, scope: Scope, plan: TrayPlan): Manifold {
  const { w, d, h, chamfer: c, cornerRadius: r } = plan;
  const n = quarterSegments(r);
  const outer = roundedRectRing(0, 0, w, d, r, n);
  if (c <= 0) {
    return prism(m, scope, outer, 0, h);
  }
  // Bottom ring = outer ring inset by c with radius r − c and the same
  // vertex angles, lofted up c: an exact 45° chamfer (plan ensures r ≥ c).
  return loft(m, scope, [
    { ring: roundedRectRing(c, c, w - c, d - c, r - c, n), z: 0 },
    { ring: outer, z: c },
    { ring: outer, z: h },
  ]);
}

// Locating lip (spec §6.1): the outer `thickness` of the wall rises `height`
// above the rim; its inner top edge has a `chamfer` × 45° chamfer.
function buildLip(m: ManifoldToplevel, scope: Scope, plan: TrayPlan, lip: LipPlan): Manifold {
  const { w, d, h, cornerRadius: r } = plan;
  const { thickness: t, chamfer: ch } = lip;
  const top = h + lip.height;
  const n = quarterSegments(r);
  const innerRing = roundedRectRing(t, t, w - t, d - t, Math.max(r - t, 0), n);
  const chamferRing = roundedRectRing(
    t - ch,
    t - ch,
    w - t + ch,
    d - t + ch,
    Math.max(r - t + ch, 0),
    n,
  );
  const outer = prism(m, scope, roundedRectRing(0, 0, w, d, r, n), h - LIP_OVERLAP, top);
  const inner = prism(m, scope, innerRing, h - LIP_OVERLAP - OVERSHOOT, top + OVERSHOOT);
  const chamferCut = loft(m, scope, [
    { ring: innerRing, z: top - ch },
    { ring: chamferRing, z: top },
    { ring: chamferRing, z: top + OVERSHOOT },
  ]);
  return scope.track(m.Manifold.difference([outer, inner, chamferCut]));
}

// Concave quarter-round fillet between the floor and the wall on `side`:
// the solid r × r corner region minus a cylinder of radius r.
function buildSpandrel(
  m: ManifoldToplevel,
  scope: Scope,
  content: Rect,
  floorZ: number,
  scoop: ScoopPlan,
): Manifold {
  const { r, side } = scoop;
  const z0 = floorZ - EPS;
  const zc = floorZ + r;
  const { x0, y0, x1, y1 } = content;
  let corner: Manifold;
  let cylinder: Manifold;
  switch (side) {
    case "front":
      corner = box(m, scope, [x0 - 1, y0 - EPS, z0], [x1 + 1, y0 + r, zc]);
      cylinder = horizontalCylinder(m, scope, "x", x0 - 2, x1 + 2, y0 + r, zc, r);
      break;
    case "back":
      corner = box(m, scope, [x0 - 1, y1 - r, z0], [x1 + 1, y1 + EPS, zc]);
      cylinder = horizontalCylinder(m, scope, "x", x0 - 2, x1 + 2, y1 - r, zc, r);
      break;
    case "left":
      corner = box(m, scope, [x0 - EPS, y0 - 1, z0], [x0 + r, y1 + 1, zc]);
      cylinder = horizontalCylinder(m, scope, "y", y0 - 2, y1 + 2, x0 + r, zc, r);
      break;
    case "right":
      corner = box(m, scope, [x1 - r, y0 - 1, z0], [x1 + EPS, y1 + 1, zc]);
      cylinder = horizontalCylinder(m, scope, "y", y0 - 2, y1 + 2, x1 - r, zc, r);
      break;
  }
  return scope.track(corner.subtract(cylinder));
}

// U-slot: vertical sides, round bottom; convex, so one hull.
function buildSlot(m: ManifoldToplevel, scope: Scope, slot: SlotPlan, topZ: number): Manifold {
  const alongX = slot.side === "front" || slot.side === "back";
  const r = slot.radius;
  const centre = alongX ? (slot.x0 + slot.x1) / 2 : (slot.y0 + slot.y1) / 2;
  const zc = slot.bottomZ + r;
  const zTop = Math.max(topZ, zc);
  const segments = 4 * quarterSegments(r);
  const ends = alongX ? [slot.y0, slot.y1] : [slot.x0, slot.x1];
  const points: Vec3[] = [];
  for (const e of ends) {
    const profile: [number, number][] = [
      [centre - r, zTop],
      [centre + r, zTop],
    ];
    for (let k = segments / 2; k <= segments; k += 1) {
      const a = (2 * Math.PI * k) / segments;
      profile.push([centre + r * Math.cos(a), zc + r * Math.sin(a)]);
    }
    for (const [u, z] of profile) {
      points.push(alongX ? [u, e, z] : [e, u, z]);
    }
  }
  return hullPoints(m, scope, points);
}

function buildCutter(
  m: ManifoldToplevel,
  scope: Scope,
  plan: TrayPlan,
  c: CompartmentPlan,
): Manifold {
  const top = plan.topZ + OVERSHOOT;
  const { content } = c;
  const r = Math.min(
    INNER_CORNER_RADIUS,
    (content.x1 - content.x0) / 2,
    (content.y1 - content.y0) / 2,
  );
  const ring = roundedRectRing(
    content.x0,
    content.y0,
    content.x1,
    content.y1,
    r,
    quarterSegments(r),
  );
  let cutter = prism(m, scope, ring, c.floorZ, top);
  for (const scoop of c.scoops) {
    cutter = scope.track(cutter.subtract(buildSpandrel(m, scope, content, c.floorZ, scoop)));
  }
  const extras = [
    ...c.slots.map((slot) => buildSlot(m, scope, slot, top)),
    ...c.reliefs.map((rl) =>
      prism(m, scope, circleRing(rl.cx, rl.cy, rl.r, 4 * quarterSegments(rl.r)), c.floorZ, top),
    ),
  ];
  if (extras.length > 0) {
    cutter = scope.track(m.Manifold.union([cutter, ...extras]));
  }
  return cutter;
}

function toMesh(solid: Manifold): Mesh {
  // Copy out of the kernel's buffers: the arrays are transferred to the main
  // thread later, which must never detach WASM memory.
  const raw = solid.getMesh();
  const stride = raw.numProp;
  const count = raw.vertProperties.length / stride;
  const positions = new Float32Array(count * 3);
  for (let v = 0; v < count; v += 1) {
    for (let k = 0; k < 3; k += 1) {
      positions[v * 3 + k] = raw.vertProperties[v * stride + k] ?? 0;
    }
  }
  return { positions, indices: new Uint32Array(raw.triVerts) };
}

// Builds one printed part from its TraySpec alone (plus the settings that
// define lip, chamfer, corner radius and scoop sizes). Mesh frame: tray-local,
// origin at the outer min corner, z = 0 at the bottom.
// Throws RangeError for an invalid spec, UnsupportedFeatureError for parts or
// features from a newer app version, Error if the kernel fails.
export function buildTray(
  m: ManifoldToplevel,
  spec: TraySpec,
  settings: Settings,
): { mesh: Mesh; volumeMm3: number } {
  const plan = planTray(spec, settings);
  return withScope((scope) => {
    let solid = buildOuter(m, scope, plan);
    if (plan.lip) {
      solid = scope.track(solid.add(buildLip(m, scope, plan, plan.lip)));
    }
    const cutters = plan.compartments.map((c) => buildCutter(m, scope, plan, c));
    if (cutters.length > 0) {
      solid = scope.track(solid.subtract(scope.track(m.Manifold.union(cutters))));
    }
    const status = solid.status();
    if (status !== "NoError") {
      throw new Error(`Tray ${spec.key}: geometry kernel failed (${status})`);
    }
    return { mesh: toMesh(solid), volumeMm3: solid.volume() };
  });
}
```

`src/geometry/index.ts`:

```ts
export { loadManifold } from "./load";
export { buildTray } from "./tray";
export { checkPrintability } from "./printability";
export { UnsupportedFeatureError } from "./errors";
export { GEOMETRY_VERSION } from "./version";
export type { GeometryRequest, GeometryResponse, Mesh, PrintabilityReport } from "./types";
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/geometry && npx tsc --noEmit`
Expected: PASS (all geometry tests so far, including 16 in `tray.test.ts`; the whole run takes well under 2 s), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/tray.ts src/geometry/index.ts src/geometry/tray.test.ts
git commit -m "Build tray meshes with manifold"
```

---

### Task 6: Geometry worker and client

**Files:**

- Create: `apps/insert-generator/src/geometry/worker-core.ts`
- Create: `apps/insert-generator/src/geometry/worker.ts`
- Create: `apps/insert-generator/src/geometry/client.ts`
- Modify: `apps/insert-generator/vite.config.ts` (add `worker` and `optimizeDeps`)
- Check: `apps/insert-generator/tsconfig.json` (`"types"` includes `"vite/client"`)
- Test: `apps/insert-generator/src/geometry/worker-core.test.ts`
- Test: `apps/insert-generator/src/geometry/client.test.ts`

**Interfaces:**

- Consumes: `GeometryRequest`, `GeometryResponse`, `Mesh` (Task 1); `buildTray` (Task 5); `loadManifold` (Task 2); `TraySpec`, `Settings` (roadmap §4.1).
- Produces:
  - `src/geometry/worker-core.ts`: `type PostResponse = (message: GeometryResponse, transfer: Transferable[]) => void`, `createGeometryHandler(load: () => Promise<ManifoldToplevel>, post: PostResponse): (request: GeometryRequest) => Promise<void>`.
  - `src/geometry/worker.ts`: the module worker entry (no exports).
  - `src/geometry/client.ts`: `interface GeometryClient { build(spec: TraySpec, settings: Settings): Promise<{ mesh: Mesh; volumeMm3: number }>; dispose(): void }`, `createGeometryClient(): GeometryClient` (roadmap §4.3). The worker starts on the first `build` (lazy, spec §4); a crashed worker rejects all pending builds and the next `build` starts a new one (retry, spec §10); `dispose()` terminates it and rejects pending builds with `Error("Geometry client disposed")`.

- [ ] **Step 1: Write the failing tests**

`src/geometry/worker-core.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TraySpec } from "../model/types";
import { loadManifold } from "./load";
import { createGeometryHandler } from "./worker-core";
import type { GeometryResponse } from "./types";
import { GEO, compartment, plainBox } from "./test-specs";

function collect() {
  const sent: { message: GeometryResponse; transfer: Transferable[] }[] = [];
  const handle = createGeometryHandler(
    () => loadManifold(),
    (message, transfer) => sent.push({ message, transfer }),
  );
  return { sent, handle };
}

describe("geometry worker handler", () => {
  it("builds a tray and transfers its buffers", async () => {
    const { sent, handle } = collect();
    await handle({ type: "build", requestId: 7, spec: plainBox, settings: GEO });
    expect(sent).toHaveLength(1);
    const [first] = sent;
    expect(first?.message.type).toBe("built");
    if (first?.message.type !== "built") {
      return;
    }
    expect(first.message.requestId).toBe(7);
    expect(first.message.key).toBe(plainBox.key);
    expect(first.message.volumeMm3).toBeGreaterThan(0);
    expect(first.transfer).toEqual([
      first.message.mesh.positions.buffer,
      first.message.mesh.indices.buffer,
    ]);
  });

  it("answers an invalid or newer-version spec with an error message", async () => {
    const { sent, handle } = collect();
    const newer = {
      ...plainBox,
      compartments: [
        { ...compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8 }), features: [{ type: "magnet" }] },
      ],
    } as unknown as TraySpec;
    await handle({ type: "build", requestId: 1, spec: newer, settings: GEO });
    await handle({ type: "build", requestId: 2, spec: { ...plainBox, w: -1 }, settings: GEO });
    expect(sent.map((s) => s.message)).toEqual([
      expect.objectContaining({
        type: "error",
        requestId: 1,
        key: plainBox.key,
        message: expect.stringMatching(/magnet/),
      }),
      expect.objectContaining({
        type: "error",
        requestId: 2,
        message: expect.stringMatching(/positive/),
      }),
    ]);
  });

  it("skips a build cancelled before the module finished loading", async () => {
    const sent: GeometryResponse[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = createGeometryHandler(
      async () => {
        await gate;
        return loadManifold();
      },
      (message) => sent.push(message),
    );
    const first = handle({ type: "build", requestId: 1, spec: plainBox, settings: GEO });
    const second = handle({ type: "build", requestId: 2, spec: plainBox, settings: GEO });
    await handle({ type: "cancel", requestId: 1 });
    release();
    await Promise.all([first, second]);
    expect(sent.map((s) => s.requestId)).toEqual([2]);
  });
});
```

`src/geometry/client.test.ts` (a fake `Worker` stands in for the real one):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGeometryClient } from "./client";
import type { GeometryRequest, GeometryResponse } from "./types";
import { GEO, plainBox } from "./test-specs";

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly url: string;
  readonly options: WorkerOptions | undefined;
  readonly sent: GeometryRequest[] = [];
  terminated = false;
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(url: URL | string, options?: WorkerOptions) {
    this.url = String(url);
    this.options = options;
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(message: GeometryRequest): void {
    this.sent.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(data: GeometryResponse): void {
    for (const l of this.listeners.get("message") ?? []) {
      l({ data });
    }
  }

  crash(message: string): void {
    for (const l of this.listeners.get("error") ?? []) {
      l({ message, preventDefault: () => undefined });
    }
  }
}

const mesh = { positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) };

// Starts a build whose outcome the test does not check.
function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createGeometryClient", () => {
  it("starts the module worker lazily on the first build", () => {
    const client = createGeometryClient();
    expect(FakeWorker.instances).toHaveLength(0);
    fireAndForget(client.build(plainBox, GEO));
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0];
    expect(worker?.options).toEqual({ type: "module" });
    expect(worker?.url).toMatch(/worker\.ts/);
    expect(worker?.sent).toEqual([{ type: "build", requestId: 1, spec: plainBox, settings: GEO }]);
    client.dispose();
  });

  it("resolves builds by request id, in any order", async () => {
    const client = createGeometryClient();
    const a = client.build(plainBox, GEO);
    const b = client.build({ ...plainBox, key: "b" }, GEO);
    const worker = FakeWorker.instances[0];
    worker?.respond({ type: "built", requestId: 2, key: "b", mesh, volumeMm3: 2 });
    worker?.respond({ type: "built", requestId: 1, key: plainBox.key, mesh, volumeMm3: 1 });
    await expect(a).resolves.toEqual({ mesh, volumeMm3: 1 });
    await expect(b).resolves.toEqual({ mesh, volumeMm3: 2 });
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("rejects with the worker's error message", async () => {
    const client = createGeometryClient();
    const a = client.build(plainBox, GEO);
    FakeWorker.instances[0]?.respond({
      type: "error",
      requestId: 1,
      key: plainBox.key,
      message: "boom",
    });
    await expect(a).rejects.toThrow("boom");
  });

  it("rejects pending builds when the worker crashes and retries with a new worker", async () => {
    const client = createGeometryClient();
    const a = client.build(plainBox, GEO);
    FakeWorker.instances[0]?.crash("wasm failed");
    await expect(a).rejects.toThrow(/wasm failed/);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
    fireAndForget(client.build(plainBox, GEO));
    expect(FakeWorker.instances).toHaveLength(2);
    client.dispose();
  });

  it("dispose terminates the worker and rejects pending builds", async () => {
    const client = createGeometryClient();
    const a = client.build(plainBox, GEO);
    client.dispose();
    await expect(a).rejects.toThrow(/disposed/);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/geometry/worker-core.test.ts src/geometry/client.test.ts`
Expected: FAIL — `Cannot find module './worker-core'` and `Cannot find module './client'`.

- [ ] **Step 3: Write the implementation**

`src/geometry/worker-core.ts`:

```ts
import type { ManifoldToplevel } from "manifold-3d";
import type { GeometryRequest, GeometryResponse } from "./types";
import { buildTray } from "./tray";

export type PostResponse = (message: GeometryResponse, transfer: Transferable[]) => void;

// Message handler shared by the real worker and tests. Builds run one after
// another; a "cancel" only skips a build that has not started yet (builds
// are synchronous, so in practice: one still waiting for the WASM to load).
export function createGeometryHandler(
  load: () => Promise<ManifoldToplevel>,
  post: PostResponse,
): (request: GeometryRequest) => Promise<void> {
  const cancelled = new Set<number>();
  return async (request) => {
    if (request.type === "cancel") {
      cancelled.add(request.requestId);
      return;
    }
    const { requestId, spec, settings } = request;
    try {
      const m = await load();
      if (cancelled.delete(requestId)) {
        return;
      }
      const { mesh, volumeMm3 } = buildTray(m, spec, settings);
      post({ type: "built", requestId, key: spec.key, mesh, volumeMm3 }, [
        mesh.positions.buffer as ArrayBuffer,
        mesh.indices.buffer as ArrayBuffer,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({ type: "error", requestId, key: spec.key, message }, []);
    }
  };
}
```

`src/geometry/worker.ts`:

```ts
// Geometry Web Worker. Loaded lazily by client.ts via
// new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }).
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { loadManifold } from "./load";
import { createGeometryHandler } from "./worker-core";
import type { GeometryRequest } from "./types";

const handle = createGeometryHandler(
  () => loadManifold(wasmUrl),
  (message, transfer) => {
    self.postMessage(message, { transfer });
  },
);

self.addEventListener("message", (event: MessageEvent<GeometryRequest>) => {
  void handle(event.data);
});
```

`src/geometry/client.ts`:

```ts
import type { Settings, TraySpec } from "../model/types";
import type { GeometryRequest, GeometryResponse, Mesh } from "./types";

export interface GeometryClient {
  build(spec: TraySpec, settings: Settings): Promise<{ mesh: Mesh; volumeMm3: number }>;
  dispose(): void;
}

interface Pending {
  resolve: (result: { mesh: Mesh; volumeMm3: number }) => void;
  reject: (error: Error) => void;
}

// Main-thread side of the geometry worker. The worker (and the WASM) is
// started on the first build. If the worker crashes, every pending build is
// rejected and the next build starts a fresh worker (retry).
export function createGeometryClient(): GeometryClient {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  function failAll(error: Error): void {
    const waiting = [...pending.values()];
    pending.clear();
    for (const p of waiting) {
      p.reject(error);
    }
  }

  function onMessage(event: MessageEvent<GeometryResponse>): void {
    const response = event.data;
    const p = pending.get(response.requestId);
    if (p === undefined) {
      return;
    }
    pending.delete(response.requestId);
    if (response.type === "built") {
      p.resolve({ mesh: response.mesh, volumeMm3: response.volumeMm3 });
    } else {
      p.reject(new Error(response.message));
    }
  }

  function ensureWorker(): Worker {
    if (worker !== null) {
      return worker;
    }
    const created = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    created.addEventListener("message", onMessage);
    created.addEventListener("error", (event: ErrorEvent) => {
      event.preventDefault();
      created.terminate();
      if (worker === created) {
        worker = null;
      }
      failAll(new Error(`Geometry worker failed: ${event.message || "unknown error"}`));
    });
    worker = created;
    return created;
  }

  return {
    build(spec, settings) {
      return new Promise((resolve, reject) => {
        const requestId = nextId;
        nextId += 1;
        pending.set(requestId, { resolve, reject });
        const request: GeometryRequest = { type: "build", requestId, spec, settings };
        ensureWorker().postMessage(request);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      failAll(new Error("Geometry client disposed"));
    },
  };
}
```

- [ ] **Step 4: Configure Vite for the worker and the WASM**

Edit `vite.config.ts` (plan 1 created it): add the `worker` and `optimizeDeps` properties between `define` and `test`, and change nothing else. The whole file afterwards:

```ts
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import pkg from "./package.json";

// `base: "./"` keeps every asset URL relative, so the built app works from any
// subpath (e.g. /<repo>/insert-generator/).
export default defineConfig({
  base: "./",
  plugins: [preact()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Geometry worker: an ES module worker (spec §4). manifold-3d ships its own
  // WASM loader, so keep it out of dependency pre-bundling; the worker passes
  // the `?url`-imported WASM to locateFile.
  worker: { format: "es" },
  optimizeDeps: { exclude: ["manifold-3d"] },
  test: {
    // Pure modules run in Node. Component tests opt in to a DOM with a
    // `// @vitest-environment jsdom` comment on their first line.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

Then make sure `tsconfig.json` has `"vite/client"` in `compilerOptions.types` (it types the `?url` import in `worker.ts`). If the `types` array exists without it, add `"vite/client"` to it; if there is no `types` array, add `"types": ["vite/client"]`.

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/geometry/worker-core.test.ts src/geometry/client.test.ts && npm run typecheck`
Expected: PASS (8 tests), no type errors (`typecheck` also checks `vite.config.ts` through `tsconfig.node.json`).

- [ ] **Step 6: Check that a production build emits the worker and the WASM**

Nothing imports the client yet (plan 5 wires it), so build it as an extra entry into a throwaway folder:

```bash
node --input-type=module -e "import { build } from 'vite'; await build({ logLevel: 'warn', build: { outDir: 'node_modules/.cache/geometry-build-check', emptyOutDir: true, rollupOptions: { input: 'src/geometry/client.ts' } } });"
ls node_modules/.cache/geometry-build-check/assets
```

Expected: the listing contains `manifold-<hash>.wasm` (≈ 540 kB) and `worker-<hash>.js`. Two warnings are expected and harmless: `Module "node:module" has been externalized for browser compatibility` (manifold's Node-only branch) and `Generated an empty chunk: "client"` (nothing uses the client's export in this check). Then run `npm run build` and confirm it still succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/geometry/worker-core.ts src/geometry/worker.ts src/geometry/client.ts src/geometry/worker-core.test.ts src/geometry/client.test.ts vite.config.ts tsconfig.json
git commit -m "Add geometry worker and client"
```

---

### Task 7: STL, file names, bed grid and zip

**Files:**

- Create: `apps/insert-generator/src/export/stl.ts`
- Create: `apps/insert-generator/src/export/names.ts`
- Create: `apps/insert-generator/src/export/grid.ts`
- Create: `apps/insert-generator/src/export/zip.ts`
- Test: `apps/insert-generator/src/export/stl.test.ts`
- Test: `apps/insert-generator/src/export/names.test.ts`
- Test: `apps/insert-generator/src/export/grid.test.ts`
- Test: `apps/insert-generator/src/export/zip.test.ts`

**Interfaces:**

- Consumes: `Mesh` (Task 1); `cubeMesh` (Task 4); `zipSync`, `unzipSync`, `strToU8`, `Zippable` from `fflate`.
- Produces (roadmap §4.3 signatures):
  - `toStl(mesh: Mesh, name: string): Uint8Array` — binary STL: 80-byte printable-ASCII header `insert-generator <name>` padded with spaces (never starting with `solid`), uint32 count, 50 bytes per triangle (unit normal from the CCW winding, three vertices, zero attribute); total `84 + 50n` bytes.
  - `partFileName(index: number, contents: string, ext: "3mf" | "stl"): string` — `NN-<sanitized>.ext`; umlauts → ae/oe/ue, ß → ss, accents dropped, anything outside `[A-Za-z0-9._-]` → `-`, separator runs collapsed, trimmed, ≤ 60 characters, `part` when empty.
  - `gridLayout(sizes: { w: number; d: number }[], bed: { x: number; y: number }, gap: number): [number, number, number][]` — min-corner translations at z = 0, rows left to right, wrapping when the next part doesn't fit `bed.x`.
  - `zipFiles(files: { name: string; data: Uint8Array }[]): Uint8Array` — deterministic (fixed timestamp), `.3mf` entries stored, others deflated, duplicate names → `RangeError`.

- [ ] **Step 1: Write the failing tests**

`src/export/stl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toStl } from "./stl";
import { cubeMesh } from "../geometry/test-mesh";

describe("toStl", () => {
  it("writes header, count and 50 bytes per triangle", () => {
    const stl = toStl(cubeMesh(10), "Main deck");
    expect(stl.length).toBe(84 + 50 * 12);
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
    expect(view.getUint32(80, true)).toBe(12);
    const header = new TextDecoder().decode(stl.subarray(0, 80));
    expect(header.startsWith("insert-generator Main deck")).toBe(true);
    expect(header.startsWith("solid")).toBe(false);
    expect(header.trimEnd()).toBe("insert-generator Main deck");
  });

  it("computes unit normals and keeps vertex order", () => {
    const stl = toStl(cubeMesh(10), "x");
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
    // triangle 0 = vertices 0, 2, 1 of the bottom face: normal (0, 0, −1)
    expect([0, 4, 8].map((o) => view.getFloat32(84 + o, true))).toEqual([0, 0, -1]);
    const v1 = [12, 16, 20].map((o) => view.getFloat32(84 + o, true));
    const v2 = [24, 28, 32].map((o) => view.getFloat32(84 + o, true));
    expect(v1).toEqual([0, 0, 0]);
    expect(v2).toEqual([10, 10, 0]);
    expect(view.getUint16(84 + 48, true)).toBe(0);
  });

  it("keeps the header ASCII and 80 bytes for any name", () => {
    const stl = toStl(cubeMesh(1), `Würfel 🎲 ${"x".repeat(200)}`);
    const header = stl.subarray(0, 80);
    expect([...header].every((b) => b >= 0x20 && b <= 0x7e)).toBe(true);
    expect(new DataView(stl.buffer).getUint32(80, true)).toBe(12);
  });

  it("writes a zero normal for degenerate triangles instead of NaN", () => {
    const cube = cubeMesh(1);
    const stl = toStl({ positions: cube.positions, indices: new Uint32Array([0, 1, 1]) }, "d");
    const view = new DataView(stl.buffer);
    expect([0, 4, 8].map((o) => view.getFloat32(84 + o, true))).toEqual([0, 0, 0]);
  });
});
```

`src/export/names.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { partFileName } from "./names";

describe("partFileName", () => {
  it("pads the index and keeps safe characters", () => {
    expect(partFileName(1, "Main_deck-1.v2", "3mf")).toBe("01-Main_deck-1.v2.3mf");
    expect(partFileName(12, "Bits", "stl")).toBe("12-Bits.stl");
    expect(partFileName(123, "Bits", "stl")).toBe("123-Bits.stl");
  });

  it("transliterates umlauts and drops accents", () => {
    expect(partFileName(3, "Würfel & Plättchen", "3mf")).toBe("03-Wuerfel-Plaettchen.3mf");
    expect(partFileName(4, "Café crème Straße", "3mf")).toBe("04-Cafe-creme-Strasse.3mf");
  });

  it("replaces emoji, slashes and spaces and collapses repeats", () => {
    expect(partFileName(5, "🎲🎲 dice / tokens  ×52", "stl")).toBe("05-dice-tokens-52.stl");
    expect(partFileName(6, "a..b__c--d", "stl")).toBe("06-a.b_c-d.stl");
    expect(partFileName(7, "../../etc/passwd", "stl")).toBe("07-etc-passwd.stl");
  });

  it("falls back to 'part' and caps the length", () => {
    expect(partFileName(8, "🎲", "3mf")).toBe("08-part.3mf");
    expect(partFileName(9, "", "3mf")).toBe("09-part.3mf");
    const long = partFileName(10, "x".repeat(300), "3mf");
    expect(long).toBe(`10-${"x".repeat(60)}.3mf`);
  });

  it("never ends the name part with a separator after truncation", () => {
    const name = partFileName(11, `${"a".repeat(59)} b`, "stl");
    expect(name).toBe(`11-${"a".repeat(59)}.stl`);
  });
});
```

`src/export/grid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gridLayout } from "./grid";

describe("gridLayout", () => {
  it("places parts left to right with a gap", () => {
    expect(
      gridLayout(
        [
          { w: 50, d: 30 },
          { w: 60, d: 40 },
        ],
        { x: 250, y: 210 },
        5,
      ),
    ).toEqual([
      [0, 0, 0],
      [55, 0, 0],
    ]);
  });

  it("wraps to a new row below the deepest part of the row", () => {
    const sizes = [
      { w: 100, d: 30 },
      { w: 100, d: 50 },
      { w: 100, d: 20 },
    ];
    expect(gridLayout(sizes, { x: 220, y: 220 }, 10)).toEqual([
      [0, 0, 0],
      [110, 0, 0],
      [0, 60, 0],
    ]);
  });

  it("gives a part wider than the bed its own row instead of failing", () => {
    const sizes = [
      { w: 50, d: 10 },
      { w: 300, d: 10 },
      { w: 50, d: 10 },
    ];
    expect(gridLayout(sizes, { x: 250, y: 250 }, 5)).toEqual([
      [0, 0, 0],
      [0, 15, 0],
      [0, 30, 0],
    ]);
  });

  it("returns nothing for no parts", () => {
    expect(gridLayout([], { x: 100, y: 100 }, 5)).toEqual([]);
  });
});
```

`src/export/zip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { unzipSync, strToU8 } from "fflate";
import { zipFiles } from "./zip";

describe("zipFiles", () => {
  it("round-trips files", () => {
    const zip = zipFiles([
      { name: "01-a.stl", data: strToU8("hello") },
      { name: "02-b.3mf", data: new Uint8Array([1, 2, 3]) },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual(["01-a.stl", "02-b.3mf"]);
    expect(files["02-b.3mf"]).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("is deterministic", () => {
    const files = [{ name: "a.stl", data: strToU8("x".repeat(1000)) }];
    expect(zipFiles(files)).toEqual(zipFiles(files));
  });

  it("rejects duplicate names", () => {
    const data = new Uint8Array([1]);
    expect(() =>
      zipFiles([
        { name: "a.stl", data },
        { name: "a.stl", data },
      ]),
    ).toThrow(/Duplicate/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/export`
Expected: FAIL — `Cannot find module './stl'` (and likewise `./names`, `./grid`, `./zip`).

- [ ] **Step 3: Write the implementation**

`src/export/stl.ts`:

```ts
import type { Mesh } from "../geometry/types";

const HEADER_BYTES = 80;
const TRIANGLE_BYTES = 50;

// Printable ASCII only; never starts with "solid" (that would make some
// readers treat the binary file as ASCII STL).
function header(name: string): Uint8Array {
  const text = `insert-generator ${name}`.replace(/[^\x20-\x7e]/g, "_").slice(0, HEADER_BYTES);
  const bytes = new Uint8Array(HEADER_BYTES).fill(0x20);
  for (let i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i);
  }
  return bytes;
}

// Binary STL: 80-byte header, uint32 triangle count, then per triangle the
// unit normal, three vertices (float32, little-endian) and a zero uint16.
export function toStl(mesh: Mesh, name: string): Uint8Array {
  const count = Math.floor(mesh.indices.length / 3);
  const out = new Uint8Array(HEADER_BYTES + 4 + count * TRIANGLE_BYTES);
  out.set(header(name), 0);
  const view = new DataView(out.buffer);
  view.setUint32(HEADER_BYTES, count, true);
  const p = mesh.positions;
  for (let t = 0; t < count; t += 1) {
    const corner = [0, 1, 2].map((k) => (mesh.indices[t * 3 + k] ?? 0) * 3);
    const [a = 0, b = 0, c = 0] = corner;
    const ux = (p[b] ?? 0) - (p[a] ?? 0);
    const uy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
    const uz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
    const vx = (p[c] ?? 0) - (p[a] ?? 0);
    const vy = (p[c + 1] ?? 0) - (p[a + 1] ?? 0);
    const vz = (p[c + 2] ?? 0) - (p[a + 2] ?? 0);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    let offset = HEADER_BYTES + 4 + t * TRIANGLE_BYTES;
    for (const value of [nx / len, ny / len, nz / len]) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
    for (const base of corner) {
      for (let k = 0; k < 3; k += 1) {
        view.setFloat32(offset, p[base + k] ?? 0, true);
        offset += 4;
      }
    }
    view.setUint16(offset, 0, true);
  }
  return out;
}
```

`src/export/names.ts`:

```ts
const MAX_NAME = 60;

const TRANSLITERATE: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
  æ: "ae",
  Æ: "Ae",
  ø: "o",
  Ø: "O",
  œ: "oe",
  Œ: "Oe",
};

// "NN-<contents>.ext": contents transliterated to ASCII (umlauts → ae/oe/ue,
// accents dropped), everything outside [A-Za-z0-9._-] turned into "-",
// repeats collapsed, trimmed, at most 60 characters; "part" if nothing is
// left. NN is the index padded to two digits.
export function partFileName(index: number, contents: string, ext: "3mf" | "stl"): string {
  const ascii = [...contents]
    .map((ch) => TRANSLITERATE[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  const cleaned = ascii
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/([._-])[._-]+/g, "$1")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, MAX_NAME)
    .replace(/[._-]+$/g, "");
  const prefix = String(Math.max(0, Math.trunc(index))).padStart(2, "0");
  return `${prefix}-${cleaned === "" ? "part" : cleaned}.${ext}`;
}
```

`src/export/grid.ts`:

```ts
// Places parts left to right in rows on the bed (min corners, z = 0),
// `gap` apart; a part that doesn't fit the rest of the row starts a new row.
// Rows continue past bed.y if needed (the slicer then needs more plates).
export function gridLayout(
  sizes: { w: number; d: number }[],
  bed: { x: number; y: number },
  gap: number,
): [number, number, number][] {
  const out: [number, number, number][] = [];
  let x = 0;
  let y = 0;
  let rowDepth = 0;
  for (const { w, d } of sizes) {
    if (x > 0 && x + w > bed.x) {
      x = 0;
      y += rowDepth + gap;
      rowDepth = 0;
    }
    out.push([x, y, 0]);
    x += w + gap;
    rowDepth = Math.max(rowDepth, d);
  }
  return out;
}
```

`src/export/zip.ts`:

```ts
import { zipSync } from "fflate";
import type { Zippable } from "fflate";

// Fixed timestamp (local time, as zip stores it) so equal inputs give
// byte-identical archives.
const ZIP_TIME = new Date(2020, 0, 1, 0, 0, 0);

// Zip archive of the given files. Already-compressed .3mf files are stored;
// everything else is deflated. Names must be unique.
export function zipFiles(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const entries: Zippable = {};
  for (const { name, data } of files) {
    if (name in entries) {
      throw new RangeError(`Duplicate file name in zip: ${name}`);
    }
    entries[name] = [data, { level: name.endsWith(".3mf") ? 0 : 6, mtime: ZIP_TIME }];
  }
  return zipSync(entries);
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/export && npx tsc --noEmit`
Expected: PASS (16 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/export/stl.ts src/export/names.ts src/export/grid.ts src/export/zip.ts src/export/stl.test.ts src/export/names.test.ts src/export/grid.test.ts src/export/zip.test.ts
git commit -m "Add STL, file name, grid and zip export helpers"
```

---

### Task 8: 3MF writer and export round trip

**Files:**

- Modify: `apps/insert-generator/package.json`, `package-lock.json` (test dependencies, if missing)
- Create: `apps/insert-generator/src/export/threemf.ts`
- Create: `apps/insert-generator/src/export/index.ts`
- Test: `apps/insert-generator/src/export/threemf.test.ts`
- Test: `apps/insert-generator/src/export/roundtrip.test.ts`

**Interfaces:**

- Consumes: `Mesh` (Task 1); `buildTray`, `loadManifold`, fixtures and mesh helpers (Tasks 2–5); Task 7 helpers; `Zip`, `ZipDeflate`, `strToU8` from `fflate`; `ThreeMFLoader` from `three/examples/jsm/loaders/3MFLoader.js` (tests only).
- Produces:
  - `src/export/threemf.ts`: `interface ThreeMfPart { name: string; mesh: Mesh; transform?: [number, number, number] }`, `CONTENT_TYPES_XML`, `RELS_XML`, `num(n: number): string`, `xmlAttr(text: string): string`, `modelXmlChunks(parts: ThreeMfPart[]): Generator<string>`, `to3mf(parts: ThreeMfPart[]): Uint8Array` (roadmap §4.3 signature).
  - `src/export/index.ts`: re-exports `to3mf`, `toStl`, `zipFiles`, `partFileName`, `gridLayout` (roadmap §4.3).

The 3MF package: `[Content_Types].xml` (Default `rels` → `application/vnd.openxmlformats-package.relationships+xml`, Default `model` → `application/vnd.ms-package.3dmanufacturing-3dmodel+xml`), `_rels/.rels` (Target `/3D/3dmodel.model`, Type `http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel`), and `3D/3dmodel.model` with `unit="millimeter"`, one `<object type="model" name="…">` per part and one `<build><item objectid="…" transform="1 0 0 0 1 0 0 0 1 tx ty tz"?/>` per part. Numbers go through `toFixed(4)` (never locale formatting). Triangles keep manifold's CCW-from-outside winding. The model XML is pushed into the zip object by object (`ZipDeflate`), so a large export never builds one giant string.

- [ ] **Step 1: Add the test dependencies**

Run from `apps/insert-generator` (a no-op for packages plan 1 already added):

```bash
npm install three@^0.186.1
npm install --save-dev @types/three@^0.186.0 jsdom@^30.1.2
```

`three`'s `3MFLoader` needs `DOMParser`, so `threemf.test.ts` runs in jsdom (`// @vitest-environment jsdom`); the round-trip test needs WASM and runs in node.

- [ ] **Step 2: Write the failing tests**

`src/export/threemf.test.ts` (the exact-XML test is the structure snapshot):

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { Mesh as ThreeMesh } from "three";
import type { BufferGeometry } from "three";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { modelXmlChunks, num, to3mf, xmlAttr } from "./threemf";
import { cubeMesh } from "../geometry/test-mesh";
import type { Mesh } from "../geometry/types";

const tetra: Mesh = {
  positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
};

function meshes(bytes: Uint8Array): ThreeMesh[] {
  const group = new ThreeMFLoader().parse(bytes.slice().buffer);
  group.updateMatrixWorld(true);
  const found: ThreeMesh[] = [];
  group.traverse((o) => {
    if (o instanceof ThreeMesh) {
      found.push(o);
    }
  });
  return found;
}

describe("num and xmlAttr", () => {
  it("formats with toFixed, no trailing zeros, no -0", () => {
    expect(num(1)).toBe("1");
    expect(num(0.1 + 0.2)).toBe("0.3");
    expect(num(-0.00001)).toBe("0");
    expect(num(123.456789)).toBe("123.4568");
    expect(num(1e-7)).toBe("0");
  });

  it("escapes markup and drops control characters", () => {
    expect(xmlAttr(`a<b>&"c'\u0001`)).toBe("a&lt;b&gt;&amp;&quot;c&apos;");
  });
});

describe("to3mf", () => {
  it("writes the exact model XML", () => {
    const xml = [
      ...modelXmlChunks([{ name: "Tetra & co", mesh: tetra, transform: [5, 6.5, 0] }]),
    ].join("");
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
        " <resources>",
        '  <object id="1" type="model" name="Tetra &amp; co">',
        "   <mesh>",
        "    <vertices>",
        '     <vertex x="0" y="0" z="0"/>',
        '     <vertex x="10" y="0" z="0"/>',
        '     <vertex x="0" y="10" z="0"/>',
        '     <vertex x="0" y="0" z="10"/>',
        "    </vertices>",
        "    <triangles>",
        '     <triangle v1="0" v2="2" v3="1"/>',
        '     <triangle v1="0" v2="1" v3="3"/>',
        '     <triangle v1="0" v2="3" v3="2"/>',
        '     <triangle v1="1" v2="2" v3="3"/>',
        "    </triangles>",
        "   </mesh>",
        "  </object>",
        " </resources>",
        " <build>",
        '  <item objectid="1" transform="1 0 0 0 1 0 0 0 1 5 6.5 0"/>',
        " </build>",
        "</model>",
        "",
      ].join("\n"),
    );
  });

  it("packages content types, relationships and the model", () => {
    const files = unzipSync(to3mf([{ name: "a", mesh: tetra }]));
    expect(Object.keys(files).sort()).toEqual([
      "3D/3dmodel.model",
      "[Content_Types].xml",
      "_rels/.rels",
    ]);
    const types = strFromU8(files["[Content_Types].xml"] ?? new Uint8Array());
    expect(types).toContain(
      'Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"',
    );
    expect(types).toContain(
      'Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"',
    );
    const rels = strFromU8(files["_rels/.rels"] ?? new Uint8Array());
    expect(rels).toContain('Target="/3D/3dmodel.model"');
    expect(rels).toContain('Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"');
    const model = strFromU8(files["3D/3dmodel.model"] ?? new Uint8Array());
    expect(model).toContain('unit="millimeter"');
    expect(model).not.toContain("transform=");
  });

  it("re-parses with three's 3MFLoader: objects, names, counts", () => {
    const bytes = to3mf([
      { name: "01 Cards", mesh: cubeMesh(10), transform: [0, 0, 0] },
      { name: "02 Bits", mesh: tetra, transform: [20, 0, 0] },
    ]);
    const found = meshes(bytes);
    expect(found.map((m) => m.name).sort()).toEqual(["01 Cards", "02 Bits"]);
    const cube = found.find((m) => m.name === "01 Cards");
    const geometry = cube?.geometry as BufferGeometry;
    expect(geometry.index?.count ?? geometry.getAttribute("position").count).toBe(36);
    const bits = found.find((m) => m.name === "02 Bits");
    expect(bits?.matrixWorld.elements[12]).toBe(20);
  });

  it("is deterministic", () => {
    expect(to3mf([{ name: "a", mesh: tetra }])).toEqual(to3mf([{ name: "a", mesh: tetra }]));
  });

  it("handles many parts", () => {
    const parts = Array.from({ length: 200 }, (_, i) => ({ name: `part ${i}`, mesh: cubeMesh(5) }));
    const files = unzipSync(to3mf(parts));
    const model = strFromU8(files["3D/3dmodel.model"] ?? new Uint8Array());
    expect(model.match(/<object /g)).toHaveLength(200);
    expect(model.match(/<item /g)).toHaveLength(200);
  });
});
```

`src/export/roundtrip.test.ts`:

```ts
// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import type { ManifoldToplevel } from "manifold-3d";
import { loadManifold } from "../geometry/load";
import { buildTray } from "../geometry/tray";
import { GEO, cardUpright, lippedLower, scoopBulk } from "../geometry/test-specs";
import { signedVolume, topology } from "../geometry/test-mesh";
import type { Mesh } from "../geometry/types";
import { gridLayout, partFileName, to3mf, toStl, zipFiles } from "./index";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

// Minimal reader for the XML our writer emits.
function readModel(xml: string): { name: string; mesh: Mesh }[] {
  return xml
    .split("<object ")
    .slice(1)
    .map((chunk) => {
      const name = /name="([^"]*)"/.exec(chunk)?.[1] ?? "";
      const verts = [...chunk.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap(
        (v) => [v[1], v[2], v[3]].map(Number),
      );
      const tris = [...chunk.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap(
        (t) => [t[1], t[2], t[3]].map(Number),
      );
      return { name, mesh: { positions: new Float32Array(verts), indices: new Uint32Array(tris) } };
    });
}

describe("export round trip with real trays", () => {
  it("keeps every tray closed, outward-wound and the same size in the combined 3MF", () => {
    const specs = [cardUpright, scoopBulk, lippedLower];
    const built = specs.map((s) => buildTray(m, s, GEO));
    const offsets = gridLayout(specs, { x: 246, y: 246 }, 5);
    const bytes = to3mf(
      built.map((b, i) => ({
        name: specs[i]?.key ?? "",
        mesh: b.mesh,
        transform: offsets[i] ?? [0, 0, 0],
      })),
    );
    const model = strFromU8(unzipSync(bytes)["3D/3dmodel.model"] ?? new Uint8Array());
    expect(model).toContain('unit="millimeter"');
    const parsed = readModel(model);
    expect(parsed.map((p) => p.name)).toEqual(specs.map((s) => s.key));
    parsed.forEach((p, i) => {
      const original = built[i];
      expect(p.mesh.positions.length).toBe(original?.mesh.positions.length);
      expect(p.mesh.indices.length).toBe(original?.mesh.indices.length);
      expect(topology(p.mesh).closed).toBe(true);
      expect(signedVolume(p.mesh)).toBeGreaterThan(0);
      expect(Math.abs(signedVolume(p.mesh) - (original?.volumeMm3 ?? 0))).toBeLessThan(1);
    });
  });

  it("STL zip has one file per part with 84 + 50n bytes", () => {
    const b = buildTray(m, scoopBulk, GEO);
    const stl = toStl(b.mesh, "Bits");
    expect(stl.length).toBe(84 + 50 * (b.mesh.indices.length / 3));
    const name = partFileName(1, "Bits ×3", "stl");
    const files = unzipSync(zipFiles([{ name, data: stl }]));
    expect(Object.keys(files)).toEqual(["01-Bits-3.stl"]);
    expect(files[name]?.length).toBe(stl.length);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/export/threemf.test.ts src/export/roundtrip.test.ts`
Expected: FAIL — `Cannot find module './threemf'` and `Cannot find module './index'`.

- [ ] **Step 4: Write the implementation**

`src/export/threemf.ts`:

```ts
import { Zip, ZipDeflate, strToU8 } from "fflate";
import type { Mesh } from "../geometry/types";

export interface ThreeMfPart {
  name: string;
  mesh: Mesh;
  transform?: [number, number, number];
}

// Fixed timestamp (local time, as zip stores it) so equal inputs give
// byte-identical files.
const ZIP_TIME = new Date(2020, 0, 1, 0, 0, 0);

export const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;

export const RELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

// Fixed-point via toFixed (never locale-formatted), no trailing zeros, no "-0".
export function num(n: number): string {
  const s = Number(n.toFixed(4)).toString();
  return s === "-0" ? "0" : s;
}

// Characters XML 1.0 allows: tab, LF, CR, U+0020 and up except U+FFFE/U+FFFF.
function xmlAllowed(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c !== 0xfffe && c !== 0xffff);
}

// XML attribute value: drops characters XML 1.0 forbids, escapes markup.
export function xmlAttr(text: string): string {
  return [...text]
    .filter(xmlAllowed)
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function objectXml(id: number, part: ThreeMfPart): string {
  const lines = [
    `  <object id="${id}" type="model" name="${xmlAttr(part.name)}">`,
    "   <mesh>",
    "    <vertices>",
  ];
  const p = part.mesh.positions;
  for (let i = 0; i + 2 < p.length; i += 3) {
    lines.push(
      `     <vertex x="${num(p[i] ?? 0)}" y="${num(p[i + 1] ?? 0)}" z="${num(p[i + 2] ?? 0)}"/>`,
    );
  }
  lines.push("    </vertices>", "    <triangles>");
  const ix = part.mesh.indices;
  for (let t = 0; t + 2 < ix.length; t += 3) {
    lines.push(`     <triangle v1="${ix[t] ?? 0}" v2="${ix[t + 1] ?? 0}" v3="${ix[t + 2] ?? 0}"/>`);
  }
  lines.push("    </triangles>", "   </mesh>", "  </object>", "");
  return lines.join("\n");
}

// 3D/3dmodel.model in chunks (one per object), so a large export never holds
// the whole XML as one string. Triangles keep manifold's winding (CCW seen
// from outside); each object gets one build item with an optional translation.
export function* modelXmlChunks(parts: ThreeMfPart[]): Generator<string> {
  yield [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    " <resources>",
    "",
  ].join("\n");
  for (const [i, part] of parts.entries()) {
    yield objectXml(i + 1, part);
  }
  const items = parts.map((part, i) => {
    const t = part.transform;
    const transform = t
      ? ` transform="1 0 0 0 1 0 0 0 1 ${num(t[0])} ${num(t[1])} ${num(t[2])}"`
      : "";
    return `  <item objectid="${i + 1}"${transform}/>`;
  });
  yield [" </resources>", " <build>", ...items, " </build>", "</model>", ""].join("\n");
}

function addFile(zip: Zip, name: string, chunks: Iterable<string>): void {
  const file = new ZipDeflate(name, { level: 6 });
  file.mtime = ZIP_TIME;
  zip.add(file);
  for (const chunk of chunks) {
    file.push(strToU8(chunk));
  }
  file.push(new Uint8Array(0), true);
}

// 3MF package (OPC zip): [Content_Types].xml, _rels/.rels → /3D/3dmodel.model,
// and the model with unit="millimeter".
export function to3mf(parts: ThreeMfPart[]): Uint8Array {
  const out: Uint8Array[] = [];
  const errors: Error[] = [];
  const zip = new Zip((err, data) => {
    if (err) {
      errors.push(err);
      return;
    }
    out.push(data);
  });
  addFile(zip, "[Content_Types].xml", [CONTENT_TYPES_XML]);
  addFile(zip, "_rels/.rels", [RELS_XML]);
  addFile(zip, "3D/3dmodel.model", modelXmlChunks(parts));
  zip.end();
  const [error] = errors;
  if (error) {
    throw error;
  }
  const total = out.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of out) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
```

`src/export/index.ts`:

```ts
export { to3mf } from "./threemf";
export { toStl } from "./stl";
export { zipFiles } from "./zip";
export { partFileName } from "./names";
export { gridLayout } from "./grid";
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/export && npx tsc --noEmit`
Expected: PASS (25 tests in `src/export`), no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/export/threemf.ts src/export/index.ts src/export/threemf.test.ts src/export/roundtrip.test.ts
git commit -m "Add 3MF export"
```

---

### Task 9: Full verification

**Files:** none new (fix anything the checks report in the file that owns it).

**Interfaces:** none.

- [ ] **Step 1: Run the whole app test suite and build**

Run from `apps/insert-generator`: `npm run build`
Expected: `vitest run` passes (every test of plans 1 and 3, including the 90 added here), `tsc --noEmit` reports nothing, `vite build` succeeds.

- [ ] **Step 2: Run the repo gate**

Run from the repo root: `npm run verify`
Expected: lint (ESLint, Stylelint, html-validate), `prettier --check` and `build:all` all pass. If Prettier reports files from this plan, run `npx prettier --write <file>` from the root, re-run `npm run verify`, and commit:

```bash
git add -A apps/insert-generator
git commit -m "Format geometry and export code"
```

(Skip the commit when nothing changed.)

---

## Contract changes

Clarifications that other plans must follow (they pin down what §4 leaves open), then the amendments that the task reviews and the final review of this plan made to the roadmap §4 contracts (all are in the roadmap now; plans 4 and 5 carry them in their "Amendments from plans 1–3" sections):

1. **Finger pocket semantics (plan 2 `realizeTray`).** In `{ type: "fingerPocket", side, at, width, reach, depth }`: the compartment rectangle includes a band `reach` deep along `side` (this is the "reach included" in `CompartmentReq.minW/minD`); geometry leaves that band solid up to the rim except for the slot. `at` is the slot centre in tray-local coordinates along the side (x for front/back, y for left/right). `depth` is measured down from the rim (`h`); geometry clamps it to `h − floorZ`. The slot may extend past its compartment along the side (crossing dividers), but `at ± width/2` must stay at least the (lipped) outer wall away from the outer faces, otherwise `buildTray` throws `TraySpecError` — so for decks narrower than `width` at the ends of a strip, sizing must shift `at` inward.
2. **Spec validity (plans 2 and 4).** `planTray`/`buildTray` reject (`TraySpecError`) compartments less than 0.8 mm apart (thin dividers, touching or overlapping ones), compartments closer to an outer face than `max(wall, lip.thickness + lip.ledge)` (lipped) or `wall`, `floorZ` outside (0, h), and everything else listed in roadmap §4.6. Nothing thinner than 0.8 mm is ever built; `checkPrintability` is a test-time verifier of that, not run in production.
3. **Corner reliefs and corner radius are adjusted in geometry.** Relief radius shrinks to keep 0.8 mm walls; the outer corner radius may be smaller than `settings.cornerRadius` for trays with thin walls. Outer dimensions never change.
4. **`UnsupportedFeatureError`** has a `feature: string` property and a `(feature: string)` constructor (additive to `class UnsupportedFeatureError extends Error {}`).
5. **Imports for bundling (plans 4 and 5).** Import `GEOMETRY_VERSION` and `isOlderGeometryLine` from `src/geometry/version` and geometry types from `src/geometry/types` in main-thread and layout code; only the worker imports `src/geometry/index`/`tray`. The root ESLint config enforces it (roadmap §4.6, §4.9), and forbids test-only helpers (`**/test-*`) in production code.
6. **Test dependencies.** Task 8 installs `three`, `@types/three` and `jsdom` at the roadmap §2 ranges if plan 1 did not.
7. **Known values (roadmap §4.3).** `src/geometry/types.ts` exports `KNOWN_PARTS`, `KNOWN_COMPARTMENT_KINDS` and `KNOWN_FEATURE_TYPES` (readonly arrays). `planTray` validates against them, and plan 5's `app/support.ts` imports them instead of keeping its own copies. A new part, kind or feature type is added there once.
8. **`TraySpecError`** (`geometry/errors.ts`, exported from `geometry/index.ts`): a `RangeError` named `"TraySpecError"`, thrown for every spec planTray/buildTray reject, so a runtime `RangeError` (the WASM heap) is never taken for a verdict on the spec.
9. **Worker protocol and client.** The `error` response gains `name?` and `feature?` (the thrown error's name, and the feature of an `UnsupportedFeatureError`). The client rejects every failed build with `GeometryBuildError` (`name` = the reason: `TraySpecError`, `UnsupportedFeatureError`, `AbortError`, `TimeoutError`, `WorkerError`, `WorkerRestartedError`; `feature`), defined in `client.ts` so the main thread never imports the kernel. `build(spec, settings, signal?)` takes an `AbortSignal` (a cancel reaches the worker; a build not started yet is answered with `AbortError`). `BUILD_TIMEOUT_MS` (30 000, queue time included) bounds a build; a timeout or kernel failure replaces the worker, and builds that waited for it reject with `WorkerRestartedError`. Callers retry that once and mark a spec failing twice as failed (roadmap §4.3).
10. **Settings validity.** `model/validate.ts` exports `settingsValid(s)` (it replaced plan 2's `settingsInRange`): every `SETTING_RANGES` entry plus the cross-field rules `field.bottomChamfer` (bottomChamfer ≤ `maxBottomChamfer(s)`) and `field.lipBearing` (with the lip on, `effectiveBottomChamfer(s, 1) < lip.ledge − 2·effective(s).lipPlay`, so upper trays rest on the ledge). `size()` returns nothing for settings that fail it.
11. **Raised minimums.** `wall` and `lip.thickness` are at least `MIN_WALL_MM` = 0.9 mm (`SETTING_RANGES`, `wallFor`, planTray), `lip.height` at least 1 mm; the lip chamfer is `min(0.6, lip.thickness − 0.6)`, so its flat top stays ≥ 0.6 mm.
12. **Finger slots (plan 2).** Slots are never narrower than `min(MIN_SLOT_WIDTH, fingerPocket.width)` (`MIN_SLOT_WIDTH` = 15 mm); `realizeTray` throws `SlotFitError` (a `RangeError` named `"SlotFitError"`, exported from `sizing/index.ts`) when a part's slots fit at no footprint `minOuter` tries. `minOuter` widens a part, by up to `fingerPocket.width`, until its slots fit, so a part realizes at `minOuter` exactly when it realizes at some outer; `size()` drops variants that fail at `minOuter` (unlipped, level 0), with a `sizing.noFingerSlot` warning when none is left. Layout treats a `SlotFitError` as an infeasible (part, lipped, level) and caches it (roadmap §4.2, §4.7).
13. **New `model/` exports** (roadmap §4.5): `model/settings.ts` exports `MIN_FEATURE_MM`, `CORNER_MARGIN`, `MIN_WALL_MM`, `UPPER_MIN_CHAMFER`, `SPEC_TOLERANCE`, `FLOAT_EPSILON`, `SLOT_CONTENT_OVERLAP`, `MIN_SLOT_WIDTH`, `MIN_POCKET_CONTENT`, `effectiveBottomChamfer`, `chamferMinimums`, `maxBottomChamfer`, `maxCornerRadius`, `maxChannelSpacing`, `maxWellFaceOffset` and `cutRidgeWidth`; `model/slot-rules.ts` the finger slot clearance predicates shared by sizing and planTray; `model/validate.ts` `SETTING_RANGES`, `settingsValid` and the `field.bottomChamfer` and `field.lipBearing` codes.
14. **`isOlderGeometryLine(stored)`** (`geometry/version.ts`): spec §9's line rule (pre-1.0 each `0.MINOR` is a major line) for plan 5's "reprint the whole insert" warning. Making planTray stricter, so that stored specs it accepted before are rejected, is a breaking geometry change.
