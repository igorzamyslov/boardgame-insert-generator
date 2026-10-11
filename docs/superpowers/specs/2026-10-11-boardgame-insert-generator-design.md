# Board Game Insert Generator — Design

Date: 2026-10-11 · Status: approved for planning · App: `apps/insert-generator/`

## 1. Goal

A static web app (no backend) that takes a board game box and its components
and produces a 3D-printable insert: a set of trays that fills the box,
keeps everything in place when the box is carried or tipped, opens upward,
stacks cleanly, and fits the user's print bed. Output: per-tray 3MF/STL files
and printable assembly pictures.

### Why build it

Research (2026-10) found no tool that does box-first automatic layout:

- Boardgame Insert Toolkit (BIT) / BGSD — OpenSCAD, manual layout, unclear
  license (cannot be bundled).
- Deck in a Box — web, single tray, no whole-box layout.
- Gridfinity Layout Tool — web, auto-splits baseplates to the bed, manual bin
  placement; not box-specific.
- MakerWorld parametric generator — packs components into the _smallest box_,
  not into a given box (claim unverified).
- Broken Token / Folded Space — commercial, per game.

BoardGameGeek's XML API requires a registered token since 2025 and blocks
anonymous browser calls, so the app does not depend on it. Users measure their
box.

## 2. Scope

### In v1

- Component types: cards, bulk bits, tiles, miniatures, custom block.
- Automatic layout with lock / swap and re-optimize.
- Simple and advanced input modes.
- 3D preview and 2D plan view.
- Export: 3MF per tray, combined 3MF, optional STL zip.
- Assembly pictures (printable page → PDF via browser, PNG per layer).
- Share via URL hash; autosave; JSON import/export.

### Not in v1 (future releases)

- Lids of any kind (sliding, cap, magnetic).
- Cover sheet (thin plate over the top layer).
- Flush stacking interlock (matching chamfered groove under the upper tray so
  stacked trays share the same outer footprint).
- Trays larger than the print bed, split and joined.
- Embossed labels.
- Bundled game presets library.
- Calibration test print.
- Print-time estimate.

## 3. Hard rules (every generated layout satisfies all of them)

1. **No lateral movement.** Trays tile the box floor completely. The only gap
   is the configured tray-to-box clearance (default 0.5 mm per side).
2. **No vertical movement.** Every stack reaches the same top plane:
   `topPlane = box.innerHeight − box.headroom + settings.topPressFit`
   (`topPressFit` default 0, range 0–1 mm). Headroom items (boards, rulebooks,
   punchboards) lie directly on the tray rims.
3. **Closed from above.** Every compartment is covered by the tray stacked
   on it, by the headroom items, or (with zero headroom) by the box lid.
   The app warns when it cannot ensure this (see §7.3).
4. **Clean stacking.** A stacked tray sits inside the lower tray's chamfered
   locating lip (§6.1) and cannot shift.
5. **Fits the bed.** Every tray fits the printer's X × Y × Z, in either
   XY rotation.
6. **Openings face up.** Box orientation = print orientation. No supports,
   no bridges, no ceilings.
7. **Contents fit.** Each compartment meets its minimum inner size, clearances
   included.

## 4. Architecture

Vite + TypeScript + Preact (with signals), following the repo's built-app
conventions (`base: "./"`, output to `dist/`, `app.json`, README). Libraries:
`manifold-3d` (Apache-2.0, WASM CSG), `three` (preview), `fflate` (zip +
URL compression). No copyleft dependencies.

Each module is a pure, independently tested unit with plain-data interfaces:

| Module          | Responsibility                                                                   | Interface                                                |
| --------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `model/`        | Types, project schema, defaults, version migration                               | `Project`, `parseProject(json) → Result<Project>`        |
| `sizing/`       | Component + settings → tray requirements with size variants                      | `size(component, settings) → TrayRequirement[]`          |
| `layout/`       | Optimizer (runs in a Web Worker, deterministic per seed)                         | `optimize(input, seed, budget) → LayoutResult`           |
| `geometry/`     | Tray spec → manifold mesh (Web Worker)                                           | `buildTray(spec) → Mesh`                                 |
| `export/`       | 3MF and STL writers, zip                                                         | `to3mf(meshes) → Uint8Array`, `toStl(mesh) → Uint8Array` |
| `viewer/`       | three.js scene: box outline, trays, explode slider, layer toggle, tray selection | Preact component, props: layout + meshes                 |
| `plan/`         | 2D top-down per-layer view; drag-to-swap and lock                                | Preact component, emits lock/swap edits                  |
| `instructions/` | Per-layer SVG diagrams + packing order; printable page; PNG                      | `render(layout, project) → SVG[]`                        |
| `share/`        | URL hash encode/decode, autosave (localStorage, wrapped in try/catch), JSON file | `encode(project) → string`, `decode(string) → Result`    |
| `ui/`           | Input forms (simple/advanced), results summary, warnings                         | Preact components                                        |

