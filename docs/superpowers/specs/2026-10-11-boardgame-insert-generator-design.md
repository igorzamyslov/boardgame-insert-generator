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
- ~~Renaming the box dimension labels: "depth" reads as vertical to some users;
  width / length / height is clearer. UI labels only, not the schema fields.~~ Done: §8.2.
- ~~An optional XYZ axis indicator in the 3D viewer.~~ Done: §8.3 "3D view".
- ~~An exploded 3D view in the assembly page and its print output.~~ Done: §8.3 "Assembly page".
- ~~Part numbers on the trays, matching the assembly instructions.~~ Done (schema 0.1.14,
  geometry 0.7.1): engraved, not embossed; §6.1 "Part numbers".
- A donation link on the export screen.
- ~~Export as a modal, so leaving it does not mean switching back a view mode.~~ Done: §8.3 "Export".
- ~~Showing the sizes derived from a component's presets (card format, count,
  sleeve) next to the editor, so the user can judge whether to trust them
  without measuring, plus a correction multiplier for when they do not match.~~
  Done (schema 0.1.10): §5 "Thickness correction", "Derived sizes" and "Labels".
- ~~Showing which settings differ from their defaults, with a button to restore a
  setting (or all settings) to default.~~ Done: §8.2 "Changed settings".
- ~~Making the 1.5 mm play limit a setting.~~ Done (schema 0.1.11): `playLimit`, §5, §7.3.
- ~~A print-time estimate.~~ Done: §8.3.
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
   the summary; above `settings.playLimit` (1.5 mm by default) it is penalized (§7.2) and warned about.
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
  innerDepth: number; // Y: front → back (labelled "Length" in the UI; the field keeps its name)
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
  growth?: { w?: GrowthMode; d?: GrowthMode; h?: GrowthMode; stack?: GrowthMode }; // how much more room the contents may have, per axis (§5); replaces `stretch`
  separators?: number; // cards and tiles that may grow along the stack: print a spacer, as this many plates (1…10; absent or 0: no spacer, the default; 1: one block; §6.2, minimal-trays spec §5.3)
  dividers?: number; // upright cards and tiles that may grow along the stack: this many dividers, so dividers + 1 sections, each in a floor slot (0…6, default 0; schema 0.1.13; minimal-trays spec §5.2)
}

