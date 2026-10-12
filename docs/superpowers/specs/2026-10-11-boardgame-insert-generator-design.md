# Board Game Insert Generator — Design

Date: 2026-10-11 · Status: approved; implementation planned (see `docs/superpowers/plans/`) · App: `apps/insert-generator/`

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
  not into a given box (per its listing).
- Broken Token / Folded Space — commercial, per game.

BoardGameGeek's XML API requires a registered token since 2025 and blocks
anonymous browser calls, so the app does not depend on it. Users measure their
box.

## 2. Scope

### In v1

- Component types: cards, bulk bits, tiles, miniatures, custom block.
- Automatic layout with lock / swap and re-optimize.
- Simple and advanced input modes. Decimal comma or point accepted.
- 3D preview and 2D plan view.
- Export: 3MF per printed part, combined 3MF, optional STL zip.
- Assembly pictures (printable page → PDF via browser, PNG per layer).
- Share via URL hash; local project list with autosave; JSON import/export.

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
- Inch input.
- Cross-engine bit-identical layouts (see §7.2 Determinism).
- Frozen versioned builds (e.g. `…/insert-generator/v1/`).

## 3. Hard rules (every generated layout satisfies all of them)

1. **No lateral movement.** Trays tile the box floor. The only gaps are the
   tray-to-box clearance (`boxClearance`, default 0.5 mm per side) and the
   gap between neighbouring trays (`trayGap`, default 0.2 mm total), which
   absorbs printed oversize. Nominal play per axis =
   `2·boxClearance + (n − 1)·trayGap`, where `n` is the most trays crossed
   along that axis: about 1–1.5 mm at Fit "normal". It is shown per axis in
   the summary; above 1.5 mm it is penalized (§7.2) and warned about.
2. **No vertical movement.** Every stack reaches the same top plane:
   `topPlane = box.innerHeight − box.headroom + settings.topPressFit`
   (`topPressFit` default 0, range −2…+1 mm). Stack height = Σ `tray.h`
   (the lip is excluded, §6.1). Headroom items (boards, rulebooks,
   punchboards) lie directly on the tray rims.
3. **Closed from above.** Every compartment is covered by the tray stacked
   on it, by the headroom items, or (with zero headroom) by the box lid.
   Where that can't be ensured (partial headroom coverage, box stored on its
   side), the optimizer avoids it via the score and the layout carries an
   explicit warning (§7.3).
4. **Clean stacking.** A stacked tray sits inside the lower tray's chamfered
   locating lip (§6.1) and cannot shift more than `lip.play` per side.
   With the lip turned off this is not ensured, and the app warns when a
   layout has stacked trays.
5. **Fits the bed.** Every printed part fits the usable bed
   `(bedX − 2·bedMargin) × (bedY − 2·bedMargin) × bedZ`, in either XY rotation.
6. **Openings face up.** Box orientation = print orientation. No supports,
   no bridges, no ceilings: no downward-facing surface above z = 0 steeper
   than 45° from vertical. Raised floors are solid.
7. **Contents fit.** Each compartment meets its minimum inner size,
   clearances included.
8. **Every tray has a grip.** Either a compartment whose smaller inner
   dimension is ≥ 25 mm or a wall cutout (§6.1). The finger cuts of cards,
   tiles, minis pockets and custom wells cut through outer walls (and the lip
   on them) and dividers, keeping a post at each end. Upper trays are lifted
   the same way.

## 4. Architecture

Vite + TypeScript + Preact (with signals), following the repo's built-app
conventions (`base: "./"`, output to `dist/`, `app.json`, README). Preact
(~4 kB) is used because this UI is form-heavy with many views derived from one
project state, which would be unwieldy in the vanilla DOM style of the other
apps. Libraries: `manifold-3d` (Apache-2.0, WASM CSG), `three` (preview),
`fflate` (zip + URL compression). No copyleft dependencies.

Each module is a pure, independently tested unit with plain-data interfaces.
The exact, binding signatures live in the implementation roadmap
(`docs/superpowers/plans/2026-10-11-insert-generator-00-roadmap.md` §4); the
table below is a summary:

| Module          | Responsibility                                                                   | Interface                                                                                                   |
| --------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `model/`        | Types, project schema, defaults, version migration                               | `Project`, `parseProject(json) → Result<Project>`                                                           |
| `sizing/`       | Component group + settings → tray requirements with size variants                | `size(group: Component[], settings) → TrayRequirement[]`                                                    |
| `layout/`       | Optimizer (one Web Worker, deterministic per §7.2)                               | `optimize({ requirements, box, printer, settings, locks, previous? }, seed, { iterations }) → LayoutResult` |
| `geometry/`     | `TraySpec` → manifold mesh (Web Worker)                                          | `buildTray(spec: TraySpec) → Mesh`                                                                          |
| `export/`       | 3MF and STL writers, zip                                                         | `to3mf(parts: { name, mesh, transform }[]) → Uint8Array`, `toStl(mesh) → Uint8Array`                        |
| `viewer/`       | three.js scene: box outline, trays, explode slider, layer toggle, tray selection | Preact component, props: layout + meshes                                                                    |
| `plan/`         | 2D top-down per-layer view; swap (drag or keyboard) and lock                     | Preact component, emits lock/swap edits                                                                     |
| `instructions/` | Per-layer SVG diagrams + packing order; printable page; PNG                      | `render(layout, project) → SVG[]`                                                                           |
| `share/`        | URL hash encode/decode, project list in localStorage (try/catch), JSON file      | `encode(project) → string`, `decode(string) → Result<Project>`                                              |
| `ui/`           | Input forms (simple/advanced), results summary, warnings                         | Preact components                                                                                           |

