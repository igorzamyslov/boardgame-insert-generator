# Board Game Insert Generator — Design

Date: 2026-10-11 · Status: approved; implementation planned (see `docs/superpowers/plans/`) · App: ``

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
- Leftovers taller than the print bed, split in Z. A leftover is as tall as the
  stacks beside it, so a box taller than the bed's Z range cannot have one: the
  run fails with a message saying so (leftovers are not split in Z in v1).
- Embossed labels.
- Bundled game presets library.
- Calibration test print.
- Print-time estimate.
- Showing a component's name alongside its deck or item name in the plan and 3D
  view, so several trays of one component read as a group ("Starter deck —
  Deck 1" rather than "Deck 1").
- Renaming the box dimension labels: "depth" reads as vertical to some users;
  width / length / height is clearer. UI labels only, not the schema fields.
- An optional XYZ axis indicator in the 3D viewer.
- An exploded 3D view in the assembly page and its print output.
- Part numbers embossed on trays, matching the assembly instructions (an
  extension of embossed labels above).
- A donation link on the export screen.
- Export as a modal, so leaving it does not mean switching back a view mode.
- Showing the sizes derived from a component's presets (card format, count,
  sleeve) next to the editor, so the user can judge whether to trust them
  without measuring, plus a correction multiplier for when they do not match.
- Showing which settings differ from their defaults, with a button to restore a
  setting (or all settings) to default.
- Option descriptions as tooltips instead of always-visible hints, with
  screenshots showing what each option does.
- Changing a tray's orientation by hand, in 90° steps.
- Changing which layer a tray is on by hand, including forcing an extra layer.
- Inch input.
- Cross-engine bit-identical layouts (see §7.2 Determinism).
- Frozen versioned builds (e.g. `…/insert-generator/v1/`).

#### Future: lids and cover sheet

Notes for adding them later without reworking the layout engine:

- The layout treats tray height as opaque: a lid only raises `minOuter.h`.
- Stacking on a lidded tray needs a per-level flag next to `lipped`.
- The closed-from-above check (rule 3) lives in one predicate (`coverageApplies`
  and the coverage score term); a lidded tray would be exempt there.
- A cover sheet is a reduction of `topPlane` plus one extra printed part,
  emitted like leftovers.

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
   punchboards) lie directly on the tray rims. The height the trays don't
   need is padding, and it is printed as a **riser** under the stack (§6.2),
   not as a thick floor in the tray, so a tray stays about as tall as its
   contents. `settings.fillToTop` (default on) turns the rule off: trays stay
   at content height, a stack may stop short of the top plane, and the app
   says so in an info notice (§7.3). Nothing else about packing changes.
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
   `(bedX − 2·bedMargin) × (bedY − 2·bedMargin) × bedZ`, in either XY rotation; a
   lipped tray is printed `lip.height` taller than its own height.
6. **Openings face up.** Box orientation = print orientation. No supports,
   no bridges, no ceilings: no downward-facing surface above z = 0 steeper
   than 45° from vertical. Raised floors are solid.
7. **Contents fit.** Each compartment meets its minimum inner size,
   clearances included.