interface CardsComponent extends ComponentBase {
  kind: "cards";
  shortSide: number; // card size (not sleeve size); the UI swaps the two if entered the other way round
  longSide: number;
  decks: { name: string; count: number }[];
  sleeve: "none" | "standard" | "premium" | { w: number; h: number; thickness: number }; // custom: sleeve outer size, added thickness per card
  thickness:
    { mode: "preset"; scale?: number } | { mode: "measured"; cards: number; stackMm: number }; // preset: scale multiplies the per-card thickness (0.5–2, left out at 1); measured: as stored, sleeves included, and no scale
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
rule sits in the upright stack, not in the defaults. **Growth** (`growth`, schema 0.1.12,
minimal-trays spec §5; replaces `stretch`) is how much more room a component's own contents may have
than they need, per axis: `off`, `auto`, a number of mm, or `max`. The axes are in the user's terms,
`w`, `d`, `h` (width, length, height of what is stored) and `stack` (a deck or stack of tiles,
whichever way it lies: along its stack when it stands up, taller when it lies flat); sizing maps
each to the physical axis of the tray, and the layout turns it with the tray. An axis where growing
cannot help is not offered, and is always `off` whatever a file says (`growthAxesOf`): a card
well's width and length, a tile's footprint, a minis pocket's depth. Defaults: bulk, and minis
stored as bulk, `auto` on all three; an upright deck or stack of tiles `auto` along its stack;
a flat one `off` (the spare height is a riser's); minis pockets (width and length) and custom
wells `off`. `auto` is the lesser of `AUTO_GROWTH_FRACTION` (1.0) times the content's size on that
axis and `AUTO_GROWTH_CEILING` (50 mm); the hint says so. **Retention** bounds an upright stack:
without the `separators` plates a number or `max` is held to `UNPLATED_RETENTION` (1) stack
thickness, past which the stack would topple, and to what keeps the stack under its finger cut
when it stands against one end of the well (reachability: room ≤ `fingerPocket.width` + stack − 2 ×
`MIN_REACH_OVERLAP`, 10 mm; minimal-trays spec §5.3), whichever is less; with `separators` set, to
`PLATED_RETENTION` (6). A gap up to
a tray's growth is absorbed with no filler; past it the tray grows by the growth and the rest is a
filler beside it, never thicker walls. The well itself takes what a deck is given (with
`wallAbsorb`, thicker walls and dividers the rest), never an empty pocket, and nothing is printed to
fill it: a card spacer only when `separators` is set (geometry 0.7.2). Cards and tiles show one
control, "Room for more cards" or "Room for more tiles", and, while the stack may grow, the number
field "Spacer plates" (`separators`, §6.2; whole number 0…10, 0 the default and none, `BOUNDS.maxSeparators`, validated like the other counts: `field.separators` / `limit.separators`; ignored on other kinds or with growth off), and for a deck or stack of tiles that stands up and may grow, "Dividers" (`dividers`, schema 0.1.13; whole number 0…6, `BOUNDS.maxDividers`: `field.dividers` / `limit.dividers`; N dividers make N + 1 sections, each held in a slot in the floor; the well has no spacer then, so "Spacer plates" is hidden; ignored on other kinds, flat storage or with growth off; minimal-trays spec §5.2); bulk, minis stored as bulk and custom wells "Extra
width / length / height", minis pockets "Looser pockets: width / length", all advanced options. A
number is checked like a length, 0…1000 mm (`field.length` / `limit.length` at
`/components/<i>/growth/<axis>`). `stretch` is still read: `true` was what an upright stack now does by
default, so it reads as nothing set; `false`, the old default, reads as `growth.stack: "off"`; it
never becomes `max`, and is never written back. New cards, bulk and minis
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
  oneWall: boolean; // instead of a filler, let ONE outer wall per axis take the slack, up to 20 mm (minimal-trays spec §6.3); replaces wallAbsorb while on; in inputsHash only when on
  mergeFillers: boolean; // print connected fillers as one part, up to what fits the bed (§6.2); print-time, not in inputsHash
  mergeRisers: boolean; // with mergeFillers, fold the risers into those parts (the L in elevation, §6.2); print-time, not in inputsHash
  infill: number; // % infill the filament estimate assumes for sparse interiors (§8.3); display only, not in inputsHash
  engraveNumbers: boolean; // engrave each part's number from the instructions into its outer wall (§6.1 "Part numbers"); mesh only, not in inputsHash
  playLimit: number; // mm of nominal sideways play above which a layout is penalized and warned about (rule 1, §7.2, §7.3); in inputsHash unless 1.5
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
| `oneWall`                                            | advanced: "One thick wall instead of a filler", beside the above     | off                       |
| `mergeFillers`                                       | advanced: "Merge fillers into one part", beside "Unused space"       | on                        |
| `mergeRisers`                                        | advanced: "Fold risers into the merged fillers" (needs the above)    | off                       |
| `engraveNumbers`                                     | advanced: "Engrave part numbers", beside the merge switches          | on                        |
| `infill`                                             | advanced: "Infill for the filament estimate" (Exact values)          | 15 (0–100 %)              |
| `playLimit`                                          | advanced: "Play limit" (Exact values)                                | 1.5 (0.5–5 mm)            |
| `printer.bedMargin` / `printer.layerHeight`          | advanced                                                             | 5 / 0.2                   |

Not a setting, but the third thing that is easily mistaken for `fit` and
`cardStackClearance`: a cards component's `thickness.scale` (§5), a correction to the
estimated per-card thickness. `fit` scales every clearance; `cardStackClearance` and its `Pct`
add room around the stack; `scale` corrects the stack itself.

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

**Thickness correction (schema 0.1.10).** A preset thickness may carry `scale`, a
multiplier on the whole tabulated per-card thickness (card plus sleeve): the deck's
stack becomes `n·t·scale·(1 + pct) + cardStackClearance`. It is per cards component,
inside the preset thickness, because a correction is about one set of cards and sleeves
(and the measured mode it stands beside is per component too); a project-wide setting
would silently change every deck, including the ones the table already gets right. A
measured stack has no `scale`: a measurement is the correction, and the editor hides the
field (and the file drops it) while "Measure a stack" is on. It is stored as a multiplier,
shown in the editor as a percentage off ("Correct the estimated thickness", `-50` to `+100`,
0 stores nothing), and checked to 0.5–2 (`field.thicknessScale` at
`/components/<i>/thickness/scale`). It is in the inputs hash with the rest of the component.
It is not `fit`, which scales every clearance, nor `cardStackClearancePct`, which adds room
as a fraction of the stack: both leave the estimate of the cards themselves alone, and the
hint says so.

**Derived sizes.** Beside each cards, tiles, minis and bulk editor (never custom, whose
size is the input; nor a component with a validation error) the app lists what the presets
add up to, one line per deck, item or figure, read from `componentOptions` (the
`CompartmentReq` minimums the optimizer packs) with the correction already applied, so a
user can check it against a real deck with a ruler:

- cards: "50 cards ≈ 17.5 mm thick (0.35 mm per card), in a 65 × 89.5 mm well". The thickness
  is `n·t` (without the stack clearance); the well is the card's face plus card clearance,
  read from the flat option, which exists for every storage and is the same however a deck
  stands, so it does not depend on the optimizer's pick;
- tiles: the stack height `count × thickness` and the first option's well (one column, flat
  or upright as set; a taller stack may be split into columns);
- minis: the pocket of each figure (standing), or the bins as for bulk when stored as bulk;
- bulk: for each item the volume the pile needs (packing included) and the bin of each
  shape, shallow and deep, since neither is the plain answer.

**Labels.** A compartment's `contents` is `<component name> — <name> ×n`, e.g. "Starter deck —
Deck 1 ×15", so the several trays of one component read as a group in the plan, the 3D view,
the details panel, the instructions and notices. The component name is left out when the
deck, item or figure has no name (it falls back to the component's), when it is called the
same as the component, and when the component itself is unnamed (the id it would fall back
to means nothing to a reader). Tiles and custom components have only their own name. Layouts
stored before this keep their old text until the plan is re-run; identity (tint, glyph)
matches the longest name found in the text, so both forms resolve to the same component.

**Bed presets:** 256³ (Bambu), 250×210×220 (Prusa MK4), 220×220×250
(Ender 3), custom.

### StoredLayout

```ts
interface StoredLayout {
  createdWith: string; // app version
  geometryVersion: string; // semver of the tray geometry generator, §9
  inputsHash: string; // hash of canonical box, printer, settings, components (names excluded; `separators` and `dividers` are included; `infill`, `engraveNumbers`, `mergeFillers` and `mergeRisers` are not; `oneWall` is, but only when on; `playLimit` is, but left out at its default 1.5 so older plans stay current), locks
  seed: number;
  iterations: number;
  capped: boolean; // stopped by the safety time cap → not reproducible
  trays: TraySpec[]; // fully resolved; geometry is a pure function of TraySpec
}

interface TraySpec {
  key: string; // trayKey, "leftover:<n>", or "<trayKey>:spacer"
  part: "tray" | "leftover" | "spacer"; // a riser and a divider are derived for printing (§6.2), never stored
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
    contents: string; // what the compartment holds: "<component> — <deck, item or figure> ×n", see §5 "Labels"
    features: (
      | {
          type: "wallCutout";
          side: "front" | "back" | "left" | "right";
          at: number;
          width: number;
          depth: number;
          floorNotch: number;
        }
      | { type: "dividerSlot"; axis: "x" | "y"; at: number; width: number; depth: number }
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
`mergeRisers` off) and for `engraveNumbers` on (schema 0.1.14): a project leaves them out, and
reading puts them back, so a link that does not use them is as long as it was.

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

**Part numbers** (`engraveNumbers`, schema 0.1.14, geometry 0.7.1). Nine similar trays are hard to
tell apart, so each printed part carries the number the assembly instructions and the plan give it
(`numberParts`), engraved into one outer wall. The app puts the number on the copy of the spec it
asks the geometry layer to build (`TraySpec.partNumber`, never stored: it depends on the whole part
list, and on `engraveNumbers`), so a spec without one builds exactly as before.

- **Recessed, not raised.** An engraving on a vertical outer wall prints without support, cannot
  catch or change how parts mate, stack or sit in the box, and leaves every outer size as it was
  (it only removes material). Nothing is embossed.
- **Where.** On the first face of front, back, left, right (as seen from the box front) that gives
  digits at least 1.3 mm a stroke (6.5 mm tall), else on the face that gives the most, and never
  below 1.0 mm a stroke (5 mm tall). Centred on the widest free stretch of the face, centred in
  height. Kept 1.5 mm from the corner arcs (outer corner radius plus 1.5 mm), 3 + 1.5 mm from a
  wall cutout leaving through that face (its fillets and a margin), 1 mm above the bottom chamfer
  and 1.5 mm below the rim, so the lip, the chamfers, the corner radii and the cutouts stay clear.
  When no face has room, or a wall is too thin, the part is left plain, not forced.
- **Size and depth.** Digits 3 strokes wide and 5 tall, strokes and gaps the same width: at most
  1.6 mm (8 mm tall, 4.8 mm wide), less on a low part (`(h − chamfer − 2.5) / 5`) or a narrow face.
  The recess is 0.4 mm deep, one nozzle line and a quarter of the default 1.6 mm wall; it is
  shallower where the material behind it (the wall to the nearest well or corner relief, finger
  room and the lip's ledge counted) is under 1.2 mm, so that at least the thinnest feature,
  0.8 mm, stays behind the floor of the engraving, and the face is skipped under 0.3 mm. The wall
  keeps its strength: the recess takes a quarter of a default wall and only where strokes are.
- **No overhang.** The top (roof) of every stroke slopes down into the wall at 1.25 mm per mm of
  depth (51° from the horizontal, so more than 45°); its floor is flat and faces up, its sides are
  vertical. The strokes are convex pieces (a hull per rectangle), joined by one union and
  subtracted with the other cutters, so the solid stays closed (no new genus: the engraving is a
  recess) and the mesh checks of `checkPrintability` hold: no overhang over 45°, nothing thinner
  than 0.8 mm (strokes and the gaps between them are at least 1.0 mm wide).
- **Glyphs.** There is no font: each digit is a seven-segment figure of axis-aligned rectangles on
  a 3 × 5 stroke grid (`glyphs.ts`), numbers are digits side by side 1.5 strokes apart. Only whole
  numbers exist, as part numbers.
- **Which parts.** Trays, spare trays and filler blocks, and risers (the parts whose outer walls
  stand in view). Not card spacers or dividers: loose plates a few millimetres thick that go
  inside another part and have no face for it. They stay numbered in the instructions only.
- **Merged parts** carry it once, on the member with the largest room, on a face on the merged
  part's outside; a merged part that prints upside down (`merged.flipped`; all members solid) gets
  it cut as it prints, so the digits read upright and the strokes' roofs still face down on the
  bed; the export's half turn about X brings it back.
- **Setting.** `engraveNumbers`, on by default: the numbers are the point of the feature, cost
  one boolean per part and change no fit. A mesh-only setting, like `infill`, it is no part of
  the inputs hash, so toggling it neither stales a plan nor re-runs the optimizer.

### 6.2 Per type

| Type           | Shape                                                                                                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cards, upright | One well per deck in a strip, dividers between                                                                                                  | `upright-long`: stands on its long edge (well height from the short side); `upright-short`: the reverse (§7.1). Spare stack length widens the well, and goes to a removable card spacer only where `separators` asks for one (geometry 0.7.2), or to thicker dividers. One finger channel through the walls and dividers (§6.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Card spacer    | Only when the component sets `separators` (geometry 0.7.2: never by default). Separate block: open walled box (default) or solid, as `leftover` | Well width × spare length (up to the deck's growth, §5) × (well height − 5), printed standing. Where the deck's finger channel crosses its well, the spacer has the same U-notch (same centre and bottom, at least as wide; cut across the whole spacer when less than the bottom chamfer plus 0.8 mm would stay beside it), so the channel stays open end to end. A channel wider than the spacer takes its whole top: the spacer then ends where the channel meets its faces. **Open or solid (geometry 0.5.2):** a spacer is stored as a solid block, but printed it follows `leftover` as a riser does: an open walled box with a floor (`openSpacers`, run last, after `splitRisers` and `splitSeparators`), or a solid block with `leftover: solid`. Its wall is the tray's `wall`, never under `SPACER_MIN_WALL` (2 mm, five perimeters at a 0.4 mm nozzle), and its floor the tray's `floor`. It stays solid when its inside would be under `MIN_SPARE` (10 mm) either way, when its pocket would be under `MIN_SPACER` (5 mm) deep, or when its finger notch would cut into its floor. A spacer stands in the well, whose walls and floor back every face but the two the deck presses on, so what it carries is the deck's squeeze along its length, through its two long walls; those cannot bow outwards, and the walls are thicker than the tray's own dividers. Each part is judged by its own size, so a thin separator plate is solid and a thick one is open. Derived like the riser, not stored: the stored layout, its schema and its share link are unchanged. **Spacer plates (`separators`):** with `separators: n` (cards and tiles that may grow along the stack; absent or 0 is no spacer at all, 1 the block above) the one stored spacer is printed as `n` loose plates of equal thickness (to the 0.01 mm grid; where it does not divide, the first plates are a hundredth thicker so the sum is exact) standing in exactly its space, each with the same notch, so one can be pulled out as the collection grows and the stack stays snug. A plate carries no load, so its minimum is `MIN_SEPARATOR` (3 mm; solid below `MIN_SPARE` + 2 walls, see above), under the 5 mm of a single spacer, and never less than the bottom chamfer needs (`2·(chamfer + 0.8 mm)`, which planTray enforces). If `n` plates would be thinner, the count is cut back to what fits (down to 1, the plain spacer) and an info notice `separators.reduced` at `/components/<i>/separators` says how many were made and why; the layout never fails over it. Like the riser, the plates are derived, not stored: the stored layout keeps its one `<trayKey>:spacer` however large `n` is, and `splitSeparators` (run after `splitRisers`, wherever printable parts are listed) splits it, finding its component through the compartment it stands in. Since geometry 0.5.1 `separators` no longer shapes the stored layout: a stretched deck's slack is a spacer whatever the count, however long, never a spare pocket (§6, §7.2), and the count only decides how it is printed. It stays in `inputsHash`, so that no plan using it goes stale. A slack too short for a spacer (under 5 mm) is unchanged by it. Plates are numbered after their tray, in the instructions as "Spacer plate n", and exported one 3MF each. Carries no engraved number (§6.1 "Part numbers"): a loose plate. |
| Divider        | Loose plate in a floor slot of a grown upright deck or stack of tiles                                                                           | `DIVIDER_THICKNESS` (3 mm, or what the bottom chamfer needs) × the well's depth less 0.4 mm × (the slot's 2 mm and the well height − 5), printed standing, solid, built as a level 0 part like a spacer. Derived at print time from the `dividerSlot` features of the stored tray (`splitDividers`, after `splitRisers`), keyed `<trayKey>:divider:<n>`, never stored. The slot is `width` (plate + 0.4 mm) wide, 2 mm deep, across the whole well, evenly spaced, so `dividers + 1` sections are equal; the floor under a divided well is 2 mm thicker (`floorExtra`; no taller where the floor was raised anyway). Numbered after its tray, "Divider n"; not combined with spacer plates (minimal-trays spec §5.2). Carries no engraved number: a loose plate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Cards, flat    | Rectangular well                                                                                                                                | Long side along Y; half-round cutouts through both long walls with a floor notch (§6.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Bulk           | Scoop tray, compartments in a strip (one per item line)                                                                                         | Scoop fillet on the compartment's longer wall(s), chosen after the cuts (§6.1), radius `min(scoopRadius, depth, across / 2)`, across being the dimension the ramp runs over.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Tiles, flat    | Rect/hex wells, one per column                                                                                                                  | Columns added when `count × thickness` exceeds the well height. Hex corner-to-corner = `flatToFlat · 2/√3`. Cutouts through the two walls along the longer side (left and right for a square). Corner reliefs take precedence over the cuts' top fillets (§6.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Tiles, upright | As upright cards                                                                                                                                | Hex stands on a flat edge: height `flatToFlat`, length corner-to-corner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Minis, pockets | One rounded pocket per figure (bounding box + clearance)                                                                                        | Each pocket's depth = its figure's `h` + clearance (solid raised pocket floor). The tallest figure sets the minimum tray height.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Minis, bulk    | As bulk                                                                                                                                         | Volume = Σ bounding boxes ÷ `packingFactor`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Custom         | Plain well per item                                                                                                                             | `pieceClearance`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Riser          | Open walled box (default) or solid block, as `leftover`                                                                                         | The height a stack doesn't need (rule 2), under its bottom tray: the bottom tray's footprint, on the box floor, a whole number of layers tall, at least `MIN_RISER` (10 mm). The trays above stand on it, so their lips are untouched. The stack's trays and its riser add up to `topPlane` exactly. A riser is a printing decomposition, not a layout fact: it is derived from the stored trays (`splitRisers`) wherever printable parts are listed (3D view, export, instructions, the part count) and is never stored, so the stored layout and share links are the same with or without it, and the stored schema has no riser value. Open follows `settings.leftover`; a footprint with less than `MIN_SPARE` (10 mm) of inner room is solid. Not a tray: not counted in the summary's tray count, not drawn in the plan, numbered and placed first in the instructions, exported like any part, shown in the 3D view in the neutral spare colour. Carries an engraved number.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Leftover       | Open "spare" tray (default) or solid block                                                                                                      | Fills space that can't be used, so the box is always full. Carries an engraved number, spare tray or filler block (a merged part once).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Part number    | Engraved digits, 0.4 mm deep, up to 8 mm tall, on one outer wall                                                                                | Seven-segment strokes cut as a recess with sloped roofs: no support, no overhang, no growth. On trays, fillers and risers; not on plates (§6.1 "Part numbers").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

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
the compartments its part asks for. Slack goes to the elastic compartments up to their growth, to a
card spacer (or the `separators` plates, §6.2) where the component asks for one, to `wallAbsorb`, or,
where none can take it, evenly to the walls. The `spare` compartment kind
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
- which axes can grow ("elastic") and by how much (a cap in mm, absent for `max`): the component's
  `growth` (§5), mapped from the user's axes to the compartment's; for bulk any axis, as long as
  volume stays ≥ required and the per-axis minimums below hold;
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

`t` is the preset thickness times `thickness.scale` (default 1) when the thickness is a preset.

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
  corner of the tray below it (or at the far end of an axis, where that keeps a filler off a
  finger cut), one `lip.thickness + lip.play` inset in per side, and is no larger than that
  tray's inset footprint. A leaf is feasible when, for
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
    5. Opt-in, and instead of 3: with `oneWall` on, one outer wall per axis takes the
       slack the contents cannot, up to 20 mm (`ONE_WALL_MAX_MM`), rather than a filler;
       past that a filler, and `wallAbsorb` is ignored. It is the far wall (back, right)
       unless a finger cut goes through it, then the near one, and the slack is split
       where both are cut (minimal-trays spec §6.3).
  - A growing deck's slack along its stack axis, up to its growth, widens its well (geometry
    0.7.2), and is a spacer (§6.2), or, as `separators` plates, the same space split into plates,
    only where the component sets `separators`; there is no spare pocket (geometry
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
  cut, change a variant, rotate, reorder a stack, merge or split a stack, move
  one tray to another stack, swap one tray with one of another stack (the last
  two trade heights between stacks; no other move changes one tray's stack
  without a floor overflow on the way). Re-runs after an edit start from the
  current layout (warm start).
  **Partition starts:** when no greedy start is feasible, trays are also dealt over
  2 to 8 stacks side by side (tallest first onto the shortest stack, both ways
  round, along X and along Y) and the best-scoring start of all wins. A box whose
  heights fill the top plane with no slack is a partition problem the first-fit
  packer cannot be steered to solve. Stack-locked groups keep a leaf of their own
  and position locks are applied as for any start. A feasible greedy start skips
  this, so ordinary runs begin as before.
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
  4. lateral play above `playLimit` (1.5 mm by default) per axis (rule 1);
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
      one. The stack count also counts the trays of other requirements standing between its
      parts, so they end up adjacent where their sizes allow (minimal-trays spec §6.4);
  11. the number of filler parts (a leftover, in a stack level too): 20 000 each, on top of the
      20 000 every part costs (§6.2 of the minimal-trays spec). Under a stacked tray's 50 000 with
      its part, so avoiding a filler never buys a stacked tray, and over every cohesion preference.
      Counts stored leftovers, not merged parts: the merge is a print-time setting outside the
      hash. A reward for fillers against the box wall was measured and dropped: it raised the
      filler count.
  12. walls a stack swells (`swollen`): per tray and axis the square of the extra thickness per side
      that the trays above force on it beyond an equal tray's two insets and what it absorbs as room
      for its contents, 80 000 per mm², capped at 10 mm per axis; a tray with an "often" tray
      above it is exempt, so reachability is never what pays. It puts the largest footprint at the
      bottom of a stack, which `leftover` alone did not (it charges a filler by volume too);
  13. finger-cut walls with a filler within 8 mm against them (`sealed`): 10 000 each, under a
      printed part, a preference only. An upper tray with slack beside it also stands at the end
      of its axis that keeps the filler off a cut (derived in `placeStack`, not searched or stored).
      Both: minimal-trays spec §6.4.
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
- **Play:** lateral play above `playLimit` (1.5 mm by default) on an axis → warning. Play is
  `2 × box clearance + (trays in the row − 1) × tray gap`, times Fit. The
  message names the axis the way the Summary readouts do (left–right,
  front–back), says how many trays sit in that row (`LayoutSummary.crossX` /
  `crossY`), and names the controls: a tighter Fit, Box clearance (counts
  twice) and Tray gap (counts once per extra tray) under "Exact values", and
  fewer trays in the row. The limit is itself a setting, "Play limit" in the same
  place: the message names it as `(Play limit: 1.5 mm)` and ends "Or raise Play
  limit there." It is kept no longer than the message was while the limit was fixed
  (about 300 characters; a test holds it). The Summary's slack readouts turn to
  their warn state, and its hint quotes the limit, from `LayoutSummary.playLimit`,
  the value the layout was made under. There is still no way to dismiss the warning
  other than clearing it or raising the limit.
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
export opens as a modal dialog over the view that is showing (§8.3), never as a view of its own. The
Project menu closes on an outside click, on Escape and on choosing a project.

### 8.2 Inputs

Numbers accept a decimal comma or point.

- **Box:** inner width (X, left → right from the front) × length (Y, front → back) × height
  (floor to the rim of the bottom part). "Depth" was dropped for the front-to-back size, as it
  reads as vertical in a box; the schema fields stay `innerWidth`, `innerDepth`, `innerHeight`.
  The same word is used where a footprint is asked for beside a height: a custom block, a bulk
  item, a minis figure, a tile (`Length`), the validation messages and the "short by" warning
  ("mm in length (Y)"). Left as they are: a minis pocket's and a wall cutout's depth (vertical),
  the slack readouts and the shortfall line ("front–back", "left–right": directions, not names of
  a size), and the printer's bed X, Y and Z (axes). Hint: measure at the narrowest point.
  Headroom: boards and rulebooks stacked, plus 1 mm for warp. Coverage,
  stored-on-side.
- **Printer:** bed preset or custom X × Y × Z; advanced: bed margin, layer
  height.
- **Components:** add cards / bits / tiles / minis / custom. Simple fields:
  type, size preset, count, access. Advanced: overrides from §5. Each of cards, tiles, minis
  and bulk lists the sizes derived from its presets under the fields (§5 "Derived sizes");
  cards also have "Correct the estimated thickness", beside "Measure a stack of cards".
- **Changed settings** (advanced "Exact values" panel). A field whose value differs
  from `DEFAULT_SETTINGS` carries a quiet note under its hint, in the `.hint` style with a
  neutral (not the warning's ochre) mark at the side: "Changed from the default, 3 mm."
  and a "Restore" button that puts back that one value and keeps the keyboard on the
  field. The collapsed panel shows "N changed" (the `.pf-count` chip) so a user knows to
  look. Inside, "Restore all exact values" appears only while something differs, and
  asks first ("Put N values back to their defaults? Your own numbers are lost." with
  Restore and Keep my values), so one stray click discards nothing. It covers the panel's
  numbers only (they include Walls and Fit, which the simple choices write); the checkboxes
  and "Unused space" outside the panel, and the "Thicker walls instead of a filler" field
  beside them, are not marked or restored. Presentation over `DEFAULT_SETTINGS`: no
  schema change.

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
- **Print-time estimate** (advanced mode, beside the filament figures: "Print time"
  for the whole set, and "Longest single part", for planning an overnight plate; no
  per-part list). It is the estimate's plastic volume (at `infill`, over the parts
  that print) divided by one nominal flow, `PRINT_FLOW_MM3_PER_S` = 4 mm³/s, kept with
  the other printing constants in `summarize.ts` and not a setting: the estimate is
  too rough for a knob to mean anything. 4 mm³/s is a 0.45 × 0.2 mm line at 60 mm/s
  (5.4 mm³/s) slowed for perimeters and top layers; about 18 g of PLA an hour. Travel,
  acceleration, cooling and layer-time slowdowns are not modelled, so a real print
  usually takes longer, small parts a good deal longer. The hint says so beside the
  number, as it does for the filament. Shown to the half hour (to 5 minutes under an
  hour). `LayoutSummary.printMinutes` and `longestPartMinutes`. On the fixtures at
  15 % infill: cards-heavy about 35 h in all (longest part 6 h), bits-heavy about 24.5 h
  (4 h).
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
  dimensions. Exploding lifts upper levels and moves each part away from the box centre in
  proportion to its distance from it; a bottom-level part centred on the box (a merged filler
  wrapping the trays) would not move at all, so it drops by up to 40 mm instead, fading out as its
  own spread grows to 10 mm (geometry, not `merged`, decides). An optional axis indicator ("Show axes", off by default, beside the explode slider)
  draws labelled X (red), Y (green) and Z (blue) arrows in the canvas' bottom-left corner. It turns
  with the camera, so it says which way is up and which side is the front of the box (X runs
  across the box, Y from its front to its back, Z up) at any angle. It is an SVG laid over the
  canvas, not part of the WebGL scene, with `pointer-events: none`: its text takes the page's
  colours, and clicks and drags through it still pick trays and turn the camera. The scene reports the
  camera's orientation (`SceneHandle.onView`) only while the indicator is on.
- **Part numbers on the parts:** with `engraveNumbers` on, the 3D view and every export (3MF, STL) build each part with its number engraved (§6.1), the number the Plan, the packing steps and the parts table give it; the setting sits with the merge switches (advanced), on by default.
- **Export:** "Export all N parts" opens a modal dialog over the current view (Plan or 3D), not a
  view of its own, so closing it (the Close button or Escape) leaves the view, its tab, the
  selection and the scroll exactly as they were. It is a native `<dialog>` opened with
  `showModal()` (`ui/Modal.tsx`), so the browser keeps the focus inside it, makes the page behind it
  inert to the mouse, the keyboard and assistive technology, and puts it above everything. The focus
  starts on its heading and goes back to the "Export all N parts" button on close. Closing the
  dialog stops a running export, as leaving the old export view did, and says so in a hint while one
  runs; a layout change or another project closes it too. "Open the assembly page" is inside it and
  closes it; coming back from the assembly page puts the focus on the Export button.
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
- **Assembly page:** the packing order (bottom first), an exploded picture of all the parts, a
  numbered SVG per layer and a "what goes where" list. Printable via the browser (PDF), PNG
  download per layer and for the exploded picture.
  - **Exploded picture** (`instructions/exploded.ts`): every part as a block, arranged by the 3D
    view's own `trayPosition` at full explode (a spacer or divider travels with its tray, a merged
    part moves as one; a part centred on the box, such as a merged filler wrapping the trays, has
    no spread to move by, so at level 0 it drops by one level's step instead of staying among them), seen from the front, 35° to the right and 30° above. It is projected to SVG
    rather than rendered: the page is made to be printed, and an SVG is vector at any print size,
    a few kilobytes, prints (a WebGL canvas may not) and needs no renderer, so it works without
    WebGL. A part is therefore a block, not its mesh: the pockets of the real, open trays are not
    drawn, which the page says. Blocks are painted back to front (apart blocks by which is nearer,
    a spacer after the tray it goes into). Each part carries its number from `numberParts` on the
    first face nothing later covers, so the picture, the packing steps and the table agree, and the
    image's text alternative lists the parts in that assembly order. The box floor is dashed and the
    front is labelled.

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
    printed (`separators`, default 1 then, 0 since geometry 0.7.2) bumps the schema but not the geometry version.
    Schema 0.1.9 is another of those: `mergeFillers` (default on) and `mergeRisers` (default off)
    only change how stored parts are grouped for printing (§6.2). The defaults are left out of what
    is written, and neither is in the inputs hash, so no file, link or stored plan is affected, and
    geometry stays 0.5.2: no outer size, lip, inset or well changes, and every part, merged or not,
    is built from the same member parts. The filler count term of §7.2 changes which layouts a run
    finds, not what a stored one means, so it needs no version either.
    Schema 0.1.11 adds the setting `playLimit` (default 1.5, the old constant). It is in the
    inputs hash, since it moves the score, but left out of it at 1.5: a plan made before the
    setting existed was made at 1.5, so it stays current. Geometry stays 0.5.2: no stored spec
    builds differently, though a layout optimized under another limit may differ.
    Schema 0.1.10 adds `thickness.scale` to a preset card thickness (§5), left out at 1, so
    nothing written before it changes. It is in the inputs hash with its component. Geometry
    stays 0.5.2: every stored spec builds as before. The new compartment text (§5 "Labels")
    only changes the words of newly sized layouts.
    It is in the inputs hash all the same, from the time when above 1 it decided whether a
    stretched deck got a spacer or a spare pocket (§6.2); since geometry 0.5.1 it no longer
    shapes the layout, and is left in the hash only so that no plan using it goes stale.
    Schema 0.1.12 adds `growth` and retires `stretch` (reader accepts it, writer never writes it).
    It is in the inputs hash with its component; a project that had `stretch: true` hashes as one
    with nothing set, so its plan is stale once. Unlike the changes above it also changes what a
    project with nothing set lays out as (bins and upright stacks now grow by `auto`, not without
    limit or not at all), so geometry goes 0.5.2 to 0.6.0, a MINOR, as 0.4.0 and 0.5.0 did: outer
    tray sizes change and trays printed before and after would not mate. `planTray` is unchanged
    and a stored 0.5.x layout still builds; it is flagged as an older line.
    Schema 0.1.12 also stores a layout without a part's `lip` of false and `level` and `z` of 0, a
    leftover's `leftover:<n>` key, and a spacer's key, stack and level when they are its tray's (all
    put back on reading; minimal-trays spec §5.1), about 40 to 60 characters off a share link.
    Schema 0.1.13 adds `dividers` and the `dividerSlot` feature (minimal-trays spec §5.2). Unlike
    `separators` the count changes the tray itself, a slot cut into its floor and a floor thicker by
    the slot's depth (`floorExtra`, up to 2 mm taller), so it is in the inputs hash and geometry goes
    0.6.0 to 0.7.0, a MINOR: trays printed before and after would not mate. A project that sets
    nothing is laid out as it was, and hashes as it did. The dividers themselves are derived at
    print time from the stored slots (`splitDividers`), never stored, so a share link carries the
    slots and nothing for the parts.
    Schema 0.1.14 adds `engraveNumbers` (default on, left out of what is written while on, not in
    the inputs hash). Geometry goes 0.7.0 to 0.7.1, a PATCH: the engraving only removes material
    inside a wall face (§6.1 "Part numbers"), so no outer size, lip, inset, well or cut changes,
    parts printed before and after still mate, and a spec without `partNumber` builds as before.
    A stored 0.7.0 layout is current; its parts are simply printed with numbers.
    Geometry 0.7.2 (schema stays 0.1.14) prints no spacer unless `separators` is set, and holds an
    unplated stack's growth to what keeps it under its finger cut (minimal-trays spec §5.3). A
    PATCH: `planTray` is unchanged and no outer size, lip, inset or cut of a tray changes, so parts
    printed before and after mate; no file the app writes changes (a `separators` of 0 is read, never
    written) and the inputs hash is the same, so no plan goes stale. A stored 0.7.1 layout is
    current, with the spacers it stored, until it is run again.
    Schema 0.1.15 adds `oneWall` (default off, left out of what is written while off, in the inputs
    hash only while on, so no existing plan goes stale). Geometry stays 0.7.2: `planTray` and every
    outer size, lip, inset, well and cut of a tray realized at the same size are unchanged; the
    setting only changes which sizes the layout chooses, as `wallAbsorb` always did (§6.3 of the
    minimal-trays spec).
    Neither the schema (0.1.15) nor the geometry (0.7.2) changes for stack order and sealed cuts
    (§6.4 of the minimal-trays spec): no field is new, `planTray` and every size of a tray realized
    at the same size are unchanged, and only the order and sizes the layout chooses, and the
    position of an upper tray within its level, differ.
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
  - **A release bumps it.** Each deployment bumps `package.json`'s `version`, as nothing else
    does it: the schema and geometry versions above change for their own reasons (a file format
    or geometry change) and not on a release, so they say nothing about which build is deployed. A
    schema or geometry change that ships also calls for an app bump (e.g. a geometry MINOR on the
    0.x line is a MINOR of the app). The footer also shows the short git commit SHA of the build
    (`__BUILD_ID__`, `unknown` without git) so a deployment can be identified even if the bump was
    missed; it is for display and is never written to `createdWith` or hashed.
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