**Data flow:** edit `Project` → if `inputsHash` (§5) changed: `sizing` (sync)
→ `layout` worker (debounced, progress events, "improve more" button) →
`LayoutResult`, auto-accepted into `project.layout` when the run completes
(the previous layout is kept for one-step undo) → `geometry` worker (per tray,
on demand) → viewer / export / instructions.

### Build and tooling notes

- `tsconfig.json`: `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`;
  `@preact/preset-vite`.
- manifold-3d: use the single-threaded build (GitHub Pages can't send
  COOP/COEP headers, so no SharedArrayBuffer). Import the WASM with `?url`
  and pass it to `locateFile`; `worker.format: "es"`;
  `optimizeDeps.exclude: ["manifold-3d"]`.
- Lazy-load the geometry worker and three.js so the input UI loads fast.
- The app's `build` script is `vitest run && tsc --noEmit && vite build`,
  because the repo's quality gate runs only lint, format and build.
- `renovate.json`: a package rule that disables automerge for `manifold-3d`.
- Root ESLint config: ban `Math.random` in `apps/insert-generator/src/layout/**`
  (`no-restricted-properties`).
- Ship a third-party licenses file (`dist/third-party-licenses.txt`, linked
  from the footer) (e.g. `rollup-plugin-license`),
  including manifold's Apache-2.0 license/NOTICE and its embedded Clipper2
  (BSL-1.0).

## 5. Data model

All lengths in millimetres.

```ts
interface Project {
  schemaVersion: string; // semver, see §9
  createdWith: string; // app version that last saved it
  id: string; // short base36, keys the local project list
  name: string;
  box: Box;
  printer: Printer;
  settings: Settings; // fully resolved values, see §9
  components: Component[];
  locks: Lock[];
  layout?: StoredLayout; // last accepted layout, see §8.4
}

interface Box {
  innerWidth: number; // X: left → right, seen from the box front
  innerDepth: number; // Y: front → back
  innerHeight: number; // floor to the rim of the bottom part
  headroom: number; // boards/rulebooks lying on top, measured stacked
  headroomCoverage: "full" | "partial"; // ignored when headroom = 0
  storedOnSide: boolean; // stricter coverage handling
}

interface Printer {
  bedX: number;
  bedY: number;
  bedZ: number;
  bedMargin: number; // per side, for purge line / skirt
  layerHeight: number; // tray heights are rounded to multiples (§7.2)
}

type Component = CardsComponent | BulkComponent | TilesComponent | MinisComponent | CustomComponent;

interface ComponentBase {
  id: string; // short base36
  name: string;
  access: "often" | "sometimes" | "setup"; // play-time access frequency
  groupId?: string; // same group → same tray, separate compartments
  perPlayer?: { players: number }; // counts are per player; not allowed with groupId
  clearance?: number; // advanced: absolute total, replaces the main clearance, not scaled by Fit
}

interface CardsComponent extends ComponentBase {
  kind: "cards";
  shortSide: number; // card size (not sleeve size); the UI swaps the two if entered the other way round
  longSide: number;
  decks: { name: string; count: number }[];
  sleeve: "none" | "standard" | "premium" | { w: number; h: number; thickness: number }; // custom: sleeve outer size, added thickness per card
  thickness: { mode: "preset" } | { mode: "measured"; cards: number; stackMm: number }; // measured: as stored, sleeves included
  storage: "upright-long" | "upright-short" | "flat" | "auto";
}

interface BulkComponent extends ComponentBase {
  kind: "bulk";
  items: (
    | { name: string; count: number; w: number; d: number; h: number } // tokens, cubes, dice, coins
    | { name: string; volumeMl: number } // space the pile needs (packing included)
  )[];
}

interface TilesComponent extends ComponentBase {
  kind: "tiles";
  shape:
    | { type: "rect"; w: number; d: number } // square: w = d
    | { type: "hex"; flatToFlat: number; orientation: "flat" | "pointy" }; // flat: a flat edge faces the tray front
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
  count: number;
}

type Lock =
  | { kind: "position"; trayKey: string; path: string; rotated: boolean } // guillotine path of its leaf, e.g. "0110"
  | { kind: "size"; trayKey: string; w: number; d: number; h: number } // outer size
  | { kind: "stack"; trayKeys: string[] }; // bottom → top, kept as-is
```

`trayKey = "<groupId ?? componentId>:p<player>:<part>"` (`p0` without
`perPlayer`; `part` counts split trays from 0), so locks survive edits to
unrelated components. Leftover trays are keyed `leftover:<n>` and can't be
locked. Card spacers are keyed `<trayKey>:spacer`.

Component defaults: `access: "sometimes"`, `storage: "auto"`, minis
`storage: "pockets"`.

Validation bounds (also applied to URL and file input): ≤ 100 components,
every count 1…2000, every length 0 < x ≤ 1000 mm, `players` 1…10.

