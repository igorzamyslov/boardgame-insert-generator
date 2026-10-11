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
- Versions start at app `0.1.0`, `SCHEMA_VERSION = "0.1.0"`, `GEOMETRY_VERSION = "0.1.0"`. Pre-1.0 makes no compatibility promise (spec §9).
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
  fingerPocket: { width: number; reach: number };
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
  type: "fingerPocket" | "scoop" | "cornerRelief";
  side?: Side; // fingerPocket, scoop
  depthFraction?: number; // fingerPocket: 1/3 or 1 (full)
  perItem?: boolean; // fingerPocket: one per deck/pocket along the side
}

export interface CompartmentReq {
  componentId: string;
  contents: string; // label, e.g. "Main deck ×52"
  kind: "well" | "scoop" | "pocket";
  minW: number; // inner, mm, finger-pocket reach included
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
  id: string; // stable, e.g. "upright-long|rows1|split1"
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
```

- `size` groups components by `groupId`, expands `perPlayer`, and skips nothing silently: problems become `Notice`s.
- `minOuter` returns the smallest outer box that holds the part (walls, dividers, floor, lipped wall included). `h` = floor + max compartment `minH`.
- `realizeTray` spreads slack in `outer` over the compartments (elastic axes first, then dividers/walls inward up to `min(2 × setting, 4)`, with upright card/tile stack slack becoming a spacer first when ≥ 5 mm (§4.7), otherwise thicker dividers/walls, then an extra `spare` compartment). It raises floors so every compartment top is at the rim (`floorZ = h − compartment content depth`, never below `settings.floor`). It throws `RangeError` if `outer` is smaller than `minOuter` on any axis.

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
export const GEOMETRY_VERSION: string;
// src/geometry/client.ts
export function createGeometryClient(): {
  build(spec: TraySpec, settings: Settings): Promise<{ mesh: Mesh; volumeMm3: number }>;
  dispose(): void;
};
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
export const SCHEMA_VERSION: string; // "0.1.0"
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

### 4.6 Geometry conventions (from plan 3; binding for plans 2, 4, 5)

- **Finger pocket semantics.** A compartment's rectangle includes a solid band `reach` deep along the pocket's `side`. The U-slot (`width` wide) is cut into that band. `at` = slot centre in tray-local coordinates along that side (x for front/back, y for left/right). `depth` is measured down from the rim and clamped to the floor. A slot may cross dividers but must not enter the outer wall: sizing must shift `at` inward for narrow decks at the strip ends.
- **`buildTray` rejects** (throws `RangeError`) compartments that overlap or touch each other, that come closer to an outer face than the outer wall (`max(wall, lip.thickness + lip.ledge)` when lipped), or whose `floorZ` is outside (0, h). Sizing and layout must never emit such specs. Their tests should assert it.
- Geometry may shrink corner-relief and outer-corner radii below `settings.cornerRadius` to keep walls ≥ 0.8 mm. Outer dimensions never change.
- `UnsupportedFeatureError` has a `feature: string` property and constructor `(feature: string)`. It is thrown for any `part`, compartment `kind` or feature `type` outside `KNOWN_PARTS`, `KNOWN_COMPARTMENT_KINDS`, `KNOWN_FEATURE_TYPES` (`geometry/types.ts`); `feature` is the feature type, `part:<part>` or `kind:<kind>`. The UI imports the same lists (no copies).
- Main-thread and layout code import `GEOMETRY_VERSION` from `geometry/version` and types from `geometry/types` only. Importing `geometry/index` pulls manifold-3d and its WASM into that bundle.
- Ownership: the Renovate `manifold-3d` no-automerge rule belongs to plan 1 (Task 2), not plan 3.

### 4.7 Sizing conventions (from plan 2; binding for plans 4, 5)

- `realizeTray` works in the tray's own (unrotated) frame. For a rotated placement, layout calls `realizeTray` with the unrotated outer, then `rotateRealized(realized, outer)` (90° counter-clockwise; exported from `sizing/index.ts`).
- Spacers: at most one per tray, key `<trayKey>:spacer`, `x/y/z` relative to the tray, height = well depth − 5. Created only when the spare upright stack length is ≥ 5 mm. Otherwise slack goes to thicker walls/dividers, then a spare compartment.
- `RealizedTray.compartments[i]` corresponds to `part.compartments[i]`; spare compartments come after.
- `RealizedTray.wall` = `max(settings.wall, 0.8)`, the base wall, never the lipped one.
- `RealizeOptions.lipped` only takes effect when `settings.lip.enabled`. Upper trays (`level > 0`) are at least `lip.height + 3` tall.
- `minOuter` widens the inner span to `fingerPocket.width` on sides that carry a pocket, so tiny decks still get a usable slot.
- `cardStackClearancePct` is a fraction (0.03). It is not in `Effective`; sizing multiplies it by `fit`.
- Sizing never sees the box. It emits variants (tile column counts, minis lying, all storages under `auto`). Layout treats a variant whose `minOuter` exceeds the available height or bed as infeasible and tries the others.
- `hasGrip(compartments: readonly CompartmentSpec[])` (sizing) checks spec rule 8 (pass `realized.compartments`).
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
- Root `eslint.config.mjs` and `renovate.json`: plan 1 Task 2 only.

## 5. Fixtures

Until the user supplies real measured games (spec §12), plans use synthetic
fixtures in `apps/insert-generator/test/fixtures/` (plan 1 creates them):

- `cards-heavy.json` — 290 × 290 × 70 box, headroom 8, 6 decks of Standard cards (sleeved, 40–90 cards each).
- `bits-heavy.json` — 300 × 220 × 60 box, headroom 4, 4 bulk components, one `perPlayer: 4`.
- `tiles-minis.json` — 300 × 300 × 80 box, headroom 10, 60 hex tiles (flatToFlat 40, 2 mm), 12 minis.
- `tiny-box.json` — 150 × 100 × 40 box with too many cards (infeasible case).

All four are valid at `SCHEMA_VERSION`.
