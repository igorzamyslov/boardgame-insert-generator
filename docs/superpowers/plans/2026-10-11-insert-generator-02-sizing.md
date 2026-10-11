# Plan 2 — Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `src/sizing/`: turn components (and groups) into `TrayRequirement`s with up to 8 size variants, compute each tray part's minimum outer size, and realize a part at any outer size into positioned compartments, features and card spacers.

**Architecture:** One file per responsibility. Per-kind modules (`cards`, `bulk`, `tiles`, `minis`, `custom`) turn a component into _storage options_ (ordered compartment requirements, grouped into blocks that a split never separates). `variants.ts` multiplies options by arrangement (strip / rows2), splits (1–3 trays) and per-player mode, sorts them by a documented rank and keeps the first 8. `group.ts` implements `size()`. `outer.ts` (`minOuter`) and `realize.ts` (`realizeTray`) do their arithmetic in integer 0.01 mm units so rounding is exact and deterministic.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, fast-check. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md` (§5, §6, §7.1, §7.2 Fill) and the roadmap `docs/superpowers/plans/2026-10-11-insert-generator-00-roadmap.md` (§4.2 contract is binding).

## Global Constraints

- App lives in `apps/insert-generator/`. Built app: `package.json`, `npm run build` outputs `dist/`, `vite.config.ts` sets `base: "./"`, `app.json` has `{ title, description }`.
- Node 22 (`.nvmrc`). Dependency versions (exact ranges): `vite ^6.4.0`, `vitest ^5.0.3`, `typescript ^6.0.3`, `preact ^10.29.8`, `@preact/signals ^2.11.3`, `@preact/preset-vite ^2.10.6`, `manifold-3d ^3.5.4` (single-threaded build only), `three ^0.186.1`, `@types/three ^0.186.0`, `fflate ^0.8.3`, `fast-check ^4.10.2`, `jsdom ^30.1.2`, `@testing-library/preact ^3.2.4`, `rollup-plugin-license ^3.7.1`, `@types/node ^22.0.0` (type-only, for `tsconfig.node.json`). No copyleft dependencies.
- TypeScript strictness from `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` → use `import type`). App `tsconfig.json` (covers `src/`, no Node types): `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`. `tsconfig.node.json` covers the Node-side config files (`vite.config.ts`, later `licenses.config.ts`) with `"types": ["node"]`.
- Lint: root `eslint.config.mjs` (non-type-checked `strict` + `stylistic`, `curly: all`, `eqeqeq`, `prefer-template`, `no-param-reassign`, `no-console` except warn/error). Prettier: `printWidth` 100 from `.prettierrc.json`. Stylelint for CSS. html-validate for `index.html`.
- The app's `build` script: `vitest run && tsc --noEmit && tsc --noEmit -p tsconfig.node.json && vite build` (plan 5 appends `&& node scripts/smoke-dist.mjs dist`); `npm run typecheck` runs both `tsc` checks. Tests run in CI via `npm run build:all`.
- `Math.random` is banned in `apps/insert-generator/src/layout/**` (root ESLint rule, plan 1). Sizing does not use it either.
- All lengths are millimetres. Inside `layout/`, lengths are integer 0.01 mm units; `TraySpec` stores mm rounded to 0.01.
- Versions start at app `0.1.0`, `SCHEMA_VERSION = "0.1.0"`, `GEOMETRY_VERSION = "0.1.0"`. Pre-1.0 makes no compatibility promise.
- Never use `localStorage` without `try/catch`. No network calls at runtime.
- Commits: plain imperative messages (e.g. `Add card sizing`). **No `Co-Authored-By` or any trailer.** Commit after every task.
- Run tests from the app folder: `cd apps/insert-generator && npx vitest run <path>`. Run repo checks from the root: `npm run lint`, `npm run format:check`, `npm run verify`.
- No non-null assertions (`!`), no `Array<T>` (use `T[]`), interfaces over object type aliases, `findLastIndex` is not available (lib ES2022).

## Review Focus

1. Sleeved Tarot cards (73 × 123 mm sleeved) stand ~76 mm tall, above a typical top plane: with `storage: "auto"` a flat variant must exist and be low (80 cards → tray h 36.81). Tests: Task 2 ("sleeved Tarot…"), Task 10 ("gives sleeved Tarot cards a low flat tray…").
2. A deck of 1 card (1.33 mm well): the tray must still get a full 22 mm finger pocket that never cuts an outer wall (inner span widened to the pocket width; spare length becomes a spacer). Tests: Task 2 ("a deck of one card…"), Task 10 ("widens the inner span…"), Task 11 ("gives a one-card deck…").
3. Measured stack with `stackMm` < `cards × 0.1` (e.g. entered in cm): warning notice and the preset thickness is used instead of a paper-thin well. Test: Task 2 ("falls back to the preset…").
4. Hex tiles with pointy orientation: X = flat-to-flat, Y = corner-to-corner (swapped against `flat`). Test: Task 4 ("swaps the footprint axes for pointy hexes").
5. Bulk line with count 2000 of tiny cubes: finite, volume-preserving shallow and deep shapes, realizable at minOuter. Tests: Task 3 ("handles 2000 tiny cubes"), Task 11 ("realizes 2000 tiny cubes").

---

## Design decisions (read before Task 1)

These are interpretations of the spec/roadmap that every task relies on. None changes a §4 type or signature.

**Tray-local frame.** A part's compartments run left → right along X (`w`) in a _strip_; `rows2` has row 0 at the front (low Y) and row 1 behind it. Row 0 holds the first `ceil(n/2)` compartments of `part.compartments`.

**Card / tile orientation in a compartment.** Upright: the stack runs along X (`minW` = stack width, `spacerAxis: "w"`), the card/tile length along Y, height = vertical. Flat cards: short side along X, long side along Y. So card edges touch the front/back walls in every storage, and all card/tile finger pockets are on `front` and `back`.

**Finger reach (roadmap §4.6).** `CompartmentReq.minW/minD` include `fingerPocket.reach` once per pocket side (contract). `CompartmentSpec.{x,y,w,d}` is the full compartment rectangle: the well proper (content + clearance) **plus a solid band `reach` deep along each pocket side**. The geometry leaves that band solid and cuts the U-slot into it. Internally `realizeTray` still derives the well proper (rectangle minus bands) for content depth, spacer placement and pocket centring. Compartment rectangles never touch each other (≥ divider ≥ 0.8 mm apart) and stay at least the outer wall (lipped wall when lipped) from every outer face; `0 < floorZ < h`.

**Finger-pocket `at` (roadmap §4.6).** `FeatureSpec.at` = slot centre along its side, tray-local mm (X for front/back, Y for left/right). It is the centre of the compartment's content (the well minus any spacer), shifted inward (clamped) so the slot's `width` never enters an outer wall — this is what moves the pocket of a narrow deck at a strip end. The slot may cross dividers. `width = min(fingerPocket.width, inner span)`. The finger slot clearance rule (roadmap §4.6, §4.7: channels, well faces, the half ridges a face leaves) may shift or narrow it further (never below `min(MIN_SLOT_WIDTH, width)`) and merge neighbouring slots into one channel (`slots.ts`); if a slot cannot keep that width, `realizeTray` throws `RangeError`. `minOuter` widens the inner span to at least `fingerPocket.width` along any side that carries a pocket, so the pocket is always full width (review focus 2). Pocket `depth` = fraction × (tray h − compartment floorZ).

**Clearance override.** `component.clearance` is an absolute total, not scaled by Fit, and replaces only the _main_ clearance: `cardClearance` for cards (card length/width and the upright height or flat width), `pieceClearance` for tiles, minis, custom and bulk. `cardStackClearance` and `cardStackClearancePct` are never overridden; both are ×Fit (spec §5 table).

**topPlane is unknown to sizing.** `size(components, settings)` has no box, so sizing never decides "too tall". It emits variants instead (all storages under `auto`, tile column counts, minis lying) and the layout picks a feasible one. Tile column counts: `{1, ceil(total/50), ceil(total/25)}` (deduped, clamped to 1…count), `total = count × thickness`. No contract change.

**Variant rank (fixed, deterministic).** Each candidate is a tuple `(s, m, a, k)`: storage option index `s` (preference order), player mode `m` (0 = no perPlayer or "separate", 1 = "combined"), arrangement `a` (0 strip, 1 rows2), split index `k` (0, 1, 2 → 1, 2, 3 trays; "separate" uses k = 0 only). Candidates are sorted ascending by `(m + a + k, s, m, a, k)`. Invalid candidates are skipped (rows2 needs ≥ 2 compartments in every part; a split into k trays needs ≥ k blocks). Duplicates (same arrangements and compartments in every part, tray keys ignored) keep the earlier one. The first 8 survive. Variant id: `<optionId>|<strip|rows2>|split<k+1>` plus `|separate` / `|combined` with perPlayer. Group option ids join the members' option ids with `+`.

**Groups.** Group storage option `s` uses each member's option `min(s, len − 1)`; compartments are concatenated in component order. `perPlayer` inside a group is a validation error (`field.perPlayerInGroup` from `validateComponent`), so sizing never sizes such a component: like any invalid component it has no options and is left out without a sizing notice. A group therefore never has perPlayer, and an ungrouped perPlayer component is alone in its requirement.

**Splits.** Blocks: one per deck (cards), column/stack (tiles), item line (bulk), figure line (minis, pockets or bulk), item (custom). Splits are contiguous; block weight = Σ `minW × minD`; minimise the heaviest part, ties → the smaller sum of squared part weights (the more even split), then the smaller cut indices.

**rows2 order.** Greedy by `minW`, largest first (ties by index): each compartment goes to the row with the smaller running width unless that row is full (row 0 capacity `ceil(n/2)`, row 1 `floor(n/2)`). Inside a row, original order is kept. Output: row 0 then row 1.

**Slack in `realizeTray` (per axis).**

- Y: rows with an elastic-`d` compartment (bulk) share the slack → walls and the inter-row divider thicken inward up to `min(2 × setting, 4)` → a spare row at the back (if ≥ 10 mm + divider) → the rest is split onto the front/back walls.
- X, per row: elastic-`w` compartments without `spacerAxis` (bulk) share the slack. Otherwise, upright card/tile stack length is elastic (spec §7.1): the whole slack goes to the last `spacerAxis: "w"` compartment of the row **as a spacer** when the spacer is buildable (slack ≥ max(5 mm, 2·(bottomChamfer + 0.8)), well depth ≥ 2·(bottomChamfer + 0.8), content depth − 5 ≥ max(5 mm, bottomChamfer + 0.8)), at most one spacer per tray (key `<trayKey>:spacer`). If no spacer is made, the slack goes to thicker dividers/walls (cap) → a spare compartment at the row end (≥ 10 mm + divider; it starts 0.8 mm past any finger slot it would come near and is dropped below 10 mm, roadmap §4.7) → the rest onto the two side walls.
- Non-elastic compartments keep their min size; in a deeper row they are centred in Y.
- Height: non-elastic compartments get a solid raised floor so their top is at the rim (`floorZ = h − minH`). Bulk grows deeper, but `depth ≤ maxHRatio × min(w, d)` (floor raised above that).

**Rotation.** `realizeTray` works in the part's own (unrotated) frame. For a rotated placement the layout calls `realizeTray(part, { w: placed.d, d: placed.w, h }, …)` and then `rotateRealized(result, thatOuter)` (new export, Task 12): 90° counter-clockwise about +Z, `(x, y, w, d) → (outer.d − y − d, x, d, w)`, sides front→right→back→left→front, spacers get `rotated: true`.

**Compartment order in `RealizedTray`.** `compartments[i]` corresponds to `part.compartments[i]`; spare compartments follow (row spares in row order, then the spare row).

**Other values.** `RealizedTray.wall` = base wall `max(settings.wall, 0.8)`, rounded up to 0.01 mm. `lipped` is honoured only when `settings.lip.enabled`. Walls, dividers and floors are never below 0.8 mm. Upper trays (`level > 0`, lip enabled) get `h ≥ lip.height + 3`. Every tray is at least `2·(c + 0.8)` wide and deep and `c + 0.8` tall for its bottom chamfer `c` (`bottomChamfer`, at least 0.5 above level 0; roadmap §4.6).

## File structure

All under `apps/insert-generator/src/sizing/`:

| File               | Responsibility                                               |
| ------------------ | ------------------------------------------------------------ |
| `types.ts`         | Roadmap §4.2 contract types                                  |
| `constants.ts`     | Named sizing constants                                       |
| `units.ts`         | 0.01 mm unit helpers, even split, capped fill                |
| `test-helpers.ts`  | Test-only component builders, `at()`, `partOf()`             |
| `common.ts`        | `StorageOption`, clearance, `compartment()` builder, notices |
| `cards.ts`         | Card math (§7.1 table), sleeves, measured thickness          |
| `bulk.ts`          | Bulk volume and shallow/deep shapes                          |
| `tiles.ts`         | Rect/hex tiles, flat columns, upright stacks                 |
| `minis.ts`         | Minis pockets (standing/lying) and bulk                      |
| `custom.ts`        | Custom wells                                                 |
| `component.ts`     | Kind dispatch, `isLoose`                                     |
| `arrange.ts`       | rows2 order, contiguous splits                               |
| `variants.ts`      | Variant enumeration, rank, dedupe, cap                       |
| `group.ts`         | `size()`                                                     |
| `outer.ts`         | `wallFor`, `rowsOf`, `minLayoutU`, `minOuter`                |
| `realize.ts`       | `realizeTray`                                                |
| `rotate.ts`        | `rotateRealized`                                             |
| `grip.ts`          | `hasGrip` (spec §3 rule 8)                                   |
| `index.ts`         | Public exports                                               |
| `property.test.ts` | fast-check properties                                        |

---

### Task 1: Sizing types, constants and unit helpers

**Files:**

- Create: `apps/insert-generator/src/sizing/types.ts`
- Create: `apps/insert-generator/src/sizing/constants.ts`
- Create: `apps/insert-generator/src/sizing/units.ts`
- Create: `apps/insert-generator/src/sizing/test-helpers.ts`
- Test: `apps/insert-generator/src/sizing/units.test.ts`
- Test: `apps/insert-generator/src/sizing/contract.test.ts`

**Interfaces:**

- Consumes (plan 1): `DEFAULT_SETTINGS: Settings`, `effective(s: Settings): Effective` from `../model/settings`; `SLEEVES` from `../model/presets`; types `Access, Side, CompartmentSpec, TraySpec, CardsComponent, BulkComponent, TilesComponent, MinisComponent, CustomComponent` from `../model/types`.
- Produces:
  - All roadmap §4.2 types in `types.ts`: `FeatureReq, CompartmentReq, TrayPartReq, TrayVariant, TrayRequirement, OuterSize, RealizeOptions, RealizedTray`.
  - `constants.ts`: `MIN_FEATURE = 0.8`, `MIN_GRIP = 25`, `BULK_MIN_SIDE = 25`, `MAX_H_RATIO = 1.5`, `SHALLOW_H = 20`, `MIN_SPARE = 10`, `MIN_SPACER = 5`, `SPACER_TOP_GAP = 5`, `CORNER_RELIEF_D = 3`, `MAX_VARIANTS = 8`, `MAX_SPLITS = 3`, `MIN_MEASURED_CARD_T = 0.1`, `TILE_STACK_TARGETS: readonly number[] = [50, 25]`, `UPPER_TRAY_MIN_ABOVE_LIP = 3`, `WALL_GROW_LIMIT = 4`.
  - `units.ts`: `toU(mm: number): number`, `ceilU(mm: number): number`, `fromU(u: number): number`, `round2(mm: number): number`, `sum(values: readonly number[]): number`, `maxOf(values: readonly number[]): number`, `splitEven(total: number, n: number): number[]`, `fillCapped(total: number, caps: readonly number[]): number[]`.
  - `test-helpers.ts`: `at<T>(items: readonly T[], index: number): T`, builders `cards(over?)`, `bulk(over?)`, `tiles(over?)`, `minis(over?)`, `custom(over?)` returning the concrete component types.

- [ ] **Step 1: Write the failing tests**

`apps/insert-generator/src/sizing/units.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ceilU, fillCapped, fromU, maxOf, round2, splitEven, sum, toU } from "./units";

describe("units", () => {
  it("converts mm to whole 0.01 mm units and back", () => {
    expect(toU(63.5)).toBe(6350);
    expect(toU(1.6)).toBe(160);
    expect(toU(119.18)).toBe(11918);
    expect(fromU(2350)).toBe(23.5);
  });

  it("rounds minimums up, ignoring float noise", () => {
    expect(ceilU(23.4952)).toBe(2350);
    expect(ceilU(64.5)).toBe(6450);
    expect(ceilU(0.001)).toBe(1);
    expect(ceilU(0.42 * 100)).toBe(4200);
  });

  it("rounds to 0.01 mm", () => {
    expect(round2(13.599999999999994)).toBe(13.6);
    expect(round2(56.7 - 43.35)).toBe(13.35);
  });

  it("sums and takes the maximum (0 for an empty list)", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([])).toBe(0);
    expect(maxOf([4, 9, 2])).toBe(9);
    expect(maxOf([])).toBe(0);
  });

  it("splits evenly with the remainder going to the first entries", () => {
    expect(splitEven(7, 3)).toEqual([3, 2, 2]);
    expect(splitEven(0, 2)).toEqual([0, 0]);
    expect(splitEven(5, 0)).toEqual([]);
  });

  it("fills up to per-entry caps, evenly", () => {
    expect(fillCapped(10, [3, 0, 3])).toEqual([3, 0, 3]);
    expect(fillCapped(5, [3, 0, 3])).toEqual([3, 0, 2]);
    expect(fillCapped(4, [1, 10])).toEqual([1, 3]);
    expect(fillCapped(0, [5, 5])).toEqual([0, 0]);
  });
});
```

`apps/insert-generator/src/sizing/contract.test.ts` (pins the plan 1 values this plan's worked examples rely on; it passes as soon as plan 1 is in place):

```ts
import { describe, expect, it } from "vitest";
import { SLEEVES } from "../model/presets";
import { DEFAULT_SETTINGS, effective } from "../model/settings";

describe("plan 1 values that sizing relies on", () => {
  it("uses the spec §5 defaults, with cardStackClearancePct as a fraction", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      wall: 1.6,
      floor: 1.2,
      divider: 1.2,
      fit: 1,
      cardClearance: 1.5,
      cardStackClearance: 1,
      cardStackClearancePct: 0.03,
      cardThickness: 0.32,
      pieceClearance: 1,
      scoopRadius: 12,
      fingerPocket: { width: 22, reach: 12 },
      lip: { enabled: true, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 },
      packingFactor: 0.5,
    });
  });

  it("has the sleeve table", () => {
    expect(SLEEVES).toMatchObject({
      none: { addThickness: 0, addSize: 0 },
      standard: { addThickness: 0.1, addSize: 3 },
      premium: { addThickness: 0.28, addSize: 3 },
    });
  });

  it("scales clearances by fit", () => {
    const e = effective({ ...DEFAULT_SETTINGS, fit: 1.4 });
    expect(e.cardClearance).toBeCloseTo(2.1, 9);
    expect(e.cardStackClearance).toBeCloseTo(1.4, 9);
    expect(e.pieceClearance).toBeCloseTo(1.4, 9);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/insert-generator`): `npx vitest run src/sizing/units.test.ts src/sizing/contract.test.ts`
Expected: `units.test.ts` FAILS with "Failed to resolve import "./units"". `contract.test.ts` PASSES (if it fails, plan 1 deviates from the roadmap: stop and reconcile before continuing — every worked example below assumes these values).

- [ ] **Step 3: Write the implementation**

`apps/insert-generator/src/sizing/types.ts`:

```ts
// Cross-plan contract: roadmap §4.2. Do not rename or change these types.
// (The roadmap's import line also names `Settings`; it is unused here and would
// fail `noUnusedLocals`, so it is left out.)
import type { Access, CompartmentSpec, Side, TraySpec } from "../model/types";

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

`apps/insert-generator/src/sizing/constants.ts`:

```ts
/** Minimum printable feature width: 2 lines of 0.4 mm (spec §6.1). */
export const MIN_FEATURE = 0.8;
/** A compartment whose smaller inner side is at least this is a grip (spec §3 rule 8). */
export const MIN_GRIP = 25;
/** Bulk compartments: minimum width and depth (spec §7.1). */
export const BULK_MIN_SIDE = 25;
/** Bulk compartments: content depth ≤ MAX_H_RATIO × min(w, d) (spec §7.1). */
export const MAX_H_RATIO = 1.5;
/** Bulk "wide-and-shallow" content depth, and the lower bound of the "deep" shape. */
export const SHALLOW_H = 20;
/** Smallest extra empty ("spare") compartment realizeTray adds, inner mm. */
export const MIN_SPARE = 10;
/** Card spacer: minimum spare stack length and minimum spacer height (spec §6.2). */
export const MIN_SPACER = 5;
/** Card spacer: this much lower than the well (spec §6.2: well height − 5). */
export const SPACER_TOP_GAP = 5;
/** Corner relief diameter in tile and custom wells (spec §6.1). */
export const CORNER_RELIEF_D = 3;
/** At most this many variants per requirement (spec §7.1). */
export const MAX_VARIANTS = 8;
/** Splits across at most this many trays (spec §7.1). */
export const MAX_SPLITS = 3;
/** A measured card thickness below this (mm per card) is implausible; the preset is used. */
export const MIN_MEASURED_CARD_T = 0.1;
/** Tile column / stack variants: target stack heights in mm (1 column is always offered). */
export const TILE_STACK_TARGETS: readonly number[] = [50, 25];
/** Upper trays must be at least lip.height + this tall (spec §6.1). */
export const UPPER_TRAY_MIN_ABOVE_LIP = 3;
/** Walls and dividers thicken inward up to min(2 × setting, this) (spec §7.2 Fill). */
export const WALL_GROW_LIMIT = 4;
```

`apps/insert-generator/src/sizing/units.ts`:

```ts
// Sizing does its layout arithmetic in integer 0.01 mm units ("u") so that
// rounding is exact and deterministic. Public results are converted back to mm.

export function toU(mm: number): number {
  return Math.round(mm * 100);
}

/** Smallest whole unit count ≥ mm (1e-6 u tolerance for float noise). Used for minimums. */
export function ceilU(mm: number): number {
  return Math.ceil(mm * 100 - 1e-6);
}

export function fromU(u: number): number {
  return u / 100;
}

export function round2(mm: number): number {
  return Math.round(mm * 100) / 100;
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total;
}

