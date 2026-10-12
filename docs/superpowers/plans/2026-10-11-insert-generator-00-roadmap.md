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

- App lives in `apps/insert-generator/`. Built app: `package.json`, `npm run build` outputs `dist/`, `vite.config.ts` sets `base: "./"`, `app.json` has `{ title, description }`.
- Node 22 (`.nvmrc`). Dependency versions (exact ranges):
  `vite ^6.4.0`, `vitest ^5.0.3`, `typescript ^6.0.3`, `preact ^10.29.8`,
  `@preact/signals ^2.11.3`, `@preact/preset-vite ^2.10.6`, `manifold-3d ^3.5.4`
  (single-threaded build only), `three ^0.186.1`, `@types/three ^0.186.0`,
  `fflate ^0.8.3`, `fast-check ^4.10.2`, `jsdom ^30.1.2`,
  `@testing-library/preact ^3.2.4`, `rollup-plugin-license ^3.7.1`,
  `@types/node ^22.0.0` (type-only, for `tsconfig.node.json`). No copyleft dependencies.
- TypeScript strictness from `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` → use `import type`). App `tsconfig.json` (covers `src/`, no Node types): `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`. `tsconfig.node.json` covers the Node-side config files (`vite.config.ts`, later `licenses.config.ts`) with `"types": ["node"]`.
- Lint: root `eslint.config.mjs` (non-type-checked `strict` + `stylistic`, `curly: all`, `eqeqeq`, `prefer-template`, `no-param-reassign`, `no-console` except warn/error). Prettier: `printWidth` from `.prettierrc.json`. Stylelint for CSS. html-validate for `index.html`.
- The app's `build` script: `vitest run && tsc --noEmit && tsc --noEmit -p tsconfig.node.json && vite build` (plan 5 appends `&& node scripts/smoke-dist.mjs dist`); `npm run typecheck` runs both `tsc` checks. Tests run in CI via `npm run build:all`.
- `Math.random` is banned in `apps/insert-generator/src/layout/**` (root ESLint rule, plan 1).
- All lengths are millimetres. Inside `layout/`, lengths are integer 0.01 mm units (`Units` helpers, plan 4); `TraySpec` stores mm rounded to 0.01.
- Versions start at app `0.1.0`, `SCHEMA_VERSION = "0.1.0"`, `GEOMETRY_VERSION = "0.1.0"`. Pre-1.0 makes no compatibility promise (spec §9). The finger channels (§4.6 wall cutouts) made both `0.1.1`: additive, so files and layouts of `0.1.0` stay on the same line.
- Never use `localStorage` without `try/catch`. No network calls at runtime.
- Commits: plain imperative messages (e.g. `Add card sizing`). **No `Co-Authored-By` or any trailer.** Commit after every task.
- Run tests from the app folder: `cd apps/insert-generator && npx vitest run <path>`. Run repo checks from the root: `npm run lint`, `npm run format:check`, `npm run verify`.

## 3. File layout

```
apps/insert-generator/
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
  fingerPocket: { width: number; reach: number; floorNotch: number; wallRoom: number };
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
  | { type: "fingerPocket"; side: Side; at: number; width: number; reach: number; depth: number }
  | {
      type: "wallCutout";
      side: Side;
      at: number;
      width: number;
      depth: number;
      floorNotch: number;
    }
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
- Spacers: `part: "spacer"`, `path: ""`, `solid: true`, `compartments: []`, `x/y/z` = its position inside the well (for the 3D view).
- Leftovers: `part: "leftover"`. `solid: true` → closed block. Otherwise one `spare` compartment.

### 4.2 `src/sizing/types.ts` (plan 2)

```ts
import type { Access, Side, CompartmentSpec, TraySpec } from "../model/types";

export interface FeatureReq {
  type: "fingerPocket" | "wallCutout" | "scoop" | "cornerRelief";
  side?: Side; // fingerPocket, wallCutout, scoop
  depthFraction?: number; // fingerPocket: 1/3 or 1 (full); wallCutout: 1/2 (of the shallowest well) or 1 (to its floor)
  perItem?: boolean; // fingerPocket: one per pocket along the side
  floorNotch?: boolean; // wallCutout: notch the floor (flat cards and tiles)
}