### Settings

```ts
interface Settings {
  wall: number;
  floor: number;
  divider: number;
  fit: number; // multiplies every clearance marked ×Fit
  cardClearance: number; // W/L, total
  cardStackClearance: number; // per deck, total, plus cardStackClearancePct
  cardStackClearancePct: number;
  cardThickness: number; // unsleeved card
  pieceClearance: number; // tiles, minis, custom; total
  boxClearance: number; // per side
  trayGap: number; // total between neighbouring trays
  bottomChamfer: number; // outer bottom edge (elephant foot)
  cornerRadius: number; // outer vertical corners
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
```

| Setting                                     | Simple-mode control                     | Default                   |
| ------------------------------------------- | --------------------------------------- | ------------------------- |
| `wall`                                      | thin / normal / sturdy                  | 1.2 / 1.6 / 2.0           |
| `floor`                                     | —                                       | 1.2                       |
| `divider`                                   | —                                       | 1.2                       |
| `fit`                                       | tight / normal / loose                  | 0.7 / 1 / 1.4             |
| `cardClearance` (×Fit)                      | via Fit                                 | 1.5                       |
| `cardStackClearance` + `Pct` (×Fit)         | via Fit                                 | 1.0 + 3 % of the stack    |
| `cardThickness`                             | advanced                                | 0.32                      |
| `pieceClearance` (×Fit)                     | via Fit                                 | 1.0                       |
| `boxClearance` (×Fit)                       | via Fit                                 | 0.5 per side              |
| `trayGap` (×Fit)                            | via Fit                                 | 0.2                       |
| `bottomChamfer`                             | advanced                                | 0.4 (upper trays: ≥ 0.5)  |
| `cornerRadius`                              | advanced                                | 3                         |
| `scoopRadius`                               | advanced                                | 12                        |
| `fingerPocket.width`                        | advanced                                | 25                        |
| `fingerPocket.floorNotch`                   | advanced                                | 12.5 (0 = none, up to 50) |
| `fingerPocket.wallRoom`                     | "Extra finger room in the box": on = 10 | 0 (off; up to 20)         |
| `fingerPocket.dividerRoom`                  | "Extra finger room in the box": on = 5  | 0 (off; up to 20)         |
| `lip` on / height / thickness / ledge       | advanced                                | on / 2 / 1.2 / 1.7        |
| `lip.play` (×Fit)                           | via Fit                                 | 0.25                      |
| `topPressFit`                               | advanced                                | 0 (−2…+1)                 |
| `packingFactor`                             | advanced                                | 0.5                       |
| `leftover`                                  | advanced: spare tray / solid            | spare tray                |
| `printer.bedMargin` / `printer.layerHeight` | advanced                                | 5 / 0.2                   |

Simple-mode controls write resolved numbers into `settings`; the project
never stores "use the default".

**Cards.** Card size presets (card sizes, not sleeve sizes): Standard
63.5×88, Standard American 56×87, Euro 59×92, Mini Euro 44×68, Mini American
41×63, Tarot 70×120, French Tarot 61×112, Extra Large 65×100, Dixit 80×120.

| Sleeve   | Added thickness per card | Added to short and long side |
| -------- | ------------------------ | ---------------------------- |
| none     | 0                        | 0                            |
| standard | +0.10 (→ 0.42 per card)  | +3                           |
| premium  | +0.28 (→ 0.60 per card)  | +3                           |
| custom   | given                    | outer size given             |

A measured stack replaces the thickness, not the sleeve size.

**Bed presets:** 256³ (Bambu), 250×210×220 (Prusa MK4), 220×220×250
(Ender 3), custom.

### StoredLayout

```ts
interface StoredLayout {
  createdWith: string; // app version
  geometryVersion: string; // semver of the tray geometry generator, §9
  inputsHash: string; // hash of canonical box, printer, settings, components (names excluded), locks
  seed: number;
  iterations: number;
  capped: boolean; // stopped by the safety time cap → not reproducible
  trays: TraySpec[]; // fully resolved; geometry is a pure function of TraySpec
}

interface TraySpec {
  key: string; // trayKey, "leftover:<n>", or "<trayKey>:spacer"
  part: "tray" | "leftover" | "spacer";
  path: string; // guillotine path of its leaf ("" for spacers)
  stack: number;
  level: number; // 0 = bottom
  x: number; // min corner of the outer footprint, box coordinates after boxClearance
  y: number;
  z: number;
  w: number; // outer size; h excludes the lip
  d: number;
  h: number;
  rotated: boolean;
  wall: number;
  floor: number;
  lip: boolean;
  solid: boolean; // solid leftover
  compartments: {
    x: number; // inner, tray-local
    y: number;
    w: number;
    d: number;
    floorZ: number; // > floor when the floor is raised
    kind: "well" | "scoop" | "pocket" | "spare";
    contents: string;
    features: (
      | {
          type: "wallCutout";
          side: "front" | "back" | "left" | "right";
          at: number;
          width: number;
          depth: number;
          floorNotch: number;
        }
      | { type: "scoop"; side: "front" | "back" | "left" | "right"; r: number }
      | { type: "cornerRelief"; d: number }
    )[];
  }[];
  // A card spacer's own notch, in its frame (§6.2); absent on other parts.
  features?: { type: "spacerNotch"; axis: "x" | "y"; at: number; width: number; depth: number }[];
}
```

