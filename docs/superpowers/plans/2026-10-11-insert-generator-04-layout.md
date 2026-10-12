# Plan 4 — Layout Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `optimize()` — a deterministic, seeded layout engine that turns sized tray requirements into a fully resolved `StoredLayout` (guillotine tiling of the box floor, stacks with locating-lip insets, leftovers, bed fit, locks, warnings, summary) — plus the layout Web Worker and its client.

**Architecture:** Everything inside `src/layout/` works in integer 0.01 mm units. A layout is an immutable guillotine tree whose leaves are stacks; cut positions are derived from subtree minimums plus an integer share of the slack, so every tree tiles the floor exactly. `evaluate()` (fill) turns a tree into integer placements, leftovers and an overflow measure; `scorePlan()` scores it with integer weights; simulated annealing (`xoshiro128**` PRNG, integer deltas) explores eight pure moves from greedy and warm-start trees while respecting locks; `materialize()` calls sizing's `realizeTray`/`rotateRealized` to produce `TraySpec`s in mm. A chunked `createRun()` drives both `optimize()` and the worker.

**Tech Stack:** TypeScript 6 (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest 5, fast-check 4, Web Workers (Vite `new URL(..., import.meta.url)`).

**Spec:** `docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md` (§3, §6.1, §7, §8.4, §11) and roadmap `docs/superpowers/plans/2026-10-11-insert-generator-00-roadmap.md` (§4.4 contract; §4.6 geometry and §4.7 sizing conventions are binding).

## Amendments from plans 1–3 (binding, read first)

Plans 1–3 are implemented, and their reviews amended the roadmap §4 contracts this plan was written against. The amended roadmap is binding; where this plan's prose and an amendment disagree, the amendment wins. The code blocks named below are already patched: transcribe them as shown.

1. **Sizing guarantees realizability (roadmap §4.2, §4.7).** Every part `size()` returns realizes at every option (unlipped or lipped, level 0 or upper) and at every outer ≥ its `minOuter`; `size()` drops the variants where a compartment asking for a finger cut gets none, stores the stuck tiles, minis and custom members of a requirement with none left in scoop bins (the bulk fallback, roadmap §4.2), and leaves a requirement that still has none out with the `sizing.noFingerSlot` warning. So layout has no realizability machinery: no `fits`/`slotsFit`, no `realizable` on metrics or levels, no `SLOT_OVERFLOW_U` or `Overflow.slot`, and `materialize` catches nothing (every error propagates, and any throw from `realizeTray` is a bug). `../sizing` exports no error class. The task code blocks below are patched accordingly.
2. **Leftover pieces fit their bottom chamfer.** `Ctx.minPiece = max(MIN_PIECE_U, toUCeil(chamferMinimums(settings, 0).side))` (Task 4): planTray rejects a part narrower than `2·(chamfer + 0.8)`, so a leftover forced by a bed or size-lock cap is never thinner than that; `axisExtent` (Task 7) uses `ctx.minPiece`, and slack below it is absorbed by the tray.
3. **Walls and floors as sizing writes them.** `Ctx.wall = toUCeil(wallFor(settings, false))` (never below `MIN_WALL_MM` = 0.9 mm) and `Ctx.floor = toUCeil(max(settings.floor, MIN_FEATURE_MM))` (Task 4). Materialized trays and leftovers (Task 12) write `wall` and `floor` from them, rounded up to 0.01 mm, never the raw settings: planTray rejects a wall under 0.9 mm, and every TraySpec length sits on the 0.01 mm grid.
4. **Geometry rejects what it cannot build (roadmap §4.6).** planTray/buildTray throw `TraySpecError` for compartments less than 0.8 mm apart, walls or lips under 0.9 mm, a part too small for its chamfer, and the rest of §4.6. Layout emits sizing's realized trays plus leftovers; the hard-rule checker (Task 17) calls `planTray(spec, settings)` on every printed `TraySpec`, so a spec geometry would reject is a violation in every fixture and property test.
5. **The checker uses the shared helpers.** `checkHardRules` takes the upper chamfer from `effectiveBottomChamfer(settings, 1)` and the lipped wall from `wallFor(settings, true)`, never hand derivations (Task 17). The checker and the fixture loader are test-only helpers, and the checker imports `geometry/plan`, so they are named `test-hard-rules.ts` and `test-fixtures.ts`: the root ESLint config exempts `test-*.ts` from the main-thread geometry rule, and forbids production code from importing any `test-*` module.
6. **Settings.** `settingsValid` (plan 1, `model/validate`) adds the cross-field rules `field.bottomChamfer` and `field.lipBearing` (with the lip on, an upper tray's chamfer is less than `lip.ledge − 2·lipPlay`), so the checker's bearing test always has room for valid settings. Import `MIN_FEATURE_MM`, `MIN_WALL_MM`, `chamferMinimums` and `effectiveBottomChamfer` from `model/settings` and `wallFor`, `realizeTray` and `rotateRealized` from `../sizing`; never hard-code 0.8, 0.9 or 0.5.
7. **Finger channels (roadmap §4.6, §4.7; implemented after plans 1–3).** Compartments of components with finger cuts on (by default cards, tiles, minis pockets and custom wells; spec §5 `fingerCuts`, `curvedFloor`) get wall cutouts (`FeatureSpec` `"wallCutout"`; finger pockets are gone; the default finger width is 25 mm): no reach bands (their `CompartmentReq.minD`/`minW` and compartment rectangles are content + clearance, which `meetsMinimum` compares as before), cuts through outer walls and dividers that keep 3 mm full-height posts and are at least 10 mm wide (`MIN_CUT_MM`, or the width setting if smaller), and `hasGrip` counts them, and scoops; the checker skips rule 8 for a tray whose part does not `needsGrip` (every component has both toggles off). With `settings.fingerPocket.wallRoom` or `.dividerRoom` > 0, `minOuter` and `realizeTray` thicken the outer walls and the dividers the placed cuts pass through (the room of the `minOuter` layout; a larger outer keeps it): layout needs nothing extra, because it only ever sees `minOuter` and realized trays (`TraySpec.wall` stays the base wall, and compartments still keep at least `wallFor` from every face, which the checker tests). The checker's `planTray` call covers the cutout rules. A spacer in a channelled well carries a notch (`TraySpec.features`, `"spacerNotch"`, in its own frame): materialize translates spacers' `x/y/z` only and keeps their `features` as sizing emitted them.

## Global Constraints

- App lives in ``. Built app: `package.json`, `npm run build` outputs `dist/`, `vite.config.ts` sets `base: "./"`, `app.json` has `{ title, description }`.
- Node 22 (`.nvmrc`). Dependency versions (exact ranges): `vite ^6.4.0`, `vitest ^5.0.3`, `typescript ^6.0.3`, `preact ^10.29.8`, `@preact/signals ^2.11.3`, `@preact/preset-vite ^2.10.6`, `manifold-3d ^3.5.4` (single-threaded build only), `three ^0.186.1`, `@types/three ^0.186.0`, `fflate ^0.8.3`, `fast-check ^4.10.2`, `jsdom ^30.1.2`, `@testing-library/preact ^3.2.4`, `rollup-plugin-license ^3.7.1`, `@types/node ^22.0.0` (type-only, for `tsconfig.node.json`). No copyleft dependencies.
- TypeScript strictness from `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` → use `import type`). App `tsconfig.json` (covers `src/`, no Node types): `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`. `tsconfig.node.json` covers the Node-side config files (`vite.config.ts`, later `licenses.config.ts`) with `"types": ["node"]`.
- Lint: root `eslint.config.mjs` (non-type-checked `strict` + `stylistic`, `curly: all`, `eqeqeq`, `prefer-template`, `no-param-reassign`, `no-console` except warn/error). Prettier: `printWidth` from `.prettierrc.json`. Stylelint for CSS. html-validate for `index.html`.
- The app's `build` script: `vitest run && tsc --noEmit && tsc --noEmit -p tsconfig.node.json && vite build` (plan 5 appends `&& node scripts/smoke-dist.mjs dist`); `npm run typecheck` runs both `tsc` checks. Tests run in CI via `npm run verify` (lint, format check, build).
- `Math.random` is banned in `src/layout/**` (root ESLint rule, plan 1).
- All lengths are millimetres. Inside `layout/`, lengths are integer 0.01 mm units (`Units` helpers, plan 4); `TraySpec` stores mm rounded to 0.01.
- Versions start at app `0.1.0`, `SCHEMA_VERSION = "0.1.0"`, `GEOMETRY_VERSION = "0.1.0"`. Pre-1.0 makes no compatibility promise (spec §9).
- Never use `localStorage` without `try/catch`. No network calls at runtime.
- Commits: plain imperative messages (e.g. `Add card sizing`). **No `Co-Authored-By` or any trailer.** Commit after every task.
- Run tests and repo checks from the repo root: `npx vitest run <path>`, `npm run lint`, `npm run format:check`, `npm run verify`.

## Review Focus

- A single requirement whose minimum outer size fills the box floor exactly must give one tray of exactly the floor size with no leftovers or slivers (Task 18 test "fills a box exactly with one tray and no leftovers").
- Headroom ≥ inner height (topPlane ≤ 0) must not throw or loop: no layout, a height shortfall and a "less headroom" suggestion (Task 6 "reports overflow instead of throwing when headroom ≥ inner height", Task 18 "reports doesNotFit instead of throwing when headroom ≥ inner height").
- A lock referencing a tray that was split into parts after an edit must pin the variant that still has that key, and a lock on a part key that no longer exists must be dropped with a `lock.dropped` notice (Task 10 "pins the variant that contains the locked tray" and "drops a lock whose trayKey no longer exists").
- A box larger than the print bed in both axes with only one component must cap the tray to the bed and split the leftover into bed-sized pieces, all on the bed (Task 7 "caps the bottom tray to the bed…", "splits leftovers larger than the bed"; Task 18 "splits the leftover of a box larger than the bed…").
- 30+ requirements must keep the search usable: 2 000 iterations on 32 requirements finish well under 10 s (Task 18 "handles 32 requirements within the time budget").

---

## Design decisions

These are interpretations of the spec and roadmap that every task relies on. None changes a §4 type or signature (additions are listed under "Contract changes" at the end).

**Units.** `U` = integer 0.01 mm. Minimum sizes convert with `toUCeil` (never smaller than required), available space with `toUFloor`, settings and stored positions with `toU` (nearest). Products stay below 2^53 (lengths ≤ 1000 mm = 100 000 U).

**Cuts are shares, not coordinates.** A cut stores `share ∈ [0, 2^20]`. Child a gets its minimum extent plus `floor(slack × share / 2^20)`, child b the rest minus `trayGap`. So every tree tiles its rectangle exactly (rule 1), positions are integers, "move cut" changes the share, and a stored layout's shares can be recovered exactly (warm start). When the minimum exceeds the floor (overflow), children get their minimums.

**Leaf = stack.** Level k is inset `k·(lip.thickness + effective lip play)` per side on both axes, also with the lip off (spec §6.1). `lipped = lip.enabled && k < top`, and that same flag goes to `minOuter`/`realizeTray` and `TraySpec.lip` (roadmap §4.6). Heights: every level but the top is rounded up to the layer height; height slack goes in whole layers to the lowest tray with an elastic-h compartment, the top tray takes the remainder; Σ h = topPlane exactly. Upper trays need `h ≥ lip.height + 3` when the lip is on. At most 4 levels per stack.

**Fill and leftovers are derived, not stored in the tree.** In a leaf, the bottom tray takes the leaf footprint unless the stack can't absorb the slack (elastic axes → unlimited; otherwise inward wall growth `2·(min(2·wall, 4) − wall)`); unabsorbable slack ≥ 12 mm becomes a leftover strip (full stack height), smaller slack is absorbed by the tray (realizeTray spreads it). Bed caps and size-lock caps force a leftover of at least `Ctx.minPiece` (3 mm, more for a large bottom chamfer). Leftovers larger than the bed are split by further guillotine cuts. Leftovers narrower than 25 mm + 2 walls (no grip possible) are solid. Leftover `TraySpec.path` = the path of their leaf; each leftover piece gets its own `stack` number after all tray stacks. An empty leaf (allowed only to keep locked routes intact, or produced by moves) is entirely leftover.

**Variants.** Sizing never sees the box (roadmap §4.7). Starting layouts use the first variant whose parts fit height, bed and floor; the annealer's "change variant" move explores the others; infeasible variants just carry overflow.

**Score.** Lower is better; integer weights in the spec order with documented "unit step" equivalents (Task 8). Any hard-rule violation counts as overflow (0.01 mm units) × 10^9, more than any feasible score. Best feasible and least-overflow candidates are tracked separately.

**Locks.** Resolved before optimizing (Task 10): unknown keys, size locks the contents outgrew or that no longer fit box/bed, invalid or prefix-conflicting paths, duplicate or too-tall stack locks are dropped with `lock.dropped` notices. Locks pin the variant that contains their keys. Position-locked trays sit in frozen leaves at exactly their path; trays locked to one path stack in the order of their level in the warm-start layout (`LockHints.levelOf`; input order without one), except that a stack lock keeps the order it gives; a position lock on a tray that sat above others in the warm-start layout, with nothing under it locked to the same path and no stack lock around it, is dropped with a `lock.dropped` notice (it would silently go to the floor and evict its stack-mates; the UI locks a whole stack: a position lock per tray plus a stack lock, like `swapLocks`); the root path `""` is a valid position when there is a single tray or the warm start is one single stack (`LockHints.singleLeaf`); cuts on the route to a locked path keep their axis (taken from the warm start when available) and can't be flipped or collapsed, but their shares move. Stack locks become frozen leaves that may move. If the main chain finds no feasible layout, one more chain with the same budget runs from a derived seed (`(seed ^ 0x9e3779b9) >>> 0`; the search is seed-dependent, and a bigger budget does not rescue the seeds that dead-end, a second seed rescues nine in ten of them); it keeps the locks. If neither chain finds one and locks were kept, a further chain runs without locks; if that one is feasible it is returned and every kept lock gets a `lock.dropped` notice ("no layout that keeps it fits in the box").

**Determinism.** All randomness comes from `createRng(seed)`; Math.exp/Math.pow are the only float steps. Chunk size never changes the result. Same input + warm start + seed + iterations → deep-equal `LayoutResult` on the same engine, unless the 30 s time cap stopped the run (`capped: true`). The `iterations` argument is this run's budget; `StoredLayout.iterations` is cumulative: `warmStart.iterations` (if any) + this run's budget, or + the iterations actually run when capped. "Improve more" (spec §7.2: adds 3N, continuing from the stored layout) is a run of 3N with the stored layout as warm start and its seed. The extra chains of an infeasible run (derived seed, then unlocked) are deterministic too, and `StoredLayout.iterations` counts the chain that produced the layout. Progress: `Run.done` is the iterations run over every chain and only grows; `Run.total` is the budget of every chain started plus those that may still follow while none has found a layout (derived seed, then unlocked), so it only shrinks, when a chain finds a layout and the rest are skipped, and `done / total` never goes backwards. A run whose start is already feasible shows `total` = its budget throughout.

**Warm start.** The previous `StoredLayout` is turned back into a tree: leaves from tray paths, cut axes from positions, shares recovered exactly; unchanged inputs reproduce the stored trays exactly (tested). The "moved trays" score term compares positions with it.

**Default budget.** `DEFAULT_ITERATIONS = 50 000`. Measured while writing this plan (Apple M-series, Node 26, a stand-in for sizing): 80 000 it/s on the slowest fixture. A mid-range laptop is assumed ≈ 3× slower, so 3 s ≈ 80 000; 50 000 leaves headroom for real sizing. Task 19 adds a calibration test (skipped unless `CALIBRATE=1`) that prints the suggestion `3 × slowest it/s`, rounded down to 1000.

**Worker.** One worker, created lazily. The worker runs one chunk at a time and yields to the event loop, so `cancel` and newer `run` messages take effect within one chunk. A cancelled or superseded run's promise rejects with `LayoutCancelledError`.

## File structure

All under `src/layout/`:

| File                                                      | Responsibility                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `types.ts`                                                | Roadmap §4.4 contract types, verbatim                                                                   |
| `units.ts`                                                | Integer 0.01 mm units, rounding rules, `Ext`/`Rect`                                                     |
| `prng.ts`                                                 | `xoshiro128**` seeded via splitmix32                                                                    |
| `bed.ts`                                                  | Usable bed, either rotation, bed-split of leftovers                                                     |
| `context.ts`                                              | `Ctx`: input converted to units, cached part metrics, constants                                         |
| `tree.ts`                                                 | Immutable guillotine tree, paths, placement of leaf rectangles                                          |
| `stack.ts`                                                | Stack feasibility: insets, minimum footprint, absorbable slack, heights                                 |
| `fill.ts`                                                 | `evaluate()`: tree → integer plan (trays, leftovers, overflow, crossings)                               |
| `score.ts`                                                | Integer score terms and weights                                                                         |
| `moves.ts`                                                | Eight pure moves + insertion/removal helpers                                                            |
| `locks.ts`                                                | Lock validation, applying locks to a tree, `swapLocks`                                                  |
| `greedy.ts`                                               | First-fit-decreasing shelf starts along X and along Y                                                   |
| `materialize.ts`                                          | Plan → `TraySpec[]` via `realizeTray`/`rotateRealized`                                                  |
| `warmstart.ts`                                            | Stored layout → tree (exact shares) and hints                                                           |
| `anneal.ts`                                               | Simulated annealing with deterministic acceptance                                                       |
| `summarize.ts`                                            | `LayoutSummary`                                                                                         |
| `warnings.ts`                                             | Coverage, play, lip-off, bed, doesNotFit, capped notices                                                |
| `optimize.ts`                                             | `createRun()` (chunks, time cap, derived-seed chain, lock fallback), `optimize()`, `DEFAULT_ITERATIONS` |
| `index.ts`                                                | Public exports                                                                                          |
| `worker-core.ts`, `worker.ts`                             | Worker message handling / worker entry                                                                  |
| `client.ts`                                               | `createLayoutClient()`                                                                                  |
| `test-utils.ts`, `test-hard-rules.ts`, `test-fixtures.ts` | Test helpers (imported only by tests)                                                                   |

### Task 1: Layout contract types and integer units

**Files:**

- Create: `src/layout/types.ts`
- Create: `src/layout/units.ts`
- Test: `src/layout/units.test.ts`

**Interfaces:**

- Consumes: `Box, Printer, Settings, Lock, StoredLayout, TraySpec, Notice` (`../model/types`, plan 1); `TrayRequirement` (`../sizing/types`, plan 2).
- Produces: roadmap §4.4 types `LayoutInput`, `LayoutSummary`, `LayoutResult`, `LayoutRequest`, `LayoutResponse`; `type U = number`; `U_PER_MM = 100`; `toU(mm): U`, `toUCeil(mm): U`, `toUFloor(mm): U`, `toMm(u): number`, `roundMm(mm): number`, `roundUpTo(u, step): U`, `roundDownTo(u, step): U`, `mulDiv(a, b, c): number`, `volMm3(w, d, h): number`; `interface Ext { w: U; d: U }`, `interface Rect extends Ext { x: U; y: U }`.

- [ ] **Step 1: Add the contract types (roadmap §4.4, verbatim)**

`src/layout/types.ts`:

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
      iterations: number; // this run's budget (roadmap §4.8)
      warmStart?: StoredLayout;
    }
  | { type: "cancel"; runId: number };

export type LayoutResponse =
  | { type: "progress"; runId: number; done: number; total: number; best: LayoutResult }
  | { type: "done"; runId: number; result: LayoutResult }
  | { type: "error"; runId: number; message: string };
```

- [ ] **Step 2: Write the failing test**

`src/layout/units.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mulDiv,
  roundDownTo,
  roundMm,
  roundUpTo,
  toMm,
  toU,
  toUCeil,
  toUFloor,
  volMm3,
} from "./units";

