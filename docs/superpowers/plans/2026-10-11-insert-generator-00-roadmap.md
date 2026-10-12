# Board Game Insert Generator — Implementation Roadmap

**Spec:** [`docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md`](../specs/2026-10-11-boardgame-insert-generator-design.md)

The spec covers five subsystems, so the work is split into five plans. Each one
produces working, tested software on its own. This roadmap holds what every
plan shares: order, file layout, global constraints, and the **cross-plan
contracts** (exact TypeScript). A plan may add internal types and helpers, but
it must not change or rename anything in §4 below. If a plan needs a contract
change, it must say so in a "Contract changes" section at its end.

## 1. Plans and order

| #   | Plan                                                                   | Depends on | Delivers                                                                                                        |
| --- | ---------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | [Foundation](2026-10-11-insert-generator-01-foundation.md)             | —          | App scaffold, tooling, model types, settings, validation, schema versioning, hashing, sharing, project store    |
| 2   | [Sizing](2026-10-11-insert-generator-02-sizing.md)                     | 1          | `size()` (component group → `TrayRequirement`s with variants) and `realizeTray()` (outer size → compartments)   |
| 3   | [Geometry & export](2026-10-11-insert-generator-03-geometry-export.md) | 1          | `TraySpec` → manifold mesh, printability checks, 3MF/STL/zip writers, geometry worker                           |
| 4   | [Layout engine](2026-10-11-insert-generator-04-layout.md)              | 1, 2       | `optimize()`: guillotine tree, fill, score, simulated annealing, locks, warnings, summary, layout worker        |
| 5   | [UI](2026-10-11-insert-generator-05-ui.md)                             | 1–4        | Inputs (simple/advanced), plan view, 3D viewer, export, assembly page, persistence wiring, licenses, smoke test |

Plans 2 and 3 can run in parallel after plan 1. Each plan ends with
`npm run verify` passing from the repo root, and lands as its own PR.

## 2. Global constraints (apply to every task of every plan)

- App lives in ``. Built app: `package.json`, `npm run build` outputs `dist/`, `vite.config.ts` sets `base: "./"`, `app.json` has `{ title, description }`.
- Node 22 (`.nvmrc`). Dependency versions (exact ranges):
  `vite ^6.4.0`, `vitest ^5.0.3`, `typescript ^6.0.3`, `preact ^10.29.8`,
  `@preact/signals ^2.11.3`, `@preact/preset-vite ^2.10.6`, `manifold-3d ^3.5.4`
  (single-threaded build only), `three ^0.186.1`, `@types/three ^0.186.0`,
  `fflate ^0.8.3`, `fast-check ^4.10.2`, `jsdom ^30.1.2`,
  `@testing-library/preact ^3.2.4`, `rollup-plugin-license ^3.7.1`,
  `@types/node ^22.0.0` (type-only, for `tsconfig.node.json`). No copyleft dependencies.
- TypeScript strictness from `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` → use `import type`). App `tsconfig.json` (covers `src/`, no Node types): `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`. `tsconfig.node.json` covers the Node-side config files (`vite.config.ts`, later `licenses.config.ts`) with `"types": ["node"]`.
- Lint: root `eslint.config.mjs` (non-type-checked `strict` + `stylistic`, `curly: all`, `eqeqeq`, `prefer-template`, `no-param-reassign`, `no-console` except warn/error). Prettier: `printWidth` from `.prettierrc.json`. Stylelint for CSS. html-validate for `index.html`.
- The app's `build` script: `vitest run && tsc --noEmit && tsc --noEmit -p tsconfig.node.json && vite build` (plan 5 appends `&& node scripts/smoke-dist.mjs dist`); `npm run typecheck` runs both `tsc` checks. Tests run in CI via `npm run verify` (lint, format check, build).
- `Math.random` is banned in `src/layout/**` (root ESLint rule, plan 1).
- All lengths are millimetres. Inside `layout/`, lengths are integer 0.01 mm units (`Units` helpers, plan 4); `TraySpec` stores mm rounded to 0.01.
- Versions start at app `0.1.0`, `SCHEMA_VERSION = "0.1.0"`, `GEOMETRY_VERSION = "0.1.0"`. Pre-1.0 makes no compatibility promise (spec §9). The finger channels (§4.6 wall cutouts) made both `0.1.1`: additive, so files and layouts of `0.1.0` stay on the same line.
- Never use `localStorage` without `try/catch`. No network calls at runtime.
- Commits: plain imperative messages (e.g. `Add card sizing`). **No `Co-Authored-By` or any trailer.** Commit after every task.
- Run tests and repo checks from the repo root: `npx vitest run <path>`, `npm run lint`, `npm run format:check`, `npm run verify`.

## 3. File layout

```

  package.json  tsconfig.json  tsconfig.node.json  vite.config.ts  index.html  app.json  README.md
  src/
    main.tsx                     # mounts <App/>                       (plan 1 stub, plan 5)
    app/                         # App shell, state, wiring             (plan 5)
    model/                       # contracts + pure model logic         (plan 1)
      types.ts                   # §4.1 — the shared types
      version.ts                 # SCHEMA_VERSION, APP_VERSION, semver helpers
      presets.ts                 # card sizes, sleeves, bed presets
      settings.ts                # DEFAULT_SETTINGS, simple-mode mapping, effective clearances
      defaults.ts                # newProject(), newComponent(kind)
      numbers.ts                 # parseNumber() — decimal comma or point
      validate.ts                # validateProject() → Notice[]; bounds
      schema.ts                  # parseProject(), serializeProject(), migrations
      hash.ts                    # inputsHash()
      ids.ts                     # newId()
    share/                       # URL hash codec, project store, file I/O   (plan 1)
    sizing/                      # (plan 2)
      types.ts                   # §4.2
    geometry/                    # (plan 3)
      types.ts                   # §4.3
      version.ts                 # GEOMETRY_VERSION
    export/                      # 3MF / STL / zip (plan 3)
    layout/                      # (plan 4)
      types.ts                   # §4.4
    viewer/  plan/  instructions/  ui/                                  (plan 5)
  test/fixtures/                 # synthetic projects (plans 1–4); real games added later (spec §12)
```

Tests sit next to the code as `*.test.ts(x)`.

## 4. Cross-plan contracts

### 4.1 `src/model/types.ts` (plan 1)

These are the spec §5 types, verbatim, plus the small shared helper types below them.