Coordinates are stored in mm and computed as integer 0.01 mm units.

## 6. Geometry

### 6.1 Common to all trays

- Outer block with rounded vertical corners (`cornerRadius`). Wells have inner
  vertical corners ≤ 0.5 mm; tile and custom wells add Ø 3 mm corner reliefs.
- Walls are vertical and the top is open. Floor fillets are concave. No
  bridges or ceilings; raised floors are solid.
- Outer bottom edge chamfer `bottomChamfer` × 45° against elephant foot
  (upper trays ≥ 0.5 mm, so they slide into the lip).
- Fill (§7.2) thickens walls and dividers toward the compartment only; outer
  faces, lip and insets never move.
- Minimum feature width 0.8 mm (2 lines of a fixed internal 0.4 mm line-width
  assumption); no wall, divider or lip is thinner. Exception: the lip's
  chamfered top tapers to a flat of at least 0.6 mm (the chamfer is
  `min(0.6, lip.thickness − 0.6)`); the lip is `lip.thickness` (1.2 mm) thick
  below the chamfer.
- Meshes come out of manifold and are watertight by construction.

**Wall cutouts** (cards, tiles, minis pockets and custom wells: one cut style
for every tray). A U-cut `fingerPocket.width` wide (round
bottom, radius half the width), from the rim down, through the wall or divider
on one side of a well: out through the outer wall, or across a divider into
the next well, which is cut on the facing side too, or into a spare
compartment. Never into bits or into another well that is not cut on the
facing side: a deck beside one is cut on its other side only. In a group,
cards and tiles cut along the row come first in their row, so the first one's
cut leaves through the outer wall. A well that still gets no cut tries the
other side of the same axis (a minis pocket of the back row, whose front faces
the front row, is cut through the back wall), then both sides of the other
axis (a deck between bits is cut through the front and back walls); one with
no cut at all is not offered (a warning names it). Cuts placed later keep
0.8 mm from those placed before. Wells need no extra room (no reach bands):
they are content + clearance.

**Posts:** a cut never removes a whole wall. It leaves a full-height post of at
least 3 mm (`POST_MM`) between each of its sides and the inner faces of every
compartment it passes, so the wall or divider still holds the contents; the
cut is at most the well's side less 2 × 3 mm. Where that leaves less than
10 mm (`MIN_CUT_MM`, a fingertip; or the width setting, if smaller), the well
gets no cut on that axis: it is cut across instead, as above, or not offered.
So tiles under about 16 mm laid flat get no flat variant; an auto component
keeps its upright ones.

- **Upright cards and tiles:** one centred channel per row, along the stack
  (X): through both end walls (touching the first and last card faces) and
  every divider between decks or stacks. It is centred on the card length,
  half the shallowest well deep, and as wide as the setting or the room its
  row has between the posts (rows of tiles shorter than the setting get a
  channel 6 mm shorter than the tiles). With two rows each row has its own
  channel: the divider between the rows stays whole, and the posts keep the
  two channels apart in the end walls. The front and back walls stay whole.
- **Flat cards and tiles:** a half-round cutout through each long wall (along
  the long side; left and right for a flat deck), centred on it, down to the
  floor, plus a **floor notch**: the cut goes on down through the floor at its
  full width (so a finger fits; never narrower) and on into the well's floor
  `fingerPocket.floorNotch` from the wall's inner face (default 12.5 mm, half
  the default width: a half-disc whose diameter is the cut's width; 0 = none).
  Its far end is rounded with half the cut's width (at most the reach), so a
  longer reach is straight sides ending in that half-round. A fingertip gets
  under the stack. A notch under a divider leaves a hole in the floor.
- **Finger room** (`fingerPocket.wallRoom` and `.dividerRoom`; simple mode
  "Extra finger room in the box" sets 10 and 5 mm): the outer walls a cutout
  leaves through are `wallRoom` thicker (inward; the tray is 2 × that longer on
  that axis), so the cut gives a finger room even when the tray sits flush
  against its neighbours, and every divider a cut passes through (between
  upright decks or tile stacks on the channel, between flat decks or tiles with
  long-wall cutouts, between rows that aligned flat tiles are cut across, before
  a spare a cut runs into) is `dividerRoom` thicker. That holds for wherever
  the cuts actually go, a well cut across its row instead included; walls and
  dividers without a cut, also where a cut was asked for but none fits, are
  unchanged; a spare at the end of a row takes the wall room instead. Which
  walls get room is decided on the tray's smallest layout; a larger tray keeps
  that room, also in the rare case where its slack moves a cut elsewhere.