export interface CompartmentReq {
  componentId: string;
  contents: string; // label, e.g. "Main deck ×52"
  kind: "well" | "scoop" | "pocket";
  minW: number; // inner, mm, finger-pocket reach included (wall cutouts need none)
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
  compartments: CompartmentReq[]; // strip order; rows2: first half row 0, rest row 1
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
  loose: boolean; // contains bulk, minis-bulk or tiles (coverage rule)
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
// realizeTray's refusal of a part whose finger slots (the finger pockets of minis and custom wells;
// wall cutouts always fit) fit at no footprint minOuter's search tries (§4.7).
export class SlotFitError extends RangeError {
  // name "SlotFitError"
  readonly minWidth: number; // mm: min(MIN_SLOT_WIDTH, fingerPocket.width)
  readonly componentIds: readonly string[]; // of the compartments whose slots did not fit
  readonly contents: readonly string[]; // their contents labels
}
```

- `size` groups components by `groupId` and expands `perPlayer`. It assumes a valid project: invalid components and out-of-range settings (`settingsValid` false) yield nothing, without notices of their own, because `validateProject` already reports them (plans 4 and 5 never optimize while it has errors). Its own notices are sizing warnings such as an implausibly thin measured card thickness. Every requirement it returns has 1..8 variants.
- `size` keeps only variants whose every part `realizeTray` realizes at its `minOuter` unlipped at level 0; the rest keep their rank order. Since `minOuter` already widens a part until its slots fit (next items), only parts whose slots fit at no footprint up to `fingerPocket.width` wider are dropped. A requirement none of whose variants remains is left out, with a warning `sizing.noFingerSlot` at `/components/<i>` (the first member whose slots did not fit) naming that component and the contents of the preferred variant's failing run, e.g. "Minis: no tray arrangement leaves room for a finger slot of at least 15 mm by F0, even up to 22 mm wider, so it is left out.". Only minis pockets and custom wells have finger slots: at the default settings, tiny pockets of different sizes front to back do this (two 1.5 mm wide pockets, 2 and 4 mm front to back, in a strip; in a group with bits every variant can fail). Cards and tiles have wall cutouts, which always fit: their variants are never dropped.
- `CompartmentReq.minW`, `minD` and `minH` are whole 0.01 mm (rounded up). A compartment with a finger pocket keeps at least `MIN_POCKET_CONTENT` (1 mm, `model/settings.ts`) of content on both axes.
- `minOuter` returns the smallest outer box that holds the part with its finger slots (walls, dividers, floor, lipped wall and finger room included). `h` = floor + max compartment `minH`, raised to the bottom-chamfer and upper-tray minimums (§4.6, §4.7); `w` and `d` include `fingerPocket.wallRoom` on each outer wall a wall cutout leaves through (§4.7) and are raised to the bottom-chamfer minimum, and then, where the finger slots don't fit that footprint, widened along the axes that carry slots (x for front/back pockets, y for left/right) until they do, by at most `fingerPocket.width`: 2 mm steps, the first fit bisected to 0.01 mm (a narrow pocket beside wide ones fits once the walls and divider grow: minis pockets 1.33 and 40.56 mm wide, 46.29 → 47.74 mm). A part whose slots fit nowhere up to that cap keeps the plain minimum, and `realizeTray` refuses it at every outer.
- `realizeTray` spreads slack in `outer` over the compartments (elastic axes first, then dividers/walls inward up to `min(2 × setting, 4)`, with upright card/tile stack slack becoming a spacer first when ≥ 5 mm (§4.7), otherwise thicker dividers/walls, then an extra `spare` compartment), after giving the cut outer walls their finger room. It raises floors so every compartment top is at the rim (`floorZ = h − compartment content depth`, never below `settings.floor`). It throws a plain `RangeError` if `outer` is smaller than `minOuter` on any axis (a programming error), `SlotFitError` if its finger slots cannot keep their minimum width (§4.7), and a plain `Error` for a broken internal invariant (a bug).
- **Realizable at `minOuter` ⇔ realizable at all:** if `realizeTray(part, minOuter(part, s, opts), s, opts)` succeeds, `realizeTray(part, outer, s, opts)` succeeds for every larger `outer` with the same settings and options, and if it throws `SlotFitError`, so does every larger outer. Where the slack of a larger outer would leave the slots no room (a wider row pushing a slot against a well face, a spare compartment), the tray keeps its `minOuter` arrangement, centred in `outer`, and the slack thickens the outer walls. Slot placement depends on the footprint only, so the height never matters.

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
  "fingerPocket",
  "wallCutout",
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
export const GEOMETRY_VERSION: string; // "0.1.1": 0.1.0 plus the wall cutout
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
export const SCHEMA_VERSION: string; // "0.1.1": 0.1.0 plus fingerPocket.floorNotch and .wallRoom
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
// fingerPocket.wallRoom = FINGER_ROOM_MM, off writes 0; "custom" for any other advanced value.
export const FINGER_ROOM_MM: number; // 10
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
export const SLOT_CONTENT_OVERLAP: number; // 0.5: how far a finger slot runs into its contents
export const MIN_SLOT_WIDTH: number; // 15: narrowest finger slot (or fingerPocket.width); pockets only
export const MIN_POCKET_CONTENT: number; // 1: content left inside a pocket's reach bands
export function effectiveBottomChamfer(s: Settings, level: number): number;
export function chamferMinimums(s: Settings, level: number): { side: number; h: number };
export function maxBottomChamfer(s: Settings): number;
export function maxCornerRadius(p: number, q: number, rho: number): number;
export function maxChannelSpacing(r: number): number;
export function maxWellFaceOffset(r: number): number;
export function cutRidgeWidth(r: number, dContents: number, dSolid: number): number;
// model/slot-rules.ts: the finger slot clearance rule (§4.6) as predicates on mm, shared by
// sizing (tol 0) and planTray (tol SPEC_TOLERANCE). RectMm is { x0, y0, x1, y1 }, WellFace
// { at, solid: -1 | 1 }; FaceProblem says why a face fails ("short", "offset" or "ridge").
export function separation(a: RectMm, b: RectMm): number;
export function keepsApart(a: RectMm, b: RectMm, tol: number): boolean;
export function slotsApart(spacing: number, r: number, tol: number): boolean;
export function slotsMerge(spacing: number, r: number, tol: number): boolean;
export function wellFaceProblem(
  face: WellFace,
  centres: readonly number[],
  r: number,
  tol: number,
): FaceProblem | null;
export function wellFaceHolds(
  face: WellFace,
  centres: readonly number[],
  r: number,
  tol: number,
): boolean;
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

Schema `0.1.1` added `settings.fingerPocket.floorNotch` (default 8) and `.wallRoom` (default 0) and the `wallCutout` feature of stored trays. A `0.1.0` file loads with those defaults, so its `inputsHash` changes and a stored layout shows as made for other inputs ("re-optimize?"); its stored trays (finger pockets on cards) still build and mate as before: geometry `0.1.1` adds the cutout and keeps corner reliefs 0.9 mm from the outer faces (slightly smaller reliefs beside thin outer walls, a mesh-only change inside the wells), so it is a PATCH on the same line (spec §9).

### 4.6 Geometry conventions (from plan 3; binding for plans 2, 4, 5)

- **Finger pocket semantics** (minis pockets and custom wells; cards and tiles have wall cutouts, below). A compartment's rectangle includes a solid band `reach` deep along the pocket's `side`. The U-slot (`width` wide, round bottom of radius `width/2`) is cut into that band and `SLOT_CONTENT_OVERLAP` (0.5 mm, at most half the contents; `model/settings.ts`) into the compartment's contents. `at` = slot centre in tray-local coordinates along that side (x for front/back, y for left/right). `depth` is measured down from the rim and clamped to the floor. A slot may cross dividers but must not enter the outer wall: sizing must shift `at` inward for narrow decks at the strip ends.
- **Finger slot clearance.** A slot's footprint (`width` along the side × its band plus the 0.5 mm overlap across it) must keep ≥ `MIN_FEATURE_MM` (0.8 mm, along x or along y) from
  - the contents (rectangle minus reach bands) of every other compartment, unless they reach into the footprint only within its 0.5 mm overlap into its own contents (they lie on the contents side of its band, as a neighbour's contents do when both share the band line). Those contents, and the slot's own, are judged by their **well faces** (next item);
  - every other finger slot, except its **twins** (slots on the same band line: same side, same band edge and reach, same width and depth) and the slot on the opposite side of its own compartment (only the contents lie between those two; slots of one compartment on adjacent sides are checked like any other pair). Taken in order along the side, neighbouring twins either keep 0.8 mm apart or **merge into one channel**: centres at most `maxChannelSpacing(r) = 0.4 + √(3.2r² − 0.64)` mm apart (`model/settings.ts`; 20.06 mm for 22 mm slots). Their round bottoms cross at the midpoint, `k = √(r² − Δ²/4)` below the arc centres, and the ridge left between them is `Δ − 2√(r² − (k + 0.8)²)` wide 0.8 mm below its top; `Δ ≤ maxChannelSpacing(r)` keeps that ≥ 0.8 mm, so the ridge is thinner than 0.8 mm only within 0.8 mm of where the bottoms cross. Twins further along are then either further apart or cut away by the slots between them, whose bottoms are lower there.
- **Well faces in the overlap.** Where a slot's round bottom crosses a well face it meets only within its 0.5 mm overlap (its own compartment's or a twin's), it leaves a wedge of the divider between the two; with the solid side of the face toward the slot's centre the wedge is acute. Take, at each such face, the covering twin slot whose centre is nearest (on a tie the one on the solid side, whose bottom is lower there):
  - centre on the contents' side of the face (`dc` from it): the edge at the face is obtuse. But if the next twin toward the solid side (`ds` from the face) merges with that slot, their ridge peaks at the midpoint of the centres, on the face's solid side, and the face leaves half of it, cut vertically. With `k = √(r² − ((dc + ds)/2)²)` the peak's depth below the arc centres and `s = √(r² − (k + 0.8)²)`, that piece is `ds − s + min(0, dc − s)` wide 0.8 mm below the peak (`cutRidgeWidth`, `model/settings.ts`: from the far slot's bottom to the face, or to the near slot's bottom when that is closer, which is the whole ridge, ≥ 0.8 mm by the channel rule). It must be ≥ 0.8 mm. A 22 mm pair 20 mm apart needs the face ≥ 0.4 mm from the peak;
  - centre on the solid side: the face must lie at most `maxWellFaceOffset(r) = 0.4 + √(0.5r² − 0.16)` mm from it (`model/settings.ts`; 8.17 mm for 22 mm slots). The bottom meets the face `k = √(r² − dx²)` below the arc centre, and 0.8 mm lower the wedge is `dx − √(r² − (k + 0.8)²)` wide; `k ≥ dx − 0.8` keeps that ≥ 0.8 mm, which is `dx ≤ maxWellFaceOffset(r)`. So the wedge, too, is thinner than 0.8 mm only within 0.8 mm of its tip;
  - no slot covers the face: every slot whose end lies on its solid side ends ≥ 0.8 mm short of it. A slot end within `SPEC_TOLERANCE` of a face counts as up to it, never as crossing it.

  `model/slot-rules.ts` implements these predicates once, in mm (`keepsApart`, `slotsApart`, `slotsMerge`, `wellFaceProblem`), with a tolerance: sizing places slots with tolerance 0, planTray checks them with `SPEC_TOLERANCE`, so whatever sizing places planTray accepts.

  Everything else is rejected, in particular a partial overlap: a round bottom ending just past a vertical well face leaves a near-vertical feather of the divider (a 22 mm slot ending 0.03 mm inside a neighbouring spare well left 0.04 mm; one ending 0.02 mm past a twin deck's well face left 0.05 mm inside the overlap). With the rule, every other cut stays ≥ 0.8 mm away horizontally at every height, including under the round bottom. Where slots and well faces meet within the overlap, every piece of material is ≥ 0.8 mm wide 0.8 mm below its highest point: the ridge between merged slots, the wedge between a round bottom and a face, and a ridge cut by a face. Thinner material lies only within 0.8 mm of those tips, on sloped tops that `checkPrintability` does not sample; the test helper `geometry/test-wedge.ts` (`thinnestWedge`) measures it from the cut profile, and the sizing sweep and `tray.sizing.test.ts` assert it. Corner reliefs budget against neighbouring slots as against their compartments.

- **Wall cutout semantics** (`{ type: "wallCutout", side, at, width, depth, floorNotch }`, cards and tiles; spec §6.1). A U-cut `width` wide (round bottom of radius `width/2`), centred on `at` along `side` (tray-local x for front/back, y for left/right), cut `depth` below the rim (clamped to the compartment floor). The compartment rectangle has no reach band: across the side the cut runs from the compartment's face to the facing face of the nearest compartment whose range along the side overlaps the cut (`into`, a twin cut on the facing side or a spare), or out through the outer face (and the lip on it; `geometry/plan-cuts.ts`). With `floorNotch` n > 0 its middle 2n goes on down through the floor (a vertical slot) and a half-disc of radius n cuts the compartment's floor at the face, so a fingertip gets under the stack; under a divider that is a hole through the floor. Everything is a vertical prism or open at the top, so nothing overhangs, and every edge it leaves is 90° or more: a cut side meets a well face or the outer face at a right angle, the round bottom meets the vertical sides tangentially, and the lip ends are cut square. Upper trays rest on the ledge and dividers around a cut and are still located by the lip on the other walls and beside the cut.
- **Wall cutout clearance** (planTray, `plan-cuts.ts`; sizing places cutouts by the same rules, §4.7). A wall cutout is centred on its own compartment (`at` within its range along the side) and its sides stay out of the outer walls it runs along (at least the (lipped) outer wall from those faces, so the lip there stays whole). Its footprint keeps `MIN_FEATURE_MM` (along x or y) from every compartment except its own and the one it runs into, and from every finger slot. Two cutouts either keep it too, or cut one channel: the same axis, centre and width with overlapping footprints (the two sides of one divider; with different depths the union is the deeper U); the cuts on opposite sides of one compartment have only its contents between them. A floor notch is at most the cut's half-width and lies within the compartment's range along the side and its floor; two notches on opposite sides leave `MIN_FEATURE_MM` of floor between them. Against the bottom chamfer `c`: where the cutout leaves the tray, the lowest part of the outer face it leaves (its bottom, or the round bottom where the notch meets it) stands `c + MIN_FEATURE_MM` above the bed; its sides keep `distance + bottomZ + (2 − √2)·r − c ≥ MIN_FEATURE_MM` to the faces they run along, and the notch `distance − c ≥ MIN_FEATURE_MM` to every face it does not leave through. A compartment cut on a side that also has a scoop or a finger pocket is rejected (the fillet or reach band would stand free). Corner reliefs shrink until their bounding box keeps `MIN_FEATURE_MM` from every cutout and notch footprint (their own compartment's too), and the outer corner radius shrinks so a cutout's sides meet the straight part of the face they leave through: its footprint corners, and those of its notch (at the bed), count like slot corners in `planCornerRadius`. `tray.sizing.test.ts` builds sizing's cutouts and checks the mesh's genus against the floor holes (`floorHoles`), printability and bounds.
- **`planTray` and `buildTray` reject** a spec by throwing `TraySpecError` (`geometry/errors.ts`, a `RangeError` named `"TraySpecError"`; across the worker it arrives as a `GeometryBuildError` of that name). They reject non-positive or non-finite sizes and non-finite `bottomChamfer`, `cornerRadius` or lip settings; a tray `wall` below `MIN_WALL_MM` (0.9 mm; solid parts and spacers are exempt); on a lipped tray a `lip.thickness` below `MIN_WALL_MM` or a `lip.height` not above the lip chamfer; compartments closer than `MIN_FEATURE_MM` (0.8 mm) to each other, along x or y (so every divider is ≥ 0.8 mm; overlapping and touching ones included); compartments closer to an outer face than the outer wall (`max(wall, lip.thickness + lip.ledge)` when lipped), or whose `floorZ` is outside (0, h). They also reject a finger pocket whose `width`, `reach` or `depth` is not > 0; a compartment whose reach bands (the deepest `reach` on each side) leave less than `MIN_POCKET_CONTENT` (1 mm) for the contents on either axis; finger slots that cut into the outer wall or break the finger slot clearance rule above; a wall cutout whose `width` or `depth` is not > 0, whose `at` or `floorNotch` is not finite or whose `floorNotch` is negative, or that breaks the wall cutout rules above; and a tray or spacer too small for its 45° bottom chamfer `c`: `min(w, d) < 2·(c + 0.8)` or `h < c + 0.8`, where `c = bottomChamfer`, or `max(bottomChamfer, 0.5)` for `level > 0` (spacers always use `bottomChamfer`), plus the bottom chamfer limits below. All these limits, like the wall and outer-wall checks, are compared with a 0.005 mm tolerance (`SPEC_TOLERANCE`): TraySpec numbers are on the 0.01 mm grid, so a spec exactly on a limit passes despite float noise (e.g. content 8.29 − 7.29 mm, or `h = 3.07` with `c = 2.27`). Sizing and layout must never emit such specs. Their tests should assert it (call `planTray(spec, settings)` on every emitted spec).
- **Printability.** planTray's rules are what keep every wall, divider, floor and lip ≥ 0.8 mm: a spec that would build a thinner feature is rejected, never built. `checkPrintability` is a test-time verifier: tests run it on built meshes to confirm the rules leave nothing thinner; production builds don't run it.
- **Lip.** The lip's inner top edge has a `min(0.6, lip.thickness − 0.6)` × 45° chamfer, so its flat top stays ≥ 0.6 mm. Upper trays rest on the ledge: with the lip on, `validateProject` requires an upper tray's bottom chamfer (`effectiveBottomChamfer(s, 1)`, at least 0.5) to be less than `lip.ledge − 2·effective(s).lipPlay` (`field.lipBearing` at `/settings/bottomChamfer`, checked when the chamfer, ledge, play and fit are in range and the chamfer is within `maxBottomChamfer`); `settingsValid` includes it.
- **Bottom chamfer limit.** The 45° chamfer `c` pulls the outer contour in by `e = c − z` at height `z < c` (corner arc radius `R − e`), and the outer corner is never rounder than the chamfer (`R ≥ c`). Everything cut at height `z` must keep 0.8 mm of material to that contour:
  - **Straight faces:** `distance to the nearest outer face + z − c ≥ 0.8` for each compartment (at its `floorZ`) and each finger slot (its lowest line `bottomZ`; for a slot's side ends `bottomZ + (2 − √2)·radius`). `buildTray` rejects a violation with `TraySpecError`.
  - **Corners:** `planCornerRadius` shrinks `R` for every well corner, slot corner and relief circle with the extra margin `e = max(0, c − floorZ)`, and `buildTray` rejects a chamfer that still leaves such a corner under 0.8 mm plus the 0.1 mm `CORNER_MARGIN` on the true arc (`R = c` forced). Corner reliefs keep `e` out of their wall budget.
  - **Settings:** `model/settings.ts` exports `effectiveBottomChamfer(s, level)`, `chamferMinimums(s, level)`, `maxCornerRadius` and `maxBottomChamfer(s) = min(wall + floor − 0.8, wall + (floor − 0.9)/√2, maxCornerRadius(wall, wall, 0))`; the middle term is the sharp corner at `R = c`, whose material is `floor − √2·(c − wall)`, plus the 0.1 mm `CORNER_MARGIN` that every corner term keeps for the polygon approximating the arc (defaults: 1.812 mm). `validateProject` reports a `bottomChamfer` above it as `field.bottomChamfer` at `/settings/bottomChamfer`, and `size()` returns no requirements for settings that fail `settingsValid(s)` (ranges plus this rule and the lip bearing rule above). `lip.height` is at least 1 mm, and `wall` and `lip.thickness` at least `MIN_WALL_MM` = `MIN_FEATURE_MM + CORNER_MARGIN` = 0.9 mm (`SETTING_RANGES`; planTray rejects thinner walls and lips, and `wallFor` never returns less): a sharp cut corner at the wall keeps 0.8 mm to the arc polygon only with that margin (`maxCornerRadius` has none to give a cut closer than 0.9 mm to a face), and the lip ring between two concentric polygons is only `t·cos(Δ/2)` thick at a corner facet, so `checkPrintability` measures a 0.8 mm lip below 0.8 mm (0.9·cos(22.5°) ≈ 0.83 mm passes). Floors and dividers keep their 0.8 mm minimum.
- Geometry may shrink corner-relief and outer-corner radii below `settings.cornerRadius` to keep walls ≥ 0.8 mm. Outer dimensions never change. A relief keeps `MIN_WALL_MM` (0.9 mm) to the outer faces like the outer wall itself: near a rounded outer corner the arc's polygon comes up to 0.08 mm closer than the straight face (a relief budgeted to 0.8 mm beside a 3 mm corner kept only 0.78 mm on the polygon; since geometry 0.1.1).
- `UnsupportedFeatureError` has a `feature: string` property and constructor `(feature: string)`. It is thrown for any `part`, compartment `kind` or feature `type` outside `KNOWN_PARTS`, `KNOWN_COMPARTMENT_KINDS`, `KNOWN_FEATURE_TYPES` (`geometry/types.ts`); `feature` is the feature type, `part:<part>` or `kind:<kind>`. The UI imports the same lists (no copies).
- Main-thread and layout code import `GEOMETRY_VERSION` from `geometry/version`, types from `geometry/types` and the worker client from `geometry/client` only. Importing `geometry/index` pulls manifold-3d and its WASM into that bundle. The root ESLint config forbids every other `geometry/*` module (static and dynamic imports, and the bare `geometry` directory) and `manifold-3d` outside `geometry/`, test files and `test-*.ts` helpers, and a test checks that `client.ts`'s import graph stays inside `geometry/{client,types,version}` and `model/`.
- Ownership: the Renovate `manifold-3d` no-automerge rule belongs to plan 1 (Task 2), not plan 3.

### 4.7 Sizing conventions (from plan 2; binding for plans 4, 5)

- `realizeTray` works in the tray's own (unrotated) frame. For a rotated placement, layout calls `realizeTray` with the unrotated outer, then `rotateRealized(realized, outer)` (90° counter-clockwise; exported from `sizing/index.ts`).
- Spacers: at most one per tray, key `<trayKey>:spacer`, `x/y/z` relative to the tray, height = well depth − 5. Created only when the spacer is buildable: the spare upright stack length is ≥ max(5 mm, 2·(bottomChamfer + 0.8)), the well it fills is ≥ 2·(bottomChamfer + 0.8) deep, and its height (content depth − 5) is ≥ max(5 mm, bottomChamfer + 0.8). Otherwise slack goes to thicker walls/dividers, then a spare compartment.
- `RealizedTray.compartments[i]` corresponds to `part.compartments[i]`; spare compartments come after.
- `RealizedTray.wall` = `max(settings.wall, MIN_WALL_MM)` rounded up to 0.01 mm, the base wall, never the lipped one.
- `wallFor(settings, lipped)` is exported from `sizing/index.ts`: the outer wall, `max(settings.wall, MIN_WALL_MM)`, and at least `lip.thickness + lip.ledge` on a lipped tray. Plan 4 must use it instead of re-deriving the (lipped) wall, rounded up to 0.01 mm like sizing. The finger room of cut walls is inside `minOuter` and `realizeTray` (compartments start further in); `TraySpec.wall` stays the base wall.
- `RealizeOptions.lipped` only takes effect when `settings.lip.enabled`. Upper trays (`level > 0`) are at least `lip.height + 3` tall.
- `minOuter` widens the inner span to `fingerPocket.width` on sides that carry a finger pocket, so tiny minis and custom pieces still get a usable slot. Wall cutouts need no room of their own.
- **Wall cutouts** (`sizing/cutouts.ts`, after the finger slots and spares are placed). Upright cards and tiles ask for cutouts on their left and right (the walls their faces touch, half the shallowest well deep); flat cards on their left and right (long side along Y), flat tiles on the two walls along their longer side (front and back when the footprint is wider than deep, else left and right), both down to the floor with a floor notch. A request's cut runs out through the outer wall when no compartment lies across its side, into a spare there, or across the divider into a compartment that asks for a cut on the facing side, faces it (each is the other's nearest across) and is centred within 0.01 mm of it; toward anything else (bits, minis, custom wells, the other row's wells) it is left out. The cuts so linked, and those on both sides of one compartment, form a run: one channel centred on its first member, as wide as `fingerPocket.width` (rounded up to an even unit count) or the room it has: its sides keep out of the outer walls along it and of the bottom chamfer's corner zone (`max(wall, chamfer)` from those faces), and reach at most half way into the gap to any other compartment or finger slot within `MIN_FEATURE_MM` of its cuts, less `MIN_FEATURE_MM / 2`, so the other row's channel keeps the other half (rows2: each row has its own channel; the divider between the rows stays whole). Depth: to its own floor for flat contents, half the run's shallowest well for upright ones, and where it leaves the tray at most so deep that the lowest part of the outer face it leaves stands `chamfer + MIN_FEATURE_MM` above the bed. The floor notch is `fingerPocket.floorNotch`, at most the half-width, inside the compartment along the side, `MIN_FEATURE_MM` short of an opposite notch, and `chamfer + MIN_FEATURE_MM` from the outer faces; under 1 mm it is left out. Cutouts never fail: no `SlotFitError`, no minimum width.
- **Finger room.** `fingerPocket.wallRoom` (0 = off; simple mode "Extra finger room in the box" = `FINGER_ROOM_MM` = 10 mm) thickens the outer walls cutouts leave through, inward: per row on the left and right where the row's first or last compartment asks for a cutout there, at the front where row 0 asks for front cutouts and at the back where the last row asks for back ones. `minOuter` grows by the room on each such wall (a strip of upright decks is 2 × 10 mm longer); dividers and the other walls are unchanged. A spare compartment at the end of a row (or the spare row) takes the room instead: the cutout runs into it.

- Finger slots (`sizing/slots.ts`) satisfy the finger slot clearance rule (§4.6): compartments whose pockets share a band line are twins; any other compartment within 0.8 mm of the band blocks them. A run of twins between two blockers shares one slot width (at most `fingerPocket.width`); each slot is centred on its contents (minus the spacer) as far as the run's room allows: inside the outer walls and at most half way into the gap to a blocker, less 0.4 mm, so it keeps 0.8 mm from the blocker and from any slot reaching toward it from the other side. Neighbouring twins that overlap merge into one channel when their centres are at most `maxChannelSpacing` apart (the channel takes its members' smallest depth). A pair that neither merges nor keeps apart, or a well face that does not hold (crossed too far from the nearest slot's centre, cutting a merged ridge too close to its peak, or a slot ending less than 0.8 mm short of it), first moves one slot (toward merging, or the smallest move of a nearby slot, at most 5 mm, that makes the face hold) as long as the slot stays in the room and still covers the centre of its own contents; otherwise the run's width shrinks (by 0.1 mm steps for a well face).
- Slots are never narrower than `min(MIN_SLOT_WIDTH, fingerPocket.width)` (`MIN_SLOT_WIDTH` = 15 mm, `model/settings.ts`). If a run cannot keep that width, `realizeTray` throws `SlotFitError("Tray <key>: cannot fit a finger slot of at least <w> mm for <contents>")` (§4.2). Only minis pockets and custom wells have finger slots; at the default settings this happens for tiny pockets of different depths side by side (their slots run on two band lines and block each other). `minOuter` widens such a part until its slots fit (by up to `fingerPocket.width`), so a part that `realizeTray` refuses at `minOuter` is refused at every outer (§4.2), and `size()` already dropped variants that fail unlipped at level 0. A lipped tray (thicker wall) or an upper one may still fail.
- **Plan 4's duty.** Layout treats a part whose `realizeTray` throws `SlotFitError` as infeasible for that (lipped, level): it never places it so, and it caches realizability per (part, lipped, level) instead of calling `realizeTray` again for every candidate outer. `materialize` catches only `SlotFitError` (it cannot occur there for a pair the feasibility check passed, but stays a defined failure); every other error is a bug and propagates.
- Spare compartments take only room no slot needs: a spare starts 0.8 mm past every finger slot it would otherwise come within 0.8 mm of, and is dropped when that leaves less than `MIN_SPARE`; the slack then stays solid. Wall cutouts may run into a spare.
- `cardStackClearancePct` is a fraction (0.03). It is not in `Effective`; sizing multiplies it by `fit`.
- Sizing never sees the box. It emits variants (tile column counts, minis lying, all storages under `auto`). Layout treats a variant whose `minOuter` exceeds the available height or bed as infeasible and tries the others.
- `hasGrip(compartments: readonly CompartmentSpec[])` (sizing) checks spec rule 8 (pass `realized.compartments`): a compartment ≥ 25 mm across, a finger pocket or a wall cutout.
- Every variant of a requirement uses the same trayKeys (`<key>:p<player>:<part>`, spec §5), so a `TraySpec` alone doesn't say which variant it came from. Plan 4 infers it from the stored trays (`inferVariant`: matching key set, then compartment minimums) for warm starts, lock hints and its hard-rule checker.

### 4.8 Layout conventions (from plan 4; binding for plan 5)

- Extra exports. From `layout/index.ts`: `swapLocks(locks: Lock[], keyA: string, keyB: string, layout: StoredLayout): Lock[]` (the only swap implementation; it also adds stack locks so swapped stacks keep their order) and `NOTICE_CODES`. From `layout/client.ts`: `LayoutCancelledError` (a cancelled or superseded run rejects with it), `LayoutClient`, `WorkerLike`, `createLayoutClientWith(factory)`.
- Sizing exports `rotateRealized(r, outer)` and `hasGrip(compartments)` in addition to §4.2.
- Notice codes: `layout.coverage`, `layout.play`, `layout.lipOff`, `layout.capped` (info), `layout.bed` (error), `layout.doesNotFit` (error), `lock.dropped`. A `lock.dropped` notice has `path: "/locks/<index>"`, the dropped lock's index in `LayoutInput.locks` (= `project.locks`). Plan 5 removes those locks when it accepts the result and stores the layout under the post-prune `inputsHash`, so it isn't stale and nothing re-runs.
- The `iterations` argument of `optimize`, `createRun` and the client's `run` is **this run's** budget. `StoredLayout.iterations` is cumulative: `warmStart.iterations` + this run's budget (or the iterations actually run when `capped`); without a warm start, just this run's. Determinism: same input + warm start + seed + iterations → same result. "Improve more" (spec §7.2) = `run(input, layout.seed, 3 × DEFAULT_ITERATIONS, layout, …)`. A leftover's `TraySpec.path` is its leaf's path, and each leftover piece has its own `stack` number.
- `DEFAULT_ITERATIONS = 50000`. Recalibrate with `CALIBRATE=1 npx vitest run src/layout/optimize.calibrate.test.ts`.
- If no layout fits with the locks, a second run without them follows, and each lock it gives up gets a `lock.dropped` notice.

### 4.9 Shared files (who changes what)

Later plans edit these files in place and keep everything earlier plans put there. Steps that change a config file show the whole resulting file.

- `apps/insert-generator/package.json` and its lockfile: plan 1 creates them with every §2 dependency. Later plans only run `npm install <pkg>@<§2 range>` (a no-op when present); plan 5 Task 23 changes only the `build` script (appends the smoke step).
- `tsconfig.json` (app, `src/`): plan 1 only. `tsconfig.node.json` (Node-side config, `@types/node`): plan 1 creates it for `vite.config.ts`; plan 5 Task 22 adds `licenses.config.ts`.
- `vite.config.ts`: plan 1 creates it; plan 3 Task 6 adds `worker` and `optimizeDeps`; plan 5 Task 15 adds `test.css`, Task 22 the license plugin, Task 23 `scripts/**/*.test.mjs` in `test.include`.
- `index.html`, `src/main.tsx`, `src/app/App.tsx` (+ test), `src/style.css`, `README.md`, `app.json`: plan 1 placeholders; plan 5 Tasks 21 and 24 replace them, keeping the preview banner, the version footer and the "All apps" link.
- Root `eslint.config.mjs` and `renovate.json`: plan 1 Task 2 creates them. Plan 3 adds the insert-generator blocks to `eslint.config.mjs`: the main-thread guard (outside `geometry/`, app code may import only `geometry/{types,version,client}` and never `manifold-3d`, statically or dynamically; §4.6) and the rule that production code anywhere in `src/` never imports test-only helpers (`**/test-*`). Later plans keep both.

## 5. Fixtures

Until the user supplies real measured games (spec §12), plans use synthetic
fixtures in `apps/insert-generator/test/fixtures/` (plan 1 creates them):

- `cards-heavy.json` — 290 × 290 × 70 box, headroom 8, 6 decks of Standard cards (sleeved, 40–90 cards each).
- `bits-heavy.json` — 300 × 220 × 60 box, headroom 4, 4 bulk components, one `perPlayer: 4`.
- `tiles-minis.json` — 300 × 300 × 80 box, headroom 10, 60 hex tiles (flatToFlat 40, 2 mm), 12 minis.
- `tiny-box.json` — 150 × 100 × 40 box with too many cards (infeasible case).

All four are valid at `SCHEMA_VERSION`.