```ts
export type Access = "often" | "sometimes" | "setup";
export type Side = "front" | "back" | "left" | "right"; // tray-local: front = −Y, back = +Y, left = −X, right = +X

export interface Project {
  schemaVersion: string;
  createdWith: string;
  id: string;
  name: string;
  box: Box;
  printer: Printer;
  settings: Settings;
  components: Component[];
  locks: Lock[];
  layout?: StoredLayout;
}

export interface Box {
  innerWidth: number;
  innerDepth: number;
  innerHeight: number;
  headroom: number;
  headroomCoverage: "full" | "partial";
  storedOnSide: boolean;
}

export interface Printer {
  bedX: number;
  bedY: number;
  bedZ: number;
  bedMargin: number;
  layerHeight: number;
}

export type Component =
  CardsComponent | BulkComponent | TilesComponent | MinisComponent | CustomComponent;
export type ComponentKind = Component["kind"];

export interface ComponentBase {
  id: string;
  name: string;
  access: Access;
  groupId?: string;
  perPlayer?: { players: number };
  clearance?: number;
  fingerCuts?: boolean; // absent: on, but off for bulk and minis stored as bulk (fingerCutsOn)
  curvedFloor?: boolean; // absent: on for bulk and minis stored as bulk; never cards or tiles (curvedFloorOn)
  cornerReliefs?: boolean; // absent: on for tiles and custom (cornerReliefsOn)
}

export type Sleeve = "none" | "standard" | "premium" | { w: number; h: number; thickness: number };

export interface CardsComponent extends ComponentBase {
  kind: "cards";
  shortSide: number;
  longSide: number;
  decks: { name: string; count: number }[];
  sleeve: Sleeve;
  thickness: { mode: "preset" } | { mode: "measured"; cards: number; stackMm: number };
  storage: "upright-long" | "upright-short" | "flat" | "auto";
}

export type BulkItem =
  | { name: string; count: number; w: number; d: number; h: number }
  | { name: string; volumeMl: number };

export interface BulkComponent extends ComponentBase {
  kind: "bulk";
  items: BulkItem[];
}

export type TileShape =
  | { type: "rect"; w: number; d: number }
  | { type: "hex"; flatToFlat: number; orientation: "flat" | "pointy" };

export interface TilesComponent extends ComponentBase {
  kind: "tiles";
  shape: TileShape;
  thickness: number;
  count: number;
  storage: "flat" | "upright" | "auto";
}

export interface MinisComponent extends ComponentBase {
  kind: "minis";
  figures: { name: string; w: number; d: number; h: number; count: number }[];
  storage: "pockets" | "bulk";
}

export interface CustomComponent extends ComponentBase {
  kind: "custom";
  w: number;
  d: number;
  h: number;
  count: number;
}

export type Lock =
  | { kind: "position"; trayKey: string; path: string; rotated: boolean }
  | { kind: "size"; trayKey: string; w: number; d: number; h: number }
  | { kind: "stack"; trayKeys: string[] };

export interface Settings {
  wall: number;
  floor: number;
  divider: number;
  fit: number;
  cardClearance: number;
  cardStackClearance: number;
  cardStackClearancePct: number;
  cardThickness: number;
  pieceClearance: number;
  boxClearance: number;
  trayGap: number;
  bottomChamfer: number;
  cornerRadius: number;
  scoopRadius: number;
  fingerPocket: {
    width: number;
    floorNotch: number;
    wallRoom: number;
    dividerRoom: number;
  };
  lip: { enabled: boolean; height: number; thickness: number; ledge: number; play: number };
  topPressFit: number;
  packingFactor: number;
  leftover: "spare" | "solid";
}

export interface StoredLayout {
  createdWith: string;
  geometryVersion: string;
  inputsHash: string;
  seed: number;
  iterations: number;
  capped: boolean;
  trays: TraySpec[];
}

export type FeatureSpec =
  | {
      type: "wallCutout";
      side: Side;
      at: number;
      width: number;
      depth: number;
      floorNotch: number;
    }
  | { type: "spacerNotch"; axis: "x" | "y"; at: number; width: number; depth: number }
  | { type: "scoop"; side: Side; r: number }
  | { type: "cornerRelief"; d: number };

export interface CompartmentSpec {
  x: number; // inner, tray-local, min corner; origin = tray outer min corner
  y: number;
  w: number;
  d: number;
  floorZ: number; // tray-local; = settings.floor unless raised
  kind: "well" | "scoop" | "pocket" | "spare";
  contents: string;
  features: FeatureSpec[];
}

export interface TraySpec {
  key: string;
  part: "tray" | "leftover" | "spacer";
  path: string;
  stack: number;
  level: number;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rotated: boolean;
  wall: number;
  floor: number;
  lip: boolean; // true when another tray is stacked on this one and settings.lip.enabled
  solid: boolean;
  compartments: CompartmentSpec[];
  features?: FeatureSpec[]; // the part's own: a card spacer's notch ("spacerNotch"); absent otherwise
}

// Shared helpers
export interface Notice {
  level: "info" | "warning" | "error";
  code: string; // stable machine code, e.g. "lock.dropped", "schema.newerMinor"
  message: string; // human-readable, English
  path?: string; // JSON-pointer-like field path for field-level validation, e.g. "/components/2/decks/0/count"
}

export interface ForeignData {
  // Unknown components from a newer-minor file, kept verbatim and re-inserted on save
  components: { index: number; raw: unknown }[];
  // Unknown enum values inside box/settings/printer/locks, kept verbatim and written back on save
  values?: { path: string; raw: unknown }[]; // path: JSON-pointer, e.g. "/settings/leftover"
}

export type ParseResult =
  | { ok: true; project: Project; foreign: ForeignData; notices: Notice[] }
  | { ok: false; error: string };
```

`TraySpec` conventions (all plans):