- **Top fillets:** the two top corners of every cut's U (through walls and
  dividers, and the spacer notch's), where a side meets the top, are rounded
  with 3 mm (`FINGER_FILLET_MM`) across the whole wall, so the opening flares
  at the top. Through a lipped wall only the lip is rounded, on its top (at
  most the lip's height), so the ledge the upper tray rests on stays square.
  The radius shrinks where less than 0.8 mm of top would stay beside it (the
  outer corner, another compartment or cut across the wall), to stay on the
  faces of the compartments the cut runs between, and to the U's straight
  side; under 0.2 mm it is left out. The surface faces up and into the cut, so
  it needs no support. Sizing does not change for it. The cut's vertical edges
  stay square.
- **Outer corners beside a cut:** where a cutout (or the spacer notch) leaves
  through an outer face, the rounded outer corner ends at least 0.8 mm before
  its side, so the wall beside the cut stays 0.8 mm thick
  right up to that face; the corner radius shrinks for it (never below the
  bottom chamfer, so the cuts' sides keep the chamfer plus 0.8 mm from the
  faces they run along).
- Where a cutout leaves through a lipped wall it interrupts the lip; the lip on
  the other walls and beside the cut still locates the upper tray, which rests
  on the ledge and dividers around the cut.

| Content                 | Finger feature                                                 | Depth                    |
| ----------------------- | -------------------------------------------------------------- | ------------------------ |
| Cards / tiles, upright  | One channel per row through both end walls and every divider   | ½ of the shallowest well |
| Cards / tiles, flat     | Half-round cutouts through both long walls, with a floor notch | To the floor             |
| Minis, pockets          | One centred cut through the front wall per pocket, no notch    | ½ of the pocket          |
| Custom                  | One centred cut through the front wall, no notch               | ½ of the well            |
| Bulk, spare, minis bulk | None: compartments ≥ 25 mm are the grip (rule 8)               | —                        |

**Locating lip** (on any tray with a tray stacked on it):

| Part       | Geometry                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lip        | The outer `lip.thickness` (1.2) of the wall rises `lip.height` (2) above the rim. `min(0.6, thickness − 0.6)` × 45° chamfer on its inner top edge, flat top ≥ 0.6. |
| Ledge      | The next `lip.ledge` (1.7) stays at rim height. A lipped outer wall is `max(wall, thickness + ledge)` (2.9).                                                       |
| Upper tray | Outer face inset `thickness + play` (1.45) per side from the lower tray's outer face.                                                                              |
| Bearing    | ≥ `ledge − 2·play − upper bottom chamfer` (0.7) in any shifted position; the upper tray also rests on the lower tray's dividers.                                   |
| Insets     | Add up: the tray at level k is inset `k·(thickness + play)` per side.                                                                                              |
| Height     | The lip is not part of `tray.h`; it overlaps the upper tray. Upper trays need `h ≥ lip.height + 3`.                                                                |

With the lip off, upper trays keep the same inset, rest on the rim, and the
app warns (rule 4).

### 6.2 Per type

| Type           | Shape                                                    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cards, upright | One well per deck in a strip, dividers between           | `upright-long`: stands on its long edge (well height from the short side); `upright-short`: the reverse (§7.1). Spare stack length goes to a removable card spacer, or to thicker dividers. One finger channel through the walls and dividers (§6.1).                                                                                                                                                                                             |
| Card spacer    | Separate solid block                                     | Well width × spare length × (well height − 5), printed standing. Where the deck's finger channel crosses its well, the spacer has the same U-notch (same centre and bottom, at least as wide; cut across the whole spacer when less than the bottom chamfer plus 0.8 mm would stay beside it), so the channel stays open end to end. A channel wider than the spacer takes its whole top: the spacer then ends where the channel meets its faces. |
| Cards, flat    | Rectangular well                                         | Long side along Y; half-round cutouts through both long walls with a floor notch (§6.1).                                                                                                                                                                                                                                                                                                                                                          |
| Bulk           | Scoop tray, compartments in a strip (one per item line)  | Scoop fillet on the compartment's front wall (tray-local −Y), radius `min(scoopRadius, depth, width/2)`.                                                                                                                                                                                                                                                                                                                                          |
| Tiles, flat    | Rect/hex wells, one per column                           | Columns added when `count × thickness` exceeds the well height. Hex corner-to-corner = `flatToFlat · 2/√3`. Cutouts through the two walls along the longer side (left and right for a square).                                                                                                                                                                                                                                                    |
| Tiles, upright | As upright cards                                         | Hex stands on a flat edge: height `flatToFlat`, length corner-to-corner.                                                                                                                                                                                                                                                                                                                                                                          |
| Minis, pockets | One rounded pocket per figure (bounding box + clearance) | Each pocket's depth = its figure's `h` + clearance (solid raised pocket floor). The tallest figure sets the minimum tray height.                                                                                                                                                                                                                                                                                                                  |
| Minis, bulk    | As bulk                                                  | Volume = Σ bounding boxes ÷ `packingFactor`.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Custom         | Plain well per item                                      | `pieceClearance`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Leftover       | Open "spare" tray (default) or solid block               | Fills space that can't be used, so the box is always full.                                                                                                                                                                                                                                                                                                                                                                                        |

**Groups and multi-compartment trays.** Compartments are laid out as a 1-D
strip, or 2 rows, along the tray's long axis. Every compartment uses the full
tray height: elastic kinds (bulk) grow deeper, others get a solid raised floor.

## 7. Layout engine

### 7.1 Sizing

`sizing` turns each component, or each group, into `TrayRequirement`s:

- the minimum inner size of each compartment (wall cutouts need no room of
  their own; cut walls and dividers may get extra finger room, §6.1);
- which axes can grow ("elastic") and by how much: for upright cards only stack
  length; for bulk any axis, as long as volume stays ≥ required and the
  per-axis minimums below hold;
- whether the tray may be rotated in XY;
- the `access` priority;
- **size variants**: upright on the long or short edge, or flat; one or two
  rows; bulk wide-and-shallow vs narrow-and-deep; minis standing or lying
  (`h` swapped with the larger of `w`, `d`) when too tall; and **splits**
  across 1–3 trays for every kind (cards and tiles at deck/column boundaries,
  bulk by item line, minis by figure). At most 8 variants per requirement, in
  a fixed order. Decks are split into rows greedily by size, largest first.

With `storage: "auto"`, `sizing` emits all variants. Otherwise only the
chosen ones. With `perPlayer`, it emits one requirement with two variant
families: "separate" (one tray per player) and "combined" (all players in one
tray, one compartment each). Sizing never sees the box, so variants that only
matter for some boxes (extra tile columns, minis lying down) are always
emitted, and the layout picks a feasible one.

**Card math** (`S`, `L` = sleeved short/long side; `t` = per-card thickness
from the sleeve table or `stackMm / cards`; clearances ×Fit unless overridden):

| Storage         | Well height (vertical)               | Well length         | Well width (stack)                            |
| --------------- | ------------------------------------ | ------------------- | --------------------------------------------- |
| `upright-long`  | `S + cardClearance`                  | `L + cardClearance` | `n·t·(1 + pct) + cardStackClearance` per deck |
| `upright-short` | `L + cardClearance`                  | `S + cardClearance` | as above                                      |
| `flat`          | `n·t·(1 + pct) + cardStackClearance` | `L + cardClearance` | `S + cardClearance`                           |

**Bulk:** required volume = Σ `count·w·d·h` ÷ `packingFactor` (`volumeMl`
lines are used as given). Each compartment has min width/depth =
`max(largest item dim + pieceClearance, 25)` (25 for `volumeMl` lines) and
height ≤ 1.5 × its smaller horizontal size and ≥ 20 mm.

A measured card thickness below 0.1 mm per card is treated as a typo: the
sleeve-table thickness is used instead, with a notice.

### 7.2 Search

- **Representation:** a guillotine tree over the box floor
  (`innerWidth − 2·boxClearance` × `innerDepth − 2·boxClearance`). Internal
  nodes are X or Y cuts; neighbouring leaves are separated by `trayGap`. Each
  leaf is a **stack**: an ordered list of trays. The bottom tray has the
  leaf's footprint; the tray at level k is inset `k·(lip.thickness + lip.play)`
  per side. A leaf is feasible when, for every level k,
  `leaf ≥ req_k + 2·k·(lip.thickness + lip.play)`. The stack's total height
  (Σ `tray.h`) equals `topPlane`.
- **Fill:** after placement, slack is shared out.
  - Footprint slack inside a stack goes to elastic axes, then to wall and
    divider thickness (inward, up to the cap below), then to an extra empty
    compartment in that tray (stacked trays can't have a leftover tray beside
    them).
  - Leaf slack goes to elastic axes, then to wall and divider thickness (inward
    only) up to `min(2 × setting, 4 mm)`, then to a leftover leaf at full
    stack height.
  - Leftover regions narrower than 12 mm are absorbed into the neighbouring
    outer wall regardless of the cap. Leftovers narrower than 25 mm + 2 walls
    are made solid (no grip possible). Leftovers larger than the bed are split
    with further cuts.
  - A stack holds at most 4 trays.
  - Height slack goes to the lowest tray in the stack with an elastic height
    (deeper scoop); otherwise to the top tray, as a solid raised floor.
  - In each stack, every tray except the top one has its `h` rounded to a
    multiple of `printer.layerHeight`; the top tray takes the remainder.
- **Search:** greedy starting layouts (first-fit decreasing along X and along
  Y), then simulated annealing. Moves: swap leaves, flip a cut axis, move a
  cut, change a variant, rotate, reorder a stack, merge or split a stack.
  Re-runs after an edit start from the current layout (warm start).
- **Feasibility:** constraint violations count as an overflow penalty during
  the search; the best _feasible_ layout is tracked separately and is the
  result. If none is found, the least-overflow layout is reported (§7.3).
- **Budget:** runs in one Web Worker, in chunks of 1 000 iterations (progress
  events, best result so far, cancel). The default budget is N iterations,
  calibrated to ≈ 3 s on a mid-range laptop; "improve more" runs 3N more,
  warm-started from the stored layout with the same seed. The `iterations`
  argument is that run's budget; `StoredLayout.iterations` is cumulative. A 30 s time cap is only a
  safety stop; a capped result is marked `capped`.
- **Determinism:** a seeded PRNG (xoshiro128\*\*); `Math.random` is banned in
  `layout/` by lint. All lengths are integer 0.01 mm units. The seed is kept
  across re-runs. Guarantee: same app version + same JS engine + seed +
  iterations + warm-start layout → same layout. Sharing reproduces a layout through
  `StoredLayout`, not by recomputing.
- **Score** (lower is better). Terms in order of decreasing weight; the
  weights are internal constants, tuned against fixtures:
  1. leftover volume;
  2. coverage penalty: bulk, minis-bulk and tiles in the top layer when
     `headroomCoverage` is `partial` or `storedOnSide` is set;
  3. access penalty: `often` items under other trays;
  4. lateral play above 1.5 mm per axis (rule 1);
  5. number of stacked trays (beyond one per stack);
  6. tray count;
  7. filament volume;
  8. on warm starts, moving trays whose requirements didn't change.
- **Locks:**
  - Locked paths, sizes and stacks are fixed in the tree; moves never change
    them. A position lock fixes the tree topology along its path; cut
    positions may still move.
  - Drag-to-swap in the plan view swaps two leaves' paths, locks both, and
    re-optimizes.
  - Locks are checked for feasibility before optimizing. A lock that can't be
    satisfied (contents no longer fit a size lock, box edits, conflicting
    paths), or whose `trayKey` no longer exists, is dropped with a visible
    notice, never silently, and removed from `project.locks` when the result
    is accepted.
  - The tray details offer "Lock size", which locks the tray's current outer
    size.

### 7.3 Infeasibility and warnings

- **Doesn't fit:** report the least-overflow attempt and the shortfall per
  axis, plus concrete suggestions: unsleeve, store flat or upright, move the
  rulebook or boards elsewhere (less headroom), choose a tighter fit, split groups.
- **Coverage:** applies when `headroom > 0` and `headroomCoverage` is
  `partial`. The score keeps loose bits out of the top layer. Any that remain
  are warned about, with a suggestion to move them below other trays. With
  `storedOnSide`, any loose bits in the top layer trigger a warning, whatever
  the coverage.
- **Bed:** a requirement too large for the bed in every variant, splits
  included → error naming the component.
- **Play:** lateral play above 1.5 mm on an axis → warning.
- **Lip off:** warning when the layout has stacked trays (rule 4).
- **Dropped locks**, **capped runs** and a **stale stored layout** (§8.4) are
  shown as notices.

## 8. UI

### 8.1 Layout

One page. Inputs on the left (Box → Printer → Components → Settings), results
on the right (summary, plan view, 3D view, export). A global Simple ⇄ Advanced
toggle plus a per-component "more options" section. On narrow screens the
panels stack. Plan-view edits use pointer events (mouse and touch) and have a
keyboard alternative (select A, then "swap with" B). Without WebGL, the 3D
view shows a message and the rest works. Before 1.0 a "preview — links may
break" banner is shown.

### 8.2 Inputs

Numbers accept a decimal comma or point.

- **Box:** inner W (X, left → right from the front) × D (Y, front → back) × H
  (floor to the rim of the bottom part). Hint: measure at the narrowest point.
  Headroom: boards and rulebooks stacked, plus 1 mm for warp. Coverage,
  stored-on-side.
- **Printer:** bed preset or custom X × Y × Z; advanced: bed margin, layer
  height.
- **Components:** add cards / bits / tiles / minis / custom. Simple fields:
  type, size preset, count, access. Advanced: overrides from §5.

### 8.3 Results

- **Summary:** box fill %, tray count, stack count, filament in grams
  (PLA 1.24 g/cm³; upper bound at 100 % fill), lateral play per axis,
  warnings.
- **Plan view:** per-layer top-down drawing; click to select, drag or
  keyboard to swap, lock toggle.
- **3D view:** explode slider, layer toggle, click a tray for contents and
  dimensions.
- **Export:**
  - zip of one 3MF per printed part: trays, plus any card spacers (named
    `NN-<contents>.3mf`, sanitized to `[A-Za-z0-9._-]`);
  - one combined 3MF with all parts as separate objects, laid out in a grid
    at z = 0 (not in box position);
  - optional STL zip (binary STL).
  - 3MF: `[Content_Types].xml` (rels +
    `application/vnd.ms-package.3dmanufacturing-3dmodel+xml`), `_rels/.rels`
    → `/3D/3dmodel.model`, `unit="millimeter"`, counter-clockwise outward
    winding, object `name`s, numbers written with `toFixed` (never
    locale-formatted).
- **Assembly page:** per-layer numbered SVG, "what goes where" list, packing
  order (bottom first). Printable via the browser (PDF), PNG download per
  layer.

### 8.4 Persistence and sharing

- **Local projects:** a small project list in localStorage, keyed by
  `Project.id`, autosaved. Opening a shared link or a file adds it, or opens
  it if the id already exists, as a separate project; it never overwrites
  another project.
- **URL hash:** `#1.<payload>`, where `1` is the hash format version and the
  payload is JSON → deflate → base64url. Updated with
  `history.replaceState`. "Copy link" button; JSON file import/export.
  Decoding caps the inflated size at 1 MB and applies the §5 bounds.
  Target: the full URL, stored layout included, fits a 2 000-character Discord
  message for typical projects (measured on fixtures). If a link is longer,
  "Copy link" warns and offers the JSON file.
- **Stored layout:** makes a shared link show exactly the same insert even
  after the optimizer changes.
  - Loading a project that has a stored layout never re-optimizes.
  - The optimizer runs only after an edit that changes `inputsHash`
    (debounced), or when the user clicks "Re-optimize".
  - A finished run is auto-accepted into `project.layout`; "Undo" restores
    the previous layout (one step).
  - If a loaded project's `inputsHash` doesn't match its inputs, the stored
    layout is shown with an "inputs changed — re-optimize?" banner.
  - A project without a stored layout is optimized on load.

## 9. Versioning

Both the app and the project schema use semver `MAJOR.MINOR.PATCH`. **Only a
MAJOR bump may break backward compatibility** (new app reading old files).
Older apps reading newer files is best effort, as below.

- **Schema (`Project.schemaVersion`):**
  - PATCH: clarifications or fixes with no change to the shape.
  - MINOR: additive only. New optional fields, new enum values, new component
    kinds. A new field's default must reproduce the previous behaviour exactly.
  - MAJOR: anything that removes, renames or changes the meaning of a field.
- **Loading rules** (app schema `A.b.c`, file `X.y.z`):

  | Case              | Behaviour                                                                                                                                                                                                                                                                                        |
  | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `X == A`, `y ≤ b` | Load, filling in defaults for missing fields.                                                                                                                                                                                                                                                    |
  | `X == A`, `y > b` | Load with a "made with app `<createdWith>`" warning. Unknown fields, enum values and components are preserved verbatim on save. Unsupported components are "kept but not laid out". The stored layout is shown; trays with unknown features can't be exported. Re-optimizing needs confirmation. |
  | `X < A`           | Run the registered migrations `X → … → A`. A migration from every previous MAJOR is mandatory.                                                                                                                                                                                                   |
  | `X > A`           | Refuse: "made with app `<createdWith>`; this is app `<version>`".                                                                                                                                                                                                                                |

- **Geometry (`StoredLayout.geometryVersion`):**
  - PATCH: mesh-only changes that don't affect fit (triangulation, fillet
    smoothness).
  - MINOR: new optional features; existing `TraySpec`s export with the same
    interfaces.
  - MAJOR: changes to outer dimensions, the lip/inset/stacking interface, or
    minimum compartment sizes for the same `TraySpec`. Trays exported before
    and after won't mate. Loading a layout with an older geometry MAJOR warns:
    reprint the whole insert.