/** Largest value; 0 for an empty list (all inputs are lengths ≥ 0). */
export function maxOf(values: readonly number[]): number {
  let best = 0;
  for (const v of values) {
    if (v > best) {
      best = v;
    }
  }
  return best;
}

/** Splits an integer total into n integer shares; the first (total mod n) get one more. */
export function splitEven(total: number, n: number): number[] {
  if (n <= 0) {
    return [];
  }
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Water-fills an integer total into entries capped by `caps`; returns the allocation. */
export function fillCapped(total: number, caps: readonly number[]): number[] {
  const alloc = caps.map(() => 0);
  const room = (i: number): number => (caps[i] ?? 0) - (alloc[i] ?? 0);
  const openIndices = (): number[] => caps.flatMap((_, i) => (room(i) > 0 ? [i] : []));
  let remaining = total;
  let open = openIndices();
  while (remaining > 0 && open.length > 0) {
    const share = Math.floor(remaining / open.length);
    if (share === 0) {
      for (const i of open.slice(0, remaining)) {
        alloc[i] = (alloc[i] ?? 0) + 1;
      }
      return alloc;
    }
    for (const i of open) {
      const given = Math.min(share, room(i));
      alloc[i] = (alloc[i] ?? 0) + given;
      remaining -= given;
    }
    open = openIndices();
  }
  return alloc;
}
```

`apps/insert-generator/src/sizing/test-helpers.ts`:

```ts
// Test-only builders. Production code never imports this file.
import type {
  BulkComponent,
  CardsComponent,
  CustomComponent,
  MinisComponent,
  TilesComponent,
} from "../model/types";

/** Index access for tests under noUncheckedIndexedAccess: throws instead of returning undefined. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no element at index ${index} (length ${items.length})`);
  }
  return item;
}

export function cards(over: Partial<CardsComponent> = {}): CardsComponent {
  return {
    id: "c1",
    name: "Cards",
    access: "sometimes",
    kind: "cards",
    shortSide: 63.5,
    longSide: 88,
    decks: [{ name: "Main", count: 52 }],
    sleeve: "standard",
    thickness: { mode: "preset" },
    storage: "upright-long",
    ...over,
  };
}

export function bulk(over: Partial<BulkComponent> = {}): BulkComponent {
  return {
    id: "b1",
    name: "Bits",
    access: "sometimes",
    kind: "bulk",
    items: [{ name: "Cubes", count: 30, w: 10, d: 10, h: 10 }],
    ...over,
  };
}

export function tiles(over: Partial<TilesComponent> = {}): TilesComponent {
  return {
    id: "t1",
    name: "Hexes",
    access: "sometimes",
    kind: "tiles",
    shape: { type: "hex", flatToFlat: 40, orientation: "flat" },
    thickness: 2,
    count: 60,
    storage: "flat",
    ...over,
  };
}

export function minis(over: Partial<MinisComponent> = {}): MinisComponent {
  return {
    id: "m1",
    name: "Minis",
    access: "sometimes",
    kind: "minis",
    figures: [{ name: "Hero", w: 25, d: 25, h: 40, count: 2 }],
    storage: "pockets",
    ...over,
  };
}

export function custom(over: Partial<CustomComponent> = {}): CustomComponent {
  return {
    id: "x1",
    name: "Dial",
    access: "sometimes",
    kind: "custom",
    w: 40,
    d: 30,
    h: 10,
    count: 2,
    ...over,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sizing/units.test.ts src/sizing/contract.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/types.ts src/sizing/constants.ts src/sizing/units.ts src/sizing/test-helpers.ts src/sizing/units.test.ts src/sizing/contract.test.ts
git commit -m "Add sizing types, constants and unit helpers"
```

---

### Task 2: Shared compartment helpers and card sizing

**Files:**

- Create: `apps/insert-generator/src/sizing/common.ts`
- Create: `apps/insert-generator/src/sizing/cards.ts`
- Test: `apps/insert-generator/src/sizing/common.test.ts`
- Test: `apps/insert-generator/src/sizing/cards.test.ts`

**Interfaces:**

- Consumes: Task 1 types and `MIN_MEASURED_CARD_T`; plan 1 `effective`, `SLEEVES`, `DEFAULT_SETTINGS`.
- Produces (`common.ts`):
  - `interface StorageOption { id: string; blocks: CompartmentReq[][] }` — one way to store a component; each block is a group of compartments a split never separates.
  - `interface OptionsResult { options: StorageOption[]; notices: Notice[] }`
  - `displayName(c: Component): string`, `label(name: string, fallback: string): string`
  - `isPos(x: number): boolean`, `isCount(x: number): boolean`
  - `invalid(index: number, c: Component, field: string): Notice` (code `sizing.invalid`, level error, path `/components/<index>/<field>`)
  - `emptyNotice(index: number, c: Component, field: string): Notice` (code `sizing.empty`, level warning)
  - `mainClearance(c: Component, s: Settings): number`
  - `fingerPocket(side: Side, depthFraction: number, perItem: boolean): FeatureReq`
  - `cornerRelief(): FeatureReq`
  - `interface CompartmentInput { componentId; contents; kind; w; d; h; elastic?: Partial<CompartmentReq["elastic"]>; features: FeatureReq[]; spacerAxis?; minVolume?; maxHRatio? }`
  - `compartment(input: CompartmentInput, s: Settings): CompartmentReq` — adds `fingerPocket.reach` per pocket side.
- Produces (`cards.ts`):
  - `type CardStorage = "upright-long" | "upright-short" | "flat"`, `CARD_STORAGES: readonly CardStorage[]`
  - `interface CardDims { S: number; L: number; t: number }`
  - `cardDims(c: CardsComponent, s: Settings, index: number): { dims: CardDims; notices: Notice[] }`
  - `stackWidth(n: number, t: number, s: Settings): number`
  - `deckCompartment(c: CardsComponent, deck: { name: string; count: number }, storage: CardStorage, dims: CardDims, s: Settings): CompartmentReq`
  - `cardOptions(c: CardsComponent, s: Settings, index: number): OptionsResult` — option ids `upright-long`, `upright-short`, `flat`; one block per deck.

Worked numbers used below (defaults, Standard 63.5 × 88, standard sleeve, 52 cards): S = 66.5, L = 91, t = 0.42; stack = 52 · 0.42 · 1.03 + 1 = 23.4952. Upright-long: minW 23.4952, minD = 91 + 1.5 + 2 · 12 = 116.5, minH = 66.5 + 1.5 = 68.

- [ ] **Step 1: Write the failing tests**

`apps/insert-generator/src/sizing/common.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { compartment, cornerRelief, fingerPocket, label, mainClearance } from "./common";
import { cards, custom } from "./test-helpers";

const s = DEFAULT_SETTINGS;

describe("compartment", () => {
  it("adds one finger reach per pocket side to the matching axis", () => {
    const c = compartment(
      {
        componentId: "a",
        contents: "A",
        kind: "well",
        w: 10,
        d: 20,
        h: 5,
        features: [fingerPocket("front", 1, true), fingerPocket("left", 1, false), cornerRelief()],
      },
      s,
    );
    expect(c.minW).toBe(22);
    expect(c.minD).toBe(32);
    expect(c.minH).toBe(5);
    expect(c.elastic).toEqual({ w: false, d: false, h: false });
    expect("spacerAxis" in c).toBe(false);
    expect("minVolume" in c).toBe(false);
    expect("maxHRatio" in c).toBe(false);
  });

  it("keeps optional fields when given", () => {
    const c = compartment(
      {
        componentId: "a",
        contents: "A",
        kind: "scoop",
        w: 30,
        d: 30,
        h: 20,
        elastic: { w: true },
        features: [],
        spacerAxis: "w",
        minVolume: 100,
        maxHRatio: 1.5,
      },
      s,
    );
    expect(c.elastic).toEqual({ w: true, d: false, h: false });
    expect(c.spacerAxis).toBe("w");
    expect(c.minVolume).toBe(100);
    expect(c.maxHRatio).toBe(1.5);
  });
});

describe("mainClearance", () => {
  it("is cardClearance × fit for cards and pieceClearance × fit otherwise", () => {
    expect(mainClearance(cards(), { ...s, fit: 1.4 })).toBeCloseTo(2.1, 9);
    expect(mainClearance(custom(), { ...s, fit: 0.7 })).toBeCloseTo(0.7, 9);
  });

  it("uses the component override as an absolute total, not scaled by fit", () => {
    expect(mainClearance(cards({ clearance: 0.4 }), { ...s, fit: 1.4 })).toBe(0.4);
    expect(mainClearance(custom({ clearance: 0 }), { ...s, fit: 1.4 })).toBe(0);
  });
});

describe("label", () => {
  it("falls back when the name is blank", () => {
    expect(label("  ", "Cards")).toBe("Cards");
    expect(label("Main", "Cards")).toBe("Main");
  });
});
```

`apps/insert-generator/src/sizing/cards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { CardsComponent, Settings } from "../model/types";
import { cardDims, cardOptions, stackWidth } from "./cards";
import { at, cards } from "./test-helpers";
import type { CompartmentReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const pocket = (side: "front" | "back", depthFraction: number) => ({
  type: "fingerPocket",
  side,
  depthFraction,
  perItem: true,
});

function deck(component: CardsComponent, settings: Settings = s, option = 0): CompartmentReq {
  return at(at(at(cardOptions(component, settings, 0).options, option).blocks, 0), 0);
}

describe("cardDims", () => {
  it("adds the standard sleeve to both sides and to the thickness", () => {
    const { dims, notices } = cardDims(cards(), s, 0);
    expect(dims.S).toBeCloseTo(66.5, 9);
    expect(dims.L).toBeCloseTo(91, 9);
    expect(dims.t).toBeCloseTo(0.42, 9);
    expect(notices).toEqual([]);
  });

  it("handles no sleeve, premium and custom sleeves", () => {
    expect(cardDims(cards({ sleeve: "none" }), s, 0).dims).toEqual({ S: 63.5, L: 88, t: 0.32 });
    const premium = cardDims(cards({ sleeve: "premium" }), s, 0).dims;
    expect(premium.S).toBeCloseTo(66.5, 9);
    expect(premium.t).toBeCloseTo(0.6, 9);
    const own = cardDims(cards({ sleeve: { w: 95, h: 70, thickness: 0.2 } }), s, 0).dims;
    expect(own.S).toBe(70);
    expect(own.L).toBe(95);
    expect(own.t).toBeCloseTo(0.52, 9);
  });

  it("accepts the sides entered the other way round", () => {
    const { dims } = cardDims(cards({ shortSide: 88, longSide: 63.5 }), s, 0);
    expect(dims.S).toBeCloseTo(66.5, 9);
    expect(dims.L).toBeCloseTo(91, 9);
  });

  it("uses a measured stack for the thickness but keeps the sleeve size", () => {
    const { dims } = cardDims(
      cards({ thickness: { mode: "measured", cards: 100, stackMm: 45 } }),
      s,
      0,
    );
    expect(dims.t).toBeCloseTo(0.45, 9);
    expect(dims.S).toBeCloseTo(66.5, 9);
  });

  it("falls back to the preset when the measured stack is implausibly thin", () => {
    const { dims, notices } = cardDims(
      cards({ thickness: { mode: "measured", cards: 100, stackMm: 5 } }),
      s,
      3,
    );
    expect(dims.t).toBeCloseTo(0.42, 9);
    expect(notices).toHaveLength(1);
    expect(at(notices, 0)).toMatchObject({
      level: "warning",
      code: "sizing.measuredTooThin",
      path: "/components/3/thickness/stackMm",
    });
  });
});

describe("stackWidth", () => {
  it("is n·t·(1 + pct·fit) + cardStackClearance·fit", () => {
    expect(stackWidth(52, 0.42, s)).toBeCloseTo(23.4952, 9);
    // 21.84 · 1.042 + 1.4
    expect(stackWidth(52, 0.42, { ...s, fit: 1.4 })).toBeCloseTo(24.15728, 9);
  });
});

describe("cardOptions", () => {
  it("upright-long: stack along X, length + two reaches along Y, height from the short side", () => {
    const c = deck(cards());
    expect(c.minW).toBeCloseTo(23.4952, 9);
    expect(c.minD).toBeCloseTo(116.5, 9);
    expect(c.minH).toBeCloseTo(68, 9);
    expect(c.kind).toBe("well");
    expect(c.contents).toBe("Main ×52");
    expect(c.componentId).toBe("c1");
    expect(c.elastic).toEqual({ w: true, d: false, h: false });
    expect(c.spacerAxis).toBe("w");
    expect(c.features).toEqual([pocket("front", 1 / 3), pocket("back", 1 / 3)]);
  });

  it("upright-short: height from the long side, length from the short side", () => {
    const c = deck(cards({ storage: "upright-short" }));
    expect(c.minW).toBeCloseTo(23.4952, 9);
    expect(c.minD).toBeCloseTo(92, 9);
    expect(c.minH).toBeCloseTo(92.5, 9);
  });

  it("flat: the stack is the height, full-depth pockets on both short sides", () => {
    const c = deck(cards({ storage: "flat" }));
    expect(c.minW).toBeCloseTo(68, 9);
    expect(c.minD).toBeCloseTo(116.5, 9);
    expect(c.minH).toBeCloseTo(23.4952, 9);
    expect(c.elastic).toEqual({ w: false, d: false, h: false });
    expect(c.spacerAxis).toBeUndefined();
    expect(c.features).toEqual([pocket("front", 1), pocket("back", 1)]);
  });

  it("auto offers upright-long, upright-short and flat, one block per deck", () => {
    const { options } = cardOptions(
      cards({
        storage: "auto",
        decks: [
          { name: "A", count: 40 },
          { name: "", count: 12 },
        ],
      }),
      s,
      0,
    );
    expect(options.map((o) => o.id)).toEqual(["upright-long", "upright-short", "flat"]);
    for (const option of options) {
      expect(option.blocks.map((b) => b.map((c) => c.contents))).toEqual([
        ["A ×40"],
        ["Cards ×12"],
      ]);
    }
  });

  it("scales the clearances by fit", () => {
    const c = deck(cards(), { ...s, fit: 1.4 });
    expect(c.minD).toBeCloseTo(117.1, 9);
    expect(c.minH).toBeCloseTo(68.6, 9);
    expect(c.minW).toBeCloseTo(24.15728, 9);
  });

  it("a clearance override replaces cardClearance only and is not scaled", () => {
    const c = deck(cards({ clearance: 2 }), { ...s, fit: 1.4 });
    expect(c.minD).toBeCloseTo(117, 9);
    expect(c.minH).toBeCloseTo(68.5, 9);
    expect(c.minW).toBeCloseTo(24.15728, 9); // stack clearance still × fit
  });

  it("drives the stack width from a measured thickness", () => {
    const c = deck(cards({ thickness: { mode: "measured", cards: 100, stackMm: 45 } }));
    expect(c.minW).toBeCloseTo(25.102, 9);
  });

  it("a deck of one card is a 1.33 mm well", () => {
    const c = deck(cards({ sleeve: "none", decks: [{ name: "Solo", count: 1 }] }));
    expect(c.minW).toBeCloseTo(1.3296, 9);
    expect(c.minD).toBeCloseTo(113.5, 9);
    expect(c.minH).toBeCloseTo(65, 9);
  });

  it("sleeved Tarot cards also get a flat option that lies low", () => {
    const { options } = cardOptions(
      cards({
        shortSide: 70,
        longSide: 120,
        storage: "auto",
        decks: [{ name: "Tarot", count: 80 }],
      }),
      s,
      0,
    );
    const upright = at(at(at(options, 0).blocks, 0), 0);
    const flat = at(at(at(options, 2).blocks, 0), 0);
    expect(upright.minH).toBeCloseTo(74.5, 9);
    expect(flat.minH).toBeCloseTo(35.608, 9);
    expect(flat.minW).toBeCloseTo(74.5, 9);
    expect(flat.minD).toBeCloseTo(148.5, 9);
  });

  it("reports invalid input and stores nothing", () => {
    const empty = cardOptions(cards({ decks: [] }), s, 0);
    expect(empty.options).toEqual([]);
    expect(empty.notices.map((n) => [n.code, n.path])).toEqual([
      ["sizing.empty", "/components/0/decks"],
    ]);
    const bad = cardOptions(cards({ shortSide: 0, decks: [{ name: "A", count: 0 }] }), s, 2);
    expect(bad.options).toEqual([]);
    expect(bad.notices.map((n) => n.path)).toEqual([
      "/components/2/shortSide",
      "/components/2/decks/0/count",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sizing/common.test.ts src/sizing/cards.test.ts`
Expected: FAIL with "Failed to resolve import "./common"" and "./cards".

- [ ] **Step 3: Write the implementation**

`apps/insert-generator/src/sizing/common.ts`:

```ts
import { effective } from "../model/settings";
import type { Component, Notice, Settings, Side } from "../model/types";
import type { CompartmentReq, FeatureReq } from "./types";

/** One way to store a component. Blocks are compartment groups a split never separates. */
export interface StorageOption {
  id: string;
  blocks: CompartmentReq[][];
}

export interface OptionsResult {
  options: StorageOption[];
  notices: Notice[];
}

export function displayName(c: Component): string {
  return c.name.trim() !== "" ? c.name : c.id;
}

export function label(name: string, fallback: string): string {
  return name.trim() !== "" ? name : fallback;
}

export function isPos(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

export function isCount(x: number): boolean {
  return Number.isInteger(x) && x >= 1;
}

export function invalid(index: number, c: Component, field: string): Notice {
  return {
    level: "error",
    code: "sizing.invalid",
    message: `${displayName(c)}: ${field} is out of range, so this component is not laid out.`,
    path: `/components/${index}/${field}`,
  };
}

export function emptyNotice(index: number, c: Component, field: string): Notice {
  return {
    level: "warning",
    code: "sizing.empty",
    message: `${displayName(c)}: nothing to store (${field} is empty), so this component is not laid out.`,
    path: `/components/${index}/${field}`,
  };
}

/**
 * The component's main clearance (total): cardClearance for cards, pieceClearance otherwise,
 * both × fit. `component.clearance` replaces it as an absolute total, not scaled by fit.
 */
export function mainClearance(c: Component, s: Settings): number {
  if (c.clearance !== undefined) {
    return c.clearance;
  }
  const e = effective(s);
  return c.kind === "cards" ? e.cardClearance : e.pieceClearance;
}

export function fingerPocket(side: Side, depthFraction: number, perItem: boolean): FeatureReq {
  return { type: "fingerPocket", side, depthFraction, perItem };
}

export function cornerRelief(): FeatureReq {
  return { type: "cornerRelief" };
}

export interface CompartmentInput {
  componentId: string;
  contents: string;
  kind: CompartmentReq["kind"];
  w: number; // content size including clearance, finger reach NOT included
  d: number;
  h: number;
  elastic?: Partial<CompartmentReq["elastic"]>;
  features: FeatureReq[];
  spacerAxis?: "w" | "d";
  minVolume?: number;
  maxHRatio?: number;
}

/** Builds a CompartmentReq; adds fingerPocket.reach to minW/minD once per pocket side (spec §6.1). */
export function compartment(input: CompartmentInput, s: Settings): CompartmentReq {
  const reach = s.fingerPocket.reach;
  const sides = input.features.flatMap((f) =>
    f.type === "fingerPocket" && f.side !== undefined ? [f.side] : [],
  );
  const xSides = sides.filter((side) => side === "left" || side === "right").length;
  const ySides = sides.filter((side) => side === "front" || side === "back").length;
  const req: CompartmentReq = {
    componentId: input.componentId,
    contents: input.contents,
    kind: input.kind,
    minW: input.w + xSides * reach,
    minD: input.d + ySides * reach,
    minH: input.h,
    elastic: {
      w: input.elastic?.w ?? false,
      d: input.elastic?.d ?? false,
      h: input.elastic?.h ?? false,
    },
    features: input.features,
  };
  if (input.minVolume !== undefined) {
    req.minVolume = input.minVolume;
  }
  if (input.maxHRatio !== undefined) {
    req.maxHRatio = input.maxHRatio;
  }
  if (input.spacerAxis !== undefined) {
    req.spacerAxis = input.spacerAxis;
  }
  return req;
}
```

`apps/insert-generator/src/sizing/cards.ts`:

```ts
import { SLEEVES } from "../model/presets";
import { effective } from "../model/settings";
import type { CardsComponent, Notice, Settings } from "../model/types";
import {
  compartment,
  displayName,
  emptyNotice,
  fingerPocket,
  invalid,
  isCount,
  isPos,
  label,
  mainClearance,
  type OptionsResult,
} from "./common";
import { MIN_MEASURED_CARD_T } from "./constants";
import type { CompartmentReq } from "./types";

export type CardStorage = "upright-long" | "upright-short" | "flat";
export const CARD_STORAGES: readonly CardStorage[] = ["upright-long", "upright-short", "flat"];

/** S, L = sleeved short/long side; t = per-card thickness (spec §7.1). */
export interface CardDims {
  S: number;
  L: number;
  t: number;
}

function sleeved(c: CardsComponent, s: Settings): { S: number; L: number; tPreset: number } {
  const short = Math.min(c.shortSide, c.longSide);
  const long = Math.max(c.shortSide, c.longSide);
  if (typeof c.sleeve === "string") {
    const sleeve = SLEEVES[c.sleeve];
    return {
      S: short + sleeve.addSize,
      L: long + sleeve.addSize,
      tPreset: s.cardThickness + sleeve.addThickness,
    };
  }
  return {
    S: Math.min(c.sleeve.w, c.sleeve.h),
    L: Math.max(c.sleeve.w, c.sleeve.h),
    tPreset: s.cardThickness + c.sleeve.thickness,
  };
}

export function cardDims(
  c: CardsComponent,
  s: Settings,
  index: number,
): { dims: CardDims; notices: Notice[] } {
  const { S, L, tPreset } = sleeved(c, s);
  if (c.thickness.mode === "preset") {
    return { dims: { S, L, t: tPreset }, notices: [] };
  }
  const measured = c.thickness.stackMm / c.thickness.cards;
  if (measured >= MIN_MEASURED_CARD_T) {
    return { dims: { S, L, t: measured }, notices: [] };
  }
  const notice: Notice = {
    level: "warning",
    code: "sizing.measuredTooThin",
    message: `${displayName(c)}: ${c.thickness.stackMm} mm for ${c.thickness.cards} cards is under ${MIN_MEASURED_CARD_T} mm per card; using ${tPreset.toFixed(2)} mm per card instead.`,
    path: `/components/${index}/thickness/stackMm`,
  };
  return { dims: { S, L, t: tPreset }, notices: [notice] };
}

/** Stack width of one deck: n·t·(1 + pct·fit) + cardStackClearance·fit (spec §7.1). */
export function stackWidth(n: number, t: number, s: Settings): number {
  const pct = s.cardStackClearancePct * s.fit;
  return n * t * (1 + pct) + effective(s).cardStackClearance;
}

export function deckCompartment(
  c: CardsComponent,
  deck: { name: string; count: number },
  storage: CardStorage,
  dims: CardDims,
  s: Settings,
): CompartmentReq {
  const clearance = mainClearance(c, s);
  const stack = stackWidth(deck.count, dims.t, s);
  const base = {
    componentId: c.id,
    contents: `${label(deck.name, c.name)} ×${deck.count}`,
    kind: "well" as const,
  };
  if (storage === "flat") {
    return compartment(
      {
        ...base,
        w: dims.S + clearance,
        d: dims.L + clearance,
        h: stack,
        features: [fingerPocket("front", 1, true), fingerPocket("back", 1, true)],
      },
      s,
    );
  }
  const onLongEdge = storage === "upright-long";
  return compartment(
    {
      ...base,
      w: stack,
      d: (onLongEdge ? dims.L : dims.S) + clearance,
      h: (onLongEdge ? dims.S : dims.L) + clearance,
      elastic: { w: true },
      spacerAxis: "w",
      features: [fingerPocket("front", 1 / 3, true), fingerPocket("back", 1 / 3, true)],
    },
    s,
  );
}

function validateCards(c: CardsComponent, index: number): Notice[] {
  const out: Notice[] = [];
  if (!isPos(c.shortSide)) {
    out.push(invalid(index, c, "shortSide"));
  }
  if (!isPos(c.longSide)) {
    out.push(invalid(index, c, "longSide"));
  }
  if (c.decks.length === 0) {
    out.push(emptyNotice(index, c, "decks"));
  }
  c.decks.forEach((deck, i) => {
    if (!isCount(deck.count)) {
      out.push(invalid(index, c, `decks/${i}/count`));
    }
  });
  if (typeof c.sleeve !== "string") {
    if (!isPos(c.sleeve.w)) {
      out.push(invalid(index, c, "sleeve/w"));
    }
    if (!isPos(c.sleeve.h)) {
      out.push(invalid(index, c, "sleeve/h"));
    }
    if (!(Number.isFinite(c.sleeve.thickness) && c.sleeve.thickness >= 0)) {
      out.push(invalid(index, c, "sleeve/thickness"));
    }
  }
  if (c.thickness.mode === "measured") {
    if (!isCount(c.thickness.cards)) {
      out.push(invalid(index, c, "thickness/cards"));
    }
    if (!isPos(c.thickness.stackMm)) {
      out.push(invalid(index, c, "thickness/stackMm"));
    }
  }
  return out;
}

export function cardOptions(c: CardsComponent, s: Settings, index: number): OptionsResult {
  const problems = validateCards(c, index);
  if (problems.length > 0) {
    return { options: [], notices: problems };
  }
  const { dims, notices } = cardDims(c, s, index);
  const storages = c.storage === "auto" ? CARD_STORAGES : [c.storage];
  return {
    options: storages.map((storage) => ({
      id: storage,
      blocks: c.decks.map((deck) => [deckCompartment(c, deck, storage, dims, s)]),
    })),
    notices,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sizing/common.test.ts src/sizing/cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/common.ts src/sizing/cards.ts src/sizing/common.test.ts src/sizing/cards.test.ts
git commit -m "Add card sizing"
```

---

### Task 3: Bulk sizing

**Files:**

- Create: `apps/insert-generator/src/sizing/bulk.ts`
- Test: `apps/insert-generator/src/sizing/bulk.test.ts`

**Interfaces:**

- Consumes: `common.ts` (`compartment`, `displayName`, `emptyNotice`, `invalid`, `isCount`, `isPos`, `label`, `mainClearance`, `OptionsResult`), constants `BULK_MIN_SIDE`, `MAX_H_RATIO`, `SHALLOW_H`.
- Produces:
  - `type BulkShape = "shallow" | "deep"`, `BULK_SHAPES: readonly BulkShape[]` (= `["shallow", "deep"]`, spec order "wide-and-shallow vs narrow-and-deep")
  - `interface BulkLine { volume: number; side0: number; hFloor: number }`
  - `bulkLine(item: BulkItem, clearance: number, packingFactor: number): BulkLine`
  - `shapeLine(line: BulkLine, shape: BulkShape): { side: number; h: number }`
  - `bulkCompartment(componentId: string, contents: string, line: BulkLine, shape: BulkShape, s: Settings): CompartmentReq`
  - `packingFactorNotice(c: Component): Notice`
  - `bulkOptions(c: BulkComponent, s: Settings, index: number): OptionsResult` — option ids `shallow`, `deep`; one block (one compartment) per item line.

Formulas: volume = `count·w·d·h ÷ packingFactor` (`volumeMl × 1000` as given). `side0 = max(largest dim + clearance, 25)` (25 for `volumeMl`). `hFloor = smallest dim + clearance` (0 for `volumeMl`). Shallow: `h = max(20, hFloor)`, `side = max(side0, √(V/h))`. Deep: `side = max(side0, ∛(V/1.5))`, `h = max(hFloor, 20, V/side²)`. Both keep `side² · h ≥ V` and `h ≤ 1.5 · side`. Compartment: kind `scoop`, `minW = minD = side`, `minH = h`, elastic on all axes, `minVolume = V`, `maxHRatio = 1.5`, scoop feature on `front`, no finger pocket.

- [ ] **Step 1: Write the failing test**

`apps/insert-generator/src/sizing/bulk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { bulkLine, bulkOptions, shapeLine } from "./bulk";
import { at, bulk } from "./test-helpers";
import type { CompartmentReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;

function line(component = bulk(), settings: Settings = s, option = 0, item = 0): CompartmentReq {
  return at(at(at(bulkOptions(component, settings, 0).options, option).blocks, item), 0);
}

describe("bulkOptions", () => {
  it("divides the item volume by the packing factor; shallow first, then deep", () => {
    const { options, notices } = bulkOptions(bulk(), s, 0);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["shallow", "deep"]);
    // V = 30 · 10³ / 0.5 = 60 000 mm³
    const shallow = line();
    expect(shallow.minVolume).toBe(60000);
    expect(shallow.minH).toBe(20);
    expect(shallow.minW).toBeCloseTo(Math.sqrt(3000), 9); // 54.772…
    expect(shallow.minD).toBeCloseTo(Math.sqrt(3000), 9);
    expect(shallow.kind).toBe("scoop");
    expect(shallow.contents).toBe("Cubes ×30");
    expect(shallow.elastic).toEqual({ w: true, d: true, h: true });
    expect(shallow.maxHRatio).toBe(1.5);
    expect(shallow.features).toEqual([{ type: "scoop", side: "front" }]);
    const deep = line(bulk(), s, 1);
    expect(deep.minW).toBeCloseTo(Math.cbrt(40000), 9); // 34.1995…
    expect(deep.minH).toBeCloseTo(1.5 * Math.cbrt(40000), 6); // 51.299…
  });

  it("uses volumeMl lines as given (1 ml = 1000 mm³)", () => {
    const component = bulk({ items: [{ name: "Coins", volumeMl: 120 }] });
    const shallow = line(component);
    expect(shallow.minVolume).toBe(120000);
    expect(shallow.contents).toBe("Coins 120 ml");
    expect(shallow.minW).toBeCloseTo(Math.sqrt(6000), 9); // 77.459…
    expect(shallow.minH).toBe(20);
    const deep = line(component, s, 1);
    expect(deep.minW).toBeCloseTo(Math.cbrt(80000), 9); // 43.088…
    expect(deep.minH).toBeCloseTo(1.5 * Math.cbrt(80000), 6);
  });

  it("keeps the per-axis minimum: largest item dimension + clearance, at least 25", () => {
    const component = bulk({ items: [{ name: "Board", count: 1, w: 40, d: 30, h: 5 }] });
    const shallow = line(component);
    expect(shallow.minW).toBe(41);
    expect(shallow.minD).toBe(41);
    expect(shallow.minH).toBe(20);
    // the deep shape cannot be narrower, so it equals the shallow one (variants dedupe it)
    expect(line(component, s, 1)).toEqual(shallow);
  });

  it("a clearance override replaces pieceClearance, unscaled by fit", () => {
    const component = bulk({
      clearance: 3,
      items: [{ name: "Board", count: 1, w: 40, d: 30, h: 5 }],
    });
    expect(line(component, { ...s, fit: 1.4 }).minW).toBe(43);
    expect(
      line(bulk({ items: [{ name: "Board", count: 1, w: 40, d: 30, h: 5 }] }), {
        ...s,
        fit: 1.4,
      }).minW,
    ).toBeCloseTo(41.4, 9);
  });

  it("a smaller packing factor needs more volume", () => {
    expect(line(bulk(), { ...s, packingFactor: 0.25 }).minVolume).toBe(120000);
  });

  it("makes one compartment per item line", () => {
    const { options } = bulkOptions(
      bulk({
        items: [
          { name: "Cubes", count: 30, w: 10, d: 10, h: 10 },
          { name: "Coins", volumeMl: 50 },
        ],
      }),
      s,
      0,
    );
    expect(at(options, 0).blocks.map((b) => b.map((c) => c.contents))).toEqual([
      ["Cubes ×30"],
      ["Coins 50 ml"],
    ]);
  });

  it("handles 2000 tiny cubes with finite, volume-preserving shapes", () => {
    const component = bulk({ items: [{ name: "Grains", count: 2000, w: 3, d: 3, h: 3 }] });
    for (const option of [0, 1]) {
      const c = line(component, s, option);
      expect(c.minVolume).toBe(108000);
      for (const v of [c.minW, c.minD, c.minH]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(c.minW * c.minD * c.minH).toBeGreaterThanOrEqual(108000 * (1 - 1e-9));
      expect(c.minH).toBeLessThanOrEqual(1.5 * Math.min(c.minW, c.minD) + 1e-9);
    }
    expect(line(component).minW).toBeCloseTo(Math.sqrt(5400), 9); // 73.48…
    expect(line(component, s, 1).minW).toBeCloseTo(Math.cbrt(72000), 9); // 41.60…
  });

  it("reports empty item lists, bad items and a bad packing factor", () => {
    const empty = bulkOptions(bulk({ items: [] }), s, 0);
    expect(empty.options).toEqual([]);
    expect(empty.notices.map((n) => n.code)).toEqual(["sizing.empty"]);
    const bad = bulkOptions(
      bulk({
        items: [
          { name: "X", count: 0, w: 1, d: 0, h: 1 },
          { name: "Y", volumeMl: -1 },
        ],
      }),
      s,
      1,
    );
    expect(bad.notices.map((n) => n.path)).toEqual([
      "/components/1/items/0/count",
      "/components/1/items/0/d",
      "/components/1/items/1/volumeMl",
    ]);
    const pf = bulkOptions(bulk(), { ...s, packingFactor: 0 }, 0);
    expect(pf.options).toEqual([]);
    expect(pf.notices.map((n) => n.path)).toEqual(["/settings/packingFactor"]);
  });
});

describe("bulk shapes", () => {
  it("keeps side² · h ≥ volume and h ≤ 1.5 · side", () => {
    const l = bulkLine({ name: "A", count: 7, w: 12, d: 9, h: 4 }, 1, 0.5);
    for (const shape of ["shallow", "deep"] as const) {
      const { side, h } = shapeLine(l, shape);
      expect(side * side * h).toBeGreaterThanOrEqual(l.volume * (1 - 1e-12));
      expect(h).toBeLessThanOrEqual(1.5 * side + 1e-9);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sizing/bulk.test.ts`
Expected: FAIL with "Failed to resolve import "./bulk"".

- [ ] **Step 3: Write the implementation**

`apps/insert-generator/src/sizing/bulk.ts`:

```ts
import type { BulkComponent, BulkItem, Component, Notice, Settings } from "../model/types";
import {
  compartment,
  displayName,
  emptyNotice,
  invalid,
  isCount,
  isPos,
  label,
  mainClearance,
  type OptionsResult,
} from "./common";
import { BULK_MIN_SIDE, MAX_H_RATIO, SHALLOW_H } from "./constants";
import type { CompartmentReq } from "./types";

export type BulkShape = "shallow" | "deep";
export const BULK_SHAPES: readonly BulkShape[] = ["shallow", "deep"];

export interface BulkLine {
  volume: number; // mm³ the pile needs, packing included
  side0: number; // per-axis minimum width/depth
  hFloor: number; // smallest useful content depth
}

export function bulkLine(item: BulkItem, clearance: number, packingFactor: number): BulkLine {
  if ("volumeMl" in item) {
    return { volume: item.volumeMl * 1000, side0: BULK_MIN_SIDE, hFloor: 0 };
  }
  const largest = Math.max(item.w, item.d, item.h);
  const smallest = Math.min(item.w, item.d, item.h);
  return {
    volume: (item.count * item.w * item.d * item.h) / packingFactor,
    side0: Math.max(largest + clearance, BULK_MIN_SIDE),
    hFloor: smallest + clearance,
  };
}

/** Square footprint `side` and content depth `h` with side²·h ≥ volume and h ≤ 1.5·side. */
export function shapeLine(line: BulkLine, shape: BulkShape): { side: number; h: number } {
  if (shape === "shallow") {
    const h = Math.max(SHALLOW_H, line.hFloor);
    return { side: Math.max(line.side0, Math.sqrt(line.volume / h)), h };
  }
  const side = Math.max(line.side0, Math.cbrt(line.volume / MAX_H_RATIO));
  return { side, h: Math.max(line.hFloor, SHALLOW_H, line.volume / (side * side)) };
}

export function bulkCompartment(
  componentId: string,
  contents: string,
  line: BulkLine,
  shape: BulkShape,
  s: Settings,
): CompartmentReq {
  const { side, h } = shapeLine(line, shape);
  return compartment(
    {
      componentId,
      contents,
      kind: "scoop",
      w: side,
      d: side,
      h,
      elastic: { w: true, d: true, h: true },
      minVolume: line.volume,
      maxHRatio: MAX_H_RATIO,
      features: [{ type: "scoop", side: "front" }],
    },
    s,
  );
}

export function packingFactorNotice(c: Component): Notice {
  return {
    level: "error",
    code: "sizing.invalid",
    message: `${displayName(c)}: packingFactor must be above 0, so this component is not laid out.`,
    path: "/settings/packingFactor",
  };
}

function itemLabel(item: BulkItem, fallback: string): string {
  const name = label(item.name, fallback);
  return "volumeMl" in item ? `${name} ${item.volumeMl} ml` : `${name} ×${item.count}`;
}

function validateBulk(c: BulkComponent, s: Settings, index: number): Notice[] {
  const out: Notice[] = [];
  if (c.items.length === 0) {
    out.push(emptyNotice(index, c, "items"));
  }
  c.items.forEach((item, i) => {
    if ("volumeMl" in item) {
      if (!isPos(item.volumeMl)) {
        out.push(invalid(index, c, `items/${i}/volumeMl`));
      }
      return;
    }
    if (!isCount(item.count)) {
      out.push(invalid(index, c, `items/${i}/count`));
    }
    for (const key of ["w", "d", "h"] as const) {
      if (!isPos(item[key])) {
        out.push(invalid(index, c, `items/${i}/${key}`));
      }
    }
  });
  if (c.items.some((item) => !("volumeMl" in item)) && !isPos(s.packingFactor)) {
    out.push(packingFactorNotice(c));
  }
  return out;
}

export function bulkOptions(c: BulkComponent, s: Settings, index: number): OptionsResult {
  const notices = validateBulk(c, s, index);
  if (notices.length > 0) {
    return { options: [], notices };
  }
  const clearance = mainClearance(c, s);
  return {
    options: BULK_SHAPES.map((shape) => ({
      id: shape,
      blocks: c.items.map((item) => [
        bulkCompartment(
          c.id,
          itemLabel(item, c.name),
          bulkLine(item, clearance, s.packingFactor),
          shape,
          s,
        ),
      ]),
    })),
    notices: [],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sizing/bulk.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/bulk.ts src/sizing/bulk.test.ts
git commit -m "Add bulk sizing"
```

---

### Task 4: Tile sizing

**Files:**

- Create: `apps/insert-generator/src/sizing/tiles.ts`
- Test: `apps/insert-generator/src/sizing/tiles.test.ts`

**Interfaces:**

- Consumes: `common.ts` (`compartment`, `cornerRelief`, `fingerPocket`, `invalid`, `isCount`, `isPos`, `label`, `mainClearance`, `OptionsResult`, `StorageOption`), `TILE_STACK_TARGETS`, `splitEven`.
- Produces:
  - `hexCornerToCorner(flatToFlat: number): number` = `flatToFlat · 2/√3`
  - `flatFootprint(shape: TileShape): { x: number; y: number }` — rect: `(w, d)`; hex `flat` (a flat edge faces the front): `(c2c, f2f)`; hex `pointy`: `(f2f, c2c)`.
  - `uprightProfile(shape: TileShape): { height: number; length: number }` — rect stands on its longer edge (`height = min(w, d)`, `length = max(w, d)`); hex stands on a flat edge (`height = f2f`, `length = c2c`).
  - `columnCounts(count: number, thickness: number): number[]` — `{1, ceil(total/50), ceil(total/25)}`, clamped to `1…count`, deduped, in that order.
  - `tileOptions(c: TilesComponent, s: Settings, index: number): OptionsResult` — ids `flat-c<n>` (flat or auto) then `upright-c<n>` (upright or auto); one block per column/stack.

Flat column of `n` tiles: `minW = fx + pc`, `minD = fy + pc + 2·reach`, `minH = n·thickness + pc`, full-depth pockets front/back, corner relief, not elastic. Upright stack of `n` tiles: `minW = n·thickness + pc` (elastic, `spacerAxis: "w"`), `minD = length + pc + 2·reach`, `minH = height + pc`, ⅓-depth pockets front/back, corner relief. `pc` = `mainClearance` (pieceClearance × fit or the override). Counts are spread with `splitEven(count, columns)`.

Worked numbers (hex f2f 40, 2 mm, 60 tiles, defaults): c2c = 46.18802; total 120 → columns {1, 3, 5}. Flat c1: minW 47.18802, minD 65, minH 121; flat c3: minH 41; flat c5: minH 25.

- [ ] **Step 1: Write the failing test**

`apps/insert-generator/src/sizing/tiles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings, TilesComponent } from "../model/types";
import { at, tiles } from "./test-helpers";
import { columnCounts, flatFootprint, hexCornerToCorner, tileOptions } from "./tiles";
import type { CompartmentReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const C2C40 = (40 * 2) / Math.sqrt(3); // 46.18802…

function first(component: TilesComponent, option = 0, block = 0): CompartmentReq {
  return at(at(at(tileOptions(component, s, 0).options, option).blocks, block), 0);
}

describe("tile geometry", () => {
  it("computes hex corner-to-corner", () => {
    expect(hexCornerToCorner(40)).toBeCloseTo(46.18802, 5);
  });

  it("puts flat-to-flat front-to-back for flat hexes and left-to-right for pointy ones", () => {
    expect(flatFootprint({ type: "hex", flatToFlat: 40, orientation: "flat" })).toEqual({
      x: C2C40,
      y: 40,
    });
    expect(flatFootprint({ type: "hex", flatToFlat: 40, orientation: "pointy" })).toEqual({
      x: 40,
      y: C2C40,
    });
    expect(flatFootprint({ type: "rect", w: 30, d: 20 })).toEqual({ x: 30, y: 20 });
  });

  it("offers 1 column plus columns for ~50 mm and ~25 mm stacks", () => {
    expect(columnCounts(60, 2)).toEqual([1, 3, 5]);
    expect(columnCounts(7, 2)).toEqual([1]);
    expect(columnCounts(7, 10)).toEqual([1, 2, 3]);
    expect(columnCounts(2, 40)).toEqual([1, 2]);
  });
});

describe("tileOptions", () => {
  it("lays hex tiles flat, a flat edge to the front, with full-depth pockets and corner reliefs", () => {
    const { options, notices } = tileOptions(tiles(), s, 0);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["flat-c1", "flat-c3", "flat-c5"]);
    const column = first(tiles());
    expect(column.minW).toBeCloseTo(C2C40 + 1, 9);
    expect(column.minD).toBeCloseTo(65, 9);
    expect(column.minH).toBeCloseTo(121, 9);
    expect(column.kind).toBe("well");
    expect(column.contents).toBe("Hexes ×60");
    expect(column.elastic).toEqual({ w: false, d: false, h: false });
    expect(column.features).toEqual([
      { type: "fingerPocket", side: "front", depthFraction: 1, perItem: true },
      { type: "fingerPocket", side: "back", depthFraction: 1, perItem: true },
      { type: "cornerRelief" },
    ]);
  });

  it("swaps the footprint axes for pointy hexes", () => {
    const column = first(tiles({ shape: { type: "hex", flatToFlat: 40, orientation: "pointy" } }));
    expect(column.minW).toBeCloseTo(41, 9);
    expect(column.minD).toBeCloseTo(C2C40 + 1 + 24, 9);
  });

  it("splits a tall stack into columns, one block each", () => {
    const { options } = tileOptions(tiles(), s, 0);
    const three = at(options, 1);
    expect(three.blocks).toHaveLength(3);
    expect(three.blocks.map((b) => at(b, 0).minH)).toEqual([41, 41, 41]);
    expect(at(options, 2).blocks.map((b) => at(b, 0).minH)).toEqual([25, 25, 25, 25, 25]);
  });

  it("spreads uneven counts with the extra tiles in the first columns", () => {
    const { options } = tileOptions(tiles({ count: 7, thickness: 10 }), s, 0);
    expect(at(options, 2).blocks.map((b) => at(b, 0).minH)).toEqual([31, 21, 21]);
    expect(at(options, 2).blocks.map((b) => at(b, 0).contents)).toEqual([
      "Hexes ×3",
      "Hexes ×2",
      "Hexes ×2",
    ]);
  });

  it("stands hex tiles upright on a flat edge, like upright cards", () => {
    const upright = tiles({ storage: "upright" });
    expect(tileOptions(upright, s, 0).options.map((o) => o.id)).toEqual([
      "upright-c1",
      "upright-c3",
      "upright-c5",
    ]);
    const stack = first(upright);
    expect(stack.minW).toBeCloseTo(121, 9);
    expect(stack.minD).toBeCloseTo(C2C40 + 1 + 24, 9);
    expect(stack.minH).toBeCloseTo(41, 9);
    expect(stack.elastic).toEqual({ w: true, d: false, h: false });
    expect(stack.spacerAxis).toBe("w");
    expect(at(stack.features, 0)).toEqual({
      type: "fingerPocket",
      side: "front",
      depthFraction: 1 / 3,
      perItem: true,
    });
  });

  it("stands rect tiles on their longer edge", () => {
    const stack = first(
      tiles({ shape: { type: "rect", w: 30, d: 20 }, count: 10, storage: "upright" }),
    );
    expect(stack.minW).toBeCloseTo(21, 9);
    expect(stack.minD).toBeCloseTo(55, 9);
    expect(stack.minH).toBeCloseTo(21, 9);
  });

  it("auto lists flat options before upright ones", () => {
    expect(tileOptions(tiles({ storage: "auto" }), s, 0).options.map((o) => o.id)).toEqual([
      "flat-c1",
      "flat-c3",
      "flat-c5",
      "upright-c1",
      "upright-c3",
      "upright-c5",
    ]);
  });

  it("uses the clearance override", () => {
    const column = first(tiles({ shape: { type: "rect", w: 30, d: 20 }, clearance: 0 }));
    expect(column.minW).toBe(30);
    expect(column.minD).toBe(44);
  });

  it("reports invalid tiles", () => {
    const bad = tileOptions(tiles({ thickness: 0, count: 0 }), s, 2);
    expect(bad.options).toEqual([]);
    expect(bad.notices.map((n) => n.path)).toEqual([
      "/components/2/thickness",
      "/components/2/count",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sizing/tiles.test.ts`
Expected: FAIL with "Failed to resolve import "./tiles"".

- [ ] **Step 3: Write the implementation**

`apps/insert-generator/src/sizing/tiles.ts`:

```ts
import type { Notice, Settings, TileShape, TilesComponent } from "../model/types";
import {
  compartment,
  cornerRelief,
  fingerPocket,
  invalid,
  isCount,
  isPos,
  label,
  mainClearance,
  type OptionsResult,
  type StorageOption,
} from "./common";
import { TILE_STACK_TARGETS } from "./constants";
import type { CompartmentReq } from "./types";
import { splitEven } from "./units";

export function hexCornerToCorner(flatToFlat: number): number {
  return (flatToFlat * 2) / Math.sqrt(3);
}

/** Footprint of one tile lying flat, tray-local: x along X, y along Y (front → back). */
export function flatFootprint(shape: TileShape): { x: number; y: number } {
  if (shape.type === "rect") {
    return { x: shape.w, y: shape.d };
  }
  const c2c = hexCornerToCorner(shape.flatToFlat);
  // "flat": a flat edge faces the tray front, so front-to-back is flat-to-flat.
  return shape.orientation === "flat"
    ? { x: c2c, y: shape.flatToFlat }
    : { x: shape.flatToFlat, y: c2c };
}

/** A standing tile: rect on its longer edge, hex on a flat edge (spec §6.2). */
export function uprightProfile(shape: TileShape): { height: number; length: number } {
  if (shape.type === "rect") {
    return { height: Math.min(shape.w, shape.d), length: Math.max(shape.w, shape.d) };
  }
  return { height: shape.flatToFlat, length: hexCornerToCorner(shape.flatToFlat) };
}

/** Column (flat) or stack (upright) counts to offer as variants; sizing doesn't know topPlane. */
export function columnCounts(count: number, thickness: number): number[] {
  const total = count * thickness;
  const raw = [1, ...TILE_STACK_TARGETS.map((target) => Math.ceil(total / target - 1e-9))];
  const out: number[] = [];
  for (const columns of raw) {
    const clamped = Math.min(Math.max(columns, 1), count);
    if (!out.includes(clamped)) {
      out.push(clamped);
    }
  }
  return out;
}

function flatColumn(c: TilesComponent, n: number, clearance: number, s: Settings): CompartmentReq {
  const foot = flatFootprint(c.shape);
  return compartment(
    {
      componentId: c.id,
      contents: `${label(c.name, c.id)} ×${n}`,
      kind: "well",
      w: foot.x + clearance,
      d: foot.y + clearance,
      h: n * c.thickness + clearance,
      features: [fingerPocket("front", 1, true), fingerPocket("back", 1, true), cornerRelief()],
    },
    s,
  );
}

function uprightStack(
  c: TilesComponent,
  n: number,
  clearance: number,
  s: Settings,
): CompartmentReq {
  const profile = uprightProfile(c.shape);
  return compartment(
    {
      componentId: c.id,
      contents: `${label(c.name, c.id)} ×${n}`,
      kind: "well",
      w: n * c.thickness + clearance,
      d: profile.length + clearance,
      h: profile.height + clearance,
      elastic: { w: true },
      spacerAxis: "w",
      features: [
        fingerPocket("front", 1 / 3, true),
        fingerPocket("back", 1 / 3, true),
        cornerRelief(),
      ],
    },
    s,
  );
}

function validateTiles(c: TilesComponent, index: number): Notice[] {
  const out: Notice[] = [];
  if (!isPos(c.thickness)) {
    out.push(invalid(index, c, "thickness"));
  }
  if (!isCount(c.count)) {
    out.push(invalid(index, c, "count"));
  }
  if (c.shape.type === "rect") {
    if (!isPos(c.shape.w)) {
      out.push(invalid(index, c, "shape/w"));
    }
    if (!isPos(c.shape.d)) {
      out.push(invalid(index, c, "shape/d"));
    }
  } else if (!isPos(c.shape.flatToFlat)) {
    out.push(invalid(index, c, "shape/flatToFlat"));
  }
  return out;
}

export function tileOptions(c: TilesComponent, s: Settings, index: number): OptionsResult {
  const notices = validateTiles(c, index);
  if (notices.length > 0) {
    return { options: [], notices };
  }
  const clearance = mainClearance(c, s);
  const counts = columnCounts(c.count, c.thickness);
  const options: StorageOption[] = [];
  if (c.storage !== "upright") {
    for (const columns of counts) {
      options.push({
        id: `flat-c${columns}`,
        blocks: splitEven(c.count, columns).map((n) => [flatColumn(c, n, clearance, s)]),
      });
    }
  }
  if (c.storage !== "flat") {
    for (const columns of counts) {
      options.push({
        id: `upright-c${columns}`,
        blocks: splitEven(c.count, columns).map((n) => [uprightStack(c, n, clearance, s)]),
      });
    }
  }
  return { options, notices: [] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sizing/tiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/tiles.ts src/sizing/tiles.test.ts
git commit -m "Add tile sizing"
```

---

### Task 5: Minis sizing

**Files:**

- Create: `apps/insert-generator/src/sizing/minis.ts`
- Test: `apps/insert-generator/src/sizing/minis.test.ts`

**Interfaces:**

- Consumes: `bulk.ts` (`BULK_SHAPES`, `bulkCompartment`, `bulkLine`, `packingFactorNotice`), `common.ts` (`compartment`, `emptyNotice`, `fingerPocket`, `invalid`, `isCount`, `isPos`, `label`, `mainClearance`, `OptionsResult`, `StorageOption`).
- Produces:
  - `lyingDims(f: { w: number; d: number; h: number }): { w: number; d: number; h: number }` — unchanged unless `h > max(w, d)`; then `h` swaps with the larger of `w`, `d` (`w` wins a tie).
  - `minisOptions(c: MinisComponent, s: Settings, index: number): OptionsResult` — pockets: ids `standing`, then `lying` (only if some figure has `h > max(w, d)`); bulk: ids `bulk-shallow`, `bulk-deep`. One block per figure line.

Pocket per figure (×count): kind `pocket`, `minW = w + pc`, `minD = d + pc + reach` (one ⅓-depth finger pocket on the front), `minH = h + pc`, not elastic. Contents `"<name> i/count"` (just `"<name>"` when count is 1). Bulk mode: as bulk with the figure's bounding box (`count·w·d·h ÷ packingFactor`).

Worked numbers (Hero 25 × 25 × 40, ×2, defaults): standing pocket 26 × 38 × 41; lying 41 × 38 × 26. Bulk: V = 2 · 25 · 25 · 40 / 0.5 = 100 000; side0 = 41, hFloor = 26; shallow side = √(100000/26) = 62.017, h 26; deep side 41, h = 100000/41² = 59.488.

- [ ] **Step 1: Write the failing test**

`apps/insert-generator/src/sizing/minis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { lyingDims, minisOptions } from "./minis";
import { at, minis } from "./test-helpers";

const s: Settings = DEFAULT_SETTINGS;

describe("lyingDims", () => {
  it("lays a tall figure down along its larger footprint side", () => {
    expect(lyingDims({ w: 20, d: 30, h: 50 })).toEqual({ w: 20, d: 50, h: 30 });
    expect(lyingDims({ w: 30, d: 20, h: 50 })).toEqual({ w: 50, d: 20, h: 30 });
    expect(lyingDims({ w: 25, d: 25, h: 40 })).toEqual({ w: 40, d: 25, h: 25 });
  });

  it("leaves a figure that is not taller than wide alone", () => {
    expect(lyingDims({ w: 30, d: 20, h: 15 })).toEqual({ w: 30, d: 20, h: 15 });
  });
});

describe("minisOptions", () => {
  it("makes one pocket per figure with a ⅓-depth finger pocket in front", () => {
    const { options, notices } = minisOptions(minis(), s, 0);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["standing", "lying"]);
    const standing = at(options, 0);
    expect(standing.blocks).toHaveLength(1);
    const block = at(standing.blocks, 0);
    expect(block.map((c) => c.contents)).toEqual(["Hero 1/2", "Hero 2/2"]);
    const pocket = at(block, 0);
    expect(pocket).toMatchObject({ kind: "pocket", minW: 26, minD: 38, minH: 41 });
    expect(pocket.elastic).toEqual({ w: false, d: false, h: false });
    expect(pocket.features).toEqual([
      { type: "fingerPocket", side: "front", depthFraction: 1 / 3, perItem: true },
    ]);
    expect(at(at(at(options, 1).blocks, 0), 0)).toMatchObject({ minW: 41, minD: 38, minH: 26 });
  });

  it("offers no lying variant when nothing is taller than wide", () => {
    const { options } = minisOptions(
      minis({ figures: [{ name: "Cart", w: 30, d: 20, h: 15, count: 1 }] }),
      s,
      0,
    );
    expect(options.map((o) => o.id)).toEqual(["standing"]);
    expect(at(at(at(options, 0).blocks, 0), 0).contents).toBe("Cart");
  });

  it("keeps one block per figure line so splits happen by figure", () => {
    const { options } = minisOptions(
      minis({
        figures: [
          { name: "Hero", w: 25, d: 25, h: 40, count: 2 },
          { name: "Boss", w: 50, d: 50, h: 45, count: 1 },
        ],
      }),
      s,
      0,
    );
    expect(at(options, 0).blocks.map((b) => b.length)).toEqual([2, 1]);
  });

  it("bulk mode uses the bounding-box volume ÷ packingFactor", () => {
    const { options } = minisOptions(minis({ storage: "bulk" }), s, 0);
    expect(options.map((o) => o.id)).toEqual(["bulk-shallow", "bulk-deep"]);
    const shallow = at(at(at(options, 0).blocks, 0), 0);
    expect(shallow.kind).toBe("scoop");
    expect(shallow.contents).toBe("Hero ×2");
    expect(shallow.minVolume).toBe(100000);
    expect(shallow.minH).toBe(26);
    expect(shallow.minW).toBeCloseTo(Math.sqrt(100000 / 26), 9); // 62.017…
    const deep = at(at(at(options, 1).blocks, 0), 0);
    expect(deep.minW).toBe(41);
    expect(deep.minH).toBeCloseTo(100000 / (41 * 41), 9); // 59.488…
  });

  it("reports empty and invalid figures", () => {
    expect(minisOptions(minis({ figures: [] }), s, 0).notices.map((n) => n.code)).toEqual([
      "sizing.empty",
    ]);
    const bad = minisOptions(
      minis({ figures: [{ name: "X", w: 0, d: 10, h: 10, count: 1.5 }] }),
      s,
      4,
    );
    expect(bad.options).toEqual([]);
    expect(bad.notices.map((n) => n.path)).toEqual([
      "/components/4/figures/0/w",
      "/components/4/figures/0/count",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sizing/minis.test.ts`
Expected: FAIL with "Failed to resolve import "./minis"".

- [ ] **Step 3: Write the implementation**

`apps/insert-generator/src/sizing/minis.ts`:

```ts
import type { MinisComponent, Notice, Settings } from "../model/types";
import { BULK_SHAPES, bulkCompartment, bulkLine, packingFactorNotice } from "./bulk";
import {
  compartment,
  emptyNotice,
  fingerPocket,
  invalid,
  isCount,
  isPos,
  label,
  mainClearance,
  type OptionsResult,
  type StorageOption,
} from "./common";
import type { CompartmentReq } from "./types";

type Figure = MinisComponent["figures"][number];

interface Dims {
  w: number;
  d: number;
  h: number;
}

/** Lying: h swapped with the larger of w, d — only when the figure is taller than wide (spec §7.1). */
export function lyingDims(f: Dims): Dims {
  if (f.h <= Math.max(f.w, f.d)) {
    return { w: f.w, d: f.d, h: f.h };
  }
  return f.w >= f.d ? { w: f.h, d: f.d, h: f.w } : { w: f.w, d: f.h, h: f.d };
}

function pockets(
  c: MinisComponent,
  f: Figure,
  dims: Dims,
  clearance: number,
  s: Settings,
): CompartmentReq[] {
  const name = label(f.name, c.name);
  return Array.from({ length: f.count }, (_, i) =>
    compartment(
      {
        componentId: c.id,
        contents: f.count > 1 ? `${name} ${i + 1}/${f.count}` : name,
        kind: "pocket",
        w: dims.w + clearance,
        d: dims.d + clearance,
        h: dims.h + clearance,
        features: [fingerPocket("front", 1 / 3, true)],
      },
      s,
    ),
  );
}

function validateMinis(c: MinisComponent, s: Settings, index: number): Notice[] {
  const out: Notice[] = [];
  if (c.figures.length === 0) {
    out.push(emptyNotice(index, c, "figures"));
  }
  c.figures.forEach((f, i) => {
    for (const key of ["w", "d", "h"] as const) {
      if (!isPos(f[key])) {
        out.push(invalid(index, c, `figures/${i}/${key}`));
      }
    }
    if (!isCount(f.count)) {
      out.push(invalid(index, c, `figures/${i}/count`));
    }
  });
  if (c.storage === "bulk" && !isPos(s.packingFactor)) {
    out.push(packingFactorNotice(c));
  }
  return out;
}

export function minisOptions(c: MinisComponent, s: Settings, index: number): OptionsResult {
  const notices = validateMinis(c, s, index);
  if (notices.length > 0) {
    return { options: [], notices };
  }
  const clearance = mainClearance(c, s);
  if (c.storage === "bulk") {
    return {
      options: BULK_SHAPES.map((shape): StorageOption => ({
        id: `bulk-${shape}`,
        blocks: c.figures.map((f) => [
          bulkCompartment(
            c.id,
            `${label(f.name, c.name)} ×${f.count}`,
            bulkLine(f, clearance, s.packingFactor),
            shape,
            s,
          ),
        ]),
      })),
      notices: [],
    };
  }
  const options: StorageOption[] = [
    { id: "standing", blocks: c.figures.map((f) => pockets(c, f, f, clearance, s)) },
  ];
  if (c.figures.some((f) => f.h > Math.max(f.w, f.d))) {
    options.push({
      id: "lying",
      blocks: c.figures.map((f) => pockets(c, f, lyingDims(f), clearance, s)),
    });
  }
  return { options, notices: [] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sizing/minis.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/minis.ts src/sizing/minis.test.ts
git commit -m "Add minis sizing"
```

---

### Task 6: Custom sizing and kind dispatch

**Files:**

- Create: `apps/insert-generator/src/sizing/custom.ts`
- Create: `apps/insert-generator/src/sizing/component.ts`
- Test: `apps/insert-generator/src/sizing/custom.test.ts`
- Test: `apps/insert-generator/src/sizing/component.test.ts`

**Interfaces:**

- Consumes: `cardOptions` (Task 2), `bulkOptions` (Task 3), `tileOptions` (Task 4), `minisOptions` (Task 5), `common.ts` helpers.
- Produces:
  - `customOptions(c: CustomComponent, s: Settings, index: number): OptionsResult` — one option `custom`; one block (one well) per item: `minW = w + pc`, `minD = d + pc + reach`, `minH = h + pc`, full-depth finger pocket on the front, corner relief.
  - `componentOptions(c: Component, s: Settings, index: number): OptionsResult` — dispatch by `kind`.
  - `isLoose(c: Component): boolean` — bulk, tiles, or minis with `storage: "bulk"`.

- [ ] **Step 1: Write the failing tests**

`apps/insert-generator/src/sizing/custom.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { customOptions } from "./custom";
import { at, custom } from "./test-helpers";

const s = DEFAULT_SETTINGS;

describe("customOptions", () => {
  it("makes one well per item with a full-depth front pocket and corner reliefs", () => {
    const { options, notices } = customOptions(custom(), s, 0);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["custom"]);
    const blocks = at(options, 0).blocks;
    expect(blocks.map((b) => b.map((c) => c.contents))).toEqual([["Dial 1/2"], ["Dial 2/2"]]);
    expect(at(at(blocks, 0), 0)).toEqual({
      componentId: "x1",
      contents: "Dial 1/2",
      kind: "well",
      minW: 41,
      minD: 43,
      minH: 11,
      elastic: { w: false, d: false, h: false },
      features: [
        { type: "fingerPocket", side: "front", depthFraction: 1, perItem: true },
        { type: "cornerRelief" },
      ],
    });
  });

  it("uses the clearance override, unscaled by fit", () => {
    const { options } = customOptions(custom({ clearance: 0.5, count: 1 }), { ...s, fit: 1.4 }, 0);
    const well = at(at(at(options, 0).blocks, 0), 0);
    expect(well.minW).toBe(40.5);
    expect(well.contents).toBe("Dial");
  });

  it("reports invalid items", () => {
    const bad = customOptions(custom({ h: -1, count: 0 }), s, 5);
    expect(bad.options).toEqual([]);
    expect(bad.notices.map((n) => n.path)).toEqual(["/components/5/h", "/components/5/count"]);
  });
});
```

`apps/insert-generator/src/sizing/component.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { bulkOptions } from "./bulk";
import { cardOptions } from "./cards";
import { componentOptions, isLoose } from "./component";
import { customOptions } from "./custom";
import { minisOptions } from "./minis";
import { bulk, cards, custom, minis, tiles } from "./test-helpers";
import { tileOptions } from "./tiles";

const s = DEFAULT_SETTINGS;

describe("componentOptions", () => {
  it("dispatches by kind", () => {
    expect(componentOptions(cards(), s, 1)).toEqual(cardOptions(cards(), s, 1));
    expect(componentOptions(bulk(), s, 1)).toEqual(bulkOptions(bulk(), s, 1));
    expect(componentOptions(tiles(), s, 1)).toEqual(tileOptions(tiles(), s, 1));
    expect(componentOptions(minis(), s, 1)).toEqual(minisOptions(minis(), s, 1));
    expect(componentOptions(custom(), s, 1)).toEqual(customOptions(custom(), s, 1));
  });
});

describe("isLoose", () => {
  it("flags bulk, tiles and bulk minis", () => {
    expect(isLoose(bulk())).toBe(true);
    expect(isLoose(tiles())).toBe(true);
    expect(isLoose(minis({ storage: "bulk" }))).toBe(true);
    expect(isLoose(minis())).toBe(false);
    expect(isLoose(cards())).toBe(false);
    expect(isLoose(custom())).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sizing/custom.test.ts src/sizing/component.test.ts`
Expected: FAIL with "Failed to resolve import "./custom"" and "./component".

- [ ] **Step 3: Write the implementation**

`apps/insert-generator/src/sizing/custom.ts`:

```ts
import type { CustomComponent, Notice, Settings } from "../model/types";
import {
  compartment,
  cornerRelief,
  fingerPocket,
  invalid,
  isCount,
  isPos,
  label,
  mainClearance,
  type OptionsResult,
} from "./common";

function validateCustom(c: CustomComponent, index: number): Notice[] {
  const out: Notice[] = [];
  for (const key of ["w", "d", "h"] as const) {
    if (!isPos(c[key])) {
      out.push(invalid(index, c, key));
    }
  }
  if (!isCount(c.count)) {
    out.push(invalid(index, c, "count"));
  }
  return out;
}

export function customOptions(c: CustomComponent, s: Settings, index: number): OptionsResult {
  const notices = validateCustom(c, index);
  if (notices.length > 0) {
    return { options: [], notices };
  }
  const clearance = mainClearance(c, s);
  const name = label(c.name, c.id);
  const blocks = Array.from({ length: c.count }, (_, i) => [
    compartment(
      {
        componentId: c.id,
        contents: c.count > 1 ? `${name} ${i + 1}/${c.count}` : name,
        kind: "well",
        w: c.w + clearance,
        d: c.d + clearance,
        h: c.h + clearance,
        features: [fingerPocket("front", 1, true), cornerRelief()],
      },
      s,
    ),
  ]);
  return { options: [{ id: "custom", blocks }], notices: [] };
}
```

`apps/insert-generator/src/sizing/component.ts`:

```ts
import type { Component, Settings } from "../model/types";
import { bulkOptions } from "./bulk";
import { cardOptions } from "./cards";
import type { OptionsResult } from "./common";
import { customOptions } from "./custom";
import { minisOptions } from "./minis";
import { tileOptions } from "./tiles";

export function componentOptions(c: Component, s: Settings, index: number): OptionsResult {
  switch (c.kind) {
    case "cards":
      return cardOptions(c, s, index);
    case "bulk":
      return bulkOptions(c, s, index);
    case "tiles":
      return tileOptions(c, s, index);
    case "minis":
      return minisOptions(c, s, index);
    case "custom":
      return customOptions(c, s, index);
  }
}

/** Loose contents fall out when not covered from above (spec §7.2 score term 2). */
export function isLoose(c: Component): boolean {
  return c.kind === "bulk" || c.kind === "tiles" || (c.kind === "minis" && c.storage === "bulk");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sizing/custom.test.ts src/sizing/component.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/custom.ts src/sizing/component.ts src/sizing/custom.test.ts src/sizing/component.test.ts
git commit -m "Add custom sizing and component dispatch"
```

---

### Task 7: Row arrangement and contiguous splits

**Files:**

- Create: `apps/insert-generator/src/sizing/arrange.ts`
- Test: `apps/insert-generator/src/sizing/arrange.test.ts`

**Interfaces:**

- Consumes: `CompartmentReq` (Task 1), `sum` (Task 1).
- Produces:
  - `rows2Order(compartments: readonly CompartmentReq[]): CompartmentReq[]` — greedy by `minW`, largest first; row 0 gets `ceil(n/2)` compartments, row 1 the rest; original order inside each row; returns row 0 then row 1 (the contract's "first half row 0, rest row 1").
  - `blockWeight(block: readonly CompartmentReq[]): number` — Σ `minW × minD`.
  - `splitBlocks(blocks: readonly CompartmentReq[][], parts: number): CompartmentReq[][][] | null` — contiguous partition into `parts` (1–3) non-empty groups minimising the heaviest group (ties → smaller cut index; for 3 parts then smaller sum of squares, then smaller first cut); `null` if `parts` is outside 1–3 or there are fewer blocks than parts. O(n log n).

- [ ] **Step 1: Write the failing test**

`apps/insert-generator/src/sizing/arrange.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { blockWeight, rows2Order, splitBlocks } from "./arrange";
import type { CompartmentReq } from "./types";

function req(contents: string, minW: number, minD = 1): CompartmentReq {
  return {
    componentId: "x",
    contents,
    kind: "well",
    minW,
    minD,
    minH: 1,
    elastic: { w: false, d: false, h: false },
    features: [],
  };
}

const names = (cs: readonly CompartmentReq[]): string[] => cs.map((c) => c.contents);
const groupNames = (groups: CompartmentReq[][][] | null): string[][] | null =>
  groups === null ? null : groups.map((g) => names(g.flat()));

describe("rows2Order", () => {
  it("fills rows greedily, largest first, first half in row 0", () => {
    const out = rows2Order([req("a", 50), req("b", 40), req("c", 30), req("d", 20), req("e", 10)]);
    // row 0: a, d, e (80); row 1: b, c (70)
    expect(names(out)).toEqual(["a", "d", "e", "b", "c"]);
  });

  it("keeps original order inside a row and breaks size ties by index", () => {
    const out = rows2Order([req("a", 10), req("b", 10), req("c", 10), req("d", 10)]);
    expect(names(out)).toEqual(["a", "c", "b", "d"]);
  });

  it("puts the larger of two compartments in row 0", () => {
    expect(names(rows2Order([req("small", 5), req("big", 9)]))).toEqual(["big", "small"]);
  });
});

describe("blockWeight", () => {
  it("sums footprint areas", () => {
    expect(blockWeight([req("a", 2, 3), req("b", 1, 4)])).toBe(10);
  });
});

describe("splitBlocks", () => {
  const blocks = [[req("a", 4)], [req("b", 1)], [req("c", 1)], [req("d", 1)], [req("e", 1)]];

  it("returns everything as one group for one part", () => {
    expect(groupNames(splitBlocks(blocks, 1))).toEqual([["a", "b", "c", "d", "e"]]);
  });

  it("splits into two contiguous groups minimising the heavier one", () => {
    expect(groupNames(splitBlocks(blocks, 2))).toEqual([["a"], ["b", "c", "d", "e"]]);
  });

  it("splits into three groups, then prefers the more balanced split", () => {
    expect(groupNames(splitBlocks(blocks, 3))).toEqual([["a"], ["b", "c"], ["d", "e"]]);
  });

  it("splits six equal blocks evenly", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((n) => [req(n, 1)]);
    expect(groupNames(splitBlocks(six, 2))).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
    expect(groupNames(splitBlocks(six, 3))).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  it("never separates the compartments of one block", () => {
    const grouped = [[req("a", 1), req("b", 1)], [req("c", 2)]];
    expect(groupNames(splitBlocks(grouped, 2))).toEqual([["a", "b"], ["c"]]);
  });

  it("returns null when there are fewer blocks than parts or parts is out of range", () => {
    expect(splitBlocks([[req("a", 1)], [req("b", 1)]], 3)).toBeNull();
    expect(splitBlocks(blocks, 4)).toBeNull();
    expect(splitBlocks(blocks, 0)).toBeNull();
  });

  it("is fast on 2000 blocks", () => {
    const many = Array.from({ length: 2000 }, (_, i) => [req(`b${i}`, 1 + (i % 7))]);
    const groups = splitBlocks(many, 3);
    expect(groups).not.toBeNull();
    expect(groups?.flat().length).toBe(2000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sizing/arrange.test.ts`
Expected: FAIL with "Failed to resolve import "./arrange"".

- [ ] **Step 3: Write the implementation**

`apps/insert-generator/src/sizing/arrange.ts`:

```ts
import { MAX_SPLITS } from "./constants";
import type { CompartmentReq } from "./types";
import { sum } from "./units";

interface Indexed {
  c: CompartmentReq;
  i: number;
}

/** rows2: greedy by minW, largest first; row 0 holds ceil(n/2). Returns row 0 then row 1. */
export function rows2Order(compartments: readonly CompartmentReq[]): CompartmentReq[] {
  const n = compartments.length;
  const cap0 = Math.ceil(n / 2);
  const cap1 = n - cap0;
  const bySize = compartments
    .map((c, i): Indexed => ({ c, i }))
    .sort((a, b) => b.c.minW - a.c.minW || a.i - b.i);
  const row0: Indexed[] = [];
  const row1: Indexed[] = [];
  let width0 = 0;
  let width1 = 0;
  for (const item of bySize) {
    const toRow0 = row1.length >= cap1 || (width0 <= width1 && row0.length < cap0);
    if (toRow0) {
      row0.push(item);
      width0 += item.c.minW;
    } else {
      row1.push(item);
      width1 += item.c.minW;
    }
  }
  const byIndex = (a: Indexed, b: Indexed): number => a.i - b.i;
  return [...row0.sort(byIndex), ...row1.sort(byIndex)].map((x) => x.c);
}

export function blockWeight(block: readonly CompartmentReq[]): number {
  return sum(block.map((c) => c.minW * c.minD));
}

/** Contiguous split of blocks into 1–3 groups, minimising the heaviest group. */
export function splitBlocks(
  blocks: readonly CompartmentReq[][],
  parts: number,
): CompartmentReq[][][] | null {
  const n = blocks.length;
  if (parts < 1 || parts > MAX_SPLITS || n < parts) {
    return null;
  }
  const prefix: number[] = [0];
  for (const block of blocks) {
    prefix.push((prefix[prefix.length - 1] ?? 0) + blockWeight(block));
  }
  const p = (i: number): number => prefix[i] ?? 0;
  const weight = (a: number, b: number): number => p(b) - p(a);
  const cut = (cuts: readonly number[]): CompartmentReq[][][] => {
    const bounds = [0, ...cuts, n];
    return bounds.slice(1).map((end, i) => blocks.slice(bounds[i] ?? 0, end));
  };
  // Best single cut j in (lo, hi): minimises max(weight(lo, j), weight(j, hi)); ties → smaller j.
  const bestCut = (lo: number, hi: number): number => {
    const target = p(lo) + p(hi);
    let a = lo + 1;
    let b = hi - 1;
    while (a < b) {
      const mid = Math.floor((a + b) / 2);
      if (2 * p(mid) >= target) {
        b = mid;
      } else {
        a = mid + 1;
      }
    }
    const score = (j: number): number => Math.max(weight(lo, j), weight(j, hi));
    const prev = a - 1;
    return prev > lo && score(prev) <= score(a) ? prev : a;
  };
  if (parts === 1) {
    return cut([]);
  }
  if (parts === 2) {
    return cut([bestCut(0, n)]);
  }
  let best: { i: number; j: number; max: number; squares: number } | null = null;
  for (let i = 1; i <= n - 2; i++) {
    const j = bestCut(i, n);
    const ws = [weight(0, i), weight(i, j), weight(j, n)];
    const max = Math.max(...ws);
    const squares = sum(ws.map((w) => w * w));
    if (best === null || max < best.max || (max === best.max && squares < best.squares)) {
      best = { i, j, max, squares };
    }
  }
  return best === null ? null : cut([best.i, best.j]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sizing/arrange.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/arrange.ts src/sizing/arrange.test.ts
git commit -m "Add row arrangement and split helpers"
```

---

### Task 8: Variant enumeration

**Files:**

- Create: `apps/insert-generator/src/sizing/variants.ts`
- Test: `apps/insert-generator/src/sizing/variants.test.ts`

**Interfaces:**

- Consumes: `rows2Order`, `splitBlocks` (Task 7); `StorageOption` (Task 2); `MAX_SPLITS`, `MAX_VARIANTS`.
- Produces:
  - `interface VariantInput { key: string; options: readonly StorageOption[]; players: number | null }` (`players` = perPlayer count, `null` without perPlayer)
  - `buildVariants(input: VariantInput): TrayVariant[]` — rule from "Design decisions → Variant rank". Tray keys: `<key>:p0:<part>` without perPlayer; `<key>:p<player>:0` for "separate" (one part per player, players 0-based); `<key>:pall:<part>` for "combined". Per-player compartments get the suffix ` (P<n>)` (1-based) in `contents`. "combined" is only offered for `players > 1`. Every part has `rotatable: true` (rotating a tray rotates its contents with it, and nothing in a tray depends on the box orientation).

- [ ] **Step 1: Write the failing test**

`apps/insert-generator/src/sizing/variants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { StorageOption } from "./common";
import { at } from "./test-helpers";
import type { CompartmentReq } from "./types";
import { buildVariants } from "./variants";

function req(contents: string, minW: number): CompartmentReq {
  return {
    componentId: "x",
    contents,
    kind: "well",
    minW,
    minD: 10,
    minH: 10,
    elastic: { w: false, d: false, h: false },
    features: [],
  };
}

function opt(id: string, blocks: number): StorageOption {
  return { id, blocks: Array.from({ length: blocks }, (_, i) => [req(`${id}${i}`, 10)]) };
}

describe("buildVariants", () => {
  it("ranks by (mode + arrangement + split, storage, mode, arrangement, split) and keeps 8", () => {
    const variants = buildVariants({
      key: "k",
      options: [opt("A", 4), opt("B", 4), opt("C", 4)],
      players: null,
    });
    expect(variants.map((v) => v.id)).toEqual([
      "A|strip|split1",
      "B|strip|split1",
      "C|strip|split1",
      "A|strip|split2",
      "A|rows2|split1",
      "B|strip|split2",
      "B|rows2|split1",
      "C|strip|split2",
    ]);
    const split2 = at(variants, 3);
    expect(split2.parts.map((p) => p.trayKey)).toEqual(["k:p0:0", "k:p0:1"]);
    expect(split2.parts.map((p) => p.compartments.map((c) => c.contents))).toEqual([
      ["A0", "A1"],
      ["A2", "A3"],
    ]);
    const rows2 = at(variants, 4);
    expect(at(rows2.parts, 0).arrangement).toBe("rows2");
    expect(at(rows2.parts, 0).compartments.map((c) => c.contents)).toEqual([
      "A0",
      "A2",
      "A1",
      "A3",
    ]);
    for (const v of variants) {
      for (const part of v.parts) {
        expect(part.rotatable).toBe(true);
      }
    }
  });

  it("skips rows2 with one compartment and splits with too few blocks", () => {
    expect(
      buildVariants({ key: "k", options: [opt("A", 1)], players: null }).map((v) => v.id),
    ).toEqual(["A|strip|split1"]);
  });

  it("drops later duplicates (tray keys ignored)", () => {
    const same: StorageOption = { id: "B", blocks: opt("A", 1).blocks };
    expect(
      buildVariants({ key: "k", options: [opt("A", 1), same], players: null }).map((v) => v.id),
    ).toEqual(["A|strip|split1"]);
  });

  it("offers separate trays per player first, then one combined tray", () => {
    const variants = buildVariants({ key: "k", options: [opt("A", 2)], players: 3 });
    expect(variants.map((v) => v.id)).toEqual([
      "A|strip|split1|separate",
      "A|rows2|split1|separate",
      "A|strip|split1|combined",
      "A|strip|split2|combined",
      "A|rows2|split1|combined",
      "A|rows2|split2|combined",
    ]);
    const separate = at(variants, 0);
    expect(separate.parts.map((p) => p.trayKey)).toEqual(["k:p0:0", "k:p1:0", "k:p2:0"]);
    expect(at(separate.parts, 1).compartments.map((c) => c.contents)).toEqual([
      "A0 (P2)",
      "A1 (P2)",
    ]);
    const combined = at(variants, 2);
    expect(combined.parts.map((p) => p.trayKey)).toEqual(["k:pall:0"]);
    expect(at(combined.parts, 0).compartments).toHaveLength(6);
  });

  it("offers only separate variants for a single player", () => {
    expect(
      buildVariants({ key: "k", options: [opt("A", 2)], players: 1 }).map((v) => v.id),
    ).toEqual(["A|strip|split1|separate", "A|rows2|split1|separate"]);
  });

  it("never returns more than 8 variants", () => {
    const options = ["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((id) => opt(id, 3));
    expect(buildVariants({ key: "k", options, players: 4 })).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sizing/variants.test.ts`
Expected: FAIL with "Failed to resolve import "./variants"".

- [ ] **Step 3: Write the implementation**

`apps/insert-generator/src/sizing/variants.ts`:

```ts
import { rows2Order, splitBlocks } from "./arrange";
import type { StorageOption } from "./common";
import { MAX_SPLITS, MAX_VARIANTS } from "./constants";
import type { CompartmentReq, TrayPartReq, TrayVariant } from "./types";

export interface VariantInput {
  key: string;
  options: readonly StorageOption[];
  players: number | null;
}

type Arrangement = TrayPartReq["arrangement"];
const ARRANGEMENTS: readonly Arrangement[] = ["strip", "rows2"];

interface Candidate {
  rank: readonly number[];
  variant: TrayVariant;
}

function makePart(
  trayKey: string,
  arrangement: Arrangement,
  compartments: CompartmentReq[],
): TrayPartReq | null {
  if (arrangement === "strip") {
    return { trayKey, arrangement, compartments, rotatable: true };
  }
  if (compartments.length < 2) {
    return null;
  }
  return { trayKey, arrangement, compartments: rows2Order(compartments), rotatable: true };
}

function allOrNull(parts: readonly (TrayPartReq | null)[]): TrayPartReq[] | null {
  const out: TrayPartReq[] = [];
  for (const part of parts) {
    if (part === null) {
      return null;
    }
    out.push(part);
  }
  return out;
}

function forPlayer(blocks: readonly CompartmentReq[][], player: number): CompartmentReq[][] {
  return blocks.map((block) =>
    block.map((c) => ({ ...c, contents: `${c.contents} (P${player + 1})` })),
  );
}

function compareRank(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** Strip/rows2 × 1–3 trays for one block list (no perPlayer, or the "combined" mode). */
function splitCandidates(
  key: string,
  tag: string,
  blocks: readonly CompartmentReq[][],
  s: number,
  m: number,
  optionId: string,
  suffix: string,
): Candidate[] {
  const out: Candidate[] = [];
  ARRANGEMENTS.forEach((arrangement, a) => {
    for (let k = 0; k < MAX_SPLITS; k++) {
      const groups = splitBlocks(blocks, k + 1);
      const parts =
        groups === null
          ? null
          : allOrNull(
              groups.map((group, part) =>
                makePart(`${key}:${tag}:${part}`, arrangement, group.flat()),
              ),
            );
      if (parts !== null) {
        out.push({
          rank: [m + a + k, s, m, a, k],
          variant: { id: `${optionId}|${arrangement}|split${k + 1}${suffix}`, parts },
        });
      }
    }
  });
  return out;
}

export function buildVariants(input: VariantInput): TrayVariant[] {
  const { key, options, players } = input;
  const candidates: Candidate[] = [];
  options.forEach((option, s) => {
    if (players === null) {
      candidates.push(...splitCandidates(key, "p0", option.blocks, s, 0, option.id, ""));
      return;
    }
    const perPlayer = Array.from({ length: players }, (_, p) => forPlayer(option.blocks, p));
    ARRANGEMENTS.forEach((arrangement, a) => {
      const parts = allOrNull(
        perPlayer.map((blocks, p) => makePart(`${key}:p${p}:0`, arrangement, blocks.flat())),
      );
      if (parts !== null) {
        candidates.push({
          rank: [a, s, 0, a, 0],
          variant: { id: `${option.id}|${arrangement}|split1|separate`, parts },
        });
      }
    });
    if (players > 1) {
      candidates.push(
        ...splitCandidates(key, "pall", perPlayer.flat(), s, 1, option.id, "|combined"),
      );
    }
  });
  candidates.sort((x, y) => compareRank(x.rank, y.rank));
  const seen = new Set<string>();
  const variants: TrayVariant[] = [];
  for (const candidate of candidates) {
    const signature = JSON.stringify(
      candidate.variant.parts.map((part) => [part.arrangement, part.compartments]),
    );
    if (variants.length < MAX_VARIANTS && !seen.has(signature)) {
      seen.add(signature);
      variants.push(candidate.variant);
    }
  }
  return variants;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sizing/variants.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/variants.ts src/sizing/variants.test.ts
git commit -m "Add size variant enumeration"
```

---

### Task 9: `size()` — groups, perPlayer, requirements

**Files:**

- Create: `apps/insert-generator/src/sizing/group.ts`
- Test: `apps/insert-generator/src/sizing/group.test.ts`

**Interfaces:**

- Consumes: `componentOptions`, `isLoose` (Task 6); `buildVariants` (Task 8); `StorageOption`, `displayName`, `invalid`, `isCount` (Task 2).
- Produces:
  - `size(components: Component[], settings: Settings): { requirements: TrayRequirement[]; notices: Notice[] }` (roadmap §4.2)
  - `mostFrequentAccess(members: readonly Component[]): Access` — `often` > `sometimes` > `setup`.
  - `combineOptions(lists: readonly StorageOption[][]): StorageOption[]` — group option `s` takes each member's option `min(s, len − 1)`, ids joined with `+`, blocks concatenated in member order.

Rules: requirements appear in the order their key first appears in `components`. `key = groupId ?? componentId` (an empty `groupId` counts as none). Members whose options are empty are left out with their notices; a requirement with no usable member, or with no variants, is not emitted.

> **Superseded by the plan 2 reviews (the implementation is authoritative):** sizing assumes a valid project. A component with both `groupId` and `perPlayer`, or with a `perPlayer.players` outside 1..10, fails `validateComponent` (`field.perPlayerInGroup`, `field.players` / `limit.players`), so `componentOptions` gives it no options and no notices and it is left out; there is no `sizing.perPlayerInGroup` or `sizing.invalid` notice. Settings that fail `settingsValid` (`model/validate`: `SETTING_RANGES` plus the cross-field rules, roadmap §4.6) make `size` return nothing. The step code below still shows the original notices; the repo's `group.ts` and `group.test.ts` replace it.

- [ ] **Step 1: Write the failing test**

`apps/insert-generator/src/sizing/group.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { combineOptions, mostFrequentAccess, size } from "./group";
import { at, bulk, cards, custom, minis, tiles } from "./test-helpers";

const s = DEFAULT_SETTINGS;

describe("size", () => {
  it("sizes one component into one requirement keyed by its id", () => {
    const { requirements, notices } = size([cards()], s);
    expect(notices).toEqual([]);
    expect(requirements).toHaveLength(1);
    const req = at(requirements, 0);
    expect(req.key).toBe("c1");
    expect(req.componentIds).toEqual(["c1"]);
    expect(req.access).toBe("sometimes");
    expect(req.loose).toBe(false);
    expect(req.variants.map((v) => v.id)).toEqual(["upright-long|strip|split1"]);
    expect(at(at(req.variants, 0).parts, 0).trayKey).toBe("c1:p0:0");
  });

  it("puts a group into one tray, mixing kinds, with combined storage options", () => {
    const { requirements } = size(
      [cards({ groupId: "g", access: "often" }), bulk({ groupId: "g", access: "setup" })],
      s,
    );
    expect(requirements).toHaveLength(1);
    const req = at(requirements, 0);
    expect(req.key).toBe("g");
    expect(req.componentIds).toEqual(["c1", "b1"]);
    expect(req.access).toBe("often");
    expect(req.loose).toBe(true);
    expect(req.variants.map((v) => v.id)).toEqual([
      "upright-long+shallow|strip|split1",
      "upright-long+deep|strip|split1",
      "upright-long+shallow|strip|split2",
      "upright-long+shallow|rows2|split1",
      "upright-long+deep|strip|split2",
      "upright-long+deep|rows2|split1",
    ]);
    const first = at(at(req.variants, 0).parts, 0);
    expect(first.trayKey).toBe("g:p0:0");
    expect(first.compartments.map((c) => c.contents)).toEqual(["Main ×52", "Cubes ×30"]);
    expect(at(req.variants, 2).parts.map((p) => p.trayKey)).toEqual(["g:p0:0", "g:p0:1"]);
  });

  it("expands perPlayer into separate trays and one combined tray", () => {
    const { requirements } = size([bulk({ perPlayer: { players: 2 } })], s);
    const req = at(requirements, 0);
    expect(req.variants.map((v) => v.id)).toEqual([
      "shallow|strip|split1|separate",
      "deep|strip|split1|separate",
      "shallow|strip|split1|combined",
      "deep|strip|split1|combined",
      "shallow|rows2|split1|combined",
      "deep|rows2|split1|combined",
    ]);
    const separate = at(req.variants, 0);
    expect(separate.parts.map((p) => p.trayKey)).toEqual(["b1:p0:0", "b1:p1:0"]);
    expect(at(at(separate.parts, 0).compartments, 0).contents).toBe("Cubes ×30 (P1)");
    const combined = at(req.variants, 2);
    expect(combined.parts.map((p) => p.trayKey)).toEqual(["b1:pall:0"]);
    expect(at(combined.parts, 0).compartments.map((c) => c.contents)).toEqual([
      "Cubes ×30 (P1)",
      "Cubes ×30 (P2)",
    ]);
  });

  it("warns about perPlayer inside a group and sizes that component alone", () => {
    const { requirements, notices } = size(
      [cards({ groupId: "g", perPlayer: { players: 2 } }), bulk({ groupId: "g" })],
      s,
    );
    expect(notices).toEqual([
      expect.objectContaining({
        level: "warning",
        code: "sizing.perPlayerInGroup",
        path: "/components/0/groupId",
      }),
    ]);
    expect(requirements.map((r) => r.key)).toEqual(["c1", "g"]);
    const own = at(requirements, 0);
    expect(at(own.variants, 0).id).toBe("upright-long|strip|split1|separate");
    expect(at(own.variants, 0).parts.map((p) => p.trayKey)).toEqual(["c1:p0:0", "c1:p1:0"]);
    expect(at(requirements, 1).componentIds).toEqual(["b1"]);
  });

  it("skips invalid components with a notice and keeps the rest", () => {
    const { requirements, notices } = size([cards({ decks: [] }), bulk()], s);
    expect(notices.map((n) => [n.code, n.path])).toEqual([["sizing.empty", "/components/0/decks"]]);
    expect(requirements.map((r) => r.key)).toEqual(["b1"]);
  });

  it("treats an invalid player count as no perPlayer, with a notice", () => {
    const { requirements, notices } = size([bulk({ perPlayer: { players: 0 } })], s);
    expect(notices.map((n) => n.path)).toEqual(["/components/0/perPlayer/players"]);
    expect(at(at(requirements, 0).variants, 0).id).toBe("shallow|strip|split1");
  });

  it("keeps first-appearance order and treats an empty groupId as none", () => {
    const { requirements } = size(
      [bulk(), cards({ groupId: "" }), tiles({ groupId: "g" }), minis({ groupId: "g" })],
      s,
    );
    expect(requirements.map((r) => r.key)).toEqual(["b1", "c1", "g"]);
    expect(at(requirements, 2).loose).toBe(true);
  });

  it("is deterministic", () => {
    const components = [cards({ storage: "auto" }), bulk(), tiles({ storage: "auto" }), custom()];
    expect(size(components, s)).toEqual(size(components, s));
  });
});

describe("mostFrequentAccess", () => {
  it("picks the most frequently accessed member", () => {
    expect(mostFrequentAccess([cards({ access: "setup" }), bulk({ access: "sometimes" })])).toBe(
      "sometimes",
    );
    expect(mostFrequentAccess([cards({ access: "setup" })])).toBe("setup");
  });
});

describe("combineOptions", () => {
  it("pairs each member's option s, reusing a member's last option when it has fewer", () => {
    const combined = combineOptions([
      [
        { id: "a", blocks: [] },
        { id: "b", blocks: [] },
        { id: "c", blocks: [] },
      ],
      [{ id: "x", blocks: [] }],
    ]);
    expect(combined.map((o) => o.id)).toEqual(["a+x", "b+x", "c+x"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sizing/group.test.ts`
Expected: FAIL with "Failed to resolve import "./group"".

- [ ] **Step 3: Write the implementation**

`apps/insert-generator/src/sizing/group.ts`:

```ts
import type { Access, Component, Notice, Settings } from "../model/types";
import { displayName, invalid, isCount, type StorageOption } from "./common";
import { componentOptions, isLoose } from "./component";
import type { TrayRequirement } from "./types";
import { buildVariants } from "./variants";

const ACCESS_RANK: Record<Access, number> = { often: 0, sometimes: 1, setup: 2 };

interface Member {
  c: Component;
  index: number;
}

interface Usable {
  member: Member;
  options: StorageOption[];
}

export function mostFrequentAccess(members: readonly Component[]): Access {
  let best: Access = "setup";
  for (const c of members) {
    if (ACCESS_RANK[c.access] < ACCESS_RANK[best]) {
      best = c.access;
    }
  }
  return best;
}

export function combineOptions(lists: readonly StorageOption[][]): StorageOption[] {
  const count = Math.max(0, ...lists.map((list) => list.length));
  return Array.from({ length: count }, (_, s) => {
    const picked = lists.flatMap((list) => {
      const option = list[Math.min(s, list.length - 1)];
      return option === undefined ? [] : [option];
    });
    return { id: picked.map((o) => o.id).join("+"), blocks: picked.flatMap((o) => o.blocks) };
  });
}

function playersOf(usable: readonly Usable[], notices: Notice[]): number | null {
  const only = usable.length === 1 ? usable[0] : undefined;
  const perPlayer = only?.member.c.perPlayer;
  if (only === undefined || perPlayer === undefined) {
    return null;
  }
  if (!isCount(perPlayer.players)) {
    notices.push(invalid(only.member.index, only.member.c, "perPlayer/players"));
    return null;
  }
  return perPlayer.players;
}

export function size(
  components: Component[],
  settings: Settings,
): { requirements: TrayRequirement[]; notices: Notice[] } {
  const notices: Notice[] = [];
  const buckets = new Map<string, Member[]>();
  components.forEach((c, index) => {
    let groupId = c.groupId !== undefined && c.groupId !== "" ? c.groupId : undefined;
    if (groupId !== undefined && c.perPlayer !== undefined) {
      notices.push({
        level: "warning",
        code: "sizing.perPlayerInGroup",
        message: `${displayName(c)}: per-player counts can't be used inside a group, so it gets its own tray.`,
        path: `/components/${index}/groupId`,
      });
      groupId = undefined;
    }
    const key = groupId ?? c.id;
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [{ c, index }]);
    } else {
      bucket.push({ c, index });
    }
  });

  const requirements: TrayRequirement[] = [];
  for (const [key, members] of buckets) {
    const usable: Usable[] = [];
    for (const member of members) {
      const result = componentOptions(member.c, settings, member.index);
      notices.push(...result.notices);
      if (result.options.length > 0) {
        usable.push({ member, options: result.options });
      }
    }
    if (usable.length === 0) {
      continue;
    }
    const players = playersOf(usable, notices);
    requirements.push({
      key,
      componentIds: usable.map((u) => u.member.c.id),
      access: mostFrequentAccess(usable.map((u) => u.member.c)),
      loose: usable.some((u) => isLoose(u.member.c)),
      variants: buildVariants({
        key,
        options: combineOptions(usable.map((u) => u.options)),
        players,
      }),
    });
  }
  return { requirements, notices };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sizing/group.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/group.ts src/sizing/group.test.ts
git commit -m "Add size() with groups and per-player variants"
```

---

### Task 10: `minOuter`

**Files:**

- Create: `apps/insert-generator/src/sizing/outer.ts`
- Modify: `apps/insert-generator/src/sizing/test-helpers.ts` (add `partOf`)
- Test: `apps/insert-generator/src/sizing/outer.test.ts`

**Interfaces:**

- Consumes: `size` (Task 9), units and constants (Task 1).
- Produces:
  - `wallFor(settings: Settings, lipped: boolean): number` — `max(wall, 0.8)`, or `max(that, lip.thickness + lip.ledge)` when `lipped && settings.lip.enabled`.
  - `rowsOf<T>(arrangement: TrayPartReq["arrangement"], items: readonly T[]): T[][]` — strip: one row; rows2: first `ceil(n/2)`, then the rest; empty rows dropped.
  - `interface MinLayout { wall; divider; floor; innerW; innerD; w; d; h }` — all integer 0.01 mm units.
  - `minLayoutU(part: TrayPartReq, settings: Settings, opts: RealizeOptions): MinLayout` — throws `RangeError` for a part without compartments.
  - `minOuter(part: TrayPartReq, settings: Settings, opts: RealizeOptions): OuterSize` (roadmap §4.2).
  - test helper `partOf(components: Component[], variantId: string, settings?: Settings, partIndex?: number): TrayPartReq`.

Formulas (units, each min rounded up with `ceilU`): `wall = toU(wallFor)`, `divider = toU(max(divider, 0.8))`, `floor = toU(max(floor, 0.8))`. Row width = Σ minW + (n − 1)·divider; row depth = max minD. `innerW = max(max row width, pocketWidth if any front/back finger pocket)`; `innerD = max(Σ row depths + (rows − 1)·divider, pocketWidth if any left/right finger pocket)`. `w = innerW + 2·wall`, `d = innerD + 2·wall`, `h = floor + max minH`; for `level > 0` with the lip enabled `h = max(h, lip.height + 3)`.

- [ ] **Step 1: Add the `partOf` test helper**

In `apps/insert-generator/src/sizing/test-helpers.ts`, replace the import block at the top with:

```ts
// Test-only builders. Production code never imports this file.
import { DEFAULT_SETTINGS } from "../model/settings";
import type {
  BulkComponent,
  CardsComponent,
  Component,
  CustomComponent,
  MinisComponent,
  Settings,
  TilesComponent,
} from "../model/types";
import { size } from "./group";
import type { TrayPartReq } from "./types";
```

and append at the end of the file:

```ts
/** The part `partIndex` of variant `variantId` of the first requirement of `size(components)`. */
export function partOf(
  components: Component[],
  variantId: string,
  settings: Settings = DEFAULT_SETTINGS,
  partIndex = 0,
): TrayPartReq {
  const req = at(size(components, settings).requirements, 0);
  const variant = req.variants.find((v) => v.id === variantId);
  if (variant === undefined) {
    throw new Error(`no variant ${variantId}; have ${req.variants.map((v) => v.id).join(", ")}`);
  }
  return at(variant.parts, partIndex);
}
```

- [ ] **Step 2: Write the failing test**

`apps/insert-generator/src/sizing/outer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { minOuter, rowsOf, wallFor } from "./outer";
import { cards, custom, partOf } from "./test-helpers";
import type { RealizeOptions, TrayPartReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const ground: RealizeOptions = { lipped: false, level: 0 };
const single = partOf([cards()], "upright-long|strip|split1");
const twoDecks = [
  cards({
    decks: [
      { name: "A", count: 52 },
      { name: "B", count: 30 },
    ],
  }),
];

describe("wallFor", () => {
  it("is the wall, or max(wall, lip.thickness + lip.ledge) on a lipped tray", () => {
    expect(wallFor(s, false)).toBe(1.6);
    expect(wallFor(s, true)).toBeCloseTo(2.9, 9);
    expect(wallFor({ ...s, lip: { ...s.lip, enabled: false } }, true)).toBe(1.6);
    expect(wallFor({ ...s, wall: 3.5 }, true)).toBe(3.5);
    expect(wallFor({ ...s, wall: 0.5 }, false)).toBe(0.8);
  });
});

describe("rowsOf", () => {
  it("keeps a strip as one row and splits rows2 after the first half", () => {
    expect(rowsOf("strip", [1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(rowsOf("rows2", [1, 2, 3])).toEqual([[1, 2], [3]]);
    expect(rowsOf("rows2", [1])).toEqual([[1]]);
  });
});

describe("minOuter", () => {
  it("adds walls and floor around one upright deck", () => {
    // inner 23.50 × 116.50, content 68 → 26.7 × 119.7 × 69.2
    expect(minOuter(single, s, ground)).toEqual({ w: 26.7, d: 119.7, h: 69.2 });
  });

  it("uses the lipped wall on a tray that carries a lip", () => {
    expect(minOuter(single, s, { lipped: true, level: 0 })).toEqual({ w: 29.3, d: 122.3, h: 69.2 });
  });

  it("puts dividers between decks in a strip and between rows in rows2", () => {
    // 23.50 + 1.2 + 13.98 = 38.68 inner
    expect(minOuter(partOf(twoDecks, "upright-long|strip|split1"), s, ground)).toEqual({
      w: 41.88,
      d: 119.7,
      h: 69.2,
    });
    // rows: 116.5 + 1.2 + 116.5 = 234.2 inner
    expect(minOuter(partOf(twoDecks, "upright-long|rows2|split1"), s, ground)).toEqual({
      w: 26.7,
      d: 237.4,
      h: 69.2,
    });
  });

  it("widens the inner span to a full finger pocket for a one-card deck", () => {
    const solo = partOf(
      [cards({ sleeve: "none", decks: [{ name: "Solo", count: 1 }] })],
      "upright-long|strip|split1",
    );
    expect(minOuter(solo, s, ground)).toEqual({ w: 25.2, d: 116.7, h: 66.2 });
  });

  it("gives sleeved Tarot cards a low flat tray next to the tall upright one", () => {
    const tarot = [
      cards({
        shortSide: 70,
        longSide: 120,
        storage: "auto",
        decks: [{ name: "Tarot", count: 80 }],
      }),
    ];
    expect(minOuter(partOf(tarot, "upright-long|strip|split1"), s, ground)).toEqual({
      w: 38.81,
      d: 151.7,
      h: 75.7,
    });
    expect(minOuter(partOf(tarot, "flat|strip|split1"), s, ground)).toEqual({
      w: 77.7,
      d: 151.7,
      h: 36.81,
    });
  });

  it("makes upper trays at least lip.height + 3 tall", () => {
    const thin = partOf([custom({ h: 1, count: 1 })], "custom|strip|split1");
    expect(minOuter(thin, s, ground).h).toBe(3.2);
    expect(minOuter(thin, s, { lipped: false, level: 1 }).h).toBe(5);
    expect(
      minOuter(thin, { ...s, lip: { ...s.lip, enabled: false } }, { lipped: false, level: 1 }).h,
    ).toBe(3.2);
  });

  it("never goes below the 0.8 mm minimum feature", () => {
    const flimsy = { ...s, wall: 0.5, divider: 0.3, floor: 0.4 };
    expect(minOuter(single, flimsy, ground)).toEqual({ w: 25.1, d: 118.1, h: 68.8 });
  });

  it("rejects a part without compartments", () => {
    const empty: TrayPartReq = {
      trayKey: "x:p0:0",
      arrangement: "strip",
      compartments: [],
      rotatable: true,
    };
    expect(() => minOuter(empty, s, ground)).toThrow(RangeError);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/sizing/outer.test.ts`
Expected: FAIL with "Failed to resolve import "./outer"".

- [ ] **Step 4: Write the implementation**

`apps/insert-generator/src/sizing/outer.ts`:

```ts
import type { Settings, Side } from "../model/types";
import { MIN_FEATURE, UPPER_TRAY_MIN_ABOVE_LIP } from "./constants";
import type { OuterSize, RealizeOptions, TrayPartReq } from "./types";
import { ceilU, fromU, maxOf, sum, toU } from "./units";

/** Outer wall thickness: lipped walls are max(wall, lip.thickness + lip.ledge) (spec §6.1). */
export function wallFor(settings: Settings, lipped: boolean): number {
  const base = Math.max(settings.wall, MIN_FEATURE);
  if (!lipped || !settings.lip.enabled) {
    return base;
  }
  return Math.max(base, settings.lip.thickness + settings.lip.ledge);
}

/** strip → one row; rows2 → first ceil(n/2) items, then the rest. Empty rows are dropped. */
export function rowsOf<T>(arrangement: TrayPartReq["arrangement"], items: readonly T[]): T[][] {
  if (arrangement === "strip") {
    return [items.slice()];
  }
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)].filter((row) => row.length > 0);
}

/** Minimum layout in integer 0.01 mm units. */
export interface MinLayout {
  wall: number;
  divider: number;
  floor: number;
  innerW: number;
  innerD: number;
  w: number;
  d: number;
  h: number;
}

function hasPocketOn(part: TrayPartReq, sides: readonly Side[]): boolean {
  return part.compartments.some((c) =>
    c.features.some(
      (f) => f.type === "fingerPocket" && f.side !== undefined && sides.includes(f.side),
    ),
  );
}

export function minLayoutU(part: TrayPartReq, settings: Settings, opts: RealizeOptions): MinLayout {
  if (part.compartments.length === 0) {
    throw new RangeError(`Tray part ${part.trayKey} has no compartments`);
  }
  const wall = toU(wallFor(settings, opts.lipped));
  const divider = toU(Math.max(settings.divider, MIN_FEATURE));
  const floor = toU(Math.max(settings.floor, MIN_FEATURE));
  const pocketWidth = toU(settings.fingerPocket.width);
  const rows = rowsOf(part.arrangement, part.compartments);
  const rowWidths = rows.map(
    (row) => sum(row.map((c) => ceilU(c.minW))) + (row.length - 1) * divider,
  );
  const rowDepths = rows.map((row) => maxOf(row.map((c) => ceilU(c.minD))));
  const innerW = Math.max(maxOf(rowWidths), hasPocketOn(part, ["front", "back"]) ? pocketWidth : 0);
  const innerD = Math.max(
    sum(rowDepths) + (rows.length - 1) * divider,
    hasPocketOn(part, ["left", "right"]) ? pocketWidth : 0,
  );
  const content = floor + maxOf(part.compartments.map((c) => ceilU(c.minH)));
  const h =
    opts.level > 0 && settings.lip.enabled
      ? Math.max(content, toU(settings.lip.height + UPPER_TRAY_MIN_ABOVE_LIP))
      : content;
  return { wall, divider, floor, innerW, innerD, w: innerW + 2 * wall, d: innerD + 2 * wall, h };
}

/** Smallest outer box (tray's own frame, lip excluded) that holds the part (roadmap §4.2). */
export function minOuter(part: TrayPartReq, settings: Settings, opts: RealizeOptions): OuterSize {
  const m = minLayoutU(part, settings, opts);
  return { w: fromU(m.w), d: fromU(m.d), h: fromU(m.h) };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/sizing/outer.test.ts`
Expected: PASS.

- [ ] **Step 6: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/sizing/outer.ts src/sizing/outer.test.ts src/sizing/test-helpers.ts
git commit -m "Add minOuter"
```

---

### Task 11: `realizeTray`

**Files:**

- Create: `apps/insert-generator/src/sizing/realize.ts`
- Test: `apps/insert-generator/src/sizing/realize.test.ts`

**Interfaces:**

- Consumes: `minLayoutU`, `rowsOf`, `minOuter` (Task 10); units and constants (Task 1); `partOf` and builders (test helpers).
- Produces: `realizeTray(part: TrayPartReq, outer: OuterSize, settings: Settings, opts: RealizeOptions): RealizedTray` (roadmap §4.2), with the slack rules, compartment order, `at` semantics and spacer rule from "Design decisions". Throws `RangeError` when `outer` is below `minOuter` on any axis (compared in whole 0.01 mm units).

Worked example used by the tests (one upright deck, defaults, `minOuter` 26.7 × 119.7 × 69.2): the compartment rectangle is at x 1.6, y 1.6 (walls), 23.5 × 116.5 (it includes the two 12 mm finger-reach bands, so the well proper is y 13.6 … 106.1, 92.5 deep), floorZ 1.2. Both pockets: `at` = 1.6 + 23.5/2 = 13.35, width 22, depth 68/3 = 22.67. With 30 mm more width the deck's well grows to 53.5 and a 30 mm spacer sits at its +X end (x 25.1, height 68 − 5 = 63). With 20 mm more depth both walls thicken by 1.6 (cap `min(2 · 1.6, 4)` = 3.2) and the remaining 16.8 mm becomes a spare row (16.8 − 1.2 divider = 15.6 deep, at y 119.7 + 1.2 = 120.9).

- [ ] **Step 1: Write the failing test**

`apps/insert-generator/src/sizing/realize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { minOuter } from "./outer";
import { realizeTray } from "./realize";
import { at, bulk, cards, custom, minis, partOf } from "./test-helpers";
import type { RealizeOptions } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const ground: RealizeOptions = { lipped: false, level: 0 };
const single = partOf([cards()], "upright-long|strip|split1");
const pocket = (side: "front" | "back", atMm: number, depth: number) => ({
  type: "fingerPocket",
  side,
  at: atMm,
  width: 22,
  reach: 12,
  depth,
});

describe("realizeTray", () => {
  it("places one upright deck at minOuter with ⅓-depth pockets front and back", () => {
    const r = realizeTray(single, { w: 26.7, d: 119.7, h: 69.2 }, s, ground);
    expect(r.wall).toBe(1.6);
    expect(r.spacers).toEqual([]);
    expect(r.compartments).toEqual([
      {
        x: 1.6,
        y: 1.6,
        w: 23.5,
        d: 116.5,
        floorZ: 1.2,
        kind: "well",
        contents: "Main ×52",
        features: [pocket("front", 13.35, 22.67), pocket("back", 13.35, 22.67)],
      },
    ]);
  });

  it("turns spare stack length into one removable spacer", () => {
    const r = realizeTray(single, { w: 56.7, d: 119.7, h: 69.2 }, s, ground);
    expect(r.compartments).toHaveLength(1);
    const well = at(r.compartments, 0);
    expect(well).toMatchObject({ x: 1.6, y: 1.6, w: 53.5, d: 116.5, floorZ: 1.2 });
    expect(at(well.features, 0)).toMatchObject({ at: 13.35, width: 22 });
    expect(r.spacers).toEqual([
      {
        key: "c1:p0:0:spacer",
        part: "spacer",
        path: "",
        stack: 0,
        level: 0,
        x: 25.1,
        y: 13.6,
        z: 1.2,
        w: 30,
        d: 92.5,
        h: 63,
        rotated: false,
        wall: 0,
        floor: 0,
        lip: false,
        solid: true,
        compartments: [],
      },
    ]);
  });

  it("thickens walls first, then adds a spare row for depth slack", () => {
    const r = realizeTray(single, { w: 26.7, d: 139.7, h: 69.2 }, s, ground);
    expect(r.compartments).toHaveLength(2);
    expect(at(r.compartments, 0)).toMatchObject({ x: 1.6, y: 3.2, w: 23.5, d: 116.5 });
    expect(at(r.compartments, 1)).toEqual({
      x: 1.6,
      y: 120.9,
      w: 23.5,
      d: 15.6,
      floorZ: 1.2,
      kind: "spare",
      contents: "spare",
      features: [],
    });
  });

  it("keeps one spacer per tray; another row's slack becomes thicker walls and a spare", () => {
    const part = partOf(
      [
        cards({
          decks: [
            { name: "A", count: 52 },
            { name: "B", count: 30 },
          ],
        }),
      ],
      "upright-long|rows2|split1",
    );
    expect(minOuter(part, s, ground)).toEqual({ w: 26.7, d: 237.4, h: 69.2 });
    const r = realizeTray(part, { w: 36.7, d: 237.4, h: 69.2 }, s, ground);
    expect(r.compartments.map((c) => [c.contents, c.x, c.y, c.w, c.d])).toEqual([
      ["A ×52", 1.6, 1.6, 33.5, 116.5],
      ["B ×30", 3.2, 119.3, 13.98, 116.5],
      ["spare", 18.38, 119.3, 15.12, 116.5],
    ]);
    expect(r.spacers).toHaveLength(1);
    expect(at(r.spacers, 0)).toMatchObject({ x: 25.1, y: 13.6, w: 10, d: 92.5, h: 63 });
  });

  it("gives a one-card deck a full-width finger pocket and a spacer", () => {
    const part = partOf(
      [cards({ sleeve: "none", decks: [{ name: "Solo", count: 1 }] })],
      "upright-long|strip|split1",
    );
    const r = realizeTray(part, minOuter(part, s, ground), s, ground);
    const well = at(r.compartments, 0);
    expect(well).toMatchObject({ x: 1.6, y: 1.6, w: 22, d: 113.5, floorZ: 1.2 });
    expect(at(well.features, 0)).toMatchObject({ at: 12.6, width: 22 });
    expect(r.spacers).toHaveLength(1);
    expect(at(r.spacers, 0)).toMatchObject({ x: 2.93, w: 20.67, d: 89.5, h: 60 });
  });

  it("raises the floor of shallow contents to the rim in a group", () => {
    const part = partOf(
      [cards({ groupId: "g" }), custom({ groupId: "g", count: 1 })],
      "upright-long+custom|strip|split1",
    );
    expect(part.trayKey).toBe("g:p0:0");
    const outer = minOuter(part, s, ground);
    expect(outer).toEqual({ w: 68.9, d: 119.7, h: 69.2 });
    const r = realizeTray(part, outer, s, ground);
    expect(at(r.compartments, 0).floorZ).toBe(1.2);
    expect(at(r.compartments, 1)).toEqual({
      x: 26.3,
      y: 38.35,
      w: 41,
      d: 43,
      floorZ: 58.2,
      kind: "well",
      contents: "Dial",
      features: [
        { type: "fingerPocket", side: "front", at: 46.8, width: 22, reach: 12, depth: 11 },
        { type: "cornerRelief", d: 3 },
      ],
    });
  });

  describe("bulk", () => {
    const part = partOf(
      [
        bulk({
          items: [
            { name: "Cubes", count: 30, w: 10, d: 10, h: 10 },
            { name: "Coins", volumeMl: 50 },
          ],
        }),
      ],
      "shallow|strip|split1",
    );

    it("starts from √(V/20)-wide shallow compartments", () => {
      // 54.78 + 1.2 + 50 inner → 109.18; depth 54.78 → 57.98; 1.2 + 20 → 21.2
      expect(minOuter(part, s, ground)).toEqual({ w: 109.18, d: 57.98, h: 21.2 });
    });

    it("shares width slack between bulk compartments and grows them to full depth", () => {
      const r = realizeTray(part, { w: 119.18, d: 57.98, h: 40 }, s, ground);
      expect(r.compartments).toEqual([
        {
          x: 1.6,
          y: 1.6,
          w: 59.78,
          d: 54.78,
          floorZ: 1.2,
          kind: "scoop",
          contents: "Cubes ×30",
          features: [{ type: "scoop", side: "front", r: 12 }],
        },
        {
          x: 62.58,
          y: 1.6,
          w: 55,
          d: 54.78,
          floorZ: 1.2,
          kind: "scoop",
          contents: "Coins 50 ml",
          features: [{ type: "scoop", side: "front", r: 12 }],
        },
      ]);
    });

    it("caps the depth at 1.5 × the smaller side by raising the floor", () => {
      const r = realizeTray(part, { w: 119.18, d: 57.98, h: 100 }, s, ground);
      // depth = floor(1.5 × 54.78) = 82.17 → floorZ = 100 − 82.17
      expect(r.compartments.map((c) => c.floorZ)).toEqual([17.83, 17.83]);
    });

    it("sizes the scoop as min(scoopRadius, depth, width / 2)", () => {
      const r = realizeTray(
        part,
        { w: 119.18, d: 57.98, h: 40 },
        { ...s, scoopRadius: 50 },
        ground,
      );
      expect(r.compartments.map((c) => c.features)).toEqual([
        [{ type: "scoop", side: "front", r: 29.89 }],
        [{ type: "scoop", side: "front", r: 27.5 }],
      ]);
    });
  });

  it("puts one ⅓-depth finger pocket in front of each mini pocket", () => {
    const part = partOf([minis()], "standing|strip|split1");
    const outer = minOuter(part, s, ground);
    expect(outer).toEqual({ w: 56.4, d: 41.2, h: 42.2 });
    const r = realizeTray(part, outer, s, ground);
    expect(r.compartments.map((c) => [c.contents, c.kind, c.x, c.y, c.w, c.d, c.floorZ])).toEqual([
      ["Hero 1/2", "pocket", 1.6, 1.6, 26, 38, 1.2],
      ["Hero 2/2", "pocket", 28.8, 1.6, 26, 38, 1.2],
    ]);
    expect(r.compartments.map((c) => c.features)).toEqual([
      [{ type: "fingerPocket", side: "front", at: 14.6, width: 22, reach: 12, depth: 13.67 }],
      [{ type: "fingerPocket", side: "front", at: 41.8, width: 22, reach: 12, depth: 13.67 }],
    ]);
  });

  it("realizes 2000 tiny cubes", () => {
    const grains = [bulk({ items: [{ name: "Grains", count: 2000, w: 3, d: 3, h: 3 }] })];
    const shallow = partOf(grains, "shallow|strip|split1");
    const deep = partOf(grains, "deep|strip|split1");
    expect(minOuter(shallow, s, ground)).toEqual({ w: 76.69, d: 76.69, h: 21.2 });
    expect(minOuter(deep, s, ground)).toEqual({ w: 44.81, d: 44.81, h: 63.61 });
    for (const part of [shallow, deep]) {
      const outer = minOuter(part, s, ground);
      const c = at(realizeTray(part, outer, s, ground).compartments, 0);
      expect(c.w * c.d * (outer.h - c.floorZ)).toBeGreaterThanOrEqual(108000);
    }
  });

  it("uses the lipped wall when the tray carries a lip", () => {
    const lipped: RealizeOptions = { lipped: true, level: 0 };
    const r = realizeTray(single, minOuter(single, s, lipped), s, lipped);
    expect(r.wall).toBe(1.6);
    expect(at(r.compartments, 0)).toMatchObject({ x: 2.9, y: 2.9, w: 23.5, d: 116.5 });
    expect(at(at(r.compartments, 0).features, 0)).toMatchObject({ at: 14.65 });
  });

  it("throws RangeError when the outer is below minOuter", () => {
    expect(() => realizeTray(single, { w: 26.69, d: 119.7, h: 69.2 }, s, ground)).toThrow(
      RangeError,
    );
    expect(() => realizeTray(single, { w: 26.7, d: 119.69, h: 69.2 }, s, ground)).toThrow(
      RangeError,
    );
    expect(() => realizeTray(single, { w: 26.7, d: 119.7, h: 69.19 }, s, ground)).toThrow(
      RangeError,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sizing/realize.test.ts`
Expected: FAIL with "Failed to resolve import "./realize"".

- [ ] **Step 3: Write the implementation**

`apps/insert-generator/src/sizing/realize.ts`:

```ts
import type { CompartmentSpec, FeatureSpec, Settings, Side, TraySpec } from "../model/types";
import {
  CORNER_RELIEF_D,
  MIN_FEATURE,
  MIN_SPACER,
  MIN_SPARE,
  SPACER_TOP_GAP,
  WALL_GROW_LIMIT,
} from "./constants";
import { minLayoutU, rowsOf } from "./outer";
import type { CompartmentReq, OuterSize, RealizeOptions, RealizedTray, TrayPartReq } from "./types";
import { ceilU, fillCapped, fromU, maxOf, round2, splitEven, sum, toU } from "./units";

// Everything below is in integer 0.01 mm units until converted with fromU.

interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

interface Placed {
  req: CompartmentReq;
  alloc: Rect; // the CompartmentSpec rectangle: well + solid finger-reach bands (roadmap §4.6)
  spacer: number; // spacer length at the well's +X end, 0 = none
}

interface FeatureContext {
  W: number;
  D: number;
  wall: number;
  settings: Settings;
}

function lastIndex<T>(items: readonly T[], test: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item !== undefined && test(item)) {
      return i;
    }
  }
  return -1;
}

function pocketSides(req: CompartmentReq): Side[] {
  return req.features.flatMap((f) =>
    f.type === "fingerPocket" && f.side !== undefined ? [f.side] : [],
  );
}

/** The well proper (contents): the allocation minus the finger-reach band on each pocket side. */
function wellOf(alloc: Rect, req: CompartmentReq, reach: number): Rect {
  const sides = pocketSides(req);
  const cut = (side: Side): number => (sides.includes(side) ? reach : 0);
  return {
    x: alloc.x + cut("left"),
    y: alloc.y + cut("front"),
    w: alloc.w - cut("left") - cut("right"),
    d: alloc.d - cut("front") - cut("back"),
  };
}

/** Content depth: fixed for non-elastic contents (raised floor); bulk grows up to maxHRatio. */
function contentDepth(req: CompartmentReq, well: Rect, H: number, floor: number): number {
  const need = ceilU(req.minH);
  if (!req.elastic.h) {
    return need;
  }
  const cap =
    req.maxHRatio === undefined ? H - floor : Math.floor(req.maxHRatio * Math.min(well.w, well.d));
  return Math.max(need, Math.min(H - floor, cap));
}

function featureSpecs(
  req: CompartmentReq,
  content: Rect,
  depth: number,
  ctx: FeatureContext,
): FeatureSpec[] {
  return req.features.map((f): FeatureSpec => {
    if (f.type === "cornerRelief") {
      return { type: "cornerRelief", d: CORNER_RELIEF_D };
    }
    const side = f.side ?? "front";
    if (f.type === "scoop") {
      const r = Math.min(ctx.settings.scoopRadius, fromU(depth), fromU(content.w) / 2);
      return { type: "scoop", side, r: round2(r) };
    }
    const alongX = side === "front" || side === "back";
    const lo = ctx.wall;
    const hi = (alongX ? ctx.W : ctx.D) - ctx.wall;
    const width = Math.min(toU(ctx.settings.fingerPocket.width), hi - lo);
    const centre = alongX ? content.x + content.w / 2 : content.y + content.d / 2;
    const at = Math.min(Math.max(centre, lo + width / 2), hi - width / 2);
    return {
      type: "fingerPocket",
      side,
      at: round2(fromU(at)),
      width: fromU(width),
      reach: ctx.settings.fingerPocket.reach,
      depth: fromU(Math.round(depth * (f.depthFraction ?? 1))),
    };
  });
}

function spacerSpec(
  trayKey: string,
  well: Rect,
  length: number,
  floorZ: number,
  depth: number,
): TraySpec {
  return {
    key: `${trayKey}:spacer`,
    part: "spacer",
    path: "",
    stack: 0,
    level: 0,
    x: fromU(well.x + well.w - length),
    y: fromU(well.y),
    z: fromU(floorZ),
    w: fromU(length),
    d: fromU(well.d),
    h: fromU(depth - toU(SPACER_TOP_GAP)),
    rotated: false,
    wall: 0,
    floor: 0,
    lip: false,
    solid: true,
    compartments: [],
  };
}

function rectSpec(r: Rect): Pick<CompartmentSpec, "x" | "y" | "w" | "d"> {
  return { x: fromU(r.x), y: fromU(r.y), w: fromU(r.w), d: fromU(r.d) };
}

export function realizeTray(
  part: TrayPartReq,
  outer: OuterSize,
  settings: Settings,
  opts: RealizeOptions,
): RealizedTray {
  const min = minLayoutU(part, settings, opts);
  const W = toU(outer.w);
  const D = toU(outer.d);
  const H = toU(outer.h);
  if (W < min.w || D < min.d || H < min.h) {
    throw new RangeError(
      `Tray ${part.trayKey}: outer ${outer.w}×${outer.d}×${outer.h} mm is smaller than its minimum ${fromU(min.w)}×${fromU(min.d)}×${fromU(min.h)} mm`,
    );
  }
  const { wall, divider, floor } = min;
  const wallRoom = Math.max(0, toU(Math.min(2 * settings.wall, WALL_GROW_LIMIT)) - wall);
  const dividerRoom = Math.max(0, toU(Math.min(2 * settings.divider, WALL_GROW_LIMIT)) - divider);
  const spareMin = toU(MIN_SPARE) + divider;
  const innerW = W - 2 * wall;
  const innerD = D - 2 * wall;
  const rows = rowsOf(part.arrangement, part.compartments);

  // Y: elastic rows → thicker walls/dividers → a spare row at the back → the rest to the walls.
  const rowDepths = rows.map((row) => maxOf(row.map((c) => ceilU(c.minD))));
  let slackY = innerD - sum(rowDepths) - (rows.length - 1) * divider;
  const elasticRows = rows.flatMap((row, i) => (row.some((c) => c.elastic.d) ? [i] : []));
  if (elasticRows.length > 0) {
    const shares = splitEven(slackY, elasticRows.length);
    elasticRows.forEach((r, i) => {
      rowDepths[r] = (rowDepths[r] ?? 0) + (shares[i] ?? 0);
    });
    slackY = 0;
  }
  const yExtra = fillCapped(slackY, [wallRoom, ...rows.slice(1).map(() => dividerRoom), wallRoom]);
  slackY -= sum(yExtra);
  let spareRowDepth = 0;
  if (slackY >= spareMin) {
    spareRowDepth = slackY - divider;
    slackY = 0;
  }
  const rowYs: number[] = [];
  let y = wall + (yExtra[0] ?? 0) + Math.floor(slackY / 2);
  rows.forEach((_, i) => {
    rowYs.push(y);
    y += rowDepths[i] ?? 0;
    if (i < rows.length - 1) {
      y += divider + (yExtra[i + 1] ?? 0);
    }
  });
  const rowsEnd = y;

  // X, per row: elastic bulk → else one card/tile spacer per tray → thicker walls/dividers →
  // a spare compartment at the row end → the rest to the side walls.
  const placed: Placed[] = [];
  const spares: Rect[] = [];
  let spacerUsed = false;
  rows.forEach((row, r) => {
    const rowY = rowYs[r] ?? wall;
    const rowDepth = rowDepths[r] ?? 0;
    const widths = row.map((c) => ceilU(c.minW));
    const growth = row.map(() => 0);
    let slack = innerW - sum(widths) - (row.length - 1) * divider;
    let spacerAt = -1;
    const elastic = row.flatMap((c, i) => (c.elastic.w && c.spacerAxis !== "w" ? [i] : []));
    if (elastic.length > 0) {
      const shares = splitEven(slack, elastic.length);
      elastic.forEach((i, k) => {
        growth[i] = shares[k] ?? 0;
      });
      slack = 0;
    } else {
      const candidate = lastIndex(row, (c) => c.spacerAxis === "w");
      const req = row[candidate];
      if (
        !spacerUsed &&
        req !== undefined &&
        slack >= toU(MIN_SPACER) &&
        ceilU(req.minH) - toU(SPACER_TOP_GAP) >= toU(MIN_SPACER)
      ) {
        growth[candidate] = slack;
        spacerAt = candidate;
        spacerUsed = true;
        slack = 0;
      }
    }
    const xExtra = fillCapped(slack, [wallRoom, ...row.slice(1).map(() => dividerRoom), wallRoom]);
    slack -= sum(xExtra);
    let spareW = 0;
    if (slack >= spareMin) {
      spareW = slack - divider;
      slack = 0;
    }
    let x = wall + (xExtra[0] ?? 0) + Math.floor(slack / 2);
    row.forEach((req, i) => {
      const w = (widths[i] ?? 0) + (growth[i] ?? 0);
      const d = req.elastic.d ? rowDepth : ceilU(req.minD);
      const top = req.elastic.d ? rowY : rowY + Math.floor((rowDepth - d) / 2);
      placed.push({
        req,
        alloc: { x, y: top, w, d },
        spacer: i === spacerAt ? (growth[i] ?? 0) : 0,
      });
      x += w;
      if (i < row.length - 1) {
        x += divider + (xExtra[i + 1] ?? 0);
      }
    });
    if (spareW > 0) {
      spares.push({ x: x + divider, y: rowY, w: spareW, d: rowDepth });
    }
  });
  if (spareRowDepth > 0) {
    spares.push({ x: wall, y: rowsEnd + divider, w: innerW, d: spareRowDepth });
  }

  const ctx: FeatureContext = { W, D, wall, settings };
  const reach = toU(settings.fingerPocket.reach);
  const spacers: TraySpec[] = [];
  const compartments: CompartmentSpec[] = placed.map(({ req, alloc, spacer }) => {
    const well = wellOf(alloc, req, reach);
    const depth = contentDepth(req, well, H, floor);
    const floorZ = H - depth;
    if (spacer > 0) {
      spacers.push(spacerSpec(part.trayKey, well, spacer, floorZ, depth));
    }
    const content: Rect = { ...well, w: well.w - spacer };
    return {
      ...rectSpec(alloc),
      floorZ: fromU(floorZ),
      kind: req.kind,
      contents: req.contents,
      features: featureSpecs(req, content, depth, ctx),
    };
  });
  for (const rect of spares) {
    compartments.push({
      ...rectSpec(rect),
      floorZ: fromU(floor),
      kind: "spare",
      contents: "spare",
      features: [],
    });
  }
  return { wall: Math.max(settings.wall, MIN_FEATURE), compartments, spacers };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sizing/realize.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/realize.ts src/sizing/realize.test.ts
git commit -m "Add realizeTray"
```

---

### Task 12: Rotation, grip check and the public index

**Files:**

- Create: `apps/insert-generator/src/sizing/rotate.ts`
- Create: `apps/insert-generator/src/sizing/grip.ts`
- Create: `apps/insert-generator/src/sizing/index.ts`
- Test: `apps/insert-generator/src/sizing/rotate.test.ts`
- Test: `apps/insert-generator/src/sizing/grip.test.ts`
- Test: `apps/insert-generator/src/sizing/index.test.ts`

**Interfaces:**

- Consumes: `realizeTray` (Task 11), `minOuter`, `wallFor` (Task 10), `size` (Task 9), `MIN_GRIP`, `round2`.
- Produces:
  - `rotateRealized(r: RealizedTray, outer: OuterSize): RealizedTray` — `outer` is the size `r` was realized at (unrotated). Result lives in the rotated outer `{ w: outer.d, d: outer.w, h: outer.h }`: 90° counter-clockwise about +Z, `(x, y, w, d) → (outer.d − y − d, x, d, w)`; sides front→right, right→back, back→left, left→front; `at` unchanged for front/back pockets, `outer.d − at` for left/right; spacers toggle `rotated`. Plan 4 calls this for placements with `rotated: true`.
  - `hasGrip(compartments: readonly CompartmentSpec[]): boolean` — spec §3 rule 8: some compartment with `min(w, d) ≥ 25` or any finger pocket.
  - `src/sizing/index.ts` exports: types from `types.ts`; `size`; `minOuter`, `wallFor`; `realizeTray`; `rotateRealized`; `hasGrip`.

- [ ] **Step 1: Write the failing tests**

`apps/insert-generator/src/sizing/rotate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { realizeTray } from "./realize";
import { rotateRealized } from "./rotate";
import { at, cards, partOf } from "./test-helpers";
import type { OuterSize, RealizedTray } from "./types";

const outer: OuterSize = { w: 56.7, d: 119.7, h: 69.2 };
const realized = realizeTray(
  partOf([cards()], "upright-long|strip|split1"),
  outer,
  DEFAULT_SETTINGS,
  { lipped: false, level: 0 },
);

describe("rotateRealized", () => {
  it("turns compartments and spacers 90° counter-clockwise into the swapped outer", () => {
    const turned = rotateRealized(realized, outer);
    expect(at(turned.compartments, 0)).toMatchObject({ x: 1.6, y: 1.6, w: 116.5, d: 53.5 });
    expect(at(turned.compartments, 0).features).toEqual([
      { type: "fingerPocket", side: "right", at: 13.35, width: 22, reach: 12, depth: 22.67 },
      { type: "fingerPocket", side: "left", at: 13.35, width: 22, reach: 12, depth: 22.67 },
    ]);
    expect(at(turned.spacers, 0)).toMatchObject({
      x: 13.6,
      y: 25.1,
      w: 92.5,
      d: 30,
      z: 1.2,
      h: 63,
      rotated: true,
    });
  });

  it("maps left/right pocket positions onto the new X axis", () => {
    const synthetic: RealizedTray = {
      wall: 1.6,
      spacers: [],
      compartments: [
        {
          x: 10,
          y: 20,
          w: 30,
          d: 40,
          floorZ: 1.2,
          kind: "well",
          contents: "x",
          features: [
            { type: "fingerPocket", side: "left", at: 30, width: 22, reach: 12, depth: 5 },
            { type: "scoop", side: "back", r: 5 },
            { type: "cornerRelief", d: 3 },
          ],
        },
      ],
    };
    expect(rotateRealized(synthetic, { w: 100, d: 80, h: 30 }).compartments).toEqual([
      {
        x: 20,
        y: 10,
        w: 40,
        d: 30,
        floorZ: 1.2,
        kind: "well",
        contents: "x",
        features: [
          { type: "fingerPocket", side: "front", at: 50, width: 22, reach: 12, depth: 5 },
          { type: "scoop", side: "left", r: 5 },
          { type: "cornerRelief", d: 3 },
        ],
      },
    ]);
  });

  it("returns to the start after four turns", () => {
    let turned = realized;
    let size = outer;
    for (let i = 0; i < 4; i++) {
      turned = rotateRealized(turned, size);
      size = { w: size.d, d: size.w, h: size.h };
    }
    expect(turned).toEqual(realized);
  });
});
```

`apps/insert-generator/src/sizing/grip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CompartmentSpec } from "../model/types";
import { hasGrip } from "./grip";

const base: CompartmentSpec = {
  x: 0,
  y: 0,
  w: 20,
  d: 30,
  floorZ: 1.2,
  kind: "well",
  contents: "x",
  features: [],
};

describe("hasGrip", () => {
  it("accepts a compartment whose smaller side is at least 25 mm", () => {
    expect(hasGrip([base, { ...base, w: 25 }])).toBe(true);
  });

  it("accepts a finger pocket", () => {
    expect(
      hasGrip([
        {
          ...base,
          features: [
            { type: "fingerPocket", side: "front", at: 10, width: 22, reach: 12, depth: 5 },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("rejects small compartments without a finger pocket", () => {
    expect(hasGrip([base, { ...base, w: 24.99, d: 80 }])).toBe(false);
    expect(hasGrip([{ ...base, features: [{ type: "cornerRelief", d: 3 }] }])).toBe(false);
    expect(hasGrip([])).toBe(false);
  });
});
```

`apps/insert-generator/src/sizing/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import * as sizing from "./index";
import { bulk, cards, custom, minis, tiles } from "./test-helpers";

describe("sizing public API", () => {
  it("exports the contract functions and helpers", () => {
    for (const fn of [
      sizing.size,
      sizing.minOuter,
      sizing.realizeTray,
      sizing.rotateRealized,
      sizing.hasGrip,
      sizing.wallFor,
    ]) {
      expect(typeof fn).toBe("function");
    }
  });

  it("sizes, measures and realizes a mixed project, every tray with a grip", () => {
    const components = [
      cards({
        storage: "auto",
        decks: [
          { name: "A", count: 60 },
          { name: "B", count: 20 },
        ],
      }),
      bulk(),
      tiles({ storage: "auto" }),
      minis(),
      custom({ groupId: "g" }),
      cards({ id: "c2", groupId: "g" }),
    ];
    const { requirements, notices } = sizing.size(components, DEFAULT_SETTINGS);
    expect(notices).toEqual([]);
    expect(requirements.map((r) => r.key)).toEqual(["c1", "b1", "t1", "m1", "g"]);
    for (const opts of [
      { lipped: false, level: 0 },
      { lipped: true, level: 1 },
    ]) {
      for (const req of requirements) {
        for (const variant of req.variants) {
          for (const part of variant.parts) {
            const outer = sizing.minOuter(part, DEFAULT_SETTINGS, opts);
            const tray = sizing.realizeTray(part, outer, DEFAULT_SETTINGS, opts);
            expect(sizing.hasGrip(tray.compartments)).toBe(true);
            expect(sizing.hasGrip(sizing.rotateRealized(tray, outer).compartments)).toBe(true);
          }
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sizing/rotate.test.ts src/sizing/grip.test.ts src/sizing/index.test.ts`
Expected: FAIL with "Failed to resolve import "./rotate"", "./grip" and "./index".

- [ ] **Step 3: Write the implementation**

`apps/insert-generator/src/sizing/rotate.ts`:

```ts
import type { CompartmentSpec, FeatureSpec, Side, TraySpec } from "../model/types";
import type { OuterSize, RealizedTray } from "./types";
import { round2 } from "./units";

const TURNED: Record<Side, Side> = { front: "right", right: "back", back: "left", left: "front" };

/**
 * Rotates a tray realized at `outer` (its own frame) by 90° counter-clockwise about +Z.
 * The result lives in the rotated outer { w: outer.d, d: outer.w, h: outer.h }.
 */
export function rotateRealized(r: RealizedTray, outer: OuterSize): RealizedTray {
  const turnRect = <T extends { x: number; y: number; w: number; d: number }>(item: T): T => ({
    ...item,
    x: round2(outer.d - item.y - item.d),
    y: item.x,
    w: item.d,
    d: item.w,
  });
  const turnFeature = (f: FeatureSpec): FeatureSpec => {
    if (f.type === "cornerRelief") {
      return f;
    }
    if (f.type === "scoop") {
      return { ...f, side: TURNED[f.side] };
    }
    const alongX = f.side === "front" || f.side === "back";
    return { ...f, side: TURNED[f.side], at: alongX ? f.at : round2(outer.d - f.at) };
  };
  return {
    wall: r.wall,
    compartments: r.compartments.map((c): CompartmentSpec => ({
      ...turnRect(c),
      features: c.features.map(turnFeature),
    })),
    spacers: r.spacers.map((sp): TraySpec => ({ ...turnRect(sp), rotated: !sp.rotated })),
  };
}
```

`apps/insert-generator/src/sizing/grip.ts`:

```ts
import type { CompartmentSpec } from "../model/types";
import { MIN_GRIP } from "./constants";

/** Spec §3 rule 8: a compartment with min(w, d) ≥ 25 mm, or a finger pocket. */
export function hasGrip(compartments: readonly CompartmentSpec[]): boolean {
  return compartments.some(
    (c) => Math.min(c.w, c.d) >= MIN_GRIP || c.features.some((f) => f.type === "fingerPocket"),
  );
}
```

`apps/insert-generator/src/sizing/index.ts`:

```ts
export type {
  CompartmentReq,
  FeatureReq,
  OuterSize,
  RealizedTray,
  RealizeOptions,
  TrayPartReq,
  TrayRequirement,
  TrayVariant,
} from "./types";
export { size } from "./group";
export { minOuter, wallFor } from "./outer";
export { realizeTray } from "./realize";
export { rotateRealized } from "./rotate";
export { hasGrip } from "./grip";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sizing/rotate.test.ts src/sizing/grip.test.ts src/sizing/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/rotate.ts src/sizing/grip.ts src/sizing/index.ts src/sizing/rotate.test.ts src/sizing/grip.test.ts src/sizing/index.test.ts
git commit -m "Add tray rotation, grip check and sizing index"
```

---

### Task 13: Property tests

**Files:**

- Test: `apps/insert-generator/src/sizing/property.test.ts`
- Modify (only if missing): `apps/insert-generator/package.json`, `apps/insert-generator/package-lock.json` / root lockfile (add `fast-check ^4.10.2` as a dev dependency)

**Interfaces:**

- Consumes: `size`, `minOuter`, `realizeTray`, `rotateRealized`, `hasGrip`, `wallFor` from `./index`; `MIN_FEATURE`, `MIN_SPACER`; `DEFAULT_SETTINGS`; `at` from test helpers.
- Produces: nothing new (tests only).

Properties, on random valid components (1–3 per project, optionally all in one group, optionally the first one per-player) and random wall/fit/lip settings:

1. `size` returns 1–8 variants per requirement with unique ids; every part has compartments.
2. For every variant part and every `opts` in `{ground, lipped, upper}`: `realizeTray(part, minOuter(part))` succeeds and the result passes `checkTray` (below).
3. The same holds for `minOuter` plus random extra width/depth/height.
4. `size` is deterministic.

`checkTray` (includes the roadmap §4.6 rules that `buildTray` enforces): compartment rectangles lie inside the outer walls (`≥ wallFor`, lipped wall when lipped); `0 < floorZ < h` and floors `≥ max(floor, 0.8)`; the well proper (rectangle minus reach bands) is non-empty; every requested compartment meets `minW`, `minD`, `minH`, `minVolume`, `maxHRatio`; no two compartments touch: any two are at least 0.8 mm apart; finger pockets lie between the walls and are no deeper than the compartment; at most one spacer, keyed `<trayKey>:spacer`, ≥ 5 mm long and tall, inside a compartment; the tray has a grip; the rotated tray fits the swapped outer.

- [ ] **Step 1: Make sure fast-check is installed**

Run (from `apps/insert-generator`): `npm ls fast-check`
Expected: `fast-check@4.x`. If it prints `(empty)`, run `npm install --save-dev fast-check@^4.10.2` and include the changed `package.json` and lockfile in this task's commit.

- [ ] **Step 2: Write the property tests**

`apps/insert-generator/src/sizing/property.test.ts`:

```ts
import fc, { type Arbitrary } from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type {
  Access,
  CardsComponent,
  CompartmentSpec,
  Component,
  MinisComponent,
  Settings,
  TilesComponent,
} from "../model/types";
import { MIN_FEATURE, MIN_SPACER } from "./constants";
import { hasGrip, minOuter, realizeTray, rotateRealized, size, wallFor } from "./index";
import { at } from "./test-helpers";
import type { OuterSize, RealizedTray, RealizeOptions, TrayPartReq } from "./types";

const EPS = 0.011;

const mm = (lo: number, hi: number): Arbitrary<number> =>
  fc.integer({ min: Math.round(lo * 100), max: Math.round(hi * 100) }).map((v) => v / 100);
const count = (hi: number): Arbitrary<number> => fc.integer({ min: 1, max: hi });
const access = fc.constantFrom<Access>("often", "sometimes", "setup");

const cardsArb: Arbitrary<Component> = fc
  .record({
    access,
    short: mm(30, 80),
    extra: mm(0, 50),
    decks: fc.array(count(120), { minLength: 1, maxLength: 4 }),
    sleeve: fc.constantFrom<"none" | "standard" | "premium" | "custom">(
      "none",
      "standard",
      "premium",
      "custom",
    ),
    measured: fc.option(fc.record({ cards: count(100), stackMm: mm(1, 60) }), { nil: undefined }),
    storage: fc.constantFrom<CardsComponent["storage"]>(
      "upright-long",
      "upright-short",
      "flat",
      "auto",
    ),
    clearance: fc.option(mm(0, 3), { nil: undefined }),
  })
  .map((r): Component => ({
    id: "",
    name: "Cards",
    access: r.access,
    kind: "cards",
    shortSide: r.short,
    longSide: r.short + r.extra,
    decks: r.decks.map((n, i) => ({ name: `D${i}`, count: n })),
    sleeve:
      r.sleeve === "custom"
        ? { w: r.short + 3, h: r.short + r.extra + 3, thickness: 0.15 }
        : r.sleeve,
    thickness:
      r.measured === undefined
        ? { mode: "preset" }
        : { mode: "measured", cards: r.measured.cards, stackMm: r.measured.stackMm },
    storage: r.storage,
    ...(r.clearance === undefined ? {} : { clearance: r.clearance }),
  }));

const bulkArb: Arbitrary<Component> = fc
  .record({
    access,
    items: fc.array(
      fc.oneof(
        fc.record({
          name: fc.constant("Item"),
          count: count(200),
          w: mm(2, 40),
          d: mm(2, 40),
          h: mm(1, 30),
        }),
        fc.record({ name: fc.constant("Pile"), volumeMl: mm(1, 400) }),
      ),
      { minLength: 1, maxLength: 4 },
    ),
  })
  .map((r): Component => ({
    id: "",
    name: "Bits",
    access: r.access,
    kind: "bulk",
    items: r.items,
  }));

const tilesArb: Arbitrary<Component> = fc
  .record({
    access,
    shape: fc.oneof(
      fc.record({ type: fc.constant("rect" as const), w: mm(10, 80), d: mm(10, 80) }),
      fc.record({
        type: fc.constant("hex" as const),
        flatToFlat: mm(15, 70),
        orientation: fc.constantFrom<"flat" | "pointy">("flat", "pointy"),
      }),
    ),
    thickness: mm(1, 4),
    count: count(80),
    storage: fc.constantFrom<TilesComponent["storage"]>("flat", "upright", "auto"),
  })
  .map((r): Component => ({
    id: "",
    name: "Tiles",
    access: r.access,
    kind: "tiles",
    shape: r.shape,
    thickness: r.thickness,
    count: r.count,
    storage: r.storage,
  }));

const minisArb: Arbitrary<Component> = fc
  .record({
    access,
    figures: fc.array(
      fc.record({
        name: fc.constant("Fig"),
        w: mm(10, 50),
        d: mm(10, 50),
        h: mm(10, 80),
        count: count(4),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    storage: fc.constantFrom<MinisComponent["storage"]>("pockets", "bulk"),
  })
  .map((r): Component => ({
    id: "",
    name: "Minis",
    access: r.access,
    kind: "minis",
    figures: r.figures,
    storage: r.storage,
  }));

const customArb: Arbitrary<Component> = fc
  .record({ access, w: mm(5, 80), d: mm(5, 80), h: mm(1, 60), count: count(4) })
  .map((r): Component => ({ id: "", name: "Thing", kind: "custom", ...r }));

const componentsArb: Arbitrary<Component[]> = fc
  .record({
    list: fc.array(fc.oneof(cardsArb, bulkArb, tilesArb, minisArb, customArb), {
      minLength: 1,
      maxLength: 3,
    }),
    grouped: fc.boolean(),
    players: fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
  })
  .map(({ list, grouped, players }) =>
    list.map((c, i): Component => {
      const withId: Component = { ...c, id: `c${i}` };
      const inGroup: Component = grouped ? { ...withId, groupId: "g" } : withId;
      return i === 0 && players !== undefined ? { ...inGroup, perPlayer: { players } } : inGroup;
    }),
  );

const settingsArb: Arbitrary<Settings> = fc
  .record({
    wall: fc.constantFrom(1.2, 1.6, 2.0),
    fit: fc.constantFrom(0.7, 1, 1.4),
    lip: fc.boolean(),
  })
  .map((r) => ({
    ...DEFAULT_SETTINGS,
    wall: r.wall,
    fit: r.fit,
    lip: { ...DEFAULT_SETTINGS.lip, enabled: r.lip },
  }));

const OPTS: RealizeOptions[] = [
  { lipped: false, level: 0 },
  { lipped: true, level: 0 },
  { lipped: false, level: 1 },
];

interface Box {
  x: number;
  y: number;
  w: number;
  d: number;
}

/** The well proper inside a compartment rectangle (rectangle minus its finger-reach bands). */
function wellOf(c: CompartmentSpec, reach: number): Box {
  const has = (side: string): number =>
    c.features.some((f) => f.type === "fingerPocket" && f.side === side) ? reach : 0;
  return {
    x: c.x + has("left"),
    y: c.y + has("front"),
    w: c.w - has("left") - has("right"),
    d: c.d - has("front") - has("back"),
  };
}

function checkTray(
  part: TrayPartReq,
  outer: OuterSize,
  s: Settings,
  opts: RealizeOptions,
  r: RealizedTray,
): void {
  const wall = wallFor(s, opts.lipped);
  const floor = Math.max(s.floor, MIN_FEATURE);
  const boxes: Box[] = r.compartments;
  expect(r.compartments.length).toBeGreaterThanOrEqual(part.compartments.length);
  r.compartments.forEach((c, i) => {
    const b = at(boxes, i);
    // roadmap §4.6: at least the outer wall from every outer face, 0 < floorZ < h
    expect(b.x).toBeGreaterThanOrEqual(wall - EPS);
    expect(b.y).toBeGreaterThanOrEqual(wall - EPS);
    expect(b.x + b.w).toBeLessThanOrEqual(outer.w - wall + EPS);
    expect(b.y + b.d).toBeLessThanOrEqual(outer.d - wall + EPS);
    expect(c.floorZ).toBeGreaterThanOrEqual(floor - EPS);
    expect(c.floorZ).toBeGreaterThan(0);
    expect(c.floorZ).toBeLessThan(outer.h);
    const well = wellOf(c, s.fingerPocket.reach);
    expect(well.w).toBeGreaterThan(0);
    expect(well.d).toBeGreaterThan(0);
    const depth = outer.h - c.floorZ;
    const req = part.compartments[i];
    if (req === undefined) {
      expect(c.kind).toBe("spare");
      return;
    }
    expect(b.w).toBeGreaterThanOrEqual(req.minW - EPS);
    expect(b.d).toBeGreaterThanOrEqual(req.minD - EPS);
    expect(depth).toBeGreaterThanOrEqual(req.minH - EPS);
    if (req.minVolume !== undefined) {
      expect(c.w * c.d * depth).toBeGreaterThanOrEqual(req.minVolume * (1 - 1e-6));
    }
    if (req.maxHRatio !== undefined) {
      expect(depth).toBeLessThanOrEqual(req.maxHRatio * Math.min(c.w, c.d) + EPS);
    }
    for (const f of c.features) {
      if (f.type === "fingerPocket") {
        const span = f.side === "front" || f.side === "back" ? outer.w : outer.d;
        expect(f.width).toBeGreaterThan(0);
        expect(f.at - f.width / 2).toBeGreaterThanOrEqual(wall - EPS);
        expect(f.at + f.width / 2).toBeLessThanOrEqual(span - wall + EPS);
        expect(f.depth).toBeGreaterThan(0);
        expect(f.depth).toBeLessThanOrEqual(depth + EPS);
      }
    }
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = at(boxes, i);
      const b = at(boxes, j);
      const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const gapY = Math.max(b.y - (a.y + a.d), a.y - (b.y + b.d));
      expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(MIN_FEATURE - EPS);
    }
  }
  expect(r.spacers.length).toBeLessThanOrEqual(1);
  for (const sp of r.spacers) {
    expect(sp.key).toBe(`${part.trayKey}:spacer`);
    expect(sp.w).toBeGreaterThanOrEqual(MIN_SPACER - EPS);
    expect(sp.h).toBeGreaterThanOrEqual(MIN_SPACER - EPS);
    const inside = r.compartments.some(
      (c) =>
        sp.x >= c.x - EPS &&
        sp.x + sp.w <= c.x + c.w + EPS &&
        sp.y >= c.y - EPS &&
        sp.y + sp.d <= c.y + c.d + EPS,
    );
    expect(inside).toBe(true);
  }
  expect(hasGrip(r.compartments)).toBe(true);
  for (const c of rotateRealized(r, outer).compartments) {
    expect(c.x).toBeGreaterThanOrEqual(-EPS);
    expect(c.y).toBeGreaterThanOrEqual(-EPS);
    expect(c.x + c.w).toBeLessThanOrEqual(outer.d + EPS);
    expect(c.y + c.d).toBeLessThanOrEqual(outer.w + EPS);
  }
}

function allParts(components: Component[], s: Settings): TrayPartReq[] {
  return size(components, s).requirements.flatMap((req) => req.variants.flatMap((v) => v.parts));
}

describe("sizing properties", () => {
  it("returns 1–8 uniquely named variants with non-empty parts", { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(componentsArb, settingsArb, (components, s) => {
        for (const req of size(components, s).requirements) {
          expect(req.variants.length).toBeGreaterThanOrEqual(1);
          expect(req.variants.length).toBeLessThanOrEqual(8);
          expect(new Set(req.variants.map((v) => v.id)).size).toBe(req.variants.length);
          for (const v of req.variants) {
            for (const part of v.parts) {
              expect(part.compartments.length).toBeGreaterThan(0);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("realizes every variant part at its minOuter", { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(componentsArb, settingsArb, (components, s) => {
        for (const part of allParts(components, s)) {
          for (const opts of OPTS) {
            const outer = minOuter(part, s, opts);
            checkTray(part, outer, s, opts, realizeTray(part, outer, s, opts));
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("stays valid for larger outers", { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(
        componentsArb,
        settingsArb,
        fc.record({ w: mm(0, 80), d: mm(0, 80), h: mm(0, 40) }),
        fc.constantFrom(...OPTS),
        (components, s, extra, opts) => {
          for (const part of allParts(components, s)) {
            const m = minOuter(part, s, opts);
            const outer = { w: m.w + extra.w, d: m.d + extra.d, h: m.h + extra.h };
            checkTray(part, outer, s, opts, realizeTray(part, outer, s, opts));
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("is deterministic", { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(componentsArb, settingsArb, (components, s) => {
        expect(size(components, s)).toEqual(size(components, s));
      }),
      { numRuns: 50 },
    );
  });
});
```

- [ ] **Step 3: Run the property tests**

Run: `npx vitest run src/sizing/property.test.ts`
Expected: PASS (4 tests). These test code that already exists, so they pass on the first run if Tasks 1–12 are correct. If one fails, fast-check prints the shrunk counterexample and its seed: treat it as a bug in the sizing code (use superpowers:systematic-debugging), fix the code, add the counterexample as a regular unit test in the owning task's test file, and re-run.

- [ ] **Step 4: Run the whole sizing suite**

Run: `npx vitest run src/sizing`
Expected: PASS (all sizing test files).

- [ ] **Step 5: Lint, format, type-check**

Run: `npx prettier --write src/sizing && npx eslint src/sizing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sizing/property.test.ts
git commit -m "Add sizing property tests"
```

If Step 1 installed fast-check, also `git add package.json` and the lockfile it changed (`package-lock.json` here or at the repo root) before committing.

---

### Task 14: Repository verification

**Files:** none new.

**Interfaces:** none.

- [ ] **Step 1: Run the repo quality gate**

Run (from the repo root): `npm run verify`
Expected: lint, format check and `build:all` pass (the app build runs `vitest run && tsc --noEmit && vite build`, so all sizing tests run here too).

- [ ] **Step 2: Fix anything it reports**

If `format:check` fails: `npx prettier --write apps/insert-generator/src/sizing` and re-run. If lint fails: fix the reported lines (do not disable rules). Re-run `npm run verify` until it passes.

- [ ] **Step 3: Commit fixes (only if Step 2 changed files)**

```bash
git add apps/insert-generator/src/sizing
git commit -m "Fix sizing lint and formatting"
```

---

## Contract changes

No changes to any roadmap §4 type or function signature. The following are clarifications plans 3 (geometry) and 4 (layout) must rely on; please fold them into the roadmap's §4.2/§4.1 notes:

1. **`src/sizing/types.ts` import line:** `Settings` is not imported (it would be unused and fail `noUnusedLocals`); the roadmap §4.2 import line already omits it. Types are verbatim.
2. **`CompartmentSpec.{x, y, w, d}`** follows roadmap §4.6: the rectangle includes a solid band `fingerPocket.reach` deep along every finger-pocket side; the geometry cuts the U-slot into that band. `CompartmentReq.minW/minD` include the reach (as the contract says). `realizeTray` never emits touching/overlapping compartments, compartments closer than the outer wall to an outer face, or `floorZ` outside (0, h); the Task 13 property tests assert all three.
3. **`FeatureSpec.at` (fingerPocket)** follows roadmap §4.6: slot centre along its side, tray-local mm (X for `front`/`back`, Y for `left`/`right`), shifted inward so `wall ≤ at − width/2` and `at + width/2 ≤ outer − wall` (base or lipped wall). `depth` is measured down from the rim and never exceeds the compartment's content depth. Sizing imports nothing from `geometry/`.
4. **Rotation:** `realizeTray` works in the part's own frame. For a placement with `rotated: true`, plan 4 calls `realizeTray(part, { w: placed.d, d: placed.w, h }, …)` and then the new export `rotateRealized(result, thatOuter)` (90° counter-clockwise; see Task 12), then translates spacers into box coordinates.
5. **Spacers:** at most one per tray, key `<trayKey>:spacer`, `x/y/z` tray-local, `w` = spare stack length along X (before rotation), `d` = well depth, `h` = well content depth − 5, `wall: 0`, `floor: 0`, `stack: 0`, `level: 0`, `lip: false`. Plan 4 sets `stack`/`level` and translates `x/y/z`.
6. **`RealizedTray.compartments` order:** index `i < part.compartments.length` corresponds to `part.compartments[i]`; `spare` compartments follow.
7. **`RealizedTray.wall`** = `max(settings.wall, 0.8)` (the base wall, never the lipped one), as `TraySpec.wall` expects.
8. **`RealizeOptions.lipped`** only thickens the wall when `settings.lip.enabled`; `level > 0` with the lip enabled raises the minimum `h` to `lip.height + 3` (spec §6.1).
9. **`minOuter`** also widens the inner span to `fingerPocket.width` along any side carrying a finger pocket (so a 1-card deck still gets a full-width pocket).
10. **`settings.cardStackClearancePct`** is a fraction (default `0.03`) and is multiplied by `fit` like `cardStackClearance` (spec §5 table). Plan 1 must store it that way (`contract.test.ts` in Task 1 pins it).
11. **topPlane:** sizing never sees the box; instead it emits variants (all storages under `auto`, tile column counts `{1, ⌈total/50⌉, ⌈total/25⌉}`, minis lying). The layout must treat a variant whose `minOuter.h` exceeds the available height as infeasible and try the others.