8. **Every tray has a grip.** Either a compartment whose smaller inner
   dimension is ≥ 25 mm, a wall cutout or a curved floor (§6.1). A curved
   floor counts only while you can reach it: in a bin, whose depth the
   generator chooses, it grips within `SCOOP_REACH` (35 mm, floor to rim) and
   not beyond, since past that the ramp is at the bottom of a pit. A well or
   pocket keeps whatever depth its contents fix, and a wall cutout has no such
   limit — you reach in from the side. Finger cuts
   cut through outer walls (and the lip on them) and dividers, keeping a post
   at each end. Upper trays are lifted the same way. A tray whose components
   all have finger cuts and curved floor turned off (§5) is the user's choice
   and is exempt.

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
- Root ESLint config: ban `Math.random` in `src/layout/**`
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
  id: string; // short base36; can't contain ':' (it ends the tray key's group part)
  name: string;
  access: "often" | "sometimes" | "setup"; // play-time access frequency
  groupId?: string; // same group → same tray, separate compartments; a group name can't contain ':'
  perPlayer?: { players: number }; // counts are per player; not allowed with groupId
  clearance?: number; // advanced: absolute total, replaces the main clearance, not scaled by Fit
  fingerCuts?: boolean; // a centred finger cut through a wall of each compartment (§6.1)
  curvedFloor?: boolean; // the scoop ramp on the floor; bulk, minis and custom only (§6.1)
  cornerReliefs?: boolean; // advanced: Ø 3 mm reliefs in each compartment's corners (§6.1)
  stretch?: boolean; // upright cards and tiles only: the tray grows to fill its space (§5)
  separators?: number; // cards and tiles with stretch on: print the spacer as this many plates (1…10, default 1; §6.2)
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
unrelated components. Keys are matched by prefix, so a group name or a
component id can't contain `:`; validation reports a group name with one at
the field, and a file with such a component id is refused (`invalid.id`). Leftover trays are keyed `leftover:<n>` and can't be
locked. Card spacers are keyed `<trayKey>:spacer`, risers `<trayKey>:riser` (the key of the stack's bottom tray). Several fillers (and risers) printed as one part are keyed `merged:<n>` (§6.2); like a riser, one is derived for printing and never stored. When a spacer is printed as several plates (§6.2) they are keyed `<trayKey>:spacer:1` … `<trayKey>:spacer:<n>`; only the single stored `<trayKey>:spacer` is ever stored.

Component defaults: `access: "sometimes"`, `storage: "auto"`, minis
`storage: "pockets"`. `fingerCuts` is on for cards, tiles, minis and custom
and off for bulk; `curvedFloor` is on for bulk and off for minis and custom.
Minis stored as bulk default like bulk (cuts off, curved floor on), as they
were before the toggles. `curvedFloor` on cards or tiles is a validation error
(cards would bend, upright tiles tilt); the UI hides it there. Both are simple
mode checkboxes ("Finger cuts", "Curved floor"). `cornerReliefs` is on for
tiles and custom and off for cards, bulk and minis; any kind may turn it on
(advanced mode checkbox "Corner reliefs"). Upright tile stacks never get
reliefs, whatever the toggle says: a tile on its edge doesn't need to sit flat,
and "auto" storage offers flat and upright variants from one component, so the
rule sits in the upright stack, not in the defaults. `stretch` is off for every
kind; on, an upright card deck or tile stack is elastic along its width (the
tray takes the whole leaf) and a card spacer or, if `wallAbsorb` allows, thicker
walls and dividers take the slack, never an empty pocket; off, it is content-sized and a spare tray fills the gap. Only cards
and tiles show the checkbox "Stretch to fill", and, while it is on, the number field "Spacer plates" (`separators`, §6.2; whole number 1…10, `BOUNDS.maxSeparators`, validated like the other counts: `field.separators` / `limit.separators`; ignored on other kinds or with stretch off). New cards, bulk and minis
components start with a blank inner line name (deck, item, figure): the plan
then labels the compartment with the component's name.

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
  fillToTop: boolean; // rule 2: pad every stack to the top plane (a riser); off = content height
  wallAbsorb: number; // mm each wall or divider may thicken to absorb leaf slack instead of a filler part (§7.2); 0 = never. Called wallGrowth up to schema 0.1.7; still read
  mergeFillers: boolean; // print connected fillers as one part, up to what fits the bed (§6.2); print-time, not in inputsHash
  mergeRisers: boolean; // with mergeFillers, fold the risers into those parts (the L in elevation, §6.2); print-time, not in inputsHash
  infill: number; // % infill the filament estimate assumes for sparse interiors (§8.3); display only, not in inputsHash
}
```

| Setting                                              | Simple-mode control                                                  | Default                   |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------- |
| `wall`                                               | thin / normal / sturdy                                               | 1.2 / 1.6 / 2.0           |
| `floor`                                              | —                                                                    | 1.2                       |
| `divider`                                            | —                                                                    | 1.2                       |
| `fit`                                                | tight / normal / loose                                               | 0.7 / 1 / 1.4             |
| `cardClearance` (×Fit)                               | via Fit                                                              | 1.5                       |
| `cardStackClearance` + `Pct` (×Fit)                  | via Fit                                                              | 1.0 + 3 % of the stack    |
| `cardThickness`                                      | advanced                                                             | 0.32                      |
| `pieceClearance` (×Fit)                              | via Fit                                                              | 1.0                       |
| `boxClearance` (×Fit)                                | via Fit                                                              | 0.5 per side              |
| `trayGap` (×Fit)                                     | via Fit                                                              | 0.2                       |
| `bottomChamfer`                                      | advanced                                                             | 0.4 (upper trays: ≥ 0.5)  |
| `cornerRadius`                                       | advanced                                                             | 3                         |
| `scoopRadius`                                        | advanced                                                             | 12                        |
| `fingerPocket.width`                                 | advanced                                                             | 25                        |
| `fingerPocket.floorNotch`                            | advanced                                                             | 12.5 (0 = none, up to 50) |
| `fingerPocket.wallRoom`                              | "Extra finger room in the box": on = 10                              | 0 (off; up to 20)         |
| `fingerPocket.dividerRoom`                           | "Extra finger room in the box": on = 5                               | 0 (off; up to 20)         |
| `lip` on / height / thickness / ledge                | advanced                                                             | off / 2 / 1.2 / 1.7       |
| `lip.play` (×Fit)                                    | via Fit                                                              | 0.25                      |
| `topPressFit`                                        | advanced                                                             | 0 (−2…+1)                 |
| `packingFactor`                                      | advanced                                                             | 0.5                       |
| `leftover` (also the riser's and the spacer's style) | advanced: spare tray / solid                                         | spare tray                |
| `fillToTop`                                          | advanced: "Fill the box to the top"                                  | on                        |
| `wallAbsorb`                                         | advanced: "Thicker walls instead of a filler", beside "Unused space" | 0 (up to 3 mm per wall)   |
| `mergeFillers`                                       | advanced: "Merge fillers into one part", beside "Unused space"       | on                        |
| `mergeRisers`                                        | advanced: "Fold risers into the merged fillers" (needs the above)    | off                       |
| `infill`                                             | advanced: "Infill for the filament estimate" (Exact values)          | 15 (0–100 %)              |
| `printer.bedMargin` / `printer.layerHeight`          | advanced                                                             | 5 / 0.2                   |

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
  inputsHash: string; // hash of canonical box, printer, settings, components (names excluded; `separators` is included; `infill`, `mergeFillers` and `mergeRisers` are not), locks
  seed: number;
  iterations: number;
  capped: boolean; // stopped by the safety time cap → not reproducible
  trays: TraySpec[]; // fully resolved; geometry is a pure function of TraySpec
}

interface TraySpec {
  key: string; // trayKey, "leftover:<n>", or "<trayKey>:spacer"
  part: "tray" | "leftover" | "spacer"; // a riser is derived for printing (§6.2), never stored
  path: string; // guillotine path of its leaf ("" for spacers)
  stack: number; // a leftover beside a whole stack has a stack of its own; one inside a stack level shares its tray's
  level: number; // 0 = bottom; a leftover inside a stack level has that level (§7.2)
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

A stored layout leaves out what reading puts back (schema 0.1.8), because a share link has to fit a
chat message: a `spacer` without `path`, `rotated`, `wall`, `floor`, `lip`, `solid` and
`compartments` when they have the values every spacer has (`""`, false, 0, 0, false, true, none),
and an open `leftover` without its `compartments` when it is the one default spare pocket
(`spareCompartment`: the part's inside, on its floor). Any layout that spells them out reads the
same. The same goes for the two merge switches at their defaults (schema 0.1.9: `mergeFillers` on,
`mergeRisers` off): a project leaves them out, and reading puts them back, so a link that does not
use them is as long as it was.

## 6. Geometry

### 6.1 Common to all trays

- Outer block with rounded vertical corners (`cornerRadius`). Wells have inner
  vertical corners ≤ 0.5 mm; compartments of components with `cornerReliefs`
  on (§5) add Ø 3 mm corner reliefs. They shrink to keep 0.9 mm to the outer
  faces and 0.8 mm from other compartments and every cut (so a post beside a
  cut stays at least 0.8 mm), and are left out under Ø 0.6 mm. A relief takes
  precedence over a top fillet: flat tiles need it to sit flat, the fillet is
  comfort, so the fillet beside it shrinks (below).
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

**Wall cutouts** (every compartment of a component with `fingerCuts` on: one
cut style for every tray). A U-cut `fingerPocket.width` wide (round
bottom, radius half the width), from the rim down, through the wall or divider
on one side of a well: out through the outer wall, or across a divider into
the next well, which is cut on the facing side too. Never into bits or into another well that is not cut on the
facing side, such as a well whose component has finger cuts off: a deck
beside one is cut on its other side only. In a group,
cards and tiles cut along the row come first in their row, so the first one's
cut leaves through the outer wall. A well that still gets no cut tries the
other side of the same axis (a custom well of the back row, whose front faces
the front row, is cut through the back wall), then both sides of the other
axis (a deck between bits is cut through the front and back walls), never on
one with no cut at all is not offered (§7.1:
its pieces go in a scoop bin instead, or a warning names it). A component with finger cuts off asks for none, so it
never makes a variant drop. Cuts placed later keep
0.8 mm from those placed before. Wells need no extra room (no reach bands):
they are content + clearance.

**Posts:** a cut never removes a whole wall. It leaves a full-height post of at
least 3 mm (`POST_MM`) between each of its sides and the inner faces of every
compartment it passes, so the wall or divider still holds the contents (at
the rim its top fillet may round it into its wall, below); the
cut is at most the well's side less 2 × 3 mm. Where that leaves less than
10 mm (`MIN_CUT_MM`, a fingertip; or the width setting, if smaller), the well
gets no cut on that axis: it is cut across instead, as above, or not offered.
So tiles under about 16 mm laid flat get no flat variant; an auto component
keeps its upright ones, and one with none left goes in a scoop bin (§7.1).

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
  long-wall cutouts, between rows that aligned flat tiles are cut across) is
  `dividerRoom` thicker. That holds for wherever
  the cuts actually go, a well cut across its row instead included; walls and
  dividers without a cut, also where a cut was asked for but none fits, are
  unchanged. Which
  walls get room is decided on the tray's smallest layout; a larger tray keeps
  that room, also in the rare case where its slack moves a cut elsewhere.
- **Top fillets:** the two top corners of every cut's U (through walls and
  dividers, and the spacer notch's), where a side meets the top, are rounded
  with 3 mm (`FINGER_FILLET_MM`) across the whole wall, so the opening flares
  at the top. Through a lipped wall only the lip is rounded, on its top (at
  most the lip's height), so the ledge the upper tray rests on stays square.
  The radius shrinks where less than 0.8 mm of top would stay beside it (the
  outer corner, where the strip reaches it, another compartment across the
  wall, or a corner relief: a relief takes precedence over a top fillet, which
  keeps 0.8 mm from it and may shrink to nothing), to stay on the
  faces of the compartments the cut runs between, and to the U's straight
  side; under 0.2 mm it is left out. The surface faces up and into the cut, so
  it needs no support. Sizing does not change for it. The cut's vertical edges
  stay square. Posts are full height; at the rim the top fillet may round a
  post into its wall (a 3 mm fillet beside a 3 mm post takes its whole top).
- **Outer corners beside a cut:** where a cutout (or the spacer notch) leaves
  through an outer face, the rounded outer corner ends at least 0.8 mm before
  its side, so the wall beside the cut stays 0.8 mm thick
  right up to that face; the corner radius shrinks for it (never below the
  bottom chamfer, so the cuts' sides keep the chamfer plus 0.8 mm from the
  faces they run along).
- Where a cutout leaves through a lipped wall it interrupts the lip; the lip on
  the other walls and beside the cut still locates the upper tray, which rests
  on the ledge and dividers around the cut.

| Content                | Finger feature                                                        | Depth                    |
| ---------------------- | --------------------------------------------------------------------- | ------------------------ |
| Cards / tiles, upright | One channel per row through both end walls and every divider          | ½ of the shallowest well |
| Cards / tiles, flat    | Half-round cutouts through both long walls, with a floor notch        | To the floor             |
| Minis, pockets         | One centred cut through the front and back walls per pocket, no notch | ½ of the pocket          |
| Custom                 | One centred cut through the front wall, no notch                      | ½ of the well            |
| Bulk, minis bulk       | Off by default; with `fingerCuts` on, as custom                       | ½ of the compartment     |
| Spare                  | None                                                                  | —                        |

**Toggles** (§5; `cornerReliefs` above): `fingerCuts` off leaves out a component's cuts (and their
floor notches and finger room); `curvedFloor` adds the scoop ramp to each of
its compartments (bulk, minis, custom). Its wall is chosen after the cuts are
placed, from the compartment's final size: never a wall with a cut, and the
longer wall, so the ramp runs across the shorter dimension (front, back, left,
right break a tie). A ramp's radius is `min(scoopRadius, depth, across / 2)`, so a flat floor
always stays beside it. The opposite wall gets a second ramp when it has no cut and the two
leave a flat band (`2 × r + MIN_FLAT_FLOOR ≤ across`, 15 mm); a radius is never shrunk to
fit one, so only compartments wide enough for the full radius get two. No compartment is cut on every wall (a kind asks for cuts on one axis, at most two sides, and the retries add cuts only to a compartment with none, at most two), so a ramp always has a free wall. With both off a compartment is a plain box
with a flat floor and whole walls. Finger room goes only on the walls and
dividers a cut actually passes. In a group mixing toggles, each component
keeps its own: a cut never opens into a well with finger cuts off.

**Locating lip** (on any tray with a tray stacked on it):

| Part       | Geometry                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lip        | The outer `lip.thickness` (1.2) of the wall rises `lip.height` (2) above the rim. `min(0.6, thickness − 0.6)` × 45° chamfer on its inner top edge, flat top ≥ 0.6. |
| Ledge      | The next `lip.ledge` (1.7) stays at rim height. A lipped outer wall is `max(wall, thickness + ledge)` (2.9).                                                       |
| Upper tray | Outer face inset `thickness + play` (1.45) per side from the lower tray's outer face.                                                                              |
| Bearing    | ≥ `ledge − 2·play − upper bottom chamfer` (0.7) in any shifted position; the upper tray also rests on the lower tray's dividers.                                   |
| Insets     | Add up: the tray at level k is inset `k·(thickness + play)` per side.                                                                                              |
| Height     | The lip is not part of `tray.h`; it overlaps the upper tray. Upper trays need `h ≥ lip.height + 3`.                                                                |

The lip is **off by default**: only the lower tray carries it, so the upper one
sits inside it with `play` on every side and can rattle. With the lip off the
inset is zero too (it exists only to clear the lip ring), so upper trays are the
same footprint as the tray below and bear on its whole rim; the app still warns
that nothing keys them together (rule 4). Turn the lip on where the trays need
keying.

### 6.2 Per type

| Type           | Shape                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cards, upright | One well per deck in a strip, dividers between                    | `upright-long`: stands on its long edge (well height from the short side); `upright-short`: the reverse (§7.1). Spare stack length goes to a removable card spacer, or to thicker dividers. One finger channel through the walls and dividers (§6.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Card spacer    | Separate block: open walled box (default) or solid, as `leftover` | Well width × spare length (however long) × (well height − 5), printed standing. Where the deck's finger channel crosses its well, the spacer has the same U-notch (same centre and bottom, at least as wide; cut across the whole spacer when less than the bottom chamfer plus 0.8 mm would stay beside it), so the channel stays open end to end. A channel wider than the spacer takes its whole top: the spacer then ends where the channel meets its faces. **Open or solid (geometry 0.5.2):** a spacer is stored as a solid block, but printed it follows `leftover` as a riser does: an open walled box with a floor (`openSpacers`, run last, after `splitRisers` and `splitSeparators`), or a solid block with `leftover: solid`. Its wall is the tray's `wall`, never under `SPACER_MIN_WALL` (2 mm, five perimeters at a 0.4 mm nozzle), and its floor the tray's `floor`. It stays solid when its inside would be under `MIN_SPARE` (10 mm) either way, when its pocket would be under `MIN_SPACER` (5 mm) deep, or when its finger notch would cut into its floor. A spacer stands in the well, whose walls and floor back every face but the two the deck presses on, so what it carries is the deck's squeeze along its length, through its two long walls; those cannot bow outwards, and the walls are thicker than the tray's own dividers. Each part is judged by its own size, so a thin separator plate is solid and a thick one is open. Derived like the riser, not stored: the stored layout, its schema and its share link are unchanged. **Spacer plates (`separators`):** with `separators: n` (cards and tiles with `stretch` on, default 1 = the block above, unchanged) the one stored spacer is printed as `n` loose plates of equal thickness (to the 0.01 mm grid; where it does not divide, the first plates are a hundredth thicker so the sum is exact) standing in exactly its space, each with the same notch, so one can be pulled out as the collection grows and the stack stays snug. A plate carries no load, so its minimum is `MIN_SEPARATOR` (3 mm; solid below `MIN_SPARE` + 2 walls, see above), under the 5 mm of a single spacer, and never less than the bottom chamfer needs (`2·(chamfer + 0.8 mm)`, which planTray enforces). If `n` plates would be thinner, the count is cut back to what fits (down to 1, the plain spacer) and an info notice `separators.reduced` at `/components/<i>/separators` says how many were made and why; the layout never fails over it. Like the riser, the plates are derived, not stored: the stored layout keeps its one `<trayKey>:spacer` however large `n` is, and `splitSeparators` (run after `splitRisers`, wherever printable parts are listed) splits it, finding its component through the compartment it stands in. Since geometry 0.5.1 `separators` no longer shapes the stored layout: a stretched deck's slack is a spacer whatever the count, however long, never a spare pocket (§6, §7.2), and the count only decides how it is printed. It stays in `inputsHash`, so that no plan using it goes stale. A slack too short for a spacer (under 5 mm) is unchanged by it. Plates are numbered after their tray, in the instructions as "Spacer plate n", and exported one 3MF each. |
| Cards, flat    | Rectangular well                                                  | Long side along Y; half-round cutouts through both long walls with a floor notch (§6.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Bulk           | Scoop tray, compartments in a strip (one per item line)           | Scoop fillet on the compartment's longer wall(s), chosen after the cuts (§6.1), radius `min(scoopRadius, depth, across / 2)`, across being the dimension the ramp runs over.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Tiles, flat    | Rect/hex wells, one per column                                    | Columns added when `count × thickness` exceeds the well height. Hex corner-to-corner = `flatToFlat · 2/√3`. Cutouts through the two walls along the longer side (left and right for a square). Corner reliefs take precedence over the cuts' top fillets (§6.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tiles, upright | As upright cards                                                  | Hex stands on a flat edge: height `flatToFlat`, length corner-to-corner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Minis, pockets | One rounded pocket per figure (bounding box + clearance)          | Each pocket's depth = its figure's `h` + clearance (solid raised pocket floor). The tallest figure sets the minimum tray height.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Minis, bulk    | As bulk                                                           | Volume = Σ bounding boxes ÷ `packingFactor`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Custom         | Plain well per item                                               | `pieceClearance`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Riser          | Open walled box (default) or solid block, as `leftover`           | The height a stack doesn't need (rule 2), under its bottom tray: the bottom tray's footprint, on the box floor, a whole number of layers tall, at least `MIN_RISER` (10 mm). The trays above stand on it, so their lips are untouched. The stack's trays and its riser add up to `topPlane` exactly. A riser is a printing decomposition, not a layout fact: it is derived from the stored trays (`splitRisers`) wherever printable parts are listed (3D view, export, instructions, the part count) and is never stored, so the stored layout and share links are the same with or without it, and the stored schema has no riser value. Open follows `settings.leftover`; a footprint with less than `MIN_SPARE` (10 mm) of inner room is solid. Not a tray: not counted in the summary's tray count, not drawn in the plan, numbered and placed first in the instructions, exported like any part, shown in the 3D view in the neutral spare colour.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Leftover       | Open "spare" tray (default) or solid block                        | Fills space that can't be used, so the box is always full.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Groups and multi-compartment trays.** Compartments are laid out as a 1-D
strip, or 2 rows, along the tray's long axis. Every compartment uses the full
tray height: elastic kinds (bulk) grow deeper, others get a solid raised floor.
When every compartment of a stack's trays has one, the part of it that is a whole
number of layers (and keeps the tray at its minimum height) moves out into the stack's
riser instead, if the stack's trays together give up at least `MIN_RISER`; below that
the trays keep their raised floors. A size-locked tray keeps its height, a riser is
never taller than the print bed.

**No spare compartments (geometry 0.5.1).** `realizeTray` used to turn row slack of at least
`MIN_SPARE` plus a divider into an empty "spare" compartment, at the end of a row or as a row at
the back. That was a pocket holding none of the component's pieces, which is absorption, not
growth, and reported as a defect ("a decks' holder with a pocket"), so a tray now holds exactly
the compartments its part asks for. Slack goes to a card spacer (or the `separators` plates, §6.2),
to `wallAbsorb`, or, where neither can take it, evenly to the walls. The `spare` compartment kind
still exists: an open leftover or filler is one spare pocket (`spareCompartment`), and a layout
stored before 0.5.1 can hold one in a tray, where `splitRisers` keeps clamping it to the tray
floor so that it never vetoes a riser.

**Merged fillers (schema 0.1.9, geometry 0.5.2).** The fillers of a layout (and, with `mergeRisers`,
its risers) that touch print as one part, up to the largest that fits the bed, so there are fewer
loose pieces to place by hand. It is a printing decomposition like the riser and the separator
plates: `mergeParts` runs last, after `splitRisers`, `splitSeparators` and `openSpacers`
(`printableParts`), the stored layout keeps its individual leftovers and raised floors, and neither
switch is in `inputsHash`, so toggling one never stales a plan, re-runs the optimizer or lengthens
the stored layout. A merged part is a `leftover` with `merged` set, `members` (each built as it would
be alone) and `bridges` (solid boxes that fill the gap of at most `trayGap` between two members over
at least 2 mm of edge and height, and reach into both as far as their rounded corners cut away, so no
fin a gap thick stands in the notch between them), its box the bounding box of the union, which must
fit the bed either way round. Growth is greedy, largest first, from every part as the first seed;
the grouping with the fewest parts wins. A riser joined to the filler beside it is an L in
elevation and prints as it stands. A filler in a stack level (floor at the tray below's top, top at
the top plane) joins a ground filler only when every member is solid with level tops, and the part
then prints upside down (`merged.flipped`), top face on the bed, so that nothing hangs; the export
turns the mesh half a turn about X, the 3D view keeps it as it stands. A merged part is numbered
before the trays that rest on or stand against it, and after any tray one of its members rests on.
See the minimal-trays spec §6.2 for the measurements.

## 7. Layout engine

### 7.1 Sizing

`sizing` turns each component, or each group, into `TrayRequirement`s:

- the minimum inner size of each compartment (wall cutouts need no room of
  their own; cut walls and dividers may get extra finger room, §6.1);
- which axes can grow ("elastic") and by how much: for upright cards and tiles with `stretch` on only stack
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

A bin with a curved floor is one you reach into, so its pile is capped at
`SCOOP_REACH − BIN_FREEBOARD` (35 − 5 = 30 mm) and the volume is made up by
spreading the footprint wider rather than going deeper; a single piece taller
than that sets its own floor. Realized, such a bin takes the pile plus
`BIN_FREEBOARD` of empty wall, so pieces don't spill over the rim, and stops
there instead of growing into all the height the tray can spare — the rest
becomes raised floor, goes to the tray above, or is reported as unused. A bin
opened through its wall instead (finger cuts, curved floor off) has no reach
limit and still grows to 1.5 × its smaller horizontal size.

A measured card thickness below 0.1 mm per card is treated as a typo: the
sleeve-table thickness is used instead, with a notice.

**Bulk fallback.** Variants with a compartment that gets no finger cut (§6.1)
are dropped. When that drops every variant of a requirement, its tiles, minis
(pockets) and custom members left without a cut are stored loose in scoop
bins instead, so small pieces never disappear: the shallow and deep bulk
shapes of minis bulk storage, one bin per figure line (tiles: count × flat
footprint × thickness; custom: count × w × d × h). Each toggle the component
turned away from its kind's default carries over to its bins; the others take
bulk's defaults (no finger cuts, a curved floor, no corner reliefs). A toggle
set to its kind's default counts as not set, so the bin does not depend on
whether the UI wrote the value. An info notice (`sizing.noFingerSlot`) names
each such component and says what its bins have ("a bin with a curved
floor"). The component's own toggles stay as they are.
The other members of a group keep their storage, and nothing changes while some variant keeps every cut. Cards have no
fallback: a requirement that still has no variant is left out with a
`sizing.noFingerSlot` warning.

### 7.2 Search

- **Representation:** a guillotine tree over the box floor
  (`innerWidth − 2·boxClearance` × `innerDepth − 2·boxClearance`). Internal
  nodes are X or Y cuts; neighbouring leaves are separated by `trayGap`. Each
  leaf is a **stack**: an ordered list of trays. The bottom tray has the
  leaf's footprint (less any filler beside it); the tray at level k stands in the
  corner of the tray below it, one `lip.thickness + lip.play` inset in per side,
  and is no larger than that tray's inset footprint. A leaf is feasible when, for
  every level k, `leaf ≥ req_k + 2·k·(lip.thickness + lip.play)`. The stack's
  total height (Σ `tray.h`) equals `topPlane`. **A level is one tray plus its
  fillers:** a tray is built at the smallest size that holds its own contents and
  the inset footprint of the trays above it, so what a tray is stacked on never
  changes its size or its walls. The room its level has beyond that becomes filler
  parts (below); the tree stores one tray per level and the fillers are derived.
- **Fill:** after placement, slack is shared out.
  - Slack inside a stack level (the room of a tray above level 0, which is the
    inset footprint of the tray below it) is treated like leaf slack, per level,
    against that tray's own settings: elastic axes take it, then wall absorption
    (`wallAbsorb`) if the user allowed it, otherwise a **filler part in that
    level** beside the tray, of any width from `minFiller` for an upper tray
    (the upper chamfer is larger, so a little more than at level 0) up. A gap
    narrower than that is absorbed by the tray, as at level 0. A filler beside an
    upper tray stands from that level's floor to the top of the stack, since the
    trays above it stand inside the tray and nothing else fills the space over
    the filler (rule 2). It is stored as a `leftover` with its stack and level,
    keeps its tray's path, and `splitRisers` moves it up with its tray.
  - Leaf slack, in this order (`axisExtent` in `layout/fill.ts`, `realizeTray`):
    1. Elastic axes take all of it (the tray grows; no filler).
    2. Otherwise a **filler part** (a leftover leaf at full stack height, beside a
       tray of exactly its minimum size) of any width from `minFiller` up. This is
       the default: walls are never thickened silently, so identical trays look
       identical, the plan shows what is printed, and no filament goes into walls
       nobody asked for. `minFiller` is the thinnest part planTray accepts: what the
       bottom chamfer needs (`2·(chamfer + 0.8 mm)`, 2.4 mm at the default 0.4 mm
       chamfer), and never under one wall. A filler of a few millimetres is just a
       flat plate, which prints standing in a tray, so there is no larger minimum.
    3. Opt-in: with `wallAbsorb` above 0 the user accepts that each wall and
       divider thickens inward by up to `wallAbsorb` mm (rounded down to 0.01 mm)
       rather than printing a filler. A leaf whose slack on an axis is at most twice
       `wallAbsorb` (the two outer walls) is absorbed whole. Beyond that the walls
       stay as set and a filler is printed: walls only thicken to avoid a filler,
       never beside one. `wallAbsorb` is limited to 3 mm: from there a wall is at
       least double a normal one and a filler is the better choice. The setting
       absorbs; it gives the contents no more room, which is why it is not called growth.
    4. A gap narrower than `minFiller` (after the tray gap) cannot be a part, so
       the tray absorbs it whatever `wallAbsorb` is. What the walls and dividers
       may not take (nothing by default) is split between the two side walls,
       because a tray left loose in its leaf would rattle (hard rule 1). Such gaps
       do arise: rows and stacks with different minimum sizes meet at arbitrary
       offsets on the 0.01 mm grid.
       Slack inside a stack level follows the same rules, level by level
       (`wallAbsorb`, else a filler in the level, else the side walls).
  - A stretched deck's slack along its stack axis is its spacer (§6.2), however long, or, as
    `separators` plates, the same space split into plates; there is no spare pocket (geometry
    0.5.1). The spacer is one per tray, so in a two-row tray the second row's slack, once the
    first has the spacer, stays in its walls. A slack too short for a spacer (under 5 mm) goes to
    the walls (up to `wallAbsorb`; the rest is split between the side walls), and so does slack
    along a deck's other axis, or in a tray with no deck to put a spacer in.
  - Leftovers narrower than 25 mm + 2 walls
    are made solid (no grip possible). Leftovers larger than the bed are split
    with further cuts.
  - A stack holds at most 4 trays.
  - Height slack goes to the lowest tray in the stack with an elastic height
    (deeper scoop); otherwise to the top tray, as a solid raised floor, which
    is then split off as a riser under the stack when printing (§6.2). With
    `fillToTop` off there is no height slack: nothing is padded.
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
  3. access penalty: `often` items under other trays (200 000 each);
  4. lateral play above 1.5 mm per axis (rule 1);
  5. number of stacked trays (beyond one per stack);
  6. tray count;
  7. setup penalty: `setup` items with nothing on top (15 000 each). Below
     stacked and tray count, so burying a setup tray never buys an extra stack
     or part. A tray that cannot be buried (alone in its stack) pays it in
     every candidate, so it does not steer the search. `sometimes` has no
     term: the three "Needed during play" values mean keep clear / neutral /
     prefer underneath, and all three are preferences, not rules;
  8. filament volume;
  9. on warm starts, moving trays whose requirements didn't change;
  10. the parts of one component looking alike (weak, below a printed part and a stacked tray,
      far below `access`): parts of one requirement turned the same way (15 000 per part
      turned unlike the majority) and standing in one stack (10 000 per extra stack, see
      `WEIGHTS` in `layout/score.ts` for the argument). Preferences, never constraints: they
      never decide against reachability (the three Starter-deck trays of the Star Realms
      project share an orientation, but stay in two stacks, because one stack would bury two
      "often" trays under the 200 000 each costs), and their total is orders of magnitude
      under the overflow weight, so they cannot make a feasible layout lose to an infeasible
      one;
  11. the number of filler parts (a leftover, in a stack level too): 20 000 each, on top of the
      20 000 every part costs (§6.2 of the minimal-trays spec). Under a stacked tray's 50 000 with
      its part, so avoiding a filler never buys a stacked tray, and over every cohesion preference.
      Counts stored leftovers, not merged parts: the merge is a print-time setting outside the
      hash. A reward for fillers against the box wall was measured and dropped: it raised the
      filler count.
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

- **No fit found (`layout.doesNotFit`):** this means the search found no fit,
  not that none exists. It is a heuristic, and a very tight box can have a layout it
  cannot find from scratch (a real 101 × 195 × 37 mm box needed millions of
  iterations, while the stored result was valid all along). The message therefore
  opens "No fit found yet", names the iterations the run made, says that is not
  proof the components cannot fit, reports the least-overflow attempt and its
  shortfall per axis as "the closest attempt so far", and says that pressing
  "Update plan" again searches about 3 times longer. Then the concrete
  suggestions: unsleeve, store flat or upright, move the rulebook or boards
  elsewhere (less headroom), choose a tighter fit, split groups. A failed run
  stores nothing, so a repeat would redo the same deterministic search; the
  runner instead multiplies the budget by 3 on each user-pressed repeat for the
  same inputs (an automatic run, an edit or a found fit starts over at N). There is
  no automatic retry. The Summary's "short by" line says "Closest attempt so far is
  short by …" in the same spirit.
- **Out-of-date plan (`geometry.olderMajor`):** a layout made under an older
  geometry line (an older MAJOR, or pre-1.0 an older 0.MINOR) keeps its old
  geometry until the plan is re-run. The warning says the plan is out of date,
  names both versions, says "Update plan" rebuilds the trays with the current
  geometry, and that trays exported from the old plan won't mate with new ones,
  so the whole insert must be reprinted.
- **Coverage:** applies when `headroom > 0` and `headroomCoverage` is
  `partial`. The score keeps loose bits out of the top layer. Any that remain
  are warned about, with a suggestion to move them below other trays. With
  `storedOnSide`, any loose bits in the top layer trigger a warning, whatever
  the coverage. The warning names the contents of each exposed tray; spare
  compartments are empty filler and are left out of that list. (Only a
  requirement's components make it "loose", so spares never add to the score
  penalty either.)
- **Bed:** a requirement too large for the bed in every variant, splits
  included → error naming the component.
- **Play:** lateral play above 1.5 mm on an axis → warning. Play is
  `2 × box clearance + (trays in the row − 1) × tray gap`, times Fit. The
  message names the axis the way the Summary readouts do (left–right,
  front–back), says how many trays sit in that row (`LayoutSummary.crossX` /
  `crossY`), and names the controls: a tighter Fit, Box clearance (counts
  twice) and Tray gap (counts once per extra tray) under "Exact values", and
  fewer trays in the row. The 1.5 mm limit is fixed and the warning cannot be
  dismissed: the controls above clear it.
- **Lip off:** warning when the layout has stacked trays (rule 4).
- **Stops short:** info notice (`layout.stopsShort`) when `fillToTop` is off and
  a stack ends below the top plane: boards and the lid won't rest on it, so
  its trays can shift a little when the box is carried.
- **Dropped locks** are named by what their trays hold, e.g. `Position lock on
"Deck ×50" was dropped: …`, never by tray key. The layout engine resolves the
  name where it builds the notice (the UI only shows `message`). A lock whose
  tray no longer exists reads "a tray that no longer exists".
- **Capped runs** and a **stale stored layout** (§8.4) are shown as notices.

## 8. UI

### 8.1 Layout

One page. Inputs on the left (Box → Printer → Components → Settings), results
on the right (summary, plan view, 3D view, export). A global Simple ⇄ Advanced
toggle plus a per-component "more options" section. On narrow screens the
panels stack. Plan-view edits use pointer events (mouse and touch) and have a
keyboard alternative (select A, then "swap with" B). Without WebGL, the 3D
view shows a message and the rest works. There is no preview banner. The
Project menu closes on an outside click, on Escape and on choosing a project.

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

- **Filament estimate at infill.** Both filament figures are taken over the
  parts that print, not the stored trays: each stack's raised floor first comes
  out as its riser (`splitRisers`), open or solid per `leftover`, so an open
  riser is mostly air, and connected fillers are merged (`mergeParts`, §6.2). Tray, stack and fill figures stay on the stored trays
  (the split moves height, not volume). Material within a shell of any surface
  prints solid whatever the infill; only the interior beyond it is printed at
  `infill`, so a region under two shells thick is wholly solid and a thin-walled
  tray barely changes. The shell is derived from what prints, not set: 3
  perimeters × 0.45 mm (a constant, not a setting) sideways and 5 solid layers ×
  `printer.layerHeight` vertically (1.35 mm and 1.0 mm by default). An
  approximation on the plastic-heavy side: a solid part (filler, riser) is one
  box eroded by the shell; in a hollow tray, walls, dividers, floor and lip
  count solid and only the slab under each compartment (footprint × `floorZ`) is
  eroded; a spacer counts solid (it prints as thin plates); a merged part is its members as they print alone plus the plastic of its bridges outside them. `infill` is display
  only and is not in `inputsHash`.
- **Summary:** box fill %, tray count, stack count, filament in grams
  (PLA 1.24 g/cm³; two figures in advanced mode: an estimate at `infill`, and
  the upper bound at 100 % fill, which needs no assumptions; the estimate is a
  shell-and-core model, below), lateral play per axis,
  warnings (the first 3 are shown, errors always; the rest fold behind "Show all
  N messages" so the results stay in view). Under it: one search button
  whose label says what pressing it does. With no layout yet, or a stale one
  (inputs changed since it was made, or the layout was made under an older
  geometry line), it reads "Update plan" and re-fits to the
  current inputs with the normal budget N. When the layout is current it reads
  "Keep searching" and runs 3N more, adding to the stored cumulative iteration
  count. Both start from the current layout (same seed) and never discard it;
  a one-line hint says so. It is disabled only while a run is in progress or
  when the optimizer is blocked by errors or an empty project. "Undo layout" is
  a separate button. The stale notice has no button of its own.
- **Plan view:** per-layer top-down drawing; click to select, drag or
  keyboard to swap, lock toggle. A merged filler is drawn as the members of it that stand on the
  layer shown, with one number.
- **3D view:** explode slider, layer toggle, click a tray for contents and
  dimensions.
- **Export:**
  - zip of one 3MF per printed part: trays, plus any card spacers (one per plate when split), risers and merged fillers (a merged part that only prints without supports upside down is exported turned over) (named
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
  another project. A link or file whose id exists with the same content just
  opens the stored project; with different content (or a stored project this
  app can't read) it opens as a copy named "… (copy)".
- **Several tabs:** every tab compares what it last saw in storage with
  what is stored now (by content, on a `storage` event and before each save).
  - A tab with no edits of its own silently shows the newer version.
  - A tab with edits pauses its autosave, shows a notice that can't be
    dismissed, and offers "Keep my version" (saves it over the other one) or
    "Load the other tab's version". Edits made while paused are never written.
  - Leaving the project while paused keeps this tab's version as a copy
    ("… (copy)"); "Keep my version" never overwrites a stored version this app
    can't read (it saves a copy instead).
  - Leaving a project whose last save failed asks first; a declined question
    changes nothing, an accepted one leaves a notice naming the project.
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
    kinds. A new field's default reproduces the previous behaviour exactly, unless
    the change is a deliberate, documented one: the version bump signals it, and
    projects saved earlier size differently once re-optimized. `stretch`
    (default off) and `wallAbsorb` (then `wallGrowth`; default 0: trays that used to thicken
    their walls now sit beside a filler part; schema 0.1.6, geometry 0.4.0) are the precedents.
    Schema 0.1.8 renamed `wallGrowth` to `wallAbsorb`. A rename is a MAJOR change by the rule
    below, but this one is read both ways (a file with only the old key keeps its value, and
    the key is never reported as unknown) and hashed under its old name, so no file, link or
    stored plan is affected and it counts as a PATCH. Schema 0.1.8 also stores a spacer without
    the fields every spacer has the same value for, and an open leftover without its one pocket
    (both put back on reading), which takes about 35 and 70 characters off a share link. A field that only changes how stored trays are
    printed (`separators`, default 1) bumps the schema but not the geometry version.
    Schema 0.1.9 is another of those: `mergeFillers` (default on) and `mergeRisers` (default off)
    only change how stored parts are grouped for printing (§6.2). The defaults are left out of what
    is written, and neither is in the inputs hash, so no file, link or stored plan is affected, and
    geometry stays 0.5.2: no outer size, lip, inset or well changes, and every part, merged or not,
    is built from the same member parts. The filler count term of §7.2 changes which layouts a run
    finds, not what a stored one means, so it needs no version either.
    It is in the inputs hash all the same, from the time when above 1 it decided whether a
    stretched deck got a spacer or a spare pocket (§6.2); since geometry 0.5.1 it no longer
    shapes the layout, and is left in the hash only so that no plan using it goes stale.
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
    and after won't mate. Loading a layout with an older geometry MAJOR warns that
    the plan is out of date: re-run it ("Update plan") and reprint the whole insert (§7.3).
- **Resolved settings:** projects store resolved `settings` values (§5), so
  changing a default never changes an existing project.
- **App version** (`package.json`, shown in the footer, written to
  `createdWith`):
  - MAJOR when the schema MAJOR or the geometry MAJOR changes.
  - MINOR for features, including optimizer improvements. Stored layouts keep
    shared links stable.
  - PATCH for fixes.
- Before the first release the app is `0.x` and makes no compatibility
  promise (the app shows no banner for it). Pre-1.0, each `0.MINOR` is treated
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