- **Resolved settings:** projects store resolved `settings` values (§5), so
  changing a default never changes an existing project.
- **App version** (`package.json`, shown in the footer, written to
  `createdWith`):
  - MAJOR when the schema MAJOR or the geometry MAJOR changes.
  - MINOR for features, including optimizer improvements. Stored layouts keep
    shared links stable.
  - PATCH for fixes.
- Before the first release the app is `0.x` and makes no compatibility
  promise; a preview banner says so (§8.1). Pre-1.0, each `0.MINOR` is treated
  as a major line (PATCH acts as minor), so a newer `0.MINOR` file is refused.
  The first release is app `1.0.0`
  / schema `1.0.0`. It rejects `0.x` files with an explicit error, and the
  rules above apply from then on.

## 10. Error handling

- Field-level validation (positive numbers, card count ≥ 1, the §5 bounds,
  no `perPlayer` inside a group, etc.), shown next to the field.
- Infeasible layout and coverage warnings as in §7.3.
- Worker or WASM failures: a visible error with retry; the last good result
  stays on screen.
- Corrupt or unknown URL hash or file, or input over the bounds or inflate
  cap: error with the reason; the current project is kept.
- Dropped locks: notice naming the lock and the reason.
- localStorage unavailable: the app works normally and autosave and the
  project list are off (with a notice).