- `x, y, z` are the outer min corner in box coordinates (origin at the box's inner front-left floor corner plus `boxClearance`). `w` is along X and `d` along Y **after** rotation, so `rotated` is informational for labels. Compartment coordinates are already in the rotated frame.
- `h` excludes the lip. With `lip: true` the geometry adds the lip from `settings.lip` (spec §6.1). The lipped outer wall is `max(wall, lip.thickness + lip.ledge)`. `wall` stores the base wall; compartments already account for the lipped wall.
- Upper trays (`level > 0`) use bottom chamfer `max(settings.bottomChamfer, 0.5)`.
- Spacers: `part: "spacer"`, `path: ""`, `solid: true`, `compartments: []`, `x/y/z` = its position inside the well (for the 3D view). A spacer standing in a well its deck's finger channel crosses has `features: [{ type: "spacerNotch", … }]` (§4.6); other parts have no `features`.
- Leftovers: `part: "leftover"`. `solid: true` → closed block. Otherwise one `spare` compartment.

### 4.2 `src/sizing/types.ts` (plan 2)

```ts
import type { Access, Side, CompartmentSpec, TraySpec } from "../model/types";

export interface FeatureReq {
  type: "wallCutout" | "scoop" | "cornerRelief";
  side?: Side; // wallCutout, scoop
  depthFraction?: number; // wallCutout: 1/2 (of the shallowest well) or 1 (to its floor)
  floorNotch?: boolean; // wallCutout: notch the floor (flat cards and tiles)
}

export interface CompartmentReq {
  componentId: string;
  contents: string; // label, e.g. "Main deck ×52"
  kind: "well" | "scoop" | "pocket";
  minW: number; // inner, mm: content + clearance (wall cutouts need no room of their own)
  minD: number;
  minH: number; // content height (depth needed from the compartment floor)
  elastic: { w: boolean; d: boolean; h: boolean };
  minVolume?: number; // mm³; bulk: w·d·h must stay ≥ this
  maxHRatio?: number; // bulk: h ≤ maxHRatio × min(w, d)
  features: FeatureReq[];
  spacerAxis?: "w" | "d"; // upright cards/tiles: spare length on this axis → spacer (≥ 5 mm) or thicker dividers
}

export interface TrayPartReq {
  trayKey: string; // "<groupId ?? componentId>:p<player>:<part>" ("p0" without perPlayer, "pall" for combined)
  arrangement: "strip" | "rows2";
  compartments: CompartmentReq[]; // strip order; rows2: first half row 0, rest row 1; in each row
  // the compartments asking for a left or right cutout come first (cutsFirst)
  rotatable: boolean;
}

export interface TrayVariant {
  id: string; // stable, e.g. "upright-long|strip|split1"
  parts: TrayPartReq[]; // > 1 when the variant splits across trays
}

export interface TrayRequirement {
  key: string; // "<groupId ?? componentId>". One requirement per component or group; perPlayer and
  // splits are expressed as variants with several parts (e.g. "separate": parts p0..pN-1;
  // "combined": one part keyed "<key>:pall:0" with one compartment per player).
  // Layout places exactly one variant per requirement, and every part of it.
  componentIds: string[];
  access: Access; // most frequent of its members
  loose: boolean; // contains bulk, minis-bulk, tiles or a member in its bulk fallback (coverage rule)
  variants: TrayVariant[]; // 1..8, preferred first, fixed order
}

export interface OuterSize {
  w: number;
  d: number;
  h: number;
}

export interface RealizeOptions {
  lipped: boolean; // this tray carries a lip (has a tray stacked on it)
  level: number;
}

export interface RealizedTray {
  wall: number; // base wall used
  compartments: CompartmentSpec[];
  spacers: TraySpec[]; // positioned in tray-local coords (x, y, z relative to tray min corner); layout translates them
}
```

Functions exported from `src/sizing/index.ts`:

```ts
export function size(
  components: Component[],
  settings: Settings,
): { requirements: TrayRequirement[]; notices: Notice[] };
export function minOuter(part: TrayPartReq, settings: Settings, opts: RealizeOptions): OuterSize;
export function realizeTray(
  part: TrayPartReq,
  outer: OuterSize,
  settings: Settings,
  opts: RealizeOptions,
): RealizedTray;
```

- `size` groups components by `groupId` and expands `perPlayer`. It assumes a valid project: invalid components and out-of-range settings (`settingsValid` false) yield nothing, without notices of their own, because `validateProject` already reports them (plans 4 and 5 never optimize while it has errors). Its own notices are sizing notices: warnings such as an implausibly thin measured card thickness or a component left out without a finger cut, and the info notice of a component in its bulk fallback. Every requirement it returns has 1..8 variants.
- `size` realizes every part of every variant at its `minOuter` with all four options (unlipped and lipped, level 0 and 1) and drops the variants where `realizeTray` throws `CutFitError` (`sizing/errors.ts`; sizing-internal, not exported from `sizing/index.ts`): a compartment asking for a finger cut (its component's `fingerCuts` on) got no wall cutout on either axis (§4.7); one with finger cuts off never does this. Whether a part gets its cuts depends only on its compartments and their order, so **every part `size` returns realizes at every option and every outer ≥ its `minOuter`**, and layout needs no realizability handling. The remaining variants keep their rank order. **Bulk fallback** (spec §7.1): when none remains, every tiles, minis (`storage: "pockets"`) and custom member named by some variant's `CutFitError` gets `bulkFallback(c, s)` (`sizing/fallback.ts`) as its options instead: its pieces loose in scoop bins, `binOptions` (`sizing/bulk.ts`, shared with minis bulk storage: `bulk-shallow` and `bulk-deep`, one `bulkCompartment` per piece line; tiles count × `flatFootprint` × thickness, custom count × w × d × h, minis its figures) with `binTogglesOf(c)` (`model/defaults.ts`: each toggle the component turned away from its kind's default, else bulk's: no finger cuts, a curved floor and no corner reliefs; a toggle set to its kind's default counts as unset, review 3, I1); the requirement is rebuilt (`loose` true) and its variants checked again. Each binned member gets an info `sizing.noFingerSlot` at `/components/<i>`, e.g. "Pip: no tray arrangement leaves room for a finger cutout of at least 10 mm by Pip ×1 with 3 mm of wall beside it, so it is stored loose in a bin with a curved floor instead.", naming what the member's first bin in the preferred variant has (`Notice` has no params: the level tells the fallback from the drop). A requirement still without variants (a stuck card member: cards have no fallback) is left out, with a warning `sizing.noFingerSlot` at `/components/<i>` (the first member left without a cut) naming that component and the uncut contents of the preferred variant, e.g. "Cards: … by Main ×52 with 3 mm of wall beside it, so it is left out. Try another storage." (a stuck bulk member, which has no other storage: "Turn its finger cuts off."; a group: "so the group "<key>" is left out"; the width is `min(MIN_CUT_MM, fingerPocket.width)`). A compartment with room for a cut of that width and a `POST_MM` post on each side on neither axis (a well under 16 mm both ways at the defaults, such as a 1 mm tile at a 0.9 mm wall and chamfer or a tiny minis pocket, or one whose wider sides face no free wall) does this; small flat tiles so lose their flat variants (§4.7), and go in a bin when no other variant is left. Finger access is never left out silently (review 1, I2).
- `CompartmentReq.minW`, `minD` and `minH` are whole 0.01 mm (rounded up): content plus clearance.
- `minOuter` returns the smallest outer box that holds the part: its minimum layout (`minLayoutOf`, memoized per part, settings and options). `h` = floor + max compartment `minH`, raised to the bottom-chamfer and upper-tray minimums (§4.6, §4.7); `w` and `d` include walls, dividers and the lipped wall, `fingerPocket.wallRoom` on each outer wall and `fingerPocket.dividerRoom` on each divider a placed wall cutout passes through (`settleRoom`, §4.7), and are raised to the bottom-chamfer minimum. Wall cutouts take no room of their own: a well too small for one is refused, not widened.
- `realizeTray` spreads slack in `outer` over the compartments (elastic axes first, then dividers/walls inward up to `min(2 × setting, 4)`, with upright card/tile stack slack becoming a spacer first when ≥ 5 mm (§4.7), otherwise thicker dividers/walls, then an extra `spare` compartment), after giving the cut walls and dividers their finger room, then places the wall cutouts (§4.7). It raises floors so every compartment top is at the rim (`floorZ = h − compartment content depth`, never below `settings.floor`). It throws a plain `RangeError` if `outer` is smaller than `minOuter` on any axis (a programming error), `CutFitError` if a compartment asking for a finger cut gets no wall cutout (never for a part `size` returned), and a plain `Error` for a broken internal invariant (a bug).

### 4.3 `src/geometry/types.ts` (plan 3)

```ts
import type { CompartmentSpec, FeatureSpec, Settings, TraySpec } from "../model/types";

// Values this geometry version can build; buildTray throws UnsupportedFeatureError for others
// (newer-minor files, spec §9). Plan 5 imports these lists instead of copying them.
export const KNOWN_PARTS: readonly TraySpec["part"][] = ["tray", "leftover", "spacer"];
export const KNOWN_COMPARTMENT_KINDS: readonly CompartmentSpec["kind"][] = [
  "well",
  "scoop",
  "pocket",
  "spare",
];
export const KNOWN_FEATURE_TYPES: readonly FeatureSpec["type"][] = [
  "wallCutout",
  "spacerNotch",
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
  | {
      type: "error";
      requestId: number;
      key: string;
      message: string;
      name?: string; // the thrown error's name; absent for a non-Error throw
      feature?: string; // set with name "UnsupportedFeatureError"
    };
```

A "cancel" for a build that has not started is answered with an error response named `"AbortError"` (message `"cancelled"`). The worker queues builds and runs one per macrotask, so a cancel is seen before a queued build starts.

Exports:

```ts
// src/geometry/index.ts
export function loadManifold(wasmUrl?: string): Promise<ManifoldToplevel>;
export function buildTray(
  m: ManifoldToplevel,
  spec: TraySpec,
  settings: Settings,
): { mesh: Mesh; volumeMm3: number };
export function checkPrintability(mesh: Mesh): PrintabilityReport;
export class UnsupportedFeatureError extends Error {}
export class TraySpecError extends RangeError {} // name "TraySpecError": every spec rejection of planTray/buildTray
export const GEOMETRY_VERSION: string; // "0.2.0": the wall cutout for every finger cut; the finger pocket is gone (breaking)
// src/geometry/version.ts (pure: main-thread code may import it)
export function isOlderGeometryLine(stored: string): boolean; // spec §9 line rule, see below
// src/geometry/client.ts
export interface GeometryClient {
  // Rejects with a GeometryBuildError when the build fails, the signal aborts it, or it takes
  // longer than BUILD_TIMEOUT_MS (counted from the call, queue time included).
  build(
    spec: TraySpec,
    settings: Settings,
    signal?: AbortSignal,
  ): Promise<{ mesh: Mesh; volumeMm3: number }>;
  // Terminal: stops the worker and rejects pending and later builds.
  dispose(): void;
}
export function createGeometryClient(): GeometryClient;
export const BUILD_TIMEOUT_MS: number; // 30000
// What every failed build rejects with (disposed clients reject with a plain Error). After any
// failure other than TraySpecError, UnsupportedFeatureError or AbortError the client replaces its worker.
// `name` is the reason: the worker's error name ("TraySpecError", "UnsupportedFeatureError"
// with `feature`), or the client's own: "AbortError", "TimeoutError", "WorkerError",
// "WorkerRestartedError". Defined in client.ts so the main thread never imports the kernel.
export class GeometryBuildError extends Error {
  readonly feature: string | undefined;
}
// src/export/index.ts
export function to3mf(
  parts: { name: string; mesh: Mesh; transform?: [number, number, number] }[],
): Uint8Array;
export function toStl(mesh: Mesh, name: string): Uint8Array; // binary STL
export function zipFiles(files: { name: string; data: Uint8Array }[]): Uint8Array;
export function partFileName(index: number, contents: string, ext: "3mf" | "stl"): string; // "NN-<sanitized>.ext"
export function gridLayout(
  sizes: { w: number; d: number }[],
  bed: { x: number; y: number },
  gap: number,
): [number, number, number][];
```

Mesh frame: tray-local, origin at the outer min corner, z = 0 at the bottom.

- `isOlderGeometryLine(stored)` is true when `stored` belongs to an older compatibility line than `GEOMETRY_VERSION`: an older MAJOR, or pre-1.0 an older `0.MINOR` (each `0.MINOR` is a major line, spec §9). False for the same or a newer line and for an unreadable version. Plan 5 uses it for the "reprint the whole insert" warning.
- **Callers of `build` (plan 5 `meshes.ts`, binding).** Tell failures apart by `GeometryBuildError.name`, never by `instanceof RangeError`: `"TraySpecError"` (the spec is invalid; a bug upstream, show it, don't retry), `"UnsupportedFeatureError"` (a newer-minor tray: shown, not built or exported), `"AbortError"` (you cancelled it), `"TimeoutError"`, `"WorkerError"` and `"WorkerRestartedError"`. Retry a build that failed with `"WorkerRestartedError"` (the worker was replaced while it waited) or `"WorkerError"` (the worker crashed, maybe while another build ran) once; a spec that fails twice in a row is marked failed and not retried again, so a spec that kills the worker cannot livelock the queue; a success clears its count. Pass an `AbortSignal` and abort builds whose result is no longer wanted. Don't fire an unbounded number of builds at once: the timeout counts queue time, so keep a bounded number in flight (or rely on the worker's one-at-a-time queue with few enough outstanding builds that the last finishes within `BUILD_TIMEOUT_MS`). Plan 5's smoke test bulk-builds every tray of the optimized fixture layouts to check `BUILD_TIMEOUT_MS` against real build times.

### 4.4 `src/layout/types.ts` (plan 4)

```ts
import type { Box, Printer, Settings, Lock, StoredLayout, TraySpec, Notice } from "../model/types";
import type { TrayRequirement } from "../sizing/types";

export interface LayoutInput {
  requirements: TrayRequirement[];
  box: Box;
  printer: Printer;
  settings: Settings;
  locks: Lock[];
  inputsHash: string;
  appVersion: string;
}

export interface LayoutSummary {
  fillPct: number; // tray volume (outer) / usable box volume × 100
  trayCount: number; // printed parts excluding spacers
  stackCount: number;
  filamentG: number; // upper bound: solid volume × 1.24 g/cm³
  playX: number; // nominal lateral play, mm
  playY: number;
}

export interface LayoutResult {
  layout: StoredLayout | null; // best feasible; null if none
  bestAttempt: { trays: TraySpec[]; shortfall: { x: number; y: number; z: number } } | null;
  summary: LayoutSummary | null;
  notices: Notice[]; // warnings (coverage, play, lip off, capped, bed, doesNotFit) + dropped locks
}

export type LayoutRequest =
  | {
      type: "run";
      runId: number;
      input: LayoutInput;
      seed: number;
      iterations: number; // this run's budget (§4.8)
      warmStart?: StoredLayout;
    }
  | { type: "cancel"; runId: number };

export type LayoutResponse =
  // done ≤ total, and done / total never goes backwards within a run (plan 4)
  | { type: "progress"; runId: number; done: number; total: number; best: LayoutResult }
  | { type: "done"; runId: number; result: LayoutResult }
  | { type: "error"; runId: number; message: string };
```

Exports:

```ts
// src/layout/index.ts
export function optimize(
  input: LayoutInput,
  seed: number,
  iterations: number, // this run's budget; StoredLayout.iterations is cumulative (§4.8)
  opts?: {
    warmStart?: StoredLayout;
    onProgress?: (done: number, best: LayoutResult) => void;
    timeCapMs?: number;
    shouldCancel?: () => boolean;
  },
): LayoutResult;
export function summarize(
  trays: TraySpec[],
  input: Pick<LayoutInput, "box" | "settings">,
): LayoutSummary;
export const DEFAULT_ITERATIONS: number; // calibrated ≈ 3 s, plan 4
// src/layout/client.ts
export function createLayoutClient(): {
  run(
    input: LayoutInput,
    seed: number,
    iterations: number, // this run's budget (§4.8)
    warmStart: StoredLayout | undefined,
    onProgress: (done: number, total: number, best: LayoutResult) => void,
  ): Promise<LayoutResult>;
  cancel(): void;
  dispose(): void;
};
```

### 4.5 Model exports used by other plans (plan 1)

```ts
// model/version.ts
export const SCHEMA_VERSION: string; // "0.1.1": 0.1.0 plus fingerPocket.floorNotch, .wallRoom, .dividerRoom and the component toggles, less fingerPocket.reach
export const APP_VERSION: string; // from package.json via Vite define __APP_VERSION__
export function parseSemver(v: string): { major: number; minor: number; patch: number } | null;
// model/settings.ts
export const DEFAULT_SETTINGS: Settings;
export type WallChoice = "thin" | "normal" | "sturdy";
export type FitChoice = "tight" | "normal" | "loose";
export function applyWallChoice(s: Settings, c: WallChoice): Settings;
export function applyFitChoice(s: Settings, c: FitChoice): Settings;
export function wallChoiceOf(s: Settings): WallChoice | "custom";
export function fitChoiceOf(s: Settings): FitChoice | "custom";
// Simple mode's "Extra finger room in the box" toggle (spec §5, §6.1): on writes
// fingerPocket.wallRoom = FINGER_ROOM_MM and .dividerRoom = FINGER_DIVIDER_ROOM_MM, off writes 0
// and 0; fingerRoomOf is "custom" for any other pair.
export const FINGER_ROOM_MM: number; // 10
export const FINGER_DIVIDER_ROOM_MM: number; // 5
export function applyFingerRoom(s: Settings, on: boolean): Settings;
export function fingerRoomOf(s: Settings): boolean | "custom";
export interface Effective {
  cardClearance: number;
  cardStackClearance: number;
  pieceClearance: number;
  boxClearance: number;
  trayGap: number;
  lipPlay: number;
}
export function effective(s: Settings): Effective; // base × fit
export function topPlane(box: Box, s: Settings): number;
// Geometry limits shared by sizing, geometry and layout (spec §6.1, §4.6 below):
export const MIN_FEATURE_MM: number; // 0.8: dividers, floors, every cut's material
export const CORNER_MARGIN: number; // 0.1: what the outer corner arc polygon may lose
export const MIN_WALL_MM: number; // 0.9 = MIN_FEATURE_MM + CORNER_MARGIN: walls and lips
export const UPPER_MIN_CHAMFER: number; // 0.5: bottom chamfer of trays above level 0
export const SPEC_TOLERANCE: number; // 0.005: half the TraySpec grid, forgiven by planTray
export const FLOAT_EPSILON: number; // 1e-9: float noise, forgiven where no grid applies
export const POST_MM: number; // 3: full-height post beside every wall cutout's sides
export const MIN_CUT_MM: number; // 10: narrowest wall cutout (or fingerPocket.width, if smaller)
export function effectiveBottomChamfer(s: Settings, level: number): number;
export function chamferMinimums(s: Settings, level: number): { side: number; h: number };
export function maxBottomChamfer(s: Settings): number;
export function maxCornerRadius(p: number, q: number, rho: number): number;
// model/cut-rules.ts: the sides and axes of wall cutouts (§4.6, §4.7) and the clearance between
// rectangles, shared by sizing (whole units, tol 0) and planTray (mm, tol SPEC_TOLERANCE); u runs
// along a side, v across it. RectMm is { x0, y0, x1, y1 }.
export function separation(a: RectMm, b: RectMm): number; // along the axis that separates them most (< 0: overlap)
export function keepsApart(a: RectMm, b: RectMm, tol: number): boolean; // ≥ MIN_FEATURE_MM along x or y
export const OPPOSITE: Readonly<Record<Side, Side>>;
export function alongX(side: Side): boolean;
export function axes(r: RectMm, side: Side): { u0: number; u1: number; v0: number; v1: number };
export function faceOf(r: RectMm, side: Side): number;
export function nearestAcross(
  rects: readonly RectMm[],
  owner: number,
  side: Side,
  at: number,
  tol: number,
): number; // the nearest compartment across whose range contains `at`, or -1
// model/presets.ts
export const CARD_PRESETS: { id: string; label: string; shortSide: number; longSide: number }[];
export const SLEEVES: Record<
  "none" | "standard" | "premium",
  { addThickness: number; addSize: number }
>;
export const BED_PRESETS: { id: string; label: string; bedX: number; bedY: number; bedZ: number }[];
// model/defaults.ts
export function newProject(): Project;
export function newComponent(kind: ComponentKind): Component;
// The per-component toggles (spec §5): each takes the component's value, else its kind's default.
export interface Toggles {
  fingerCuts: boolean;
  curvedFloor: boolean;
  cornerReliefs: boolean;
}
export function fingerCutsOn(c: Component): boolean;
export function curvedFloorOn(c: Component): boolean; // never for cards or tiles
export function cornerReliefsOn(c: Component): boolean;
export function togglesOf(c: Component): Toggles;
// In the bulk fallback (spec §7.1): a toggle turned away from its kind's default, else bulk's.
export function binTogglesOf(c: Component): Toggles;
// model/numbers.ts
export function parseNumber(text: string): number | null; // "63,5" → 63.5, "" → null
// model/validate.ts
export const BOUNDS: { maxComponents: 100; maxCount: 2000; maxLength: 1000; maxPlayers: 10 };
export function validateProject(p: Project): Notice[];
export const SETTING_RANGES: readonly SettingRange[]; // { path, label, get, min, max } per setting
export function settingsValid(s: Settings): boolean; // ranges plus the cross-field rules (§4.6)
export const VALIDATION_NOTICE_CODES: {
  field: Record<string, string>; // "field.<name>", e.g. field.bottomChamfer, field.lipBearing
  limit: Record<string, string>;
  invalid: Record<string, string>;
};
// model/schema.ts
export function parseProject(raw: unknown, appSchemaVersion?: string): ParseResult;
export function serializeProject(p: Project, foreign: ForeignData): string; // JSON
// model/hash.ts
export function inputsHash(p: Project): string; // canonical JSON of box, printer, settings, components (all `name` fields removed), locks → cyrb53 hex
// model/ids.ts
export function newId(): string; // 8 chars base36
// share/
export function encodeHash(p: Project, foreign: ForeignData): string; // "#1.<base64url(deflate(json))>"
export function decodeHash(hash: string): ParseResult;
export interface ProjectStore {
  list(): { id: string; name: string; updatedAt: number }[];
  load(id: string): ParseResult | null;
  save(p: Project, foreign: ForeignData): void;
  remove(id: string): void;
  available: boolean;
}
// save() throws StoreWriteError (exported from share/store.ts) when the browser refuses the write (e.g. quota); previous state is restored first. Callers must catch it and show "autosave failed".
export class StoreWriteError extends Error {}
export function createProjectStore(storage?: Storage | null): ProjectStore; // null = no storage
export function exportJsonFile(p: Project, foreign: ForeignData): Blob;
export function importJsonText(text: string): ParseResult;
```

Schema `0.1.1` added `settings.fingerPocket.floorNotch` (default 12.5: how far a flat cutout's notch reaches into the floor) `.wallRoom` and `.dividerRoom` (default 0), the components' optional `fingerCuts`, `curvedFloor` and `cornerReliefs` (absent: the kind's default, as before them) and the `wallCutout` feature of stored trays, and dropped `settings.fingerPocket.reach` and the `fingerPocket` feature. A `0.1.0` file loads with those defaults; a `reach` in it is dropped with the one info notice for unknown fields, not an error. Its `inputsHash` changes, so a stored layout shows as made for other inputs ("re-optimize?"). A stored layout whose trays carry a `fingerPocket` feature no longer reads (an unknown feature type in a file of this line) and is dropped with its warning; planTray, too, refuses the feature (`UnsupportedFeatureError`). Geometry `0.2.0` is a new line (minis and custom trays change size, spec §9), so any layout stored at `0.1.x` gets plan 5's "reprint the whole insert" warning (`isOlderGeometryLine`).

### 4.6 Geometry conventions (from plan 3; binding for plans 2, 4, 5)

- **Wall cutout semantics** (`{ type: "wallCutout", side, at, width, depth, floorNotch }`, the only finger cut of a compartment, of every component with `fingerCuts` on; spec §6.1). A U-cut `width` wide (round bottom of radius `width/2`), centred on `at` along `side` (tray-local x for front/back, y for left/right), cut `depth` below the rim (clamped to the compartment floor). The compartment rectangle is the well itself: across the side the cut runs from the compartment's face to the facing face of the nearest compartment whose range along the side contains the cut's centre (`into`, a twin cut on the facing side or a spare), or out through the outer face (and the lip on it; `geometry/plan-cuts.ts`). That rule, `nearestAcross`, and the side and axis helpers live in `model/cut-rules.ts`: sizing asks it with the centre its cut gets (in whole units, tol 0), planTray with `at` (tol `SPEC_TOLERANCE`), so both pick the same compartment. With `floorNotch` n > 0 the cut goes on down through the bottom at its full width (a vertical slot through the wall or divider, instead of the U) and on into the compartment's floor n from its face, its far corners rounded with radius `min(width/2, n)`: at n = width/2 a half-disc whose diameter is the cut's width, so a finger fits and a fingertip gets under the stack; under a divider that is a hole through the floor. Everything is a vertical prism or open at the top, so nothing overhangs. buildTray cuts the U and the notch's slot EPS into the compartments at both ends of its strip (their floors stay whole): the posts keep its sides `POST_MM` from those compartments' faces, so clear of their 0.5 mm rounded inner corners (review 1, C1 and review 2, C1′: where a side lay within a corner, up to 0.11 mm of it stood beside the cut). A cut side meets a well face or the outer face at a right angle; the round bottom meets the vertical sides tangentially, the top corners are rounded (below), and the lip ends are cut square. **Top fillets** (`planTopFillets`, `planNotchFillets`; `CutPlan.topFillets`, the radii at its two sides): the two top corners of every U, where a side meets the top of the wall or divider (and of the spacer, for its notch), are rounded with `FINGER_FILLET_MM` = 3 mm in the wall's plane, across the whole strip (buildTray: the square beside the side less a horizontal cylinder along the strip, reaching `INNER_CORNER_RADIUS_MM` + EPS past the strip's ends into the compartments there: a 3 mm fillet beside a 3 mm post reaches a well's rounded corner, which it must not leave a sliver of). Through a lipped wall only the lip ring is rounded, on its top, at most the lip's height (`filletStrip`): the ledge stays square for the upper tray to rest on. The radius shrinks so that `MIN_FEATURE_MM` of top stays to the outer corner's arc, to every corner relief within the band its cutter takes (`reliefAlong`: a relief takes precedence over a top fillet, review 3, M1 as ruled; the fillet may shrink to 0) and to any other compartment lying across the same strip (another cut lies inside or beside its own compartment, which comes first), to the U's straight side, to the cavity above the floors of the compartments at the strip's ends (its cutter reaches into them), and through a lipped wall to the lip's height; it stays on the faces of the compartments the strip runs between, whose posts are at least 3 mm; under `MIN_FILLET` (0.2 mm) it is 0. The outer corner's arc limits it only on a strip within `cornerRadius` of the faces across it (review 3, M2: interior dividers got 0.8 mm instead of 3). Posts are full height; at the rim the top fillet may round a post into its wall: a 3 mm fillet beside a 3 mm post takes its whole top (review 3, M5, intended). It is planned after the outer corner radius and changes nothing in sizing. The cut's vertical edges are square (the 1.5 mm vertical-edge fillets of the first version stopped where the round bottom began and are gone). Upper trays rest on the ledge and dividers around a cut and are still located by the lip on the other walls and beside the cut.
- **Wall cutout clearance** (planTray, `plan-cuts.ts`; sizing places cutouts by the same rules, §4.7). A wall cutout is centred on its own compartment (`at` within its range along the side), at least `MIN_CUT_MM` = 10 mm wide (or `fingerPocket.width`, if smaller), and leaves a full-height post of at least `POST_MM` = 3 mm between each side and the faces of every compartment it passes (its own, and the one it runs into): the wall or divider still holds the contents (spec §6.1; sample 25, 15 mm tiles laid flat, lost its end walls to 16 mm cuts with floor notches), and no side comes near a well's rounded corner. The posts also keep its sides out of the outer walls it runs along. Its footprint keeps `MIN_FEATURE_MM` (along x or y, `keepsApart`) from every compartment except its own and the one it runs into. Two cutouts either keep it too, or cut one channel: the same axis, centre and width with overlapping footprints (the two sides of one divider; with different depths the union is the deeper U); the cuts on opposite sides of one compartment have only its contents between them. With a floor notch the notch lies within the compartment's floor (n at most its extent across); two notches on opposite sides leave `MIN_FEATURE_MM` of floor between them. Against the bottom chamfer `c`: where the cutout leaves the tray without a notch, its bottom stands `c + MIN_FEATURE_MM` above the bed; its sides keep `distance + bottomZ + (2 − √2)·r − c ≥ MIN_FEATURE_MM` to the faces they run along (`distance − c` with a notch, which reaches the bed), and the notch `distance − c ≥ MIN_FEATURE_MM` to the outer face behind the compartment. A compartment cut on a side that also has a scoop is rejected (the scoop's fillet would stand free). Corner reliefs shrink until their bounding box keeps `MIN_FEATURE_MM` from every cutout and notch footprint (their own compartment's too); they ignore the top fillets, which give way to them (a relief takes precedence over a top fillet), and the outer corner radius shrinks so its arc ends `MIN_FEATURE_MM` before a cutout's side on the face it leaves through: the wall between the side and the face it runs along is thinnest at that face, `q − R` (review 1, I1: with `R = q` the arc thinned it to a wedge). `planCornerRadius` caps `R` at `q − MIN_FEATURE_MM` for every footprint corner on an outer face and `thinCorner` rejects less; the other footprint corners count like well corners, at the cut's lowest line (`bottomZ`), and with a floor notch those of the cut and its notch at the bed. `tray.sizing.test.ts` and `tray.sizing-tiles.test.ts` build sizing's cutouts (`test-sweep.ts`) and check the mesh's genus against the floor holes (`floorHoles`), printability and bounds; `tray.cases.test.ts` builds the cases the reviews found.
- **Spacer notch** (`{ type: "spacerNotch", axis, at, width, depth }` in a spacer's `TraySpec.features`; spec §6.2). In the spacer's own frame a U-cut runs along `axis` out through both end faces, centred on `at` across it, `width` wide (round bottom of radius `width/2`), `depth` below the spacer's top: the finger channel of the well running on through the spacer, which prints standing, so the cut is open at the top. planTray accepts at most one, on a spacer only (and none in a compartment); `at` lies on the spacer; each side of the cut either passes the spacer's face (the spacer is cut across, its top following the U) or keeps the bottom chamfer + `MIN_FEATURE_MM` of spacer beside it; a U past both faces meets the farther one no lower than the spacer's top (it takes the whole top, so the spacer must end there, or its mesh would be lower than its height); its bottom stands at least the bottom chamfer + `MIN_FEATURE_MM` above the bed; and the outer corner radius shrinks so its arc ends `MIN_FEATURE_MM` before a side inside the spacer on the end faces (`notchEdges`: the side's corner on each end face); its top corners on the spacer are rounded like a cut's (top fillets, below). `rotateRealized` turns it with the spacer (along x at `at` → along y at `d − at`).
- **`planTray` and `buildTray` reject** a spec by throwing `TraySpecError` (`geometry/errors.ts`, a `RangeError` named `"TraySpecError"`; across the worker it arrives as a `GeometryBuildError` of that name). They reject non-positive or non-finite sizes and non-finite `bottomChamfer`, `cornerRadius` or lip settings; a tray `wall` below `MIN_WALL_MM` (0.9 mm; solid parts and spacers are exempt); on a lipped tray a `lip.thickness` below `MIN_WALL_MM` or a `lip.height` not above the lip chamfer; compartments closer than `MIN_FEATURE_MM` (0.8 mm) to each other, along x or y (so every divider is ≥ 0.8 mm; overlapping and touching ones included); compartments closer to an outer face than the outer wall (`max(wall, lip.thickness + lip.ledge)` when lipped), or whose `floorZ` is outside (0, h). They also reject a wall cutout whose `width` or `depth` is not > 0, whose `at` or `floorNotch` is not finite or whose `floorNotch` is negative, or that breaks the wall cutout rules above; and a tray or spacer too small for its 45° bottom chamfer `c`: `min(w, d) < 2·(c + 0.8)` or `h < c + 0.8`, where `c = bottomChamfer`, or `max(bottomChamfer, 0.5)` for `level > 0` (spacers always use `bottomChamfer`), plus the bottom chamfer limits below. All these limits, like the wall and outer-wall checks, are compared with a 0.005 mm tolerance (`SPEC_TOLERANCE`): TraySpec numbers are on the 0.01 mm grid, so a spec exactly on a limit passes despite float noise (e.g. content 8.29 − 7.29 mm, or `h = 3.07` with `c = 2.27`). Sizing and layout must never emit such specs. Their tests should assert it (call `planTray(spec, settings)` on every emitted spec).
- **Printability.** planTray's rules are what keep every wall, divider, floor and lip ≥ 0.8 mm: a spec that would build a thinner feature is rejected, never built. `checkPrintability` is a test-time verifier: tests run it on built meshes to confirm the rules leave nothing thinner; production builds don't run it.
- **Lip.** The lip's inner top edge has a `min(0.6, lip.thickness − 0.6)` × 45° chamfer, so its flat top stays ≥ 0.6 mm. Upper trays rest on the ledge: with the lip on, `validateProject` requires an upper tray's bottom chamfer (`effectiveBottomChamfer(s, 1)`, at least 0.5) to be less than `lip.ledge − 2·effective(s).lipPlay` (`field.lipBearing` at `/settings/bottomChamfer`, checked when the chamfer, ledge, play and fit are in range and the chamfer is within `maxBottomChamfer`); `settingsValid` includes it.
- **Bottom chamfer limit.** The 45° chamfer `c` pulls the outer contour in by `e = c − z` at height `z < c` (corner arc radius `R − e`), and the outer corner is never rounder than the chamfer (`R ≥ c`). Everything cut at height `z` must keep 0.8 mm of material to that contour:
  - **Straight faces:** `distance to the nearest outer face + z − c ≥ 0.8` for each compartment (at its `floorZ`) and each wall cutout (the wall cutout clearance rules above: its sides at `bottomZ + (2 − √2)·radius`, at the bed with a floor notch). `buildTray` rejects a violation with `TraySpecError`.
  - **Corners:** `planCornerRadius` shrinks `R` for every well corner, cut corner and relief circle with the extra margin `e = max(0, c − floorZ)`, and `buildTray` rejects a chamfer that still leaves such a corner under 0.8 mm plus the 0.1 mm `CORNER_MARGIN` on the true arc (`R = c` forced). Corner reliefs keep `e` out of their wall budget.
  - **Settings:** `model/settings.ts` exports `effectiveBottomChamfer(s, level)`, `chamferMinimums(s, level)`, `maxCornerRadius` and `maxBottomChamfer(s) = min(wall + floor − 0.8, wall + (floor − 0.9)/√2, maxCornerRadius(wall, wall, 0))`; the middle term is the sharp corner at `R = c`, whose material is `floor − √2·(c − wall)`, plus the 0.1 mm `CORNER_MARGIN` that every corner term keeps for the polygon approximating the arc (defaults: 1.812 mm). `validateProject` reports a `bottomChamfer` above it as `field.bottomChamfer` at `/settings/bottomChamfer`, and `size()` returns no requirements for settings that fail `settingsValid(s)` (ranges plus this rule and the lip bearing rule above). `lip.height` is at least 1 mm, and `wall` and `lip.thickness` at least `MIN_WALL_MM` = `MIN_FEATURE_MM + CORNER_MARGIN` = 0.9 mm (`SETTING_RANGES`; planTray rejects thinner walls and lips, and `wallFor` never returns less): a sharp cut corner at the wall keeps 0.8 mm to the arc polygon only with that margin (`maxCornerRadius` has none to give a cut closer than 0.9 mm to a face), and the lip ring between two concentric polygons is only `t·cos(Δ/2)` thick at a corner facet, so `checkPrintability` measures a 0.8 mm lip below 0.8 mm (0.9·cos(22.5°) ≈ 0.83 mm passes). Floors and dividers keep their 0.8 mm minimum.
- Geometry may shrink corner-relief and outer-corner radii below `settings.cornerRadius` to keep walls ≥ 0.8 mm. Outer dimensions never change. A relief keeps `MIN_WALL_MM` (0.9 mm) to the outer faces like the outer wall itself: near a rounded outer corner the arc's polygon comes up to 0.08 mm closer than the straight face (a relief budgeted to 0.8 mm beside a 3 mm corner kept only 0.78 mm on the polygon; since geometry 0.1.1).
- `UnsupportedFeatureError` has a `feature: string` property and constructor `(feature: string)`. It is thrown for any `part`, compartment `kind` or feature `type` outside `KNOWN_PARTS`, `KNOWN_COMPARTMENT_KINDS`, `KNOWN_FEATURE_TYPES` (`geometry/types.ts`); `feature` is the feature type, `part:<part>` or `kind:<kind>`. The UI imports the same lists (no copies).
- Main-thread and layout code import `GEOMETRY_VERSION` from `geometry/version`, types from `geometry/types` and the worker client from `geometry/client` only. Importing `geometry/index` pulls manifold-3d and its WASM into that bundle. The root ESLint config forbids every other `geometry/*` module (static and dynamic imports, and the bare `geometry` directory) and `manifold-3d` outside `geometry/`, test files and `test-*.ts` helpers, and a test checks that `client.ts`'s import graph stays inside `geometry/{client,types,version}` and `model/`.
- Ownership: the Renovate `manifold-3d` no-automerge rule belongs to plan 1 (Task 2), not plan 3.

### 4.7 Sizing conventions (from plan 2; binding for plans 4, 5)

- `realizeTray` works in the tray's own (unrotated) frame. For a rotated placement, layout calls `realizeTray` with the unrotated outer, then `rotateRealized(realized, outer)` (90° counter-clockwise; exported from `sizing/index.ts`).
- Spacers: at most one per tray, key `<trayKey>:spacer`, `x/y/z` relative to the tray, height = well depth − 5. Created only when the spacer is buildable: the spare upright stack length is ≥ max(5 mm, 2·(bottomChamfer + 0.8)), the well it fills is ≥ 2·(bottomChamfer + 0.8) deep, and its height (content depth − 5) is ≥ max(5 mm, bottomChamfer + 0.8). Otherwise slack goes to thicker walls/dividers, then a spare compartment. Where the well's finger channel (its left or right wall cutout) reaches below the spacer's top, the spacer is notched to match: along x, centred on the channel (its `at` less the well's y), as deep below the spacer's top as the channel is below the rim less 5 mm, as wide as the channel, or across the whole spacer where less than `bottomChamfer + MIN_FEATURE_MM` would stay beside it (a wider U with the same bottom still holds the channel's). A notch past both of the spacer's faces (a channel wider than the spacer) takes its whole top: the spacer then ends where the U meets the face farther from its centre (rounded down to 0.01 mm), so its mesh is as tall as its spec, and the notch is that much shallower. `assertTrayInvariants` checks every spacer in a channelled well is notched so.
- `RealizedTray.compartments[i]` corresponds to `part.compartments[i]`; spare compartments come after.
- `RealizedTray.wall` = `max(settings.wall, MIN_WALL_MM)` rounded up to 0.01 mm, the base wall, never the lipped one.
- `wallFor(settings, lipped)` is exported from `sizing/index.ts`: the outer wall, `max(settings.wall, MIN_WALL_MM)`, and at least `lip.thickness + lip.ledge` on a lipped tray. Plan 4 must use it instead of re-deriving the (lipped) wall, rounded up to 0.01 mm like sizing. The finger room of cut walls is inside `minOuter` and `realizeTray` (compartments start further in); `TraySpec.wall` stays the base wall.
- `RealizeOptions.lipped` only takes effect when `settings.lip.enabled`. Upper trays (`level > 0`) are at least `lip.height + 3` tall.
- `minOuter` is the minimum layout plus the finger room (below); wall cutouts need no room of their own, so it never widens a part for them (§4.2).
- **Wall cutouts** (`sizing/cutouts.ts` `placeCutouts`, after the spares are placed; the only finger access sizing makes). Upright cards and tiles ask for cutouts on their left and right (the walls their faces touch, half the shallowest well deep); flat cards on their left and right (long side along Y), flat tiles on the two walls along their longer side (front and back when the footprint is wider than deep, else left and right), both down to the floor with a floor notch; minis pockets, custom wells and bulk compartments on their front (`wallCutout("front", 0.5, false)`: half their content depth, no floor notch; custom wells keep their corner relief, which any kind may turn on). **Toggles** (spec §5): every kind builds its features through `featuresOf(on: Toggles, cuts)` (`sizing/common.ts`; `on` is `togglesOf(c)`, or `binTogglesOf(c)` in the bulk fallback, §4.2), which keeps the cut requests only when `on.fingerCuts`, adds the scoop ramp when `on.curvedFloor`, on the front, or on the back when a cut takes the front, and the corner reliefs when `on.cornerReliefs`; a bulk compartment (`bulkCompartment`) with a scoop is kind `"scoop"` and one without a plain `"well"`, while the other kinds keep their kind (`"well"`, `"pocket"`) with or without one. With both off a compartment has no cut and no scoop (a plain box). A compartment with finger cuts off is like bits to its neighbours: no channel opens into it. A request's cut runs out through the outer wall when no compartment lies across its side, into a spare there, or across the divider into a compartment that asks for a cut on the facing side, faces it (each is the other's nearest across) and is centred within 0.01 mm of it; toward anything else (bits, a compartment asking for no cut on the facing side, a well of the other row not centred on it) it is left out. So that a deck grouped with bits still gets its channel along the row, each row puts the compartments asking for a left or right cutout first (`cutsFirst` in `makePart`): the first one's channel leaves through the outer wall. A compartment none of whose requests gets a cut asks again (the same depth and notch, the smallest fraction of its requests; never on a side its scoop is on, `CutContext.scooped`), placed after every earlier cut by the same rules, centred on the cards beside a spacer and clear of it (`MIN_FEATURE_MM` from it): first on the other side of the same axis (a minis pocket of the back row, whose front faces the front row, cuts through the back wall), then, for those still without a cut, on both sides of the other axis (a deck kept between bits along its row, in a hand-built part or with decks of different lengths in a row, is cut through the front and back walls). One that gets no cut at all refuses the part (`CutFitError`; §4.2). `assertTrayInvariants`, given the part, checks every compartment asking for a cutout has one, and every cutout its `POST_MM` posts. The cuts so linked, and those on both sides of one compartment, form a run: one channel centred on its first member, as wide as `fingerPocket.width` (rounded up to an even unit count) or the room it has: it leaves a `POST_MM` post between its sides and the faces of every compartment it passes (its members and the spares it runs into), which also keeps them past the outer corners' arcs and apart from another row's channel through the same end wall (review 1, C2), and reaches at most half way into the gap to any other compartment within `MIN_FEATURE_MM` of its cuts, less `MIN_FEATURE_MM / 2`. Runs are placed one after another, each keeping `MIN_FEATURE_MM` from the cuts already placed (`PlacedCut.foot`: a pocket's cut out past a deck keeps clear of the deck's channel). A run with less room than `MIN_CUT_MM` (or `fingerPocket.width`, if smaller) gets no cut (review 2, M-a: 2 mm wells got 0.4 mm cuts): the later tries, else the part is refused. Small tiles stored flat (under about 16 mm, a 16 mm well holds a 10 mm cut) so lose their flat variants; an auto component keeps its upright ones, and one that keeps none goes in a scoop bin (the bulk fallback, §4.2) (rows2: each row of upright cards or tiles has its own channel, and the divider between the rows stays whole; flat tiles cut through it only into a well of the other row centred on the same line). Depth: to its own floor for flat contents, half the run's shallowest well for upright cards and tiles, minis pockets and custom wells, and where it leaves the tray without a floor notch at most so deep that its bottom stands `chamfer + MIN_FEATURE_MM` above the bed. The floor notch is as wide as its cut and reaches `fingerPocket.floorNotch` into the floor, `MIN_FEATURE_MM` short of an opposite notch and `chamfer + MIN_FEATURE_MM` from the outer face behind; none under 1 mm.
- **Finger room.** `fingerPocket.wallRoom` (0 = off; simple mode "Extra finger room in the box" = `FINGER_ROOM_MM` = 10 mm) thickens, inward, the outer walls the placed cuts leave through: per row on the left and right, and the front and back (a cut on another side included, placeCutouts' later tries). `fingerPocket.dividerRoom` (simple mode: `FINGER_DIVIDER_ROOM_MM` = 5 mm) thickens every divider the placed cuts pass through: between twins in a row (`MinLayout.gaps`), between rows (twins cut through the front and back, or a cut crossing a row on its way out; `MinLayout.rowGaps`), and before a spare at a row's end or the spare row at the back after a cut that leaves there. A side that asks for a cut but gets none keeps its plain wall or divider. `minOuter` grows by the room on each such wall and divider (a strip of upright decks is 2 × 10 mm longer); a spare at the end of a row (or the spare row) takes the wall room instead: the cutout runs into it. Which walls those are depends on the layout, which depends on the room: `settleRoom` starts from the sides asked for (`requestedWalls`), lays the part out at its footprint, takes the walls its cuts pass through (`CutWalls`, from `PlacedCut.to`) and repeats until they agree (one or two rounds). Where the room moves the cuts back and forth (it can shift the layout so that a cut changes side), after `ROOM_ROUNDS` = 4 rounds every wall and divider any of those layouts cut gets the room: such a wall may keep room it has no cut in. A larger outer keeps that layout's room.
- **Layout needs no realizability handling.** Every part `size()` returns realizes at every (lipped, level) and every outer ≥ its `minOuter` (§4.2), so layout calls `realizeTray` freely; any error from it is a bug and propagates.
- Spare compartments are placed before the wall cutouts, and a cutout may run into a spare.
- `cardStackClearancePct` is a fraction (0.03). It is not in `Effective`; sizing multiplies it by `fit`.
- Sizing never sees the box. It emits variants (tile column counts, minis lying, all storages under `auto`). Layout treats a variant whose `minOuter` exceeds the available height or bed as infeasible and tries the others.
- `hasGrip(compartments: readonly CompartmentSpec[])` (sizing) checks spec rule 8 (pass `realized.compartments`): a compartment with its smaller side ≥ 25 mm, a wall cutout or a scoop. `needsGrip(part: TrayPartReq)` says whether the rule applies: some compartment asks for a wall cutout or a scoop. A tray whose components all have finger cuts and curved floor off is the user's opt-out (spec rule 8) and need not pass.
- Every variant of a requirement uses the same trayKeys (`<key>:p<player>:<part>`, spec §5), so a `TraySpec` alone doesn't say which variant it came from. Plan 4 infers it from the stored trays (`inferVariant`: matching key set, then compartment minimums) for warm starts, lock hints and its hard-rule checker.

### 4.8 Layout conventions (from plan 4; binding for plan 5)

- Extra exports. From `layout/index.ts`: `swapLocks(locks: Lock[], keyA: string, keyB: string, layout: StoredLayout): Lock[]` (the only swap implementation; it also adds stack locks so swapped stacks keep their order) and `NOTICE_CODES`. From `layout/client.ts`: `LayoutCancelledError` (a cancelled or superseded run rejects with it), `LayoutClient`, `WorkerLike`, `createLayoutClientWith(factory)`.
- Sizing exports `rotateRealized(r, outer)`, `hasGrip(compartments)` and `needsGrip(part)` in addition to §4.2.
- Notice codes: `layout.coverage`, `layout.play`, `layout.lipOff`, `layout.capped` (info), `layout.bed` (error: a requirement fits the print bed in no variant; warning: a part fits it plain but its lipped walls or lip-inset footprint do not, so it is printed with nothing stacked on it or under it), `layout.doesNotFit` (error; names the trays over the print bed when the shortfall is 0 on every axis), `lock.dropped`. A `lock.dropped` notice has `path: "/locks/<index>"`, the dropped lock's index in `LayoutInput.locks` (= `project.locks`). Plan 5 removes those locks when it accepts the result and stores the layout under the post-prune `inputsHash`, so it isn't stale and nothing re-runs.
- The `iterations` argument of `optimize`, `createRun` and the client's `run` is **this run's** budget. `StoredLayout.iterations` is cumulative: `warmStart.iterations` + this run's budget (or the iterations actually run when `capped`); without a warm start, just this run's. Determinism: same input + warm start + seed + iterations → same result. "Improve more" (spec §7.2) = `run(input, layout.seed, 3 × DEFAULT_ITERATIONS, layout, …)`. A leftover's `TraySpec.path` is its leaf's path, and each leftover piece has its own `stack` number.
- `DEFAULT_ITERATIONS = 50000`. Recalibrate with `CALIBRATE=1 npx vitest run src/layout/optimize.calibrate.test.ts`.
- If no layout fits with the locks, a second run without them follows, and each lock it gives up gets a `lock.dropped` notice.

### 4.9 Shared files (who changes what)

Later plans edit these files in place and keep everything earlier plans put there. Steps that change a config file show the whole resulting file.

- `package.json` and its lockfile: plan 1 creates them with every §2 dependency. Later plans only run `npm install <pkg>@<§2 range>` (a no-op when present); plan 5 Task 23 changes only the `build` script (appends the smoke step).
- `tsconfig.json` (app, `src/`): plan 1 only. `tsconfig.node.json` (Node-side config, `@types/node`): plan 1 creates it for `vite.config.ts`; plan 5 Task 22 adds `licenses.config.ts`.
- `vite.config.ts`: plan 1 creates it; plan 3 Task 6 adds `worker` and `optimizeDeps`; plan 5 Task 15 adds `test.css`, Task 22 the license plugin, Task 23 `scripts/**/*.test.mjs` in `test.include`.
- `index.html`, `src/main.tsx`, `src/app/App.tsx` (+ test), `src/style.css`, `README.md`, `app.json`: plan 1 placeholders; plan 5 Tasks 21 and 24 replace them, keeping the preview banner, the version footer and the "All apps" link.
- Root `eslint.config.mjs` and `renovate.json`: plan 1 Task 2 creates them. Plan 3 adds the insert-generator blocks to `eslint.config.mjs`: the main-thread guard (outside `geometry/`, app code may import only `geometry/{types,version,client}` and never `manifold-3d`, statically or dynamically; §4.6) and the rule that production code anywhere in `src/` never imports test-only helpers (`**/test-*`). Later plans keep both.

## 5. Fixtures

Until the user supplies real measured games (spec §12), plans use synthetic
fixtures in `test/fixtures/` (plan 1 creates them):

- `cards-heavy.json` — 290 × 290 × 70 box, headroom 8, 6 decks of Standard cards (sleeved, 40–90 cards each).
- `bits-heavy.json` — 300 × 220 × 60 box, headroom 4, 4 bulk components, one `perPlayer: 4`.
- `tiles-minis.json` — 300 × 300 × 80 box, headroom 10, 60 hex tiles (flatToFlat 40, 2 mm), 12 minis.
- `small-tiles.json` — 200 × 150 × 60 box, headroom 5: 40 square tiles 15 mm (2 mm, auto), 19 upright hexes 13.7 mm (2.8 mm) and 19 hexes 8.5 mm (1.5 mm, auto). Wells shorter than the finger width, two rows of different lengths, cuts near the outer corners and spacers narrower than their channel (review 1 of the finger channels).
- `tiny-box.json` — 150 × 100 × 40 box with too many cards (infeasible case).

All five are valid at `SCHEMA_VERSION`; plan 1 created the first four, the finger-channel review added `small-tiles.json`.