describe("units", () => {
  it("converts mm to integer hundredths with the documented rounding", () => {
    expect(toU(63.5)).toBe(6350);
    expect(toU(0.29)).toBe(29);
    expect(toU(1.005)).toBe(100);
    expect(toUCeil(0.29)).toBe(29);
    expect(toUCeil(66.401)).toBe(6641);
    expect(toUCeil(66.4)).toBe(6640);
    expect(toUFloor(0.29)).toBe(29);
    expect(toUFloor(289.999)).toBe(28999);
  });

  it("never produces negative zero", () => {
    expect(Object.is(toU(-0.001), 0)).toBe(true);
    expect(Object.is(toMm(-0), 0)).toBe(true);
    expect(Object.is(toUCeil(-0.001), 0)).toBe(true);
  });

  it("converts back to mm with 0.01 precision", () => {
    expect(toMm(6350)).toBe(63.5);
    expect(toMm(1)).toBe(0.01);
    expect(roundMm(66.4 - 1.6 - 30.2)).toBe(34.6);
  });

  it("rounds to step multiples, including negatives", () => {
    expect(roundUpTo(601, 20)).toBe(620);
    expect(roundUpTo(600, 20)).toBe(600);
    expect(roundDownTo(619, 20)).toBe(600);
    expect(roundDownTo(-1, 20)).toBe(-20);
    expect(roundUpTo(-1, 20)).toBe(0);
    expect(roundUpTo(7, 0)).toBe(7);
  });

  it("does integer mulDiv and mm³ volumes", () => {
    expect(mulDiv(100_000, 1 << 20, 1 << 20)).toBe(100_000);
    expect(mulDiv(7, 3, 2)).toBe(10);
    expect(volMm3(10_000, 10_000, 10_000)).toBe(1_000_000);
    expect(volMm3(0, 10, 10)).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/layout/units.test.ts`

Expected: FAIL — `Failed to resolve import "./units" from "src/layout/units.test.ts"`.

- [ ] **Step 4: Write the implementation**

`src/layout/units.ts`:

```ts
/**
 * Lengths inside the layout engine are integer hundredths of a millimetre ("units").
 * Rounding rules:
 * - toUCeil for minimum sizes (a tray is never smaller than required),
 * - toUFloor for available space (the box is never assumed larger than measured),
 * - toU (nearest) for settings and stored positions.
 * All arithmetic on units stays integer; products stay below 2^53.
 */
export type U = number;

export const U_PER_MM = 100;
const EPS = 1e-6;

function noNegZero(n: number): number {
  return n === 0 ? 0 : n;
}

export function toU(mm: number): U {
  return noNegZero(Math.round(mm * U_PER_MM));
}

export function toUCeil(mm: number): U {
  return noNegZero(Math.ceil(mm * U_PER_MM - EPS));
}

export function toUFloor(mm: number): U {
  return noNegZero(Math.floor(mm * U_PER_MM + EPS));
}

export function toMm(u: U): number {
  return noNegZero(u / U_PER_MM);
}

/** Round an mm value to the nearest 0.01 mm (used for rotated compartment coordinates). */
export function roundMm(mm: number): number {
  return toMm(toU(mm));
}

/** Smallest multiple of step that is ≥ u. A step ≤ 0 returns u unchanged. */
export function roundUpTo(u: U, step: U): U {
  if (step <= 0) {
    return u;
  }
  const r = ((u % step) + step) % step;
  return r === 0 ? u : u + step - r;
}

/** Largest multiple of step that is ≤ u. A step ≤ 0 returns u unchanged. */
export function roundDownTo(u: U, step: U): U {
  if (step <= 0) {
    return u;
  }
  const r = ((u % step) + step) % step;
  return u - r;
}

/** floor(a·b / c) for non-negative integers with a·b < 2^53. */
export function mulDiv(a: number, b: number, c: number): number {
  return Math.floor((a * b) / c);
}

/** Volume in whole mm³ (rounded down) of a box given in units; 0 for degenerate boxes. */
export function volMm3(w: U, d: U, h: U): number {
  if (w <= 0 || d <= 0 || h <= 0) {
    return 0;
  }
  return Math.floor((w * d * h) / 1_000_000);
}

/** A footprint extent in units: w along X, d along Y. */
export interface Ext {
  w: U;
  d: U;
}

/** An axis-aligned floor rectangle in units (min corner + extent). */
export interface Rect extends Ext {
  x: U;
  y: U;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/layout/units.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 6: Commit**

From the repo root:

```bash
git add src/layout/types.ts src/layout/units.ts src/layout/units.test.ts
git commit -m "Add layout contract types and integer units"
```

### Task 2: Seeded PRNG (`xoshiro128**` via splitmix32)

**Files:**

- Create: `src/layout/prng.ts`
- Test: `src/layout/prng.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `type RngState = [number, number, number, number]`; `interface Rng { nextU32(): number; nextInt(n: number): number; nextFloat(): number; pick<T>(items: readonly T[]): T; state(): RngState }`; `splitmix32(seed: number): () => number`; `createRngFromState(initial: Readonly<RngState>): Rng`; `createRng(seed: number): Rng`.

- [ ] **Step 1: Write the failing test**

`src/layout/prng.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng, createRngFromState, splitmix32 } from "./prng";

describe("prng", () => {
  it("matches the xoshiro128** reference vector for state [1, 2, 3, 4]", () => {
    const r = createRngFromState([1, 2, 3, 4]);
    const out = Array.from({ length: 10 }, () => r.nextU32());
    expect(out).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597,
      4258142804,
    ]);
  });

  it("seeds through splitmix32 with a known sequence", () => {
    const sm = splitmix32(0);
    expect([sm(), sm(), sm()]).toEqual([1684164658, 3653269916, 2939563536]);
    expect(createRng(42).state()).toEqual([551831576, 144025891, 322543647, 3034809370]);
    const a = createRng(42);
    expect(Array.from({ length: 5 }, () => a.nextU32())).toEqual([
      660444221, 3652823732, 77672526, 910233633, 2297337756,
    ]);
  });

  it("produces known nextInt and nextFloat values", () => {
    const b = createRng(7);
    expect(Array.from({ length: 8 }, () => b.nextInt(10))).toEqual([3, 2, 0, 0, 5, 6, 0, 8]);
    const c = createRng(7);
    expect(c.nextFloat()).toBe(0.04900959390215576);
  });

  it("is deterministic per seed and differs between seeds", () => {
    const x = createRng(123);
    const y = createRng(123);
    const z = createRng(124);
    const xs = Array.from({ length: 20 }, () => x.nextU32());
    expect(Array.from({ length: 20 }, () => y.nextU32())).toEqual(xs);
    expect(Array.from({ length: 20 }, () => z.nextU32())).not.toEqual(xs);
  });

  it("keeps nextInt in range and rejects bad bounds", () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.nextInt(7);
      expect(v >= 0 && v < 7 && Number.isInteger(v)).toBe(true);
    }
    expect(r.nextInt(1)).toBe(0);
    expect(() => r.nextInt(0)).toThrow(RangeError);
    expect(() => r.nextInt(2.5)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
  });

  it("keeps nextFloat in [0, 1)", () => {
    const r = createRng(5);
    for (let i = 0; i < 1000; i++) {
      const f = r.nextFloat();
      expect(f >= 0 && f < 1).toBe(true);
    }
  });

  it("rejects an all-zero state", () => {
    expect(() => createRngFromState([0, 0, 0, 0])).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/prng.test.ts`

Expected: FAIL — `Failed to resolve import "./prng" from "src/layout/prng.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/prng.ts`:

```ts
/**
 * Seeded PRNG for the layout engine: xoshiro128** (Blackman & Vigna), state seeded
 * with splitmix32. Pure 32-bit integer arithmetic (Math.imul, shifts, xor), so the
 * sequence is identical on every JS engine. Math.random is banned in layout/.
 */
export type RngState = [number, number, number, number];

export interface Rng {
  /** Next raw 32-bit output as an unsigned integer. */
  nextU32(): number;
  /** Uniform integer in [0, n). n must be an integer in [1, 2^32]. Unbiased (rejection). */
  nextInt(n: number): number;
  /** Uniform float in [0, 1): nextU32() / 2^32, exact in a double. */
  nextFloat(): number;
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Copy of the internal state. */
  state(): RngState;
}

const TWO_32 = 4294967296;

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** splitmix32: a 32-bit seed → a stream of well-mixed 32-bit words (unsigned). */
export function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

export function createRngFromState(initial: Readonly<RngState>): Rng {
  let s0 = initial[0] | 0;
  let s1 = initial[1] | 0;
  let s2 = initial[2] | 0;
  let s3 = initial[3] | 0;
  if ((s0 | s1 | s2 | s3) === 0) {
    throw new RangeError("xoshiro128** state must not be all zero");
  }
  const nextU32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  };
  const nextInt = (n: number): number => {
    if (!Number.isInteger(n) || n < 1 || n > TWO_32) {
      throw new RangeError(`nextInt: n must be an integer in [1, 2^32], got ${n}`);
    }
    const limit = TWO_32 - (TWO_32 % n);
    let x = nextU32();
    while (x >= limit) {
      x = nextU32();
    }
    return x % n;
  };
  return {
    nextU32,
    nextInt,
    nextFloat: () => nextU32() / TWO_32,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError("pick: empty array");
      }
      return items[nextInt(items.length)] as T;
    },
    state: () => [s0 >>> 0, s1 >>> 0, s2 >>> 0, s3 >>> 0],
  };
}

/** A generator seeded from a 32-bit seed (seed is taken modulo 2^32). */
export function createRng(seed: number): Rng {
  const sm = splitmix32(seed);
  const state: RngState = [sm(), sm(), sm(), sm()];
  if ((state[0] | state[1] | state[2] | state[3]) === 0) {
    state[0] = 1;
  }
  return createRngFromState(state);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/prng.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/prng.test.ts src/layout/prng.ts
git commit -m "Add seeded xoshiro128** PRNG for the layout engine"
```

### Task 3: Bed fit and bed-sized splitting

**Files:**

- Create: `src/layout/bed.ts`
- Test: `src/layout/bed.test.ts`

**Interfaces:**

- Consumes: `U`, `Ext`, `Rect` (Task 1).
- Produces: `interface Bed { readonly w: U; readonly d: U; readonly z: U }`; `bedOrientations(bed): [Ext, Ext]`; `bedExcess(bed, w, d, h): U` (0 = fits, either XY rotation); `fitsBed(bed, w, d, h): boolean`; `splitForBed(bed, rect: Rect, gap: U): Rect[]`.

- [ ] **Step 1: Write the failing test**

`src/layout/bed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bedExcess, fitsBed, splitForBed, type Bed } from "./bed";

const bed: Bed = { w: 24600, d: 20000, z: 25000 };

describe("bed fit", () => {
  it("accepts either XY rotation", () => {
    expect(fitsBed(bed, 24600, 20000, 1000)).toBe(true);
    expect(fitsBed(bed, 20000, 24600, 1000)).toBe(true);
    expect(fitsBed(bed, 24601, 20000, 1000)).toBe(false);
    expect(fitsBed(bed, 1000, 1000, 25001)).toBe(false);
  });

  it("reports the smallest excess over both orientations", () => {
    expect(bedExcess(bed, 24700, 20000, 0)).toBe(100);
    expect(bedExcess(bed, 30000, 30000, 26000)).toBe(5400 + 10000 + 1000);
  });

  it("splits an oversized leftover into bed-sized pieces with gaps", () => {
    const pieces = splitForBed(bed, { x: 0, y: 0, w: 50000, d: 10000 }, 20);
    expect(pieces.length).toBe(3);
    for (const p of pieces) {
      expect(fitsBed(bed, p.w, p.d, 0)).toBe(true);
    }
    const total = pieces.reduce((s, p) => s + p.w, 0) + (pieces.length - 1) * 20;
    expect(total).toBe(50000);
    expect(pieces[1]?.x).toBe((pieces[0]?.w ?? 0) + 20);
  });

  it("returns the rect unchanged when it fits", () => {
    const r = { x: 5, y: 6, w: 100, d: 100 };
    expect(splitForBed(bed, r, 20)).toEqual([r]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/bed.test.ts`

Expected: FAIL — `Failed to resolve import "./bed" from "src/layout/bed.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/bed.ts`:

```ts
import type { Ext, Rect, U } from "./units";

/** Usable print volume in units: (bedX − 2·bedMargin) × (bedY − 2·bedMargin) × bedZ. */
export interface Bed {
  readonly w: U;
  readonly d: U;
  readonly z: U;
}

/** The two XY orientations a part can be printed in. */
export function bedOrientations(bed: Bed): [Ext, Ext] {
  return [
    { w: bed.w, d: bed.d },
    { w: bed.d, d: bed.w },
  ];
}

/** How far a part exceeds the bed in its best orientation (0 when it fits). */
export function bedExcess(bed: Bed, w: U, d: U, h: U): U {
  const [a, b] = bedOrientations(bed);
  const ea = Math.max(0, w - a.w) + Math.max(0, d - a.d);
  const eb = Math.max(0, w - b.w) + Math.max(0, d - b.d);
  return Math.min(ea, eb) + Math.max(0, h - bed.z);
}

export function fitsBed(bed: Bed, w: U, d: U, h: U): boolean {
  return bedExcess(bed, w, d, h) === 0;
}

function splitExtent(total: U, n: number, gap: U): U[] {
  const avail = total - (n - 1) * gap;
  const base = Math.floor(avail / n);
  const extra = avail - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Splits a rectangle with further guillotine cuts (trayGap between pieces) until every
 * piece fits the bed in XY. Uses the orientation needing fewer pieces (ties: as-is).
 * Returns [rect] unchanged when it already fits or when the bed is degenerate.
 */
export function splitForBed(bed: Bed, rect: Rect, gap: U): Rect[] {
  if (bedExcess(bed, rect.w, rect.d, 0) === 0 || bed.w <= 0 || bed.d <= 0) {
    return [rect];
  }
  let best: { nx: number; ny: number } | null = null;
  for (const o of bedOrientations(bed)) {
    const nx = Math.max(1, Math.ceil((rect.w + gap) / (o.w + gap)));
    const ny = Math.max(1, Math.ceil((rect.d + gap) / (o.d + gap)));
    if (best === null || nx * ny < best.nx * best.ny) {
      best = { nx, ny };
    }
  }
  if (best === null) {
    return [rect];
  }
  const ws = splitExtent(rect.w, best.nx, gap);
  const ds = splitExtent(rect.d, best.ny, gap);
  const out: Rect[] = [];
  let x = rect.x;
  for (const w of ws) {
    let y = rect.y;
    for (const d of ds) {
      out.push({ x, y, w, d });
      y += d + gap;
    }
    x += w + gap;
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/bed.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/bed.test.ts src/layout/bed.ts
git commit -m "Add bed fit checks for layout parts"
```

### Task 4: Layout context and test helpers

**Files:**

- Create: `src/layout/context.ts`
- Create: `src/layout/test-utils.ts` (test helper; Task 12 extends it)
- Test: `src/layout/context.test.ts`

**Interfaces:**

- Consumes: `effective(s)`, `topPlane(box, s)`, `DEFAULT_SETTINGS`, `MIN_FEATURE_MM`, `chamferMinimums(s, level)` (`../model/settings`); `minOuter(part, settings, opts)`, `wallFor(settings, lipped)` (`../sizing`); `MIN_GRIP`, `WALL_GROW_LIMIT`, `UPPER_TRAY_MIN_ABOVE_LIP`, `CHANNEL_DEPTH` (`../sizing/constants`); `OuterSize`, `RealizeOptions`, `TrayPartReq`, `TrayRequirement`, `CompartmentReq`, `TrayVariant` (`../sizing/types`); `Bed` (Task 3); units (Task 1). Sizing's constants are imported, never re-derived: the grip size, the wall growth limit, the minimum height above the lip and the finger channel depth each have one definition.
- Produces: `type Measure = (part: TrayPartReq, settings: Settings, opts: RealizeOptions) => OuterSize`; constants `INF_U`, `MAX_LEVELS = 4`, `MAX_DEPTH = 32`, `SLIVER_U = 1200`, `MIN_PIECE_U = 300`, `GRIP_U = toU(MIN_GRIP)` (2500), `PLAY_LIMIT_U = 150`; `interface PartRef { req; variant; part }`; `interface PartMetrics { w; d; h; capW; capD; elasticH }`; `interface FixedSize { w; d; h; rotated }`; `interface Ctx { input; floorW; floorD; topPlane; boxClearance; gap; inset; layer; lipOn; lipHeight; upperMinH; wall; floor; minPiece; bed; sizeLocks; part(ref); partId(ref); metrics(ref, lipped, level); refsOfKey(trayKey) }`; `partId(ref): number`; `createCtx(input: LayoutInput, measure: Measure = minOuter): Ctx`; `withSizeLocks(ctx, sizeLocks): Ctx`; `printedHeight(ctx, h, lipped): U` (a lipped tray prints `h + lipHeight` tall: the bed's Z limit, hard rule 5, applies to that). Test helpers: `TEST_BOX`, `TEST_PRINTER`, `comp(o)` (`o.fingerCut` forces or suppresses the front wall cutout), `part(trayKey, compartments, rotatable?)`, `variant(id, parts)`, `req(key, variants, o?)`, `boxReq(key, minW, minD, minH, o?)`, `makeInput(requirements, o?)`, `fakeMeasure: Measure` (outer = inner + 2 × 2 mm walls, 3 mm when lipped; h = minH + 1.2).

- [ ] **Step 1: Write the test helpers**

`src/layout/test-utils.ts`:

```ts
import { DEFAULT_SETTINGS } from "../model/settings";
import { CHANNEL_DEPTH, MIN_GRIP } from "../sizing/constants";
import type { Access, Box, Lock, Printer, Settings } from "../model/types";
import type { CompartmentReq, TrayPartReq, TrayRequirement, TrayVariant } from "../sizing/types";
import type { Measure } from "./context";
import type { LayoutInput } from "./types";

export const TEST_BOX: Box = {
  innerWidth: 300,
  innerDepth: 200,
  innerHeight: 60,
  headroom: 0,
  headroomCoverage: "full",
  storedOnSide: false,
};

export const TEST_PRINTER: Printer = {
  bedX: 256,
  bedY: 256,
  bedZ: 256,
  bedMargin: 5,
  layerHeight: 0.2,
};

export interface CompOpts {
  minW: number;
  minD: number;
  minH: number;
  elastic?: Partial<CompartmentReq["elastic"]>;
  kind?: CompartmentReq["kind"];
  contents?: string;
  /** Forces (true) or suppresses (false) the front wall cutout. */
  fingerCut?: boolean;
}

/**
 * A compartment. It asks for a front wall cutout when `fingerCut` says so or, by default, when
 * a side is under the MIN_GRIP size.
 */
export function comp(o: CompOpts): CompartmentReq {
  const needsCut = o.fingerCut ?? Math.min(o.minW, o.minD) < MIN_GRIP;
  return {
    componentId: "c",
    contents: o.contents ?? `${o.minW}x${o.minD}x${o.minH}`,
    kind: o.kind ?? "well",
    minW: o.minW,
    minD: o.minD,
    minH: o.minH,
    elastic: { w: false, d: false, h: false, ...o.elastic },
    features: needsCut
      ? [{ type: "wallCutout", side: "front", depthFraction: CHANNEL_DEPTH, floorNotch: false }]
      : [],
  };
}

export function part(
  trayKey: string,
  compartments: CompartmentReq[],
  rotatable = true,
): TrayPartReq {
  return { trayKey, arrangement: "strip", compartments, rotatable };
}

export function variant(id: string, parts: TrayPartReq[]): TrayVariant {
  return { id, parts };
}

export function req(
  key: string,
  variants: TrayVariant[],
  o: { access?: Access; loose?: boolean } = {},
): TrayRequirement {
  return {
    key,
    componentIds: [key],
    access: o.access ?? "sometimes",
    loose: o.loose ?? false,
    variants,
  };
}

/** One requirement, one variant, one part, one compartment of the given inner minimum. */
export function boxReq(
  key: string,
  minW: number,
  minD: number,
  minH: number,
  o: {
    access?: Access;
    loose?: boolean;
    rotatable?: boolean;
    elastic?: Partial<CompartmentReq["elastic"]>;
  } = {},
): TrayRequirement {
  return req(
    key,
    [
      variant("only", [
        part(
          `${key}:p0:0`,
          [comp({ minW, minD, minH, elastic: o.elastic, contents: key })],
          o.rotatable ?? true,
        ),
      ]),
    ],
    o,
  );
}

export function makeInput(
  requirements: TrayRequirement[],
  o: {
    box?: Partial<Box>;
    printer?: Partial<Printer>;
    settings?: Partial<Settings>;
    locks?: Lock[];
  } = {},
): LayoutInput {
  return {
    requirements,
    box: { ...TEST_BOX, ...o.box },
    printer: { ...TEST_PRINTER, ...o.printer },
    settings: { ...DEFAULT_SETTINGS, ...o.settings },
    locks: o.locks ?? [],
    inputsHash: "test-hash",
    appVersion: "0.0.0-test",
  };
}

/**
 * Fixed-size measure for unit tests: outer = inner minimum + 2 × 2 mm walls
 * (+1 mm per side when lipped), h = minH + 1.2 floor. Independent of sizing internals.
 */
export const fakeMeasure: Measure = (p, _settings, opts) => {
  const wall = opts.lipped ? 3 : 2;
  const w = p.compartments.reduce((s, c) => s + c.minW, 0) + 2 * wall;
  const d = Math.max(...p.compartments.map((c) => c.minD)) + 2 * wall;
  const h = Math.max(...p.compartments.map((c) => c.minH)) + 1.2;
  return { w, d, h };
};
```

- [ ] **Step 2: Write the failing test**

`src/layout/context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCtx, INF_U, MIN_PIECE_U, withSizeLocks } from "./context";
import { boxReq, fakeMeasure, makeInput } from "./test-utils";

describe("createCtx", () => {
  it("converts box, printer and settings to integer units", () => {
    const ctx = createCtx(makeInput([]), fakeMeasure);
    expect(ctx.floorW).toBe(30000 - 2 * 50);
    expect(ctx.floorD).toBe(20000 - 2 * 50);
    expect(ctx.topPlane).toBe(6000);
    expect(ctx.gap).toBe(20);
    expect(ctx.inset).toBe(145);
    expect(ctx.layer).toBe(20);
    expect(ctx.upperMinH).toBe(500);
    expect(ctx.bed).toEqual({ w: 24600, d: 24600, z: 25600 });
  });

  it("applies the fit multiplier to box clearance, gap and lip play", () => {
    const ctx = createCtx(makeInput([], { settings: { fit: 1.4 } }), fakeMeasure);
    expect(ctx.boxClearance).toBe(70);
    expect(ctx.gap).toBe(28);
    expect(ctx.inset).toBe(155);
  });

  it("measures parts in ceil units with slack capacities", () => {
    const input = makeInput([
      boxReq("a", 50.001, 40, 20),
      boxReq("b", 50, 40, 20, { elastic: { w: true, h: true } }),
    ]);
    const ctx = createCtx(input, fakeMeasure);
    const a = ctx.metrics({ req: 0, variant: 0, part: 0 }, false, 0);
    expect(a.w).toBe(5401);
    expect(a.d).toBe(4400);
    expect(a.h).toBe(2120);
    expect(a.capW).toBe(320);
    expect(a.elasticH).toBe(false);
    const b = ctx.metrics({ req: 1, variant: 0, part: 0 }, true, 1);
    expect(b.w).toBe(5600);
    expect(b.capW).toBe(INF_U);
    expect(b.capD).toBe(320);
    expect(b.elasticH).toBe(true);
  });

  it("indexes parts by trayKey and carries size locks", () => {
    const ctx = createCtx(makeInput([boxReq("a", 30, 30, 10)]), fakeMeasure);
    expect(ctx.refsOfKey("a:p0:0")).toEqual([{ req: 0, variant: 0, part: 0 }]);
    expect(ctx.refsOfKey("nope")).toEqual([]);
    const locked = withSizeLocks(ctx, new Map([[0, { w: 1, d: 2, h: 3, rotated: false }]]));
    expect(locked.sizeLocks.get(0)?.h).toBe(3);
    expect(locked.metrics({ req: 0, variant: 0, part: 0 }, false, 0).w).toBe(3400);
  });

  it("handles headroom at or above the inner height without throwing", () => {
    const ctx = createCtx(makeInput([], { box: { headroom: 70 } }), fakeMeasure);
    expect(ctx.topPlane).toBe(-1000);
  });

  it("rounds wall and floor up like sizing and sizes the thinnest leftover for the chamfer", () => {
    const settings = { wall: 0.5, floor: 1.234, bottomChamfer: 3 };
    const ctx = createCtx(makeInput([], { settings }), fakeMeasure);
    expect(ctx.wall).toBe(90); // MIN_WALL_MM
    expect(ctx.floor).toBe(124);
    expect(ctx.minPiece).toBe(760); // 2 × (3 + 0.8)
    expect(createCtx(makeInput([]), fakeMeasure).minPiece).toBe(MIN_PIECE_U);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/layout/context.test.ts`

Expected: FAIL — `Failed to resolve import "./context" from "src/layout/context.test.ts"`.

- [ ] **Step 4: Write the implementation**

`src/layout/context.ts`:

```ts
import { MIN_FEATURE_MM, chamferMinimums, effective, topPlane } from "../model/settings";
import type { Settings } from "../model/types";
import { minOuter, wallFor } from "../sizing";
import { MIN_GRIP, UPPER_TRAY_MIN_ABOVE_LIP, WALL_GROW_LIMIT } from "../sizing/constants";
import type { OuterSize, RealizeOptions, TrayPartReq, TrayRequirement } from "../sizing/types";
import type { Bed } from "./bed";
import type { LayoutInput } from "./types";
import { toU, toUCeil, toUFloor, type U } from "./units";

/** Same signature as sizing's minOuter; injectable so unit tests can use fixed sizes. */
export type Measure = (part: TrayPartReq, settings: Settings, opts: RealizeOptions) => OuterSize;

/** "No limit" for slack capacities. */
export const INF_U: U = 1_000_000_000;
/** Most trays in one stack. */
export const MAX_LEVELS = 4;
/** Longest guillotine path accepted from locks or stored layouts. */
export const MAX_DEPTH = 32;
/** Leftover regions narrower than this are absorbed into the neighbouring tray (spec §7.2). */
export const SLIVER_U: U = 1200;
/**
 * Thinnest leftover piece that is ever printed (forced by a bed or size-lock cap); Ctx.minPiece
 * raises it to what the bottom chamfer needs.
 */
export const MIN_PIECE_U: U = 300;
/** Smallest inner dimension that counts as a grip (hard rule 8): sizing's MIN_GRIP. */
export const GRIP_U: U = toU(MIN_GRIP);
/** Nominal lateral play above this is penalized and warned about (hard rule 1). */
export const PLAY_LIMIT_U: U = 150;

export interface PartRef {
  readonly req: number;
  readonly variant: number;
  readonly part: number;
}

/** Minimum outer size of a part (unrotated frame) and how much slack it absorbs per axis. */
export interface PartMetrics {
  readonly w: U;
  readonly d: U;
  readonly h: U;
  /** Footprint slack absorbable without a spare compartment (elastic axis → INF_U). */
  readonly capW: U;
  readonly capD: U;
  /** Some compartment can grow deeper (scoop): height slack goes here first. */
  readonly elasticH: boolean;
}

/** A size lock in units, in the box frame (after rotation). */
export interface FixedSize {
  readonly w: U;
  readonly d: U;
  readonly h: U;
  readonly rotated: boolean;
}

export interface Ctx {
  readonly input: LayoutInput;
  /** Box floor minus 2·boxClearance. */
  readonly floorW: U;
  readonly floorD: U;
  readonly topPlane: U;
  readonly boxClearance: U;
  readonly gap: U;
  /** Per-level inset per side: lip.thickness + effective lip play. */
  readonly inset: U;
  readonly layer: U;
  readonly lipOn: boolean;
  /** Minimum h of a tray at level ≥ 1 when the lip is on: lip.height + UPPER_TRAY_MIN_ABOVE_LIP (3 mm). */
  readonly upperMinH: U;
  /** Base outer wall and floor as sizing writes them: wallFor, floor ≥ MIN_FEATURE_MM, rounded up. */
  readonly wall: U;
  readonly floor: U;
  /** Thinnest leftover piece: MIN_PIECE_U, or more for the level-0 bottom chamfer. */
  readonly minPiece: U;
  readonly bed: Bed;
  /** Size locks keyed by partId. */
  readonly sizeLocks: ReadonlyMap<number, FixedSize>;
  part(ref: PartRef): TrayPartReq | undefined;
  partId(ref: PartRef): number;
  metrics(ref: PartRef, lipped: boolean, level: number): PartMetrics;
  refsOfKey(trayKey: string): PartRef[];
}

export function partId(ref: PartRef): number {
  return (ref.req * 256 + ref.variant) * 256 + ref.part;
}

function capacity(part: TrayPartReq, axis: "w" | "d", wallCap: U): U {
  const elastic = part.compartments.some((c) => c.elastic[axis] || c.spacerAxis === axis);
  return elastic ? INF_U : wallCap;
}

export function createCtx(input: LayoutInput, measure: Measure = minOuter): Ctx {
  const { box, printer, settings } = input;
  const eff = effective(settings);
  const boxClearance = toU(eff.boxClearance);
  // Rounded up like sizing (roadmap §4.7): never below MIN_WALL_MM.
  const wall = toUCeil(wallFor(settings, false));
  // Walls may thicken inward up to min(2 × wall, WALL_GROW_LIMIT = 4 mm) on both sides (spec §7.2).
  const wallCap = Math.max(0, 2 * (Math.min(2 * wall, toU(WALL_GROW_LIMIT)) - wall));
  const cache = new Map<number, PartMetrics>();
  const byKey = new Map<string, PartRef[]>();
  input.requirements.forEach((r: TrayRequirement, req) => {
    r.variants.forEach((v, variant) => {
      v.parts.forEach((p, part) => {
        const list = byKey.get(p.trayKey) ?? [];
        list.push({ req, variant, part });
        byKey.set(p.trayKey, list);
      });
    });
  });
  const part = (ref: PartRef): TrayPartReq | undefined =>
    input.requirements[ref.req]?.variants[ref.variant]?.parts[ref.part];
  return {
    input,
    floorW: toUFloor(box.innerWidth) - 2 * boxClearance,
    floorD: toUFloor(box.innerDepth) - 2 * boxClearance,
    topPlane: toUFloor(topPlane(box, settings)),
    boxClearance,
    gap: toU(eff.trayGap),
    inset: toU(settings.lip.thickness + eff.lipPlay),
    layer: Math.max(1, toU(printer.layerHeight)),
    lipOn: settings.lip.enabled,
    upperMinH: toU(settings.lip.height) + toU(UPPER_TRAY_MIN_ABOVE_LIP),
    wall,
    floor: toUCeil(Math.max(settings.floor, MIN_FEATURE_MM)),
    minPiece: Math.max(MIN_PIECE_U, toUCeil(chamferMinimums(settings, 0).side)),
    bed: {
      w: toUFloor(printer.bedX - 2 * printer.bedMargin),
      d: toUFloor(printer.bedY - 2 * printer.bedMargin),
      z: toUFloor(printer.bedZ),
    },
    sizeLocks: new Map(),
    part,
    partId,
    metrics(ref, lipped, level) {
      const key = partId(ref) * 32 + (lipped ? 16 : 0) + Math.min(level, 15);
      const hit = cache.get(key);
      if (hit) {
        return hit;
      }
      const p = part(ref);
      if (!p) {
        throw new RangeError(`unknown part ${ref.req}/${ref.variant}/${ref.part}`);
      }
      const o = measure(p, settings, { lipped, level });
      const m: PartMetrics = {
        w: toUCeil(o.w),
        d: toUCeil(o.d),
        h: toUCeil(o.h),
        capW: capacity(p, "w", wallCap),
        capD: capacity(p, "d", wallCap),
        elasticH: p.compartments.some((c) => c.elastic.h),
      };
      cache.set(key, m);
      return m;
    },
    refsOfKey: (trayKey) => byKey.get(trayKey) ?? [],
  };
}

export function withSizeLocks(ctx: Ctx, sizeLocks: ReadonlyMap<number, FixedSize>): Ctx {
  return { ...ctx, sizeLocks };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/layout/context.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 6: Commit**

From the repo root:

```bash
git add src/layout/context.ts src/layout/context.test.ts src/layout/test-utils.ts
git commit -m "Add layout context with cached part metrics"
```

### Task 5: Guillotine tree

**Files:**

- Create: `src/layout/tree.ts`
- Modify: `src/layout/test-utils.ts` (add `item`)
- Test: `src/layout/tree.test.ts`

**Interfaces:**

- Consumes: `mulDiv`, `Ext`, `Rect`, `U` (Task 1).
- Produces: `type Axis = "x" | "y"`; `interface StackItem { req; variant; part; rotated }`; `interface Leaf { kind: "leaf"; stack: readonly StackItem[]; frozen: boolean }`; `interface Cut { kind: "cut"; axis; share; a; b }`; `type TreeNode = Leaf | Cut`; `interface Tree { root: TreeNode; variants: readonly number[] }`; `SHARE_MAX = 2^20`, `SHARE_HALF`; `leaf(stack, frozen?)`, `cut(axis, a, b, share?)`, `otherAxis(axis)`, `nodeAt(root, path)`, `replaceAt(root, path, node)`, `leaves(root): LeafAt[]`, `cuts(root): CutAt[]`, `itemsOf(root)`, `removeLeafAt(root, path): TreeNode | null`, `splitLeafAt(root, path, axis, added, addedFirst)`, `minExtents(gap, leafMin): (node) => Ext`, `splitRect(cut, rect, gap, minOf): [Rect, Rect]`, `placeLeaves(root, rect, gap, leafMin: (leaf: Leaf) => Ext): Placement` with `Placement { leaves: PlacedLeaf[]; min: Ext }`, `PlacedLeaf { path; leaf; rect }`. Test helper (added to `test-utils.ts`; the stack, fill and score tests use it too): `item(req, rotated?): StackItem`.

- [ ] **Step 1: Write the failing test**

First add the `item` helper to the shared test helpers.

Add to the imports of `src/layout/test-utils.ts`:

```ts
import type { StackItem } from "./tree";
```

Append to `src/layout/test-utils.ts`:

```ts
/** A stack item for part 0 of variant 0 of requirement `req`. */
export function item(req: number, rotated = false): StackItem {
  return { req, variant: 0, part: 0, rotated };
}
```

Then the test.

`src/layout/tree.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { item } from "./test-utils";
import {
  cut,
  cuts,
  itemsOf,
  leaf,
  leaves,
  nodeAt,
  placeLeaves,
  removeLeafAt,
  replaceAt,
  SHARE_MAX,
  splitLeafAt,
} from "./tree";

describe("guillotine tree", () => {
  const t = cut("x", leaf([item(0)]), cut("y", leaf([item(1)]), leaf([item(2), item(3)])));

  it("enumerates leaves and cuts with 0/1 paths", () => {
    expect(leaves(t).map((l) => l.path)).toEqual(["0", "10", "11"]);
    expect(cuts(t).map((c) => c.path)).toEqual(["", "1"]);
    expect(itemsOf(t).map((i) => i.req)).toEqual([0, 1, 2, 3]);
    expect(nodeAt(t, "11")?.kind).toBe("leaf");
    expect(nodeAt(t, "01")).toBeUndefined();
  });

  it("replaces nodes persistently, sharing untouched subtrees", () => {
    const t2 = replaceAt(t, "10", leaf([item(9)]));
    expect(itemsOf(t2).map((i) => i.req)).toEqual([0, 9, 2, 3]);
    expect(itemsOf(t).map((i) => i.req)).toEqual([0, 1, 2, 3]);
    expect(t2.kind === "cut" && t.kind === "cut" && t2.a === t.a).toBe(true);
    expect(() => replaceAt(t, "00", leaf([]))).toThrow(RangeError);
  });

  it("removes a leaf by promoting its sibling and splits leaves", () => {
    const r = removeLeafAt(t, "10");
    expect(r && leaves(r).map((l) => l.path)).toEqual(["0", "1"]);
    expect(removeLeafAt(leaf([]), "")).toBeNull();
    const s = splitLeafAt(t, "0", "y", leaf([item(7)]), true);
    expect(leaves(s).map((l) => `${l.path}:${l.leaf.stack[0]?.req ?? "-"}`)).toEqual([
      "00:7",
      "01:0",
      "10:1",
      "11:2",
    ]);
  });

  it("tiles the rectangle exactly: child extents + gap = parent extent", () => {
    const fixed = { w: 1000, d: 800 };
    const p = placeLeaves(t, { x: 0, y: 0, w: 5000, d: 3000 }, 20, () => fixed);
    expect(p.min).toEqual({ w: 2020, d: 1620 });
    const [a, b, c] = p.leaves.map((l) => l.rect);
    expect(a).toEqual({
      x: 0,
      y: 0,
      w: 1000 + Math.floor((2980 * (SHARE_MAX / 2)) / SHARE_MAX),
      d: 3000,
    });
    expect((a?.w ?? 0) + 20 + (b?.w ?? 0)).toBe(5000);
    expect(b?.x).toBe((a?.w ?? 0) + 20);
    expect((b?.d ?? 0) + 20 + (c?.d ?? 0)).toBe(3000);
    expect(c?.y).toBe((b?.d ?? 0) + 20);
  });

  it("gives all slack to child a at share = SHARE_MAX and none at 0", () => {
    const fixed = { w: 1000, d: 800 };
    const full = placeLeaves(
      cut("x", leaf([]), leaf([]), SHARE_MAX),
      { x: 0, y: 0, w: 3000, d: 800 },
      20,
      () => fixed,
    );
    expect(full.leaves.map((l) => l.rect.w)).toEqual([1980, 1000]);
    const none = placeLeaves(
      cut("x", leaf([]), leaf([]), 0),
      { x: 0, y: 0, w: 3000, d: 800 },
      20,
      () => fixed,
    );
    expect(none.leaves.map((l) => l.rect.w)).toEqual([1000, 1980]);
  });

  it("falls back to minimums when the rectangle is too small", () => {
    const p = placeLeaves(
      cut("x", leaf([]), leaf([])),
      { x: 0, y: 0, w: 1500, d: 500 },
      20,
      () => ({ w: 1000, d: 800 }),
    );
    expect(p.min.w).toBe(2020);
    expect(p.leaves.map((l) => l.rect.w)).toEqual([1000, 1000]);
    expect(p.leaves.map((l) => l.rect.d)).toEqual([800, 800]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/tree.test.ts`

Expected: FAIL — `Failed to resolve import "./tree" from "src/layout/tree.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/tree.ts`:

```ts
import { mulDiv, type Ext, type Rect, type U } from "./units";

/**
 * Guillotine tree over the box floor. Nodes are immutable: every edit copies the nodes on
 * the path from the root and shares the rest (that is the "clone"). A cut with axis "x"
 * splits the X extent (children side by side along X, a on the low side); axis "y" splits Y.
 * Paths: "" is the root, then "0" for child a and "1" for child b per depth.
 * Cut positions are integers derived from the subtree minimums plus a share of the slack
 * (`share / SHARE_MAX` of it goes to child a), so a tree always tiles its rectangle exactly
 * and moving a cut means changing its share.
 */
export type Axis = "x" | "y";

export interface StackItem {
  readonly req: number;
  readonly variant: number;
  readonly part: number;
  readonly rotated: boolean;
}

export interface Leaf {
  readonly kind: "leaf";
  /** Bottom → top. Empty = a leftover region. */
  readonly stack: readonly StackItem[];
  /** Membership and order are locked (stack or position lock); the leaf itself may move. */
  readonly frozen: boolean;
}

export interface Cut {
  readonly kind: "cut";
  readonly axis: Axis;
  readonly share: number;
  readonly a: TreeNode;
  readonly b: TreeNode;
}

export type TreeNode = Leaf | Cut;

export interface Tree {
  readonly root: TreeNode;
  /** Active variant index per requirement. */
  readonly variants: readonly number[];
}

/** 2^20 > the largest slack in units (1000 mm = 100 000), so a share can hit any integer split. */
export const SHARE_MAX = 1 << 20;
export const SHARE_HALF = SHARE_MAX / 2;

export function leaf(stack: readonly StackItem[], frozen = false): Leaf {
  return { kind: "leaf", stack, frozen };
}

export function cut(axis: Axis, a: TreeNode, b: TreeNode, share = SHARE_HALF): Cut {
  return { kind: "cut", axis, share, a, b };
}

export function otherAxis(axis: Axis): Axis {
  return axis === "x" ? "y" : "x";
}

export function nodeAt(root: TreeNode, path: string): TreeNode | undefined {
  let node: TreeNode = root;
  for (const ch of path) {
    if (node.kind === "leaf") {
      return undefined;
    }
    node = ch === "0" ? node.a : node.b;
  }
  return node;
}

/** Returns a new root with the node at `path` replaced. Throws on a path that does not exist. */
export function replaceAt(root: TreeNode, path: string, node: TreeNode): TreeNode {
  if (path === "") {
    return node;
  }
  if (root.kind === "leaf") {
    throw new RangeError(`replaceAt: no node at path ${path}`);
  }
  const head = path.charAt(0);
  const rest = path.slice(1);
  return head === "0"
    ? { ...root, a: replaceAt(root.a, rest, node) }
    : { ...root, b: replaceAt(root.b, rest, node) };
}

export interface LeafAt {
  readonly path: string;
  readonly leaf: Leaf;
}

export interface CutAt {
  readonly path: string;
  readonly cut: Cut;
}

/** Leaves in order (a before b). */
export function leaves(root: TreeNode): LeafAt[] {
  const out: LeafAt[] = [];
  const walk = (node: TreeNode, path: string): void => {
    if (node.kind === "leaf") {
      out.push({ path, leaf: node });
      return;
    }
    walk(node.a, `${path}0`);
    walk(node.b, `${path}1`);
  };
  walk(root, "");
  return out;
}

export function cuts(root: TreeNode): CutAt[] {
  const out: CutAt[] = [];
  const walk = (node: TreeNode, path: string): void => {
    if (node.kind === "leaf") {
      return;
    }
    out.push({ path, cut: node });
    walk(node.a, `${path}0`);
    walk(node.b, `${path}1`);
  };
  walk(root, "");
  return out;
}

export function itemsOf(root: TreeNode): StackItem[] {
  return leaves(root).flatMap((l) => [...l.leaf.stack]);
}

/** Replaces the leaf at `path` by its sibling's subtree. Returns null for the root leaf. */
export function removeLeafAt(root: TreeNode, path: string): TreeNode | null {
  if (path === "") {
    return null;
  }
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(root, parentPath);
  if (!parent || parent.kind !== "cut") {
    throw new RangeError(`removeLeafAt: no leaf at path ${path}`);
  }
  const sibling = path.endsWith("0") ? parent.b : parent.a;
  return replaceAt(root, parentPath, sibling);
}

/** Splits the leaf at `path` into a cut holding the old leaf and `added` (added first when addedFirst). */
export function splitLeafAt(
  root: TreeNode,
  path: string,
  axis: Axis,
  added: Leaf,
  addedFirst: boolean,
): TreeNode {
  const old = nodeAt(root, path);
  if (!old || old.kind !== "leaf") {
    throw new RangeError(`splitLeafAt: no leaf at path ${path}`);
  }
  const node = addedFirst ? cut(axis, added, old) : cut(axis, old, added);
  return replaceAt(root, path, node);
}

export interface PlacedLeaf {
  readonly path: string;
  readonly leaf: Leaf;
  readonly rect: Rect;
}

export interface Placement {
  readonly leaves: PlacedLeaf[];
  /** Minimum extent of the whole tree; larger than the floor = overflow. */
  readonly min: Ext;
}

/** Memoized minimum extent of every subtree: an X cut adds widths + gap, a Y cut depths + gap. */
export function minExtents(gap: U, leafMin: (leaf: Leaf) => Ext): (node: TreeNode) => Ext {
  const mins = new Map<TreeNode, Ext>();
  const minOf = (node: TreeNode): Ext => {
    const hit = mins.get(node);
    if (hit) {
      return hit;
    }
    let ext: Ext;
    if (node.kind === "leaf") {
      ext = leafMin(node);
    } else {
      const a = minOf(node.a);
      const b = minOf(node.b);
      ext =
        node.axis === "x"
          ? { w: a.w + gap + b.w, d: Math.max(a.d, b.d) }
          : { w: Math.max(a.w, b.w), d: a.d + gap + b.d };
    }
    mins.set(node, ext);
    return ext;
  };
  return minOf;
}

/** Child rectangles of a cut inside `r`, exactly as placeLeaves allocates them. */
export function splitRect(
  node: Cut,
  r: Rect,
  gap: U,
  minOf: (node: TreeNode) => Ext,
): [Rect, Rect] {
  const ma = minOf(node.a);
  const mb = minOf(node.b);
  if (node.axis === "x") {
    const slack = r.w - (ma.w + gap + mb.w);
    const wa = ma.w + (slack > 0 ? mulDiv(slack, node.share, SHARE_MAX) : 0);
    const wb = slack >= 0 ? r.w - gap - wa : mb.w;
    return [
      { x: r.x, y: r.y, w: wa, d: Math.max(r.d, ma.d) },
      { x: r.x + wa + gap, y: r.y, w: wb, d: Math.max(r.d, mb.d) },
    ];
  }
  const slack = r.d - (ma.d + gap + mb.d);
  const da = ma.d + (slack > 0 ? mulDiv(slack, node.share, SHARE_MAX) : 0);
  const db = slack >= 0 ? r.d - gap - da : mb.d;
  return [
    { x: r.x, y: r.y, w: Math.max(r.w, ma.w), d: da },
    { x: r.x, y: r.y + da + gap, w: Math.max(r.w, mb.w), d: db },
  ];
}

/**
 * Assigns every leaf a rectangle. Neighbouring leaves are separated by exactly `gap`;
 * along each cut, child extents + gap = parent extent whenever the parent's slack is ≥ 0.
 * With negative slack (overflow), children get their minimums and may extend past `rect`.
 */
export function placeLeaves(
  root: TreeNode,
  rect: Rect,
  gap: U,
  leafMin: (leaf: Leaf) => Ext,
): Placement {
  const minOf = minExtents(gap, leafMin);
  const out: PlacedLeaf[] = [];
  const allocate = (node: TreeNode, r: Rect, path: string): void => {
    if (node.kind === "leaf") {
      out.push({ path, leaf: node, rect: r });
      return;
    }
    const [ra, rb] = splitRect(node, r, gap, minOf);
    allocate(node.a, ra, `${path}0`);
    allocate(node.b, rb, `${path}1`);
  };
  allocate(root, rect, "");
  return { leaves: out, min: minOf(root) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/tree.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/tree.test.ts src/layout/tree.ts src/layout/test-utils.ts
git commit -m "Add guillotine tree with exact integer tiling"
```

### Task 6: Stack feasibility (insets, footprint, heights)

**Files:**

- Create: `src/layout/stack.ts`
- Test: `src/layout/stack.test.ts`

**Interfaces:**

- Consumes: `Ctx`, `FixedSize`, `INF_U`, `SLIVER_U` (Task 4); `StackItem` (Task 5); `roundUpTo`, `roundDownTo`, `Ext`, `U` (Task 1); test helper `item` (Task 5).
- Produces: `interface Level { item; level; lipped; minW; minD; minH; capW; capD; elasticH; fixed }` (box frame); `stackLevels(ctx, stack): Level[]`; `stackMinFootprint(ctx, levels): Ext` (leaf ≥ req_k + 2·k·inset); `stackLockCap(ctx, levels): Ext`; `stackAbsorb(ctx, levels, foot): Ext`; `interface StackHeights { h: U[]; overflow: U; lockOverflow: U }`; `stackHeights(ctx, levels): StackHeights` (Σ h = topPlane, layer rounding, top takes the remainder).

- [ ] **Step 1: Write the failing test**

`src/layout/stack.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCtx, INF_U, withSizeLocks, type Ctx } from "./context";
import { stackAbsorb, stackHeights, stackLevels, stackLockCap, stackMinFootprint } from "./stack";
import { boxReq, fakeMeasure, item, makeInput } from "./test-utils";

function ctxFor(box: { innerHeight?: number; headroom?: number } = {}): Ctx {
  return createCtx(
    makeInput(
      [
        boxReq("big", 100, 60, 20),
        boxReq("small", 50, 40, 10),
        boxReq("scoop", 50, 40, 10, { elastic: { w: true, d: true, h: true } }),
        boxReq("tall", 50, 40, 45),
        boxReq("flat", 50, 40, 2),
      ],
      { box },
    ),
    fakeMeasure,
  );
}

describe("stack feasibility", () => {
  it("applies rotation and the lipped measure per level", () => {
    const ctx = ctxFor();
    const levels = stackLevels(ctx, [item(0), item(1, true)]);
    expect(levels[0]?.lipped).toBe(true);
    expect(levels[1]?.lipped).toBe(false);
    expect(levels[0]?.minW).toBe(10600);
    expect(levels[1]?.minW).toBe(4400);
    expect(levels[1]?.minD).toBe(5400);
    expect(levels[1]?.minH).toBe(1120);
    const thin = stackLevels(ctx, [item(0), item(4)]);
    expect(thin[1]?.minH).toBe(ctx.upperMinH);
  });

  it("requires leaf ≥ req_k + 2·k·inset", () => {
    const ctx = ctxFor();
    const levels = stackLevels(ctx, [item(1), item(0)]);
    const f = stackMinFootprint(ctx, levels);
    expect(f.w).toBe(Math.max(5600, 10400 + 2 * ctx.inset));
    expect(f.d).toBe(Math.max(4600, 6400 + 2 * ctx.inset));
    expect(stackMinFootprint(ctx, [])).toEqual({ w: 1200, d: 1200 });
  });

  it("reports absorbable slack: elastic axes unlimited, else wall growth", () => {
    const ctx = ctxFor();
    const solo = stackLevels(ctx, [item(1)]);
    expect(stackAbsorb(ctx, solo, stackMinFootprint(ctx, solo))).toEqual({ w: 320, d: 320 });
    const scoop = stackLevels(ctx, [item(2)]);
    expect(stackAbsorb(ctx, scoop, stackMinFootprint(ctx, scoop))).toEqual({ w: INF_U, d: INF_U });
    expect(stackLockCap(ctx, solo)).toEqual({ w: INF_U, d: INF_U });
  });

  it("makes stack heights sum to topPlane, rounding all but the top tray", () => {
    const ctx = ctxFor();
    const h = stackHeights(ctx, stackLevels(ctx, [item(0), item(1)]));
    expect(h.overflow).toBe(0);
    expect(h.h[0]).toBe(2120);
    expect((h.h[0] ?? 0) % ctx.layer).toBe(0);
    expect(h.h.reduce((s, v) => s + v, 0)).toBe(ctx.topPlane);
  });

  it("gives height slack to the lowest scoop tray in whole layers", () => {
    const ctx = ctxFor({ innerHeight: 60.05 });
    const h = stackHeights(ctx, stackLevels(ctx, [item(2), item(4)]));
    expect(h.h[1]).toBe(ctx.upperMinH + 5);
    expect((h.h[0] ?? 0) % ctx.layer).toBe(0);
    expect(h.h.reduce((s, v) => s + v, 0)).toBe(ctx.topPlane);
  });

  it("reports height overflow when the stack is taller than topPlane", () => {
    const ctx = ctxFor({ innerHeight: 50 });
    const h = stackHeights(ctx, stackLevels(ctx, [item(3), item(1)]));
    expect(h.overflow).toBe(4620 + 1120 - 5000);
  });

  it("reports overflow instead of throwing when headroom ≥ inner height", () => {
    const ctx = ctxFor({ innerHeight: 40, headroom: 45 });
    const h = stackHeights(ctx, stackLevels(ctx, [item(1)]));
    expect(ctx.topPlane).toBe(-500);
    expect(h.overflow).toBe(1120 + 500);
  });

  it("keeps size-locked heights and footprints", () => {
    const base = ctxFor();
    const ctx = withSizeLocks(
      base,
      new Map([[base.partId(item(0)), { w: 12000, d: 7000, h: 3000, rotated: false }]]),
    );
    const levels = stackLevels(ctx, [item(0), item(1)]);
    expect(levels[0]?.minW).toBe(12000);
    expect(stackLockCap(ctx, levels)).toEqual({ w: 12000, d: 7000 });
    const h = stackHeights(ctx, levels);
    expect(h.h[0]).toBe(3000);
    expect(h.h[1]).toBe(ctx.topPlane - 3000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/stack.test.ts`

Expected: FAIL — `Failed to resolve import "./stack" from "src/layout/stack.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/stack.ts`:

```ts
import { INF_U, SLIVER_U, type Ctx, type FixedSize } from "./context";
import type { StackItem } from "./tree";
import { roundDownTo, roundUpTo, type Ext, type U } from "./units";

/** One tray of a stack with its requirements in the box frame (rotation applied). */
export interface Level {
  readonly item: StackItem;
  readonly level: number;
  /** Carries a lip: something is stacked on it and the lip is enabled. */
  readonly lipped: boolean;
  readonly minW: U;
  readonly minD: U;
  readonly minH: U;
  readonly capW: U;
  readonly capD: U;
  readonly elasticH: boolean;
  readonly fixed: FixedSize | undefined;
}

export function stackLevels(ctx: Ctx, stack: readonly StackItem[]): Level[] {
  const n = stack.length;
  return stack.map((item, k) => {
    const lipped = ctx.lipOn && k < n - 1;
    const m = ctx.metrics(item, lipped, k);
    const rot = item.rotated;
    const fixed = ctx.sizeLocks.get(ctx.partId(item));
    const baseH = k > 0 && ctx.lipOn ? Math.max(m.h, ctx.upperMinH) : m.h;
    return {
      item,
      level: k,
      lipped,
      minW: Math.max(rot ? m.d : m.w, fixed ? fixed.w : 0),
      minD: Math.max(rot ? m.w : m.d, fixed ? fixed.d : 0),
      minH: baseH,
      capW: rot ? m.capD : m.capW,
      capD: rot ? m.capW : m.capD,
      elasticH: m.elasticH,
      fixed,
    };
  });
}

/**
 * Smallest bottom footprint that holds every level: level k is inset k·inset per side,
 * so leaf ≥ req_k + 2·k·inset on both axes (spec §7.2). An empty stack (leftover leaf)
 * needs SLIVER_U on both axes.
 */
export function stackMinFootprint(ctx: Ctx, levels: readonly Level[]): Ext {
  if (levels.length === 0) {
    return { w: SLIVER_U, d: SLIVER_U };
  }
  let w = 0;
  let d = 0;
  for (const l of levels) {
    w = Math.max(w, l.minW + 2 * l.level * ctx.inset);
    d = Math.max(d, l.minD + 2 * l.level * ctx.inset);
  }
  return { w, d };
}

/** Largest bottom footprint allowed by size locks in the stack (INF_U when none). */
export function stackLockCap(ctx: Ctx, levels: readonly Level[]): Ext {
  let w = INF_U;
  let d = INF_U;
  for (const l of levels) {
    if (l.fixed) {
      w = Math.min(w, l.fixed.w + 2 * l.level * ctx.inset);
      d = Math.min(d, l.fixed.d + 2 * l.level * ctx.inset);
    }
  }
  return { w, d };
}

/**
 * Extra bottom footprint (beyond `foot`) every level can absorb without a spare compartment:
 * elastic axes and inward wall growth (spec §7.2 "Fill").
 */
export function stackAbsorb(ctx: Ctx, levels: readonly Level[], foot: Ext): Ext {
  let w = INF_U;
  let d = INF_U;
  for (const l of levels) {
    const usedW = foot.w - 2 * l.level * ctx.inset - l.minW;
    const usedD = foot.d - 2 * l.level * ctx.inset - l.minD;
    w = Math.min(w, Math.max(0, l.capW - usedW));
    d = Math.min(d, Math.max(0, l.capD - usedD));
  }
  return levels.length === 0 ? { w: 0, d: 0 } : { w, d };
}

export interface StackHeights {
  readonly h: U[];
  /** Σ minimum heights above topPlane. */
  readonly overflow: U;
  /** Size-locked heights that cannot be met. */
  readonly lockOverflow: U;
}

/**
 * Heights so that Σ h = topPlane exactly. Every tray except the top one is rounded up to a
 * multiple of the layer height; the top takes the remainder. Height slack goes to the
 * lowest tray with a deeper-growing compartment (scoop), in whole layers, else to the top
 * tray (realizeTray turns it into a solid raised floor). Size-locked heights are kept.
 */
export function stackHeights(ctx: Ctx, levels: readonly Level[]): StackHeights {
  const n = levels.length;
  if (n === 0) {
    return { h: [], overflow: 0, lockOverflow: 0 };
  }
  let lockOverflow = 0;
  const h = levels.map((l, k) => {
    if (l.fixed) {
      lockOverflow += Math.max(0, l.minH - l.fixed.h);
      return l.fixed.h;
    }
    return k < n - 1 ? roundUpTo(l.minH, ctx.layer) : l.minH;
  });
  const sum = h.reduce((s, v) => s + v, 0);
  if (sum > ctx.topPlane) {
    return { h, overflow: sum - ctx.topPlane, lockOverflow };
  }
  let extra = ctx.topPlane - sum;
  let r = -1;
  for (let k = n - 1; k >= 0; k--) {
    if (!levels[k]?.fixed) {
      r = k;
      break;
    }
  }
  if (r < 0) {
    return { h, overflow: 0, lockOverflow: lockOverflow + extra };
  }
  const b = levels.findIndex((l) => !l.fixed && l.elasticH);
  if (b >= 0 && b !== r) {
    const add = roundDownTo(extra, ctx.layer);
    h[b] = (h[b] ?? 0) + add;
    extra -= add;
  }
  h[r] = (h[r] ?? 0) + extra;
  return { h, overflow: 0, lockOverflow };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/stack.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/stack.test.ts src/layout/stack.ts
git commit -m "Add stack feasibility with lip insets and heights"
```

### Task 7: Fill: tree → integer plan with leftovers

**Files:**

- Create: `src/layout/fill.ts`
- Test: `src/layout/fill.test.ts`

**Interfaces:**

- Consumes: `bedExcess`, `bedOrientations`, `splitForBed` (Task 3); `Ctx` (including `Ctx.minPiece`), `GRIP_U`, `SLIVER_U` (Task 4); `placeLeaves`, `Leaf`, `StackItem`, `Tree` (Task 5); stack functions (Task 6); test helper `item` (Task 5).
- Produces: `interface PlacedTray { path; stack; level; item; x; y; z; w; d; h; lipped; top; minW; minD; capW; capD }`; `interface PlacedLeftover { path; stack; x; y; w; d; h; solid }`; `interface Overflow { x; y; z; bed; lock }`; `interface Plan { trays; leftovers; overflow; shortfall: { x; y; z }; crossX; crossY }`; `overflowTotal(o): U`; `placeStack(ctx, levels, rect): StackPlacement`; `maxCrossing(rects, alongX): number`; `evaluate(ctx, tree): Plan`.

- [ ] **Step 1: Write the failing test**

`src/layout/fill.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCtx, withSizeLocks, type Ctx } from "./context";
import { evaluate, overflowTotal, placeStack } from "./fill";
import { stackLevels } from "./stack";
import { boxReq, fakeMeasure, item, makeInput } from "./test-utils";
import { cut, leaf } from "./tree";
import type { TrayRequirement } from "../sizing/types";

function ctxOf(reqs: TrayRequirement[], o: Parameters<typeof makeInput>[1] = {}): Ctx {
  return createCtx(makeInput(reqs, o), fakeMeasure);
}

describe("fill", () => {
  it("absorbs slivers narrower than 12 mm into the tray", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20)]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), {
      x: 0,
      y: 0,
      w: 10400 + 1000,
      d: 6400,
    });
    expect(sp.leftovers).toEqual([]);
    expect(sp.trays[0]?.w).toBe(11400);
  });

  it("turns larger unabsorbable slack into a leftover strip with a gap", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20)]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), { x: 0, y: 0, w: 20000, d: 6400 });
    expect(sp.trays[0]?.w).toBe(10400 + 320);
    expect(sp.leftovers).toEqual([{ x: 10720 + 20, y: 0, w: 20000 - 10720 - 20, d: 6400 }]);
  });

  it("gives all slack to an elastic tray", () => {
    const ctx = ctxOf([boxReq("s", 50, 40, 10, { elastic: { w: true, d: true, h: true } })]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), { x: 0, y: 0, w: 20000, d: 9000 });
    expect(sp.leftovers).toEqual([]);
    expect(sp.trays[0]?.w).toBe(20000);
  });

  it("insets upper levels by k·inset per side and stacks z", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20), boxReq("b", 50, 40, 10)]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0), item(1)]), {
      x: 100,
      y: 200,
      w: 10600,
      d: 6600,
    });
    const [lo, up] = sp.trays;
    expect(up?.x).toBe(100 + ctx.inset);
    expect(up?.y).toBe(200 + ctx.inset);
    expect(up?.w).toBe((lo?.w ?? 0) - 2 * ctx.inset);
    expect(up?.z).toBe(lo?.h);
    expect((lo?.h ?? 0) + (up?.h ?? 0)).toBe(ctx.topPlane);
    expect(lo?.lipped).toBe(true);
    expect(up?.lipped).toBe(false);
  });

  it("caps the bottom tray to the bed and leaves at least MIN_PIECE_U as leftover", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20)], { printer: { bedX: 120, bedY: 120 } });
    const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), { x: 0, y: 0, w: 11500, d: 6400 });
    expect(sp.trays[0]?.w).toBe(11000);
    expect(sp.leftovers[0]?.w).toBe(11500 - 11000 - 20);
    const sp2 = placeStack(ctx, stackLevels(ctx, [item(0)]), { x: 0, y: 0, w: 11050, d: 6400 });
    expect(sp2.trays[0]?.w).toBe(11050 - 20 - 300);
  });

  it("never forces a leftover thinner than its own bottom chamfer allows", () => {
    // bottomChamfer 3: planTray needs min(w, d) ≥ 2 × (3 + 0.8) = 7.6 mm (ctx.minPiece).
    const ctx = ctxOf([boxReq("a", 100, 60, 20)], {
      printer: { bedX: 120, bedY: 120 },
      settings: { bottomChamfer: 3, wall: 3, floor: 3 },
    });
    const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), { x: 0, y: 0, w: 11500, d: 6400 });
    expect(sp.trays[0]?.w).toBe(11500 - 20 - 760);
    expect(sp.leftovers[0]?.w).toBe(760);
  });

  it("forces a leftover beside a size-locked tray", () => {
    const base = ctxOf([boxReq("a", 100, 60, 20)]);
    const ctx = withSizeLocks(base, new Map([[0, { w: 10500, d: 6400, h: 6000, rotated: false }]]));
    const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), { x: 0, y: 0, w: 11000, d: 6400 });
    expect(sp.trays[0]?.w).toBe(10500);
    expect(sp.leftovers[0]?.w).toBe(480);
    expect(sp.overflowLock).toBe(0);
  });

  it("evaluates a tree: exact tiling, leftovers numbered after stacks, no overflow", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20), boxReq("b", 100, 60, 20)]);
    const plan = evaluate(ctx, {
      root: cut("x", leaf([item(0)]), leaf([item(1)])),
      variants: [0, 0],
    });
    expect(overflowTotal(plan.overflow)).toBe(0);
    expect(plan.trays.map((t) => t.stack)).toEqual([0, 1]);
    expect(plan.leftovers.every((l) => l.stack >= 2)).toBe(true);
    expect(plan.leftovers.every((l) => l.h === ctx.topPlane)).toBe(true);
    expect(plan.crossX).toBeGreaterThanOrEqual(2);
  });

  it("reports x overflow and shortfall when trays don't fit side by side", () => {
    const ctx = ctxOf([boxReq("a", 200, 60, 20), boxReq("b", 200, 60, 20)]);
    const plan = evaluate(ctx, {
      root: cut("x", leaf([item(0)]), leaf([item(1)])),
      variants: [0, 0],
    });
    expect(plan.overflow.x).toBe(2 * 20400 + 20 - ctx.floorW);
    expect(plan.shortfall.x).toBe(plan.overflow.x);
  });

  it("splits leftovers larger than the bed", () => {
    const ctx = ctxOf([], { box: { innerWidth: 600, innerDepth: 200 } });
    const plan = evaluate(ctx, { root: leaf([]), variants: [] });
    expect(plan.leftovers.length).toBe(3);
    expect(plan.overflow.bed).toBe(0);
  });

  it("marks narrow leftovers solid", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20)], { box: { innerWidth: 125, innerDepth: 65 } });
    const plan = evaluate(ctx, { root: leaf([item(0)]), variants: [0] });
    expect(plan.leftovers.length).toBe(1);
    expect(plan.leftovers[0]?.solid).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/fill.test.ts`

Expected: FAIL — `Failed to resolve import "./fill" from "src/layout/fill.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/fill.ts`:

```ts
import { bedExcess, bedOrientations, splitForBed } from "./bed";
import { GRIP_U, SLIVER_U, type Ctx } from "./context";
import {
  stackAbsorb,
  stackHeights,
  stackLevels,
  stackLockCap,
  stackMinFootprint,
  type Level,
} from "./stack";
import { placeLeaves, type Leaf, type StackItem, type Tree } from "./tree";
import type { Ext, Rect, U } from "./units";

export interface PlacedTray {
  readonly path: string;
  readonly stack: number;
  readonly level: number;
  readonly item: StackItem;
  readonly x: U;
  readonly y: U;
  readonly z: U;
  readonly w: U;
  readonly d: U;
  readonly h: U;
  readonly lipped: boolean;
  /** Nothing is stacked on it. */
  readonly top: boolean;
  readonly minW: U;
  readonly minD: U;
  readonly capW: U;
  readonly capD: U;
}

export interface PlacedLeftover {
  readonly path: string;
  readonly stack: number;
  readonly x: U;
  readonly y: U;
  readonly w: U;
  readonly d: U;
  readonly h: U;
  readonly solid: boolean;
}

/** Constraint violations in units; all zero = feasible. */
export interface Overflow {
  readonly x: U;
  readonly y: U;
  /** Σ over stacks of height above topPlane. */
  readonly z: U;
  readonly bed: U;
  readonly lock: U;
}

export interface Plan {
  readonly trays: PlacedTray[];
  readonly leftovers: PlacedLeftover[];
  readonly overflow: Overflow;
  /** Per axis: how much larger the box would have to be (z: worst stack). */
  readonly shortfall: { readonly x: U; readonly y: U; readonly z: U };
  /** Most bottom-level parts crossed by a line along X / along Y. */
  readonly crossX: number;
  readonly crossY: number;
}

export function overflowTotal(o: Overflow): U {
  return o.x + o.y + o.z + o.bed + o.lock;
}

interface Bottom {
  foot: Ext;
  over: U;
}

/** Bottom tray extent on one axis: leaf extent L, minimum F, absorbable a, cap c. */
function axisExtent(ctx: Ctx, L: U, F: U, a: U, c: U): { b: U; over: U } {
  if (L <= F) {
    return { b: F, over: 0 };
  }
  const tight = F + a;
  if (L <= c) {
    return { b: L - tight - ctx.gap >= SLIVER_U ? tight : L, over: 0 };
  }
  let b = Math.min(c, L - ctx.gap - ctx.minPiece);
  if (tight < b && L - tight - ctx.gap >= SLIVER_U) {
    b = tight;
  }
  if (b < F) {
    return { b: L, over: F - b };
  }
  return { b, over: 0 };
}

function chooseBottom(ctx: Ctx, levels: readonly Level[], rect: Rect): Bottom {
  const F = stackMinFootprint(ctx, levels);
  const a = stackAbsorb(ctx, levels, F);
  const lock = stackLockCap(ctx, levels);
  let best: Bottom | null = null;
  for (const o of bedOrientations(ctx.bed)) {
    const ew = axisExtent(ctx, rect.w, F.w, a.w, Math.min(o.w, lock.w));
    const ed = axisExtent(ctx, rect.d, F.d, a.d, Math.min(o.d, lock.d));
    const cand: Bottom = { foot: { w: ew.b, d: ed.b }, over: ew.over + ed.over };
    if (
      best === null ||
      cand.over < best.over ||
      (cand.over === best.over && cand.foot.w * cand.foot.d > best.foot.w * best.foot.d)
    ) {
      best = cand;
    }
  }
  return best ?? { foot: F, over: 0 };
}

export interface StackPlacement {
  readonly trays: Omit<PlacedTray, "path" | "stack">[];
  readonly leftovers: Rect[];
  readonly overflowZ: U;
  readonly overflowLock: U;
}

/**
 * Fills one leaf: the bottom tray takes the leaf footprint minus any leftover; slack the
 * stack can't absorb becomes a leftover strip (≥ 12 mm, else absorbed by the tray);
 * bed and size-lock caps force a leftover of at least ctx.minPiece. Level k is inset
 * k·inset per side; heights come from stackHeights.
 */
export function placeStack(ctx: Ctx, levels: readonly Level[], rect: Rect): StackPlacement {
  if (levels.length === 0) {
    return { trays: [], leftovers: [rect], overflowZ: 0, overflowLock: 0 };
  }
  const { foot } = chooseBottom(ctx, levels, rect);
  const lockCap = stackLockCap(ctx, levels);
  const heights = stackHeights(ctx, levels);
  const leftovers: Rect[] = [];
  if (foot.w < rect.w) {
    leftovers.push({
      x: rect.x + foot.w + ctx.gap,
      y: rect.y,
      w: rect.w - foot.w - ctx.gap,
      d: rect.d,
    });
  }
  if (foot.d < rect.d) {
    leftovers.push({
      x: rect.x,
      y: rect.y + foot.d + ctx.gap,
      w: foot.w,
      d: rect.d - foot.d - ctx.gap,
    });
  }
  let z = 0;
  const trays = levels.map((l, k) => {
    const inset = k * ctx.inset;
    const h = heights.h[k] ?? 0;
    const t = {
      level: k,
      item: l.item,
      x: rect.x + inset,
      y: rect.y + inset,
      z,
      w: foot.w - 2 * inset,
      d: foot.d - 2 * inset,
      h,
      lipped: l.lipped,
      top: k === levels.length - 1,
      minW: l.minW,
      minD: l.minD,
      capW: l.capW,
      capD: l.capD,
    };
    z += h;
    return t;
  });
  const lockOver =
    Math.max(0, foot.w - lockCap.w) + Math.max(0, foot.d - lockCap.d) + heights.lockOverflow;
  return { trays, leftovers, overflowZ: heights.overflow, overflowLock: lockOver };
}

/** Most rectangles crossed by one straight line along X (alongX) or along Y. */
export function maxCrossing(rects: readonly Rect[], alongX: boolean): number {
  let best = 0;
  for (const r of rects) {
    const line = alongX ? r.y : r.x;
    let n = 0;
    for (const s of rects) {
      const lo = alongX ? s.y : s.x;
      const hi = alongX ? s.y + s.d : s.x + s.w;
      if (lo <= line && line < hi) {
        n++;
      }
    }
    best = Math.max(best, n);
  }
  return best;
}

/** Turns a tree into concrete integer placements, leftovers and overflow (the "fill" step). */
export function evaluate(ctx: Ctx, tree: Tree): Plan {
  const levelCache = new Map<Leaf, Level[]>();
  const levelsOf = (leaf: Leaf): Level[] => {
    const hit = levelCache.get(leaf);
    if (hit) {
      return hit;
    }
    const lv = stackLevels(ctx, leaf.stack);
    levelCache.set(leaf, lv);
    return lv;
  };
  const floor: Rect = { x: 0, y: 0, w: ctx.floorW, d: ctx.floorD };
  const placement = placeLeaves(tree.root, floor, ctx.gap, (leaf) =>
    stackMinFootprint(ctx, levelsOf(leaf)),
  );
  const trays: PlacedTray[] = [];
  const leftovers: PlacedLeftover[] = [];
  let z = 0;
  let zMax = 0;
  let bed = 0;
  let lock = 0;
  let stack = 0;
  const leftoverH = Math.max(0, ctx.topPlane);
  const pending: { path: string; rect: Rect }[] = [];
  for (const pl of placement.leaves) {
    const levels = levelsOf(pl.leaf);
    const sp = placeStack(ctx, levels, pl.rect);
    z += sp.overflowZ;
    zMax = Math.max(zMax, sp.overflowZ);
    lock += sp.overflowLock;
    if (sp.trays.length > 0) {
      for (const t of sp.trays) {
        trays.push({ ...t, path: pl.path, stack });
        bed += bedExcess(ctx.bed, t.w, t.d, t.h);
      }
      stack++;
    }
    for (const r of sp.leftovers) {
      pending.push({ path: pl.path, rect: r });
    }
  }
  const spareMin = GRIP_U + 2 * ctx.wall;
  // A spare leftover needs a grip (≥ 25 mm inside) and a floor below its rim (roadmap §4.6).
  const solidSetting = ctx.input.settings.leftover === "solid" || leftoverH <= 2 * ctx.floor;
  for (const p of pending) {
    for (const piece of splitForBed(ctx.bed, p.rect, ctx.gap)) {
      leftovers.push({
        path: p.path,
        stack,
        ...piece,
        h: leftoverH,
        solid: solidSetting || Math.min(piece.w, piece.d) < spareMin,
      });
      bed += bedExcess(ctx.bed, piece.w, piece.d, leftoverH);
      stack++;
    }
  }
  const bottoms: Rect[] = [...trays.filter((t) => t.level === 0), ...leftovers];
  const ox = Math.max(0, placement.min.w - ctx.floorW);
  const oy = Math.max(0, placement.min.d - ctx.floorD);
  return {
    trays,
    leftovers,
    overflow: { x: ox, y: oy, z, bed, lock },
    shortfall: { x: ox, y: oy, z: zMax },
    crossX: maxCrossing(bottoms, true),
    crossY: maxCrossing(bottoms, false),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/fill.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/fill.test.ts src/layout/fill.ts
git commit -m "Add layout fill with leftovers, bed caps and slivers"
```

### Task 8: Score

**Files:**

- Create: `src/layout/score.ts`
- Test: `src/layout/score.test.ts`

**Interfaces:**

- Consumes: `Ctx`, `PLAY_LIMIT_U` (Task 4); `Plan`, `overflowTotal` (Task 7); `volMm3`, `U` (Task 1); test helper `item` (Task 5).
- Produces: `interface PrevPos { x: U; y: U; level: number }`; `interface ScoreTerms { leftover; coverage; access; play; stacked; trays; filament; moved }`; `interface Score { total: number; overflow: U; terms: ScoreTerms }`; `WEIGHTS: Readonly<ScoreTerms>`; `OVERFLOW_WEIGHT = 1e9`; `coverageApplies(ctx): boolean`; `nominalPlayU(boxClearance: U, gap: U, crossed: number): U` (nominal lateral play of a line crossing `crossed` trays, in units; Task 15 converts the effective clearances with it too); `scorePlan(ctx, plan, prev?: ReadonlyMap<string, PrevPos>): Score`.

- [ ] **Step 1: Write the failing test**

`src/layout/score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { OVERFLOW_WEIGHT, scorePlan, WEIGHTS, type PrevPos } from "./score";
import { boxReq, fakeMeasure, item, makeInput } from "./test-utils";
import { cut, leaf, type Tree } from "./tree";

describe("score", () => {
  it("orders the unit steps of the terms as in spec §7.2", () => {
    const steps = [
      1000 * WEIGHTS.leftover,
      WEIGHTS.coverage,
      WEIGHTS.access,
      20 * WEIGHTS.play,
      WEIGHTS.stacked,
      WEIGHTS.trays,
      1000 * WEIGHTS.filament,
      WEIGHTS.moved,
    ];
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThan(steps[i - 1] ?? 0);
    }
    for (const w of Object.values(WEIGHTS)) {
      expect(Number.isInteger(w)).toBe(true);
    }
  });

  it("makes 0.01 mm of overflow cost more than any feasible score", () => {
    const maxFeasible =
      100_000 * WEIGHTS.leftover +
      200 * (WEIGHTS.coverage + WEIGHTS.access + WEIGHTS.stacked + WEIGHTS.trays + WEIGHTS.moved) +
      20_000 * WEIGHTS.play +
      100_000 * WEIGHTS.filament;
    expect(OVERFLOW_WEIGHT).toBeGreaterThan(maxFeasible);
  });

  const reqs = [
    boxReq("a", 140, 90, 20, { loose: true }),
    boxReq("b", 140, 90, 20, { access: "often" }),
  ];

  it("penalizes leftover volume", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const side: Tree = { root: cut("x", leaf([item(0)]), leaf([item(1)])), variants: [0, 0] };
    const s = scorePlan(ctx, evaluate(ctx, side));
    expect(s.overflow).toBe(0);
    expect(s.terms.leftover).toBeGreaterThan(0);
    const roomy = createCtx(makeInput(reqs, { box: { innerDepth: 290 } }), fakeMeasure);
    expect(scorePlan(roomy, evaluate(roomy, side)).terms.leftover).toBeGreaterThan(
      s.terms.leftover,
    );
  });

  it("applies the coverage penalty only with partial coverage or a box stored on its side", () => {
    const tree: Tree = { root: cut("x", leaf([item(0)]), leaf([item(1)])), variants: [0, 0] };
    const full = createCtx(makeInput(reqs, { box: { headroom: 5 } }), fakeMeasure);
    expect(scorePlan(full, evaluate(full, tree)).terms.coverage).toBe(0);
    const partial = createCtx(
      makeInput(reqs, { box: { headroom: 5, headroomCoverage: "partial" } }),
      fakeMeasure,
    );
    expect(scorePlan(partial, evaluate(partial, tree)).terms.coverage).toBe(1);
    const side = createCtx(makeInput(reqs, { box: { storedOnSide: true } }), fakeMeasure);
    expect(scorePlan(side, evaluate(side, tree)).terms.coverage).toBe(1);
  });

  it("penalizes often-used trays under other trays and counts stacked trays", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const buried: Tree = { root: leaf([item(1), item(0)]), variants: [0, 0] };
    const s = scorePlan(ctx, evaluate(ctx, buried));
    expect(s.terms.access).toBe(1);
    expect(s.terms.stacked).toBe(1);
    const onTop: Tree = { root: leaf([item(0), item(1)]), variants: [0, 0] };
    expect(scorePlan(ctx, evaluate(ctx, onTop)).terms.access).toBe(0);
  });

  it("counts trays moved relative to a warm start", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const tree: Tree = { root: cut("x", leaf([item(0)]), leaf([item(1)])), variants: [0, 0] };
    const plan = evaluate(ctx, tree);
    const prev = new Map<string, PrevPos>(
      plan.trays.map((t) => [
        `${t.item.req === 0 ? "a" : "b"}:p0:0`,
        { x: t.x, y: t.y, level: t.level },
      ]),
    );
    expect(scorePlan(ctx, plan, prev).terms.moved).toBe(0);
    prev.set("a:p0:0", { x: 1, y: 0, level: 0 });
    expect(scorePlan(ctx, plan, prev).terms.moved).toBe(1);
  });

  it("penalizes nominal play above 1.5 mm", () => {
    const many = Array.from({ length: 8 }, (_, i) => boxReq(`r${i}`, 20, 20, 10));
    const ctx = createCtx(makeInput(many), fakeMeasure);
    let root = leaf([item(7)]) as Tree["root"];
    for (let i = 6; i >= 0; i--) {
      root = cut("x", leaf([item(i)]), root);
    }
    const s = scorePlan(ctx, evaluate(ctx, { root, variants: many.map(() => 0) }));
    expect(s.terms.play).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/score.test.ts`

Expected: FAIL — `Failed to resolve import "./score" from "src/layout/score.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/score.ts`:

```ts
import { PLAY_LIMIT_U, type Ctx } from "./context";
import { overflowTotal, type Plan } from "./fill";
import { volMm3, type U } from "./units";

/** Where a tray was in the warm-start layout (units). */
export interface PrevPos {
  readonly x: U;
  readonly y: U;
  readonly level: number;
}

export interface ScoreTerms {
  /** Leftover parts + slack trays can't absorb, in 1/100 000 of the usable box volume. */
  readonly leftover: number;
  /** Loose trays (bulk, minis-bulk, tiles) in the top layer when coverage applies. */
  readonly coverage: number;
  /** "often" trays with another tray on top. */
  readonly access: number;
  /** Units of nominal lateral play above 1.5 mm, summed over both axes. */
  readonly play: number;
  /** Trays above level 0. */
  readonly stacked: number;
  /** Printed parts (trays + leftovers). */
  readonly trays: number;
  /** Estimated filament (shells, solid leftovers), in 1/100 000 of the usable box volume. */
  readonly filament: number;
  /** Trays whose position or level differs from the warm-start layout. */
  readonly moved: number;
}

export interface Score {
  readonly total: number;
  readonly overflow: U;
  readonly terms: ScoreTerms;
}

/**
 * Integer weights, in the spec's order of importance (§7.2). Each term's "unit step" is
 * worth less than the previous term's unit step:
 *   1 % of the box left over     = 1 000 × 1 000 = 1 000 000
 *   one loose tray on top        =                   500 000
 *   one buried "often" tray      =                   200 000
 *   one extra tray gap of play   = 20 units × 5 000 = 100 000
 *   one stacked tray             =                    50 000
 *   one extra printed part       =                    20 000
 *   1 % of the box in filament   = 1 000 × 10 =       10 000
 *   one moved tray (warm start)  =                     5 000
 * Overflow (any hard-rule violation) costs OVERFLOW_WEIGHT per 0.01 mm, more than any
 * feasible score can reach, so the search always prefers reducing violations.
 * Totals stay far below 2^53, so score deltas are exact integers.
 */
export const WEIGHTS: Readonly<ScoreTerms> = {
  leftover: 1_000,
  coverage: 500_000,
  access: 200_000,
  play: 5_000,
  stacked: 50_000,
  trays: 20_000,
  filament: 10,
  moved: 5_000,
};

export const OVERFLOW_WEIGHT = 1_000_000_000;

function share(mm3: number, boxMm3: number): number {
  return Math.round((mm3 * 100_000) / boxMm3);
}

export function coverageApplies(ctx: Ctx): boolean {
  const box = ctx.input.box;
  return (box.headroom > 0 && box.headroomCoverage === "partial") || box.storedOnSide;
}

/** Nominal lateral play along a line crossing `crossed` trays: clearance twice, gap between trays. */
export function nominalPlayU(boxClearance: U, gap: U, crossed: number): U {
  return 2 * boxClearance + Math.max(0, crossed - 1) * gap;
}

function shell(ctx: Ctx, w: U, d: U, h: U): number {
  return volMm3(w, d, h) - volMm3(w - 2 * ctx.wall, d - 2 * ctx.wall, h - ctx.floor);
}

export function scorePlan(ctx: Ctx, plan: Plan, prev?: ReadonlyMap<string, PrevPos>): Score {
  const boxMm3 = Math.max(1, volMm3(ctx.floorW, ctx.floorD, Math.max(ctx.topPlane, 1)));
  const covers = coverageApplies(ctx);
  let leftoverMm3 = 0;
  let filamentMm3 = 0;
  let coverage = 0;
  let access = 0;
  let stacked = 0;
  let moved = 0;
  for (const t of plan.trays) {
    const usableW = Math.min(t.w, t.minW + t.capW);
    const usableD = Math.min(t.d, t.minD + t.capD);
    leftoverMm3 += volMm3(t.w, t.d, t.h) - volMm3(usableW, usableD, t.h);
    filamentMm3 += shell(ctx, t.w, t.d, t.h);
    const r = ctx.input.requirements[t.item.req];
    if (covers && t.top && r?.loose) {
      coverage++;
    }
    if (!t.top && r?.access === "often") {
      access++;
    }
    if (t.level > 0) {
      stacked++;
    }
    if (prev) {
      const key = ctx.part(t.item)?.trayKey;
      const p = key === undefined ? undefined : prev.get(key);
      if (p && (p.x !== t.x || p.y !== t.y || p.level !== t.level)) {
        moved++;
      }
    }
  }
  for (const l of plan.leftovers) {
    leftoverMm3 += volMm3(l.w, l.d, l.h);
    filamentMm3 += l.solid ? volMm3(l.w, l.d, l.h) : shell(ctx, l.w, l.d, l.h);
  }
  const playExcess = (crossed: number): number =>
    Math.max(0, nominalPlayU(ctx.boxClearance, ctx.gap, crossed) - PLAY_LIMIT_U);
  const terms: ScoreTerms = {
    leftover: share(leftoverMm3, boxMm3),
    coverage,
    access,
    play: playExcess(plan.crossX) + playExcess(plan.crossY),
    stacked,
    trays: plan.trays.length + plan.leftovers.length,
    filament: share(filamentMm3, boxMm3),
    moved,
  };
  const overflow = overflowTotal(plan.overflow);
  const total =
    overflow * OVERFLOW_WEIGHT +
    terms.leftover * WEIGHTS.leftover +
    terms.coverage * WEIGHTS.coverage +
    terms.access * WEIGHTS.access +
    terms.play * WEIGHTS.play +
    terms.stacked * WEIGHTS.stacked +
    terms.trays * WEIGHTS.trays +
    terms.filament * WEIGHTS.filament +
    terms.moved * WEIGHTS.moved;
  return { total, overflow, terms };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/score.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/score.test.ts src/layout/score.ts
git commit -m "Add integer layout score with ordered weights"
```

### Task 9: Moves

**Files:**

- Create: `src/layout/moves.ts`
- Test: `src/layout/moves.test.ts`

**Interfaces:**

- Consumes: `Ctx`, `MAX_LEVELS` (Task 4); `Rng` (Task 2); tree functions (Task 5).
- Produces: `interface MoveEnv { ctx: Ctx; lockedPaths: readonly string[]; variantPinned: readonly boolean[]; rotationFixed: ReadonlySet<number> }`; `type Move = (tree: Tree, env: MoveEnv, rng: Rng) => Tree | null`; moves `swapLeaves`, `flipCut`, `moveCut`, `changeVariant`, `rotateItem`, `reorderStack`, `mergeStacks`, `splitStack`; `MOVES` (name, move, integer weight); `pickMove(rng): Move`; helpers `removeItems(root, pred, env): TreeNode`, `insertLeaf(root, leaf, env, rng): TreeNode | null`, `insertItem(root, item, env, rng): TreeNode | null`.

- [ ] **Step 1: Write the failing test**

`src/layout/moves.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createCtx, MAX_LEVELS } from "./context";
import {
  changeVariant,
  flipCut,
  insertItem,
  mergeStacks,
  moveCut,
  MOVES,
  pickMove,
  removeItems,
  reorderStack,
  rotateItem,
  splitStack,
  swapLeaves,
  type MoveEnv,
} from "./moves";
import { createRng } from "./prng";
import { boxReq, comp, fakeMeasure, makeInput, part, req, variant } from "./test-utils";
import { cut, cuts, itemsOf, leaf, leaves, nodeAt, type StackItem, type Tree } from "./tree";

const reqs = [
  boxReq("a", 60, 40, 10),
  boxReq("b", 50, 40, 10),
  req("c", [
    variant("one", [
      part("c:p0:0", [
        comp({ minW: 40, minD: 40, minH: 10 }),
        comp({ minW: 40, minD: 40, minH: 10 }),
      ]),
    ]),
    variant("two", [
      part("c:p0:0", [comp({ minW: 40, minD: 40, minH: 10 })]),
      part("c:p0:1", [comp({ minW: 40, minD: 40, minH: 10 })]),
    ]),
  ]),
  boxReq("d", 30, 30, 10, { rotatable: false }),
];
const ctx = createCtx(makeInput(reqs), fakeMeasure);
const at = (r: number, v = 0, p = 0): StackItem => ({
  req: r,
  variant: v,
  part: p,
  rotated: false,
});

const start: Tree = {
  root: cut("x", leaf([at(0), at(1)]), cut("y", leaf([at(2)]), leaf([at(3)]))),
  variants: [0, 0, 0, 0],
};

function env(
  lockedPaths: string[] = [],
  pinned: boolean[] = [false, false, false, false],
): MoveEnv {
  return { ctx, lockedPaths, variantPinned: pinned, rotationFixed: new Set() };
}

/** Every part of every active variant appears exactly once; nothing else does. */
function expectComplete(tree: Tree): void {
  const want = reqs
    .flatMap((r, i) =>
      (r.variants[tree.variants[i] ?? 0]?.parts ?? []).map(
        (_, p) => `${i}.${tree.variants[i]}.${p}`,
      ),
    )
    .sort();
  const got = itemsOf(tree.root)
    .map((it) => `${it.req}.${it.variant}.${it.part}`)
    .sort();
  expect(got).toEqual(want);
}

describe("moves", () => {
  it("swaps two leaves", () => {
    const t = swapLeaves(start, env(), createRng(1));
    expect(t).not.toBeNull();
    if (t) {
      expectComplete(t);
      expect(leaves(t.root).map((l) => l.leaf.stack.length)).not.toEqual([2, 1, 1]);
    }
  });

  it("flips a cut axis and moves a cut share", () => {
    const f = flipCut(start, env(), createRng(2));
    expect(f).not.toBeNull();
    expect(f && cuts(f.root).map((c) => c.cut.axis)).not.toEqual(["x", "y"]);
    const m = moveCut(start, env(), createRng(3));
    expect(m).not.toBeNull();
    expect(m && cuts(m.root).map((c) => c.cut.share)).not.toEqual(
      cuts(start.root).map((c) => c.cut.share),
    );
  });

  it("changes a variant, replacing all its parts", () => {
    const t = changeVariant(start, env(), createRng(4));
    expect(t?.variants[2]).toBe(1);
    if (t) {
      expectComplete(t);
    }
    expect(changeVariant(start, env([], [false, false, true, false]), createRng(4))).toBeNull();
  });

  it("rotates only rotatable, unlocked items", () => {
    for (let s = 0; s < 20; s++) {
      const t = rotateItem(start, env(), createRng(s));
      const rotated = t ? itemsOf(t.root).filter((i) => i.rotated) : [];
      expect(rotated.length).toBe(1);
      expect(rotated[0]?.req).not.toBe(3);
    }
  });

  it("reorders, merges and splits stacks", () => {
    const r = reorderStack(start, env(), createRng(5));
    expect(r && (nodeAt(r.root, "0")?.kind === "leaf" ? nodeAt(r.root, "0") : null)).toMatchObject({
      stack: [at(1), at(0)],
    });
    const m = mergeStacks(start, env(), createRng(6));
    expect(m && leaves(m.root).length).toBe(2);
    const s = splitStack(start, env(), createRng(7));
    expect(s && leaves(s.root).length).toBe(4);
  });

  it("removes items and collapses emptied leaves", () => {
    const root = removeItems(start.root, (i) => i.req === 2, env());
    expect(leaves(root).map((l) => l.path)).toEqual(["0", "1"]);
    const kept = removeItems(start.root, (i) => i.req === 2, env(["11"]));
    expect(leaves(kept).map((l) => `${l.path}:${l.leaf.stack.length}`)).toEqual([
      "0:2",
      "10:0",
      "11:1",
    ]);
  });

  it("never inserts into a locked leaf", () => {
    const locked: Tree = {
      root: cut("x", leaf([at(0)], true), leaf([at(1)])),
      variants: [0, 0, 0, 0],
    };
    for (let s = 0; s < 30; s++) {
      const root = insertItem(locked.root, at(3), env(["0"]), createRng(s));
      expect(root && nodeAt(root, "0")).toEqual(leaf([at(0)], true));
    }
  });

  it("is pure and deterministic for a given rng seed", () => {
    for (const { move } of MOVES) {
      const before = JSON.stringify(start);
      const a = move(start, env(), createRng(9));
      const b = move(start, env(), createRng(9));
      expect(JSON.stringify(start)).toBe(before);
      expect(a).toEqual(b);
    }
  });

  it("keeps every invariant over long random move sequences, locks included", () => {
    const lockedLeaf = leaf([at(0)], true);
    const locked: Tree = {
      root: cut("x", lockedLeaf, cut("y", leaf([at(1), at(2)]), leaf([at(3)]))),
      variants: [0, 0, 0, 0],
    };
    const e = env(["0"], [true, false, false, false]);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const rng = createRng(seed);
        let tree = locked;
        for (let i = 0; i < 150; i++) {
          tree = pickMove(rng)(tree, e, rng) ?? tree;
          expectComplete(tree);
          expect(nodeAt(tree.root, "0")).toBe(lockedLeaf);
          expect(tree.root.kind === "cut" && tree.root.axis).toBe("x");
          for (const l of leaves(tree.root)) {
            expect(l.leaf.stack.length).toBeLessThanOrEqual(MAX_LEVELS);
          }
        }
      }),
      { numRuns: 30 },
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/moves.test.ts`

Expected: FAIL — `Failed to resolve import "./moves" from "src/layout/moves.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/moves.ts`:

```ts
import { MAX_LEVELS, type Ctx } from "./context";
import type { Rng } from "./prng";
import {
  cut,
  cuts,
  leaf,
  leaves,
  otherAxis,
  removeLeafAt,
  replaceAt,
  SHARE_MAX,
  splitLeafAt,
  type Axis,
  type Leaf,
  type StackItem,
  type Tree,
  type TreeNode,
} from "./tree";

/** What moves may touch. Built from the resolved locks (locks.ts). */
export interface MoveEnv {
  readonly ctx: Ctx;
  /** Leaf paths fixed by position locks. Their routes from the root are fixed too. */
  readonly lockedPaths: readonly string[];
  /** Per requirement: its variant is pinned by a lock. */
  readonly variantPinned: readonly boolean[];
  /** partIds whose rotation is fixed by a lock. */
  readonly rotationFixed: ReadonlySet<number>;
}

/** A move is a pure function of (tree, rng): a new tree, or null when it doesn't apply. */
export type Move = (tree: Tree, env: MoveEnv, rng: Rng) => Tree | null;

function isLockedLeaf(env: MoveEnv, path: string): boolean {
  return env.lockedPaths.includes(path);
}

/** A cut at `path` may change axis or collapse only if no locked path runs through it. */
function isFreeCut(env: MoveEnv, path: string): boolean {
  return !env.lockedPaths.some((lp) => lp.startsWith(path));
}

function canRemoveLeaf(env: MoveEnv, path: string): boolean {
  return path !== "" && isFreeCut(env, path.slice(0, -1));
}

function randomAxis(rng: Rng): Axis {
  return rng.nextInt(2) === 0 ? "x" : "y";
}

function canRotate(env: MoveEnv, item: StackItem): boolean {
  const p = env.ctx.part(item);
  return p !== undefined && p.rotatable && !env.rotationFixed.has(env.ctx.partId(item));
}

/**
 * Removes matching items. Leaves that become empty collapse into their sibling where no
 * locked path runs through the parent; elsewhere they stay as empty (leftover) leaves.
 */
export function removeItems(
  root: TreeNode,
  pred: (item: StackItem) => boolean,
  env: MoveEnv,
): TreeNode {
  const strip = (node: TreeNode, path: string): TreeNode | null => {
    if (node.kind === "leaf") {
      if (!node.stack.some(pred)) {
        return node;
      }
      const stack = node.stack.filter((i) => !pred(i));
      return stack.length === 0 ? null : leaf(stack, node.frozen);
    }
    const a = strip(node.a, `${path}0`);
    const b = strip(node.b, `${path}1`);
    if (a === node.a && b === node.b) {
      return node;
    }
    if (isFreeCut(env, path)) {
      if (a === null) {
        return b;
      }
      if (b === null) {
        return a;
      }
    }
    return { ...node, a: a ?? leaf([]), b: b ?? leaf([]) };
  };
  return strip(root, "") ?? leaf([]);
}

/** Puts a whole leaf into the tree: into an empty leaf or by splitting an unlocked leaf. */
export function insertLeaf(root: TreeNode, added: Leaf, env: MoveEnv, rng: Rng): TreeNode | null {
  const all = leaves(root);
  const empties = all.filter(
    (l) => l.leaf.stack.length === 0 && !l.leaf.frozen && !isLockedLeaf(env, l.path),
  );
  if (empties.length > 0 && rng.nextInt(2) === 0) {
    return replaceAt(root, rng.pick(empties).path, added);
  }
  const splittable = all.filter((l) => !isLockedLeaf(env, l.path));
  if (splittable.length === 0) {
    return null;
  }
  const target = rng.pick(splittable);
  return splitLeafAt(root, target.path, randomAxis(rng), added, rng.nextInt(2) === 0);
}

/** Puts one item into the tree: an empty leaf, on top of a free stack, or a new leaf. */
export function insertItem(
  root: TreeNode,
  item: StackItem,
  env: MoveEnv,
  rng: Rng,
): TreeNode | null {
  const stackable = leaves(root).filter(
    (l) =>
      !l.leaf.frozen &&
      !isLockedLeaf(env, l.path) &&
      l.leaf.stack.length > 0 &&
      l.leaf.stack.length < MAX_LEVELS,
  );
  if (stackable.length > 0 && rng.nextInt(4) === 0) {
    const s = rng.pick(stackable);
    return replaceAt(root, s.path, leaf([...s.leaf.stack, item]));
  }
  return insertLeaf(root, leaf([item]), env, rng);
}

export const swapLeaves: Move = (tree, env, rng) => {
  const free = leaves(tree.root).filter((l) => !isLockedLeaf(env, l.path));
  if (free.length < 2) {
    return null;
  }
  const i = rng.nextInt(free.length);
  const j = (i + 1 + rng.nextInt(free.length - 1)) % free.length;
  const a = free[i];
  const b = free[j];
  if (!a || !b || (a.leaf.stack.length === 0 && b.leaf.stack.length === 0)) {
    return null;
  }
  const root = replaceAt(replaceAt(tree.root, a.path, b.leaf), b.path, a.leaf);
  return { ...tree, root };
};

export const flipCut: Move = (tree, env, rng) => {
  const free = cuts(tree.root).filter((c) => isFreeCut(env, c.path));
  if (free.length === 0) {
    return null;
  }
  const c = rng.pick(free);
  return { ...tree, root: replaceAt(tree.root, c.path, { ...c.cut, axis: otherAxis(c.cut.axis) }) };
};

export const moveCut: Move = (tree, _env, rng) => {
  const all = cuts(tree.root);
  if (all.length === 0) {
    return null;
  }
  const c = rng.pick(all);
  let share: number;
  if (rng.nextInt(4) === 0) {
    share = rng.nextInt(SHARE_MAX + 1);
  } else {
    const delta = 1 + rng.nextInt(SHARE_MAX / 8);
    share = c.cut.share + (rng.nextInt(2) === 0 ? delta : -delta);
    share = Math.max(0, Math.min(SHARE_MAX, share));
  }
  if (share === c.cut.share) {
    return null;
  }
  return { ...tree, root: replaceAt(tree.root, c.path, { ...c.cut, share }) };
};

export const changeVariant: Move = (tree, env, rng) => {
  const reqs = env.ctx.input.requirements;
  const options = reqs
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => r.variants.length > 1 && !env.variantPinned[i]);
  if (options.length === 0) {
    return null;
  }
  const { r, i } = rng.pick(options);
  const current = tree.variants[i] ?? 0;
  const next = (current + 1 + rng.nextInt(r.variants.length - 1)) % r.variants.length;
  let root: TreeNode | null = removeItems(tree.root, (it) => it.req === i, env);
  const parts = r.variants[next]?.parts ?? [];
  for (let p = 0; p < parts.length && root !== null; p++) {
    const rotatable = parts[p]?.rotatable ?? false;
    const item: StackItem = {
      req: i,
      variant: next,
      part: p,
      rotated: rotatable && rng.nextInt(2) === 1,
    };
    root = insertItem(root, item, env, rng);
  }
  if (root === null) {
    return null;
  }
  const variants = tree.variants.map((v, k) => (k === i ? next : v));
  return { root, variants };
};

export const rotateItem: Move = (tree, env, rng) => {
  const options: { path: string; leaf: Leaf; k: number }[] = [];
  for (const l of leaves(tree.root)) {
    if (l.leaf.frozen) {
      continue;
    }
    l.leaf.stack.forEach((item, k) => {
      if (canRotate(env, item)) {
        options.push({ path: l.path, leaf: l.leaf, k });
      }
    });
  }
  if (options.length === 0) {
    return null;
  }
  const o = rng.pick(options);
  const stack = o.leaf.stack.map((item, k) =>
    k === o.k ? { ...item, rotated: !item.rotated } : item,
  );
  return { ...tree, root: replaceAt(tree.root, o.path, leaf(stack, o.leaf.frozen)) };
};

export const reorderStack: Move = (tree, _env, rng) => {
  const options = leaves(tree.root).filter((l) => !l.leaf.frozen && l.leaf.stack.length >= 2);
  if (options.length === 0) {
    return null;
  }
  const o = rng.pick(options);
  const k = rng.nextInt(o.leaf.stack.length - 1);
  const stack = [...o.leaf.stack];
  const lower = stack[k];
  const upper = stack[k + 1];
  if (!lower || !upper) {
    return null;
  }
  stack[k] = upper;
  stack[k + 1] = lower;
  return { ...tree, root: replaceAt(tree.root, o.path, leaf(stack)) };
};

export const mergeStacks: Move = (tree, env, rng) => {
  const all = leaves(tree.root).filter(
    (l) => !l.leaf.frozen && !isLockedLeaf(env, l.path) && l.leaf.stack.length > 0,
  );
  const removable = all.filter((l) => canRemoveLeaf(env, l.path));
  if (all.length < 2 || removable.length === 0) {
    return null;
  }
  const from = rng.pick(removable);
  const targets = all.filter(
    (l) => l.path !== from.path && l.leaf.stack.length + from.leaf.stack.length <= MAX_LEVELS,
  );
  if (targets.length === 0) {
    return null;
  }
  const into = rng.pick(targets);
  const stack =
    rng.nextInt(2) === 0
      ? [...into.leaf.stack, ...from.leaf.stack]
      : [...from.leaf.stack, ...into.leaf.stack];
  const merged = replaceAt(tree.root, into.path, leaf(stack));
  const root = removeLeafAt(merged, from.path);
  return root === null ? null : { ...tree, root };
};

export const splitStack: Move = (tree, env, rng) => {
  const options = leaves(tree.root).filter(
    (l) => !l.leaf.frozen && !isLockedLeaf(env, l.path) && l.leaf.stack.length >= 2,
  );
  if (options.length === 0) {
    return null;
  }
  const o = rng.pick(options);
  const k = 1 + rng.nextInt(o.leaf.stack.length - 1);
  const bottom = leaf(o.leaf.stack.slice(0, k));
  const top = leaf(o.leaf.stack.slice(k));
  const node =
    rng.nextInt(2) === 0 ? cut(randomAxis(rng), bottom, top) : cut(randomAxis(rng), top, bottom);
  return { ...tree, root: replaceAt(tree.root, o.path, node) };
};

/** Move mix: integer weights, picked with rng.nextInt(total). */
export const MOVES: readonly {
  readonly name: string;
  readonly move: Move;
  readonly weight: number;
}[] = [
  { name: "swapLeaves", move: swapLeaves, weight: 20 },
  { name: "flipCut", move: flipCut, weight: 10 },
  { name: "moveCut", move: moveCut, weight: 30 },
  { name: "changeVariant", move: changeVariant, weight: 10 },
  { name: "rotateItem", move: rotateItem, weight: 10 },
  { name: "reorderStack", move: reorderStack, weight: 5 },
  { name: "mergeStacks", move: mergeStacks, weight: 7 },
  { name: "splitStack", move: splitStack, weight: 8 },
];

const TOTAL_WEIGHT = MOVES.reduce((s, m) => s + m.weight, 0);

export function pickMove(rng: Rng): Move {
  let r = rng.nextInt(TOTAL_WEIGHT);
  for (const m of MOVES) {
    if (r < m.weight) {
      return m.move;
    }
    r -= m.weight;
  }
  return swapLeaves;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/moves.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/moves.test.ts src/layout/moves.ts
git commit -m "Add pure annealing moves that respect locked paths"
```

### Task 10: Locks: validation, application, swap

**Files:**

- Create: `src/layout/locks.ts`
- Modify: `src/layout/test-utils.ts` (add `traySpec`)
- Test: `src/layout/locks.test.ts`

**Interfaces:**

- Consumes: `Lock`, `Notice`, `StoredLayout`, `TraySpec` (`../model/types`); `fitsBed` (Task 3); `Ctx`, `FixedSize`, `PartRef`, `MAX_DEPTH`, `MAX_LEVELS`, `withSizeLocks` (Task 4); tree functions (Task 5); `stackHeights`, `stackLevels` (Task 6); `MoveEnv`, `insertItem`, `insertLeaf`, `removeItems` (Task 9); `Rng` (Task 2); `toU` (Task 1).
- Produces: `interface LockedLeaf { path; items }`; `interface ResolvedLocks { leaves; groups; lockedPaths; pinnedVariant: readonly (number | null)[]; sizes: ReadonlyMap<number, FixedSize>; rotationFixed; kept: readonly Lock[] }`; `interface LockHints { variantOf?(req): number | undefined; rotatedOf?(trayKey): boolean | undefined; levelOf?(trayKey): number | undefined; singleLeaf?: boolean }`; `noLocks(ctx)`; `isValidPath(path): boolean` (a 0/1 path of at most `MAX_DEPTH` digits; Task 13 uses it for stored layouts); `describeLock(lock): string`; `lockDroppedNotice(lock, reason, index = -1): Notice` (code `lock.dropped`; `path: "/locks/<index>"` when `index ≥ 0`, the lock's index in the input locks, so the UI can remove exactly that lock); `resolveLocks(ctx, locks, hints?): { resolved; notices }`; `moveEnvOf(ctx, resolved): MoveEnv`; `completeTree(tree, env, rng): Tree | null`; `applyLocks(tree, resolved, env, rng, axisOf?): Tree | null`; `swapLocks(locks: readonly Lock[], keyA: string, keyB: string, layout: StoredLayout): Lock[]`. Test helper (added to `test-utils.ts`; the summarize, warnings and warm-start tests use it too): `traySpec(o?: Partial<TraySpec>): TraySpec`, a plain 100 × 50 × 20 tray at path `"0"`.

- [ ] **Step 1: Write the failing test**

First add the `traySpec` helper to the shared test helpers.

Add `TraySpec` to the `../model/types` import of `src/layout/test-utils.ts`:

```ts
import type { Access, Box, Lock, Printer, Settings, TraySpec } from "../model/types";
```

Append to `src/layout/test-utils.ts`:

```ts
/** A printed tray spec: a plain 100 × 50 × 20 tray at path "0", with `o` laid over it. */
export function traySpec(o: Partial<TraySpec> = {}): TraySpec {
  return {
    key: "k",
    part: "tray",
    path: "0",
    stack: 0,
    level: 0,
    x: 0,
    y: 0,
    z: 0,
    w: 100,
    d: 50,
    h: 20,
    rotated: false,
    wall: 1.6,
    floor: 1.2,
    lip: false,
    solid: false,
    compartments: [],
    ...o,
  };
}
```

Then the test.

`src/layout/locks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Lock, StoredLayout } from "../model/types";
import { createCtx, withSizeLocks } from "./context";
import { applyLocks, moveEnvOf, noLocks, resolveLocks, swapLocks } from "./locks";
import { createRng } from "./prng";
import { boxReq, comp, fakeMeasure, makeInput, part, req, traySpec, variant } from "./test-utils";
import { cut, itemsOf, leaf, leaves, nodeAt, type Tree } from "./tree";

const reqs = [
  boxReq("a", 60, 40, 10),
  boxReq("b", 50, 40, 10, { rotatable: false }),
  req("c", [
    variant("one", [
      part("c:p0:0", [
        comp({ minW: 40, minD: 40, minH: 10 }),
        comp({ minW: 40, minD: 40, minH: 10 }),
      ]),
    ]),
    variant("two", [
      part("c:p0:0", [comp({ minW: 40, minD: 40, minH: 10 })]),
      part("c:p0:1", [comp({ minW: 40, minD: 40, minH: 10 })]),
    ]),
  ]),
];

function resolve(locks: Lock[], box = {}) {
  const ctx = createCtx(makeInput(reqs, { box, locks }), fakeMeasure);
  return { ctx, ...resolveLocks(ctx, locks) };
}

describe("resolveLocks", () => {
  it("drops a lock whose trayKey no longer exists, with a notice", () => {
    const r = resolve([{ kind: "position", trayKey: "c:p0:2", path: "0", rotated: false }]);
    expect(r.resolved.kept).toEqual([]);
    expect(r.notices).toEqual([
      expect.objectContaining({ level: "warning", code: "lock.dropped", path: "/locks/0" }),
    ]);
    expect(r.notices[0]?.message).toContain("c:p0:2");
  });

  it("pins the variant that contains the locked tray (a tray split into parts after an edit)", () => {
    const r = resolve([{ kind: "position", trayKey: "c:p0:1", path: "1", rotated: false }]);
    expect(r.resolved.pinnedVariant).toEqual([null, null, 1]);
    expect(r.resolved.leaves).toEqual([
      { path: "1", items: [{ req: 2, variant: 1, part: 1, rotated: false }] },
    ]);
    expect(r.notices).toEqual([]);
  });

  it("does not let a dropped lock pin the variant of its component", () => {
    // The path is invalid, so the lock is dropped; it must not keep forcing variant 1.
    const dropped = resolve([{ kind: "position", trayKey: "c:p0:1", path: "2", rotated: false }]);
    expect(dropped.resolved.kept).toEqual([]);
    expect(dropped.notices).toHaveLength(1);
    expect(dropped.resolved.pinnedVariant).toEqual([null, null, null]);
    // A kept lock on the same component still pins it.
    const mixed = resolve([
      { kind: "position", trayKey: "c:p0:1", path: "1", rotated: false },
      { kind: "position", trayKey: "c:p0:1", path: "2", rotated: false },
    ]);
    expect(mixed.resolved.kept).toHaveLength(1);
    expect(mixed.resolved.pinnedVariant).toEqual([null, null, 1]);
  });

  it("drops position locks with invalid, conflicting or impossible values", () => {
    const r = resolve([
      { kind: "position", trayKey: "a:p0:0", path: "01", rotated: false },
      { kind: "position", trayKey: "c:p0:0", path: "0", rotated: false },
      { kind: "position", trayKey: "b:p0:0", path: "1", rotated: true },
      { kind: "position", trayKey: "b:p0:0", path: "2", rotated: false },
    ]);
    expect(r.resolved.kept.map((l) => (l.kind === "position" ? l.trayKey : ""))).toEqual([
      "a:p0:0",
    ]);
    expect(r.notices.map((n) => n.code)).toEqual(["lock.dropped", "lock.dropped", "lock.dropped"]);
    // path names the dropped lock's index in the input, for the UI to remove exactly it
    expect(r.notices.map((n) => n.path).sort()).toEqual(["/locks/1", "/locks/2", "/locks/3"]);
    expect(r.resolved.lockedPaths).toEqual(["01"]);
  });

  it("keeps a valid size lock (detecting rotation) and drops ones that no longer fit", () => {
    const r = resolve([
      { kind: "size", trayKey: "a:p0:0", w: 44, d: 64, h: 30 },
      { kind: "size", trayKey: "b:p0:0", w: 10, d: 10, h: 10 },
      { kind: "size", trayKey: "c:p0:0", w: 400, d: 50, h: 20 },
    ]);
    expect([...r.resolved.sizes.values()]).toEqual([{ w: 4400, d: 6400, h: 3000, rotated: true }]);
    expect(r.notices.map((n) => n.message)).toEqual([
      expect.stringContaining("contents no longer fit"),
      expect.stringContaining("no longer fits in the box"),
    ]);
  });

  it("validates stack locks and freezes their order", () => {
    const r = resolve([
      { kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] },
      { kind: "stack", trayKeys: ["b:p0:0", "c:p0:0"] },
    ]);
    expect(r.resolved.groups).toEqual([
      [
        { req: 0, variant: 0, part: 0, rotated: false },
        { req: 1, variant: 0, part: 0, rotated: false },
      ],
    ]);
    expect(r.notices).toHaveLength(1);
    const tall = resolve([{ kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] }], { innerHeight: 15 });
    expect(tall.resolved.groups).toEqual([]);
    expect(tall.notices[0]?.message).toContain("taller");
  });
});

describe("applyLocks", () => {
  const ctx = createCtx(makeInput(reqs), fakeMeasure);
  const start: Tree = {
    root: cut(
      "x",
      leaf([{ req: 0, variant: 0, part: 0, rotated: false }]),
      cut(
        "y",
        leaf([{ req: 1, variant: 0, part: 0, rotated: false }]),
        leaf([{ req: 2, variant: 0, part: 0, rotated: false }]),
      ),
    ),
    variants: [0, 0, 0],
  };

  it("puts locked trays at their exact path, frozen, and completes the tree", () => {
    const { resolved } = resolveLocks(ctx, [
      { kind: "position", trayKey: "a:p0:0", path: "110", rotated: true },
      { kind: "position", trayKey: "c:p0:1", path: "0", rotated: false },
    ]);
    const locked = withSizeLocks(ctx, resolved.sizes);
    const env = moveEnvOf(locked, resolved);
    const t = applyLocks(start, resolved, env, createRng(1), (p) => (p === "11" ? "y" : undefined));
    expect(t).not.toBeNull();
    if (!t) {
      return;
    }
    expect(nodeAt(t.root, "110")).toEqual(
      leaf([{ req: 0, variant: 0, part: 0, rotated: true }], true),
    );
    expect(nodeAt(t.root, "0")).toEqual(
      leaf([{ req: 2, variant: 1, part: 1, rotated: false }], true),
    );
    const n11 = nodeAt(t.root, "11");
    expect(n11?.kind === "cut" && n11.axis).toBe("y");
    expect(t.variants).toEqual([0, 0, 1]);
    const keys = itemsOf(t.root)
      .map((i) => `${i.req}.${i.variant}.${i.part}`)
      .sort();
    expect(keys).toEqual(["0.0.0", "1.0.0", "2.1.0", "2.1.1"]);
  });

  it("is a no-op shape-wise without locks", () => {
    const env = moveEnvOf(ctx, noLocks(ctx));
    const t = applyLocks(start, noLocks(ctx), env, createRng(2));
    expect(t && leaves(t.root).length).toBe(3);
  });
});

describe("swapLocks", () => {
  const layout: StoredLayout = {
    createdWith: "t",
    geometryVersion: "0.1.0",
    inputsHash: "h",
    seed: 1,
    iterations: 1,
    capped: false,
    trays: [
      traySpec({ key: "a", path: "0", level: 0 }),
      traySpec({ key: "x", path: "0", level: 1 }),
      traySpec({ key: "b", path: "1", level: 0 }),
    ],
  };

  it("swaps whole leaves and locks both", () => {
    const out = swapLocks(
      [{ kind: "position", trayKey: "a", path: "0", rotated: false }],
      "a",
      "b",
      layout,
    );
    expect(out).toEqual([
      { kind: "position", trayKey: "a", path: "1", rotated: false },
      { kind: "position", trayKey: "x", path: "1", rotated: false },
      { kind: "stack", trayKeys: ["a", "x"] },
      { kind: "position", trayKey: "b", path: "0", rotated: false },
    ]);
  });

  it("swaps levels within one stack via a stack lock", () => {
    expect(swapLocks([], "a", "x", layout)).toEqual([{ kind: "stack", trayKeys: ["x", "a"] }]);
  });

  it("ignores unknown keys", () => {
    expect(swapLocks([], "a", "zzz", layout)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/locks.test.ts`

Expected: FAIL — `Failed to resolve import "./locks" from "src/layout/locks.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/locks.ts`:

```ts
import type { Lock, Notice, StoredLayout, TraySpec } from "../model/types";
import { fitsBed } from "./bed";
import {
  MAX_DEPTH,
  MAX_LEVELS,
  withSizeLocks,
  type Ctx,
  type FixedSize,
  type PartRef,
} from "./context";
import { insertItem, insertLeaf, removeItems, type MoveEnv } from "./moves";
import type { Rng } from "./prng";
import { stackHeights, stackLevels } from "./stack";
import {
  cut,
  leaf,
  leaves,
  nodeAt,
  replaceAt,
  type Axis,
  type StackItem,
  type Tree,
  type TreeNode,
} from "./tree";
import { toU } from "./units";

export interface LockedLeaf {
  readonly path: string;
  /** Bottom → top. */
  readonly items: readonly StackItem[];
}

export interface ResolvedLocks {
  /** Leaves fixed by position locks (frozen, at their path). */
  readonly leaves: readonly LockedLeaf[];
  /** Stack-locked groups without a position: frozen leaves that may move. */
  readonly groups: readonly (readonly StackItem[])[];
  readonly lockedPaths: readonly string[];
  /** Per requirement: the variant forced by locks, or null. */
  readonly pinnedVariant: readonly (number | null)[];
  /** Size locks keyed by partId. */
  readonly sizes: ReadonlyMap<number, FixedSize>;
  readonly rotationFixed: ReadonlySet<number>;
  /** Locks that survived validation, in input order. */
  readonly kept: readonly Lock[];
}

/** Hints from a warm-start layout, so locks keep the variant and rotation the user saw. */
export interface LockHints {
  variantOf?(req: number): number | undefined;
  rotatedOf?(trayKey: string): boolean | undefined;
}

export function noLocks(ctx: Ctx): ResolvedLocks {
  return {
    leaves: [],
    groups: [],
    lockedPaths: [],
    pinnedVariant: ctx.input.requirements.map(() => null),
    sizes: new Map(),
    rotationFixed: new Set(),
    kept: [],
  };
}

/** A guillotine path (a string of 0/1 digits) no longer than MAX_DEPTH: locks, stored layouts. */
export function isValidPath(path: string): boolean {
  return /^[01]*$/.test(path) && path.length <= MAX_DEPTH;
}

export function describeLock(lock: Lock): string {
  if (lock.kind === "stack") {
    return `Stack lock on ${lock.trayKeys.join(", ")}`;
  }
  return `${lock.kind === "position" ? "Position" : "Size"} lock on ${lock.trayKey}`;
}

/**
 * `path` is `/locks/<index>` (the lock's index in `LayoutInput.locks`) so the UI can remove
 * exactly that lock from the project; omitted when the index is unknown (< 0).
 */
export function lockDroppedNotice(lock: Lock, reason: string, index = -1): Notice {
  const notice: Notice = {
    level: "warning",
    code: "lock.dropped",
    message: `${describeLock(lock)} was dropped: ${reason}.`,
  };
  return index >= 0 ? { ...notice, path: `/locks/${index}` } : notice;
}

interface PosLock {
  readonly lock: Lock & { kind: "position" };
  readonly ref: PartRef;
  readonly id: number;
}

/**
 * Validates locks before optimizing (spec §7.2). Every lock that can't be kept — unknown
 * trayKey, contents that no longer fit a size lock, box edits, conflicting paths or
 * stacks — is dropped with a "lock.dropped" notice, never silently. A dropped lock
 * constrains nothing: only the requirements a kept lock names stay pinned to a variant.
 *
 * Size locks are checked against the unlipped level-0 metrics. A size-locked tray that ends
 * up lower in a stack (lipped) can need more; the search then sees lock overflow, and the
 * fallback in `optimize` (Task 18) drops the lock with its generic reason.
 */
export function resolveLocks(
  ctx: Ctx,
  locks: readonly Lock[],
  hints: LockHints = {},
): { resolved: ResolvedLocks; notices: Notice[] } {
  const notices: Notice[] = [];
  const dropped = new Set<Lock>();
  const drop = (lock: Lock, reason: string): void => {
    dropped.add(lock);
    notices.push(lockDroppedNotice(lock, reason, locks.indexOf(lock)));
  };
  const reqs = ctx.input.requirements;

  // 1. Keys must exist; all locks on one requirement must agree on a variant.
  const candidates: (Set<number> | null)[] = reqs.map(() => null);
  const accepted: Lock[] = [];
  for (const lock of locks) {
    const keys = lock.kind === "stack" ? lock.trayKeys : [lock.trayKey];
    if (keys.length === 0) {
      drop(lock, "it lists no trays");
      continue;
    }
    const missing = keys.find((k) => ctx.refsOfKey(k).length === 0);
    if (missing !== undefined) {
      drop(lock, `no tray "${missing}" exists any more`);
      continue;
    }
    const next = new Map<number, Set<number>>();
    let ok = true;
    for (const k of keys) {
      const refs = ctx.refsOfKey(k);
      const r = refs[0]?.req ?? 0;
      const withKey = new Set(refs.map((ref) => ref.variant));
      const cur = next.get(r) ?? candidates[r] ?? null;
      const inter = cur === null ? withKey : new Set([...cur].filter((v) => withKey.has(v)));
      if (inter.size === 0) {
        ok = false;
        break;
      }
      next.set(r, inter);
    }
    if (!ok) {
      drop(lock, "it conflicts with other locks on the same component");
      continue;
    }
    for (const [r, set] of next) {
      candidates[r] = set;
    }
    accepted.push(lock);
  }
  const pinnedVariant = candidates.map((set, r) => {
    if (set === null) {
      return null;
    }
    const preferred = hints.variantOf?.(r);
    return preferred !== undefined && set.has(preferred) ? preferred : Math.min(...set);
  });
  const refOf = (key: string): PartRef => {
    const refs = ctx.refsOfKey(key);
    return refs.find((r) => r.variant === pinnedVariant[r.req]) ?? (refs[0] as PartRef);
  };
  const rotatable = (ref: PartRef): boolean => ctx.part(ref)?.rotatable ?? false;

  // 2. Size locks.
  const sizes = new Map<number, FixedSize>();
  for (const lock of accepted) {
    if (lock.kind !== "size") {
      continue;
    }
    const ref = refOf(lock.trayKey);
    const id = ctx.partId(ref);
    if (sizes.has(id)) {
      drop(lock, "another size lock already fixes this tray");
      continue;
    }
    const m = ctx.metrics(ref, false, 0);
    const w = toU(lock.w);
    const d = toU(lock.d);
    const h = toU(lock.h);
    const asIs = w >= m.w && d >= m.d;
    const turned = rotatable(ref) && w >= m.d && d >= m.w;
    if ((!asIs && !turned) || h < m.h) {
      drop(lock, "its contents no longer fit that size");
      continue;
    }
    if (w > ctx.floorW || d > ctx.floorD || h > ctx.topPlane) {
      drop(lock, "it no longer fits in the box");
      continue;
    }
    if (!fitsBed(ctx.bed, w, d, h)) {
      drop(lock, "it is larger than the print bed");
      continue;
    }
    const rotated = asIs && turned ? (hints.rotatedOf?.(lock.trayKey) ?? false) : !asIs;
    sizes.set(id, { w, d, h, rotated });
  }

  // 3. Position locks.
  const singleTray =
    reqs.length === 1 && (reqs[0]?.variants[pinnedVariant[0] ?? 0]?.parts.length ?? 0) === 1;
  const pos = new Map<number, PosLock>();
  for (const lock of accepted) {
    if (lock.kind !== "position") {
      continue;
    }
    const ref = refOf(lock.trayKey);
    const id = ctx.partId(ref);
    if (!isValidPath(lock.path)) {
      drop(lock, "its position is not valid");
      continue;
    }
    if (pos.has(id)) {
      drop(lock, "another position lock already places this tray");
      continue;
    }
    if (lock.rotated && !rotatable(ref)) {
      drop(lock, "this tray can't be rotated");
      continue;
    }
    const size = sizes.get(id);
    if (size && size.rotated !== lock.rotated) {
      drop(lock, "it conflicts with the size lock on the same tray");
      continue;
    }
    const clash = [...pos.values()].find(
      (p) =>
        p.lock.path !== lock.path &&
        (p.lock.path.startsWith(lock.path) || lock.path.startsWith(p.lock.path)),
    );
    if (clash) {
      drop(lock, `it conflicts with the position lock on ${clash.lock.trayKey}`);
      continue;
    }
    if (lock.path === "" && !singleTray) {
      drop(lock, "it conflicts with the other trays");
      continue;
    }
    pos.set(id, { lock, ref, id });
  }

  const sized = withSizeLocks(ctx, sizes);
  const rotationOf = (ref: PartRef, key: string): boolean => {
    const id = ctx.partId(ref);
    const fixed = pos.get(id)?.lock.rotated ?? sizes.get(id)?.rotated;
    if (fixed !== undefined) {
      return fixed;
    }
    return rotatable(ref) && (hints.rotatedOf?.(key) ?? false);
  };
  const itemOf = (key: string): StackItem => {
    const ref = refOf(key);
    return { ...ref, rotated: rotationOf(ref, key) };
  };
  const fitsHeight = (items: readonly StackItem[]): boolean => {
    const h = stackHeights(sized, stackLevels(sized, items));
    return h.overflow === 0 && h.lockOverflow === 0;
  };

  // 4. Stack locks.
  const inGroup = new Map<number, { lock: Lock; items: StackItem[] }>();
  const groupsAll: { lock: Lock; items: StackItem[]; path: string | null }[] = [];
  for (const lock of accepted) {
    if (lock.kind !== "stack") {
      continue;
    }
    const items = lock.trayKeys.map(itemOf);
    const ids = items.map((i) => ctx.partId(i));
    if (new Set(ids).size !== ids.length || ids.some((id) => inGroup.has(id))) {
      drop(lock, "a tray appears in more than one stack lock");
      continue;
    }
    if (items.length > MAX_LEVELS) {
      drop(lock, `a stack holds at most ${MAX_LEVELS} trays`);
      continue;
    }
    const paths = new Set(
      ids.flatMap((id) => {
        const p = pos.get(id);
        return p ? [p.lock.path] : [];
      }),
    );
    if (paths.size > 1) {
      drop(lock, "its trays are locked to different positions");
      continue;
    }
    if (!fitsHeight(items)) {
      drop(lock, "the stack is taller than the space in the box");
      continue;
    }
    const g = { lock, items, path: [...paths][0] ?? null };
    groupsAll.push(g);
    for (const id of ids) {
      inGroup.set(id, g);
    }
  }

  // 5. Locked leaves: position-locked trays (and their stack groups) per path.
  const byPath = new Map<string, { items: StackItem[]; locks: PosLock[]; groups: Set<object> }>();
  for (const lock of accepted) {
    if (lock.kind !== "position" || dropped.has(lock)) {
      continue;
    }
    const ref = refOf(lock.trayKey);
    const id = ctx.partId(ref);
    const entry = byPath.get(lock.path) ?? { items: [], locks: [], groups: new Set<object>() };
    const g = inGroup.get(id);
    if (g) {
      if (!entry.groups.has(g)) {
        entry.groups.add(g);
        entry.items.push(...g.items);
      }
    } else {
      entry.items.push(itemOf(lock.trayKey));
    }
    entry.locks.push({ lock, ref, id });
    byPath.set(lock.path, entry);
  }
  const lockedLeaves: LockedLeaf[] = [];
  for (const [path, entry] of byPath) {
    if (entry.items.length > MAX_LEVELS || !fitsHeight(entry.items)) {
      for (const p of entry.locks) {
        drop(p.lock, "the trays locked to this position don't fit on top of each other");
        pos.delete(p.id);
      }
      continue;
    }
    lockedLeaves.push({ path, items: entry.items });
  }
  const groups = groupsAll
    .filter((g) => !g.items.some((i) => pos.has(ctx.partId(i))))
    .map((g) => g.items);
  const rotationFixed = new Set<number>([...pos.keys(), ...sizes.keys(), ...inGroup.keys()]);

  // 6. Locks dropped above must not keep pinning their requirement's variant. A requirement a
  // kept lock names keeps its pin: the kept locks were resolved under it, and it lies in
  // their intersection.
  const kept = locks.filter((l) => !dropped.has(l));
  const named = new Set(
    kept.flatMap((l) =>
      (l.kind === "stack" ? l.trayKeys : [l.trayKey]).map((k) => ctx.refsOfKey(k)[0]?.req ?? 0),
    ),
  );
  return {
    resolved: {
      leaves: lockedLeaves,
      groups,
      lockedPaths: lockedLeaves.map((l) => l.path),
      pinnedVariant: pinnedVariant.map((v, r) => (named.has(r) ? v : null)),
      sizes,
      rotationFixed,
      kept,
    },
    notices,
  };
}

export function moveEnvOf(ctx: Ctx, resolved: ResolvedLocks): MoveEnv {
  return {
    ctx,
    lockedPaths: resolved.lockedPaths,
    variantPinned: resolved.pinnedVariant.map((v) => v !== null),
    rotationFixed: resolved.rotationFixed,
  };
}

function sameItems(a: readonly StackItem[], b: readonly StackItem[], ctx: Ctx): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => {
      const y = b[i];
      return y !== undefined && ctx.partId(x) === ctx.partId(y);
    })
  );
}

/**
 * Ensures every requirement has exactly the parts of its active variant in the tree:
 * drops duplicates and parts of other variants, inserts missing parts.
 */
export function completeTree(tree: Tree, env: MoveEnv, rng: Rng): Tree | null {
  const { ctx } = env;
  const seen = new Set<number>();
  let root: TreeNode | null = removeItems(
    tree.root,
    (item) => {
      const id = ctx.partId(item);
      const wrong = item.variant !== (tree.variants[item.req] ?? 0) || ctx.part(item) === undefined;
      if (wrong || seen.has(id)) {
        return true;
      }
      seen.add(id);
      return false;
    },
    env,
  );
  ctx.input.requirements.forEach((r, i) => {
    const v = tree.variants[i] ?? 0;
    (r.variants[v]?.parts ?? []).forEach((p, k) => {
      const item: StackItem = { req: i, variant: v, part: k, rotated: false };
      if (root !== null && !seen.has(ctx.partId(item))) {
        root = insertItem(
          root,
          { ...item, rotated: p.rotatable && rng.nextInt(2) === 1 },
          env,
          rng,
        );
      }
    });
  });
  return root === null ? null : { ...tree, root };
}

/**
 * Turns any start tree into one that satisfies the resolved locks: pinned variants,
 * frozen locked leaves at their exact paths (route cuts get the warm-start axis when
 * known), stack-locked groups as frozen leaves, then completeTree. Returns null only
 * when no unlocked leaf is left to insert into.
 */
export function applyLocks(
  tree: Tree,
  resolved: ResolvedLocks,
  env: MoveEnv,
  rng: Rng,
  axisOf: (path: string) => Axis | undefined = () => undefined,
): Tree | null {
  const { ctx } = env;
  const free: MoveEnv = { ...env, lockedPaths: [] };
  const variants = tree.variants.map((v, i) => resolved.pinnedVariant[i] ?? v);
  const posIds = new Set(resolved.leaves.flatMap((l) => l.items.map((i) => ctx.partId(i))));
  let root: TreeNode = tree.root;

  // Groups already standing as a stack keep their place (frozen); others are re-inserted.
  const intactGroups = new Set<number>();
  for (const [gi, g] of resolved.groups.entries()) {
    const at = leaves(root).find((l) => sameItems(l.leaf.stack, g, ctx));
    if (at) {
      root = replaceAt(root, at.path, leaf(at.leaf.stack, true));
      intactGroups.add(gi);
    }
  }
  const groupIds = new Set(
    resolved.groups.flatMap((g, gi) => (intactGroups.has(gi) ? [] : g.map((i) => ctx.partId(i)))),
  );
  root = removeItems(
    root,
    (item) => {
      const id = ctx.partId(item);
      return posIds.has(id) || groupIds.has(id) || item.variant !== variants[item.req];
    },
    free,
  );

  const displaced: { items: StackItem[]; frozen: boolean }[] = [];
  for (const locked of [...resolved.leaves].sort((a, b) => a.path.localeCompare(b.path))) {
    for (let n = 0; n < locked.path.length; n++) {
      const q = locked.path.slice(0, n);
      const node = nodeAt(root, q);
      const axis = axisOf(q) ?? (n % 2 === 0 ? "x" : "y");
      if (!node) {
        break;
      }
      if (node.kind === "leaf") {
        const onA = locked.path.charAt(n) === "0";
        root = replaceAt(root, q, onA ? cut(axis, leaf([]), node) : cut(axis, node, leaf([])));
      } else if (axisOf(q) !== undefined && node.axis !== axis) {
        root = replaceAt(root, q, { ...node, axis });
      }
    }
    const existing = nodeAt(root, locked.path);
    if (existing) {
      for (const l of leaves(existing)) {
        if (l.leaf.stack.length > 0) {
          displaced.push({ items: [...l.leaf.stack], frozen: l.leaf.frozen });
        }
      }
    }
    root = replaceAt(root, locked.path, leaf(locked.items, true));
  }

  let out: TreeNode | null = root;
  for (const d of displaced) {
    if (out === null) {
      break;
    }
    if (d.frozen) {
      out = insertLeaf(out, leaf(d.items, true), env, rng);
    } else {
      for (const item of d.items) {
        out = out === null ? null : insertItem(out, item, env, rng);
      }
    }
  }
  resolved.groups.forEach((g, gi) => {
    if (out !== null && !intactGroups.has(gi)) {
      out = insertLeaf(out, leaf(g, true), env, rng);
    }
  });
  if (out === null) {
    return null;
  }
  return completeTree({ root: out, variants }, env, rng);
}

/**
 * Drag-to-swap in the plan view: swaps the two trays' leaves (whole stacks) and locks
 * both. Trays in the same stack swap levels via a stack lock instead.
 */
export function swapLocks(
  locks: readonly Lock[],
  keyA: string,
  keyB: string,
  layout: StoredLayout,
): Lock[] {
  const trays = layout.trays.filter((t) => t.part === "tray");
  const a = trays.find((t) => t.key === keyA);
  const b = trays.find((t) => t.key === keyB);
  if (!a || !b || keyA === keyB) {
    return [...locks];
  }
  const stackAt = (path: string): TraySpec[] =>
    trays.filter((t) => t.path === path).sort((p, q) => p.level - q.level);
  if (a.path === b.path) {
    const keys = stackAt(a.path).map((t) =>
      t.key === keyA ? keyB : t.key === keyB ? keyA : t.key,
    );
    const rest = locks.filter(
      (l) => !(l.kind === "stack" && l.trayKeys.some((k) => keys.includes(k))),
    );
    return [...rest, { kind: "stack", trayKeys: keys }];
  }
  const sa = stackAt(a.path);
  const sb = stackAt(b.path);
  const moved = new Set([...sa, ...sb].map((t) => t.key));
  const rest = locks.filter((l) => {
    if (l.kind === "stack") {
      return !l.trayKeys.some((k) => moved.has(k));
    }
    return !(l.kind === "position" && moved.has(l.trayKey));
  });
  const out: Lock[] = [...rest];
  for (const [stack, path] of [
    [sa, b.path],
    [sb, a.path],
  ] as const) {
    for (const t of stack) {
      out.push({ kind: "position", trayKey: t.key, path, rotated: t.rotated });
    }
    if (stack.length > 1) {
      out.push({ kind: "stack", trayKeys: stack.map((t) => t.key) });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/locks.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/locks.test.ts src/layout/locks.ts src/layout/test-utils.ts
git commit -m "Add lock validation, application and drag-to-swap"
```

### Task 11: Greedy starting layouts

**Files:**

- Create: `src/layout/greedy.ts`
- Test: `src/layout/greedy.test.ts`

**Interfaces:**

- Consumes: `fitsBed` (Task 3); `Ctx`, `MAX_LEVELS` (Task 4); `ResolvedLocks`, `noLocks`, `resolveLocks` (Task 10); stack functions (Task 6); tree functions (Task 5); `evaluate`, `overflowTotal` (Task 7, test).
- Produces: `firstFittingVariant(ctx, req): number`; `greedyTree(ctx, resolved, along: Axis): Tree` (first-fit decreasing shelves along X or Y; stacks when the floor runs out; position-locked trays left out, stack-locked groups as frozen leaves).

- [ ] **Step 1: Write the failing test**

`src/layout/greedy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate, overflowTotal } from "./fill";
import { firstFittingVariant, greedyTree } from "./greedy";
import { noLocks, resolveLocks } from "./locks";
import { boxReq, comp, fakeMeasure, makeInput, part, req, variant } from "./test-utils";
import { itemsOf, leaves } from "./tree";

describe("greedyTree", () => {
  const reqs = [
    boxReq("big", 140, 90, 20),
    boxReq("mid", 100, 90, 20),
    boxReq("small", 60, 50, 20),
    boxReq("tiny", 40, 30, 20),
  ];

  it("packs all parts without overflow when they fit side by side (both directions)", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    for (const along of ["x", "y"] as const) {
      const tree = greedyTree(ctx, noLocks(ctx), along);
      expect(itemsOf(tree.root)).toHaveLength(4);
      expect(overflowTotal(evaluate(ctx, tree).overflow)).toBe(0);
    }
  });

  it("stacks when the floor runs out but the height allows it", () => {
    const three = [reqs[0], reqs[2], reqs[3]].flatMap((r) => (r ? [r] : []));
    const ctx = createCtx(
      makeInput(three, { box: { innerWidth: 160, innerDepth: 100, innerHeight: 80 } }),
      fakeMeasure,
    );
    const tree = greedyTree(ctx, noLocks(ctx), "x");
    expect(leaves(tree.root).some((l) => l.leaf.stack.length > 1)).toBe(true);
    expect(overflowTotal(evaluate(ctx, tree).overflow)).toBe(0);
  });

  it("returns an empty leaf for no requirements", () => {
    const ctx = createCtx(makeInput([]), fakeMeasure);
    expect(greedyTree(ctx, noLocks(ctx), "x").root).toEqual({
      kind: "leaf",
      stack: [],
      frozen: false,
    });
  });

  it("leaves position-locked trays out and keeps stack-locked groups together", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const { resolved } = resolveLocks(ctx, [
      { kind: "position", trayKey: "big:p0:0", path: "0", rotated: false },
      { kind: "stack", trayKeys: ["mid:p0:0", "tiny:p0:0"] },
    ]);
    const tree = greedyTree(ctx, resolved, "y");
    expect(
      itemsOf(tree.root)
        .map((i) => i.req)
        .sort(),
    ).toEqual([1, 2, 3]);
    const frozen = leaves(tree.root).filter((l) => l.leaf.frozen);
    expect(frozen.map((l) => l.leaf.stack.map((i) => i.req))).toEqual([[1, 3]]);
  });

  it("starts from the first variant that fits the box height, bed and floor", () => {
    const upright = req("cards", [
      variant("upright", [part("cards:p0:0", [comp({ minW: 30, minD: 90, minH: 70 })])]),
      variant("flat", [part("cards:p0:0", [comp({ minW: 90, minD: 65, minH: 30 })])]),
    ]);
    const ctx = createCtx(makeInput([upright], { box: { innerHeight: 50 } }), fakeMeasure);
    expect(firstFittingVariant(ctx, 0)).toBe(1);
    expect(greedyTree(ctx, noLocks(ctx), "x").variants).toEqual([1]);
    const none = createCtx(makeInput([upright], { box: { innerHeight: 20 } }), fakeMeasure);
    expect(firstFittingVariant(none, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/greedy.test.ts`

Expected: FAIL — `Failed to resolve import "./greedy" from "src/layout/greedy.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/greedy.ts`:

```ts
import { fitsBed } from "./bed";
import { MAX_LEVELS, type Ctx } from "./context";
import type { ResolvedLocks } from "./locks";
import { stackHeights, stackLevels, stackMinFootprint } from "./stack";
import {
  cut,
  leaf,
  otherAxis,
  SHARE_MAX,
  type Axis,
  type StackItem,
  type Tree,
  type TreeNode,
} from "./tree";
import type { Ext, U } from "./units";

interface Unit {
  items: StackItem[];
  readonly frozen: boolean;
  ext: Ext;
}

interface Shelf {
  readonly units: Unit[];
  used: U;
  depth: U;
}

/** Right-nested chain of cuts; shares split the slack evenly between the nodes. */
function chain(nodes: readonly TreeNode[], axis: Axis): TreeNode {
  const [first, ...rest] = nodes;
  if (!first) {
    return leaf([]);
  }
  if (rest.length === 0) {
    return first;
  }
  return cut(axis, first, chain(rest, axis), Math.floor(SHARE_MAX / nodes.length));
}

/**
 * Sizing never sees the box (roadmap §4.7), so a requirement's preferred variant may not
 * fit at all (e.g. upright cards taller than the box). Starting layouts use the first
 * variant whose every part fits the height, the bed and the floor; else variant 0.
 */
export function firstFittingVariant(ctx: Ctx, req: number): number {
  const r = ctx.input.requirements[req];
  const fits = (variant: number): boolean =>
    (r?.variants[variant]?.parts ?? []).every((p, part) => {
      const m = ctx.metrics({ req, variant, part }, false, 0);
      const onFloor =
        (m.w <= ctx.floorW && m.d <= ctx.floorD) ||
        (p.rotatable && m.d <= ctx.floorW && m.w <= ctx.floorD);
      return m.h <= ctx.topPlane && fitsBed(ctx.bed, m.w, m.d, m.h) && onFloor;
    });
  const i = (r?.variants ?? []).findIndex((_, v) => fits(v));
  return Math.max(0, i);
}

/**
 * First-fit decreasing shelf packing (spec §7.2 starting layouts). With `along` = "x",
 * shelves run along X and are stacked along Y; "y" is the transpose. Units that fit in no
 * shelf and no new shelf are stacked onto an existing stack when the grown footprint
 * (lipped wall, insets) still fits the shelf and the floor and the heights fit; otherwise
 * they open a shelf anyway (overflow, which the annealer then removes).
 * Position-locked trays are left out (applyLocks adds them).
 */
export function greedyTree(ctx: Ctx, resolved: ResolvedLocks, along: Axis): Tree {
  const reqs = ctx.input.requirements;
  const variants = reqs.map((_, i) => resolved.pinnedVariant[i] ?? firstFittingVariant(ctx, i));
  const skip = new Set<number>([
    ...resolved.leaves.flatMap((l) => l.items.map((i) => ctx.partId(i))),
    ...resolved.groups.flatMap((g) => g.map((i) => ctx.partId(i))),
  ]);
  const extOf = (items: readonly StackItem[]): Ext =>
    stackMinFootprint(ctx, stackLevels(ctx, items));
  const units: Unit[] = resolved.groups.map((g) => ({
    items: [...g],
    frozen: true,
    ext: extOf(g),
  }));
  reqs.forEach((r, i) => {
    const v = variants[i] ?? 0;
    (r.variants[v]?.parts ?? []).forEach((p, k) => {
      const ref = { req: i, variant: v, part: k };
      if (skip.has(ctx.partId(ref))) {
        return;
      }
      const fixed = ctx.sizeLocks.get(ctx.partId(ref));
      const m = ctx.metrics(ref, false, 0);
      const flat = along === "x" ? m.w < m.d : m.d < m.w;
      const rotated = fixed ? fixed.rotated : p.rotatable && flat;
      const items = [{ ...ref, rotated }];
      units.push({ items, frozen: false, ext: extOf(items) });
    });
  });
  const primary = (e: Ext): U => (along === "x" ? e.w : e.d);
  const secondary = (e: Ext): U => (along === "x" ? e.d : e.w);
  const order = units
    .map((u, i) => ({ u, i }))
    .sort(
      (a, b) =>
        secondary(b.u.ext) - secondary(a.u.ext) || primary(b.u.ext) - primary(a.u.ext) || a.i - b.i,
    )
    .map((x) => x.u);
  const P = along === "x" ? ctx.floorW : ctx.floorD;
  const S = along === "x" ? ctx.floorD : ctx.floorW;
  const shelves: Shelf[] = [];
  const usedS = (): U =>
    shelves.reduce((s, sh) => s + sh.depth, 0) + Math.max(0, shelves.length - 1) * ctx.gap;
  for (const unit of order) {
    const p = primary(unit.ext);
    const s = secondary(unit.ext);
    const shelf = shelves.find((sh) => sh.used + ctx.gap + p <= P && s <= sh.depth);
    if (shelf) {
      shelf.units.push(unit);
      shelf.used += ctx.gap + p;
      continue;
    }
    if (shelves.length === 0 || usedS() + ctx.gap + s <= S) {
      shelves.push({ units: [unit], used: p, depth: s });
      continue;
    }
    let stacked = false;
    for (const sh of shelves) {
      for (const base of sh.units) {
        if (
          stacked ||
          base.frozen ||
          unit.frozen ||
          base.items.length + unit.items.length > MAX_LEVELS
        ) {
          continue;
        }
        const items = [...base.items, ...unit.items];
        const levels = stackLevels(ctx, items);
        const f = stackMinFootprint(ctx, levels);
        const grow = Math.max(0, primary(f) - primary(base.ext));
        const depth = Math.max(sh.depth, secondary(f));
        if (
          sh.used + grow <= P &&
          usedS() - sh.depth + depth <= S &&
          stackHeights(ctx, levels).overflow === 0
        ) {
          base.items = items;
          base.ext = f;
          sh.used += grow;
          sh.depth = depth;
          stacked = true;
        }
      }
    }
    if (!stacked) {
      shelves.push({ units: [unit], used: p, depth: s });
    }
  }
  const shelfNodes = shelves.map((sh) =>
    chain(
      sh.units.map((u) => leaf(u.items, u.frozen)),
      along,
    ),
  );
  return { root: chain(shelfNodes, otherAxis(along)), variants };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/greedy.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/greedy.test.ts src/layout/greedy.ts
git commit -m "Add first-fit-decreasing starting layouts"
```

### Task 12: Materialize: plan → TraySpec

**Files:**

- Create: `src/layout/materialize.ts`
- Modify: `src/layout/test-utils.ts` (add `fakeRealize`)
- Test: `src/layout/materialize.test.ts`

**Interfaces:**

- Consumes: `realizeTray(part, outer, settings, opts)`, `rotateRealized(r: RealizedTray, outer: OuterSize)` (`../sizing`, plan 2 / roadmap §4.7); `Ctx` (Task 4); `Plan` (Task 7); `roundMm`, `toMm` (Task 1).
- Produces: `type Realize = (part, outer, settings, opts) => RealizedTray`; `materialize(ctx, plan, realize: Realize = realizeTray): TraySpec[]` (trays in leaf order with their spacer right after, then `leftover:<n>`); test helper `fakeRealize: Realize`.

- [ ] **Step 1: Extend the test helpers with a fake realize**

Replace the whole file with the version below. It keeps the earlier additions (`item` from Task 5, `traySpec` from Task 10) and adds the `CompartmentSpec`/`Realize` imports and `fakeRealize` at the end; everything else is unchanged.

`src/layout/test-utils.ts`:

```ts
import { DEFAULT_SETTINGS } from "../model/settings";
import { CHANNEL_DEPTH, MIN_GRIP } from "../sizing/constants";
import type {
  Access,
  Box,
  CompartmentSpec,
  Lock,
  Printer,
  Settings,
  TraySpec,
} from "../model/types";
import type { CompartmentReq, TrayPartReq, TrayRequirement, TrayVariant } from "../sizing/types";
import type { Measure } from "./context";
import type { Realize } from "./materialize";
import type { StackItem } from "./tree";
import type { LayoutInput } from "./types";

export const TEST_BOX: Box = {
  innerWidth: 300,
  innerDepth: 200,
  innerHeight: 60,
  headroom: 0,
  headroomCoverage: "full",
  storedOnSide: false,
};

export const TEST_PRINTER: Printer = {
  bedX: 256,
  bedY: 256,
  bedZ: 256,
  bedMargin: 5,
  layerHeight: 0.2,
};

export interface CompOpts {
  minW: number;
  minD: number;
  minH: number;
  elastic?: Partial<CompartmentReq["elastic"]>;
  kind?: CompartmentReq["kind"];
  contents?: string;
  /** Forces (true) or suppresses (false) the front wall cutout. */
  fingerCut?: boolean;
}

/**
 * A compartment. It asks for a front wall cutout when `fingerCut` says so or, by default, when
 * a side is under the MIN_GRIP size.
 */
export function comp(o: CompOpts): CompartmentReq {
  const needsCut = o.fingerCut ?? Math.min(o.minW, o.minD) < MIN_GRIP;
  return {
    componentId: "c",
    contents: o.contents ?? `${o.minW}x${o.minD}x${o.minH}`,
    kind: o.kind ?? "well",
    minW: o.minW,
    minD: o.minD,
    minH: o.minH,
    elastic: { w: false, d: false, h: false, ...o.elastic },
    features: needsCut
      ? [{ type: "wallCutout", side: "front", depthFraction: CHANNEL_DEPTH, floorNotch: false }]
      : [],
  };
}

export function part(
  trayKey: string,
  compartments: CompartmentReq[],
  rotatable = true,
): TrayPartReq {
  return { trayKey, arrangement: "strip", compartments, rotatable };
}

export function variant(id: string, parts: TrayPartReq[]): TrayVariant {
  return { id, parts };
}

export function req(
  key: string,
  variants: TrayVariant[],
  o: { access?: Access; loose?: boolean } = {},
): TrayRequirement {
  return {
    key,
    componentIds: [key],
    access: o.access ?? "sometimes",
    loose: o.loose ?? false,
    variants,
  };
}

/** One requirement, one variant, one part, one compartment of the given inner minimum. */
export function boxReq(
  key: string,
  minW: number,
  minD: number,
  minH: number,
  o: {
    access?: Access;
    loose?: boolean;
    rotatable?: boolean;
    elastic?: Partial<CompartmentReq["elastic"]>;
  } = {},
): TrayRequirement {
  return req(
    key,
    [
      variant("only", [
        part(
          `${key}:p0:0`,
          [comp({ minW, minD, minH, elastic: o.elastic, contents: key })],
          o.rotatable ?? true,
        ),
      ]),
    ],
    o,
  );
}

export function makeInput(
  requirements: TrayRequirement[],
  o: {
    box?: Partial<Box>;
    printer?: Partial<Printer>;
    settings?: Partial<Settings>;
    locks?: Lock[];
  } = {},
): LayoutInput {
  return {
    requirements,
    box: { ...TEST_BOX, ...o.box },
    printer: { ...TEST_PRINTER, ...o.printer },
    settings: { ...DEFAULT_SETTINGS, ...o.settings },
    locks: o.locks ?? [],
    inputsHash: "test-hash",
    appVersion: "0.0.0-test",
  };
}

/**
 * Fixed-size measure for unit tests: outer = inner minimum + 2 × 2 mm walls
 * (+1 mm per side when lipped), h = minH + 1.2 floor. Independent of sizing internals.
 */
export const fakeMeasure: Measure = (p, _settings, opts) => {
  const wall = opts.lipped ? 3 : 2;
  const w = p.compartments.reduce((s, c) => s + c.minW, 0) + 2 * wall;
  const d = Math.max(...p.compartments.map((c) => c.minD)) + 2 * wall;
  const h = Math.max(...p.compartments.map((c) => c.minH)) + 1.2;
  return { w, d, h };
};

/** A stack item for part 0 of variant 0 of requirement `req`. */
export function item(req: number, rotated = false): StackItem {
  return { req, variant: 0, part: 0, rotated };
}

/** A printed tray spec: a plain 100 × 50 × 20 tray at path "0", with `o` laid over it. */
export function traySpec(o: Partial<TraySpec> = {}): TraySpec {
  return {
    key: "k",
    part: "tray",
    path: "0",
    stack: 0,
    level: 0,
    x: 0,
    y: 0,
    z: 0,
    w: 100,
    d: 50,
    h: 20,
    rotated: false,
    wall: 1.6,
    floor: 1.2,
    lip: false,
    solid: false,
    compartments: [],
    ...o,
  };
}

/**
 * Simple realize for unit tests: compartments side by side along X filling the inner
 * area, a wall cutout on the left side of each, one 5 mm spacer in the first well with a
 * notch (its own feature, which materialize must keep).
 */
export const fakeRealize: Realize = (p, outer, settings) => {
  const wall = settings.wall;
  const n = p.compartments.length;
  const innerW = outer.w - 2 * wall - (n - 1) * settings.divider;
  const each = innerW / n;
  const compartments: CompartmentSpec[] = p.compartments.map((c, i) => ({
    x: wall + i * (each + settings.divider),
    y: wall,
    w: each,
    d: outer.d - 2 * wall,
    floorZ: settings.floor,
    kind: c.kind,
    contents: c.contents,
    features: [
      { type: "wallCutout", side: "left", at: outer.d / 2, width: 22, depth: 5, floorNotch: 0 },
    ],
  }));
  const spacer: TraySpec = {
    key: "s",
    part: "spacer",
    path: "",
    stack: 0,
    level: 0,
    x: wall,
    y: wall,
    z: settings.floor,
    w: 5,
    d: outer.d - 2 * wall,
    h: Math.max(1, outer.h - 5),
    rotated: false,
    wall,
    floor: settings.floor,
    lip: false,
    solid: true,
    compartments: [],
    features: [{ type: "spacerNotch", axis: "y", at: 2.5, width: 10, depth: 3 }],
  };
  return { wall, compartments, spacers: [spacer] };
};
```

- [ ] **Step 2: Write the failing test**

`src/layout/materialize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { materialize } from "./materialize";
import { boxReq, fakeMeasure, fakeRealize, makeInput } from "./test-utils";
import { cut, leaf, type Tree } from "./tree";
import { toU } from "./units";

describe("materialize", () => {
  const reqs = [boxReq("a", 100, 60, 20), boxReq("b", 50, 40, 10)];
  const ctx = createCtx(makeInput(reqs), fakeMeasure);

  it("emits trays in mm with spacers translated and leftovers keyed leftover:n", () => {
    const tree: Tree = {
      root: cut(
        "x",
        leaf([{ req: 0, variant: 0, part: 0, rotated: false }]),
        leaf([{ req: 1, variant: 0, part: 0, rotated: false }]),
      ),
      variants: [0, 0],
    };
    const plan = evaluate(ctx, tree);
    const specs = materialize(ctx, plan, fakeRealize);
    const a = specs.find((t) => t.key === "a:p0:0");
    const spacer = specs.find((t) => t.key === "a:p0:0:spacer");
    expect(a).toMatchObject({ part: "tray", path: "0", level: 0, x: 0, y: 0, z: 0, lip: false });
    expect(spacer).toMatchObject({ part: "spacer", path: "", solid: true, x: 1.6, y: 1.6 });
    expect(specs.filter((t) => t.part === "leftover").map((t) => t.key)).toEqual(
      plan.leftovers.map((_, i) => `leftover:${i}`),
    );
    for (const t of specs) {
      for (const v of [t.x, t.y, t.z, t.w, t.d, t.h]) {
        expect(toU(v) / 100).toBe(v);
      }
    }
  });

  it("keeps a spacer's own features and translates only its position", () => {
    const tree: Tree = {
      root: leaf([{ req: 0, variant: 0, part: 0, rotated: false }]),
      variants: [0, 0],
    };
    const specs = materialize(ctx, evaluate(ctx, tree), fakeRealize);
    const spacer = specs.find((t) => t.key === "a:p0:0:spacer");
    expect(spacer?.features).toEqual([
      { type: "spacerNotch", axis: "y", at: 2.5, width: 10, depth: 3 },
    ]);
  });

  it("realizes a rotated tray inside its rotated footprint", () => {
    const tree: Tree = {
      root: leaf([{ req: 0, variant: 0, part: 0, rotated: true }]),
      variants: [0, 0],
    };
    const specs = materialize(ctx, evaluate(ctx, tree), fakeRealize);
    const a = specs.find((t) => t.key === "a:p0:0");
    expect(a?.rotated).toBe(true);
    for (const c of a?.compartments ?? []) {
      expect(c.x + c.w).toBeLessThanOrEqual((a?.w ?? 0) + 1e-9);
      expect(c.y + c.d).toBeLessThanOrEqual((a?.d ?? 0) + 1e-9);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/layout/materialize.test.ts`

Expected: FAIL — `Failed to resolve import "./materialize" from "src/layout/materialize.test.ts"`.

- [ ] **Step 4: Write the implementation**

`src/layout/materialize.ts`:

```ts
import type { Settings, TraySpec } from "../model/types";
import { realizeTray, rotateRealized } from "../sizing";
import type { OuterSize, RealizedTray, RealizeOptions, TrayPartReq } from "../sizing/types";
import type { Ctx } from "./context";
import type { Plan } from "./fill";
import { roundMm, toMm } from "./units";

/** Same signature as sizing's realizeTray; injectable for unit tests. */
export type Realize = (
  part: TrayPartReq,
  outer: OuterSize,
  settings: Settings,
  opts: RealizeOptions,
) => RealizedTray;

/**
 * Turns an integer plan into TraySpecs in mm (spec §8.4): realizeTray fills each tray's
 * compartments (slack, raised floors, spacers) with the same `lipped` flag the TraySpec
 * carries (roadmap §4.6); spacers are translated into box coordinates and follow their
 * tray; leftovers become a spare tray or a solid block. Clamping to the minimum outer size
 * only matters for infeasible attempts (feasible plans are never below it); at or above it
 * sizing guarantees the tray realizes, so any error from realize is a bug and propagates
 * (amendment 1). Walls and floors are written as sizing writes them (ctx.wall, ctx.floor:
 * rounded up to 0.01 mm, the wall at least MIN_WALL_MM).
 */
export function materialize(ctx: Ctx, plan: Plan, realize: Realize = realizeTray): TraySpec[] {
  const s = ctx.input.settings;
  const wall = toMm(ctx.wall);
  const floor = toMm(ctx.floor);
  const out: TraySpec[] = [];
  for (const t of plan.trays) {
    const part = ctx.part(t.item);
    if (!part) {
      continue;
    }
    const m = ctx.metrics(t.item, t.lipped, t.level);
    const minW = t.item.rotated ? m.d : m.w;
    const minD = t.item.rotated ? m.w : m.d;
    const w = toMm(Math.max(t.w, minW));
    const d = toMm(Math.max(t.d, minD));
    const h = toMm(Math.max(t.h, m.h));
    const opts = { lipped: t.lipped, level: t.level };
    // realizeTray works in the part's own frame; a rotated placement is realized at the
    // swapped size and turned 90° counter-clockwise by sizing's rotateRealized.
    const own = t.item.rotated ? { w: d, d: w, h } : { w, d, h };
    const realized = t.item.rotated
      ? rotateRealized(realize(part, own, s, opts), own)
      : realize(part, own, s, opts);
    const x = toMm(t.x);
    const y = toMm(t.y);
    const z = toMm(t.z);
    out.push({
      key: part.trayKey,
      part: "tray",
      path: t.path,
      stack: t.stack,
      level: t.level,
      x,
      y,
      z,
      w,
      d,
      h,
      rotated: t.item.rotated,
      wall,
      floor,
      lip: t.lipped,
      solid: false,
      compartments: realized.compartments,
    });
    for (const sp of realized.spacers) {
      out.push({
        ...sp,
        key: `${part.trayKey}:spacer`,
        part: "spacer",
        path: "",
        stack: t.stack,
        level: t.level,
        x: roundMm(x + sp.x),
        y: roundMm(y + sp.y),
        z: roundMm(z + sp.z),
        solid: true,
        compartments: [],
      });
    }
  }
  plan.leftovers.forEach((l, n) => {
    const w = toMm(l.w);
    const d = toMm(l.d);
    out.push({
      key: `leftover:${n}`,
      part: "leftover",
      path: l.path,
      stack: l.stack,
      level: 0,
      x: toMm(l.x),
      y: toMm(l.y),
      z: 0,
      w,
      d,
      h: toMm(l.h),
      rotated: false,
      wall,
      floor,
      lip: false,
      solid: l.solid,
      compartments: l.solid
        ? []
        : [
            {
              x: wall,
              y: wall,
              w: roundMm(w - 2 * wall),
              d: roundMm(d - 2 * wall),
              floorZ: floor,
              kind: "spare",
              contents: "",
              features: [],
            },
          ],
    });
  });
  return out;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/layout/materialize.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 6: Commit**

From the repo root:

```bash
git add src/layout/materialize.ts src/layout/materialize.test.ts src/layout/test-utils.ts
git commit -m "Materialize layout plans into tray specs"
```

### Task 13: Warm start from a stored layout

**Files:**

- Create: `src/layout/warmstart.ts`
- Test: `src/layout/warmstart.test.ts`

**Interfaces:**

- Consumes: `TraySpec`, `CompartmentSpec`; `CompartmentReq`, `TrayPartReq` (`../sizing/types`); `Ctx`, `MAX_DEPTH` (Task 4); `isValidPath`, `LockHints` (Task 10); `PrevPos` (Task 8); `stackLevels`, `stackMinFootprint` (Task 6); `cut`, `leaf`, `minExtents`, `splitRect`, `SHARE_HALF`, `SHARE_MAX` (Task 5); `toU`, `Rect` (Task 1); test helper `traySpec` (Task 10).
- Produces: `meetsMinimum(c: CompartmentReq, s: CompartmentSpec, trayH: number): boolean` (rule 7 for one compartment; the rectangle is content + clearance, no reach bands: amendment 7); `inferVariant(ctx, req, trays): number | undefined` (a `TraySpec` doesn't record its variant and plan 2 gives every variant of a requirement the same trayKeys, e.g. `<key>:p0:0` for upright and flat cards, so the variant is the first whose key set matches and whose compartments meet their minimums); `interface WarmHints extends Required<LockHints> { axisOf(path): Axis | undefined; prev: ReadonlyMap<string, PrevPos> }`; `warmHints(ctx, trays): WarmHints` (`variantOf` = `inferVariant`, `levelOf` from the stored levels, `singleLeaf` when every stored tray is at the root path); `warmTree(ctx, trays, pinnedVariant, hints): Tree | null` (null for corrupt or prefix-conflicting paths).

- [ ] **Step 1: Write the failing test**

`src/layout/warmstart.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TraySpec } from "../model/types";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { materialize } from "./materialize";
import {
  boxReq,
  comp,
  fakeMeasure,
  fakeRealize,
  makeInput,
  part,
  req,
  traySpec,
  variant,
} from "./test-utils";
import { cut, leaf, SHARE_MAX, type Tree } from "./tree";
import { inferVariant, warmHints, warmTree } from "./warmstart";

const reqs = [
  boxReq("a", 100, 60, 20),
  boxReq("b", 50, 40, 10),
  boxReq("c", 60, 40, 15),
  req("d", [
    variant("one", [
      part("d:p0:0", [
        comp({ minW: 30, minD: 30, minH: 10 }),
        comp({ minW: 30, minD: 30, minH: 10 }),
      ]),
    ]),
    variant("two", [
      part("d:p0:0", [comp({ minW: 30, minD: 30, minH: 10 })]),
      part("d:p0:1", [comp({ minW: 30, minD: 30, minH: 10 })]),
    ]),
  ]),
];
const ctx = createCtx(makeInput(reqs), fakeMeasure);
const at = (r: number, v = 0, p = 0, rotated = false) => ({ req: r, variant: v, part: p, rotated });

const tree: Tree = {
  root: cut(
    "x",
    leaf([at(0), at(1, 0, 0, true)]),
    cut(
      "y",
      leaf([at(2)]),
      cut("x", leaf([at(3, 1, 0)]), leaf([at(3, 1, 1)]), SHARE_MAX / 3),
      123_456,
    ),
    700_000,
  ),
  variants: [0, 0, 0, 1],
};

describe("warm start", () => {
  const trays = materialize(ctx, evaluate(ctx, tree), fakeRealize);

  it("infers variants, rotations and cut axes from a stored layout", () => {
    const h = warmHints(ctx, trays);
    expect(h.variantOf(3)).toBe(1);
    expect(h.rotatedOf("b:p0:0")).toBe(true);
    expect(h.axisOf("")).toBe("x");
    expect(h.axisOf("1")).toBe("y");
    expect(h.prev.get("a:p0:0")).toEqual({ x: 0, y: 0, level: 0 });
  });

  it("rebuilds a tree that reproduces the stored placement exactly", () => {
    const rebuilt = warmTree(
      ctx,
      trays,
      reqs.map(() => null),
      warmHints(ctx, trays),
    );
    expect(rebuilt).not.toBeNull();
    if (rebuilt) {
      expect(rebuilt.variants).toEqual([0, 0, 0, 1]);
      expect(materialize(ctx, evaluate(ctx, rebuilt), fakeRealize)).toEqual(trays);
    }
  });

  it("rejects corrupt paths", () => {
    const bad = trays.map((t, i) => (i === 0 ? { ...t, path: "0x" } : t));
    expect(
      warmTree(
        ctx,
        bad,
        reqs.map(() => null),
        warmHints(ctx, bad),
      ),
    ).toBeNull();
    const prefix = trays.map((t, i) => (i === 0 ? { ...t, path: "" } : t));
    expect(
      warmTree(
        ctx,
        prefix,
        reqs.map(() => null),
        warmHints(ctx, prefix),
      ),
    ).toBeNull();
  });

  it("drops trays of unknown keys and leaves their leaf empty", () => {
    const renamed = trays.map((t) => (t.key === "c:p0:0" ? { ...t, key: "gone:p0:0" } : t));
    const rebuilt = warmTree(
      ctx,
      renamed,
      reqs.map(() => null),
      warmHints(ctx, renamed),
    );
    expect(
      rebuilt && rebuilt.root.kind === "cut" && rebuilt.root.b.kind === "cut" && rebuilt.root.b.a,
    ).toEqual(leaf([]));
  });

  it("tells apart variants that share trayKeys by their compartment minimums", () => {
    const shared = [
      req("s", [
        variant("upright", [part("s:p0:0", [comp({ minW: 30, minD: 90, minH: 65 })])]),
        variant("flat", [part("s:p0:0", [comp({ minW: 65, minD: 90, minH: 30 })])]),
      ]),
    ];
    const sctx = createCtx(makeInput(shared), fakeMeasure);
    const tray = (w: number, h: number): TraySpec =>
      traySpec({
        key: "s:p0:0",
        path: "",
        w: w + 4,
        d: 94,
        h,
        wall: 2,
        compartments: [
          { x: 2, y: 2, w, d: 90, floorZ: 1.2, kind: "well", contents: "s", features: [] },
        ],
      });
    expect(inferVariant(sctx, 0, [tray(66, 32)])).toBe(1); // only "flat" holds
    expect(inferVariant(sctx, 0, [tray(31, 67)])).toBe(0); // only "upright" holds
    expect(inferVariant(sctx, 0, [tray(66, 67)])).toBe(0); // both hold: the first
    expect(warmHints(sctx, [tray(66, 32)]).variantOf(0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/warmstart.test.ts`

Expected: FAIL — `Failed to resolve import "./warmstart" from "src/layout/warmstart.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/warmstart.ts`:

```ts
import type { CompartmentSpec, TraySpec } from "../model/types";
import type { CompartmentReq, TrayPartReq } from "../sizing/types";
import { MAX_DEPTH, type Ctx } from "./context";
import { isValidPath, type LockHints } from "./locks";
import type { PrevPos } from "./score";
import { stackLevels, stackMinFootprint } from "./stack";
import {
  cut,
  leaf,
  minExtents,
  SHARE_HALF,
  SHARE_MAX,
  splitRect,
  type Axis,
  type StackItem,
  type Tree,
  type TreeNode,
} from "./tree";
import { toU, type Rect } from "./units";

export interface WarmHints extends Required<LockHints> {
  /** Cut axis at an internal path of the stored layout, when its children are separable. */
  axisOf(path: string): Axis | undefined;
  /** Stored positions by trayKey, for the "moved trays" score term. */
  readonly prev: ReadonlyMap<string, PrevPos>;
}

interface Box2 {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Bottom-level footprints (level-0 trays and leftovers) of a stored layout, in units. */
function bottomRects(trays: readonly TraySpec[]): { path: string; r: Box2 }[] {
  return trays
    .filter((t) => (t.part === "tray" && t.level === 0) || t.part === "leftover")
    .filter((t) => isValidPath(t.path))
    .map((t) => {
      const x0 = toU(t.x);
      const y0 = toU(t.y);
      return { path: t.path, r: { x0, y0, x1: x0 + toU(t.w), y1: y0 + toU(t.d) } };
    });
}

function bbox(rects: readonly { path: string; r: Box2 }[], prefix: string): Box2 | null {
  let out: Box2 | null = null;
  for (const { path, r } of rects) {
    if (!path.startsWith(prefix)) {
      continue;
    }
    out = out
      ? {
          x0: Math.min(out.x0, r.x0),
          y0: Math.min(out.y0, r.y0),
          x1: Math.max(out.x1, r.x1),
          y1: Math.max(out.y1, r.y1),
        }
      : { ...r };
  }
  return out;
}

/** Rule 7 for one compartment: its rectangle (content + clearance, no reach bands: amendment 7) holds the
 * minimum footprint in either orientation, and its depth below the rim is at least `minH`. */
export function meetsMinimum(c: CompartmentReq, s: CompartmentSpec, trayH: number): boolean {
  const eps = 1e-6;
  const fits =
    (s.w >= c.minW - eps && s.d >= c.minD - eps) || (s.w >= c.minD - eps && s.d >= c.minW - eps);
  return fits && trayH - s.floorZ >= c.minH - eps;
}

function partMeets(part: TrayPartReq, t: TraySpec): boolean {
  return part.compartments.every((c, i) => {
    const s = t.compartments[i];
    return s !== undefined && meetsMinimum(c, s, t.h);
  });
}

/**
 * The variant of requirement `req` that stored trays were realized from. A TraySpec doesn't
 * record its variant, and variants share trayKeys (`<key>:p0:0` is in most of them), so the
 * key set alone can't tell "upright" from "flat". Picks the first variant whose part keys
 * equal the requirement's stored keys and whose compartments all meet their minimums; else
 * the first with that key set; else the one sharing the most keys; undefined if none.
 */
export function inferVariant(
  ctx: Ctx,
  req: number,
  trays: readonly TraySpec[],
): number | undefined {
  const r = ctx.input.requirements[req];
  if (!r) {
    return undefined;
  }
  const own = new Map(
    trays
      .filter((t) => t.part === "tray" && ctx.refsOfKey(t.key)[0]?.req === req)
      .map((t) => [t.key, t]),
  );
  const sameKeys = r.variants
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v.parts.length === own.size && v.parts.every((p) => own.has(p.trayKey)));
  const exact = sameKeys.find(({ v }) =>
    v.parts.every((p) => {
      const t = own.get(p.trayKey);
      return t !== undefined && partMeets(p, t);
    }),
  );
  if (exact ?? sameKeys[0]) {
    return (exact ?? sameKeys[0])?.i;
  }
  let best: number | undefined;
  let bestCount = 0;
  r.variants.forEach((v, i) => {
    const n = v.parts.filter((p) => own.has(p.trayKey)).length;
    if (n > bestCount) {
      best = i;
      bestCount = n;
    }
  });
  return best;
}

export function warmHints(ctx: Ctx, trays: readonly TraySpec[]): WarmHints {
  const rects = bottomRects(trays);
  const rotated = new Map(trays.filter((t) => t.part === "tray").map((t) => [t.key, t.rotated]));
  const prev = new Map<string, PrevPos>(
    trays
      .filter((t) => t.part === "tray")
      .map((t) => [t.key, { x: toU(t.x), y: toU(t.y), level: t.level }]),
  );
  return {
    variantOf: (req) => inferVariant(ctx, req, trays),
    rotatedOf: (key) => rotated.get(key),
    axisOf(path) {
      const a = bbox(rects, `${path}0`);
      const b = bbox(rects, `${path}1`);
      if (!a || !b) {
        return undefined;
      }
      if (a.x1 <= b.x0) {
        return "x";
      }
      if (a.y1 <= b.y0) {
        return "y";
      }
      return undefined;
    },
    prev,
  };
}

/**
 * Rebuilds the guillotine tree of a stored layout (warm start, spec §7.2): leaves from tray
 * paths, cut axes from positions, cut shares recovered exactly from the stored extents, so
 * unchanged inputs reproduce the same placement. Trays of other variants or unknown keys
 * are left out (completeTree re-adds what's missing). Returns null for corrupt paths.
 */
export function warmTree(
  ctx: Ctx,
  trays: readonly TraySpec[],
  pinnedVariant: readonly (number | null)[],
  hints: WarmHints,
): Tree | null {
  const parts = trays.filter((t) => t.part === "tray" || t.part === "leftover");
  if (parts.length === 0 || parts.some((t) => !isValidPath(t.path))) {
    return null;
  }
  const paths = [...new Set(parts.map((t) => t.path))].sort();
  for (let i = 1; i < paths.length; i++) {
    const prevPath = paths[i - 1] ?? "";
    if ((paths[i] ?? "").startsWith(prevPath)) {
      return null;
    }
  }
  const variants = ctx.input.requirements.map(
    (_, i) => pinnedVariant[i] ?? hints.variantOf(i) ?? 0,
  );
  const stacks = new Map<string, StackItem[]>();
  const seen = new Set<number>();
  const ordered = parts
    .filter((t) => t.part === "tray")
    .sort((a, b) => (a.path === b.path ? a.level - b.level : a.path < b.path ? -1 : 1));
  for (const t of ordered) {
    const ref = ctx.refsOfKey(t.key).find((r) => r.variant === variants[r.req]);
    if (!ref || seen.has(ctx.partId(ref))) {
      continue;
    }
    seen.add(ctx.partId(ref));
    const rotatable = ctx.part(ref)?.rotatable ?? false;
    const list = stacks.get(t.path) ?? [];
    list.push({ ...ref, rotated: rotatable && t.rotated });
    stacks.set(t.path, list);
  }
  const pathSet = new Set(paths);
  const build = (q: string): TreeNode => {
    if (pathSet.has(q)) {
      return leaf(stacks.get(q) ?? []);
    }
    if (q.length < MAX_DEPTH && paths.some((p) => p.startsWith(q))) {
      return cut(
        hints.axisOf(q) ?? (q.length % 2 === 0 ? "x" : "y"),
        build(`${q}0`),
        build(`${q}1`),
      );
    }
    return leaf([]);
  };
  const rects = bottomRects(trays);
  const minOf = minExtents(ctx.gap, (l) => stackMinFootprint(ctx, stackLevels(ctx, l.stack)));
  const recover = (node: TreeNode, r: Rect, q: string): TreeNode => {
    if (node.kind === "leaf") {
      return node;
    }
    const ma = minOf(node.a);
    const mb = minOf(node.b);
    const x = node.axis === "x";
    const slack = x ? r.w - (ma.w + ctx.gap + mb.w) : r.d - (ma.d + ctx.gap + mb.d);
    const box = bbox(rects, `${q}0`);
    let share = SHARE_HALF;
    if (slack > 0 && box) {
      const ext = x ? box.x1 - r.x : box.y1 - r.y;
      const e = Math.max(0, Math.min(slack, ext - (x ? ma.w : ma.d)));
      share = Math.min(SHARE_MAX, Math.ceil((e * SHARE_MAX) / slack));
    }
    const withShare = { ...node, share };
    const [ra, rb] = splitRect(withShare, r, ctx.gap, minOf);
    return { ...withShare, a: recover(node.a, ra, `${q}0`), b: recover(node.b, rb, `${q}1`) };
  };
  const root = recover(build(""), { x: 0, y: 0, w: ctx.floorW, d: ctx.floorD }, "");
  return { root, variants };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/warmstart.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/warmstart.test.ts src/layout/warmstart.ts
git commit -m "Rebuild guillotine trees from stored layouts for warm starts"
```

### Task 14: Simulated annealing

**Files:**

- Create: `src/layout/anneal.ts`
- Test: `src/layout/anneal.test.ts`

**Interfaces:**

- Consumes: `Plan` (Task 7); `pickMove`, `MoveEnv` (Task 9); `Rng` (Task 2); `Score` (Task 8); `Tree` (Task 5).
- Produces: `interface Candidate { tree; plan; score }`; `interface Annealer { step(n): void; done; current; bestFeasible: Candidate | null; leastOverflow: Candidate }`; `T_START = 1_000_000`, `T_END = 1_000`; `temperature(done, total): number`; `createAnnealer(env, evaluateTree, start, rng, total): Annealer`.

- [ ] **Step 1: Write the failing test**

`src/layout/anneal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAnnealer, temperature, T_END, T_START, type Candidate } from "./anneal";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { greedyTree } from "./greedy";
import { moveEnvOf, noLocks } from "./locks";
import { createRng } from "./prng";
import { scorePlan } from "./score";
import { boxReq, fakeMeasure, makeInput } from "./test-utils";
import type { Tree } from "./tree";

const reqs = [
  boxReq("a", 120, 80, 20),
  boxReq("b", 90, 80, 20),
  boxReq("c", 60, 40, 15, { elastic: { w: true, d: true, h: true } }),
  boxReq("d", 70, 50, 25),
  boxReq("e", 40, 40, 10),
];
const ctx = createCtx(makeInput(reqs), fakeMeasure);
const env = moveEnvOf(ctx, noLocks(ctx));
const evalTree = (tree: Tree): Candidate => {
  const plan = evaluate(ctx, tree);
  return { tree, plan, score: scorePlan(ctx, plan) };
};

function run(seed: number, total: number, chunk: number): Candidate {
  const start = evalTree(greedyTree(ctx, noLocks(ctx), "x"));
  const a = createAnnealer(env, evalTree, start, createRng(seed), total);
  while (a.done < total) {
    a.step(chunk);
  }
  return a.bestFeasible ?? a.leastOverflow;
}

describe("annealer", () => {
  it("cools geometrically from T_START to T_END", () => {
    expect(temperature(0, 100)).toBe(T_START);
    expect(temperature(100, 100)).toBeCloseTo(T_END, 6);
    expect(temperature(50, 100)).toBeCloseTo(Math.sqrt(T_START * T_END), 6);
  });

  it("never returns worse than its start and tracks the best feasible layout", () => {
    const start = evalTree(greedyTree(ctx, noLocks(ctx), "x"));
    const best = run(1, 2000, 1000);
    expect(best.score.overflow).toBe(0);
    expect(best.score.total).toBeLessThanOrEqual(start.score.total);
  });

  it("is deterministic and independent of chunk size", () => {
    const a = run(7, 1500, 1000);
    const b = run(7, 1500, 1000);
    const c = run(7, 1500, 37);
    expect(b.tree).toEqual(a.tree);
    expect(c.tree).toEqual(a.tree);
    expect(c.score).toEqual(a.score);
  });

  it("stops at the total", () => {
    const start = evalTree(greedyTree(ctx, noLocks(ctx), "y"));
    const a = createAnnealer(env, evalTree, start, createRng(3), 10);
    a.step(1000);
    expect(a.done).toBe(10);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/anneal.test.ts`

Expected: FAIL — `Failed to resolve import "./anneal" from "src/layout/anneal.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/anneal.ts`:

```ts
import type { Plan } from "./fill";
import { pickMove, type MoveEnv } from "./moves";
import type { Rng } from "./prng";
import type { Score } from "./score";
import type { Tree } from "./tree";

export interface Candidate {
  readonly tree: Tree;
  readonly plan: Plan;
  readonly score: Score;
}

export interface Annealer {
  /** Runs up to n more iterations (never past the total). */
  step(n: number): void;
  readonly done: number;
  readonly current: Candidate;
  /** Lowest-score candidate with zero overflow, or null. */
  readonly bestFeasible: Candidate | null;
  /** Lowest overflow seen (ties: lower score). Reported when nothing is feasible. */
  readonly leastOverflow: Candidate;
}

/** Temperature in score points: starts at ≈ 1 % of the box as leftover, ends 1000× lower. */
export const T_START = 1_000_000;
export const T_END = 1_000;

export function temperature(done: number, total: number): number {
  const progress = total > 0 ? done / total : 1;
  return T_START * Math.pow(T_END / T_START, progress);
}

/**
 * Simulated annealing over guillotine trees. Deterministic: every random decision comes
 * from `rng`; score deltas are exact integers; Math.exp/Math.pow are the only floating
 * point steps (same engine → same result). Chunking (step sizes) never changes the result.
 */
export function createAnnealer(
  env: MoveEnv,
  evaluateTree: (tree: Tree) => Candidate,
  start: Candidate,
  rng: Rng,
  total: number,
): Annealer {
  let done = 0;
  let current = start;
  let bestFeasible: Candidate | null = start.score.overflow === 0 ? start : null;
  let leastOverflow = start;
  const consider = (c: Candidate): void => {
    if (
      c.score.overflow === 0 &&
      (bestFeasible === null || c.score.total < bestFeasible.score.total)
    ) {
      bestFeasible = c;
    }
    if (
      c.score.overflow < leastOverflow.score.overflow ||
      (c.score.overflow === leastOverflow.score.overflow &&
        c.score.total < leastOverflow.score.total)
    ) {
      leastOverflow = c;
    }
  };
  return {
    step(n) {
      const end = Math.min(total, done + n);
      while (done < end) {
        const t = temperature(done, total);
        done++;
        const move = pickMove(rng);
        const next = move(current.tree, env, rng);
        if (next === null) {
          continue;
        }
        const cand = evaluateTree(next);
        const delta = cand.score.total - current.score.total;
        if (delta <= 0 || rng.nextFloat() < Math.exp(-delta / t)) {
          current = cand;
          consider(cand);
        }
      }
    },
    get done() {
      return done;
    },
    get current() {
      return current;
    },
    get bestFeasible() {
      return bestFeasible;
    },
    get leastOverflow() {
      return leastOverflow;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/anneal.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/anneal.test.ts src/layout/anneal.ts
git commit -m "Add deterministic simulated annealing"
```

### Task 15: Summary

**Files:**

- Create: `src/layout/summarize.ts`
- Test: `src/layout/summarize.test.ts`

**Interfaces:**

- Consumes: `effective`, `topPlane` (`../model/settings`); `maxCrossing` (Task 7); `nominalPlayU` (Task 8); `LayoutInput`, `LayoutSummary` (Task 1); `toMm`, `toU`, `Rect` (Task 1); test helper `traySpec` (Task 10).
- Produces: `summarize(trays: TraySpec[], input: Pick<LayoutInput, "box" | "settings">): LayoutSummary` (roadmap §4.4 signature; fill %, printed parts without spacers, stacks, filament upper bound incl. lip ring and spacers at 1.24 g/cm³, nominal play per axis).

- [ ] **Step 1: Write the failing test**

`src/layout/summarize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { summarize } from "./summarize";
import { makeInput, traySpec } from "./test-utils";

describe("summarize", () => {
  const input = makeInput([], { box: { innerWidth: 201.4, innerDepth: 51, innerHeight: 20 } });

  it("computes fill, counts, filament and play", () => {
    const trays = [
      traySpec({
        key: "a",
        x: 0,
        stack: 0,
        compartments: [
          { x: 1, y: 1, w: 98, d: 48, floorZ: 1, kind: "well", contents: "", features: [] },
        ],
      }),
      traySpec({ key: "leftover:0", part: "leftover", x: 100.2, stack: 1, solid: true }),
      traySpec({ key: "a:spacer", part: "spacer", path: "", w: 5, d: 10, h: 10, solid: true }),
    ];
    const s = summarize(trays, input);
    expect(s.trayCount).toBe(2);
    expect(s.stackCount).toBe(2);
    expect(s.fillPct).toBe(round1(((2 * 100 * 50 * 20) / (200.4 * 50 * 20)) * 100));
    const g = (100 * 50 * 20 - 98 * 48 * 19 + 100 * 50 * 20 + 5 * 10 * 10) * 0.00124;
    expect(s.filamentG).toBe(round1(g));
    expect(s.playX).toBe(1.2);
    expect(s.playY).toBe(1);
  });

  it("adds the lip ring to the filament estimate", () => {
    const plain = summarize([traySpec({ solid: false })], input).filamentG;
    const lipped = summarize([traySpec({ lip: true })], input).filamentG;
    const ring = (100 * 50 - 97.6 * 47.6) * 2 * 0.00124;
    expect(lipped).toBeCloseTo(plain + ring, 1);
  });

  it("returns 0 fill for a box with no usable height", () => {
    expect(summarize([], makeInput([], { box: { headroom: 60 } })).fillPct).toBe(0);
  });
});

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/summarize.test.ts`

Expected: FAIL — `Failed to resolve import "./summarize" from "src/layout/summarize.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/summarize.ts`:

```ts
import { effective, topPlane } from "../model/settings";
import type { TraySpec } from "../model/types";
import { maxCrossing } from "./fill";
import { nominalPlayU } from "./score";
import type { LayoutInput, LayoutSummary } from "./types";
import { toMm, toU, type Rect } from "./units";

/** PLA density, g/mm³ (1.24 g/cm³). */
const PLA_G_PER_MM3 = 0.00124;

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** Upper bound of a part's plastic volume (mm³): 100 % infill, chamfers and radii ignored. */
function solidVolume(t: TraySpec, lip: LayoutInput["settings"]["lip"]): number {
  const outer = t.w * t.d * t.h;
  if (t.solid) {
    return outer;
  }
  const hollow = t.compartments.reduce((s, c) => s + c.w * c.d * Math.max(0, t.h - c.floorZ), 0);
  const ring = t.lip
    ? (t.w * t.d - Math.max(0, t.w - 2 * lip.thickness) * Math.max(0, t.d - 2 * lip.thickness)) *
      lip.height
    : 0;
  return outer - hollow + ring;
}

/** Results summary for a layout (spec §8.3). */
export function summarize(
  trays: TraySpec[],
  input: Pick<LayoutInput, "box" | "settings">,
): LayoutSummary {
  const { box, settings } = input;
  const eff = effective(settings);
  const usable =
    (box.innerWidth - 2 * eff.boxClearance) *
    (box.innerDepth - 2 * eff.boxClearance) *
    topPlane(box, settings);
  const printed = trays.filter((t) => t.part !== "spacer");
  const outerVolume = printed.reduce((s, t) => s + t.w * t.d * t.h, 0);
  const filament = trays.reduce((s, t) => s + solidVolume(t, settings.lip), 0);
  const bottoms: Rect[] = printed
    .filter((t) => t.level === 0)
    .map((t) => ({ x: toU(t.x), y: toU(t.y), w: toU(t.w), d: toU(t.d) }));
  const play = (crossed: number): number =>
    toMm(nominalPlayU(toU(eff.boxClearance), toU(eff.trayGap), crossed));
  return {
    fillPct: usable > 0 ? round((outerVolume / usable) * 100, 1) : 0,
    trayCount: printed.length,
    stackCount: new Set(printed.map((t) => t.stack)).size,
    filamentG: round(filament * PLA_G_PER_MM3, 1),
    playX: play(maxCrossing(bottoms, true)),
    playY: play(maxCrossing(bottoms, false)),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/summarize.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/summarize.test.ts src/layout/summarize.ts
git commit -m "Add layout summary"
```

### Task 16: Warnings and notices

**Files:**

- Create: `src/layout/warnings.ts`
- Test: `src/layout/warnings.test.ts`

**Interfaces:**

- Consumes: `FIT_CHOICES` (`../model/settings`); `fitsBed` (Task 3); `Ctx`, `PLAY_LIMIT_U` (Task 4); `coverageApplies` (Task 8); `LayoutSummary` (Task 1); `toMm` (Task 1); test helper `traySpec` (Task 10).
- Produces: `NOTICE_CODES = { coverage: "layout.coverage", play: "layout.play", lipOff: "layout.lipOff", capped: "layout.capped", bed: "layout.bed", doesNotFit: "layout.doesNotFit", lockDropped: "lock.dropped" }`; `requirementLabel(r)`; `layoutWarnings(ctx, trays, summary): Notice[]`; `bedNotices(ctx): Notice[]`; `doesNotFitNotice(ctx, shortfallMm): Notice`; `cappedNotice(): Notice`.

- [ ] **Step 1: Write the failing test**

`src/layout/warnings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TraySpec } from "../model/types";
import { createCtx } from "./context";
import { boxReq, fakeMeasure, makeInput, traySpec } from "./test-utils";
import type { LayoutSummary } from "./types";
import {
  bedNotices,
  cappedNotice,
  doesNotFitNotice,
  layoutWarnings,
  NOTICE_CODES,
  requirementLabel,
} from "./warnings";

function tray(key: string, path: string, level: number, contents: string): TraySpec {
  return traySpec({
    key,
    path,
    level,
    w: 50,
    d: 50,
    compartments: [
      { x: 2, y: 2, w: 46, d: 46, floorZ: 1.2, kind: "scoop", contents, features: [] },
    ],
  });
}

const okSummary: LayoutSummary = {
  fillPct: 99,
  trayCount: 2,
  stackCount: 2,
  filamentG: 10,
  playX: 1.2,
  playY: 1.4,
};
const reqs = [boxReq("bits", 40, 40, 10, { loose: true }), boxReq("cards", 40, 40, 10)];
const trays = [tray("bits:p0:0", "0", 0, "Cubes"), tray("cards:p0:0", "1", 0, "Deck")];

describe("layout warnings", () => {
  it("warns about loose bits on top only when coverage is partial or the box stands on its side", () => {
    const full = createCtx(makeInput(reqs, { box: { headroom: 5 } }), fakeMeasure);
    expect(layoutWarnings(full, trays, okSummary)).toEqual([]);
    const partial = createCtx(
      makeInput(reqs, { box: { headroom: 5, headroomCoverage: "partial" } }),
      fakeMeasure,
    );
    const w = layoutWarnings(partial, trays, okSummary);
    expect(w.map((n) => n.code)).toEqual([NOTICE_CODES.coverage]);
    expect(w[0]?.message).toContain("Cubes");
    expect(w[0]?.message).toContain("below other trays");
    const covered = [tray("bits:p0:0", "0", 0, "Cubes"), tray("cards:p0:0", "0", 1, "Deck")];
    expect(layoutWarnings(partial, covered, okSummary)).toEqual([]);
    const side = createCtx(makeInput(reqs, { box: { storedOnSide: true } }), fakeMeasure);
    expect(layoutWarnings(side, trays, okSummary)[0]?.message).toContain("on its side");
  });

  it("warns about play above 1.5 mm per axis and about a disabled lip", () => {
    const ctx = createCtx(
      makeInput(reqs, {
        settings: { lip: { enabled: false, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 } },
      }),
      fakeMeasure,
    );
    const stacked = [tray("bits:p0:0", "0", 0, "Cubes"), tray("cards:p0:0", "0", 1, "Deck")];
    const w = layoutWarnings(ctx, stacked, { ...okSummary, playX: 1.6 });
    expect(w.map((n) => n.code)).toEqual([NOTICE_CODES.play, NOTICE_CODES.lipOff]);
    expect(w[0]?.message).toContain("along X");
  });

  it("names requirements that fit the bed in no variant", () => {
    const ctx = createCtx(
      makeInput([boxReq("board", 300, 40, 10), ...reqs], { printer: { bedX: 200, bedY: 200 } }),
      fakeMeasure,
    );
    const n = bedNotices(ctx);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ level: "error", code: NOTICE_CODES.bed });
    expect(n[0]?.message).toContain('"board"');
    expect(requirementLabel(reqs[0] ?? boxReq("x", 1, 1, 1))).toBe("bits");
  });

  it("explains doesNotFit with the shortfall per axis and concrete suggestions", () => {
    const ctx = createCtx(makeInput(reqs, { box: { headroom: 6 } }), fakeMeasure);
    const n = doesNotFitNotice(ctx, { x: 12.34, y: 0, z: 3 });
    expect(n).toMatchObject({ level: "error", code: NOTICE_CODES.doesNotFit });
    expect(n.message).toContain("12.3 mm in width (X)");
    expect(n.message).toContain("3.0 mm in height");
    expect(n.message).not.toContain("depth");
    for (const tip of [
      "unsleeved",
      "flat or upright",
      "less headroom",
      "choose a tighter fit (Fit: tight)",
      "split groups",
    ]) {
      expect(n.message).toContain(tip);
    }
    const noHeadroom = createCtx(makeInput(reqs), fakeMeasure);
    expect(doesNotFitNotice(noHeadroom, { x: 1, y: 0, z: 0 }).message).not.toContain("headroom");
  });

  it("marks capped runs with an info notice", () => {
    expect(cappedNotice()).toMatchObject({ level: "info", code: "layout.capped" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/warnings.test.ts`

Expected: FAIL — `Failed to resolve import "./warnings" from "src/layout/warnings.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/warnings.ts`:

```ts
import { FIT_CHOICES } from "../model/settings";
import type { Notice, TraySpec } from "../model/types";
import type { TrayRequirement } from "../sizing/types";
import { fitsBed } from "./bed";
import { PLAY_LIMIT_U, type Ctx } from "./context";
import { coverageApplies } from "./score";
import type { LayoutSummary } from "./types";
import { toMm } from "./units";

/** Stable notice codes emitted by the layout engine (spec §7.3). */
export const NOTICE_CODES = {
  coverage: "layout.coverage",
  play: "layout.play",
  lipOff: "layout.lipOff",
  capped: "layout.capped",
  bed: "layout.bed",
  doesNotFit: "layout.doesNotFit",
  lockDropped: "lock.dropped",
} as const;

export function requirementLabel(r: TrayRequirement): string {
  const names = new Set(
    (r.variants[0]?.parts ?? []).flatMap((p) => p.compartments.map((c) => c.contents)),
  );
  return names.size > 0 ? [...names].join(", ") : r.key;
}

function mm(v: number): string {
  return v.toFixed(1);
}

/** Warnings about a feasible layout: coverage, play, lip off. */
export function layoutWarnings(
  ctx: Ctx,
  trays: readonly TraySpec[],
  summary: LayoutSummary,
): Notice[] {
  const out: Notice[] = [];
  const { box, settings } = ctx.input;
  const real = trays.filter((t) => t.part === "tray");
  if (coverageApplies(ctx)) {
    const exposed = real.filter((t) => {
      const covered = real.some((o) => o.path === t.path && o.level > t.level);
      const r = ctx.input.requirements[ctx.refsOfKey(t.key)[0]?.req ?? -1];
      return !covered && r?.loose === true;
    });
    if (exposed.length > 0) {
      const labels = [
        ...new Set(
          exposed.map(
            (t) =>
              t.compartments
                .map((c) => c.contents)
                .filter((c) => c !== "")
                .join(", ") || t.key,
          ),
        ),
      ].join("; ");
      out.push({
        level: "warning",
        code: NOTICE_CODES.coverage,
        message: box.storedOnSide
          ? `The box is stored on its side, so loose bits in the top layer can spill: ${labels}. Lock them below other trays.`
          : `The boards don't cover the whole top layer, so these loose bits may not stay in place: ${labels}. Lock them below other trays.`,
      });
    }
  }
  const limit = toMm(PLAY_LIMIT_U);
  for (const [axis, play] of [
    ["X", summary.playX],
    ["Y", summary.playY],
  ] as const) {
    if (play > limit) {
      out.push({
        level: "warning",
        code: NOTICE_CODES.play,
        message: `Trays can shift ${play.toFixed(2)} mm along ${axis} (more than ${limit} mm). Fewer trays side by side or a tighter Fit reduce it.`,
      });
    }
  }
  if (!settings.lip.enabled && real.some((t) => t.level > 0)) {
    out.push({
      level: "warning",
      code: NOTICE_CODES.lipOff,
      message: "The locating lip is off, so stacked trays are not held in place.",
    });
  }
  return out;
}

/** Errors for requirements that fit the print bed in no variant, splits included. */
export function bedNotices(ctx: Ctx): Notice[] {
  const out: Notice[] = [];
  ctx.input.requirements.forEach((r, i) => {
    let smallest: { w: number; d: number; h: number } | null = null;
    const anyFits = r.variants.some((v, vi) =>
      v.parts.every((_, pi) => {
        const m = ctx.metrics({ req: i, variant: vi, part: pi }, false, 0);
        const ok = fitsBed(ctx.bed, m.w, m.d, m.h);
        if (!ok && (smallest === null || m.w * m.d < smallest.w * smallest.d)) {
          smallest = { w: m.w, d: m.d, h: m.h };
        }
        return ok;
      }),
    );
    if (!anyFits && r.variants.length > 0) {
      const s = smallest ?? { w: 0, d: 0, h: 0 };
      out.push({
        level: "error",
        code: NOTICE_CODES.bed,
        message: `"${requirementLabel(r)}" is too large for the print bed in every variant, splits included: it needs at least ${mm(toMm(s.w))} × ${mm(toMm(s.d))} × ${mm(toMm(s.h))} mm; the usable bed is ${mm(toMm(ctx.bed.w))} × ${mm(toMm(ctx.bed.d))} × ${mm(toMm(ctx.bed.z))} mm.`,
      });
    }
  });
  return out;
}

/** Spec §7.3: shortfall per axis plus concrete suggestions. Shortfall in mm. */
export function doesNotFitNotice(ctx: Ctx, shortfall: { x: number; y: number; z: number }): Notice {
  const parts: string[] = [];
  if (shortfall.x > 0) {
    parts.push(`${mm(shortfall.x)} mm in width (X)`);
  }
  if (shortfall.y > 0) {
    parts.push(`${mm(shortfall.y)} mm in depth (Y)`);
  }
  if (shortfall.z > 0) {
    parts.push(`${mm(shortfall.z)} mm in height`);
  }
  const tips = [
    "use unsleeved cards or thinner sleeves",
    "store cards flat or upright (Storage: auto tries both)",
  ];
  if (ctx.input.box.headroom > 0) {
    tips.push("move the rulebook or boards elsewhere (less headroom)");
  }
  if (ctx.input.settings.fit > FIT_CHOICES.tight) {
    tips.push("choose a tighter fit (Fit: tight)");
  }
  tips.push("split groups into separate components");
  const short =
    parts.length > 0
      ? `The box is too small by ${parts.join(", ")}.`
      : "Some trays don't fit the print bed or a locked size.";
  return {
    level: "error",
    code: NOTICE_CODES.doesNotFit,
    message: `The components don't fit in this box. ${short} Try: ${tips.join("; ")}.`,
  };
}

export function cappedNotice(): Notice {
  return {
    level: "info",
    code: NOTICE_CODES.capped,
    message:
      "The optimizer stopped at its 30 s safety limit; this layout can't be reproduced from its seed.",
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/warnings.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/warnings.test.ts src/layout/warnings.ts
git commit -m "Add layout warnings and doesNotFit suggestions"
```

### Task 17: Hard-rule checker and fixture loader (test helpers)

**Files:**

- Create: `src/layout/test-hard-rules.ts`
- Create: `src/layout/test-fixtures.ts`
- Test: `src/layout/hard-rules.test.ts`

**Interfaces:**

- Consumes: `hasGrip(compartments)`, `needsGrip(part)`, `wallFor(settings, lipped)` (`../sizing`, plan 2); `planTray(spec, settings)` (`../geometry/plan`, plan 3); `effectiveBottomChamfer` (`../model/settings`); `size`, `parseProject`, `inputsHash` (plans 1–2); fixtures `test/fixtures/{cards-heavy,bits-heavy,tiles-minis,small-tiles,tiny-box}.json` (plan 1; `small-tiles` is the finger-channel review fixture); `fitsBed` (Task 3); `createCtx`, `PartRef` (Task 4); `describeLock` (Task 10); `inferVariant`, `meetsMinimum` (Task 13); units (Task 1).
- Produces: `isGuillotineTiling(rects, region, gap): boolean`; `isDropped(lock, notices): boolean`; `checkHardRules(input, layout, notices): string[]` (empty = all rules hold); `FIXTURES`, `type FixtureName`, `fixtureInput(name): LayoutInput`.

- [ ] **Step 1: Write the failing test**

`src/layout/hard-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isGuillotineTiling } from "./test-hard-rules";

describe("isGuillotineTiling", () => {
  const region = { x: 0, y: 0, w: 1000, d: 500 };

  it("accepts exact tilings with the gap along every cut", () => {
    expect(isGuillotineTiling([region], region, 20)).toBe(true);
    expect(
      isGuillotineTiling(
        [
          { x: 0, y: 0, w: 490, d: 500 },
          { x: 510, y: 0, w: 490, d: 240 },
          { x: 510, y: 260, w: 490, d: 240 },
        ],
        region,
        20,
      ),
    ).toBe(true);
  });

  it("rejects holes, wrong gaps and overlaps", () => {
    expect(isGuillotineTiling([{ x: 0, y: 0, w: 900, d: 500 }], region, 20)).toBe(false);
    expect(
      isGuillotineTiling(
        [
          { x: 0, y: 0, w: 490, d: 500 },
          { x: 500, y: 0, w: 500, d: 500 },
        ],
        region,
        20,
      ),
    ).toBe(false);
    expect(
      isGuillotineTiling(
        [
          { x: 0, y: 0, w: 600, d: 500 },
          { x: 500, y: 0, w: 500, d: 500 },
        ],
        region,
        20,
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/hard-rules.test.ts`

Expected: FAIL — `Failed to resolve import "./test-hard-rules" from "src/layout/hard-rules.test.ts"`.

- [ ] **Step 3: Write the hard-rule checker**

It checks every spec §3 rule on a `StoredLayout` plus the roadmap §4.6 conditions `buildTray` enforces (compartments inside the outer wall — the lipped wall when `lip` is set — not touching each other, `0 < floorZ < h`). Rule 8 uses sizing's `hasGrip`, on the trays whose part `needsGrip` (a tray whose components all have finger cuts and curved floor off is exempt).

`src/layout/test-hard-rules.ts`:

```ts
/**
 * Test helper: checks a StoredLayout against the spec §3 hard rules, and that geometry builds
 * every printed part (planTray). Returns a list of violations (empty = all rules hold). Used by
 * the property and fixture tests.
 */
import { planTray } from "../geometry/plan";
import { effectiveBottomChamfer } from "../model/settings";
import type { Lock, Notice, StoredLayout, TraySpec } from "../model/types";
import { fitsBed } from "./bed";
import { hasGrip, needsGrip, wallFor } from "../sizing";
import { createCtx, type PartRef } from "./context";
import { describeLock } from "./locks";
import { inferVariant, meetsMinimum } from "./warmstart";
import type { LayoutInput } from "./types";
import { toMm, toU, type Rect, type U } from "./units";

function tiles(rects: readonly Rect[], region: Rect, gap: U): boolean {
  if (rects.length === 0) {
    return false;
  }
  if (rects.length === 1) {
    const r = rects[0];
    return (
      r !== undefined &&
      r.x === region.x &&
      r.y === region.y &&
      r.w === region.w &&
      r.d === region.d
    );
  }
  for (const alongX of [true, false]) {
    const end = (r: Rect): U => (alongX ? r.x + r.w : r.y + r.d);
    const start = (r: Rect): U => (alongX ? r.x : r.y);
    const cuts = [...new Set(rects.map(end))].sort((a, b) => a - b);
    for (const c of cuts) {
      const lo = rects.filter((r) => end(r) <= c);
      const hi = rects.filter((r) => start(r) >= c + gap);
      if (lo.length === 0 || hi.length === 0 || lo.length + hi.length !== rects.length) {
        continue;
      }
      const regionLo: Rect = alongX
        ? { ...region, w: c - region.x }
        : { ...region, d: c - region.y };
      const regionHi: Rect = alongX
        ? { x: c + gap, y: region.y, w: region.x + region.w - c - gap, d: region.d }
        : { x: region.x, y: c + gap, w: region.w, d: region.y + region.d - c - gap };
      if (tiles(lo, regionLo, gap) && tiles(hi, regionHi, gap)) {
        return true;
      }
    }
  }
  return false;
}

/** Exact guillotine tiling of `region` by `rects`, separated by exactly `gap` along every cut. */
export function isGuillotineTiling(rects: readonly Rect[], region: Rect, gap: U): boolean {
  return tiles(rects, region, gap);
}

function overlap3d(a: TraySpec, b: TraySpec): boolean {
  const ov = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 && b0 < a1;
  const r = (t: TraySpec) => ({
    x0: toU(t.x),
    x1: toU(t.x) + toU(t.w),
    y0: toU(t.y),
    y1: toU(t.y) + toU(t.d),
    z0: toU(t.z),
    z1: toU(t.z) + toU(t.h),
  });
  const p = r(a);
  const q = r(b);
  return ov(p.x0, p.x1, q.x0, q.x1) && ov(p.y0, p.y1, q.y0, q.y1) && ov(p.z0, p.z1, q.z0, q.z1);
}

export function isDropped(lock: Lock, notices: readonly Notice[]): boolean {
  const d = describeLock(lock);
  return notices.some((n) => n.code === "lock.dropped" && n.message.startsWith(d));
}

export function checkHardRules(
  input: LayoutInput,
  layout: StoredLayout,
  notices: readonly Notice[],
): string[] {
  const v: string[] = [];
  const ctx = createCtx(input);
  const { settings } = input;
  const trays = layout.trays;
  const real = trays.filter((t) => t.part === "tray");
  const printed = trays.filter((t) => t.part !== "spacer");
  const eps = 1e-6;

  // 0.01 mm precision
  for (const t of trays) {
    for (const n of [t.x, t.y, t.z, t.w, t.d, t.h]) {
      if (toU(n) / 100 !== n) {
        v.push(`${t.key}: ${n} is not a multiple of 0.01 mm`);
      }
    }
  }

  // Exactly one variant per requirement, every part of it.
  const refOf = new Map<string, PartRef>();
  input.requirements.forEach((r, i) => {
    const keys = new Set(real.filter((t) => ctx.refsOfKey(t.key)[0]?.req === i).map((t) => t.key));
    // Variants share trayKeys, so the variant is inferred from the trays (warm start does too).
    const vi = inferVariant(ctx, i, real);
    const chosen = vi === undefined ? undefined : r.variants[vi];
    const exact =
      chosen !== undefined &&
      chosen.parts.length === keys.size &&
      chosen.parts.every((p) => keys.has(p.trayKey));
    if (r.variants.length > 0 && (vi === undefined || !exact)) {
      v.push(`${r.key}: placed trays [${[...keys].join(", ")}] match no variant`);
    }
    if (vi !== undefined && exact) {
      chosen.parts.forEach((p, k) => refOf.set(p.trayKey, { req: i, variant: vi, part: k }));
    }
  });

  // Rule 1: the bottom layer tiles the floor with only trayGap between parts.
  const bottoms = printed
    .filter((t) => t.level === 0)
    .map((t) => ({ x: toU(t.x), y: toU(t.y), w: toU(t.w), d: toU(t.d) }));
  if (!isGuillotineTiling(bottoms, { x: 0, y: 0, w: ctx.floorW, d: ctx.floorD }, ctx.gap)) {
    v.push("bottom layer does not tile the floor with exactly trayGap gaps");
  }

  // Rules 2 and 4: stacks.
  const sizeLocked = new Set(
    input.locks.flatMap((l) => (l.kind === "size" && !isDropped(l, notices) ? [l.trayKey] : [])),
  );
  const byPath = new Map<string, TraySpec[]>();
  for (const t of real) {
    byPath.set(t.path, [...(byPath.get(t.path) ?? []), t]);
  }
  const chamfer = effectiveBottomChamfer(settings, 1);
  const play = toMm(ctx.inset) - settings.lip.thickness;
  for (const [path, list] of byPath) {
    const stack = [...list].sort((a, b) => a.level - b.level);
    const sum = stack.reduce((s, t) => s + toU(t.h), 0);
    if (sum !== ctx.topPlane) {
      v.push(`stack ${path}: Σh = ${sum} ≠ topPlane ${ctx.topPlane}`);
    }
    let z = 0;
    const base = stack[0];
    stack.forEach((t, k) => {
      if (t.level !== k) {
        v.push(`stack ${path}: levels not consecutive`);
      }
      if (t.stack !== base?.stack) {
        v.push(`stack ${path}: mixed stack numbers`);
      }
      if (toU(t.z) !== z) {
        v.push(`${t.key}: z ${t.z} ≠ Σ lower heights`);
      }
      z += toU(t.h);
      const top = k === stack.length - 1;
      if (t.lip !== (settings.lip.enabled && !top)) {
        v.push(`${t.key}: lip flag wrong`);
      }
      if (base && k > 0) {
        const inset = k * ctx.inset;
        if (
          toU(t.x) - toU(base.x) !== inset ||
          toU(t.y) - toU(base.y) !== inset ||
          toU(t.w) !== toU(base.w) - 2 * inset ||
          toU(t.d) !== toU(base.d) - 2 * inset
        ) {
          v.push(`${t.key}: level ${k} not inset k·(lip.thickness + play)`);
        }
        if (settings.lip.enabled && toU(t.h) < ctx.upperMinH) {
          v.push(`${t.key}: upper tray lower than lip.height + 3`);
        }
        const lower = stack[k - 1];
        if (lower && settings.lip.enabled) {
          // The lower tray's outer wall as planTray builds it: its base wall or the lipped wall.
          const lipped = Math.max(lower.wall, wallFor(settings, true));
          const bearing = lipped - (t.x - lower.x) - play - chamfer;
          if (bearing < settings.lip.ledge - 2 * play - chamfer - eps || bearing <= 0) {
            v.push(`${t.key}: bearing ${bearing} too small`);
          }
          if (toU(lower.z + lower.h + settings.lip.height) > ctx.topPlane) {
            v.push(`${lower.key}: lip rises above the top plane`);
          }
        }
      }
      if (!top && !stack.some((s) => sizeLocked.has(s.key)) && toU(t.h) % ctx.layer !== 0) {
        v.push(`${t.key}: h ${t.h} not a multiple of the layer height`);
      }
    });
  }
  for (const l of trays.filter((t) => t.part === "leftover")) {
    if (toU(l.h) !== Math.max(0, ctx.topPlane)) {
      v.push(`${l.key}: leftover not at full stack height`);
    }
  }

  // Rule 5: bed fit with margin, either rotation.
  for (const t of trays) {
    if (!fitsBed(ctx.bed, toU(t.w), toU(t.d), toU(t.h))) {
      v.push(`${t.key}: does not fit the print bed`);
    }
  }

  // Rule 7: compartments meet their minimums (compartment i ↔ CompartmentReq i; the
  // rectangle is content + clearance, no reach bands: amendment 7). Rule 8: grip.
  for (const t of real) {
    const ref = refOf.get(t.key);
    const part = ref ? ctx.part(ref) : undefined;
    (part?.compartments ?? []).forEach((c, i) => {
      const s = t.compartments[i];
      if (!s) {
        v.push(`${t.key}: compartment ${i} ("${c.contents}") missing`);
        return;
      }
      if (!meetsMinimum(c, s, t.h)) {
        v.push(`${t.key}: compartment ${i} below its minimum ${c.minW}×${c.minD}×${c.minH}`);
      }
    });
    if ((!part || needsGrip(part)) && !hasGrip(t.compartments)) {
      v.push(`${t.key}: no grip`);
    }
  }

  // Specs geometry accepts (roadmap §4.6): compartments inside the outer wall (lipped wall
  // when lip is set), not touching each other, floorZ in (0, h). planTray below checks every
  // rule; these name the common failures.
  for (const t of printed) {
    const wallOut = t.lip ? Math.max(t.wall, wallFor(settings, true)) : t.wall;
    t.compartments.forEach((s, i) => {
      if (
        s.x < wallOut - eps ||
        s.y < wallOut - eps ||
        s.x + s.w > t.w - wallOut + eps ||
        s.y + s.d > t.d - wallOut + eps
      ) {
        v.push(`${t.key}: compartment ${i} closer to an outer face than the outer wall`);
      }
      if (!(s.floorZ > 0 && s.floorZ < t.h)) {
        v.push(`${t.key}: compartment ${i} floorZ ${s.floorZ} outside (0, ${t.h})`);
      }
      t.compartments.slice(i + 1).forEach((o, j) => {
        const apart =
          s.x + s.w < o.x - eps ||
          o.x + o.w < s.x - eps ||
          s.y + s.d < o.y - eps ||
          o.y + o.d < s.y - eps;
        if (!apart) {
          v.push(`${t.key}: compartments ${i} and ${i + 1 + j} overlap or touch`);
        }
      });
    });
  }
  for (const l of trays.filter((t) => t.part === "leftover" && !t.solid)) {
    if (!hasGrip(l.compartments)) {
      v.push(`${l.key}: spare leftover without grip`);
    }
  }

  // Geometry builds every part (roadmap §4.6): planTray throws TraySpecError for a spec it
  // would not build (thin dividers, walls under MIN_WALL_MM, a part too small for its chamfer…).
  for (const t of trays) {
    try {
      planTray(t, settings);
    } catch (error) {
      v.push(`${t.key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // No two parts overlap in 3D; spacers lie inside their tray.
  for (let i = 0; i < printed.length; i++) {
    for (let j = i + 1; j < printed.length; j++) {
      const a = printed[i];
      const b = printed[j];
      if (a && b && overlap3d(a, b)) {
        v.push(`${a.key} overlaps ${b.key}`);
      }
    }
  }
  for (const s of trays.filter((t) => t.part === "spacer")) {
    const owner = real.find((t) => s.key === `${t.key}:spacer`);
    if (
      !owner ||
      s.x < owner.x - eps ||
      s.y < owner.y - eps ||
      s.x + s.w > owner.x + owner.w + eps ||
      s.y + s.d > owner.y + owner.d + eps
    ) {
      v.push(`${s.key}: spacer outside its tray`);
    }
  }

  // Locks: respected, or dropped with a notice.
  for (const lock of input.locks) {
    if (isDropped(lock, notices)) {
      continue;
    }
    if (lock.kind === "position") {
      const t = real.find((x) => x.key === lock.trayKey);
      if (!t || t.path !== lock.path || t.rotated !== lock.rotated) {
        v.push(`position lock on ${lock.trayKey} not respected`);
      }
    } else if (lock.kind === "size") {
      const t = real.find((x) => x.key === lock.trayKey);
      const same =
        t !== undefined &&
        toU(t.w) === toU(lock.w) &&
        toU(t.d) === toU(lock.d) &&
        toU(t.h) === toU(lock.h);
      if (!same) {
        v.push(`size lock on ${lock.trayKey} not respected`);
      }
    } else {
      const ts = lock.trayKeys.map((k) => real.find((x) => x.key === k));
      const first = ts[0];
      const ok =
        first !== undefined &&
        ts.every((t, i) => t !== undefined && t.path === first.path && t.level === first.level + i);
      if (!ok) {
        v.push(`stack lock on ${lock.trayKeys.join(", ")} not respected`);
      }
    }
  }
  return v;
}
```

- [ ] **Step 4: Write the fixture loader**

Loads plan 1's synthetic fixtures through `parseProject`, sizes them with plan 2's `size()`, and builds a `LayoutInput`.

`src/layout/test-fixtures.ts`:

```ts
/** Test helper: loads the synthetic fixture projects (roadmap §5) as LayoutInputs. */
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import { size } from "../sizing";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import smallTiles from "../../test/fixtures/small-tiles.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tinyBox from "../../test/fixtures/tiny-box.json";
import type { LayoutInput } from "./types";

export const FIXTURES = {
  "cards-heavy": cardsHeavy,
  "bits-heavy": bitsHeavy,
  "tiles-minis": tilesMinis,
  "small-tiles": smallTiles,
  "tiny-box": tinyBox,
} as const;

export type FixtureName = keyof typeof FIXTURES;

export function fixtureInput(name: FixtureName): LayoutInput {
  const parsed = parseProject(FIXTURES[name]);
  if (!parsed.ok) {
    throw new Error(`fixture ${name}: ${parsed.error}`);
  }
  const p = parsed.project;
  const { requirements } = size(p.components, p.settings);
  return {
    requirements,
    box: p.box,
    printer: p.printer,
    settings: p.settings,
    locks: p.locks,
    inputsHash: inputsHash(p),
    appVersion: "0.0.0-test",
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/layout/hard-rules.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean; `tsc` also type-checks `test-fixtures.ts`, which proves the fixture JSON imports resolve).

- [ ] **Step 6: Commit**

From the repo root:

```bash
git add src/layout/test-hard-rules.ts src/layout/hard-rules.test.ts src/layout/test-fixtures.ts
git commit -m "Add hard-rule checker and fixture loader for layout tests"
```

### Task 18: optimize(): runs, chunks, time cap, lock fallback, results

**Files:**

- Create: `src/layout/optimize.ts`
- Create: `src/layout/index.ts`
- Test: `src/layout/optimize.test.ts`, `src/layout/index.test.ts`

**Interfaces:**

- Consumes: `GEOMETRY_VERSION` (`../geometry/version` — never `../geometry` index, roadmap §4.6); everything from Tasks 1–17.
- Produces: `CHUNK = 1000`; `DEFAULT_TIME_CAP_MS = 30_000`; `DEFAULT_ITERATIONS = 50_000`; `interface RunOptions { warmStart?; timeCapMs?; now?; measure?; realize? }`; `interface Run { step(): boolean; done; total; snapshot(): LayoutResult; result(): LayoutResult }` (`done` only grows; `total` is announced up front for the chains that may still follow and only shrinks, so the progress fraction never goes backwards); `createRun(input, seed, iterations, opts?): Run`; `optimize(input, seed, iterations, opts?): LayoutResult` (roadmap §4.4 signature); `index.ts` exports `optimize`, `DEFAULT_ITERATIONS`, `summarize`, `swapLocks`, `NOTICE_CODES`.

- [ ] **Step 1: Write the failing tests**

`src/layout/optimize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GEOMETRY_VERSION } from "../geometry/version";
import { DEFAULT_SETTINGS, effective } from "../model/settings";
import { minOuter } from "../sizing";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { fixtureInput } from "./test-fixtures";
import { checkHardRules } from "./test-hard-rules";
import { materialize } from "./materialize";
import { createRun, DEFAULT_ITERATIONS, optimize } from "./optimize";
import { boxReq, makeInput } from "./test-utils";
import { warmHints, warmTree } from "./warmstart";

const reqs = [
  boxReq("a", 120, 80, 20),
  boxReq("b", 90, 80, 20, { access: "often" }),
  boxReq("c", 60, 40, 15, { elastic: { w: true, d: true, h: true }, loose: true }),
  boxReq("d", 70, 50, 25),
];
const input = makeInput(reqs, { box: { innerWidth: 280, innerDepth: 200, innerHeight: 60 } });

describe("optimize", () => {
  it("returns a feasible StoredLayout that satisfies every hard rule", () => {
    const r = optimize(input, 1, 3000);
    expect(r.layout).not.toBeNull();
    expect(r.bestAttempt).toBeNull();
    expect(r.summary?.trayCount).toBe(r.layout?.trays.filter((t) => t.part !== "spacer").length);
    expect(r.layout).toMatchObject({
      createdWith: "0.0.0-test",
      geometryVersion: GEOMETRY_VERSION,
      inputsHash: "test-hash",
      seed: 1,
      iterations: 3000,
      capped: false,
    });
    expect(checkHardRules(input, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
  });

  it("is deterministic: same seed + iterations → deep-equal result", () => {
    expect(optimize(input, 42, 2500)).toEqual(optimize(input, 42, 2500));
  });

  it("reports progress per chunk and stops when cancelled", () => {
    const done: number[] = [];
    optimize(input, 3, 3000, { onProgress: (d) => done.push(d) });
    expect(done).toEqual([1000, 2000, 3000]);
    let calls = 0;
    const r = optimize(input, 3, 5000, { shouldCancel: () => ++calls >= 2 });
    expect(calls).toBe(2);
    expect(r.layout?.capped).toBe(true);
  });

  it("stops at the time cap and marks the result capped", () => {
    const r = optimize(input, 5, 5000, { timeCapMs: 0 });
    expect(r.layout?.capped).toBe(true);
    expect(r.layout?.iterations).toBe(1000);
    expect(r.notices.map((n) => n.code)).toContain("layout.capped");
  });

  it("uses a clock injected into createRun", () => {
    let t = 0;
    const run = createRun(input, 5, 5000, { timeCapMs: 10, now: () => (t += 6) });
    expect(run.step()).toBe(false);
    expect(run.step()).toBe(true);
    expect(run.result().layout?.capped).toBe(true);
  });

  it("warm start reproduces the previous layout exactly (tree, shares, positions)", () => {
    const first = optimize(input, 9, 2000);
    const prev = first.layout;
    expect(prev).not.toBeNull();
    if (!prev) {
      return;
    }
    const ctx = createCtx(input);
    const hints = warmHints(ctx, prev.trays);
    const tree = warmTree(
      ctx,
      prev.trays,
      reqs.map(() => null),
      hints,
    );
    expect(tree).not.toBeNull();
    if (tree) {
      expect(materialize(ctx, evaluate(ctx, tree))).toEqual(prev.trays);
    }
    const again = optimize(input, 9, 0, { warmStart: prev });
    expect(again.layout?.trays).toEqual(prev.trays);
    expect(again.layout?.iterations).toBe(2000);
  });

  it("keeps the seed, counts iterations cumulatively and is deterministic with a warm start", () => {
    const prev = optimize(input, 11, 1000).layout ?? undefined;
    const a = optimize(input, 11, 2000, { warmStart: prev });
    const b = optimize(input, 11, 2000, { warmStart: prev });
    expect(a).toEqual(b);
    expect(a.layout?.seed).toBe(11);
    // `iterations` is this run's budget; the stored count is cumulative ("improve more").
    expect(a.layout?.iterations).toBe(1000 + 2000);
  });

  it("respects a position lock or drops it with a notice", () => {
    const prev = optimize(input, 2, 2000).layout;
    const t = prev?.trays.find((x) => x.key === "a:p0:0");
    expect(t).toBeDefined();
    if (!prev || !t) {
      return;
    }
    const locked = {
      ...input,
      locks: [{ kind: "position" as const, trayKey: "a:p0:0", path: t.path, rotated: t.rotated }],
    };
    const r = optimize(locked, 2, 2000, { warmStart: prev });
    expect(r.layout).not.toBeNull();
    expect(checkHardRules(locked, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
    expect(r.layout?.trays.find((x) => x.key === "a:p0:0")?.path).toBe(t.path);
  });

  it("drops locks that make the box infeasible and lays out without them", () => {
    const tall = [
      boxReq("p", 140, 90, 20, { rotatable: false }),
      boxReq("q", 140, 90, 20, { rotatable: false }),
    ];
    const box = { innerWidth: 150, innerDepth: 190, innerHeight: 30 };
    const locks = [
      { kind: "position" as const, trayKey: "p:p0:0", path: "0", rotated: false },
      { kind: "position" as const, trayKey: "q:p0:0", path: "1", rotated: false },
    ];
    const r = optimize(makeInput(tall, { box, locks }), 1, 1000);
    expect(r.layout).not.toBeNull();
    expect(r.notices.filter((n) => n.code === "lock.dropped").map((n) => n.path)).toEqual([
      "/locks/0",
      "/locks/1",
    ]);
  });

  // Review focus: a single requirement filling exactly the whole box.
  it("fills a box exactly with one tray and no leftovers", () => {
    const one = [boxReq("only", 100, 60, 30)];
    const m = minOuter(
      one[0]?.variants[0]?.parts[0] ?? {
        trayKey: "",
        arrangement: "strip",
        compartments: [],
        rotatable: true,
      },
      DEFAULT_SETTINGS,
      { lipped: false, level: 0 },
    );
    const bc = effective(DEFAULT_SETTINGS).boxClearance;
    const exact = makeInput(one, {
      box: {
        innerWidth: Math.ceil(m.w * 100) / 100 + 2 * bc,
        innerDepth: Math.ceil(m.d * 100) / 100 + 2 * bc,
        innerHeight: 40,
      },
    });
    const r = optimize(exact, 1, 500);
    const printed = r.layout?.trays.filter((t) => t.part !== "spacer") ?? [];
    expect(printed).toHaveLength(1);
    // exactly the floor size: the box minus the clearance on every side
    expect(printed[0]?.w).toBeCloseTo(exact.box.innerWidth - 2 * bc, 2);
    expect(printed[0]?.d).toBeCloseTo(exact.box.innerDepth - 2 * bc, 2);
    expect(checkHardRules(exact, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
  });

  // Review focus: headroom ≥ inner height (topPlane ≤ 0).
  it("reports doesNotFit instead of throwing when headroom ≥ inner height", () => {
    const r = optimize(makeInput(reqs, { box: { innerHeight: 30, headroom: 35 } }), 1, 500);
    expect(r.layout).toBeNull();
    expect(r.bestAttempt?.shortfall.z).toBeGreaterThan(0);
    const n = r.notices.find((x) => x.code === "layout.doesNotFit");
    expect(n?.message).toContain("less headroom");
  });

  // Review focus: a box larger than the bed in both axes with only one component.
  it("splits the leftover of a box larger than the bed into bed-sized pieces", () => {
    const big = makeInput([boxReq("small", 50, 40, 20)], {
      box: { innerWidth: 400, innerDepth: 350, innerHeight: 40 },
      printer: { bedX: 220, bedY: 220, bedZ: 250 },
    });
    const r = optimize(big, 1, 1000);
    expect(r.layout).not.toBeNull();
    expect(checkHardRules(big, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
    const scoop = makeInput(
      [boxReq("scoop", 50, 40, 20, { elastic: { w: true, d: true, h: true } })],
      {
        box: { innerWidth: 400, innerDepth: 350, innerHeight: 40 },
        printer: { bedX: 220, bedY: 220, bedZ: 250 },
      },
    );
    const s = optimize(scoop, 1, 1000);
    expect(checkHardRules(scoop, s.layout ?? emptyLayout(), s.notices)).toEqual([]);
  });

  it("reports the infeasible tiny-box fixture with a shortfall and suggestions", () => {
    const tiny = fixtureInput("tiny-box");
    const r = optimize(tiny, 1, 2000);
    expect(r.layout).toBeNull();
    expect(r.summary).toBeNull();
    const sf = r.bestAttempt?.shortfall;
    expect((sf?.x ?? 0) + (sf?.y ?? 0) + (sf?.z ?? 0)).toBeGreaterThan(0);
    const n = r.notices.find((x) => x.code === "layout.doesNotFit");
    expect(n?.level).toBe("error");
    expect(n?.message).toContain("Try:");
  });

  // Review focus: 30+ requirements must not make the search unusably slow.
  it("handles 32 requirements within the time budget", () => {
    const many = Array.from({ length: 32 }, (_, i) =>
      boxReq(`m${i}`, 20 + (i % 5) * 7, 25 + (i % 3) * 9, 8 + (i % 4) * 3),
    );
    const big = makeInput(many, { box: { innerWidth: 400, innerDepth: 400, innerHeight: 60 } });
    const t0 = Date.now();
    const r = optimize(big, 1, 2000);
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(r.layout ?? r.bestAttempt).not.toBeNull();
  });

  it("treats a non-finite or negative budget as zero iterations", () => {
    expect(optimize(input, 1, Number.NaN).layout?.iterations).toBe(0);
    expect(optimize(input, 1, -5).layout?.iterations).toBe(0);
  });

  it("exports a sane default budget", () => {
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(5000);
    expect(DEFAULT_ITERATIONS % 1000).toBe(0);
  });
});

function emptyLayout() {
  return {
    createdWith: "",
    geometryVersion: "",
    inputsHash: "",
    seed: 0,
    iterations: 0,
    capped: false,
    trays: [],
  };
}

describe("checkHardRules on optimizer output", () => {
  const input = makeInput([boxReq("a", 120, 80, 20), boxReq("b", 90, 80, 20)]);
  const r = optimize(input, 1, 1000);

  it("passes a real layout", () => {
    expect(r.layout).not.toBeNull();
    expect(checkHardRules(input, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
  });

  it("flags a moved tray, a wrong height and an ignored lock", () => {
    const layout = r.layout;
    if (!layout) {
      return;
    }
    const broken = {
      ...layout,
      trays: layout.trays.map((t) => (t.key === "a:p0:0" ? { ...t, x: t.x + 0.5, h: t.h - 1 } : t)),
    };
    const locked = {
      ...input,
      locks: [{ kind: "position" as const, trayKey: "a:p0:0", path: "0101", rotated: false }],
    };
    const v = checkHardRules(locked, broken, []);
    expect(v.some((s) => s.includes("tile"))).toBe(true);
    expect(v.some((s) => s.includes("topPlane"))).toBe(true);
    expect(v.some((s) => s.includes("position lock"))).toBe(true);
  });
});
```

`src/layout/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as layout from "./index";

describe("layout public API", () => {
  it("exports the roadmap §4.4 functions plus swapLocks and NOTICE_CODES", () => {
    expect(typeof layout.optimize).toBe("function");
    expect(typeof layout.summarize).toBe("function");
    expect(typeof layout.swapLocks).toBe("function");
    expect(layout.DEFAULT_ITERATIONS).toBeGreaterThan(0);
    expect(layout.NOTICE_CODES.doesNotFit).toBe("layout.doesNotFit");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/layout/optimize.test.ts src/layout/index.test.ts`

Expected: FAIL — `Failed to resolve import "./optimize" from "src/layout/optimize.test.ts"`.

- [ ] **Step 3: Write the orchestration**

`src/layout/optimize.ts`:

```ts
import { GEOMETRY_VERSION } from "../geometry/version";
import type { Notice, StoredLayout } from "../model/types";
import { createAnnealer, type Annealer, type Candidate } from "./anneal";
import { createCtx, withSizeLocks, type Ctx, type Measure } from "./context";
import { evaluate } from "./fill";
import { greedyTree } from "./greedy";
import {
  applyLocks,
  lockDroppedNotice,
  moveEnvOf,
  noLocks,
  resolveLocks,
  type ResolvedLocks,
} from "./locks";
import { materialize, type Realize } from "./materialize";
import { createRng } from "./prng";
import { scorePlan, type PrevPos } from "./score";
import { summarize } from "./summarize";
import type { Tree } from "./tree";
import type { LayoutInput, LayoutResult } from "./types";
import { toMm } from "./units";
import { warmHints, warmTree, type WarmHints } from "./warmstart";
import { bedNotices, cappedNotice, doesNotFitNotice, layoutWarnings } from "./warnings";

/** Iterations per chunk between progress events, cancel checks and time-cap checks. */
export const CHUNK = 1000;
/** Safety stop (spec §7.2); a capped result is marked `capped`. */
export const DEFAULT_TIME_CAP_MS = 30_000;
/**
 * Default budget N (spec §7.2: ≈ 3 s on a mid-range laptop; "improve more" adds 3N).
 * Measured while writing plan 4 (Apple M-series, Node 26, stand-in sizing): 80 000 it/s on
 * cards-heavy (slowest), 120 000–350 000 on the others. A mid-range laptop is assumed
 * ≈ 3× slower (≈ 27 000 it/s), so 3 s ≈ 80 000; 50 000 leaves headroom for real sizing.
 * Recalibrate: CALIBRATE=1 npx vitest run src/layout/optimize.calibrate.test.ts --reporter=verbose
 */
export const DEFAULT_ITERATIONS = 50_000;

export interface RunOptions {
  warmStart?: StoredLayout;
  timeCapMs?: number;
  /** Clock for the time cap (default Date.now). */
  now?: () => number;
  /** Injection points for unit tests (default: sizing's minOuter / realizeTray). */
  measure?: Measure;
  realize?: Realize;
}

/** An optimization in progress; step() runs one chunk and returns true when finished. */
export interface Run {
  step(): boolean;
  readonly done: number;
  readonly total: number;
  /** Best result so far (materialized; costs realizeTray calls). */
  snapshot(): LayoutResult;
  /** Final result; marks the run capped if called before it finished. */
  result(): LayoutResult;
}

interface Phase {
  readonly ctx: Ctx;
  readonly resolved: ResolvedLocks;
  readonly notices: Notice[];
  readonly annealer: Annealer;
}

const NO_HINTS: WarmHints = {
  variantOf: () => undefined,
  rotatedOf: () => undefined,
  axisOf: () => undefined,
  prev: new Map<string, PrevPos>(),
};

function startPhase(
  input: LayoutInput,
  seed: number,
  iterations: number,
  opts: RunOptions,
  hints: WarmHints,
  useLocks: boolean,
): Phase {
  const base = createCtx(input, opts.measure);
  const { resolved, notices } = useLocks
    ? resolveLocks(base, input.locks, hints)
    : { resolved: noLocks(base), notices: [] };
  const ctx = withSizeLocks(base, resolved.sizes);
  const env = moveEnvOf(ctx, resolved);
  const rng = createRng(seed);
  const prev = opts.warmStart ? hints.prev : undefined;
  const evalTree = (tree: Tree): Candidate => {
    const plan = evaluate(ctx, tree);
    return { tree, plan, score: scorePlan(ctx, plan, prev) };
  };
  const starts: Tree[] = [];
  if (opts.warmStart) {
    const wt = warmTree(ctx, opts.warmStart.trays, resolved.pinnedVariant, hints);
    if (wt) {
      starts.push(wt);
    }
  }
  starts.push(greedyTree(ctx, resolved, "x"), greedyTree(ctx, resolved, "y"));
  let best: Candidate | null = null;
  for (const s of starts) {
    const t = applyLocks(s, resolved, env, rng, hints.axisOf);
    if (t === null) {
      continue;
    }
    const c = evalTree(t);
    if (best === null || c.score.total < best.score.total) {
      best = c;
    }
  }
  const start = best ?? evalTree(greedyTree(ctx, noLocks(ctx), "x"));
  return {
    ctx,
    resolved,
    notices,
    annealer: createAnnealer(env, evalTree, start, rng, iterations),
  };
}

export function createRun(
  input: LayoutInput,
  seed: number,
  iterations: number,
  opts: RunOptions = {},
): Run {
  const now = opts.now ?? Date.now;
  const started = now();
  const cap = opts.timeCapMs ?? DEFAULT_TIME_CAP_MS;
  const hints = opts.warmStart
    ? warmHints(createCtx(input, opts.measure), opts.warmStart.trays)
    : NO_HINTS;
  const budget = Number.isFinite(iterations) ? Math.max(0, Math.floor(iterations)) : 0;
  // StoredLayout.iterations is cumulative: a warm start ("improve more", re-runs after an
  // edit) continues the stored search, so its count carries over (spec §7.2).
  const prior = opts.warmStart?.iterations ?? 0;
  const carried = Number.isFinite(prior) ? Math.max(0, Math.floor(prior)) : 0;
  const main = startPhase(input, seed, budget, opts, hints, true);
  let fallback: Phase | null = null;
  let finished = false;
  let capped = false;

  const build = (): LayoutResult => {
    const fb = fallback;
    const useFallback = fb !== null && fb.annealer.bestFeasible !== null;
    const phase = useFallback ? fb : main;
    const notices: Notice[] = [...main.notices];
    if (useFallback) {
      for (const lock of main.resolved.kept) {
        notices.push(
          lockDroppedNotice(
            lock,
            "no layout that keeps it fits in the box",
            input.locks.indexOf(lock),
          ),
        );
      }
    }
    notices.push(...bedNotices(phase.ctx));
    const best = phase.annealer.bestFeasible;
    const done = main.annealer.done + (fallback?.annealer.done ?? 0);
    if (best) {
      const trays = materialize(phase.ctx, best.plan, opts.realize);
      const summary = summarize(trays, input);
      notices.push(...layoutWarnings(phase.ctx, trays, summary));
      if (capped) {
        notices.push(cappedNotice());
      }
      return {
        layout: {
          createdWith: input.appVersion,
          geometryVersion: GEOMETRY_VERSION,
          inputsHash: input.inputsHash,
          seed,
          iterations: carried + (capped ? done : budget),
          capped,
          trays,
        },
        bestAttempt: null,
        summary,
        notices,
      };
    }
    const attempts = [main, ...(fallback ? [fallback] : [])].map((p) => ({
      p,
      c: p.annealer.leastOverflow,
    }));
    const least = attempts.reduce((a, b) => (b.c.score.overflow < a.c.score.overflow ? b : a));
    const sf = least.c.plan.shortfall;
    const shortfall = { x: toMm(sf.x), y: toMm(sf.y), z: toMm(sf.z) };
    notices.push(doesNotFitNotice(least.p.ctx, shortfall));
    if (capped) {
      notices.push(cappedNotice());
    }
    return {
      layout: null,
      bestAttempt: { trays: materialize(least.p.ctx, least.c.plan, opts.realize), shortfall },
      summary: null,
      notices,
    };
  };

  return {
    step() {
      if (finished) {
        return true;
      }
      const active = fallback ?? main;
      active.annealer.step(CHUNK);
      if (active.annealer.done >= budget) {
        const retry =
          fallback === null && main.annealer.bestFeasible === null && main.resolved.kept.length > 0;
        if (retry) {
          fallback = startPhase(input, seed, budget, opts, hints, false);
        } else {
          finished = true;
        }
      }
      if (!finished && now() - started >= cap) {
        capped = true;
        finished = true;
      }
      return finished;
    },
    get done() {
      return main.annealer.done + (fallback?.annealer.done ?? 0);
    },
    get total() {
      return fallback ? 2 * budget : budget;
    },
    snapshot: build,
    result() {
      if (!finished) {
        capped = true;
        finished = true;
      }
      return build();
    },
  };
}

/**
 * Optimizes a layout (spec §7.2). `iterations` is this run's budget; the result's
 * StoredLayout.iterations adds `warmStart.iterations` (cumulative). Deterministic: same
 * input + warm start + seed + iterations on the same JS engine → deep-equal result, unless
 * the time cap stopped it.
 */
export function optimize(
  input: LayoutInput,
  seed: number,
  iterations: number,
  opts?: {
    warmStart?: StoredLayout;
    onProgress?: (done: number, best: LayoutResult) => void;
    timeCapMs?: number;
    shouldCancel?: () => boolean;
  },
): LayoutResult {
  const run = createRun(input, seed, iterations, {
    warmStart: opts?.warmStart,
    timeCapMs: opts?.timeCapMs,
  });
  for (;;) {
    const finished = run.step();
    if (opts?.onProgress) {
      opts.onProgress(run.done, run.snapshot());
    }
    if (finished || opts?.shouldCancel?.() === true) {
      break;
    }
  }
  return run.result();
}
```

- [ ] **Step 4: Write the public index**

`src/layout/index.ts`:

```ts
export { optimize, DEFAULT_ITERATIONS } from "./optimize";
export { summarize } from "./summarize";
export { swapLocks } from "./locks";
export { NOTICE_CODES } from "./warnings";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/layout/optimize.test.ts src/layout/index.test.ts`

Expected: PASS. If "reports the infeasible tiny-box fixture" finds a layout, check `size()` output for `tiny-box.json` first (4 × 100 sleeved cards must not fit 150 × 100 × 40).

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 6: Commit**

From the repo root:

```bash
git add src/layout/optimize.ts src/layout/optimize.test.ts src/layout/index.ts src/layout/index.test.ts
git commit -m "Add layout optimizer orchestration"
```

### Task 19: Hard-rule property tests and calibration

**Files:**

- Test: `src/layout/properties.test.ts`
- Test: `src/layout/optimize.calibrate.test.ts`

**Interfaces:**

- Consumes: `optimize` (Task 18); `checkHardRules`, `fixtureInput` (Task 17); test helpers (Tasks 4, 12); `fast-check`.
- Produces: tests only.

- [ ] **Step 1: Write the property tests**

Random requirement sets (1–6 requirements, 1–3 compartments, elastic flags, split variants, rotation, access, loose, finger cuts on every compartment of a requirement), random boxes, headroom, coverage, lip on/off, Fit, leftover mode and bed size; plus the synthetic fixtures. Every result must satisfy `checkHardRules` or report `doesNotFit` with a best attempt.

`src/layout/properties.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Lock } from "../model/types";
import type { TrayRequirement } from "../sizing/types";
import { fixtureInput, type FixtureName } from "./test-fixtures";
import { checkHardRules } from "./test-hard-rules";
import { optimize } from "./optimize";
import { comp, makeInput, part, req, variant } from "./test-utils";
import type { LayoutInput, LayoutResult } from "./types";

const compArb = fc.record({
  minW: fc.integer({ min: 20, max: 110 }),
  minD: fc.integer({ min: 20, max: 110 }),
  minH: fc.integer({ min: 5, max: 45 }),
  ew: fc.boolean(),
  ed: fc.boolean(),
  eh: fc.boolean(),
});

const reqArb = fc.record({
  comps: fc.array(compArb, { minLength: 1, maxLength: 3 }),
  rotatable: fc.boolean(),
  access: fc.constantFrom("often" as const, "sometimes" as const, "setup" as const),
  loose: fc.boolean(),
  split: fc.boolean(),
  // every compartment asks for a front wall cutout, so rule 8 and the cutout rules are exercised
  fingerCuts: fc.boolean(),
});

const inputArb = fc.record({
  reqs: fc.array(reqArb, { minLength: 1, maxLength: 6 }),
  w: fc.integer({ min: 120, max: 420 }),
  d: fc.integer({ min: 120, max: 420 }),
  h: fc.integer({ min: 25, max: 120 }),
  headroom: fc.integer({ min: 0, max: 10 }),
  partial: fc.boolean(),
  side: fc.boolean(),
  lip: fc.boolean(),
  fit: fc.constantFrom(0.7, 1, 1.4),
  solid: fc.boolean(),
  bed: fc.constantFrom(180, 220, 256),
});

type InputSpec = typeof inputArb extends fc.Arbitrary<infer T> ? T : never;

function build(spec: InputSpec): LayoutInput {
  const requirements: TrayRequirement[] = spec.reqs.map((r, i) => {
    const key = `r${i}`;
    const comps = r.comps.map((c, k) =>
      comp({
        minW: c.minW,
        minD: c.minD,
        minH: c.minH,
        elastic: { w: c.ew, d: c.ed, h: c.eh },
        contents: `${key}c${k}`,
        fingerCut: r.fingerCuts ? true : undefined,
      }),
    );
    const variants = [variant("one", [part(`${key}:p0:0`, comps, r.rotatable)])];
    if (r.split && comps.length > 1) {
      variants.push(
        variant(
          "split",
          comps.map((c, k) => part(`${key}:p0:${k}`, [c], r.rotatable)),
        ),
      );
    }
    return req(key, variants, { access: r.access, loose: r.loose });
  });
  return makeInput(requirements, {
    box: {
      innerWidth: spec.w,
      innerDepth: spec.d,
      innerHeight: spec.h,
      headroom: spec.headroom,
      headroomCoverage: spec.partial ? "partial" : "full",
      storedOnSide: spec.side,
    },
    printer: { bedX: spec.bed, bedY: spec.bed },
    settings: {
      fit: spec.fit,
      leftover: spec.solid ? "solid" : "spare",
      lip: { enabled: spec.lip, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 },
    },
  });
}

function expectValid(input: LayoutInput, r: LayoutResult): void {
  if (r.layout) {
    expect(checkHardRules(input, r.layout, r.notices)).toEqual([]);
    expect(r.bestAttempt).toBeNull();
  } else {
    expect(r.bestAttempt).not.toBeNull();
    expect(r.notices.some((n) => n.code === "layout.doesNotFit")).toBe(true);
  }
}

describe("hard rules (spec §3) on random inputs", () => {
  it("every result satisfies all hard rules, or reports doesNotFit", () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 0, max: 2 ** 31 - 1 }), (spec, seed) => {
        const input = build(spec);
        expectValid(input, optimize(input, seed, 300));
      }),
      { numRuns: 60 },
    );
  });

  it("locks taken from a result are respected or dropped with a notice", () => {
    fc.assert(
      fc.property(inputArb, fc.nat(), fc.nat(), (spec, pick, seed) => {
        const input = build(spec);
        const first = optimize(input, seed, 200);
        const trays = first.layout?.trays.filter((t) => t.part === "tray") ?? [];
        const t = trays[pick % Math.max(1, trays.length)];
        if (!first.layout || !t) {
          return;
        }
        const locks: Lock[] = [
          { kind: "position", trayKey: t.key, path: t.path, rotated: t.rotated },
          { kind: "size", trayKey: t.key, w: t.w, d: t.d, h: t.h },
          { kind: "position", trayKey: "ghost:p0:0", path: "1", rotated: false },
        ];
        const locked = { ...input, locks };
        const r = optimize(locked, seed, 200, { warmStart: first.layout });
        expectValid(locked, r);
        expect(
          r.notices.some((n) => n.code === "lock.dropped" && n.message.includes("ghost:p0:0")),
        ).toBe(true);
      }),
      { numRuns: 30 },
    );
  });

  it("same seed + iterations gives deep-equal results", () => {
    fc.assert(
      fc.property(inputArb, fc.nat(), (spec, seed) => {
        const input = build(spec);
        expect(optimize(input, seed, 200)).toEqual(optimize(input, seed, 200));
      }),
      { numRuns: 15 },
    );
  });
});

describe("hard rules on the synthetic fixtures", () => {
  const feasible: FixtureName[] = ["cards-heavy", "bits-heavy", "tiles-minis", "small-tiles"];
  for (const name of feasible) {
    it(`${name}: feasible and every hard rule holds`, () => {
      const input = fixtureInput(name);
      const r = optimize(input, 1, 4000);
      expect(r.layout).not.toBeNull();
      expectValid(input, r);
    });
  }

  it("tiny-box: no layout, a best attempt with a shortfall", () => {
    const input = fixtureInput("tiny-box");
    const r = optimize(input, 1, 2000);
    expect(r.layout).toBeNull();
    expectValid(input, r);
  });
});
```

- [ ] **Step 2: Write the calibration test**

Skipped unless `CALIBRATE=1`; it measures iterations/s on the fixtures and prints the suggested `DEFAULT_ITERATIONS`.

`src/layout/optimize.calibrate.test.ts`:

```ts
/**
 * Calibration for DEFAULT_ITERATIONS (spec §7.2: the default budget runs ≈ 3 s on a
 * mid-range laptop). Skipped in normal runs. On such a machine, from the repo root:
 *   CALIBRATE=1 npx vitest run src/layout/optimize.calibrate.test.ts --reporter=verbose
 * It prints iterations/s per fixture and the suggested constant:
 * 3 × (iterations/s of the slowest fixture), rounded down to a multiple of 1000.
 * Update DEFAULT_ITERATIONS in optimize.ts (and the measurement comment there) with it.
 */
import { expect, it } from "vitest";
import { fixtureInput, type FixtureName } from "./test-fixtures";
import { optimize } from "./optimize";

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const RUN_ITERATIONS = 10_000;
const NAMES: FixtureName[] = [
  "cards-heavy",
  "bits-heavy",
  "tiles-minis",
  "small-tiles",
  "tiny-box",
];

it.skipIf(env?.CALIBRATE !== "1")("measures iterations per second on the fixtures", () => {
  const rates = NAMES.map((name) => {
    const input = fixtureInput(name);
    optimize(input, 1, 1000);
    const t0 = performance.now();
    optimize(input, 1, RUN_ITERATIONS);
    const seconds = (performance.now() - t0) / 1000;
    return { name, perSecond: Math.round(RUN_ITERATIONS / seconds) };
  });
  const slowest = Math.min(...rates.map((r) => r.perSecond));
  const suggested = Math.floor((3 * slowest) / 1000) * 1000;
  console.warn(JSON.stringify({ rates, suggestedDefaultIterations: suggested }, null, 2));
  expect(slowest).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/layout/properties.test.ts src/layout/optimize.calibrate.test.ts`

Expected: PASS (8 tests) and 1 skipped. The engine is complete at this point, so these pass on the first run; when a property fails, fast-check prints the counterexample and seed — fix the engine module the violation names (tiling → `tree.ts`/`fill.ts`, heights → `stack.ts`, compartments/grip → the `realizeTray` call in `materialize.ts`), never the checker.

- [ ] **Step 4: Calibrate (informational)**

Run: `CALIBRATE=1 npx vitest run src/layout/optimize.calibrate.test.ts --reporter=verbose`

Expected: PASS and a JSON block with `rates` and `suggestedDefaultIterations`. Keep `DEFAULT_ITERATIONS = 50_000` unless this runs on a mid-range laptop; there, set it to the suggestion and update the measurement comment above the constant in `optimize.ts` (then re-run `npx vitest run src/layout/optimize.test.ts`).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/properties.test.ts src/layout/optimize.calibrate.test.ts
git commit -m "Add hard-rule property tests and optimizer calibration"
```

### Task 20: Layout worker

**Files:**

- Create: `src/layout/worker-core.ts`
- Create: `src/layout/worker.ts`
- Test: `src/layout/worker-core.test.ts`

**Interfaces:**

- Consumes: `createRun` (Task 18); `LayoutRequest`, `LayoutResponse` (Task 1).
- Produces: `createWorkerHandler(post: (msg: LayoutResponse) => void, yieldToEvents?: () => Promise<void>): (req: LayoutRequest) => Promise<void>`; `worker.ts` (module worker entry).

- [ ] **Step 1: Write the failing test**

`src/layout/worker-core.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { optimize } from "./optimize";
import { boxReq, makeInput } from "./test-utils";
import type { LayoutRequest, LayoutResponse } from "./types";
import { createWorkerHandler } from "./worker-core";

const input = makeInput([
  boxReq("a", 120, 80, 20),
  boxReq("b", 90, 80, 20),
  boxReq("c", 60, 40, 15),
]);
const run = (runId: number, iterations = 2500): LayoutRequest => ({
  type: "run",
  runId,
  input,
  seed: 4,
  iterations,
});

describe("layout worker handler", () => {
  it("posts progress per chunk, then the same result optimize() returns", async () => {
    const posts: LayoutResponse[] = [];
    const handle = createWorkerHandler(
      (m) => posts.push(m),
      () => Promise.resolve(),
    );
    await handle(run(1));
    expect(posts.map((p) => p.type)).toEqual(["progress", "progress", "done"]);
    expect(posts[0]).toMatchObject({ runId: 1, done: 1000, total: 2500 });
    const last = posts[2];
    expect(last?.type === "done" && last.result).toEqual(optimize(input, 4, 2500));
  });

  it("stops a run when cancelled between chunks", async () => {
    const posts: LayoutResponse[] = [];
    const handle = createWorkerHandler(
      (m) => posts.push(m),
      () => Promise.resolve(),
    );
    const p = handle(run(2, 5000));
    await handle({ type: "cancel", runId: 2 });
    await p;
    expect(posts.map((m) => m.type)).toEqual(["progress"]);
  });

  it("lets a newer run supersede an older one", async () => {
    const posts: LayoutResponse[] = [];
    const handle = createWorkerHandler(
      (m) => posts.push(m),
      () => Promise.resolve(),
    );
    const first = handle(run(3, 5000));
    const second = handle(run(4, 1000));
    await Promise.all([first, second]);
    expect(posts.filter((m) => m.type === "done").map((m) => m.runId)).toEqual([4]);
  });

  it("reports errors as messages", async () => {
    const posts: LayoutResponse[] = [];
    const handle = createWorkerHandler(
      (m) => posts.push(m),
      () => Promise.resolve(),
    );
    const broken = { ...run(5), input: { ...input, box: null } } as unknown as LayoutRequest;
    await handle(broken);
    expect(posts[0]?.type).toBe("error");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/worker-core.test.ts`

Expected: FAIL — `Failed to resolve import "./worker-core" from "src/layout/worker-core.test.ts"`.

- [ ] **Step 3: Write the handler**

`src/layout/worker-core.ts`:

```ts
import { createRun } from "./optimize";
import type { LayoutRequest, LayoutResponse } from "./types";

/**
 * Message handling of the layout worker, separated from `self` so it can be tested.
 * Runs one chunk at a time and yields to the event loop between chunks, so "cancel"
 * messages (and newer "run" messages, which supersede older runs) are seen promptly.
 */
export function createWorkerHandler(
  post: (msg: LayoutResponse) => void,
  yieldToEvents: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
): (req: LayoutRequest) => Promise<void> {
  const cancelled = new Set<number>();
  let active = -1;
  const stopped = (runId: number): boolean => cancelled.has(runId) || active !== runId;
  return async (req) => {
    if (req.type === "cancel") {
      cancelled.add(req.runId);
      return;
    }
    const { runId } = req;
    active = runId;
    try {
      const run = createRun(req.input, req.seed, req.iterations, { warmStart: req.warmStart });
      for (;;) {
        const finished = run.step();
        if (stopped(runId)) {
          return;
        }
        if (finished) {
          break;
        }
        post({ type: "progress", runId, done: run.done, total: run.total, best: run.snapshot() });
        await yieldToEvents();
        if (stopped(runId)) {
          return;
        }
      }
      post({ type: "done", runId, result: run.result() });
    } catch (e) {
      post({ type: "error", runId, message: e instanceof Error ? e.message : String(e) });
    } finally {
      cancelled.delete(runId);
    }
  };
}
```

- [ ] **Step 4: Write the worker entry**

Thin wiring of `self`; it has no logic of its own (the handler is tested above). A cast is used instead of `/// <reference lib="webworker" />` because the app's tsconfig includes the DOM lib.

`src/layout/worker.ts`:

```ts
import type { LayoutRequest, LayoutResponse } from "./types";
import { createWorkerHandler } from "./worker-core";

interface WorkerScope {
  onmessage: ((e: MessageEvent<LayoutRequest>) => void) | null;
  postMessage(msg: LayoutResponse): void;
}

const scope = self as unknown as WorkerScope;
const handle = createWorkerHandler((msg) => scope.postMessage(msg));
scope.onmessage = (e) => {
  void handle(e.data);
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/layout/worker-core.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 6: Commit**

From the repo root:

```bash
git add src/layout/worker-core.ts src/layout/worker-core.test.ts src/layout/worker.ts
git commit -m "Add layout worker"
```

### Task 21: Layout client

**Files:**

- Create: `src/layout/client.ts`
- Test: `src/layout/client.test.ts`

**Interfaces:**

- Consumes: `LayoutInput`, `LayoutRequest`, `LayoutResponse`, `LayoutResult` (Task 1); `StoredLayout`; `worker.ts` (Task 20, via `new URL("./worker.ts", import.meta.url)`).
- Produces: `createLayoutClient(): LayoutClient` (roadmap §4.4 signature); `class LayoutCancelledError extends Error`; `interface WorkerLike { postMessage; onmessage; onerror; terminate }`; `interface LayoutClient { run(input, seed, iterations, warmStart, onProgress): Promise<LayoutResult>; cancel(): void; dispose(): void }`; `createLayoutClientWith(factory: () => WorkerLike): LayoutClient`.

- [ ] **Step 1: Write the failing test**

`src/layout/client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createLayoutClientWith, LayoutCancelledError, type WorkerLike } from "./client";
import { makeInput } from "./test-utils";
import type { LayoutRequest, LayoutResponse, LayoutResult } from "./types";

class FakeWorker implements WorkerLike {
  sent: LayoutRequest[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<LayoutResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(msg: LayoutRequest): void {
    this.sent.push(msg);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(msg: LayoutResponse): void {
    this.onmessage?.({ data: msg } as MessageEvent<LayoutResponse>);
  }
  crash(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const result: LayoutResult = { layout: null, bestAttempt: null, summary: null, notices: [] };
const input = makeInput([]);

function setup() {
  const workers: FakeWorker[] = [];
  const client = createLayoutClientWith(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  return { client, workers };
}

describe("layout client", () => {
  it("runs on one lazily created worker and forwards progress", async () => {
    const { client, workers } = setup();
    const progress: number[] = [];
    const p = client.run(input, 7, 2000, undefined, (done) => progress.push(done));
    const w = workers[0];
    expect(workers).toHaveLength(1);
    expect(w?.sent[0]).toEqual({
      type: "run",
      runId: 1,
      input,
      seed: 7,
      iterations: 2000,
      warmStart: undefined,
    });
    w?.emit({ type: "progress", runId: 1, done: 1000, total: 2000, best: result });
    w?.emit({ type: "done", runId: 1, result });
    await expect(p).resolves.toBe(result);
    expect(progress).toEqual([1000]);
  });

  it("cancels: rejects with LayoutCancelledError, tells the worker, ignores late messages", async () => {
    const { client, workers } = setup();
    const p = client.run(input, 1, 1000, undefined, () => undefined);
    client.cancel();
    await expect(p).rejects.toBeInstanceOf(LayoutCancelledError);
    expect(workers[0]?.sent[1]).toEqual({ type: "cancel", runId: 1 });
    // A late message of the cancelled run is dropped, also while the next run is pending.
    const late: LayoutResult = {
      ...result,
      notices: [{ level: "info", code: "x", message: "late" }],
    };
    workers[0]?.emit({ type: "done", runId: 1, result: late });
    const next = client.run(input, 2, 1000, undefined, () => undefined);
    workers[0]?.emit({ type: "done", runId: 1, result: late });
    workers[0]?.emit({ type: "done", runId: 2, result });
    await expect(next).resolves.toBe(result);
  });

  it("a new run supersedes the previous one on the same worker", async () => {
    const { client, workers } = setup();
    const first = client.run(input, 1, 1000, undefined, () => undefined);
    const second = client.run(input, 2, 1000, undefined, () => undefined);
    await expect(first).rejects.toBeInstanceOf(LayoutCancelledError);
    workers[0]?.emit({ type: "done", runId: 2, result });
    await expect(second).resolves.toBe(result);
    expect(workers).toHaveLength(1);
  });

  it("rejects on worker errors and starts a fresh worker afterwards", async () => {
    const { client, workers } = setup();
    const a = client.run(input, 1, 1000, undefined, () => undefined);
    workers[0]?.emit({ type: "error", runId: 1, message: "boom" });
    await expect(a).rejects.toThrow("boom");
    const b = client.run(input, 1, 1000, undefined, () => undefined);
    workers[0]?.crash("wasm died");
    await expect(b).rejects.toThrow("wasm died");
    expect(workers[0]?.terminated).toBe(true);
    void client.run(input, 1, 1000, undefined, () => undefined).catch(() => undefined);
    expect(workers).toHaveLength(2);
    client.dispose();
    expect(workers[1]?.terminated).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/layout/client.test.ts`

Expected: FAIL — `Failed to resolve import "./client" from "src/layout/client.test.ts"`.

- [ ] **Step 3: Write the implementation**

`src/layout/client.ts`:

```ts
import type { StoredLayout } from "../model/types";
import type { LayoutInput, LayoutRequest, LayoutResponse, LayoutResult } from "./types";

/** Rejection reason of a run that was cancelled or superseded by a newer run. */
export class LayoutCancelledError extends Error {
  constructor() {
    super("Layout run cancelled");
    this.name = "LayoutCancelledError";
  }
}

/** The part of the Worker API the client uses (a fake in tests). */
export interface WorkerLike {
  postMessage(msg: LayoutRequest): void;
  onmessage: ((e: MessageEvent<LayoutResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  terminate(): void;
}

export interface LayoutClient {
  run(
    input: LayoutInput,
    seed: number,
    iterations: number,
    warmStart: StoredLayout | undefined,
    onProgress: (done: number, total: number, best: LayoutResult) => void,
  ): Promise<LayoutResult>;
  cancel(): void;
  dispose(): void;
}

interface Pending {
  readonly id: number;
  resolve(r: LayoutResult): void;
  reject(e: Error): void;
  onProgress(done: number, total: number, best: LayoutResult): void;
}

/**
 * One lazily created worker, one run at a time. Starting a run cancels the previous one;
 * a cancelled run's promise rejects with LayoutCancelledError and its late messages are
 * ignored. A worker crash rejects the run and the next run starts a fresh worker.
 */
export function createLayoutClientWith(factory: () => WorkerLike): LayoutClient {
  let worker: WorkerLike | null = null;
  let nextId = 0;
  let pending: Pending | null = null;

  const settle = (): Pending | null => {
    const p = pending;
    pending = null;
    return p;
  };
  const onMessage = (msg: LayoutResponse): void => {
    if (!pending || msg.runId !== pending.id) {
      return;
    }
    if (msg.type === "progress") {
      pending.onProgress(msg.done, msg.total, msg.best);
    } else if (msg.type === "done") {
      settle()?.resolve(msg.result);
    } else {
      settle()?.reject(new Error(msg.message));
    }
  };
  const ensure = (): WorkerLike => {
    if (worker) {
      return worker;
    }
    const w = factory();
    w.onmessage = (e) => onMessage(e.data);
    w.onerror = (e) => {
      w.terminate();
      worker = null;
      settle()?.reject(new Error(e.message || "Layout worker failed"));
    };
    worker = w;
    return w;
  };
  const cancel = (): void => {
    const p = settle();
    if (p) {
      worker?.postMessage({ type: "cancel", runId: p.id });
      p.reject(new LayoutCancelledError());
    }
  };
  return {
    run(input, seed, iterations, warmStart, onProgress) {
      cancel();
      nextId++;
      const id = nextId;
      return new Promise<LayoutResult>((resolve, reject) => {
        pending = { id, resolve, reject, onProgress };
        ensure().postMessage({ type: "run", runId: id, input, seed, iterations, warmStart });
      });
    },
    cancel,
    dispose() {
      cancel();
      worker?.terminate();
      worker = null;
    },
  };
}

export function createLayoutClient(): LayoutClient {
  return createLayoutClientWith(
    () =>
      new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      }) as unknown as WorkerLike,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/layout/client.test.ts`

Expected: PASS.

Also run `npx tsc --noEmit` and `npx eslint src/layout` (both clean).

- [ ] **Step 5: Commit**

From the repo root:

```bash
git add src/layout/client.test.ts src/layout/client.ts
git commit -m "Add layout worker client"
```

### Task 22: Full verification

**Files:**

- None (verification only).

**Interfaces:**

- Consumes: everything above.
- Produces: a green repo quality gate.

- [ ] **Step 1: Run the whole layout suite and type-check**

Run: `npx vitest run src/layout && npx tsc --noEmit && npx eslint src/layout`

Expected: all layout test files pass (the calibration test is skipped), no type or lint errors.

- [ ] **Step 2: Confirm no forbidden imports or randomness**

Run: `grep -rnE 'Math\.random *\(|from "\.\./geometry"|geometry/index' src/layout`

Expected: no output (production code imports only `../geometry/version`; the test-only `test-hard-rules.ts` imports `../geometry/plan`; `Math.random` is also rejected by ESLint).

- [ ] **Step 3: Run the repo gate**

Run (from the repo root): `npm run verify`

Expected: exits 0 (lint, format check, and the build: `vitest run`, both `tsc` runs, `vite build`). If `format:check` fails, run `npx prettier --write src/layout` and re-run.

- [ ] **Step 4: Commit any formatting fixes**

Only if Step 3 required changes:

```bash
git add src/layout
git commit -m "Format layout engine"
```

## Contract changes

No §4 type or signature changes. Additions and clarifications for the roadmap:

1. **Additional exports (additive).** `src/layout/index.ts` also exports `swapLocks(locks: readonly Lock[], keyA: string, keyB: string, layout: StoredLayout): Lock[]` and `NOTICE_CODES`. `src/layout/client.ts` also exports `LayoutCancelledError` (the rejection of a cancelled or superseded run), `LayoutClient`, `WorkerLike` and `createLayoutClientWith(factory)` (for tests).
2. **`swapLocks` has one implementation.** This plan's `swapLocks(locks, keyA, keyB, layout)` (adds stack locks so whole stacks keep their order; trays in the same stack swap levels) is the only one; plan 5 imports it from `../layout` (roadmap §4.8).
3. **Sizing exports used here** (from plan 2 / roadmap §4.7, not yet in the §4.2 export list): `rotateRealized(r: RealizedTray, outer: OuterSize): RealizedTray`, `hasGrip(compartments: readonly CompartmentSpec[]): boolean` and `needsGrip(part: TrayPartReq): boolean`. Please add them to §4.2.
4. **Notice codes** emitted by layout (for plan 5): `layout.coverage`, `layout.play`, `layout.lipOff`, `layout.capped` (level `info`), `layout.bed` (error), `layout.doesNotFit` (error; its tips include "choose a tighter fit (Fit: tight)", spec §7.3), `lock.dropped` (warning; message starts with `"<Position|Size|Stack> lock on <keys> was dropped: "`; `path: "/locks/<index>"` names the lock's index in `LayoutInput.locks`, so plan 5 can remove exactly that lock).
5. **`StoredLayout.iterations`** is cumulative: `warmStart.iterations` (when there is a warm start) + this run's budget, or + the iterations actually run when `capped` is true. The `iterations` argument of `optimize`/`createRun`/`run` is this run's budget only, so "improve more" passes 3 × `DEFAULT_ITERATIONS` with the stored layout as `warmStart`. **Leftover `TraySpec.path`** is the path of the leaf it lies in (shared with that leaf's trays); every leftover piece has its own `stack` number.
6. **Variants share trayKeys.** Plan 2 gives every variant of a requirement the same trayKeys (`<key>:p0:0` for upright and flat cards alike, spec §5 key format), so `warmHints().variantOf` and `checkHardRules` infer the variant with `inferVariant` (Task 13): the variant whose part keys equal the stored keys and whose compartments meet their minimums, then key set only, then most shared keys.