**Data flow:** edit `Project` → `sizing` (sync) → `layout` worker (debounced,
progress events, "improve more" button) → `LayoutResult` → `geometry` worker
(per tray, on demand) → viewer / export / instructions.

## 5. Data model

All lengths in millimetres.

```ts
interface Project {
  schemaVersion: string; // semver, see §9
  name: string;
  box: {
    innerWidth: number;
    innerDepth: number;
    innerHeight: number;
    headroom: number; // height of boards/rulebooks lying on top
    headroomCoverage: "full" | "partial"; // do headroom items cover the whole footprint
    storedOnSide: boolean; // stricter coverage warnings
  };
  printer: { bedX: number; bedY: number; bedZ: number };
  settings: Settings;
  components: Component[];
  locks: Lock[];
  layout?: StoredLayout; // last accepted layout, see §8.4
}

type Component = CardsComponent | BulkComponent | TilesComponent | MinisComponent | CustomComponent;

interface ComponentBase {
  id: string;
  name: string;
  access: "often" | "sometimes" | "setup"; // play-time access frequency
  groupId?: string; // same group → same tray, separate compartments
  clearance?: number; // advanced override
}

interface CardsComponent extends ComponentBase {
  kind: "cards";
  cardWidth: number;
  cardHeight: number; // from size presets or custom
  decks: { name: string; count: number }[];
  thickness:
    | { mode: "preset"; sleeve: "none" | "standard" | "premium" }
    | { mode: "measured"; cards: number; stackMm: number };
  storage: "upright" | "flat" | "auto";
}

interface BulkComponent extends ComponentBase {
  kind: "bulk";
  items: (
    | { count: number; w: number; d: number; h: number } // tokens, cubes, dice, coins
    | { volumeMl: number }
  )[];
  perPlayer?: { players: number }; // one tray per player
}

interface TilesComponent extends ComponentBase {
  kind: "tiles";
  shape: "square" | "rect" | "hex";
  w: number;
  d: number; // hex: flat-to-flat in w, d ignored
  thickness: number;
  count: number;
  storage: "flat" | "upright" | "auto";
}

interface MinisComponent extends ComponentBase {
  kind: "minis";
  figures: { name: string; w: number; d: number; h: number; count: number }[];
  storage: "pockets" | "bulk";
}

interface CustomComponent extends ComponentBase {
  kind: "custom";
  w: number;
  d: number;
  h: number;
}

type Lock =
  | { kind: "position"; trayKey: string; x: number; y: number; rotated: boolean }
  | { kind: "size"; trayKey: string; w: number; d: number; h: number }
  | { kind: "stack"; trayKeys: string[] }; // keep this stack as-is
```

`trayKey` is a stable ID derived from component IDs (and the player index for
per-player trays), so locks survive edits to unrelated components.

### Defaults (`Settings`)

| Setting                     | Simple-mode control          | Default          |
| --------------------------- | ---------------------------- | ---------------- |
| Wall                        | thin / normal / sturdy       | 1.2 / 1.6 / 2.0  |
| Floor                       | —                            | 1.2              |
| Divider                     | —                            | 1.2              |
| Fit (scales all clearances) | tight / normal / loose       | ×0.7 / ×1 / ×1.4 |
| Card clearance (W, L)       | via Fit                      | +1.5             |
| Card clearance (stack)      | via Fit                      | +1.0             |
| Tile / mini clearance       | via Fit                      | +1.0             |
| Tray-to-box clearance       | via Fit                      | 0.5 per side     |
| Vertical corner radius      | advanced                     | 3                |
| Scoop radius                | advanced                     | 12               |
| Finger notch width / depth  | advanced                     | 22 / ⅓ of well   |
| Locating lip on/off, height | advanced                     | on, 1.5          |
| Top press-fit               | advanced                     | 0                |
| Bulk packing factor         | advanced                     | 0.6              |
| Leftover handling           | advanced: spare tray / solid | spare tray       |
| Round walls to line width   | advanced: off / nozzle mm    | off              |

Card thickness presets per card: none 0.32, standard sleeve 0.42, premium
sleeve 0.6. A measured stack overrides them. Card size presets: Standard
63.5×88, Standard American 56×87, Euro 59×92, Mini Euro 44×68, Mini American
41×63, Tarot 70×120, French Tarot 61×112, Extra Large 65×100, Dixit 80×120.
Sleeving adds about +3 mm to width and height. Bed presets: 256³ (Bambu),
250×210×220 (Prusa MK4), 220×220×250 (Ender 3), custom.