- No WebGL: the 3D view shows a message; everything else works.

## 11. Testing

All tests run in the app's `build` script (`vitest run`), so CI and Renovate
updates run them.

- **Vitest** for the pure modules (`model`, `sizing`, `layout`, `share`,
  `export`, `instructions`).
- **Layout properties**, on randomized inputs plus fixture games: every result
  satisfies all §3 hard rules (tiling with only `boxClearance`/`trayGap`
  gaps, equal stack heights, lip insets and bearing, bed fit with margin,
  minimum sizes, grip on every tray, locks respected or dropped with a
  notice). Same seed + iterations gives the same result (same engine).
- **Sizing:** card math table, bulk per-axis minimums, packing factor
  division, sleeve handling in measured mode, split variants, variant cap.
- **Geometry:** per tray type, the mesh is manifold, and its volume and bounding
  box match the spec. No overhangs: every triangle with normal.z < −0.71 lies
  at z = 0. No feature thinner than 0.8 mm. 3MF output re-parsed with three's
  `3MFLoader` (objects, names, units, manifold), plus a snapshot of the XML
  structure.
- **Schema:** round-trip encode/decode; every loading case in §9 (older
  minor, newer minor with unknown fields and kinds preserved on save, older
  major with migration, newer major, `0.x` rejected); one saved fixture file
  per historical schema MAJOR must still load.
- **Build:** smoke test of the built `dist/` served from a subpath: every
  referenced asset (scripts, WASM, workers) is relative and returns 200. That
  they actually load in a browser is checked in the manual end-to-end pass.
- **Fixtures:** 3–5 real games measured by hand (§12), used for tuning and
  regression.
- The repo's `npm run verify` (lint, format, build) passes.

## 12. Pre-planning dependencies

- **Fixture games** (to be chosen and measured by the user): 3–5 games
  covering one card-heavy, one bits-heavy, one with tiles and one with minis.
  Box, headroom and every component measured per §5.
- **Physical lip test print** before 1.0: a 2-stack with default settings, to
  confirm the lip fit, bearing and grip.