## 6. Geometry

### 6.1 Common to all trays

- Outer block with rounded vertical corners. Walls, floor and dividers come
  from settings.
- Walls are vertical and the top is open. Floor fillets are concave. Finger
  notches are U-shaped cuts down from the top. No bridges or ceilings.
- **Locating lip** (when a tray has a tray stacked on it): the lower tray's
  outer wall rises `lipHeight` above the rim, with a 45° chamfer on the inside.
  The upper tray's footprint is inset by `wall/2 + 0.3 mm` per side. It rests on
  the inner half of the lower tray's walls and on its dividers, and the chamfer
  guides it into place. A finger notch in the lip lets you lift the upper tray.
  Stack height accounting includes `lipHeight`.
- Meshes come out of manifold and are watertight by construction.

### 6.2 Per type

| Type           | Shape                                                    | Notes                                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cards, upright | One well per deck, dividers between                      | Card stands on its long edge (variant: short edge). Well depth ≥ standing height + clearance. Finger notch through both long walls. Spare stack length goes to a removable card spacer, or to thicker dividers. |
| Cards, flat    | Rectangular well                                         | Half-round finger cutouts through both short walls, full depth.                                                                                                                                                 |
| Bulk           | Scoop tray, N compartments (one per item line)           | Front floor fillet (`scoopRadius`). Per-player gives one tray per player.                                                                                                                                       |
| Tiles, flat    | Square/rect/hex well                                     | Corner-relief circles. Finger cutouts on two opposite sides.                                                                                                                                                    |
| Tiles, upright | As upright cards                                         | —                                                                                                                                                                                                               |
| Minis, pockets | One rounded pocket per figure (bounding box + clearance) | Finger notch per pocket. The tallest figure sets a minimum tray height.                                                                                                                                         |
| Minis, bulk    | As bulk                                                  | Volume from bounding boxes × packing factor.                                                                                                                                                                    |
| Custom         | Plain well                                               | —                                                                                                                                                                                                               |
| Leftover       | Open "spare" tray (default) or solid block               | Fills space that can't be used, so the box is always full.                                                                                                                                                      |

## 7. Layout engine

### 7.1 Sizing

`sizing` turns each component (or group) into `TrayRequirement`s:

- the minimum inner size of each compartment;
- which axes can grow ("elastic") and by how much: for upright cards only stack
  length; for bulk any axis, as long as volume stays ≥ required;
- whether the tray may be rotated in XY;
- the `access` priority;
- **size variants**: e.g. cards upright on the long or short edge, or flat;
  one or two rows of decks; bulk wide-and-shallow vs narrow-and-deep;
  minis in pockets split across 1–3 trays.

Stored with `storage: "auto"` → `sizing` emits all variants. Otherwise only
the chosen ones.

### 7.2 Search

- **Representation:** a guillotine tree over the box floor
  (`innerWidth − 2·boxClearance` × `innerDepth − 2·boxClearance`). Internal
  nodes are X or Y cuts. Each leaf is a **stack**: an ordered list of trays,
  all with the leaf's footprint (minus the lip inset for upper trays). The
  stack's total height equals `topPlane`.
- **Fill:** after placement, slack is shared out. First it goes to elastic
  axes. Then to divider and wall thickness, up to a cap. Then height goes to
  the tray in the stack that benefits most (deeper scoop), or to a raised
  floor (hollow false floor). Whatever is left becomes a leftover tray.
- **Search:** several greedy starting layouts, then simulated annealing.
  Moves: swap leaves, flip a cut axis, move a cut, change a variant, rotate,
  reorder a stack, merge or split a stack. Runs in a Web Worker, deterministic
  for a given seed, with a time budget (default 3 s; "improve more" adds 10 s).
  Reports progress and the best result so far.
- **Score** (lower is better; weights are internal constants, tuned against
  fixtures):
  - leftover volume;
  - number of stacked trays (beyond one per stack);
  - access penalty: `often` items under other trays;
  - tray count;
  - filament volume.
- **Locks:** locked positions, sizes and stacks are fixed in the tree. Moves
  never change them. Drag-to-swap in the plan view = swap two leaves, lock
  both, re-optimize.

### 7.3 Infeasibility and warnings

- **Doesn't fit:** report the closest attempt and the shortfall per axis,
  plus concrete suggestions: unsleeve, store flat or upright, lower the
  headroom, loosen fit, split groups.
- **Coverage:** if `headroom > 0`, `box.headroomCoverage` says whether the
  headroom items cover the full footprint. When `partial`, warn about top-layer trays
  holding small loose bits and suggest moving them below other trays.
  `storedOnSide` makes the warnings stricter (any loose bits in the top layer
  → warning).
- **Bed:** a requirement too large for the bed in every variant → error
  naming the component.

## 8. UI

### 8.1 Layout

One page. Inputs on the left (Box → Components → Settings), results on the
right (summary, plan view, 3D view, export). A global Simple ⇄ Advanced toggle
plus a per-component "more options" section. On narrow screens the panels stack.

### 8.2 Inputs

- **Box:** inner W × D × H (hint: measure at the narrowest point), headroom,
  stored-on-side, bed preset.
- **Components:** add cards / bits / tiles / minis / custom. Simple fields:
  type, size preset, count, access. Advanced: overrides from §5.

### 8.3 Results

- **Summary:** box fill %, tray count, stack count, filament in grams
  (PLA 1.24 g/cm³), warnings.
- **Plan view:** per-layer top-down drawing; click to select, drag to swap,
  lock toggle.
- **3D view:** explode slider, layer toggle, click a tray for contents and
  dimensions.
- **Export:**
  - zip of one 3MF per printed part: trays, plus any card spacers (named
    `NN-<contents>.3mf`);
  - one combined 3MF with all trays as separate objects;
  - optional STL zip.
- **Assembly page:** per-layer numbered SVG, "what goes where" list, packing
  order (bottom first). Printable via the browser (PDF), PNG download per
  layer.

### 8.4 Persistence and sharing

- `Project` (inputs + `layout`, the last accepted layout) is autosaved to
  localStorage and encoded into the URL hash (JSON → deflate → base64url).
  "Copy link" button. JSON file import/export.
- The stored layout makes a shared link show exactly the same insert even
  after the optimizer changes. Loading a project never re-optimizes. The
  optimizer runs only after an input edit (debounced) or when the user clicks
  "Re-optimize".

## 9. Versioning

Both the app and the project schema use semver `MAJOR.MINOR.PATCH`. **Only a
MAJOR bump may break backward compatibility.**

- **Schema (`Project.schemaVersion`):**
  - PATCH: clarifications or fixes with no change to the shape.
  - MINOR: additive only. New optional fields with defaults, new enum values,
    new component kinds.
  - MAJOR: anything that removes, renames or changes the meaning of a field.
- **Loading rules** (app schema `A.b.c`, file `X.y.z`):
  - `X == A`, `y ≤ b` → load, filling in defaults for missing fields.
  - `X == A`, `y > b` (newer file) → load, ignore unknown fields, show a
    "made with a newer version" warning.
  - `X < A` → run the registered migrations `X → … → A`. If no migration
    exists, show an error naming both versions; never a silent failure.
  - `X > A` → refuse with "requires app version X.x".
- **App version** (`package.json`, shown in the footer):
  - MAJOR when the schema MAJOR changes, or when the same saved project would
    produce an incompatible export.
  - MINOR for features, including optimizer improvements. Stored layouts keep
    shared links stable.
  - PATCH for fixes.
- Before the first release the app is `0.x` and makes no compatibility
  promise. The first release is app `1.0.0` / schema `1.0.0`, and the rules
  above apply from then on.

## 10. Error handling

- Field-level validation (positive numbers, card count ≥ 1, etc.), shown
  next to the field.
- Infeasible layout and coverage warnings as in §7.3.
- Worker or WASM failures: a visible error with retry; the last good result
  stays on screen.
- Corrupt or unknown URL hash or file: error with the reason; the current
  project is kept.
- localStorage unavailable: the app works normally and autosave is off
  (with a notice).

## 11. Testing

- **Vitest** for the pure modules (`model`, `sizing`, `layout`, `share`,
  `export`, `instructions`).
- **Layout properties**, on randomized inputs plus fixture games: every result
  satisfies all §3 hard rules (tiling with no gaps, equal stack heights,
  bed fit, minimum sizes, locks respected). Same seed gives the same result.
- **Geometry:** per tray type, the mesh is manifold, and its volume and bounding
  box match the spec. Snapshot of the 3MF XML structure.
- **Schema:** round-trip encode/decode, and loading each loading rule's case
  in §9 (older minor, newer minor, older major with and without migration,
  newer major).
- **Fixtures:** 3–5 real games measured by hand (one card-heavy, one bits-heavy,
  one with tiles, one with minis), used for tuning and regression.
- The repo's `npm run verify` (lint, format, build) passes.
