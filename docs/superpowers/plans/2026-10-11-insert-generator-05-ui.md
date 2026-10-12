# Plan 5 — UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Preact user interface of the insert generator — inputs (simple/advanced), optimizer orchestration with autosave and URL sharing, results (summary, plan view with lock/swap, 3D view, export, assembly page) — plus the third-party licenses file and a build smoke test of `dist/`.

**Architecture:** One signals-based state object (`app/state.ts`) holds the current project and everything derived from it. Two orchestrators mutate it: `app/runner.ts` (debounced optimizer runs through the layout client, stale-result guard, auto-accept with one-step undo) and `app/persistence.ts` (startup from URL hash or project store, open/import without overwriting, debounced autosave, `history.replaceState`, cross-tab conflict detection); `app/store.ts` composes them behind a small `AppStore` API. UI components in `ui/`, `plan/`, `viewer/`, `instructions/` are presentational (props in, callbacks out) so they test in jsdom with stubbed clients; three.js and the geometry worker load lazily.

**Tech Stack:** Preact 10 + `@preact/signals`, TypeScript (strict), Vite 6, Vitest 5 + jsdom + `@testing-library/preact`, three.js (lazy chunk), fflate (via plan 3's export helpers), `rollup-plugin-license`, Node `http`/`fs` for the smoke script.

**Spec:** `docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md` · Roadmap with binding contracts: `docs/superpowers/plans/2026-10-11-insert-generator-00-roadmap.md`

## Amendments from plans 1–3 (binding, read first)

Plans 1–3 are implemented, and their reviews amended the roadmap §4 contracts this plan was written against. The amended roadmap is binding; where this plan's prose and an amendment disagree, the amendment wins. The code blocks named below are already patched: transcribe them as shown.

1. **Geometry client (roadmap §4.3).** `build(spec, settings, signal?)` takes an `AbortSignal`. Every failure rejects with `GeometryBuildError` (`geometry/client.ts`), whose `name` is the reason: `"TraySpecError"` (an invalid spec, message `Tray <key>: …`), `"UnsupportedFeatureError"` (with `feature`), `"AbortError"`, `"TimeoutError"` (after `BUILD_TIMEOUT_MS` = 30 s from the call, queue time included), `"WorkerError"` or `"WorkerRestartedError"` (the worker was replaced while the build waited). Detect an invalid spec by `name === "TraySpecError"`, never by `instanceof RangeError` (Task 16 `support.ts`: `buildErrorReason`, `isInvalidSpec`; the tests of Tasks 16 and 17).
2. **`meshes.ts` retry and poison contract (roadmap §4.3).** A build that fails with `"WorkerRestartedError"` or `"WorkerError"` (the worker died under it) is retried once; a spec that fails twice in a row (aborts aside; a success clears the count) is marked failed and rejects at once until `reset()`, so a spec that kills the worker cannot keep restarting it; at most `MAX_IN_FLIGHT` (2) builds are in the worker at once, because the timeout counts queue time; `get(spec, settings, signal?)` passes the signal to `build`, and the 3D view aborts the builds of trays it no longer shows (Tasks 16, 18). Task 23 adds a bulk-build smoke test of every part of the optimized fixture layouts that checks `BUILD_TIMEOUT_MS` against real build times.
3. **Geometry version lines (spec §9).** The "reprint the whole insert" notice uses plan 3's `isOlderGeometryLine(layout.geometryVersion)` (`geometry/version.ts`, pure): pre-1.0 each `0.MINOR` is a major line, so `0.0.x` is older than `0.1.0` and `0.1.x` is not (Task 2 `state.ts`).
4. **Sizing notices.** `size()` drops variants where a compartment asking for a finger cut gets none; when none is left it stores the stuck tiles, minis and custom members in scoop bins with an info `sizing.noFingerSlot` (roadmap §4.2, the bulk fallback) and, when still none is left, emits a warning `sizing.noFingerSlot` at `/components/<i>` (roadmap §4.2); `sizingNotices` shows it like the other sizing warnings. `settingsValid` adds the cross-field settings errors `field.bottomChamfer` and `field.lipBearing` (both at `/settings/bottomChamfer`, shown next to the bottom chamfer field), and the wall and lip thickness minimum is `MIN_WALL_MM` = 0.9 mm (`SETTING_RANGES`).
5. **Test-only helpers.** Plan 4's checker and fixture loader are `layout/test-hard-rules.ts` and `layout/test-fixtures.ts`; production code never imports a `test-*` module (root ESLint rule), and outside `geometry/` it imports only `geometry/{types,version,client}`.
6. **Finger channels (roadmap §4.5, §4.6, §4.7; implemented after plans 1–3).** Every finger cut is a wall cutout (`FeatureSpec` `"wallCutout"`, in `KNOWN_FEATURE_TYPES`): cards, tiles, minis pockets and custom wells (and bulk with finger cuts on, amendment 7); finger pockets and `fingerPocket.reach` are gone (a file still carrying `reach` reads with the usual notice for an unknown field, and `SETTING_SETTERS` has no setter for it). The default finger width (`fingerPocket.width`) is 25 mm. `Settings.fingerPocket` gained `floorNotch` (advanced, how far a flat cutout's notch reaches into the floor: 0–50 mm, default 12.5, a half-disc as wide as the cut) `wallRoom` and `dividerRoom` (0–20 mm, default 0), all in `SETTING_RANGES` (paths `fingerPocket/floorNotch`, `fingerPocket/wallRoom`, `fingerPocket/dividerRoom`), so `SETTING_SETTERS` has a setter for each (Task 8). Simple mode adds a third control, the "Extra finger room in the box" switch, bound to `fingerRoomOf`/`applyFingerRoom`, `FINGER_ROOM_MM` and `FINGER_DIVIDER_ROOM_MM` (`model/settings`): on writes `wallRoom` = 10 mm and `dividerRoom` = 5 mm, off 0 and 0; a custom advanced pair shows as on, with a hint naming it (Task 8). `SCHEMA_VERSION` is `0.1.1` (same line as `0.1.0`); `GEOMETRY_VERSION` is `0.2.0`, a new line (minis and custom trays changed size), so layouts made before it get the reprint notice (amendment 3). A card spacer standing in a channelled well carries its own `features: [{ type: "spacerNotch", … }]` (`TraySpec.features`, roadmap §4.1): `unsupportedReason` checks those too (Task 16). The code blocks of Tasks 8 and 16 are patched.
7. **Component toggles (spec §5, §6.1).** `ComponentBase` has three optional booleans; absent, each takes the kind's default from `model/defaults`: `fingerCuts` (`fingerCutsOn`: on for cards, tiles, minis pockets and custom, off for bulk and minis stored as bulk), `curvedFloor` (`curvedFloorOn`: the scoop ramp, on for bulk and minis stored as bulk, off for minis pockets and custom; never on cards or tiles, where `validateComponent` reports `field.curvedFloor` at `/components/<i>/curvedFloor`) and `cornerReliefs` (`cornerReliefsOn`: on for tiles and custom). Task 9 adds `ToggleOptions`, rendered by every editor just before More options: "Finger cuts" and "Curved floor" are visible in simple mode ("Curved floor" only for bulk, minis and custom, or where a file set it on another kind, so its error has a place and the user can turn it off), "Corner reliefs" only in advanced mode. Each shows the effective value and writes an explicit boolean. The code blocks of Tasks 9 and 10 are patched.

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

1. Typing a number mid-edit ("63," on the way to "63,5", or "2" → "29" → "290") must not start an optimizer run per keystroke or commit a half-typed value: one run after the 400 ms pause, trailing separator is "incomplete", not an error (tests: Task 3 "five quick edits start exactly one run", Task 6 "63, is incomplete and commits 63.5 once").
2. The optimizer finishing after the user already edited again must not overwrite the layout with a result for old inputs (test: Task 3 "a result for stale inputs is discarded and the newer run is accepted").
3. Opening a shared link whose project id already exists locally, or another tab autosaving the same project id, must never overwrite the other copy: the link is added as a copy, and an external save pauses autosave with a conflict notice (tests: Task 4 "link with an existing id and different content opens as a copy", "external save pauses autosave").
4. Exporting a 25-part zip must not freeze the page: mesh building and file writing yield to the event loop after every part and report monotonic progress (test: Task 16 "yields after every part for 25 parts").
5. On a phone, dragging a tray in the plan view must swap trays rather than scroll the page, and an interrupted touch (pointercancel) must not leave a half-finished drag (tests: Task 15 "touch drag swaps; svg has touch-action none", "pointercancel resets the drag").
6. A lock the optimizer had to drop (its tray is gone, its contents no longer fit) must disappear from the project in the same update that accepts the layout, keep its "dropped" notice visible, and not make the new layout look stale or start another run (test: Task 3 "removes locks a run dropped in the same update, keeps the layout fresh and doesn't re-run").

---

## File map

All paths are relative to `apps/insert-generator/`.

| File                                                                                                                            | Responsibility                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/actions.ts`                                                                                                            | Pure `Project` edits (box, printer, components, settings, locks, swap)                                                                                     |
| `src/app/clients.ts`                                                                                                            | Client types + lazy loaders for the layout and geometry clients                                                                                            |
| `src/app/test-helpers.ts`                                                                                                       | Fixture project, fake trays/layouts/results, cube mesh, stub layout client, `flush()` (tests only; storage uses plan 1's `test-support/memory-storage.ts`) |
| `src/app/state.ts`                                                                                                              | Signals + derived values (validation, stale, summary, notices)                                                                                             |
| `src/app/runner.ts`                                                                                                             | Debounced optimizer orchestration, auto-accept, undo slot input, improve more                                                                              |
| `src/app/persistence.ts`                                                                                                        | Startup, open/import/new/delete, autosave, URL hash, cross-tab conflict                                                                                    |
| `src/app/store.ts`                                                                                                              | `createAppStore()` composition + `connectWindow()`                                                                                                         |
| `src/app/download.ts`                                                                                                           | Blob download helpers, file-name slug                                                                                                                      |
| `src/app/link.ts`                                                                                                               | Share-link building + copy with the 2 000-char warning                                                                                                     |
| `src/app/support.ts`                                                                                                            | `unsupportedReason()` for trays from newer files                                                                                                           |
| `src/app/meshes.ts`                                                                                                             | Cached mesh source on top of the geometry client                                                                                                           |
| `src/app/exportBuild.ts`                                                                                                        | Zip / combined 3MF / STL builders that yield to the UI                                                                                                     |
| `src/app/App.tsx`, `src/app/App.test.tsx`                                                                                       | Page shell wiring store → components (replaces plan 1's placeholder)                                                                                       |
| `src/main.tsx`, `index.html`                                                                                                    | Entry: creates store and mesh source, starts from the URL hash, mounts `<App/>` (replace plan 1's)                                                         |
| `src/ui/validation.ts`                                                                                                          | Field-level `Notice` context                                                                                                                               |
| `src/ui/NumberField.tsx`                                                                                                        | Decimal comma/point number input with inline errors                                                                                                        |
| `src/ui/fields.tsx`                                                                                                             | `TextField`, `SelectField`, `CheckField`                                                                                                                   |
| `src/ui/Notices.tsx`                                                                                                            | Notice list with dismiss and per-notice actions                                                                                                            |
| `src/ui/BoxForm.tsx`, `src/ui/PrinterForm.tsx`                                                                                  | Box and printer inputs                                                                                                                                     |
| `src/ui/settingsFields.ts`, `src/ui/SettingsForm.tsx`                                                                           | Settings inputs (simple choices / every number)                                                                                                            |
| `src/ui/components/*.tsx`                                                                                                       | Component editors (five kinds), shared options, card shell, list                                                                                           |
| `src/ui/ProjectMenu.tsx`                                                                                                        | Project list menu (new/open/rename/delete/import/export/copy link)                                                                                         |
| `src/ui/Summary.tsx`                                                                                                            | Summary, run controls, notices, stale banner                                                                                                               |
| `src/ui/TrayDetails.tsx`                                                                                                        | Selected tray details                                                                                                                                      |
| `src/ui/ExportPanel.tsx`                                                                                                        | Export buttons, progress, disabled trays                                                                                                                   |
| `src/style.css`                                                                                                                 | App styles incl. responsive and print CSS (replaces plan 1's)                                                                                              |
| `src/plan/plan.css`                                                                                                             | Plan-view SVG styles (`touch-action: none`)                                                                                                                |
| `src/instructions/numbering.ts`                                                                                                 | Stable part numbers and labels (shared by plan, export, assembly)                                                                                          |
| `src/plan/layers.ts`                                                                                                            | Plan geometry: frame, levels, SVG rects, hit testing                                                                                                       |
| `src/plan/PlanView.tsx`                                                                                                         | Interactive per-layer SVG (select, drag/keyboard swap, lock)                                                                                               |
| `src/viewer/types.ts`, `transform.ts`, `webgl.ts`, `scene.ts`, `Viewer.tsx`                                                     | Lazy three.js 3D view                                                                                                                                      |
| `src/instructions/render.ts`, `png.ts`, `AssemblyPage.tsx`                                                                      | Assembly SVGs, PNG export, printable page                                                                                                                  |
| `src/licenses/renderLicenses.ts`, `licenses.config.ts`, `licenses/clipper2-LICENSE.txt`, `vite.config.ts`, `tsconfig.node.json` | Third-party licenses file in `dist/`                                                                                                                       |
| `scripts/smoke-dist.mjs`, `scripts/smoke-dist.test.mjs`, `package.json`                                                         | Build smoke test of `dist/` served from a subpath, run by `npm run build`                                                                                  |
| `README.md`, `app.json`                                                                                                         | Developer docs and landing-page description                                                                                                                |

Import locations from the final plans 1–4: `../model/{types,version,settings,presets,defaults,numbers,validate,schema,hash,ids}`, `../share` (index: link codec, `createProjectStore`, `ProjectStore`, `ProjectListEntry`, `StoreWriteError`, JSON files, `LINK_MAX_URL_CHARS`), `../sizing` (index: `size`), `../layout` (index: `summarize`, `swapLocks`, `DEFAULT_ITERATIONS`, `NOTICE_CODES`), `../layout/client` (lazy), `../layout/types`, `../geometry/client` (lazy), `../geometry/types`, `../geometry/version`, `../export` (index), `../test-support/memory-storage` (tests). Main-thread code never imports `../geometry` (index) or `geometry/tray`, so manifold stays inside the worker chunk (roadmap §4.6).

---

### Task 1: Pure project actions

**Files:**

- Create: `src/app/actions.ts`
- Test: `src/app/actions.test.ts`

**Interfaces:**

- Consumes: `newComponent(kind)`, `newProject()` (`model/defaults`), `applyWallChoice`, `applyFitChoice`, `WallChoice`, `FitChoice` (`model/settings`), `swapLocks(locks: readonly Lock[], keyA: string, keyB: string, layout: StoredLayout): Lock[]` (`layout/index.ts`, plan 4 — the only swap implementation; swaps whole stacks, adds stack locks, ignores leftovers).
- Produces (all pure, never mutate inputs):
  - `isLockable(t: TraySpec): boolean` — only `part === "tray"` can carry locks.
  - `updateBox(p: Project, patch: Partial<Box>): Project`
  - `updatePrinter(p: Project, patch: Partial<Printer>): Project`
  - `renameProject(p: Project, name: string): Project`
  - `addComponent(p: Project, kind: ComponentKind): Project`
  - `updateComponent(p: Project, id: string, next: Component): Project`
  - `removeComponent(p: Project, id: string): Project` — also drops locks keyed `"<id>:…"`.
  - `setWallChoice(p: Project, c: WallChoice): Project`, `setFitChoice(p: Project, c: FitChoice): Project`, `setSettings(p: Project, s: Settings): Project`
  - `setLock(p: Project, lock: Lock): Project` — replaces a lock of the same kind on the same tray (or the same stack-key list).
  - `removeLock(p: Project, trayKey: string, kind?: Lock["kind"]): Project`
  - `toggleLock(p: Project, tray: TraySpec): Project` — position lock on/off; no-op for non-lockable trays.
  - `lockedKeys(p: Project): Set<string>` — trayKeys with a position lock.
  - `sizeLockedKeys(p: Project): Set<string>` — trayKeys with a size lock.
  - `toggleSizeLock(p: Project, tray: TraySpec): Project` — size lock `{ kind: "size", trayKey, w, d, h }` from the tray's current outer size on/off; no-op for non-lockable trays; a position lock on the same tray stays.
  - `pruneDroppedLocks(p: Project, notices: readonly Notice[]): Project` — removes the locks named by plan 4's `lock.dropped` notices (`path: "/locks/<index>"`, roadmap §4.8); returns `p` itself when nothing was dropped.
  - `swapTrays(p: Project, keyA: string, keyB: string): Project` — `swapLocks(p.locks, keyA, keyB, p.layout)`; no-op without layout.
  - `setCardSides<C extends CardsComponent>(c: C, a: number, b: number): C` — short = min, long = max.
  - `setGroup<C extends Component>(c: C, groupId: string | undefined): C` — blank → removed; setting a group removes `perPlayer`.
  - `setPerPlayer<C extends Component>(c: C, players: number | undefined): C`
  - `setClearance<C extends Component>(c: C, clearance: number | undefined): C`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/actions.test.ts
import { describe, expect, it } from "vitest";
import { newComponent, newProject } from "../model/defaults";
import { applyFitChoice, applyWallChoice } from "../model/settings";
import type { CardsComponent, Lock, Notice, Project, TraySpec } from "../model/types";
import {
  addComponent,
  isLockable,
  lockedKeys,
  pruneDroppedLocks,
  removeComponent,
  removeLock,
  renameProject,
  setCardSides,
  setClearance,
  setFitChoice,
  setGroup,
  setLock,
  setPerPlayer,
  setSettings,
  setWallChoice,
  sizeLockedKeys,
  swapTrays,
  toggleLock,
  toggleSizeLock,
  updateBox,
  updateComponent,
  updatePrinter,
} from "./actions";

function tray(over: Partial<TraySpec>): TraySpec {
  return {
    key: "a:p0:0",
    part: "tray",
    path: "0",
    stack: 0,
    level: 0,
    x: 0,
    y: 0,
    z: 0,
    w: 100,
    d: 80,
    h: 40,
    rotated: false,
    wall: 1.6,
    floor: 1.2,
    lip: false,
    solid: false,
    compartments: [],
    ...over,
  };
}

function withLayout(p: Project, trays: TraySpec[]): Project {
  return {
    ...p,
    layout: {
      createdWith: "0.1.0",
      geometryVersion: "0.1.0",
      inputsHash: "x",
      seed: 1,
      iterations: 1000,
      capped: false,
      trays,
    },
  };
}

describe("project actions", () => {
  it("patches box and printer without mutating the input", () => {
    const p = newProject();
    const frozen = JSON.stringify(p);
    const q = updatePrinter(updateBox(p, { innerWidth: 290 }), { bedX: 256 });
    expect(q.box.innerWidth).toBe(290);
    expect(q.box.innerDepth).toBe(p.box.innerDepth);
    expect(q.printer.bedX).toBe(256);
    expect(JSON.stringify(p)).toBe(frozen);
  });

  it("renames", () => {
    expect(renameProject(newProject(), "Wingspan").name).toBe("Wingspan");
  });

  it("adds, updates and removes components", () => {
    const p1 = addComponent(newProject(), "cards");
    expect(p1.components).toHaveLength(1);
    const c = p1.components[0];
    if (!c) {
      throw new Error("component missing");
    }
    const p2 = updateComponent(p1, c.id, { ...c, name: "Main deck" });
    expect(p2.components[0]?.name).toBe("Main deck");
    const locks: Lock[] = [
      { kind: "position", trayKey: `${c.id}:p0:0`, path: "0", rotated: false },
      { kind: "stack", trayKeys: [`${c.id}:p0:0`, "other:p0:0"] },
      { kind: "position", trayKey: "other:p0:0", path: "1", rotated: false },
    ];
    const p3 = removeComponent({ ...p2, locks }, c.id);
    expect(p3.components).toHaveLength(0);
    expect(p3.locks).toEqual([
      { kind: "position", trayKey: "other:p0:0", path: "1", rotated: false },
    ]);
  });

  it("applies simple setting choices and advanced settings", () => {
    const p = newProject();
    expect(setWallChoice(p, "sturdy").settings).toEqual(applyWallChoice(p.settings, "sturdy"));
    expect(setFitChoice(p, "loose").settings).toEqual(applyFitChoice(p.settings, "loose"));
    const s = { ...p.settings, cornerRadius: 4 };
    expect(setSettings(p, s).settings.cornerRadius).toBe(4);
  });

  it("sets, replaces, removes and toggles locks", () => {
    const p = newProject();
    const l1: Lock = { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false };
    const l2: Lock = { kind: "position", trayKey: "a:p0:0", path: "1", rotated: true };
    const size: Lock = { kind: "size", trayKey: "a:p0:0", w: 1, d: 2, h: 3 };
    const p1 = setLock(setLock(setLock(p, l1), size), l2);
    expect(p1.locks).toEqual([size, l2]);
    expect(removeLock(p1, "a:p0:0", "position").locks).toEqual([size]);
    expect(removeLock(p1, "a:p0:0").locks).toEqual([]);

    const t = tray({ key: "a:p0:0", path: "01", rotated: true });
    const on = toggleLock(p, t);
    expect(on.locks).toEqual([{ kind: "position", trayKey: "a:p0:0", path: "01", rotated: true }]);
    expect(lockedKeys(on)).toEqual(new Set(["a:p0:0"]));
    expect(toggleLock(on, t).locks).toEqual([]);
    expect(toggleLock(p, tray({ key: "leftover:0", part: "leftover" }))).toBe(p);
  });

  it("only locks real trays", () => {
    expect(isLockable(tray({}))).toBe(true);
    expect(isLockable(tray({ part: "leftover", key: "leftover:0" }))).toBe(false);
    expect(isLockable(tray({ part: "spacer", key: "a:p0:0:spacer" }))).toBe(false);
  });

  it("swaps trays through their layout", () => {
    const a = tray({ key: "a:p0:0", path: "0", stack: 0 });
    const b = tray({ key: "b:p0:0", path: "1", stack: 1 });
    const p = withLayout(newProject(), [a, b]);
    expect(swapTrays(p, "a:p0:0", "b:p0:0").locks).toHaveLength(2);
    const noLayout = newProject();
    expect(swapTrays(noLayout, "a:p0:0", "b:p0:0")).toBe(noLayout);
  });

  it("orders card sides so short ≤ long", () => {
    const c = newComponent("cards") as CardsComponent;
    expect(setCardSides(c, 88, 63.5)).toMatchObject({ shortSide: 63.5, longSide: 88 });
    expect(setCardSides(c, 41, 63)).toMatchObject({ shortSide: 41, longSide: 63 });
  });

  it("sets and clears group, perPlayer and clearance", () => {
    const c = newComponent("bulk");
    const pp = setPerPlayer(c, 4);
    expect(pp.perPlayer).toEqual({ players: 4 });
    const grouped = setGroup(pp, "  tokens ");
    expect(grouped.groupId).toBe("tokens");
    expect(grouped.perPlayer).toBeUndefined();
    expect("groupId" in setGroup(grouped, "  ")).toBe(false);
    expect("perPlayer" in setPerPlayer(pp, undefined)).toBe(false);
    expect(setClearance(c, 2).clearance).toBe(2);
    expect("clearance" in setClearance(setClearance(c, 2), undefined)).toBe(false);
  });
});

describe("size locks", () => {
  it("toggles a size lock from the tray's current outer size", () => {
    const p = newProject();
    const t = tray({ key: "a:p0:0", w: 120.5, d: 80, h: 33.4, rotated: true });
    const on = toggleSizeLock(p, t);
    expect(on.locks).toEqual([{ kind: "size", trayKey: "a:p0:0", w: 120.5, d: 80, h: 33.4 }]);
    expect(sizeLockedKeys(on)).toEqual(new Set(["a:p0:0"]));
    expect(lockedKeys(on)).toEqual(new Set());
    expect(toggleSizeLock(on, t).locks).toEqual([]);
    expect(p.locks).toEqual([]);
  });

  it("keeps a position lock on the same tray and ignores leftovers", () => {
    const t = tray({ key: "a:p0:0" });
    const p = toggleLock(newProject(), t);
    const both = toggleSizeLock(p, t);
    expect(both.locks.map((l) => l.kind)).toEqual(["position", "size"]);
    expect(toggleSizeLock(both, t).locks.map((l) => l.kind)).toEqual(["position"]);
    const left = newProject();
    expect(toggleSizeLock(left, tray({ key: "leftover:0", part: "leftover" }))).toBe(left);
  });
});

describe("pruneDroppedLocks", () => {
  const locks: Lock[] = [
    { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false },
    { kind: "size", trayKey: "a:p0:0", w: 50, d: 40, h: 20 },
    { kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] },
  ];
  const dropped = (index: number): Notice => ({
    level: "warning",
    code: "lock.dropped",
    message: "Size lock on a:p0:0 was dropped: its contents no longer fit.",
    path: `/locks/${index}`,
  });

  it("removes exactly the locks named by lock.dropped notices", () => {
    const p: Project = { ...newProject(), locks };
    expect(pruneDroppedLocks(p, [dropped(1), dropped(2)]).locks).toEqual([locks[0]]);
  });

  it("returns the same project when nothing was dropped or the notice has no lock path", () => {
    const p: Project = { ...newProject(), locks };
    const other: Notice = { level: "warning", code: "layout.play", message: "", path: "/locks/0" };
    const noPath: Notice = { level: "warning", code: "lock.dropped", message: "" };
    expect(pruneDroppedLocks(p, [other, noPath])).toBe(p);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/app/actions.test.ts`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/actions.ts
import { newComponent } from "../model/defaults";
import { applyFitChoice, applyWallChoice } from "../model/settings";
import type { FitChoice, WallChoice } from "../model/settings";
import type {
  Box,
  CardsComponent,
  Component,
  ComponentKind,
  Lock,
  Notice,
  Printer,
  Project,
  Settings,
  TraySpec,
} from "../model/types";
import { swapLocks } from "../layout";

/** Only real trays can be locked; leftovers are regenerated and spacers follow their tray. */
export function isLockable(t: TraySpec): boolean {
  return t.part === "tray";
}

export function updateBox(p: Project, patch: Partial<Box>): Project {
  return { ...p, box: { ...p.box, ...patch } };
}

export function updatePrinter(p: Project, patch: Partial<Printer>): Project {
  return { ...p, printer: { ...p.printer, ...patch } };
}

export function renameProject(p: Project, name: string): Project {
  return { ...p, name };
}

export function addComponent(p: Project, kind: ComponentKind): Project {
  return { ...p, components: [...p.components, newComponent(kind)] };
}

export function updateComponent(p: Project, id: string, next: Component): Project {
  return { ...p, components: p.components.map((c) => (c.id === id ? next : c)) };
}

export function removeComponent(p: Project, id: string): Project {
  const prefix = `${id}:`;
  const locks = p.locks.filter((l) =>
    l.kind === "stack"
      ? !l.trayKeys.some((k) => k.startsWith(prefix))
      : !l.trayKey.startsWith(prefix),
  );
  return { ...p, components: p.components.filter((c) => c.id !== id), locks };
}

export function setWallChoice(p: Project, c: WallChoice): Project {
  return { ...p, settings: applyWallChoice(p.settings, c) };
}

export function setFitChoice(p: Project, c: FitChoice): Project {
  return { ...p, settings: applyFitChoice(p.settings, c) };
}

export function setSettings(p: Project, s: Settings): Project {
  return { ...p, settings: s };
}

function sameTarget(a: Lock, b: Lock): boolean {
  if (a.kind === "stack" || b.kind === "stack") {
    return (
      a.kind === "stack" && b.kind === "stack" && a.trayKeys.join("|") === b.trayKeys.join("|")
    );
  }
  return a.kind === b.kind && a.trayKey === b.trayKey;
}

export function setLock(p: Project, lock: Lock): Project {
  return { ...p, locks: [...p.locks.filter((l) => !sameTarget(l, lock)), lock] };
}

export function removeLock(p: Project, trayKey: string, kind?: Lock["kind"]): Project {
  const locks = p.locks.filter((l) => {
    if (kind !== undefined && l.kind !== kind) {
      return true;
    }
    return l.kind === "stack" ? !l.trayKeys.includes(trayKey) : l.trayKey !== trayKey;
  });
  return { ...p, locks };
}

export function lockedKeys(p: Project): Set<string> {
  const keys = new Set<string>();
  for (const l of p.locks) {
    if (l.kind === "position") {
      keys.add(l.trayKey);
    }
  }
  return keys;
}

export function toggleLock(p: Project, tray: TraySpec): Project {
  if (!isLockable(tray)) {
    return p;
  }
  if (lockedKeys(p).has(tray.key)) {
    return removeLock(p, tray.key, "position");
  }
  return setLock(p, {
    kind: "position",
    trayKey: tray.key,
    path: tray.path,
    rotated: tray.rotated,
  });
}

/** trayKeys with a size lock. */
export function sizeLockedKeys(p: Project): Set<string> {
  const keys = new Set<string>();
  for (const l of p.locks) {
    if (l.kind === "size") {
      keys.add(l.trayKey);
    }
  }
  return keys;
}

/** Size lock on/off: keeps the tray's current outer size (spec §5 `Lock.kind "size"`). */
export function toggleSizeLock(p: Project, tray: TraySpec): Project {
  if (!isLockable(tray)) {
    return p;
  }
  if (sizeLockedKeys(p).has(tray.key)) {
    return removeLock(p, tray.key, "size");
  }
  return setLock(p, { kind: "size", trayKey: tray.key, w: tray.w, d: tray.d, h: tray.h });
}

const DROPPED_LOCK_PATH = /^\/locks\/(\d+)$/;

/**
 * Removes the locks a run gave up (spec §7.2): plan 4's `lock.dropped` notices carry
 * `path: "/locks/<index>"` into the run's `LayoutInput.locks`, which are `p.locks`.
 * Returns `p` itself when nothing was dropped.
 */
export function pruneDroppedLocks(p: Project, notices: readonly Notice[]): Project {
  const dropped = new Set<number>();
  for (const n of notices) {
    const m = n.code === "lock.dropped" ? DROPPED_LOCK_PATH.exec(n.path ?? "") : null;
    if (m) {
      dropped.add(Number(m[1]));
    }
  }
  if (dropped.size === 0) {
    return p;
  }
  return { ...p, locks: p.locks.filter((_, i) => !dropped.has(i)) };
}

export function swapTrays(p: Project, keyA: string, keyB: string): Project {
  if (!p.layout) {
    return p;
  }
  return { ...p, locks: swapLocks(p.locks, keyA, keyB, p.layout) };
}

export function setCardSides<C extends CardsComponent>(c: C, a: number, b: number): C {
  return { ...c, shortSide: Math.min(a, b), longSide: Math.max(a, b) };
}

export function setGroup<C extends Component>(c: C, groupId: string | undefined): C {
  const next = { ...c };
  const trimmed = groupId?.trim() ?? "";
  if (trimmed === "") {
    delete next.groupId;
  } else {
    next.groupId = trimmed;
    delete next.perPlayer;
  }
  return next;
}

export function setPerPlayer<C extends Component>(c: C, players: number | undefined): C {
  const next = { ...c };
  if (players === undefined) {
    delete next.perPlayer;
  } else {
    next.perPlayer = { players };
  }
  return next;
}

export function setClearance<C extends Component>(c: C, clearance: number | undefined): C {
  const next = { ...c };
  if (clearance === undefined) {
    delete next.clearance;
  } else {
    next.clearance = clearance;
  }
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/app/actions.test.ts`
Expected: PASS (13 tests). Also run `npx tsc --noEmit`; if it reports "The operand of a 'delete' operator must be optional" in the three generic helpers, replace each `const next = { ...c };` with `const next: C & Partial<Pick<ComponentBase, "groupId" | "perPlayer" | "clearance">> = { ...c };` and add `ComponentBase` to the type import (every one of those fields is optional on `ComponentBase`, so `delete` then type-checks).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/app/actions.ts src/app/actions.test.ts
git commit -m "Add pure project edit actions"
```

---

### Task 2: Client types, test helpers and the state signals

**Files:**

- Create: `src/app/clients.ts`
- Create: `src/app/test-helpers.ts`
- Create: `src/app/state.ts`
- Test: `src/app/state.test.ts`

**Interfaces:**

- Consumes: `createLayoutClient`, `LayoutClient` (`layout/client`), `createGeometryClient`, `GeometryClient` (`geometry/client`), `summarize` (`layout`), `size` (`sizing`), `validateProject`, `inputsHash`, `parseProject`, `isOlderGeometryLine` (`geometry/version`, plan 3: spec §9's line rule, pre-1.0 each `0.MINOR` is a major line), `ProjectListEntry` (`share`), `noForeign` (`model/schema`).
- Produces:
  - re-exported types `LayoutClient` (plan 4 `layout/client.ts`) and `GeometryClient` (plan 3 `geometry/client.ts`)
  - `loadLayoutClient(): Promise<LayoutClient>`; `loadGeometryClient(): Promise<GeometryClient>` (dynamic imports → separate chunks)
  - `type Mode = "simple" | "advanced"`; `type RunKind = "edit" | "improve"`
  - `type RunState = { status: "idle" } | { status: "running"; done: number; total: number } | { status: "done" } | { status: "error"; message: string }`
  - `STALE_CODE = "layout.stale"`, `CAPPED_CODE = "layout.capped"`, `GEOMETRY_MAJOR_CODE = "geometry.olderMajor"`
  - `interface State` (signals: `project`, `foreign`, `projects`, `mode`, `run`, `lastResult`, `undoSlot`, `selection`, `appNotices`, `needsConfirm`, `conflict`; computed: `validation`, `currentHash`, `stale`, `sizingNotices`, `summary`, `layoutNotices`)
  - `createState(initial: Project, foreign?: ForeignData): State`
  - `pushNotice(state: State, n: Notice): void` (replaces a notice with the same code), `dismissNotice(state: State, code: string): void`
  - Test helpers (imported only by tests): `EMPTY_FOREIGN`, `fixtureProject()`, `withoutLayout(p)`, `makeTray(over?)`, `makeLayout(inputsHash, trays?, over?)`, `makeResult(layout, over?)`, `cubeMesh(size?)`, `stubLayoutClient()`, `flush()`. Storage in tests uses plan 1's `MemoryStorage` (`src/test-support/memory-storage.ts`, with `failOn` for quota errors) and `createProjectStore(null)` for "no storage".

- [ ] **Step 1: Write the client loaders and the test helpers**

```ts
// src/app/clients.ts
import type { GeometryClient } from "../geometry/client";
import type { LayoutClient } from "../layout/client";

export type { GeometryClient, LayoutClient };

/** Loaded on demand so the worker plumbing is a separate chunk. */
export async function loadLayoutClient(): Promise<LayoutClient> {
  const mod = await import("../layout/client");
  return mod.createLayoutClient();
}

/** Loaded on demand: the geometry worker pulls in manifold's WASM. */
export async function loadGeometryClient(): Promise<GeometryClient> {
  const mod = await import("../geometry/client");
  return mod.createGeometryClient();
}
```

```ts
// src/app/test-helpers.ts
// Shared test fixtures and stubs. Imported only from *.test.ts(x) files.
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import type { Mesh } from "../geometry/types";
import type { LayoutInput, LayoutResult } from "../layout/types";
import { noForeign, parseProject } from "../model/schema";
import type { ForeignData, Project, StoredLayout, TraySpec } from "../model/types";
import type { LayoutClient } from "./clients";

export const EMPTY_FOREIGN: ForeignData = noForeign();

export function fixtureProject(): Project {
  const r = parseProject(cardsHeavy);
  if (!r.ok) {
    throw new Error(`cards-heavy fixture failed to parse: ${r.error}`);
  }
  return withoutLayout(r.project);
}

export function withoutLayout(p: Project): Project {
  const copy = { ...p };
  delete copy.layout;
  return copy;
}

export function makeTray(over: Partial<TraySpec> = {}): TraySpec {
  return {
    key: "a:p0:0",
    part: "tray",
    path: "0",
    stack: 0,
    level: 0,
    x: 0,
    y: 0,
    z: 0,
    w: 100,
    d: 80,
    h: 40,
    rotated: false,
    wall: 1.6,
    floor: 1.2,
    lip: false,
    solid: false,
    compartments: [
      {
        x: 1.6,
        y: 1.6,
        w: 96.8,
        d: 76.8,
        floorZ: 1.2,
        kind: "well",
        contents: "Deck A ×40",
        features: [],
      },
    ],
    ...over,
  };
}

export function makeLayout(
  inputsHash: string,
  trays: TraySpec[] = [makeTray()],
  over: Partial<StoredLayout> = {},
): StoredLayout {
  return {
    createdWith: "0.1.0",
    geometryVersion: "0.1.0",
    inputsHash,
    seed: 1,
    iterations: 1000,
    capped: false,
    trays,
    ...over,
  };
}

export function makeResult(
  layout: StoredLayout | null,
  over: Partial<LayoutResult> = {},
): LayoutResult {
  return {
    layout,
    bestAttempt: null,
    summary: layout
      ? {
          fillPct: 81,
          trayCount: layout.trays.length,
          stackCount: 1,
          filamentG: 123,
          playX: 1.2,
          playY: 1.6,
        }
      : null,
    notices: [],
    ...over,
  };
}

/** Axis-aligned closed box mesh, CCW outward. */
export function cubeMesh(size: [number, number, number] = [10, 10, 10]): Mesh {
  const [w, d, h] = size;
  const positions = new Float32Array([
    0,
    0,
    0,
    w,
    0,
    0,
    w,
    d,
    0,
    0,
    d,
    0,
    0,
    0,
    h,
    w,
    0,
    h,
    w,
    d,
    h,
    0,
    d,
    h,
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0,
    4, 3, 4, 7,
  ]);
  return { positions, indices };
}

export interface RunCall {
  input: LayoutInput;
  seed: number;
  iterations: number;
  warmStart: StoredLayout | undefined;
  onProgress: (done: number, total: number, best: LayoutResult) => void;
  resolve: (r: LayoutResult) => void;
  reject: (e: Error) => void;
}

export function stubLayoutClient(): {
  client: LayoutClient;
  calls: RunCall[];
  cancelCount: () => number;
  disposed: () => boolean;
} {
  const calls: RunCall[] = [];
  let cancels = 0;
  let isDisposed = false;
  const client: LayoutClient = {
    run(input, seed, iterations, warmStart, onProgress) {
      return new Promise<LayoutResult>((resolve, reject) => {
        calls.push({ input, seed, iterations, warmStart, onProgress, resolve, reject });
      });
    },
    cancel() {
      cancels += 1;
    },
    dispose() {
      isDisposed = true;
    },
  };
  return { client, calls, cancelCount: () => cancels, disposed: () => isDisposed };
}

/** Let pending promise callbacks run (fake timers do not fake microtasks). */
export async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}
```

- [ ] **Step 2: Write the failing state test**

```ts
// src/app/state.test.ts
import { describe, expect, it } from "vitest";
import { inputsHash } from "../model/hash";
import {
  CAPPED_CODE,
  GEOMETRY_MAJOR_CODE,
  STALE_CODE,
  createState,
  dismissNotice,
  pushNotice,
} from "./state";
import { fixtureProject, makeLayout, makeResult } from "./test-helpers";

describe("createState", () => {
  it("is not stale without a layout or with a matching hash", () => {
    const p = fixtureProject();
    expect(createState(p).stale.value).toBe(false);
    const withLayout = { ...p, layout: makeLayout(inputsHash(p)) };
    expect(createState(withLayout).stale.value).toBe(false);
  });

  it("becomes stale when inputs change and reports it as a notice", () => {
    const p = fixtureProject();
    const s = createState({ ...p, layout: makeLayout(inputsHash(p)) });
    s.project.value = { ...s.project.value, box: { ...p.box, innerHeight: p.box.innerHeight + 1 } };
    expect(s.stale.value).toBe(true);
    expect(s.layoutNotices.value.map((n) => n.code)).toContain(STALE_CODE);
  });

  it("does not become stale when only the name changes", () => {
    const p = fixtureProject();
    const s = createState({ ...p, layout: makeLayout(inputsHash(p)) });
    s.project.value = { ...s.project.value, name: "Renamed" };
    expect(s.stale.value).toBe(false);
  });

  it("uses the run summary for the accepted layout and recomputes otherwise", () => {
    const p = fixtureProject();
    const layout = makeLayout(inputsHash(p));
    const s = createState({ ...p, layout });
    const result = makeResult(layout);
    s.lastResult.value = result;
    expect(s.summary.value).toBe(result.summary);
    s.lastResult.value = makeResult(makeLayout("other"));
    expect(s.summary.value).not.toBeNull();
    expect(s.summary.value).not.toBe(result.summary);
    expect(typeof s.summary.value?.trayCount).toBe("number");
  });

  it("shows run notices only for the layout they belong to, plus capped", () => {
    const p = fixtureProject();
    const layout = makeLayout(inputsHash(p), undefined, { capped: true });
    const s = createState({ ...p, layout });
    const notice = { level: "warning" as const, code: "play", message: "Play 1.8 mm on X" };
    s.lastResult.value = makeResult(makeLayout("other"), { notices: [notice] });
    expect(s.layoutNotices.value.map((n) => n.code)).not.toContain("play");
    s.lastResult.value = makeResult(layout, { notices: [notice] });
    expect(s.layoutNotices.value.map((n) => n.code)).toContain("play");
    expect(s.layoutNotices.value.map((n) => n.code)).toContain(CAPPED_CODE);
  });

  it("shows notices of an infeasible run (no layout)", () => {
    const s = createState(fixtureProject());
    const notice = { level: "error" as const, code: "doesNotFit", message: "Doesn't fit" };
    s.lastResult.value = makeResult(null, { notices: [notice] });
    expect(s.layoutNotices.value).toContainEqual(notice);
  });

  it("asks for a reprint for a layout from an older geometry line only", () => {
    const p = fixtureProject();
    const codesFor = (geometryVersion: string) =>
      createState({
        ...p,
        layout: makeLayout(inputsHash(p), undefined, { geometryVersion }),
      }).layoutNotices.value.map((n) => n.code);
    // GEOMETRY_VERSION is 0.1.1: pre-1.0 an older 0.MINOR is an older line, a PATCH is not.
    expect(codesFor("0.0.9")).toContain(GEOMETRY_MAJOR_CODE);
    expect(codesFor("0.1.4")).not.toContain(GEOMETRY_MAJOR_CODE);
    expect(codesFor("0.2.0")).not.toContain(GEOMETRY_MAJOR_CODE);
  });

  it("validates the project", () => {
    const p = fixtureProject();
    const s = createState(p);
    expect(s.validation.value.filter((n) => n.level === "error")).toEqual([]);
    s.project.value = { ...p, box: { ...p.box, innerWidth: -5 } };
    expect(s.validation.value.some((n) => n.level === "error")).toBe(true);
  });
});

describe("app notices", () => {
  it("replaces by code and dismisses", () => {
    const s = createState(fixtureProject());
    pushNotice(s, { level: "info", code: "x", message: "one" });
    pushNotice(s, { level: "info", code: "x", message: "two" });
    pushNotice(s, { level: "info", code: "y", message: "three" });
    expect(s.appNotices.value.map((n) => n.message)).toEqual(["two", "three"]);
    dismissNotice(s, "x");
    expect(s.appNotices.value.map((n) => n.code)).toEqual(["y"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/app/state.test.ts`
Expected: FAIL — `Failed to resolve import "./state"`.

- [ ] **Step 4: Write the implementation**

```ts
// src/app/state.ts
import { computed, signal } from "@preact/signals";
import type { ReadonlySignal, Signal } from "@preact/signals";
import { isOlderGeometryLine } from "../geometry/version";
import { summarize } from "../layout";
import type { LayoutResult, LayoutSummary } from "../layout/types";
import { inputsHash } from "../model/hash";
import type { ForeignData, Notice, Project, StoredLayout } from "../model/types";
import { validateProject } from "../model/validate";
import type { ProjectListEntry } from "../share";
import { size } from "../sizing";

export type Mode = "simple" | "advanced";
export type RunKind = "edit" | "improve";
export type RunState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done" }
  | { status: "error"; message: string };

export const STALE_CODE = "layout.stale";
export const CAPPED_CODE = "layout.capped";
export const GEOMETRY_MAJOR_CODE = "geometry.olderMajor";

export interface State {
  project: Signal<Project>;
  foreign: Signal<ForeignData>;
  projects: Signal<ProjectListEntry[]>;
  mode: Signal<Mode>;
  run: Signal<RunState>;
  lastResult: Signal<LayoutResult | null>;
  undoSlot: Signal<StoredLayout | null>;
  selection: Signal<string | null>;
  appNotices: Signal<Notice[]>;
  /** Newer-minor file: automatic runs are skipped, a user run asks first (spec §9). */
  needsConfirm: Signal<boolean>;
  /** Another tab saved this project; autosave is paused (persistence). */
  conflict: Signal<boolean>;
  validation: ReadonlySignal<Notice[]>;
  currentHash: ReadonlySignal<string>;
  stale: ReadonlySignal<boolean>;
  sizingNotices: ReadonlySignal<Notice[]>;
  summary: ReadonlySignal<LayoutSummary | null>;
  layoutNotices: ReadonlySignal<Notice[]>;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sizingNoticesOf(p: Project): Notice[] {
  try {
    return size(p.components, p.settings).notices;
  } catch (e) {
    return [
      {
        level: "error",
        code: "sizing.failed",
        message: `Couldn't size the components: ${errorText(e)}`,
      },
    ];
  }
}

function dedupe(list: Notice[]): Notice[] {
  const seen = new Set<string>();
  return list.filter((n) => {
    const key = `${n.code}|${n.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function createState(initial: Project, foreign: ForeignData = { components: [] }): State {
  const project = signal(initial);
  const lastResult = signal<LayoutResult | null>(null);
  const validation = computed(() => validateProject(project.value));
  const currentHash = computed(() => inputsHash(project.value));
  const stale = computed(() => {
    const layout = project.value.layout;
    return layout !== undefined && layout.inputsHash !== currentHash.value;
  });
  const sizingNotices = computed(() => sizingNoticesOf(project.value));
  const summary = computed<LayoutSummary | null>(() => {
    const p = project.value;
    const layout = p.layout;
    if (!layout) {
      return null;
    }
    const r = lastResult.value;
    if (r && r.layout === layout && r.summary) {
      return r.summary;
    }
    return summarize(layout.trays, { box: p.box, settings: p.settings });
  });
  const layoutNotices = computed<Notice[]>(() => {
    const layout = project.value.layout;
    const r = lastResult.value;
    const out: Notice[] = [];
    if (r && (r.layout === null || r.layout === layout)) {
      out.push(...r.notices);
    }
    if (layout?.capped && !out.some((n) => n.code.includes("capped"))) {
      out.push({
        level: "info",
        code: CAPPED_CODE,
        message:
          "The optimizer hit its safety time limit, so this layout may not be reproducible. Try “Improve more”.",
      });
    }
    if (stale.value) {
      out.push({
        level: "info",
        code: STALE_CODE,
        message: "Inputs changed since this layout was made — re-optimize?",
      });
    }
    // An older compatibility line: an older MAJOR, or pre-1.0 an older 0.MINOR (spec §9).
    if (layout && isOlderGeometryLine(layout.geometryVersion)) {
      out.push({
        level: "warning",
        code: GEOMETRY_MAJOR_CODE,
        message: `This layout was made with tray geometry ${layout.geometryVersion}. Trays exported now won't mate with ones printed from it: reprint the whole insert.`,
      });
    }
    out.push(...sizingNotices.value);
    return dedupe(out);
  });

  return {
    project,
    foreign: signal(foreign),
    projects: signal<ProjectListEntry[]>([]),
    mode: signal<Mode>("simple"),
    run: signal<RunState>({ status: "idle" }),
    lastResult,
    undoSlot: signal<StoredLayout | null>(null),
    selection: signal<string | null>(null),
    appNotices: signal<Notice[]>([]),
    needsConfirm: signal(false),
    conflict: signal(false),
    validation,
    currentHash,
    stale,
    sizingNotices,
    summary,
    layoutNotices,
  };
}

export function pushNotice(state: State, n: Notice): void {
  state.appNotices.value = [...state.appNotices.value.filter((x) => x.code !== n.code), n];
}

export function dismissNotice(state: State, code: string): void {
  state.appNotices.value = state.appNotices.value.filter((x) => x.code !== code);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/app/state.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
cd apps/insert-generator
git add src/app/clients.ts src/app/test-helpers.ts src/app/state.ts src/app/state.test.ts
git commit -m "Add app state signals and test helpers"
```

---

### Task 3: Optimizer runner

**Files:**

- Create: `src/app/runner.ts`
- Test: `src/app/runner.test.ts`

**Interfaces:**

- Consumes: `State`, `RunKind` (Task 2), `LayoutClient` (Task 2), `pruneDroppedLocks` (Task 1), `size` (`sizing`), `inputsHash`, `validateProject`, `APP_VERSION`, `DEFAULT_ITERATIONS` (`layout`), `LayoutInput`, `LayoutResult` (`layout/types`).
- Produces:
  - `DEBOUNCE_MS = 400`, `DEFAULT_SEED = 1`, `IMPROVE_FACTOR = 3`, `NEWER_MINOR_CONFIRM: string`, `CANCELLED_ERROR_NAME = "LayoutCancelledError"` (a cancelled/superseded run is swallowed, never shown as an error)
  - `canOptimize(p: Project): boolean` — ≥ 1 component and no error-level validation notice.
  - `buildLayoutInput(p: Project): LayoutInput`
  - `type RunTrigger = "auto" | "user"`
  - `interface RunnerDeps { loadLayoutClient: () => Promise<LayoutClient>; confirm: (message: string) => boolean }`
  - `interface RunnerHooks { onAccepted: () => void }`
  - `interface Runner { schedule(): void; runNow(kind: RunKind, trigger: RunTrigger): Promise<void>; cancel(): void; retry(): Promise<void>; afterOpen(): void; dispose(): void }`
  - `createRunner(state: State, deps: RunnerDeps, hooks: RunnerHooks): Runner`

Behaviour: `schedule()` cancels any in-flight run and (re)starts a 400 ms timer; the timer calls `runNow("edit", "auto")`. Each run takes a token; any result whose token is no longer current, or whose `inputsHash` no longer matches the project, is discarded. Accepted results go into `project.layout`, the previous layout into `undoSlot`. In the same state update, locks the run reported as `lock.dropped` are removed from `project.locks` (`pruneDroppedLocks`, Task 1), so the plan view and `inputsHash` match what was laid out; the run ignored those locks, so the accepted layout is stored under the post-prune `inputsHash` (and `lastResult` points at that stored layout, so its notices, including `lock.dropped`, stay visible). The layout therefore isn't stale and nothing re-runs. Failures set `run` to `error` and leave the layout alone. "Improve more" keeps the seed and asks for `3 × DEFAULT_ITERATIONS` more iterations with the current layout as warm start; plan 4 stores `layout.iterations + 3 × DEFAULT_ITERATIONS` in the new layout (roadmap §4.8: `iterations` is this run's budget, `StoredLayout.iterations` is cumulative).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/runner.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ITERATIONS } from "../layout";
import { inputsHash } from "../model/hash";
import type { Lock, Notice, Project } from "../model/types";
import { DEBOUNCE_MS, IMPROVE_FACTOR, canOptimize, createRunner } from "./runner";
import { createState } from "./state";
import type { State } from "./state";
import { fixtureProject, flush, makeLayout, makeResult, stubLayoutClient } from "./test-helpers";

function bumpHeight(state: State): void {
  const p = state.project.value;
  state.project.value = { ...p, box: { ...p.box, innerHeight: p.box.innerHeight + 1 } };
}

function setup(project: Project = fixtureProject(), confirm = vi.fn(() => true)) {
  const state = createState(project);
  const stub = stubLayoutClient();
  const onAccepted = vi.fn();
  const runner = createRunner(
    state,
    { loadLayoutClient: () => Promise.resolve(stub.client), confirm },
    { onAccepted },
  );
  return { state, stub, runner, onAccepted, confirm };
}

describe("runner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("five quick edits start exactly one run after the debounce", async () => {
    const { state, stub, runner } = setup();
    for (let i = 0; i < 5; i += 1) {
      bumpHeight(state);
      runner.schedule();
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(stub.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flush();
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.input.inputsHash).toBe(inputsHash(state.project.value));
  });

  it("accepts a finished run and keeps the previous layout for undo", async () => {
    const p = fixtureProject();
    const old = makeLayout("old-hash");
    const { state, stub, runner, onAccepted } = setup({ ...p, layout: old });
    void runner.runNow("edit", "user");
    await flush();
    const call = stub.calls[0];
    if (!call) {
      throw new Error("no run");
    }
    expect(call.warmStart).toBe(old);
    call.onProgress(500, 1000, makeResult(null));
    expect(state.run.value).toEqual({ status: "running", done: 500, total: 1000 });
    const next = makeLayout(call.input.inputsHash);
    call.resolve(makeResult(next));
    await flush();
    expect(state.project.value.layout).toBe(next);
    expect(state.undoSlot.value).toBe(old);
    expect(state.run.value).toEqual({ status: "done" });
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it("a result for stale inputs is discarded and the newer run is accepted", async () => {
    const { state, stub, runner } = setup();
    void runner.runNow("edit", "user");
    await flush();
    const first = stub.calls[0];
    bumpHeight(state);
    runner.schedule();
    first?.resolve(makeResult(makeLayout(first.input.inputsHash)));
    await flush();
    expect(state.project.value.layout).toBeUndefined();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flush();
    const second = stub.calls[1];
    expect(second).toBeDefined();
    const fresh = makeLayout(second?.input.inputsHash ?? "");
    second?.resolve(makeResult(fresh));
    await flush();
    expect(state.project.value.layout).toBe(fresh);
  });

  it("ignores progress and results of a cancelled run", async () => {
    const { state, stub, runner } = setup();
    void runner.runNow("edit", "user");
    await flush();
    runner.cancel();
    expect(state.run.value).toEqual({ status: "idle" });
    stub.calls[0]?.onProgress(10, 100, makeResult(null));
    stub.calls[0]?.resolve(makeResult(makeLayout(stub.calls[0].input.inputsHash)));
    await flush();
    expect(state.run.value).toEqual({ status: "idle" });
    expect(state.project.value.layout).toBeUndefined();
    expect(stub.cancelCount()).toBeGreaterThan(0);
  });

  it("keeps the last good layout on failure and retries", async () => {
    const p = fixtureProject();
    const good = makeLayout(inputsHash(p));
    const { state, stub, runner } = setup({ ...p, layout: good });
    void runner.runNow("improve", "user");
    await flush();
    stub.calls[0]?.reject(new Error("worker crashed"));
    await flush();
    expect(state.run.value).toEqual({ status: "error", message: "worker crashed" });
    expect(state.project.value.layout).toBe(good);
    void runner.retry();
    await flush();
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[1]?.iterations).toBe(IMPROVE_FACTOR * DEFAULT_ITERATIONS);
    expect(stub.calls[1]?.warmStart).toBe(good);
  });

  it("improve more runs 3N more iterations from the stored seed and layout", async () => {
    const p = fixtureProject();
    const layout = makeLayout(inputsHash(p), undefined, { seed: 7, iterations: 1234 });
    const { stub, runner } = setup({ ...p, layout });
    void runner.runNow("improve", "user");
    await flush();
    expect(stub.calls[0]?.seed).toBe(7);
    expect(stub.calls[0]?.iterations).toBe(IMPROVE_FACTOR * DEFAULT_ITERATIONS);
    expect(stub.calls[0]?.warmStart).toBe(layout);
  });

  it("removes locks a run dropped in the same update, keeps the layout fresh and doesn't re-run", async () => {
    const p = fixtureProject();
    const locks: Lock[] = [
      { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false },
      { kind: "size", trayKey: "b:p0:0", w: 50, d: 40, h: 20 },
    ];
    const { state, stub, runner, onAccepted } = setup({ ...p, locks });
    void runner.runNow("edit", "user");
    await flush();
    const call = stub.calls[0];
    if (!call) {
      throw new Error("no run");
    }
    const notice: Notice = {
      level: "warning",
      code: "lock.dropped",
      message: "Size lock on b:p0:0 was dropped: its contents no longer fit.",
      path: "/locks/1",
    };
    call.resolve(makeResult(makeLayout(call.input.inputsHash), { notices: [notice] }));
    await flush();
    expect(state.project.value.locks).toEqual([locks[0]]);
    expect(state.project.value.layout?.inputsHash).toBe(inputsHash(state.project.value));
    expect(state.stale.value).toBe(false);
    expect(state.layoutNotices.value).toContainEqual(notice);
    expect(state.layoutNotices.value.map((n) => n.code)).not.toContain("layout.stale");
    expect(onAccepted).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await flush();
    expect(stub.calls).toHaveLength(1);
  });

  it("does not run without components or with invalid inputs", async () => {
    const p = fixtureProject();
    const empty = setup({ ...p, components: [] });
    expect(canOptimize(empty.state.project.value)).toBe(false);
    void empty.runner.runNow("edit", "user");
    await flush();
    expect(empty.stub.calls).toHaveLength(0);
    const invalid = setup({ ...p, box: { ...p.box, innerWidth: 0 } });
    void invalid.runner.runNow("edit", "user");
    await flush();
    expect(invalid.stub.calls).toHaveLength(0);
  });

  it("afterOpen runs at once without a layout and never with one", async () => {
    const fresh = setup();
    fresh.runner.afterOpen();
    await flush();
    expect(fresh.stub.calls).toHaveLength(1);
    const p = fixtureProject();
    const stored = setup({ ...p, layout: makeLayout("anything") });
    stored.runner.afterOpen();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await flush();
    expect(stored.stub.calls).toHaveLength(0);
  });

  it("newer-minor projects skip automatic runs and ask before a user run", async () => {
    const confirm = vi.fn(() => false);
    const { state, stub, runner } = setup(fixtureProject(), confirm);
    state.needsConfirm.value = true;
    void runner.runNow("edit", "auto");
    await flush();
    expect(confirm).not.toHaveBeenCalled();
    void runner.runNow("edit", "user");
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(stub.calls).toHaveLength(0);
    confirm.mockReturnValue(true);
    void runner.runNow("edit", "user");
    await flush();
    expect(stub.calls).toHaveLength(1);
    expect(state.needsConfirm.value).toBe(false);
  });

  it("an infeasible result keeps the layout and is not undoable", async () => {
    const p = fixtureProject();
    const good = makeLayout(inputsHash(p));
    const { state, stub, runner, onAccepted } = setup({ ...p, layout: good });
    void runner.runNow("edit", "user");
    await flush();
    stub.calls[0]?.resolve(makeResult(null));
    await flush();
    expect(state.project.value.layout).toBe(good);
    expect(state.undoSlot.value).toBeNull();
    expect(onAccepted).not.toHaveBeenCalled();
    expect(state.lastResult.value?.layout).toBeNull();
  });

  it("treats a LayoutCancelledError as a quiet cancel, not a failure", async () => {
    const { state, stub, runner } = setup();
    void runner.runNow("edit", "user");
    await flush();
    const cancelled = new Error("Layout run cancelled");
    cancelled.name = "LayoutCancelledError";
    stub.calls[0]?.reject(cancelled);
    await flush();
    expect(state.run.value).toEqual({ status: "idle" });
  });

  it("surfaces a failing client loader as a run error", async () => {
    const state = createState(fixtureProject());
    const runner = createRunner(
      state,
      { loadLayoutClient: () => Promise.reject(new Error("no worker")), confirm: () => true },
      { onAccepted: vi.fn() },
    );
    void runner.runNow("edit", "user");
    await flush();
    expect(state.run.value).toEqual({ status: "error", message: "no worker" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/app/runner.test.ts`
Expected: FAIL — `Failed to resolve import "./runner"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/runner.ts
import { batch } from "@preact/signals";
import { DEFAULT_ITERATIONS } from "../layout";
import type { LayoutInput, LayoutResult } from "../layout/types";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import { validateProject } from "../model/validate";
import { APP_VERSION } from "../model/version";
import { size } from "../sizing";
import { pruneDroppedLocks } from "./actions";
import type { LayoutClient } from "./clients";
import type { RunKind, State } from "./state";

export const DEBOUNCE_MS = 400;
export const DEFAULT_SEED = 1;
export const IMPROVE_FACTOR = 3;
export const NEWER_MINOR_CONFIRM =
  "This project was made with a newer app version. Re-optimizing replaces its stored layout and may drop parts this version doesn't understand. Continue?";

export type RunTrigger = "auto" | "user";

/** `LayoutCancelledError.name` (plan 4 `layout/client.ts`); matched by name so this module
 * doesn't import the client statically (it is loaded lazily). */
export const CANCELLED_ERROR_NAME = "LayoutCancelledError";

export interface RunnerDeps {
  loadLayoutClient: () => Promise<LayoutClient>;
  confirm: (message: string) => boolean;
}

export interface RunnerHooks {
  onAccepted: () => void;
}

export interface Runner {
  schedule(): void;
  runNow(kind: RunKind, trigger: RunTrigger): Promise<void>;
  cancel(): void;
  retry(): Promise<void>;
  afterOpen(): void;
  dispose(): void;
}

export function canOptimize(p: Project): boolean {
  return p.components.length > 0 && !validateProject(p).some((n) => n.level === "error");
}

export function buildLayoutInput(p: Project): LayoutInput {
  const { requirements } = size(p.components, p.settings);
  return {
    requirements,
    box: p.box,
    printer: p.printer,
    settings: p.settings,
    locks: p.locks,
    inputsHash: inputsHash(p),
    appVersion: APP_VERSION,
  };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function createRunner(state: State, deps: RunnerDeps, hooks: RunnerHooks): Runner {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let token = 0;
  let lastKind: RunKind = "edit";
  let clientPromise: Promise<LayoutClient> | null = null;
  let client: LayoutClient | null = null;

  function getClient(): Promise<LayoutClient> {
    if (!clientPromise) {
      const loading = deps.loadLayoutClient().then((c) => {
        client = c;
        return c;
      });
      loading.catch(() => {
        clientPromise = null;
      });
      clientPromise = loading;
    }
    return clientPromise;
  }

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  /** Make every in-flight run stale and ask the worker to stop it. */
  function invalidate(): void {
    token += 1;
    if (client) {
      client.cancel();
    }
  }

  function accept(result: LayoutResult): void {
    const current = state.project.value;
    // Locks the run dropped leave the project in the same update, so the plan view and the
    // inputs hash match what was laid out. The layout ignored them, so it is valid for the
    // pruned inputs: it is stored under the post-prune hash, so it doesn't look stale and
    // nothing re-runs. lastResult keeps pointing at the stored layout (its notices stay shown).
    const pruned = pruneDroppedLocks(current, result.notices);
    const accepted: LayoutResult =
      pruned !== current && result.layout
        ? { ...result, layout: { ...result.layout, inputsHash: inputsHash(pruned) } }
        : result;
    batch(() => {
      state.lastResult.value = accepted;
      if (accepted.layout) {
        state.undoSlot.value = current.layout ?? null;
        state.project.value = { ...pruned, layout: accepted.layout };
      } else if (pruned !== current) {
        state.project.value = pruned;
      }
      state.run.value = { status: "done" };
    });
    if (accepted.layout || pruned !== current) {
      hooks.onAccepted();
    }
  }

  async function runNow(kind: RunKind, trigger: RunTrigger): Promise<void> {
    clearTimer();
    const p = state.project.value;
    if (!canOptimize(p)) {
      invalidate();
      state.run.value = { status: "idle" };
      return;
    }
    if (state.needsConfirm.value) {
      if (trigger === "auto" || !deps.confirm(NEWER_MINOR_CONFIRM)) {
        return;
      }
      state.needsConfirm.value = false;
    }
    invalidate();
    const my = token;
    lastKind = kind;
    const previous = p.layout;
    const seed = previous?.seed ?? DEFAULT_SEED;
    // This run's budget. With the stored layout as warm start the layout engine continues
    // from it and stores previous.iterations + this budget (spec §7.2 "improve more adds 3N").
    const iterations =
      kind === "improve" && previous ? IMPROVE_FACTOR * DEFAULT_ITERATIONS : DEFAULT_ITERATIONS;
    state.run.value = { status: "running", done: 0, total: iterations };
    try {
      const input = buildLayoutInput(p);
      const c = await getClient();
      if (my !== token) {
        return;
      }
      const result = await c.run(input, seed, iterations, previous, (done, total) => {
        if (my === token) {
          state.run.value = { status: "running", done, total };
        }
      });
      if (my !== token) {
        return;
      }
      if (inputsHash(state.project.value) !== input.inputsHash) {
        state.run.value = { status: "idle" };
        return;
      }
      accept(result);
    } catch (e) {
      if (my !== token) {
        return;
      }
      if (e instanceof Error && e.name === CANCELLED_ERROR_NAME) {
        state.run.value = { status: "idle" };
        return;
      }
      state.run.value = { status: "error", message: errorText(e) };
    }
  }

  return {
    schedule() {
      clearTimer();
      invalidate();
      if (state.run.value.status === "running") {
        state.run.value = { status: "idle" };
      }
      timer = setTimeout(() => {
        timer = undefined;
        void runNow("edit", "auto");
      }, DEBOUNCE_MS);
    },
    runNow,
    cancel() {
      clearTimer();
      invalidate();
      state.run.value = { status: "idle" };
    },
    retry() {
      return runNow(lastKind, "user");
    },
    afterOpen() {
      clearTimer();
      invalidate();
      if (!state.project.value.layout) {
        void runNow("edit", "auto");
      }
    },
    dispose() {
      clearTimer();
      invalidate();
      client?.dispose();
      client = null;
      clientPromise = null;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/app/runner.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/app/runner.ts src/app/runner.test.ts
git commit -m "Add debounced optimizer runner with stale-result guard"
```

---

### Task 4: Persistence, startup and sharing

**Files:**

- Create: `src/app/persistence.ts`
- Test: `src/app/persistence.test.ts`

**Interfaces:**

- Consumes: `State`, `pushNotice`, `dismissNotice` (Task 2); `newProject` (`model/defaults`), `newId` (`model/ids`), `serializeProject`, `noForeign`, `SCHEMA_NOTICE_CODES` (`model/schema`); `decodeHash`, `encodeHash`, `importJsonText`, `createProjectStore(storage?: Storage | null)`, `ProjectStore`, `StoreWriteError` (`share`); `MemoryStorage` (`test-support/memory-storage`, tests only).
- Produces:
  - `SAVE_DEBOUNCE_MS = 500`; notice codes `STORAGE_UNAVAILABLE_CODE = "storage.unavailable"`, `CONFLICT_CODE = "storage.conflict"`, `OPEN_FAILED_CODE = "open.failed"`, `SAVE_FAILED_CODE = "storage.saveFailed"` (parse notice codes such as `schema.newerMinor` come from plan 1's `SCHEMA_NOTICE_CODES`, never redeclared here)
  - `type OpenSource = "link" | "file"`; `type ConflictChoice = "keepMine" | "loadTheirs"`
  - `interface PersistenceDeps { projectStore: ProjectStore; replaceHash: (hash: string) => void; confirm: (message: string) => boolean }`
  - `interface PersistenceHooks { onClosing: () => void; onOpened: () => void }`
  - `interface Persistence { scheduleSave(): void; flush(): void; start(hash: string): void; openFromHash(hash: string): boolean; openParsed(result: ParseResult, source: OpenSource): boolean; openProject(id: string): void; newProject(): void; deleteProject(id: string): void; importJson(text: string): boolean; onExternalChange(): void; resolveConflict(choice: ConflictChoice): void; dispose(): void }`
  - `createPersistence(state: State, deps: PersistenceDeps, hooks: PersistenceHooks): Persistence`

Rules implemented (spec §8.4, §9, §10): startup order hash → most recent stored project → `newProject()`; a link or file is added as its own project — if its id exists with different content it becomes a copy with a new id, never an overwrite; failed opens keep the current project and show the reason; newer-minor files set `needsConfirm`; foreign components are reported by plan 1's per-component `schema.foreignComponent` warnings ("kept but not laid out"), shown with the other parse notices; saves are debounced, write the URL hash with `replaceHash`, turn a thrown `StoreWriteError` (quota, blocked write — the store has already restored its previous state) into an "Autosave failed" warning that clears on the next successful save, and pause with a conflict notice if another tab saved the same id since we last saw it; storage unavailable → notice, everything else works.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/persistence.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import { SCHEMA_NOTICE_CODES } from "../model/schema";
import { createProjectStore, encodeHash } from "../share";
import type { ProjectStore } from "../share";
import {
  CONFLICT_CODE,
  OPEN_FAILED_CODE,
  SAVE_DEBOUNCE_MS,
  SAVE_FAILED_CODE,
  STORAGE_UNAVAILABLE_CODE,
  createPersistence,
} from "./persistence";
import { createState } from "./state";
import { MemoryStorage } from "../test-support/memory-storage";
import { EMPTY_FOREIGN, fixtureProject, makeLayout } from "./test-helpers";

function tab(projectStore: ProjectStore, confirm = vi.fn(() => true)) {
  const state = createState(fixtureProject());
  const replaceHash = vi.fn<(hash: string) => void>();
  const hooks = { onClosing: vi.fn(), onOpened: vi.fn() };
  const persistence = createPersistence(state, { projectStore, replaceHash, confirm }, hooks);
  return { state, persistence, replaceHash, hooks, confirm };
}

function rename(state: ReturnType<typeof createState>, name: string): void {
  state.project.value = { ...state.project.value, name };
}

describe("persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts a fresh project when there is no hash and nothing stored", () => {
    const store = createProjectStore(new MemoryStorage());
    const t = tab(store);
    t.persistence.start("");
    expect(t.state.project.value.components).toEqual([]);
    expect(store.list().map((e) => e.id)).toEqual([t.state.project.value.id]);
    expect(t.replaceHash).toHaveBeenLastCalledWith(expect.stringMatching(/^#1\./));
    expect(t.hooks.onOpened).toHaveBeenCalledTimes(1);
  });

  it("opens a shared link with its stored layout", () => {
    const store = createProjectStore(new MemoryStorage());
    const p = fixtureProject();
    const shared: Project = { ...p, layout: makeLayout(inputsHash(p)) };
    const t = tab(store);
    t.persistence.start(encodeHash(shared, EMPTY_FOREIGN));
    expect(t.state.project.value.id).toBe(p.id);
    expect(t.state.project.value.layout?.inputsHash).toBe(inputsHash(p));
    expect(store.load(p.id)?.ok).toBe(true);
  });

  it("falls back to the most recent project and reports a corrupt link", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = fixtureProject();
    store.save(a, EMPTY_FOREIGN);
    const t = tab(store);
    t.persistence.start("#1.this-is-not-a-valid-payload");
    expect(t.state.project.value.id).toBe(a.id);
    expect(t.state.appNotices.value.map((n) => n.code)).toContain(OPEN_FAILED_CODE);
  });

  it("link with an existing id and different content opens as a copy", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = fixtureProject();
    store.save(a, EMPTY_FOREIGN);
    const changed: Project = {
      ...a,
      name: "Shared",
      box: { ...a.box, innerWidth: a.box.innerWidth - 10 },
    };
    const t = tab(store);
    t.persistence.start(encodeHash(changed, EMPTY_FOREIGN));
    expect(t.state.project.value.id).not.toBe(a.id);
    expect(t.state.project.value.name).toBe("Shared (copy)");
    const original = store.load(a.id);
    expect(original?.ok && original.project.box.innerWidth).toBe(a.box.innerWidth);
    expect(store.list()).toHaveLength(2);
  });

  it("a link identical to the stored project just opens it", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = fixtureProject();
    store.save(a, EMPTY_FOREIGN);
    const t = tab(store);
    t.persistence.start(encodeHash(a, EMPTY_FOREIGN));
    expect(t.state.project.value.id).toBe(a.id);
    expect(store.list()).toHaveLength(1);
  });

  it("external save pauses autosave until the user chooses", () => {
    const shared = new MemoryStorage();
    const tab1 = tab(createProjectStore(shared));
    tab1.persistence.start("");
    const id = tab1.state.project.value.id;
    vi.advanceTimersByTime(1000);

    const tab2 = tab(createProjectStore(shared));
    tab2.persistence.start("");
    expect(tab2.state.project.value.id).toBe(id);
    vi.advanceTimersByTime(1000);
    rename(tab2.state, "From tab 2");
    tab2.persistence.flush();

    tab1.persistence.onExternalChange();
    expect(tab1.state.conflict.value).toBe(true);
    expect(tab1.state.appNotices.value.map((n) => n.code)).toContain(CONFLICT_CODE);
    rename(tab1.state, "From tab 1");
    tab1.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    const reader = createProjectStore(shared);
    const afterPause = reader.load(id);
    expect(afterPause?.ok && afterPause.project.name).toBe("From tab 2");

    tab1.persistence.resolveConflict("keepMine");
    const afterKeep = reader.load(id);
    expect(afterKeep?.ok && afterKeep.project.name).toBe("From tab 1");
    expect(tab1.state.conflict.value).toBe(false);
  });

  it("loading the other tab's version replaces the in-memory project", () => {
    const shared = new MemoryStorage();
    const tab1 = tab(createProjectStore(shared));
    tab1.persistence.start("");
    vi.advanceTimersByTime(1000);
    const tab2 = tab(createProjectStore(shared));
    tab2.persistence.start("");
    vi.advanceTimersByTime(1000);
    rename(tab2.state, "Theirs");
    tab2.persistence.flush();
    tab1.persistence.onExternalChange();
    tab1.persistence.resolveConflict("loadTheirs");
    expect(tab1.state.project.value.name).toBe("Theirs");
    expect(tab1.state.conflict.value).toBe(false);
  });

  it("shows an autosave-failed notice when the browser refuses the write", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const t = tab(store);
    t.persistence.start("");
    const id = t.state.project.value.id;
    storage.failOn = () => true;
    rename(t.state, "Too big to store");
    t.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    const notice = t.state.appNotices.value.find((n) => n.code === SAVE_FAILED_CODE);
    expect(notice?.message).toMatch(/^Autosave failed/);
    expect(t.state.project.value.name).toBe("Too big to store");
    const kept = store.load(id);
    expect(kept?.ok && kept.project.name).not.toBe("Too big to store");
    storage.failOn = () => false;
    t.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(t.state.appNotices.value.map((n) => n.code)).not.toContain(SAVE_FAILED_CODE);
    const saved = store.load(id);
    expect(saved?.ok && saved.project.name).toBe("Too big to store");
  });

  it("keeps working without storage", () => {
    const store = createProjectStore(null);
    expect(store.available).toBe(false);
    const t = tab(store);
    t.persistence.start("");
    expect(t.state.appNotices.value.map((n) => n.code)).toContain(STORAGE_UNAVAILABLE_CODE);
    rename(t.state, "Offline");
    t.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(t.replaceHash).toHaveBeenCalledTimes(2);
    expect(t.state.projects.value).toEqual([]);
  });

  it("debounces autosave and updates the URL hash", () => {
    const store = createProjectStore(new MemoryStorage());
    const t = tab(store);
    t.persistence.start("");
    const before = t.replaceHash.mock.calls.length;
    rename(t.state, "Typing");
    t.persistence.scheduleSave();
    t.persistence.scheduleSave();
    t.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    expect(t.replaceHash.mock.calls.length).toBe(before);
    vi.advanceTimersByTime(1);
    expect(t.replaceHash.mock.calls.length).toBe(before + 1);
    expect(store.list()[0]?.name).toBe("Typing");
  });

  it("deletes the current project after confirmation and opens the next", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = fixtureProject();
    store.save(a, EMPTY_FOREIGN);
    vi.advanceTimersByTime(1000);
    const t = tab(store);
    t.persistence.start("");
    t.persistence.newProject();
    const fresh = t.state.project.value.id;
    t.confirm.mockReturnValueOnce(false);
    t.persistence.deleteProject(fresh);
    expect(store.list()).toHaveLength(2);
    t.persistence.deleteProject(fresh);
    expect(store.list().map((e) => e.id)).toEqual([a.id]);
    expect(t.state.project.value.id).toBe(a.id);
  });

  it("imports JSON as a project and keeps the current one on bad input", () => {
    const store = createProjectStore(new MemoryStorage());
    const t = tab(store);
    t.persistence.start("");
    const current = t.state.project.value.id;
    expect(t.persistence.importJson("{ not json")).toBe(false);
    expect(t.state.project.value.id).toBe(current);
    expect(t.state.appNotices.value.map((n) => n.code)).toContain(OPEN_FAILED_CODE);
    const other = fixtureProject();
    expect(t.persistence.importJson(JSON.stringify(other))).toBe(true);
    expect(t.state.project.value.id).toBe(other.id);
  });

  it("flags newer-minor files and kept foreign components", () => {
    const store = createProjectStore(new MemoryStorage());
    const t = tab(store);
    t.persistence.start("");
    const p = fixtureProject();
    t.persistence.openParsed(
      {
        ok: true,
        project: p,
        foreign: { components: [{ index: 0, raw: { kind: "dice", id: "zz" } }] },
        notices: [
          {
            level: "warning",
            code: SCHEMA_NOTICE_CODES.newerMinor,
            message: "Made with app 0.2.0",
          },
          {
            level: "warning",
            code: SCHEMA_NOTICE_CODES.foreignComponent,
            path: "/components/0",
            message: "Component 1 in the file uses features this app version doesn't know.",
          },
        ],
      },
      "file",
    );
    expect(t.state.needsConfirm.value).toBe(true);
    const codes = t.state.appNotices.value.map((n) => n.code);
    expect(codes).toContain(SCHEMA_NOTICE_CODES.newerMinor);
    expect(codes).toContain(SCHEMA_NOTICE_CODES.foreignComponent);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/app/persistence.test.ts`
Expected: FAIL — `Failed to resolve import "./persistence"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/persistence.ts
import { batch } from "@preact/signals";
import { newProject as makeNewProject } from "../model/defaults";
import { newId } from "../model/ids";
import { SCHEMA_NOTICE_CODES, noForeign, serializeProject } from "../model/schema";
import type { ForeignData, Notice, ParseResult, Project } from "../model/types";
import { StoreWriteError, decodeHash, encodeHash, importJsonText } from "../share";
import type { ProjectStore } from "../share";
import { dismissNotice, pushNotice } from "./state";
import type { State } from "./state";

export const SAVE_DEBOUNCE_MS = 500;
export const STORAGE_UNAVAILABLE_CODE = "storage.unavailable";
export const CONFLICT_CODE = "storage.conflict";
export const OPEN_FAILED_CODE = "open.failed";
export const SAVE_FAILED_CODE = "storage.saveFailed";

export type OpenSource = "link" | "file";
export type ConflictChoice = "keepMine" | "loadTheirs";

export interface PersistenceDeps {
  projectStore: ProjectStore;
  replaceHash: (hash: string) => void;
  confirm: (message: string) => boolean;
}

export interface PersistenceHooks {
  onClosing: () => void;
  onOpened: () => void;
}

export interface Persistence {
  scheduleSave(): void;
  flush(): void;
  start(hash: string): void;
  openFromHash(hash: string): boolean;
  openParsed(result: ParseResult, source: OpenSource): boolean;
  openProject(id: string): void;
  newProject(): void;
  deleteProject(id: string): void;
  importJson(text: string): boolean;
  onExternalChange(): void;
  resolveConflict(choice: ConflictChoice): void;
  dispose(): void;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isEmptyHash(hash: string): boolean {
  return hash === "" || hash === "#";
}

export function createPersistence(
  state: State,
  deps: PersistenceDeps,
  hooks: PersistenceHooks,
): Persistence {
  const store = deps.projectStore;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let knownUpdatedAt: number | null = null;
  let written = "";
  let active = false;

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function entryOf(id: string) {
    return store.available ? store.list().find((e) => e.id === id) : undefined;
  }

  function refreshList(): void {
    state.projects.value = store.available
      ? [...store.list()].sort((a, b) => b.updatedAt - a.updatedAt)
      : [];
  }

  function writeHash(): void {
    const hash = encodeHash(state.project.value, state.foreign.value);
    written = hash;
    deps.replaceHash(hash);
  }

  function changedElsewhere(id: string): boolean {
    const entry = entryOf(id);
    return entry !== undefined && knownUpdatedAt !== null && entry.updatedAt !== knownUpdatedAt;
  }

  function markConflict(): void {
    state.conflict.value = true;
    pushNotice(state, {
      level: "warning",
      code: CONFLICT_CODE,
      message:
        "This project was changed in another tab. Autosave is paused here until you choose which version to keep.",
    });
  }

  function flush(): void {
    clearTimer();
    if (!active) {
      return;
    }
    writeHash();
    if (!store.available || state.conflict.value) {
      return;
    }
    const p = state.project.value;
    if (changedElsewhere(p.id)) {
      markConflict();
      return;
    }
    try {
      store.save(p, state.foreign.value);
    } catch (e) {
      const reason =
        e instanceof StoreWriteError
          ? "the browser refused to store it (storage may be full)"
          : errorText(e);
      pushNotice(state, {
        level: "warning",
        code: SAVE_FAILED_CODE,
        message: `Autosave failed: ${reason}. Your work is still open here; use Export JSON or Copy link to keep it.`,
      });
      return;
    }
    dismissNotice(state, SAVE_FAILED_CODE);
    knownUpdatedAt = entryOf(p.id)?.updatedAt ?? null;
    refreshList();
  }

  function setCurrent(project: Project, foreign: ForeignData, notices: Notice[]): void {
    flush();
    hooks.onClosing();
    const kept = state.appNotices.value.filter((n) => n.code === STORAGE_UNAVAILABLE_CODE);
    batch(() => {
      state.project.value = project;
      state.foreign.value = foreign;
      state.undoSlot.value = null;
      state.lastResult.value = null;
      state.selection.value = null;
      state.run.value = { status: "idle" };
      state.conflict.value = false;
      state.needsConfirm.value =
        foreign.components.length > 0 ||
        notices.some((n) => n.code === SCHEMA_NOTICE_CODES.newerMinor);
      // Parse notices include one schema.foreignComponent warning per kept component.
      state.appNotices.value = [...kept, ...notices];
    });
    active = true;
    knownUpdatedAt = entryOf(project.id)?.updatedAt ?? null;
    flush();
    hooks.onOpened();
  }

  function openParsed(result: ParseResult, source: OpenSource): boolean {
    if (!result.ok) {
      pushNotice(state, {
        level: "error",
        code: OPEN_FAILED_CODE,
        message: `Couldn't open this ${source}: ${result.error} Your current project is unchanged.`,
      });
      return false;
    }
    let project = result.project;
    const existing = store.available ? store.load(project.id) : null;
    if (existing && existing.ok) {
      const same =
        serializeProject(existing.project, existing.foreign) ===
        serializeProject(project, result.foreign);
      if (!same) {
        project = { ...project, id: newId(), name: `${project.name} (copy)` };
      }
    }
    setCurrent(project, result.foreign, result.notices);
    return true;
  }

  function openStoredOrNew(): void {
    const last = state.projects.value[0];
    const loaded = last && store.available ? store.load(last.id) : null;
    if (loaded && loaded.ok) {
      setCurrent(loaded.project, loaded.foreign, loaded.notices);
    } else {
      setCurrent(makeNewProject(), noForeign(), []);
    }
  }

  return {
    scheduleSave() {
      if (!active) {
        return;
      }
      clearTimer();
      timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    flush,
    start(hash) {
      if (!store.available) {
        pushNotice(state, {
          level: "info",
          code: STORAGE_UNAVAILABLE_CODE,
          message:
            "Local storage is unavailable, so autosave and the project list are off. Use Copy link or Export JSON to keep your work.",
        });
      }
      refreshList();
      const parsed = isEmptyHash(hash) ? null : decodeHash(hash);
      if (parsed && parsed.ok) {
        openParsed(parsed, "link");
        return;
      }
      openStoredOrNew();
      if (parsed) {
        openParsed(parsed, "link");
      }
    },
    openFromHash(hash) {
      if (isEmptyHash(hash) || hash === written) {
        return false;
      }
      return openParsed(decodeHash(hash), "link");
    },
    openParsed,
    openProject(id) {
      if (id === state.project.value.id) {
        return;
      }
      const r = store.available ? store.load(id) : null;
      if (!r) {
        pushNotice(state, {
          level: "error",
          code: OPEN_FAILED_CODE,
          message: "That project is no longer in this browser's list.",
        });
        refreshList();
        return;
      }
      if (!r.ok) {
        pushNotice(state, {
          level: "error",
          code: OPEN_FAILED_CODE,
          message: `Couldn't open that project: ${r.error}`,
        });
        return;
      }
      setCurrent(r.project, r.foreign, r.notices);
    },
    newProject() {
      setCurrent(makeNewProject(), noForeign(), []);
    },
    deleteProject(id) {
      const name = state.projects.value.find((e) => e.id === id)?.name ?? "this project";
      if (!deps.confirm(`Delete “${name}” from this browser? This can't be undone.`)) {
        return;
      }
      const wasCurrent = id === state.project.value.id;
      if (wasCurrent) {
        clearTimer();
        active = false;
      }
      try {
        store.remove(id);
      } catch (e) {
        pushNotice(state, {
          level: "warning",
          code: SAVE_FAILED_CODE,
          message: `Couldn't delete the project (${errorText(e)}).`,
        });
      }
      refreshList();
      if (wasCurrent) {
        openStoredOrNew();
      }
    },
    importJson(text) {
      return openParsed(importJsonText(text), "file");
    },
    onExternalChange() {
      refreshList();
      if (active && !state.conflict.value && changedElsewhere(state.project.value.id)) {
        markConflict();
      }
    },
    resolveConflict(choice) {
      const id = state.project.value.id;
      state.conflict.value = false;
      dismissNotice(state, CONFLICT_CODE);
      if (choice === "keepMine") {
        knownUpdatedAt = entryOf(id)?.updatedAt ?? null;
        flush();
        return;
      }
      const r = store.available ? store.load(id) : null;
      if (r && r.ok) {
        active = false;
        setCurrent(r.project, r.foreign, r.notices);
      }
    },
    dispose() {
      clearTimer();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/app/persistence.test.ts`
Expected: PASS (13 tests). (The conflict tests rely on plan 1's store stamping `updatedAt` with `Date.now()`, which fake timers advance.)

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/app/persistence.ts src/app/persistence.test.ts
git commit -m "Add project persistence, startup and link handling"
```

---

### Task 5: App store composition and window wiring

**Files:**

- Create: `src/app/store.ts`
- Test: `src/app/store.test.ts`

**Interfaces:**

- Consumes: `createState`, `pushNotice`, `dismissNotice` (Task 2), `createRunner` (Task 3), `createPersistence`, `ConflictChoice` (Task 4), `newProject` (`model/defaults`), `ProjectStore` (`share`), `LayoutClient` (Task 2).
- Produces:
  - `interface AppDeps { projectStore: ProjectStore; loadLayoutClient: () => Promise<LayoutClient>; replaceHash: (hash: string) => void; confirm: (message: string) => boolean }`
  - `interface AppStore { state: State; storageAvailable: boolean; edit(fn: (p: Project) => Project): void; undo(): void; reoptimize(): void; improveMore(): void; cancelRun(): void; retry(): void; start(hash: string): void; openFromHash(hash: string): void; openProject(id: string): void; newProject(): void; deleteProject(id: string): void; importJson(text: string): boolean; pushNotice(n: Notice): void; dismissNotice(code: string): void; resolveConflict(choice: ConflictChoice): void; onExternalChange(): void; flushSave(): void; dispose(): void }`
  - `createAppStore(deps: AppDeps): AppStore`
  - `connectWindow(store: AppStore, win: Window): () => void` — `storage` → `onExternalChange`, `hashchange` → `openFromHash(location.hash)`, `pagehide` → `flushSave`.

`edit()` always schedules an autosave and schedules an optimizer run only when `inputsHash` changed.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/store.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renameProject, updateBox } from "./actions";
import { inputsHash } from "../model/hash";
import { createProjectStore, encodeHash } from "../share";
import { DEBOUNCE_MS } from "./runner";
import { SAVE_DEBOUNCE_MS } from "./persistence";
import { connectWindow, createAppStore } from "./store";
import { MemoryStorage } from "../test-support/memory-storage";
import {
  EMPTY_FOREIGN,
  fixtureProject,
  flush,
  makeLayout,
  makeResult,
  stubLayoutClient,
  withoutLayout,
} from "./test-helpers";

function setup() {
  const stub = stubLayoutClient();
  const projectStore = createProjectStore(new MemoryStorage());
  const store = createAppStore({
    projectStore,
    loadLayoutClient: () => Promise.resolve(stub.client),
    replaceHash: vi.fn(),
    confirm: () => true,
  });
  return { store, stub, projectStore };
}

describe("app store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never re-optimizes on load when a layout is stored, even if stale", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    store.start(encodeHash({ ...p, layout: makeLayout("not-the-current-hash") }, EMPTY_FOREIGN));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3);
    await flush();
    expect(stub.calls).toHaveLength(0);
    expect(store.state.stale.value).toBe(true);
  });

  it("optimizes a project without a layout right after loading", async () => {
    const { store, stub } = setup();
    store.start(encodeHash(withoutLayout(fixtureProject()), EMPTY_FOREIGN));
    await flush();
    expect(stub.calls).toHaveLength(1);
  });

  it("renaming saves but does not re-optimize", async () => {
    const { store, stub, projectStore } = setup();
    const p = fixtureProject();
    store.start(encodeHash({ ...p, layout: makeLayout(inputsHash(p)) }, EMPTY_FOREIGN));
    store.edit((q) => renameProject(q, "Renamed"));
    await vi.advanceTimersByTimeAsync(Math.max(DEBOUNCE_MS, SAVE_DEBOUNCE_MS) * 2);
    await flush();
    expect(stub.calls).toHaveLength(0);
    expect(projectStore.list().find((e) => e.id === p.id)?.name).toBe("Renamed");
  });

  it("re-optimizes after an input edit and undo restores the previous layout", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    const first = makeLayout(inputsHash(p));
    store.start(encodeHash({ ...p, layout: first }, EMPTY_FOREIGN));
    const loaded = store.state.project.value.layout;
    store.edit((q) => updateBox(q, { innerHeight: q.box.innerHeight + 2 }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flush();
    const call = stub.calls[0];
    expect(call?.warmStart).toEqual(loaded);
    const next = makeLayout(call?.input.inputsHash ?? "");
    call?.resolve(makeResult(next));
    await flush();
    expect(store.state.project.value.layout).toBe(next);
    store.undo();
    expect(store.state.project.value.layout).toEqual(first);
    expect(store.state.undoSlot.value).toBeNull();
    expect(store.state.stale.value).toBe(true);
  });

  it("opens a pasted link on hashchange and flushes on pagehide", () => {
    const { store, projectStore } = setup();
    store.start("");
    const other = fixtureProject();
    const win = Object.assign(new EventTarget(), { location: { hash: "" } });
    const disconnect = connectWindow(store, win as unknown as Window);
    win.location.hash = encodeHash(other, EMPTY_FOREIGN);
    win.dispatchEvent(new Event("hashchange"));
    expect(store.state.project.value.id).toBe(other.id);
    store.edit((q) => renameProject(q, "Before leaving"));
    win.dispatchEvent(new Event("pagehide"));
    expect(projectStore.list().find((e) => e.id === other.id)?.name).toBe("Before leaving");
    disconnect();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/app/store.test.ts`
Expected: FAIL — `Failed to resolve import "./store"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/store.ts
import { batch } from "@preact/signals";
import { newProject } from "../model/defaults";
import type { Notice, Project } from "../model/types";
import type { ProjectStore } from "../share";
import type { LayoutClient } from "./clients";
import { createPersistence } from "./persistence";
import type { ConflictChoice } from "./persistence";
import { createRunner } from "./runner";
import { createState, dismissNotice, pushNotice } from "./state";
import type { State } from "./state";

export interface AppDeps {
  projectStore: ProjectStore;
  loadLayoutClient: () => Promise<LayoutClient>;
  replaceHash: (hash: string) => void;
  confirm: (message: string) => boolean;
}

export interface AppStore {
  state: State;
  storageAvailable: boolean;
  edit(fn: (p: Project) => Project): void;
  undo(): void;
  reoptimize(): void;
  improveMore(): void;
  cancelRun(): void;
  retry(): void;
  start(hash: string): void;
  openFromHash(hash: string): void;
  openProject(id: string): void;
  newProject(): void;
  deleteProject(id: string): void;
  importJson(text: string): boolean;
  pushNotice(n: Notice): void;
  dismissNotice(code: string): void;
  resolveConflict(choice: ConflictChoice): void;
  onExternalChange(): void;
  flushSave(): void;
  dispose(): void;
}

export function createAppStore(deps: AppDeps): AppStore {
  const state = createState(newProject());
  const runner = createRunner(
    state,
    { loadLayoutClient: deps.loadLayoutClient, confirm: deps.confirm },
    { onAccepted: () => persistence.scheduleSave() },
  );
  const persistence = createPersistence(
    state,
    { projectStore: deps.projectStore, replaceHash: deps.replaceHash, confirm: deps.confirm },
    { onClosing: () => runner.cancel(), onOpened: () => runner.afterOpen() },
  );

  return {
    state,
    storageAvailable: deps.projectStore.available,
    edit(fn) {
      const before = state.currentHash.value;
      state.project.value = fn(state.project.value);
      persistence.scheduleSave();
      if (state.currentHash.value !== before) {
        runner.schedule();
      }
    },
    undo() {
      const previous = state.undoSlot.value;
      if (!previous) {
        return;
      }
      batch(() => {
        state.project.value = { ...state.project.value, layout: previous };
        state.undoSlot.value = null;
      });
      persistence.scheduleSave();
    },
    reoptimize() {
      void runner.runNow("edit", "user");
    },
    improveMore() {
      void runner.runNow("improve", "user");
    },
    cancelRun() {
      runner.cancel();
    },
    retry() {
      void runner.retry();
    },
    start(hash) {
      persistence.start(hash);
    },
    openFromHash(hash) {
      persistence.openFromHash(hash);
    },
    openProject(id) {
      persistence.openProject(id);
    },
    newProject() {
      persistence.newProject();
    },
    deleteProject(id) {
      persistence.deleteProject(id);
    },
    importJson(text) {
      return persistence.importJson(text);
    },
    pushNotice(n) {
      pushNotice(state, n);
    },
    dismissNotice(code) {
      dismissNotice(state, code);
    },
    resolveConflict(choice) {
      persistence.resolveConflict(choice);
    },
    onExternalChange() {
      persistence.onExternalChange();
    },
    flushSave() {
      persistence.flush();
    },
    dispose() {
      runner.dispose();
      persistence.dispose();
    },
  };
}

export function connectWindow(store: AppStore, win: Window): () => void {
  const onStorage = (): void => store.onExternalChange();
  const onHashChange = (): void => store.openFromHash(win.location.hash);
  const onPageHide = (): void => store.flushSave();
  win.addEventListener("storage", onStorage);
  win.addEventListener("hashchange", onHashChange);
  win.addEventListener("pagehide", onPageHide);
  return () => {
    win.removeEventListener("storage", onStorage);
    win.removeEventListener("hashchange", onHashChange);
    win.removeEventListener("pagehide", onPageHide);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/app/store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/app/store.ts src/app/store.test.ts
git commit -m "Compose the app store and wire window events"
```

---

### Task 6: Form primitives (number field, fields, notices, validation context)

**Files:**

- Create: `src/ui/validation.ts`
- Create: `src/ui/NumberField.tsx`
- Create: `src/ui/fields.tsx`
- Create: `src/ui/Notices.tsx`
- Test: `src/ui/NumberField.test.tsx`, `src/ui/fields.test.tsx`

**Interfaces:**

- Consumes: `parseNumber` (`model/numbers`; `"63,"` parses as 63, `"6x"` → `null`), `Notice`.
- Produces:
  - `ValidationContext` (`preact` context of `Notice[]`), `useFieldNotices(path: string | undefined): Notice[]` — notices whose `path` equals `path`.
  - `interface NumberRules { min?: number; max?: number; minExclusive?: boolean; integer?: boolean }`
  - `type NumberCheck = { kind: "ok"; value: number } | { kind: "incomplete" } | { kind: "error"; message: string }`
  - `checkNumber(text: string, rules: NumberRules): NumberCheck` — a trailing `,`/`.` or a lone sign is `incomplete` (never an error, never committed).
  - `formatNumber(v: number): string`
  - `interface NumberFieldProps extends NumberRules { id: string; label: string; value: number; onCommit: (value: number) => void; unit?: string; hint?: string; path?: string; commitOn?: "input" | "blur" }`; `NumberField(props)`
  - `interface TextFieldProps { id: string; label: string; value: string; onCommit: (value: string) => void; hint?: string; path?: string; placeholder?: string; commitOn?: "input" | "blur" }`; `TextField(props)`
  - `interface SelectOption<T extends string> { value: T; label: string; disabled?: boolean }`; `interface SelectFieldProps<T extends string> { id: string; label: string; value: T; options: readonly SelectOption<T>[]; onChange: (value: T) => void; hint?: string }`; `SelectField<T>(props)`
  - `interface CheckFieldProps { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; hint?: string }`; `CheckField(props)`
  - `interface NoticesProps { notices: readonly Notice[]; onDismiss?: (code: string) => void; renderAction?: (n: Notice) => ComponentChildren; label?: string }`; `Notices(props)`

Every input has a `<label for>`, errors are linked with `aria-describedby` and flagged with `aria-invalid`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/NumberField.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumberField, checkNumber } from "./NumberField";
import { ValidationContext } from "./validation";

afterEach(cleanup);

function input(): HTMLInputElement {
  const el = screen.getByLabelText(/Inner width/);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error("not an input");
  }
  return el;
}

function type(el: HTMLInputElement, text: string): void {
  fireEvent.input(el, { target: { value: text } });
}

describe("checkNumber", () => {
  it("treats a trailing separator or a lone sign as incomplete", () => {
    expect(checkNumber("63,", {})).toEqual({ kind: "incomplete" });
    expect(checkNumber("63.", {})).toEqual({ kind: "incomplete" });
    expect(checkNumber("-", {})).toEqual({ kind: "incomplete" });
  });

  it("parses comma and point, and applies rules", () => {
    expect(checkNumber("63,5", {})).toEqual({ kind: "ok", value: 63.5 });
    expect(checkNumber(" 63.5 ", { min: 0, minExclusive: true })).toEqual({
      kind: "ok",
      value: 63.5,
    });
    expect(checkNumber("0", { min: 0, minExclusive: true }).kind).toBe("error");
    expect(checkNumber("2,5", { integer: true }).kind).toBe("error");
    expect(checkNumber("1001", { max: 1000 }).kind).toBe("error");
    expect(checkNumber("", {}).kind).toBe("error");
    expect(checkNumber("6x", {}).kind).toBe("error");
  });
});

describe("NumberField", () => {
  it("63, is incomplete and commits 63.5 once", () => {
    const onCommit = vi.fn();
    render(<NumberField id="w" label="Inner width" unit="mm" value={290} onCommit={onCommit} />);
    const el = input();
    type(el, "6");
    type(el, "63");
    type(el, "63,");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(el.getAttribute("aria-invalid")).toBe("false");
    type(el, "63,5");
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([6, 63, 63.5]);
  });

  it("shows an inline error and does not commit invalid text", () => {
    const onCommit = vi.fn();
    render(
      <NumberField
        id="w"
        label="Inner width"
        value={290}
        onCommit={onCommit}
        min={0}
        minExclusive
      />,
    );
    const el = input();
    type(el, "6x");
    expect(onCommit).not.toHaveBeenCalled();
    expect(el.getAttribute("aria-invalid")).toBe("true");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Not a number/);
    expect(el.getAttribute("aria-describedby")).toContain(alert.id);
    type(el, "0");
    expect(screen.getByRole("alert").textContent).toMatch(/more than 0/);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits a pending trailing separator on blur", () => {
    const onCommit = vi.fn();
    render(<NumberField id="w" label="Inner width" value={290} onCommit={onCommit} />);
    const el = input();
    type(el, "63,");
    fireEvent.blur(el);
    expect(onCommit).toHaveBeenCalledWith(63);
  });

  it("with commitOn blur, commits once when leaving the field", () => {
    const onCommit = vi.fn();
    render(
      <NumberField id="w" label="Inner width" value={63.5} onCommit={onCommit} commitOn="blur" />,
    );
    const el = input();
    type(el, "8");
    type(el, "88");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(el);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(88);
  });

  it("follows external value changes but keeps the user's comma spelling", () => {
    const onCommit = vi.fn();
    const view = render(<NumberField id="w" label="Inner width" value={290} onCommit={onCommit} />);
    const el = input();
    type(el, "63,5");
    view.rerender(<NumberField id="w" label="Inner width" value={63.5} onCommit={onCommit} />);
    expect(el.value).toBe("63,5");
    view.rerender(<NumberField id="w" label="Inner width" value={120} onCommit={onCommit} />);
    expect(el.value).toBe("120");
  });

  it("shows project validation notices for its path", () => {
    render(
      <ValidationContext.Provider
        value={[
          {
            level: "error",
            code: "field.length",
            path: "/box/innerWidth",
            message: "Box width must be greater than 0 mm.",
          },
          { level: "error", code: "field.length", path: "/box/innerDepth", message: "Other field" },
        ]}
      >
        <NumberField
          id="w"
          label="Inner width"
          value={0}
          onCommit={vi.fn()}
          path="/box/innerWidth"
        />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Box width must be greater than 0 mm.");
    expect(screen.queryByText("Other field")).toBeNull();
  });
});
```

```tsx
// src/ui/fields.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckField, SelectField, TextField } from "./fields";
import { Notices } from "./Notices";

afterEach(cleanup);

describe("TextField", () => {
  it("commits on input by default", () => {
    const onCommit = vi.fn();
    render(<TextField id="n" label="Name" value="A" onCommit={onCommit} />);
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "AB" } });
    expect(onCommit).toHaveBeenCalledWith("AB");
  });

  it("with commitOn blur keeps spaces while typing", () => {
    const onCommit = vi.fn();
    render(<TextField id="g" label="Group" value="" onCommit={onCommit} commitOn="blur" />);
    const el = screen.getByLabelText("Group");
    fireEvent.input(el, { target: { value: "big " } });
    expect(onCommit).not.toHaveBeenCalled();
    expect((el as HTMLInputElement).value).toBe("big ");
    fireEvent.input(el, { target: { value: "big tokens" } });
    fireEvent.blur(el);
    expect(onCommit).toHaveBeenCalledWith("big tokens");
  });
});

describe("SelectField", () => {
  it("emits the typed option value", () => {
    const onChange = vi.fn();
    render(
      <SelectField
        id="fit"
        label="Fit"
        value="normal"
        options={[
          { value: "tight", label: "Tight" },
          { value: "normal", label: "Normal" },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Fit"), { target: { value: "tight" } });
    expect(onChange).toHaveBeenCalledWith("tight");
  });
});

describe("CheckField", () => {
  it("toggles and can be disabled with a hint", () => {
    const onChange = vi.fn();
    render(
      <CheckField
        id="side"
        label="Stored on its side"
        checked={false}
        onChange={onChange}
        hint="Upright on a shelf"
      />,
    );
    const box = screen.getByLabelText("Stored on its side");
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(box.getAttribute("aria-describedby")).toBe("side-hint");
  });
});

describe("Notices", () => {
  it("renders levels, alerts for errors, actions and dismiss buttons", () => {
    const onDismiss = vi.fn();
    render(
      <Notices
        notices={[
          { level: "error", code: "open.failed", message: "Broken link" },
          { level: "info", code: "layout.stale", message: "Inputs changed" },
        ]}
        onDismiss={onDismiss}
        renderAction={(n) =>
          n.code === "layout.stale" ? <button type="button">Re-optimize</button> : null
        }
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Broken link");
    expect(screen.getByRole("button", { name: "Re-optimize" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Broken link" }));
    expect(onDismiss).toHaveBeenCalledWith("open.failed");
  });

  it("renders nothing without notices", () => {
    const { container } = render(<Notices notices={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/insert-generator && npx vitest run src/ui/NumberField.test.tsx src/ui/fields.test.tsx`
Expected: FAIL — `Failed to resolve import "./NumberField"` and `"./fields"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ui/validation.ts
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Notice } from "../model/types";

/** All `validateProject()` notices of the current project; fields pick theirs by path. */
export const ValidationContext = createContext<Notice[]>([]);

export function useFieldNotices(path: string | undefined): Notice[] {
  const all = useContext(ValidationContext);
  if (path === undefined) {
    return [];
  }
  return all.filter((n) => n.path === path);
}
```

```tsx
// src/ui/NumberField.tsx
import { useEffect, useState } from "preact/hooks";
import { parseNumber } from "../model/numbers";
import { useFieldNotices } from "./validation";

export interface NumberRules {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  integer?: boolean;
}

export type NumberCheck =
  { kind: "ok"; value: number } | { kind: "incomplete" } | { kind: "error"; message: string };

export function checkNumber(text: string, rules: NumberRules): NumberCheck {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { kind: "error", message: "Enter a number." };
  }
  if (/^[+\-−]$/.test(trimmed) || /[.,]$/.test(trimmed)) {
    return { kind: "incomplete" };
  }
  const value = parseNumber(trimmed);
  if (value === null) {
    return {
      kind: "error",
      message: "Not a number. Use digits with one decimal point or comma, e.g. 63,5.",
    };
  }
  if (rules.integer && !Number.isInteger(value)) {
    return { kind: "error", message: "Enter a whole number." };
  }
  if (rules.min !== undefined) {
    const tooSmall = rules.minExclusive ? value <= rules.min : value < rules.min;
    if (tooSmall) {
      return {
        kind: "error",
        message: rules.minExclusive
          ? `Must be more than ${rules.min}.`
          : `Must be at least ${rules.min}.`,
      };
    }
  }
  if (rules.max !== undefined && value > rules.max) {
    return { kind: "error", message: `Must be at most ${rules.max}.` };
  }
  return { kind: "ok", value };
}

export function formatNumber(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

export interface NumberFieldProps extends NumberRules {
  id: string;
  label: string;
  value: number;
  onCommit: (value: number) => void;
  unit?: string;
  hint?: string;
  path?: string;
  /** "input" (default) commits every valid keystroke; "blur" only when leaving the field. */
  commitOn?: "input" | "blur";
}

export function NumberField(props: NumberFieldProps) {
  const { id, label, value, onCommit, unit, hint, path } = props;
  const commitOn = props.commitOn ?? "input";
  const [text, setText] = useState(() => formatNumber(value));
  const [error, setError] = useState<string | null>(null);
  const notices = useFieldNotices(path);

  useEffect(() => {
    setText((current) => (parseNumber(current) === value ? current : formatNumber(value)));
    setError(null);
  }, [value]);

  function evaluate(next: string, final: boolean): void {
    let result = checkNumber(next, props);
    if (result.kind === "incomplete" && final) {
      result = checkNumber(next.trim().replace(/[.,]$/, ""), props);
    }
    if (result.kind === "error") {
      setError(result.message);
      return;
    }
    setError(null);
    if (result.kind === "incomplete") {
      return;
    }
    if ((final || commitOn === "input") && result.value !== value) {
      onCommit(result.value);
    }
  }

  const messages = error !== null ? [error] : notices.map((n) => n.message);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint !== undefined ? hintId : "", messages.length > 0 ? errorId : ""]
    .filter((x) => x !== "")
    .join(" ");

  return (
    <div class="field">
      <label htmlFor={id}>
        {label}
        {unit !== undefined ? <span class="unit"> ({unit})</span> : null}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-invalid={messages.length > 0}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        onInput={(e) => {
          const next = e.currentTarget.value;
          setText(next);
          evaluate(next, false);
        }}
        onBlur={() => evaluate(text, true)}
      />
      {hint !== undefined ? (
        <p class="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {messages.length > 0 ? (
        <p class="field-error" id={errorId} role="alert">
          {messages.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
```

```tsx
// src/ui/fields.tsx
import { useEffect, useState } from "preact/hooks";
import { useFieldNotices } from "./validation";

function describedBy(...ids: (string | null)[]): string | undefined {
  const joined = ids.filter((x): x is string => x !== null).join(" ");
  return joined === "" ? undefined : joined;
}

export interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
  hint?: string;
  path?: string;
  placeholder?: string;
  commitOn?: "input" | "blur";
}

export function TextField({
  id,
  label,
  value,
  onCommit,
  hint,
  path,
  placeholder,
  commitOn = "input",
}: TextFieldProps) {
  const [text, setText] = useState(value);
  const notices = useFieldNotices(path);
  useEffect(() => {
    setText(value);
  }, [value]);
  const hintId = hint !== undefined ? `${id}-hint` : null;
  const errorId = notices.length > 0 ? `${id}-error` : null;
  return (
    <div class="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={text}
        placeholder={placeholder}
        aria-invalid={notices.length > 0}
        aria-describedby={describedBy(hintId, errorId)}
        onInput={(e) => {
          const next = e.currentTarget.value;
          setText(next);
          if (commitOn === "input") {
            onCommit(next);
          }
        }}
        onBlur={() => {
          if (commitOn === "blur" && text !== value) {
            onCommit(text);
          }
        }}
      />
      {hintId !== null ? (
        <p class="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {errorId !== null ? (
        <p class="field-error" id={errorId} role="alert">
          {notices.map((n) => n.message).join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps<T extends string> {
  id: string;
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  hint?: string;
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  hint,
}: SelectFieldProps<T>) {
  const hintId = hint !== undefined ? `${id}-hint` : null;
  return (
    <div class="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        aria-describedby={describedBy(hintId)}
        onChange={(e) => {
          const picked = options.find((o) => o.value === e.currentTarget.value);
          if (picked) {
            onChange(picked.value);
          }
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hintId !== null ? (
        <p class="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface CheckFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}

export function CheckField({ id, label, checked, onChange, disabled, hint }: CheckFieldProps) {
  const hintId = hint !== undefined ? `${id}-hint` : null;
  return (
    <div class="check-field">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy(hintId)}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {hintId !== null ? (
        <p class="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
```

```tsx
// src/ui/Notices.tsx
import type { ComponentChildren } from "preact";
import type { Notice } from "../model/types";

const LEVEL_LABEL: Record<Notice["level"], string> = {
  error: "Error",
  warning: "Warning",
  info: "Note",
};

export interface NoticesProps {
  notices: readonly Notice[];
  onDismiss?: (code: string) => void;
  renderAction?: (n: Notice) => ComponentChildren;
  label?: string;
}

export function Notices({ notices, onDismiss, renderAction, label = "Messages" }: NoticesProps) {
  if (notices.length === 0) {
    return null;
  }
  return (
    <ul class="notices" aria-label={label} aria-live="polite">
      {notices.map((n) => (
        <li
          key={`${n.code}|${n.message}`}
          class={`notice notice-${n.level}`}
          role={n.level === "error" ? "alert" : undefined}
        >
          <span class="notice-level">{LEVEL_LABEL[n.level]}:</span>{" "}
          <span class="notice-text">{n.message}</span>
          {renderAction ? <span class="notice-action">{renderAction(n)}</span> : null}
          {onDismiss ? (
            <button
              type="button"
              class="notice-dismiss"
              aria-label={`Dismiss: ${n.message}`}
              onClick={() => onDismiss(n.code)}
            >
              ×
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/insert-generator && npx vitest run src/ui/NumberField.test.tsx src/ui/fields.test.tsx`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/ui/validation.ts src/ui/NumberField.tsx src/ui/fields.tsx src/ui/Notices.tsx src/ui/NumberField.test.tsx src/ui/fields.test.tsx
git commit -m "Add form primitives with decimal-comma number input"
```

---

### Task 7: Box and printer forms

**Files:**

- Create: `src/ui/BoxForm.tsx`
- Create: `src/ui/PrinterForm.tsx`
- Test: `src/ui/BoxForm.test.tsx`

**Interfaces:**

- Consumes: `NumberField`, `SelectField`, `CheckField` (Task 6); `BED_PRESETS` (`model/presets`); `Box`, `Printer`.
- Produces:
  - `interface BoxFormProps { box: Box; onChange: (patch: Partial<Box>) => void }`; `BoxForm(props)` — spec §8.2 hints; `headroomCoverage` only when `headroom > 0`.
  - `CUSTOM_BED = "custom"`; `bedPresetOf(p: Printer): string` (preset id or `"custom"`)
  - `interface PrinterFormProps { printer: Printer; advanced: boolean; onChange: (patch: Partial<Printer>) => void }`; `PrinterForm(props)` — preset select + custom X/Y/Z; advanced: bed margin, layer height.

Field ids are `box-<field>` / `printer-<field>`; validation paths are `/box/<field>` / `/printer/<field>` (plan 1 `validateProject`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/BoxForm.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOX, DEFAULT_PRINTER } from "../model/defaults";
import { BoxForm } from "./BoxForm";
import { PrinterForm, bedPresetOf } from "./PrinterForm";

afterEach(cleanup);

describe("BoxForm", () => {
  it("labels every field and commits decimal-comma input", () => {
    const onChange = vi.fn();
    render(<BoxForm box={DEFAULT_BOX} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText(/Inner width/), { target: { value: "290,5" } });
    expect(onChange).toHaveBeenCalledWith({ innerWidth: 290.5 });
    expect(screen.getByLabelText(/Inner depth/)).toBeTruthy();
    expect(screen.getByLabelText(/Inner height/)).toBeTruthy();
    expect(screen.getAllByText(/narrowest point/)).toHaveLength(2);
    expect(screen.getByText(/plus 1 mm for warp/)).toBeTruthy();
  });

  it("hides headroom coverage when headroom is 0", () => {
    const view = render(<BoxForm box={{ ...DEFAULT_BOX, headroom: 0 }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/cover every tray/)).toBeNull();
    view.rerender(<BoxForm box={{ ...DEFAULT_BOX, headroom: 8 }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/cover every tray/)).toBeTruthy();
  });

  it("toggles stored-on-side and coverage", () => {
    const onChange = vi.fn();
    render(<BoxForm box={{ ...DEFAULT_BOX, headroom: 8 }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/stored on its side/));
    expect(onChange).toHaveBeenCalledWith({ storedOnSide: true });
    fireEvent.change(screen.getByLabelText(/cover every tray/), { target: { value: "partial" } });
    expect(onChange).toHaveBeenCalledWith({ headroomCoverage: "partial" });
  });
});

describe("PrinterForm", () => {
  it("recognizes presets and applies a picked preset", () => {
    expect(bedPresetOf(DEFAULT_PRINTER)).toBe("bambu-256");
    expect(bedPresetOf({ ...DEFAULT_PRINTER, bedX: 300 })).toBe("custom");
    const onChange = vi.fn();
    render(<PrinterForm printer={DEFAULT_PRINTER} advanced={false} onChange={onChange} />);
    expect(screen.queryByLabelText(/Bed X/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Printer bed"), { target: { value: "prusa-mk4" } });
    expect(onChange).toHaveBeenCalledWith({ bedX: 250, bedY: 210, bedZ: 220 });
  });

  it("shows X/Y/Z for a custom bed", () => {
    const onChange = vi.fn();
    render(<PrinterForm printer={DEFAULT_PRINTER} advanced={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Printer bed"), { target: { value: "custom" } });
    fireEvent.input(screen.getByLabelText(/Bed X/), { target: { value: "300" } });
    expect(onChange).toHaveBeenCalledWith({ bedX: 300 });
    expect(screen.getByLabelText(/Bed Y/)).toBeTruthy();
    expect(screen.getByLabelText(/Bed Z/)).toBeTruthy();
  });

  it("shows bed margin and layer height only in advanced mode", () => {
    const view = render(
      <PrinterForm printer={DEFAULT_PRINTER} advanced={false} onChange={vi.fn()} />,
    );
    expect(screen.queryByLabelText(/Bed margin/)).toBeNull();
    view.rerender(<PrinterForm printer={DEFAULT_PRINTER} advanced onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Bed margin/)).toBeTruthy();
    expect(screen.getByLabelText(/Layer height/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/ui/BoxForm.test.tsx`
Expected: FAIL — `Failed to resolve import "./BoxForm"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/ui/BoxForm.tsx
import type { Box } from "../model/types";
import { CheckField, SelectField } from "./fields";
import { NumberField } from "./NumberField";

export interface BoxFormProps {
  box: Box;
  onChange: (patch: Partial<Box>) => void;
}

const LENGTH = { min: 0, minExclusive: true, max: 1000 };

export function BoxForm({ box, onChange }: BoxFormProps) {
  return (
    <div class="form-grid">
      <NumberField
        id="box-innerWidth"
        label="Inner width (X, left → right)"
        unit="mm"
        value={box.innerWidth}
        path="/box/innerWidth"
        {...LENGTH}
        hint="Seen from the box front. Measure at the narrowest point."
        onCommit={(v) => onChange({ innerWidth: v })}
      />
      <NumberField
        id="box-innerDepth"
        label="Inner depth (Y, front → back)"
        unit="mm"
        value={box.innerDepth}
        path="/box/innerDepth"
        {...LENGTH}
        hint="Measure at the narrowest point."
        onCommit={(v) => onChange({ innerDepth: v })}
      />
      <NumberField
        id="box-innerHeight"
        label="Inner height"
        unit="mm"
        value={box.innerHeight}
        path="/box/innerHeight"
        {...LENGTH}
        hint="From the floor to the rim of the bottom part."
        onCommit={(v) => onChange({ innerHeight: v })}
      />
      <NumberField
        id="box-headroom"
        label="Headroom"
        unit="mm"
        value={box.headroom}
        path="/box/headroom"
        min={0}
        max={1000}
        hint="Boards and rulebooks stacked as they lie on top, plus 1 mm for warp. 0 if nothing lies on top."
        onCommit={(v) => onChange({ headroom: v })}
      />
      {box.headroom > 0 ? (
        <SelectField
          id="box-headroomCoverage"
          label="Do the boards and books cover every tray?"
          value={box.headroomCoverage}
          options={[
            { value: "full", label: "Yes, they cover the whole box" },
            { value: "partial", label: "No, only part of it" },
          ]}
          hint="Loose bits are kept out of top trays that nothing covers."
          onChange={(v) => onChange({ headroomCoverage: v })}
        />
      ) : null}
      <CheckField
        id="box-storedOnSide"
        label="The box is stored on its side"
        checked={box.storedOnSide}
        hint="Loose bits in the top layer then get a warning."
        onChange={(v) => onChange({ storedOnSide: v })}
      />
    </div>
  );
}
```

```tsx
// src/ui/PrinterForm.tsx
import { useState } from "preact/hooks";
import { BED_PRESETS } from "../model/presets";
import type { Printer } from "../model/types";
import { SelectField } from "./fields";
import type { SelectOption } from "./fields";
import { NumberField } from "./NumberField";

export const CUSTOM_BED = "custom";

export function bedPresetOf(p: Printer): string {
  const preset = BED_PRESETS.find(
    (b) => b.bedX === p.bedX && b.bedY === p.bedY && b.bedZ === p.bedZ,
  );
  return preset ? preset.id : CUSTOM_BED;
}

export interface PrinterFormProps {
  printer: Printer;
  advanced: boolean;
  onChange: (patch: Partial<Printer>) => void;
}

const BED = { min: 0, minExclusive: true, max: 1000 };

const OPTIONS: SelectOption<string>[] = [
  ...BED_PRESETS.map((b) => ({ value: b.id, label: b.label })),
  { value: CUSTOM_BED, label: "Custom size" },
];

export function PrinterForm({ printer, advanced, onChange }: PrinterFormProps) {
  const matched = bedPresetOf(printer);
  const [customChosen, setCustomChosen] = useState(matched === CUSTOM_BED);
  const selected = customChosen ? CUSTOM_BED : matched;
  return (
    <div class="form-grid">
      <SelectField
        id="printer-preset"
        label="Printer bed"
        value={selected}
        options={OPTIONS}
        onChange={(id) => {
          const preset = BED_PRESETS.find((b) => b.id === id);
          if (preset) {
            setCustomChosen(false);
            onChange({ bedX: preset.bedX, bedY: preset.bedY, bedZ: preset.bedZ });
          } else {
            setCustomChosen(true);
          }
        }}
      />
      {selected === CUSTOM_BED ? (
        <>
          <NumberField
            id="printer-bedX"
            label="Bed X"
            unit="mm"
            value={printer.bedX}
            path="/printer/bedX"
            {...BED}
            onCommit={(v) => onChange({ bedX: v })}
          />
          <NumberField
            id="printer-bedY"
            label="Bed Y"
            unit="mm"
            value={printer.bedY}
            path="/printer/bedY"
            {...BED}
            onCommit={(v) => onChange({ bedY: v })}
          />
          <NumberField
            id="printer-bedZ"
            label="Bed Z (max print height)"
            unit="mm"
            value={printer.bedZ}
            path="/printer/bedZ"
            {...BED}
            onCommit={(v) => onChange({ bedZ: v })}
          />
        </>
      ) : null}
      {advanced ? (
        <>
          <NumberField
            id="printer-bedMargin"
            label="Bed margin"
            unit="mm"
            value={printer.bedMargin}
            path="/printer/bedMargin"
            min={0}
            max={1000}
            hint="Kept free on every side for the purge line or skirt."
            onCommit={(v) => onChange({ bedMargin: v })}
          />
          <NumberField
            id="printer-layerHeight"
            label="Layer height"
            unit="mm"
            value={printer.layerHeight}
            path="/printer/layerHeight"
            min={0.05}
            max={1}
            hint="Tray heights are rounded to multiples of this."
            onCommit={(v) => onChange({ layerHeight: v })}
          />
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/ui/BoxForm.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/ui/BoxForm.tsx src/ui/PrinterForm.tsx src/ui/BoxForm.test.tsx
git commit -m "Add box and printer forms"
```

---

### Task 8: Settings form

**Files:**

- Create: `src/ui/settingsFields.ts`
- Create: `src/ui/SettingsForm.tsx`
- Test: `src/ui/SettingsForm.test.tsx`

**Interfaces:**

- Consumes: `SETTING_RANGES` (`model/validate`: `{ path, label, get, min, max }[]`, paths like `"wall"`, `"fingerPocket/width"`, `"lip/play"`), `applyWallChoice`, `applyFitChoice`, `wallChoiceOf`, `fitChoiceOf`, `WALL_CHOICES`, `FIT_CHOICES`, `WallChoice`, `FitChoice`, `applyFingerRoom`, `fingerRoomOf`, `FINGER_ROOM_MM`, `FINGER_DIVIDER_ROOM_MM` (`model/settings`); `NumberField`, `SelectField`, `CheckField` (Task 6).
- Produces:
  - `SETTING_SETTERS: Record<string, (s: Settings, v: number) => Settings>` — one pure setter per `SETTING_RANGES` path.
  - `settingUnit(path: string): string | undefined` — `"mm"` except fit, fractions.
  - `interface SettingsFormProps { settings: Settings; advanced: boolean; onChange: (s: Settings) => void }`; `SettingsForm(props)` — simple mode: "Walls" thin/normal/sturdy and "Fit" tight/normal/loose (a disabled "Custom" option appears when advanced values match neither) and the "Extra finger room in the box" switch; advanced mode replaces them with every `Settings` number, the lip switch and the leftover choice.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/SettingsForm.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  applyFingerRoom,
  applyFitChoice,
  applyWallChoice,
} from "../model/settings";
import { SETTING_RANGES } from "../model/validate";
import { SettingsForm } from "./SettingsForm";
import { SETTING_SETTERS, settingUnit } from "./settingsFields";

afterEach(cleanup);

describe("SETTING_SETTERS", () => {
  it("has a setter for every validated setting that writes what get() reads", () => {
    for (const r of SETTING_RANGES) {
      const set = SETTING_SETTERS[r.path];
      expect(set, r.path).toBeDefined();
      if (set) {
        expect(r.get(set(DEFAULT_SETTINGS, 0.77))).toBe(0.77);
      }
    }
  });

  it("names units", () => {
    expect(settingUnit("wall")).toBe("mm");
    expect(settingUnit("fit")).toBeUndefined();
    expect(settingUnit("packingFactor")).toBeUndefined();
  });
});

describe("SettingsForm", () => {
  it("writes resolved values from the simple choices", () => {
    const onChange = vi.fn();
    render(<SettingsForm settings={DEFAULT_SETTINGS} advanced={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Walls"), { target: { value: "sturdy" } });
    expect(onChange).toHaveBeenCalledWith(applyWallChoice(DEFAULT_SETTINGS, "sturdy"));
    fireEvent.change(screen.getByLabelText("Fit"), { target: { value: "loose" } });
    expect(onChange).toHaveBeenCalledWith(applyFitChoice(DEFAULT_SETTINGS, "loose"));
    fireEvent.click(screen.getByLabelText("Extra finger room in the box"));
    expect(onChange).toHaveBeenCalledWith(applyFingerRoom(DEFAULT_SETTINGS, true));
    expect(screen.queryByLabelText(/Corner radius/)).toBeNull();
  });

  it("shows a custom finger room as on, names it, and switches it off", () => {
    const onChange = vi.fn();
    const four = {
      ...DEFAULT_SETTINGS,
      fingerPocket: { ...DEFAULT_SETTINGS.fingerPocket, wallRoom: 4 },
    };
    render(<SettingsForm settings={four} advanced={false} onChange={onChange} />);
    const box = screen.getByLabelText("Extra finger room in the box");
    if (!(box instanceof HTMLInputElement)) {
      throw new Error("not a checkbox");
    }
    expect(box.checked).toBe(true);
    expect(screen.getByText(/Custom: 4 mm walls, 0 mm dividers/)).toBeTruthy();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(applyFingerRoom(four, false));
  });

  it("shows a custom choice when advanced values match no preset", () => {
    render(
      <SettingsForm
        settings={{ ...DEFAULT_SETTINGS, wall: 1.8 }}
        advanced={false}
        onChange={vi.fn()}
      />,
    );
    const select = screen.getByLabelText("Walls");
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error("not a select");
    }
    expect(select.value).toBe("custom");
    expect(screen.getByRole("option", { name: "Custom (1.8 mm)" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("edits every advanced number, the lip and the leftover", () => {
    const onChange = vi.fn();
    render(<SettingsForm settings={DEFAULT_SETTINGS} advanced onChange={onChange} />);
    expect(screen.queryByLabelText("Walls")).toBeNull();
    for (const r of SETTING_RANGES) {
      const exact = new RegExp(`^${r.label.replace(/[()]/g, "\\$&")}( \\(mm\\))?$`);
      expect(screen.getByLabelText(exact), r.path).toBeTruthy();
    }
    fireEvent.input(screen.getByLabelText(/^Corner radius/), { target: { value: "4,5" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, cornerRadius: 4.5 });
    fireEvent.input(screen.getByLabelText(/^Lip play/), { target: { value: "0,3" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      lip: { ...DEFAULT_SETTINGS.lip, play: 0.3 },
    });
    fireEvent.click(screen.getByLabelText(/Locating lip/));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      lip: { ...DEFAULT_SETTINGS.lip, enabled: false },
    });
    fireEvent.change(screen.getByLabelText("Unused space"), { target: { value: "solid" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, leftover: "solid" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/ui/SettingsForm.test.tsx`
Expected: FAIL — `Failed to resolve import "./SettingsForm"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ui/settingsFields.ts
import type { Settings } from "../model/types";

/** Pure setters keyed by plan 1's SETTING_RANGES paths. */
export const SETTING_SETTERS: Record<string, (s: Settings, v: number) => Settings> = {
  wall: (s, v) => ({ ...s, wall: v }),
  floor: (s, v) => ({ ...s, floor: v }),
  divider: (s, v) => ({ ...s, divider: v }),
  fit: (s, v) => ({ ...s, fit: v }),
  cardClearance: (s, v) => ({ ...s, cardClearance: v }),
  cardStackClearance: (s, v) => ({ ...s, cardStackClearance: v }),
  cardStackClearancePct: (s, v) => ({ ...s, cardStackClearancePct: v }),
  cardThickness: (s, v) => ({ ...s, cardThickness: v }),
  pieceClearance: (s, v) => ({ ...s, pieceClearance: v }),
  boxClearance: (s, v) => ({ ...s, boxClearance: v }),
  trayGap: (s, v) => ({ ...s, trayGap: v }),
  bottomChamfer: (s, v) => ({ ...s, bottomChamfer: v }),
  cornerRadius: (s, v) => ({ ...s, cornerRadius: v }),
  scoopRadius: (s, v) => ({ ...s, scoopRadius: v }),
  "fingerPocket/width": (s, v) => ({ ...s, fingerPocket: { ...s.fingerPocket, width: v } }),
  "fingerPocket/floorNotch": (s, v) => ({
    ...s,
    fingerPocket: { ...s.fingerPocket, floorNotch: v },
  }),
  "fingerPocket/wallRoom": (s, v) => ({ ...s, fingerPocket: { ...s.fingerPocket, wallRoom: v } }),
  "fingerPocket/dividerRoom": (s, v) => ({
    ...s,
    fingerPocket: { ...s.fingerPocket, dividerRoom: v },
  }),
  "lip/height": (s, v) => ({ ...s, lip: { ...s.lip, height: v } }),
  "lip/thickness": (s, v) => ({ ...s, lip: { ...s.lip, thickness: v } }),
  "lip/ledge": (s, v) => ({ ...s, lip: { ...s.lip, ledge: v } }),
  "lip/play": (s, v) => ({ ...s, lip: { ...s.lip, play: v } }),
  topPressFit: (s, v) => ({ ...s, topPressFit: v }),
  packingFactor: (s, v) => ({ ...s, packingFactor: v }),
};

const UNITLESS = new Set(["fit", "cardStackClearancePct", "packingFactor"]);

export function settingUnit(path: string): string | undefined {
  return UNITLESS.has(path) ? undefined : "mm";
}
```

```tsx
// src/ui/SettingsForm.tsx
import {
  FINGER_DIVIDER_ROOM_MM,
  FINGER_ROOM_MM,
  FIT_CHOICES,
  WALL_CHOICES,
  applyFingerRoom,
  applyFitChoice,
  applyWallChoice,
  fingerRoomOf,
  fitChoiceOf,
  wallChoiceOf,
} from "../model/settings";
import type { FitChoice, WallChoice } from "../model/settings";
import type { Settings } from "../model/types";
import { SETTING_RANGES } from "../model/validate";
import { CheckField, SelectField } from "./fields";
import type { SelectOption } from "./fields";
import { NumberField } from "./NumberField";
import { SETTING_SETTERS, settingUnit } from "./settingsFields";

export interface SettingsFormProps {
  settings: Settings;
  advanced: boolean;
  onChange: (s: Settings) => void;
}

function wallOptions(s: Settings): SelectOption<WallChoice | "custom">[] {
  const options: SelectOption<WallChoice | "custom">[] = [
    { value: "thin", label: `Thin (${WALL_CHOICES.thin} mm)` },
    { value: "normal", label: `Normal (${WALL_CHOICES.normal} mm)` },
    { value: "sturdy", label: `Sturdy (${WALL_CHOICES.sturdy} mm)` },
  ];
  if (wallChoiceOf(s) === "custom") {
    options.push({ value: "custom", label: `Custom (${s.wall} mm)`, disabled: true });
  }
  return options;
}

function fitOptions(s: Settings): SelectOption<FitChoice | "custom">[] {
  const options: SelectOption<FitChoice | "custom">[] = [
    { value: "tight", label: `Tight (×${FIT_CHOICES.tight})` },
    { value: "normal", label: `Normal (×${FIT_CHOICES.normal})` },
    { value: "loose", label: `Loose (×${FIT_CHOICES.loose})` },
  ];
  if (fitChoiceOf(s) === "custom") {
    options.push({ value: "custom", label: `Custom (×${s.fit})`, disabled: true });
  }
  return options;
}

export function SettingsForm({ settings, advanced, onChange }: SettingsFormProps) {
  if (!advanced) {
    return (
      <div class="form-grid">
        <SimpleChoices settings={settings} onChange={onChange} />
      </div>
    );
  }
  return (
    <div class="form-grid">
      {SETTING_RANGES.map((r) => (
        <NumberField
          key={r.path}
          id={`settings-${r.path.replace("/", "-")}`}
          label={r.label}
          unit={settingUnit(r.path)}
          value={r.get(settings)}
          path={`/settings/${r.path}`}
          min={r.min}
          max={r.max}
          onCommit={(v) => {
            const set = SETTING_SETTERS[r.path];
            if (set) {
              onChange(set(settings, v));
            }
          }}
        />
      ))}
      <CheckField
        id="settings-lip-enabled"
        label="Locating lip on stacked trays"
        checked={settings.lip.enabled}
        hint="Without the lip, stacked trays can shift; the app then warns."
        onChange={(enabled) => onChange({ ...settings, lip: { ...settings.lip, enabled } })}
      />
      <SelectField
        id="settings-leftover"
        label="Unused space"
        value={settings.leftover}
        options={[
          { value: "spare", label: "Spare tray (open)" },
          { value: "solid", label: "Solid filler block" },
        ]}
        onChange={(leftover) => onChange({ ...settings, leftover })}
      />
    </div>
  );
}

/** The finger room switch's hint: what it does, and a custom advanced value if there is one. */
function fingerRoomHint(s: Settings): string {
  const base = `Makes the outer walls the finger cutouts go through ${FINGER_ROOM_MM} mm and the dividers they cross ${FINGER_DIVIDER_ROOM_MM} mm thicker, so you can reach in when trays sit tight.`;
  const { wallRoom, dividerRoom } = s.fingerPocket;
  return fingerRoomOf(s) === "custom"
    ? `${base} Custom: ${wallRoom} mm walls, ${dividerRoom} mm dividers.`
    : base;
}

/**
 * Simple mode: choices that write resolved numbers (spec §5): walls, fit and the finger room switch
 * (on for any wall room, including a custom one). Advanced mode edits the numbers.
 */
function SimpleChoices({ settings, onChange }: Omit<SettingsFormProps, "advanced">) {
  return (
    <>
      <SelectField
        id="settings-wallChoice"
        label="Walls"
        value={wallChoiceOf(settings)}
        options={wallOptions(settings)}
        onChange={(c) => {
          if (c !== "custom") {
            onChange(applyWallChoice(settings, c));
          }
        }}
      />
      <SelectField
        id="settings-fitChoice"
        label="Fit"
        value={fitChoiceOf(settings)}
        options={fitOptions(settings)}
        hint="Scales every clearance. Pick loose if your printer's parts usually come out snug."
        onChange={(c) => {
          if (c !== "custom") {
            onChange(applyFitChoice(settings, c));
          }
        }}
      />
      <CheckField
        id="settings-fingerRoom"
        label="Extra finger room in the box"
        checked={fingerRoomOf(settings) !== false}
        hint={fingerRoomHint(settings)}
        onChange={(on) => onChange(applyFingerRoom(settings, on))}
      />
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/ui/SettingsForm.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/ui/settingsFields.ts src/ui/SettingsForm.tsx src/ui/SettingsForm.test.tsx
git commit -m "Add simple and advanced settings form"
```

---

### Task 9: Shared component options and the cards editor

**Files:**

- Create: `src/ui/components/types.ts`
- Create: `src/ui/components/MoreOptions.tsx`
- Create: `src/ui/components/CommonOptions.tsx`
- Create: `src/ui/components/ToggleOptions.tsx`
- Create: `src/ui/components/CardsEditor.tsx`
- Test: `src/ui/components/CardsEditor.test.tsx`

**Interfaces:**

- Consumes: `setCardSides`, `setGroup`, `setPerPlayer`, `setClearance` (Task 1); `NumberField`, `TextField`, `SelectField`, `CheckField`, `useFieldNotices` (Task 6); `CARD_PRESETS` (`model/presets`); `fingerCutsOn`, `curvedFloorOn`, `cornerReliefsOn` (`model/defaults`); `CardsComponent`, `Component`.
- Produces:
  - `interface EditorProps<C extends Component> { component: C; index: number; advanced: boolean; onChange: (next: C) => void }`
  - `MoreOptions({ open, children }: { open: boolean; children: ComponentChildren })` — `<details>` "More options", open by default in advanced mode.
  - `CommonOptions<C extends Component>({ component, index, onChange }: Omit<EditorProps<C>, "advanced">)` — group (commit on blur), per player (disabled inside a group), own clearance.
  - `ToggleOptions<C extends Component>(props: EditorProps<C>)` — "Finger cuts", "Curved floor" (bulk, minis, custom, or set on another kind) and, in advanced mode, "Corner reliefs" (amendment 7).
  - `CUSTOM_SIZE = "custom"`; `cardPresetOf(c: CardsComponent): string`
  - `CardsEditor(props: EditorProps<CardsComponent>)` — size preset/custom (sides commit on blur, then short/long are ordered), sleeve none/standard/premium/custom, decks list, more options: "measure N cards" thickness, storage, common options.

Component field ids are `<component.id>-<field>`, validation paths `/components/<index>/<field>` (plan 1).

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/components/CardsEditor.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type { CardsComponent } from "../../model/types";
import { CardsEditor, cardPresetOf } from "./CardsEditor";

afterEach(cleanup);

function cards(over: Partial<CardsComponent> = {}): CardsComponent {
  const c = newComponent("cards");
  if (c.kind !== "cards") {
    throw new Error("expected cards");
  }
  return { ...c, id: "c1", ...over };
}

function setup(c: CardsComponent, advanced = false) {
  const onChange = vi.fn<(next: CardsComponent) => void>();
  const view = render(
    <CardsEditor component={c} index={0} advanced={advanced} onChange={onChange} />,
  );
  const last = (): CardsComponent => {
    const call = onChange.mock.calls.at(-1);
    if (!call) {
      throw new Error("onChange not called");
    }
    return call[0];
  };
  return { onChange, last, view };
}

describe("CardsEditor", () => {
  it("picks a size preset", () => {
    expect(cardPresetOf(cards())).toBe("standard");
    const { last } = setup(cards());
    fireEvent.change(screen.getByLabelText("Card size"), { target: { value: "tarot" } });
    expect(last()).toMatchObject({ shortSide: 70, longSide: 120 });
  });

  it("commits custom sides on blur and orders them short ≤ long", () => {
    const { onChange, last } = setup(cards());
    fireEvent.change(screen.getByLabelText("Card size"), { target: { value: "custom" } });
    const long = screen.getByLabelText(/Long side/);
    fireEvent.input(long, { target: { value: "1" } });
    fireEvent.input(long, { target: { value: "10" } });
    fireEvent.input(long, { target: { value: "100" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(long);
    expect(last()).toMatchObject({ shortSide: 63.5, longSide: 100 });
    const short = screen.getByLabelText(/Short side/);
    fireEvent.input(short, { target: { value: "120" } });
    fireEvent.blur(short);
    expect(last()).toMatchObject({ shortSide: 88, longSide: 120 });
  });

  it("edits, adds and removes decks", () => {
    const { last, view, onChange } = setup(cards());
    expect(screen.getByRole("button", { name: /Remove deck/ }).hasAttribute("disabled")).toBe(true);
    fireEvent.input(screen.getByLabelText("Cards in deck 1"), { target: { value: "52" } });
    expect(last().decks).toEqual([{ name: "Deck", count: 52 }]);
    fireEvent.click(screen.getByRole("button", { name: "Add deck" }));
    expect(last().decks).toHaveLength(2);
    view.rerender(
      <CardsEditor
        component={cards({
          decks: [
            { name: "A", count: 10 },
            { name: "B", count: 20 },
          ],
        })}
        index={0}
        advanced={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove deck A" }));
    expect(last().decks).toEqual([{ name: "B", count: 20 }]);
  });

  it("switches to custom sleeves and edits their size", () => {
    const { last, view, onChange } = setup(cards());
    fireEvent.change(screen.getByLabelText("Sleeves"), { target: { value: "premium" } });
    expect(last().sleeve).toBe("premium");
    fireEvent.change(screen.getByLabelText("Sleeves"), { target: { value: "custom" } });
    expect(last().sleeve).toEqual({ w: 66.5, h: 91, thickness: 0.1 });
    view.rerender(
      <CardsEditor
        component={cards({ sleeve: { w: 66.5, h: 91, thickness: 0.1 } })}
        index={0}
        advanced={false}
        onChange={onChange}
      />,
    );
    fireEvent.input(screen.getByLabelText(/Added thickness per card/), {
      target: { value: "0,2" },
    });
    expect(last().sleeve).toEqual({ w: 66.5, h: 91, thickness: 0.2 });
  });

  it("offers measure N cards, storage and common options under More options", () => {
    const { last, view, onChange } = setup(cards(), true);
    const details = screen.getByText("More options").closest("details");
    expect(details?.hasAttribute("open")).toBe(true);
    fireEvent.click(screen.getByLabelText(/Measure a stack/));
    expect(last().thickness).toEqual({ mode: "measured", cards: 50, stackMm: 20 });
    fireEvent.change(screen.getByLabelText("Storage"), { target: { value: "flat" } });
    expect(last().storage).toBe("flat");
    fireEvent.click(screen.getByLabelText(/per player/));
    expect(last().perPlayer).toEqual({ players: 4 });
    view.rerender(
      <CardsEditor component={cards({ groupId: "g" })} index={0} advanced onChange={onChange} />,
    );
    expect(screen.getByLabelText(/per player/).hasAttribute("disabled")).toBe(true);
    const group = screen.getByLabelText(/^Group/);
    fireEvent.input(group, { target: { value: "" } });
    fireEvent.blur(group);
    expect("groupId" in last()).toBe(false);
  });

  it("collapses More options in simple mode", () => {
    setup(cards());
    expect(screen.getByText("More options").closest("details")?.hasAttribute("open")).toBe(false);
  });

  it("shows finger cuts in simple mode, no curved floor, and corner reliefs in advanced mode", () => {
    const { last, view, onChange } = setup(cards());
    const cuts = screen.getByLabelText("Finger cuts");
    expect(cuts.closest("details")).toBeNull();
    expect((cuts as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText("Curved floor")).toBeNull();
    expect(screen.queryByLabelText("Corner reliefs")).toBeNull();
    fireEvent.click(cuts);
    expect(last().fingerCuts).toBe(false);
    view.rerender(<CardsEditor component={cards()} index={0} advanced onChange={onChange} />);
    const reliefs = screen.getByLabelText("Corner reliefs") as HTMLInputElement;
    expect(reliefs.checked).toBe(false);
    fireEvent.click(reliefs);
    expect(last().cornerReliefs).toBe(true);
  });

  it("shows a curved floor a file set on cards, so it can be turned off", () => {
    const { last } = setup(cards({ curvedFloor: true }));
    const floor = screen.getByLabelText("Curved floor") as HTMLInputElement;
    expect(floor.checked).toBe(true);
    fireEvent.click(floor);
    expect(last().curvedFloor).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/ui/components/CardsEditor.test.tsx`
Expected: FAIL — `Failed to resolve import "./CardsEditor"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ui/components/types.ts
import type { Component } from "../../model/types";

export interface EditorProps<C extends Component> {
  component: C;
  index: number;
  advanced: boolean;
  onChange: (next: C) => void;
}
```

```tsx
// src/ui/components/MoreOptions.tsx
import type { ComponentChildren } from "preact";

export interface MoreOptionsProps {
  open: boolean;
  children: ComponentChildren;
}

export function MoreOptions({ open, children }: MoreOptionsProps) {
  return (
    <details class="more-options" open={open}>
      <summary>More options</summary>
      <div class="form-grid">{children}</div>
    </details>
  );
}
```

```tsx
// src/ui/components/CommonOptions.tsx
import { setClearance, setGroup, setPerPlayer } from "../../app/actions";
import type { Component } from "../../model/types";
import { CheckField, TextField } from "../fields";
import { NumberField } from "../NumberField";
import { useFieldNotices } from "../validation";
import type { EditorProps } from "./types";

export function CommonOptions<C extends Component>({
  component: c,
  index,
  onChange,
}: Omit<EditorProps<C>, "advanced">) {
  const at = `/components/${index}`;
  const grouped = c.groupId !== undefined;
  const perPlayerNotes = useFieldNotices(`${at}/perPlayer`);
  return (
    <>
      <TextField
        id={`${c.id}-group`}
        label="Group (same group → same tray)"
        value={c.groupId ?? ""}
        commitOn="blur"
        placeholder="e.g. tokens"
        hint="Components with the same group name share one tray, each in its own compartment."
        onCommit={(v) => onChange(setGroup(c, v))}
      />
      <CheckField
        id={`${c.id}-perPlayer`}
        label="Counts are per player"
        checked={c.perPlayer !== undefined}
        disabled={grouped}
        hint={
          grouped
            ? "Not available for grouped components."
            : "Each player's set gets its own tray or compartment."
        }
        onChange={(on) => onChange(setPerPlayer(c, on ? 4 : undefined))}
      />
      {perPlayerNotes.length > 0 ? (
        <p class="field-error" role="alert">
          {perPlayerNotes.map((n) => n.message).join(" ")}
        </p>
      ) : null}
      {c.perPlayer !== undefined ? (
        <NumberField
          id={`${c.id}-players`}
          label="Players"
          value={c.perPlayer.players}
          integer
          min={1}
          max={10}
          path={`${at}/perPlayer/players`}
          onCommit={(v) => onChange(setPerPlayer(c, v))}
        />
      ) : null}
      <CheckField
        id={`${c.id}-ownClearance`}
        label="Use its own clearance"
        checked={c.clearance !== undefined}
        onChange={(on) => onChange(setClearance(c, on ? 1 : undefined))}
      />
      {c.clearance !== undefined ? (
        <NumberField
          id={`${c.id}-clearance`}
          label="Clearance (total, not scaled by Fit)"
          unit="mm"
          value={c.clearance}
          min={0}
          max={1000}
          path={`${at}/clearance`}
          onCommit={(v) => onChange(setClearance(c, v))}
        />
      ) : null}
    </>
  );
}
```

```tsx
// src/ui/components/ToggleOptions.tsx
import { cornerReliefsOn, curvedFloorOn, fingerCutsOn } from "../../model/defaults";
import type { Component } from "../../model/types";
import { CheckField } from "../fields";
import { useFieldNotices } from "../validation";
import type { EditorProps } from "./types";

/** Kinds that may have a curved floor (spec §5): it would bend cards and tilt upright tiles. */
const CURVED_KINDS: readonly Component["kind"][] = ["bulk", "minis", "custom"];

export function ToggleOptions<C extends Component>({
  component: c,
  index,
  advanced,
  onChange,
}: EditorProps<C>) {
  const floorNotes = useFieldNotices(`/components/${index}/curvedFloor`);
  return (
    <>
      <CheckField
        id={`${c.id}-fingerCuts`}
        label="Finger cuts"
        checked={fingerCutsOn(c)}
        hint="A cut through a wall of each compartment, to reach in."
        onChange={(on) => onChange({ ...c, fingerCuts: on })}
      />
      {CURVED_KINDS.includes(c.kind) || c.curvedFloor === true ? (
        <CheckField
          id={`${c.id}-curvedFloor`}
          label="Curved floor"
          checked={c.curvedFloor === true || curvedFloorOn(c)}
          hint="A ramp up one wall of each compartment, to scoop pieces out."
          onChange={(on) => onChange({ ...c, curvedFloor: on })}
        />
      ) : null}
      {floorNotes.length > 0 ? (
        <p class="field-error" role="alert">
          {floorNotes.map((n) => n.message).join(" ")}
        </p>
      ) : null}
      {advanced ? (
        <CheckField
          id={`${c.id}-cornerReliefs`}
          label="Corner reliefs"
          checked={cornerReliefsOn(c)}
          hint="Round holes in each compartment's corners, so square pieces sit flat."
          onChange={(on) => onChange({ ...c, cornerReliefs: on })}
        />
      ) : null}
    </>
  );
}
```

```tsx
// src/ui/components/CardsEditor.tsx
import { useState } from "preact/hooks";
import { setCardSides } from "../../app/actions";
import { CARD_PRESETS } from "../../model/presets";
import type { CardsComponent } from "../../model/types";
import { CheckField, SelectField, TextField } from "../fields";
import type { SelectOption } from "../fields";
import { NumberField } from "../NumberField";
import { CommonOptions } from "./CommonOptions";
import { MoreOptions } from "./MoreOptions";
import { ToggleOptions } from "./ToggleOptions";
import type { EditorProps } from "./types";

export const CUSTOM_SIZE = "custom";

export function cardPresetOf(c: CardsComponent): string {
  const preset = CARD_PRESETS.find((p) => p.shortSide === c.shortSide && p.longSide === c.longSide);
  return preset ? preset.id : CUSTOM_SIZE;
}

const SIZE_OPTIONS: SelectOption<string>[] = [
  ...CARD_PRESETS.map((p) => ({
    value: p.id,
    label: `${p.label} (${p.shortSide} × ${p.longSide} mm)`,
  })),
  { value: CUSTOM_SIZE, label: "Custom size" },
];

type SleeveChoice = "none" | "standard" | "premium" | "custom";

const SLEEVE_OPTIONS: SelectOption<SleeveChoice>[] = [
  { value: "none", label: "No sleeves" },
  { value: "standard", label: "Standard sleeves" },
  { value: "premium", label: "Premium (thick) sleeves" },
  { value: "custom", label: "Custom sleeves" },
];

const STORAGE_OPTIONS: SelectOption<CardsComponent["storage"]>[] = [
  { value: "auto", label: "Let the optimizer choose" },
  { value: "upright-long", label: "Upright, standing on the long edge" },
  { value: "upright-short", label: "Upright, standing on the short edge" },
  { value: "flat", label: "Lying flat" },
];

const LENGTH = { min: 0, minExclusive: true, max: 1000 };

export function CardsEditor({
  component: c,
  index,
  advanced,
  onChange,
}: EditorProps<CardsComponent>) {
  const at = `/components/${index}`;
  const matched = cardPresetOf(c);
  const [customSize, setCustomSize] = useState(matched === CUSTOM_SIZE);
  const sizeValue = customSize ? CUSTOM_SIZE : matched;
  const customSleeve = typeof c.sleeve === "object" ? c.sleeve : null;
  const sleeveChoice: SleeveChoice = typeof c.sleeve === "object" ? "custom" : c.sleeve;
  const measured = c.thickness.mode === "measured" ? c.thickness : null;

  const setDeck = (j: number, patch: Partial<CardsComponent["decks"][number]>): void => {
    onChange({ ...c, decks: c.decks.map((d, k) => (k === j ? { ...d, ...patch } : d)) });
  };

  return (
    <>
      <SelectField
        id={`${c.id}-size`}
        label="Card size"
        value={sizeValue}
        options={SIZE_OPTIONS}
        hint="The card itself, not the sleeve."
        onChange={(id) => {
          const preset = CARD_PRESETS.find((p) => p.id === id);
          if (preset) {
            setCustomSize(false);
            onChange(setCardSides(c, preset.shortSide, preset.longSide));
          } else {
            setCustomSize(true);
          }
        }}
      />
      {sizeValue === CUSTOM_SIZE ? (
        <>
          <NumberField
            id={`${c.id}-shortSide`}
            label="Short side"
            unit="mm"
            value={c.shortSide}
            path={`${at}/shortSide`}
            {...LENGTH}
            commitOn="blur"
            onCommit={(v) => onChange(setCardSides(c, v, c.longSide))}
          />
          <NumberField
            id={`${c.id}-longSide`}
            label="Long side"
            unit="mm"
            value={c.longSide}
            path={`${at}/longSide`}
            {...LENGTH}
            commitOn="blur"
            onCommit={(v) => onChange(setCardSides(c, c.shortSide, v))}
          />
        </>
      ) : null}
      <SelectField
        id={`${c.id}-sleeve`}
        label="Sleeves"
        value={sleeveChoice}
        options={SLEEVE_OPTIONS}
        onChange={(v) => {
          if (v === "custom") {
            if (!customSleeve) {
              onChange({ ...c, sleeve: { w: c.shortSide + 3, h: c.longSide + 3, thickness: 0.1 } });
            }
          } else {
            onChange({ ...c, sleeve: v });
          }
        }}
      />
      {customSleeve ? (
        <>
          <NumberField
            id={`${c.id}-sleeveW`}
            label="Sleeve outer width"
            unit="mm"
            value={customSleeve.w}
            path={`${at}/sleeve/w`}
            {...LENGTH}
            onCommit={(v) => onChange({ ...c, sleeve: { ...customSleeve, w: v } })}
          />
          <NumberField
            id={`${c.id}-sleeveH`}
            label="Sleeve outer length"
            unit="mm"
            value={customSleeve.h}
            path={`${at}/sleeve/h`}
            {...LENGTH}
            onCommit={(v) => onChange({ ...c, sleeve: { ...customSleeve, h: v } })}
          />
          <NumberField
            id={`${c.id}-sleeveT`}
            label="Added thickness per card"
            unit="mm"
            value={customSleeve.thickness}
            path={`${at}/sleeve/thickness`}
            min={0}
            max={1000}
            onCommit={(v) => onChange({ ...c, sleeve: { ...customSleeve, thickness: v } })}
          />
        </>
      ) : null}
      <fieldset class="list-rows">
        <legend>Decks</legend>
        {c.decks.map((deck, j) => (
          <div class="list-row" key={j}>
            <TextField
              id={`${c.id}-deck${j}-name`}
              label={`Name of deck ${j + 1}`}
              value={deck.name}
              onCommit={(name) => setDeck(j, { name })}
            />
            <NumberField
              id={`${c.id}-deck${j}-count`}
              label={`Cards in deck ${j + 1}`}
              value={deck.count}
              integer
              min={1}
              max={2000}
              path={`${at}/decks/${j}/count`}
              onCommit={(count) => setDeck(j, { count })}
            />
            <button
              type="button"
              class="row-remove"
              aria-label={`Remove deck ${deck.name === "" ? j + 1 : deck.name}`}
              disabled={c.decks.length <= 1}
              onClick={() => onChange({ ...c, decks: c.decks.filter((_d, k) => k !== j) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...c,
              decks: [...c.decks, { name: `Deck ${c.decks.length + 1}`, count: 50 }],
            })
          }
        >
          Add deck
        </button>
      </fieldset>
      <ToggleOptions component={c} index={index} advanced={advanced} onChange={onChange} />
      <MoreOptions open={advanced}>
        <CheckField
          id={`${c.id}-measured`}
          label="Measure a stack of cards (sleeves included)"
          checked={measured !== null}
          hint="More exact than the sleeve table: count some cards, measure the stack."
          onChange={(on) =>
            onChange({
              ...c,
              thickness: on ? { mode: "measured", cards: 50, stackMm: 20 } : { mode: "preset" },
            })
          }
        />
        {measured ? (
          <>
            <NumberField
              id={`${c.id}-measuredCards`}
              label="Cards in the measured stack"
              value={measured.cards}
              integer
              min={1}
              max={2000}
              path={`${at}/thickness/cards`}
              onCommit={(cards) => onChange({ ...c, thickness: { ...measured, cards } })}
            />
            <NumberField
              id={`${c.id}-measuredMm`}
              label="Height of that stack"
              unit="mm"
              value={measured.stackMm}
              path={`${at}/thickness/stackMm`}
              {...LENGTH}
              onCommit={(stackMm) => onChange({ ...c, thickness: { ...measured, stackMm } })}
            />
          </>
        ) : null}
        <SelectField
          id={`${c.id}-storage`}
          label="Storage"
          value={c.storage}
          options={STORAGE_OPTIONS}
          onChange={(storage) => onChange({ ...c, storage })}
        />
        <CommonOptions component={c} index={index} onChange={onChange} />
      </MoreOptions>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/ui/components/CardsEditor.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/ui/components/types.ts src/ui/components/MoreOptions.tsx src/ui/components/CommonOptions.tsx src/ui/components/ToggleOptions.tsx src/ui/components/CardsEditor.tsx src/ui/components/CardsEditor.test.tsx
git commit -m "Add cards editor with shared component options"
```

---

### Task 10: Bits, tiles, minis and custom editors

**Files:**

- Create: `src/ui/components/BulkEditor.tsx`
- Create: `src/ui/components/TilesEditor.tsx`
- Create: `src/ui/components/MinisEditor.tsx`
- Create: `src/ui/components/CustomEditor.tsx`
- Test: `src/ui/components/editors.test.tsx`

**Interfaces:**

- Consumes: `EditorProps`, `MoreOptions`, `CommonOptions`, `ToggleOptions` (Task 9); `NumberField`, `TextField`, `SelectField` (Task 6); `BulkComponent`, `BulkItem`, `TilesComponent`, `TileShape`, `MinisComponent`, `CustomComponent`.
- Produces:
  - `BulkEditor(props: EditorProps<BulkComponent>)` — item rows, each either count × w × d × h or a pile volume in ml.
  - `TilesEditor(props: EditorProps<TilesComponent>)` — rect (w, d) or hex (flat-to-flat, orientation), thickness, count; more options: storage.
  - `MinisEditor(props: EditorProps<MinisComponent>)` — figure rows (w, d, h, count); more options: storage pockets/bulk.
  - `CustomEditor(props: EditorProps<CustomComponent>)` — w, d, h, count.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/components/editors.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type {
  BulkComponent,
  Component,
  CustomComponent,
  MinisComponent,
  TilesComponent,
} from "../../model/types";
import { BulkEditor } from "./BulkEditor";
import { CustomEditor } from "./CustomEditor";
import { MinisEditor } from "./MinisEditor";
import { TilesEditor } from "./TilesEditor";

afterEach(cleanup);

function of<K extends Component["kind"]>(kind: K): Extract<Component, { kind: K }> {
  const c = newComponent(kind);
  if (c.kind !== kind) {
    throw new Error(`expected ${kind}`);
  }
  return { ...(c as Extract<Component, { kind: K }>), id: "x1" };
}

function lastOf<T>(fn: { mock: { calls: T[][] } }): T {
  const call = fn.mock.calls.at(-1);
  if (!call || call[0] === undefined) {
    throw new Error("not called");
  }
  return call[0];
}

describe("BulkEditor", () => {
  it("switches an item to a pile volume and edits it", () => {
    const onChange = vi.fn<(c: BulkComponent) => void>();
    const view = render(
      <BulkEditor component={of("bulk")} index={0} advanced={false} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("How to size item 1"), { target: { value: "volume" } });
    expect(lastOf(onChange).items).toEqual([{ name: "Tokens", volumeMl: 50 }]);
    view.rerender(
      <BulkEditor
        component={{ ...of("bulk"), items: [{ name: "Coins", volumeMl: 50 }] }}
        index={0}
        advanced={false}
        onChange={onChange}
      />,
    );
    fireEvent.input(screen.getByLabelText(/Volume of item 1/), { target: { value: "75,5" } });
    expect(lastOf(onChange).items).toEqual([{ name: "Coins", volumeMl: 75.5 }]);
  });

  it("edits piece sizes and adds items", () => {
    const onChange = vi.fn<(c: BulkComponent) => void>();
    render(<BulkEditor component={of("bulk")} index={0} advanced={false} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText("How many of item 1"), { target: { value: "30" } });
    expect(lastOf(onChange).items[0]).toMatchObject({ count: 30 });
    fireEvent.input(screen.getByLabelText(/Item 1 height/), { target: { value: "2,5" } });
    expect(lastOf(onChange).items[0]).toMatchObject({ h: 2.5 });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(lastOf(onChange).items).toHaveLength(2);
  });
});

describe("TilesEditor", () => {
  it("switches to hexagons and sets the orientation", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    const view = render(
      <TilesEditor component={of("tiles")} index={0} advanced={false} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("Tile shape"), { target: { value: "hex" } });
    expect(lastOf(onChange).shape).toEqual({ type: "hex", flatToFlat: 40, orientation: "flat" });
    view.rerender(
      <TilesEditor
        component={{ ...of("tiles"), shape: { type: "hex", flatToFlat: 40, orientation: "flat" } }}
        index={0}
        advanced={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Hex orientation"), { target: { value: "pointy" } });
    expect(lastOf(onChange).shape).toEqual({ type: "hex", flatToFlat: 40, orientation: "pointy" });
    fireEvent.input(screen.getByLabelText(/Hex size/), { target: { value: "45" } });
    expect(lastOf(onChange).shape).toEqual({ type: "hex", flatToFlat: 45, orientation: "flat" });
    fireEvent.input(screen.getByLabelText("Number of tiles"), { target: { value: "60" } });
    expect(lastOf(onChange).count).toBe(60);
  });

  it("offers storage under More options", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    render(<TilesEditor component={of("tiles")} index={0} advanced onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Storage"), { target: { value: "upright" } });
    expect(lastOf(onChange).storage).toBe("upright");
  });
});

describe("MinisEditor", () => {
  it("edits figures and storage", () => {
    const onChange = vi.fn<(c: MinisComponent) => void>();
    render(<MinisEditor component={of("minis")} index={0} advanced onChange={onChange} />);
    fireEvent.input(screen.getByLabelText(/Figure 1 height/), { target: { value: "55" } });
    expect(lastOf(onChange).figures[0]).toMatchObject({ h: 55 });
    fireEvent.click(screen.getByRole("button", { name: "Add figure" }));
    expect(lastOf(onChange).figures).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Storage"), { target: { value: "bulk" } });
    expect(lastOf(onChange).storage).toBe("bulk");
  });
});

describe("toggles", () => {
  it("defaults bits to a curved floor without finger cuts, and turns cuts on", () => {
    const onChange = vi.fn<(c: BulkComponent) => void>();
    render(<BulkEditor component={of("bulk")} index={0} advanced={false} onChange={onChange} />);
    expect((screen.getByLabelText("Curved floor") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Finger cuts"));
    expect(lastOf(onChange).fingerCuts).toBe(true);
  });

  it("offers no curved floor on tiles, and corner reliefs on by default in advanced mode", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    render(<TilesEditor component={of("tiles")} index={0} advanced onChange={onChange} />);
    expect(screen.queryByLabelText("Curved floor")).toBeNull();
    fireEvent.click(screen.getByLabelText("Corner reliefs"));
    expect(lastOf(onChange).cornerReliefs).toBe(false);
  });
});

describe("CustomEditor", () => {
  it("edits sizes and rejects a fractional count", () => {
    const onChange = vi.fn<(c: CustomComponent) => void>();
    render(
      <CustomEditor component={of("custom")} index={0} advanced={false} onChange={onChange} />,
    );
    fireEvent.input(screen.getByLabelText(/^Width/), { target: { value: "70" } });
    expect(lastOf(onChange).w).toBe(70);
    fireEvent.input(screen.getByLabelText("How many"), { target: { value: "2,5" } });
    expect(screen.getByRole("alert").textContent).toMatch(/whole number/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/ui/components/editors.test.tsx`
Expected: FAIL — `Failed to resolve import "./BulkEditor"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/ui/components/BulkEditor.tsx
import type { BulkComponent, BulkItem } from "../../model/types";
import { SelectField, TextField } from "../fields";
import { NumberField } from "../NumberField";
import { CommonOptions } from "./CommonOptions";
import { MoreOptions } from "./MoreOptions";
import { ToggleOptions } from "./ToggleOptions";
import type { EditorProps } from "./types";

const LENGTH = { min: 0, minExclusive: true, max: 1000 };

export function BulkEditor({
  component: c,
  index,
  advanced,
  onChange,
}: EditorProps<BulkComponent>) {
  const at = `/components/${index}`;
  const setItem = (j: number, item: BulkItem): void => {
    onChange({ ...c, items: c.items.map((x, k) => (k === j ? item : x)) });
  };
  return (
    <>
      <fieldset class="list-rows">
        <legend>Items</legend>
        {c.items.map((item, j) => {
          const n = j + 1;
          const volume = "volumeMl" in item ? item : null;
          const pieces = "volumeMl" in item ? null : item;
          return (
            <div class="list-row" key={j}>
              <TextField
                id={`${c.id}-item${j}-name`}
                label={`Name of item ${n}`}
                value={item.name}
                onCommit={(name) => setItem(j, { ...item, name })}
              />
              <SelectField
                id={`${c.id}-item${j}-kind`}
                label={`How to size item ${n}`}
                value={volume ? "volume" : "pieces"}
                options={[
                  { value: "pieces", label: "Count × size" },
                  { value: "volume", label: "Pile volume" },
                ]}
                hint="Use the pile volume for coins or cubes: pour them into a measuring cup."
                onChange={(kind) =>
                  setItem(
                    j,
                    kind === "volume"
                      ? { name: item.name, volumeMl: 50 }
                      : { name: item.name, count: 10, w: 16, d: 16, h: 4 },
                  )
                }
              />
              {volume ? (
                <NumberField
                  id={`${c.id}-item${j}-volume`}
                  label={`Volume of item ${n}`}
                  unit="ml"
                  value={volume.volumeMl}
                  min={0}
                  minExclusive
                  max={1_000_000}
                  path={`${at}/items/${j}/volumeMl`}
                  onCommit={(volumeMl) => setItem(j, { ...volume, volumeMl })}
                />
              ) : null}
              {pieces ? (
                <>
                  <NumberField
                    id={`${c.id}-item${j}-count`}
                    label={`How many of item ${n}`}
                    value={pieces.count}
                    integer
                    min={1}
                    max={2000}
                    path={`${at}/items/${j}/count`}
                    onCommit={(count) => setItem(j, { ...pieces, count })}
                  />
                  <NumberField
                    id={`${c.id}-item${j}-w`}
                    label={`Item ${n} width`}
                    unit="mm"
                    value={pieces.w}
                    path={`${at}/items/${j}/w`}
                    {...LENGTH}
                    onCommit={(w) => setItem(j, { ...pieces, w })}
                  />
                  <NumberField
                    id={`${c.id}-item${j}-d`}
                    label={`Item ${n} depth`}
                    unit="mm"
                    value={pieces.d}
                    path={`${at}/items/${j}/d`}
                    {...LENGTH}
                    onCommit={(d) => setItem(j, { ...pieces, d })}
                  />
                  <NumberField
                    id={`${c.id}-item${j}-h`}
                    label={`Item ${n} height`}
                    unit="mm"
                    value={pieces.h}
                    path={`${at}/items/${j}/h`}
                    {...LENGTH}
                    onCommit={(h) => setItem(j, { ...pieces, h })}
                  />
                </>
              ) : null}
              <button
                type="button"
                class="row-remove"
                aria-label={`Remove item ${item.name === "" ? n : item.name}`}
                disabled={c.items.length <= 1}
                onClick={() => onChange({ ...c, items: c.items.filter((_x, k) => k !== j) })}
              >
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...c,
              items: [
                ...c.items,
                { name: `Item ${c.items.length + 1}`, count: 10, w: 16, d: 16, h: 4 },
              ],
            })
          }
        >
          Add item
        </button>
      </fieldset>
      <ToggleOptions component={c} index={index} advanced={advanced} onChange={onChange} />
      <MoreOptions open={advanced}>
        <CommonOptions component={c} index={index} onChange={onChange} />
      </MoreOptions>
    </>
  );
}
```

```tsx
// src/ui/components/TilesEditor.tsx
import type { TileShape, TilesComponent } from "../../model/types";
import { SelectField } from "../fields";
import { NumberField } from "../NumberField";
import { CommonOptions } from "./CommonOptions";
import { MoreOptions } from "./MoreOptions";
import { ToggleOptions } from "./ToggleOptions";
import type { EditorProps } from "./types";

const LENGTH = { min: 0, minExclusive: true, max: 1000 };

const DEFAULT_SHAPES: Record<TileShape["type"], TileShape> = {
  rect: { type: "rect", w: 50, d: 50 },
  hex: { type: "hex", flatToFlat: 40, orientation: "flat" },
};

export function TilesEditor({
  component: c,
  index,
  advanced,
  onChange,
}: EditorProps<TilesComponent>) {
  const at = `/components/${index}`;
  const rect = c.shape.type === "rect" ? c.shape : null;
  const hex = c.shape.type === "hex" ? c.shape : null;
  return (
    <>
      <SelectField
        id={`${c.id}-shape`}
        label="Tile shape"
        value={c.shape.type}
        options={[
          { value: "rect", label: "Rectangle or square" },
          { value: "hex", label: "Hexagon" },
        ]}
        onChange={(type) => {
          if (type !== c.shape.type) {
            onChange({ ...c, shape: DEFAULT_SHAPES[type] });
          }
        }}
      />
      {rect ? (
        <>
          <NumberField
            id={`${c.id}-tileW`}
            label="Tile width"
            unit="mm"
            value={rect.w}
            path={`${at}/shape/w`}
            {...LENGTH}
            onCommit={(w) => onChange({ ...c, shape: { ...rect, w } })}
          />
          <NumberField
            id={`${c.id}-tileD`}
            label="Tile depth"
            unit="mm"
            value={rect.d}
            path={`${at}/shape/d`}
            {...LENGTH}
            onCommit={(d) => onChange({ ...c, shape: { ...rect, d } })}
          />
        </>
      ) : null}
      {hex ? (
        <>
          <NumberField
            id={`${c.id}-hexSize`}
            label="Hex size (flat to flat)"
            unit="mm"
            value={hex.flatToFlat}
            path={`${at}/shape/flatToFlat`}
            {...LENGTH}
            onCommit={(flatToFlat) => onChange({ ...c, shape: { ...hex, flatToFlat } })}
          />
          <SelectField
            id={`${c.id}-hexOrientation`}
            label="Hex orientation"
            value={hex.orientation}
            options={[
              { value: "flat", label: "A flat edge faces the tray front" },
              { value: "pointy", label: "A corner faces the tray front" },
            ]}
            onChange={(orientation) => onChange({ ...c, shape: { ...hex, orientation } })}
          />
        </>
      ) : null}
      <NumberField
        id={`${c.id}-thickness`}
        label="Tile thickness"
        unit="mm"
        value={c.thickness}
        path={`${at}/thickness`}
        {...LENGTH}
        onCommit={(thickness) => onChange({ ...c, thickness })}
      />
      <NumberField
        id={`${c.id}-count`}
        label="Number of tiles"
        value={c.count}
        integer
        min={1}
        max={2000}
        path={`${at}/count`}
        onCommit={(count) => onChange({ ...c, count })}
      />
      <ToggleOptions component={c} index={index} advanced={advanced} onChange={onChange} />
      <MoreOptions open={advanced}>
        <SelectField
          id={`${c.id}-storage`}
          label="Storage"
          value={c.storage}
          options={[
            { value: "auto", label: "Let the optimizer choose" },
            { value: "flat", label: "Lying flat in stacks" },
            { value: "upright", label: "Upright, like cards" },
          ]}
          onChange={(storage) => onChange({ ...c, storage })}
        />
        <CommonOptions component={c} index={index} onChange={onChange} />
      </MoreOptions>
    </>
  );
}
```

```tsx
// src/ui/components/MinisEditor.tsx
import type { MinisComponent } from "../../model/types";
import { SelectField, TextField } from "../fields";
import { NumberField } from "../NumberField";
import { CommonOptions } from "./CommonOptions";
import { MoreOptions } from "./MoreOptions";
import { ToggleOptions } from "./ToggleOptions";
import type { EditorProps } from "./types";

const LENGTH = { min: 0, minExclusive: true, max: 1000 };

type Figure = MinisComponent["figures"][number];

export function MinisEditor({
  component: c,
  index,
  advanced,
  onChange,
}: EditorProps<MinisComponent>) {
  const at = `/components/${index}`;
  const setFigure = (j: number, patch: Partial<Figure>): void => {
    onChange({ ...c, figures: c.figures.map((f, k) => (k === j ? { ...f, ...patch } : f)) });
  };
  return (
    <>
      <fieldset class="list-rows">
        <legend>Figures</legend>
        {c.figures.map((f, j) => {
          const n = j + 1;
          return (
            <div class="list-row" key={j}>
              <TextField
                id={`${c.id}-fig${j}-name`}
                label={`Name of figure ${n}`}
                value={f.name}
                onCommit={(name) => setFigure(j, { name })}
              />
              <NumberField
                id={`${c.id}-fig${j}-w`}
                label={`Figure ${n} width`}
                unit="mm"
                value={f.w}
                path={`${at}/figures/${j}/w`}
                {...LENGTH}
                onCommit={(w) => setFigure(j, { w })}
              />
              <NumberField
                id={`${c.id}-fig${j}-d`}
                label={`Figure ${n} depth`}
                unit="mm"
                value={f.d}
                path={`${at}/figures/${j}/d`}
                {...LENGTH}
                onCommit={(d) => setFigure(j, { d })}
              />
              <NumberField
                id={`${c.id}-fig${j}-h`}
                label={`Figure ${n} height`}
                unit="mm"
                value={f.h}
                path={`${at}/figures/${j}/h`}
                {...LENGTH}
                onCommit={(h) => setFigure(j, { h })}
              />
              <NumberField
                id={`${c.id}-fig${j}-count`}
                label={`How many of figure ${n}`}
                value={f.count}
                integer
                min={1}
                max={2000}
                path={`${at}/figures/${j}/count`}
                onCommit={(count) => setFigure(j, { count })}
              />
              <button
                type="button"
                class="row-remove"
                aria-label={`Remove figure ${f.name === "" ? n : f.name}`}
                disabled={c.figures.length <= 1}
                onClick={() => onChange({ ...c, figures: c.figures.filter((_f, k) => k !== j) })}
              >
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...c,
              figures: [
                ...c.figures,
                { name: `Figure ${c.figures.length + 1}`, w: 25, d: 25, h: 40, count: 1 },
              ],
            })
          }
        >
          Add figure
        </button>
      </fieldset>
      <ToggleOptions component={c} index={index} advanced={advanced} onChange={onChange} />
      <MoreOptions open={advanced}>
        <SelectField
          id={`${c.id}-storage`}
          label="Storage"
          value={c.storage}
          options={[
            { value: "pockets", label: "One pocket per figure" },
            { value: "bulk", label: "Loose in a scoop tray" },
          ]}
          onChange={(storage) => onChange({ ...c, storage })}
        />
        <CommonOptions component={c} index={index} onChange={onChange} />
      </MoreOptions>
    </>
  );
}
```

```tsx
// src/ui/components/CustomEditor.tsx
import type { CustomComponent } from "../../model/types";
import { NumberField } from "../NumberField";
import { CommonOptions } from "./CommonOptions";
import { MoreOptions } from "./MoreOptions";
import { ToggleOptions } from "./ToggleOptions";
import type { EditorProps } from "./types";

const LENGTH = { min: 0, minExclusive: true, max: 1000 };

export function CustomEditor({
  component: c,
  index,
  advanced,
  onChange,
}: EditorProps<CustomComponent>) {
  const at = `/components/${index}`;
  return (
    <>
      <NumberField
        id={`${c.id}-w`}
        label="Width"
        unit="mm"
        value={c.w}
        path={`${at}/w`}
        {...LENGTH}
        onCommit={(w) => onChange({ ...c, w })}
      />
      <NumberField
        id={`${c.id}-d`}
        label="Depth"
        unit="mm"
        value={c.d}
        path={`${at}/d`}
        {...LENGTH}
        onCommit={(d) => onChange({ ...c, d })}
      />
      <NumberField
        id={`${c.id}-h`}
        label="Height"
        unit="mm"
        value={c.h}
        path={`${at}/h`}
        {...LENGTH}
        onCommit={(h) => onChange({ ...c, h })}
      />
      <NumberField
        id={`${c.id}-count`}
        label="How many"
        value={c.count}
        integer
        min={1}
        max={2000}
        path={`${at}/count`}
        onCommit={(count) => onChange({ ...c, count })}
      />
      <ToggleOptions component={c} index={index} advanced={advanced} onChange={onChange} />
      <MoreOptions open={advanced}>
        <CommonOptions component={c} index={index} onChange={onChange} />
      </MoreOptions>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/ui/components/editors.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/ui/components/BulkEditor.tsx src/ui/components/TilesEditor.tsx src/ui/components/MinisEditor.tsx src/ui/components/CustomEditor.tsx src/ui/components/editors.test.tsx
git commit -m "Add bits, tiles, minis and custom editors"
```

---

### Task 11: Component card and component list

**Files:**

- Create: `src/ui/components/ComponentCard.tsx`
- Create: `src/ui/components/ComponentList.tsx`
- Test: `src/ui/components/ComponentList.test.tsx`

**Interfaces:**

- Consumes: the five editors (Tasks 9–10), `TextField`, `SelectField` (Task 6), `KIND_NAMES`, `newComponent` (`model/defaults`), `Component`, `ComponentKind`, `Access`.
- Produces:
  - `ADD_LABELS: Record<ComponentKind, string>` — "Add cards", "Add bits", "Add tiles", "Add miniatures", "Add other item".
  - `interface ComponentCardProps { component: Component; index: number; advanced: boolean; onChange: (next: Component) => void; onRemove: () => void }`; `ComponentCard(props)` — heading, name, access ("needed during play"), kind editor.
  - `interface ComponentListProps { components: readonly Component[]; advanced: boolean; onAdd: (kind: ComponentKind) => void; onChange: (id: string, next: Component) => void; onRemove: (id: string) => void }`; `ComponentList(props)`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/components/ComponentList.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type { Component, ComponentKind } from "../../model/types";
import { ComponentList } from "./ComponentList";

afterEach(cleanup);

const KINDS: ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];

function handlers() {
  return { onAdd: vi.fn(), onChange: vi.fn(), onRemove: vi.fn() };
}

describe("ComponentList", () => {
  it("shows a hint and add buttons when empty", () => {
    const h = handlers();
    render(<ComponentList components={[]} advanced={false} {...h} />);
    expect(screen.getByText(/Add what goes in the box/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add bits" }));
    expect(h.onAdd).toHaveBeenCalledWith("bulk");
    for (const name of ["Add cards", "Add tiles", "Add miniatures", "Add other item"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("renders the right editor for every kind", () => {
    const comps: Component[] = KINDS.map((k) => newComponent(k));
    render(<ComponentList components={comps} advanced={false} {...handlers()} />);
    expect(screen.getByLabelText("Card size")).toBeTruthy();
    expect(screen.getByLabelText("How to size item 1")).toBeTruthy();
    expect(screen.getByLabelText("Tile shape")).toBeTruthy();
    expect(screen.getByLabelText(/Figure 1 height/)).toBeTruthy();
    expect(screen.getByLabelText("How many")).toBeTruthy();
    expect(screen.getAllByRole("region")).toHaveLength(5);
  });

  it("renames, sets access and removes", () => {
    const c = { ...newComponent("cards"), name: "Main deck" };
    const h = handlers();
    render(<ComponentList components={[c]} advanced={false} {...h} />);
    expect(screen.getByRole("heading", { name: "Cards: Main deck" })).toBeTruthy();
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Market" } });
    expect(h.onChange).toHaveBeenLastCalledWith(c.id, { ...c, name: "Market" });
    fireEvent.change(screen.getByLabelText("Needed during play"), { target: { value: "often" } });
    expect(h.onChange).toHaveBeenLastCalledWith(c.id, { ...c, access: "often" });
    fireEvent.click(screen.getByRole("button", { name: "Remove Main deck" }));
    expect(h.onRemove).toHaveBeenCalledWith(c.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/ui/components/ComponentList.test.tsx`
Expected: FAIL — `Failed to resolve import "./ComponentList"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/ui/components/ComponentCard.tsx
import { KIND_NAMES } from "../../model/defaults";
import type { Access, Component } from "../../model/types";
import { SelectField, TextField } from "../fields";
import type { SelectOption } from "../fields";
import { BulkEditor } from "./BulkEditor";
import { CardsEditor } from "./CardsEditor";
import { CustomEditor } from "./CustomEditor";
import { MinisEditor } from "./MinisEditor";
import { TilesEditor } from "./TilesEditor";

const ACCESS_OPTIONS: SelectOption<Access>[] = [
  { value: "often", label: "Often" },
  { value: "sometimes", label: "Sometimes" },
  { value: "setup", label: "Only at setup" },
];

export interface ComponentCardProps {
  component: Component;
  index: number;
  advanced: boolean;
  onChange: (next: Component) => void;
  onRemove: () => void;
}

function KindEditor({
  component: c,
  index,
  advanced,
  onChange,
}: Omit<ComponentCardProps, "onRemove">) {
  switch (c.kind) {
    case "cards":
      return <CardsEditor component={c} index={index} advanced={advanced} onChange={onChange} />;
    case "bulk":
      return <BulkEditor component={c} index={index} advanced={advanced} onChange={onChange} />;
    case "tiles":
      return <TilesEditor component={c} index={index} advanced={advanced} onChange={onChange} />;
    case "minis":
      return <MinisEditor component={c} index={index} advanced={advanced} onChange={onChange} />;
    case "custom":
      return <CustomEditor component={c} index={index} advanced={advanced} onChange={onChange} />;
  }
}

export function ComponentCard({
  component: c,
  index,
  advanced,
  onChange,
  onRemove,
}: ComponentCardProps) {
  const headingId = `${c.id}-heading`;
  return (
    <section class="component-card" aria-labelledby={headingId}>
      <div class="component-card-header">
        <h3 id={headingId}>
          {KIND_NAMES[c.kind]}: {c.name === "" ? "(unnamed)" : c.name}
        </h3>
        <button type="button" class="row-remove" aria-label={`Remove ${c.name}`} onClick={onRemove}>
          Remove
        </button>
      </div>
      <div class="form-grid">
        <TextField
          id={`${c.id}-name`}
          label="Name"
          value={c.name}
          onCommit={(name) => onChange({ ...c, name })}
        />
        <SelectField
          id={`${c.id}-access`}
          label="Needed during play"
          value={c.access}
          options={ACCESS_OPTIONS}
          hint="Often-used parts are kept out from under other trays."
          onChange={(access) => onChange({ ...c, access })}
        />
        <KindEditor component={c} index={index} advanced={advanced} onChange={onChange} />
      </div>
    </section>
  );
}
```

```tsx
// src/ui/components/ComponentList.tsx
import type { Component, ComponentKind } from "../../model/types";
import { ComponentCard } from "./ComponentCard";

const KINDS: ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];

export const ADD_LABELS: Record<ComponentKind, string> = {
  cards: "Add cards",
  bulk: "Add bits",
  tiles: "Add tiles",
  minis: "Add miniatures",
  custom: "Add other item",
};

export interface ComponentListProps {
  components: readonly Component[];
  advanced: boolean;
  onAdd: (kind: ComponentKind) => void;
  onChange: (id: string, next: Component) => void;
  onRemove: (id: string) => void;
}

export function ComponentList({
  components,
  advanced,
  onAdd,
  onChange,
  onRemove,
}: ComponentListProps) {
  return (
    <div class="component-list">
      {components.length === 0 ? (
        <p class="hint">
          Add what goes in the box: cards, bits (tokens, cubes, dice), tiles, miniatures or anything
          else.
        </p>
      ) : null}
      {components.map((c, i) => (
        <ComponentCard
          key={c.id}
          component={c}
          index={i}
          advanced={advanced}
          onChange={(next) => onChange(c.id, next)}
          onRemove={() => onRemove(c.id)}
        />
      ))}
      <div class="add-buttons" role="group" aria-label="Add a component">
        {KINDS.map((k) => (
          <button type="button" key={k} onClick={() => onAdd(k)}>
            {ADD_LABELS[k]}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/ui/components/ComponentList.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/ui/components/ComponentCard.tsx src/ui/components/ComponentList.tsx src/ui/components/ComponentList.test.tsx
git commit -m "Add component cards and the component list"
```

---

### Task 12: Project menu, downloads and share links

**Files:**

- Create: `src/app/download.ts`
- Create: `src/app/link.ts`
- Create: `src/ui/ProjectMenu.tsx`
- Test: `src/app/link.test.ts`, `src/ui/ProjectMenu.test.tsx`

**Interfaces:**

- Consumes: `LINK_MAX_URL_CHARS` (2000, Discord's message limit on the whole URL; plan 1), `encodeHash`, `ProjectListEntry` (`share`); `optimize`, `DEFAULT_ITERATIONS` (`layout`), `FIXTURES`, `fixtureInput` (`layout/test-fixtures`, plan 4 test helper), `parseProject` (tests); `TextField`, `SelectField` (Task 6).
- Produces:
  - `downloadBlob(blob: Blob, filename: string): void`; `bytesToBlob(data: Uint8Array, type: string): Blob`; `fileSlug(name: string): string` (`[A-Za-z0-9._-]`, `"insert"` when empty)
  - `shareLink(href: string, hash: string): string` — replaces any existing fragment.
  - `type CopyLinkResult = { status: "copied"; length: number; tooLong: boolean } | { status: "failed"; length: number; tooLong: boolean; link: string; error: string }`
  - `copyLink(link: string, write: (text: string) => Promise<void>): Promise<CopyLinkResult>` — `tooLong` when the whole `link.length > LINK_MAX_URL_CHARS`. A test builds each feasible fixture's link with a stored layout (`optimize(fixtureInput(name), 1, DEFAULT_ITERATIONS)`) on the GitHub Pages URL `https://igorzamyslov.github.io/static-web-apps/insert-generator/` and checks it fits (measured: ≈ 1 650–1 980 characters).
  - `interface ProjectMenuProps { name: string; currentId: string; projects: readonly ProjectListEntry[]; storageAvailable: boolean; onRename: (name: string) => void; onOpen: (id: string) => void; onNew: () => void; onDelete: (id: string) => void; onImport: (text: string) => void; onExportJson: () => void; onCopyLink: () => Promise<CopyLinkResult> }`; `ProjectMenu(props)`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/link.test.ts
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ITERATIONS, optimize } from "../layout";
import { FIXTURES, fixtureInput } from "../layout/test-fixtures";
import { parseProject } from "../model/schema";
import { LINK_MAX_URL_CHARS, encodeHash } from "../share";
import { fileSlug } from "./download";
import { copyLink, shareLink } from "./link";

describe("shareLink", () => {
  it("replaces an existing fragment", () => {
    expect(shareLink("https://x.test/app/#1.old", "#1.new")).toBe("https://x.test/app/#1.new");
    expect(shareLink("https://x.test/app/", "#1.new")).toBe("https://x.test/app/#1.new");
  });
});

describe("copyLink", () => {
  it("copies and flags whole links over the 2 000-character message limit", async () => {
    const write = vi.fn(() => Promise.resolve());
    expect(await copyLink("short", write)).toEqual({ status: "copied", length: 5, tooLong: false });
    const limit = "x".repeat(LINK_MAX_URL_CHARS);
    expect((await copyLink(limit, write)).tooLong).toBe(false);
    expect(await copyLink(`${limit}x`, write)).toEqual({
      status: "copied",
      length: LINK_MAX_URL_CHARS + 1,
      tooLong: true,
    });
  });

  it("reports a refused clipboard with the link to copy by hand", async () => {
    const write = vi.fn(() => Promise.reject(new Error("denied")));
    expect(await copyLink("abc", write)).toEqual({
      status: "failed",
      length: 3,
      tooLong: false,
      link: "abc",
      error: "denied",
    });
  });
});

// The real deployment: the whole URL must fit a Discord message (2 000 characters).
const PAGES_URL = "https://igorzamyslov.github.io/static-web-apps/insert-generator/";

describe("share links of the fixtures with a stored layout", () => {
  for (const name of ["cards-heavy", "bits-heavy", "tiles-minis"] as const) {
    it(`${name} fits in ${LINK_MAX_URL_CHARS} characters on GitHub Pages`, () => {
      const parsed = parseProject(FIXTURES[name]);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const { layout } = optimize(fixtureInput(name), 1, DEFAULT_ITERATIONS);
      expect(layout).not.toBeNull();
      const link = shareLink(
        PAGES_URL,
        encodeHash({ ...parsed.project, layout: layout ?? undefined }, parsed.foreign),
      );
      expect(link.length).toBeLessThanOrEqual(LINK_MAX_URL_CHARS);
    });
  }
});

describe("fileSlug", () => {
  it("keeps safe characters only", () => {
    expect(fileSlug("  Ark Nova: Marine ")).toBe("Ark-Nova-Marine");
    expect(fileSlug("???")).toBe("insert");
  });
});
```

```tsx
// src/ui/ProjectMenu.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CopyLinkResult } from "../app/link";
import { ProjectMenu } from "./ProjectMenu";
import type { ProjectMenuProps } from "./ProjectMenu";

afterEach(cleanup);

function props(over: Partial<ProjectMenuProps> = {}): ProjectMenuProps {
  return {
    name: "Wingspan",
    currentId: "a",
    projects: [
      { id: "a", name: "Wingspan", updatedAt: 2 },
      { id: "b", name: "Ark Nova", updatedAt: 1 },
    ],
    storageAvailable: true,
    onRename: vi.fn(),
    onOpen: vi.fn(),
    onNew: vi.fn(),
    onDelete: vi.fn(),
    onImport: vi.fn(),
    onExportJson: vi.fn(),
    onCopyLink: vi.fn(() =>
      Promise.resolve<CopyLinkResult>({ status: "copied", length: 300, tooLong: false }),
    ),
    ...over,
  };
}

describe("ProjectMenu", () => {
  it("renames, opens, creates, deletes and exports", () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    fireEvent.input(screen.getByLabelText("Project name"), { target: { value: "Wingspan 2" } });
    expect(p.onRename).toHaveBeenCalledWith("Wingspan 2");
    fireEvent.change(screen.getByLabelText("Saved projects"), { target: { value: "b" } });
    expect(p.onOpen).toHaveBeenCalledWith("b");
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(p.onNew).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    expect(p.onDelete).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(p.onExportJson).toHaveBeenCalled();
  });

  it("imports a chosen JSON file", async () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    const input = screen.getByLabelText("Import a project JSON file");
    const file = new File(['{"hello":1}'], "game.insert.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(p.onImport).toHaveBeenCalledWith('{"hello":1}'));
  });

  it("confirms a copied link", async () => {
    render(<ProjectMenu {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Link copied."));
  });

  it("warns about a long link and offers the JSON file", async () => {
    const p = props({
      onCopyLink: () => Promise.resolve({ status: "copied", length: 2400, tooLong: true }),
    });
    render(<ProjectMenu {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/2400 characters/));
    fireEvent.click(screen.getByRole("button", { name: "Download JSON instead" }));
    expect(p.onExportJson).toHaveBeenCalled();
  });

  it("shows the link for manual copying when the clipboard refuses", async () => {
    const p = props({
      onCopyLink: () =>
        Promise.resolve({
          status: "failed",
          length: 20,
          tooLong: false,
          link: "https://x.test/#1.abc",
          error: "denied",
        }),
    });
    render(<ProjectMenu {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => {
      const field = screen.getByLabelText("Share link");
      expect((field as HTMLInputElement).value).toBe("https://x.test/#1.abc");
    });
    expect(screen.getByRole("alert").textContent).toMatch(/denied/);
  });

  it("hides the saved list and delete without storage", () => {
    render(<ProjectMenu {...props({ storageAvailable: false })} />);
    expect(screen.queryByLabelText("Saved projects")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete project" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/insert-generator && npx vitest run src/app/link.test.ts src/ui/ProjectMenu.test.tsx`
Expected: FAIL — `Failed to resolve import "./link"` / `"./ProjectMenu"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/download.ts
/** Save a Blob through a temporary <a download>. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `slice()` copies into a plain ArrayBuffer-backed array, which Blob accepts. */
export function bytesToBlob(data: Uint8Array, type: string): Blob {
  return new Blob([data.slice()], { type });
}

export function fileSlug(name: string): string {
  const slug = name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug === "" ? "insert" : slug;
}
```

```ts
// src/app/link.ts
import { LINK_MAX_URL_CHARS } from "../share";

export function shareLink(href: string, hash: string): string {
  const cut = href.indexOf("#");
  return `${cut >= 0 ? href.slice(0, cut) : href}${hash}`;
}

export type CopyLinkResult =
  | { status: "copied"; length: number; tooLong: boolean }
  | { status: "failed"; length: number; tooLong: boolean; link: string; error: string };

export async function copyLink(
  link: string,
  write: (text: string) => Promise<void>,
): Promise<CopyLinkResult> {
  const length = link.length;
  const tooLong = length > LINK_MAX_URL_CHARS;
  try {
    await write(link);
    return { status: "copied", length, tooLong };
  } catch (e) {
    return {
      status: "failed",
      length,
      tooLong,
      link,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
```

```tsx
// src/ui/ProjectMenu.tsx
import { useRef, useState } from "preact/hooks";
import type { CopyLinkResult } from "../app/link";
import { LINK_MAX_URL_CHARS } from "../share";
import type { ProjectListEntry } from "../share";
import { SelectField, TextField } from "./fields";

export interface ProjectMenuProps {
  name: string;
  currentId: string;
  projects: readonly ProjectListEntry[];
  storageAvailable: boolean;
  onRename: (name: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onImport: (text: string) => void;
  onExportJson: () => void;
  onCopyLink: () => Promise<CopyLinkResult>;
}

function CopyStatus({
  result,
  onExportJson,
}: {
  result: CopyLinkResult;
  onExportJson: () => void;
}) {
  const longWarning = result.tooLong ? (
    <>
      {" "}
      It is {result.length} characters long; some chats (e.g. Discord) cut messages over{" "}
      {LINK_MAX_URL_CHARS} characters.{" "}
      <button type="button" onClick={onExportJson}>
        Download JSON instead
      </button>
    </>
  ) : null;
  if (result.status === "copied") {
    return (
      <p class={result.tooLong ? "link-status link-warning" : "link-status"} role="status">
        Link copied.{longWarning}
      </p>
    );
  }
  return (
    <div class="link-status link-warning" role="alert">
      <p>
        Couldn't copy automatically ({result.error}). Copy the link yourself:{longWarning}
      </p>
      <input
        class="copy-fallback"
        type="text"
        readOnly
        value={result.link}
        aria-label="Share link"
        onFocus={(e) => e.currentTarget.select()}
      />
    </div>
  );
}

export function ProjectMenu(props: ProjectMenuProps) {
  const { name, currentId, projects, storageAvailable } = props;
  const [copy, setCopy] = useState<CopyLinkResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listed = projects.some((p) => p.id === currentId)
    ? projects
    : [{ id: currentId, name, updatedAt: 0 }, ...projects];

  async function readFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    input.value = "";
    props.onImport(text);
  }

  return (
    <div class="project-menu">
      <TextField id="project-name" label="Project name" value={name} onCommit={props.onRename} />
      {storageAvailable ? (
        <SelectField
          id="project-open"
          label="Saved projects"
          value={currentId}
          options={listed.map((p) => ({
            value: p.id,
            label: p.name === "" ? "(unnamed)" : p.name,
          }))}
          onChange={props.onOpen}
        />
      ) : null}
      <div class="button-row">
        <button type="button" onClick={props.onNew}>
          New project
        </button>
        {storageAvailable ? (
          <button type="button" onClick={() => props.onDelete(currentId)}>
            Delete project
          </button>
        ) : null}
        <button type="button" onClick={() => fileRef.current?.click()}>
          Import JSON…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          class="visually-hidden"
          tabIndex={-1}
          aria-label="Import a project JSON file"
          onChange={(e) => {
            void readFile(e.currentTarget);
          }}
        />
        <button type="button" onClick={props.onExportJson}>
          Export JSON
        </button>
        <button
          type="button"
          onClick={() => {
            void props.onCopyLink().then(setCopy);
          }}
        >
          Copy link
        </button>
      </div>
      {copy ? <CopyStatus result={copy} onExportJson={props.onExportJson} /> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/insert-generator && npx vitest run src/app/link.test.ts src/ui/ProjectMenu.test.tsx`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/app/download.ts src/app/link.ts src/app/link.test.ts src/ui/ProjectMenu.tsx src/ui/ProjectMenu.test.tsx
git commit -m "Add project menu with copy-link length warning"
```

---

### Task 13: Part numbering and plan geometry helpers

**Files:**

- Create: `src/instructions/numbering.ts`
- Create: `src/plan/layers.ts`
- Test: `src/instructions/numbering.test.ts`, `src/plan/layers.test.ts`

**Interfaces:**

- Consumes: `TraySpec`, `Box`, `Settings`; `effective` (`model/settings`).
- Produces:
  - `interface NumberedPart { number: number; spec: TraySpec; label: string; parentNumber: number | null }`
  - `SPACER_SUFFIX = ":spacer"`; `parentKey(spacer: TraySpec): string`
  - `partLabel(spec: TraySpec): string` — unique non-spare compartment contents joined with " + "; "Card spacer"; "Spare tray"; "Filler block".
  - `numberParts(trays: readonly TraySpec[]): NumberedPart[]` — stack, then level, then key; each spacer right after its tray. One numbering for plan view, export file names and the assembly page.
  - `partsByKey(parts: readonly NumberedPart[]): Map<string, NumberedPart>`
  - `interface PlanFrame { bc: number; usableW: number; usableD: number; innerW: number; innerD: number }`; `planFrame(box: Box, settings: Settings): PlanFrame`
  - `levelsOf(trays: readonly TraySpec[]): number[]`; `traysAt(trays: readonly TraySpec[], level: number): TraySpec[]` (no spacers); `spacersAt(trays: readonly TraySpec[], level: number): TraySpec[]`
  - `interface SvgRect { x: number; y: number; w: number; h: number }`; `toSvgRect(t: Pick<TraySpec, "x" | "y" | "w" | "d">, f: PlanFrame): SvgRect` (front of the box at the bottom)
  - `interface ViewBox { x: number; y: number; w: number; h: number }`; `planViewBox(f: PlanFrame): ViewBox`
  - `interface ClientRect { left: number; top: number; width: number; height: number }`; `clientToSvg(rect: ClientRect, vb: ViewBox, clientX: number, clientY: number): { x: number; y: number } | null` (honours `preserveAspectRatio="xMidYMid meet"`)
  - `hitTest(rects: readonly { key: string; rect: SvgRect }[], p: { x: number; y: number }): string | null`
  - `labelFontSize(r: SvgRect): number`

- [ ] **Step 1: Write the failing tests**

```ts
// src/instructions/numbering.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { numberParts, partLabel, partsByKey } from "./numbering";

describe("partLabel", () => {
  it("joins unique contents and names special parts", () => {
    const t = makeTray({
      compartments: [
        { x: 2, y: 2, w: 10, d: 10, floorZ: 1.2, kind: "well", contents: "A ×10", features: [] },
        { x: 14, y: 2, w: 10, d: 10, floorZ: 1.2, kind: "well", contents: "B ×5", features: [] },
        { x: 26, y: 2, w: 10, d: 10, floorZ: 1.2, kind: "spare", contents: "", features: [] },
        { x: 38, y: 2, w: 10, d: 10, floorZ: 1.2, kind: "well", contents: "A ×10", features: [] },
      ],
    });
    expect(partLabel(t)).toBe("A ×10 + B ×5");
    expect(partLabel(makeTray({ part: "spacer", key: "a:p0:0:spacer" }))).toBe("Card spacer");
    expect(partLabel(makeTray({ part: "leftover", key: "leftover:0", solid: true }))).toBe(
      "Filler block",
    );
    expect(partLabel(makeTray({ part: "leftover", key: "leftover:1", solid: false }))).toBe(
      "Spare tray",
    );
    expect(partLabel(makeTray({ key: "k:p0:0", compartments: [] }))).toBe("k:p0:0");
  });
});

describe("numberParts", () => {
  it("numbers by stack and level and puts spacers after their tray", () => {
    const top = makeTray({ key: "b:p0:0", stack: 0, level: 1 });
    const bottom = makeTray({ key: "a:p0:0", stack: 0, level: 0 });
    const other = makeTray({ key: "c:p0:0", stack: 1, level: 0 });
    const spacer = makeTray({ key: "a:p0:0:spacer", part: "spacer", path: "", stack: 0, level: 0 });
    const orphan = makeTray({
      key: "zz:p0:0:spacer",
      part: "spacer",
      path: "",
      stack: 9,
      level: 0,
    });
    const parts = numberParts([other, spacer, top, orphan, bottom]);
    expect(parts.map((p) => [p.number, p.spec.key, p.parentNumber])).toEqual([
      [1, "a:p0:0", null],
      [2, "a:p0:0:spacer", 1],
      [3, "b:p0:0", null],
      [4, "c:p0:0", null],
      [5, "zz:p0:0:spacer", null],
    ]);
    expect(partsByKey(parts).get("c:p0:0")?.number).toBe(4);
  });
});
```

```ts
// src/plan/layers.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import {
  clientToSvg,
  hitTest,
  labelFontSize,
  levelsOf,
  planFrame,
  planViewBox,
  spacersAt,
  toSvgRect,
  traysAt,
} from "./layers";

describe("plan geometry", () => {
  const box = { ...DEFAULT_BOX, innerWidth: 200, innerDepth: 100 };
  const f = planFrame(box, DEFAULT_SETTINGS);

  it("derives the usable floor from the effective box clearance", () => {
    expect(f).toEqual({ bc: 0.5, usableW: 199, usableD: 99, innerW: 200, innerD: 100 });
  });

  it("flips Y so the box front is at the bottom", () => {
    expect(toSvgRect({ x: 10, y: 0, w: 50, d: 30 }, f)).toEqual({ x: 10, y: 69, w: 50, h: 30 });
  });

  it("frames the box with room for the FRONT label", () => {
    const vb = planViewBox(f);
    expect(vb.x).toBeLessThan(-f.bc);
    expect(vb.y + vb.h).toBeGreaterThan(f.usableD + f.bc + 8);
  });

  it("maps client pixels to SVG units with letterboxing", () => {
    const vb = { x: 0, y: 0, w: 200, h: 100 };
    expect(clientToSvg({ left: 10, top: 20, width: 400, height: 200 }, vb, 210, 120)).toEqual({
      x: 100,
      y: 50,
    });
    expect(clientToSvg({ left: 0, top: 0, width: 400, height: 400 }, vb, 200, 200)).toEqual({
      x: 100,
      y: 50,
    });
    expect(clientToSvg({ left: 0, top: 0, width: 0, height: 0 }, vb, 1, 1)).toBeNull();
  });

  it("hit-tests rectangles, last drawn wins", () => {
    const rects = [
      { key: "a", rect: { x: 0, y: 0, w: 50, h: 50 } },
      { key: "b", rect: { x: 40, y: 0, w: 50, h: 50 } },
    ];
    expect(hitTest(rects, { x: 10, y: 10 })).toBe("a");
    expect(hitTest(rects, { x: 45, y: 10 })).toBe("b");
    expect(hitTest(rects, { x: 200, y: 10 })).toBeNull();
  });

  it("lists levels and trays per level", () => {
    const trays = [
      makeTray({ key: "a", level: 0 }),
      makeTray({ key: "b", level: 1 }),
      makeTray({ key: "a:spacer", part: "spacer", level: 0 }),
    ];
    expect(levelsOf(trays)).toEqual([0, 1]);
    expect(traysAt(trays, 0).map((t) => t.key)).toEqual(["a"]);
    expect(spacersAt(trays, 0).map((t) => t.key)).toEqual(["a:spacer"]);
  });

  it("clamps label sizes", () => {
    expect(labelFontSize({ x: 0, y: 0, w: 10, h: 10 })).toBe(6);
    expect(labelFontSize({ x: 0, y: 0, w: 300, h: 300 })).toBe(20);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/insert-generator && npx vitest run src/instructions/numbering.test.ts src/plan/layers.test.ts`
Expected: FAIL — `Failed to resolve import "./numbering"` / `"./layers"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/instructions/numbering.ts
import type { TraySpec } from "../model/types";

export interface NumberedPart {
  number: number;
  spec: TraySpec;
  label: string;
  /** For spacers: the number of the tray they go into. */
  parentNumber: number | null;
}

export const SPACER_SUFFIX = ":spacer";

export function parentKey(spacer: TraySpec): string {
  return spacer.key.endsWith(SPACER_SUFFIX)
    ? spacer.key.slice(0, -SPACER_SUFFIX.length)
    : spacer.key;
}

export function partLabel(spec: TraySpec): string {
  if (spec.part === "spacer") {
    return "Card spacer";
  }
  if (spec.part === "leftover") {
    return spec.solid ? "Filler block" : "Spare tray";
  }
  const names: string[] = [];
  for (const c of spec.compartments) {
    if (c.kind !== "spare" && c.contents !== "" && !names.includes(c.contents)) {
      names.push(c.contents);
    }
  }
  return names.length > 0 ? names.join(" + ") : spec.key;
}

export function numberParts(trays: readonly TraySpec[]): NumberedPart[] {
  const main = trays
    .filter((t) => t.part !== "spacer")
    .sort((a, b) => a.stack - b.stack || a.level - b.level || a.key.localeCompare(b.key));
  const spacers = trays.filter((t) => t.part === "spacer");
  const used = new Set<TraySpec>();
  const ordered: TraySpec[] = [];
  for (const t of main) {
    ordered.push(t);
    for (const s of spacers) {
      if (!used.has(s) && parentKey(s) === t.key) {
        ordered.push(s);
        used.add(s);
      }
    }
  }
  for (const s of spacers) {
    if (!used.has(s)) {
      ordered.push(s);
    }
  }
  const numberOf = new Map<string, number>();
  ordered.forEach((t, i) => {
    numberOf.set(t.key, i + 1);
  });
  return ordered.map((spec, i) => ({
    number: i + 1,
    spec,
    label: partLabel(spec),
    parentNumber: spec.part === "spacer" ? (numberOf.get(parentKey(spec)) ?? null) : null,
  }));
}

export function partsByKey(parts: readonly NumberedPart[]): Map<string, NumberedPart> {
  return new Map(parts.map((p) => [p.spec.key, p]));
}
```

```ts
// src/plan/layers.ts
import { effective } from "../model/settings";
import type { Box, Settings, TraySpec } from "../model/types";

export interface PlanFrame {
  bc: number;
  usableW: number;
  usableD: number;
  innerW: number;
  innerD: number;
}

export function planFrame(box: Box, settings: Settings): PlanFrame {
  const bc = effective(settings).boxClearance;
  return {
    bc,
    usableW: box.innerWidth - 2 * bc,
    usableD: box.innerDepth - 2 * bc,
    innerW: box.innerWidth,
    innerD: box.innerDepth,
  };
}

export function levelsOf(trays: readonly TraySpec[]): number[] {
  const levels = new Set(trays.filter((t) => t.part !== "spacer").map((t) => t.level));
  return [...levels].sort((a, b) => a - b);
}

export function traysAt(trays: readonly TraySpec[], level: number): TraySpec[] {
  return trays.filter((t) => t.part !== "spacer" && t.level === level);
}

export function spacersAt(trays: readonly TraySpec[], level: number): TraySpec[] {
  return trays.filter((t) => t.part === "spacer" && t.level === level);
}

export interface SvgRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Box coordinates (Y from the front) → SVG coordinates (front at the bottom). */
export function toSvgRect(t: Pick<TraySpec, "x" | "y" | "w" | "d">, f: PlanFrame): SvgRect {
  return { x: t.x, y: f.usableD - t.y - t.d, w: t.w, h: t.d };
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PLAN_MARGIN = 4;
export const FRONT_LABEL_SPACE = 14;

export function planViewBox(f: PlanFrame): ViewBox {
  return {
    x: -f.bc - PLAN_MARGIN,
    y: -f.bc - PLAN_MARGIN,
    w: f.innerW + 2 * PLAN_MARGIN,
    h: f.innerD + 2 * PLAN_MARGIN + FRONT_LABEL_SPACE,
  };
}

export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function clientToSvg(
  rect: ClientRect,
  vb: ViewBox,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const scale = Math.min(rect.width / vb.w, rect.height / vb.h);
  if (!(scale > 0)) {
    return null;
  }
  const offsetX = (rect.width - vb.w * scale) / 2;
  const offsetY = (rect.height - vb.h * scale) / 2;
  return {
    x: vb.x + (clientX - rect.left - offsetX) / scale,
    y: vb.y + (clientY - rect.top - offsetY) / scale,
  };
}

export function hitTest(
  rects: readonly { key: string; rect: SvgRect }[],
  p: { x: number; y: number },
): string | null {
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    const r = rects[i];
    if (
      r &&
      p.x >= r.rect.x &&
      p.x <= r.rect.x + r.rect.w &&
      p.y >= r.rect.y &&
      p.y <= r.rect.y + r.rect.h
    ) {
      return r.key;
    }
  }
  return null;
}

export function labelFontSize(r: SvgRect): number {
  return Math.max(6, Math.min(20, Math.min(r.w, r.h) * 0.3));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/insert-generator && npx vitest run src/instructions/numbering.test.ts src/plan/layers.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/instructions/numbering.ts src/instructions/numbering.test.ts src/plan/layers.ts src/plan/layers.test.ts
git commit -m "Add part numbering and plan geometry helpers"
```

---

### Task 14: Summary panel with run controls

**Files:**

- Create: `src/ui/Summary.tsx`
- Test: `src/ui/Summary.test.tsx`

**Interfaces:**

- Consumes: `RunState`, `STALE_CODE` (Task 2); `Notices` (Task 6); `LayoutSummary` (`layout/types`); `Notice`.
- Produces:
  - `PLAY_LIMIT_MM = 1.5`
  - `interface SummaryProps { summary: LayoutSummary | null; run: RunState; notices: readonly Notice[]; hasLayout: boolean; canUndo: boolean; canOptimize: boolean; shortfall: { x: number; y: number; z: number } | null; onReoptimize: () => void; onImprove: () => void; onUndo: () => void; onCancel: () => void; onRetry: () => void }`
  - `Summary(props)` — fill %, trays, stacks, filament "≤ N g (upper bound…)", play per axis (warning style above 1.5 mm), progress + Cancel while running, error + Retry (last good result stays), "Re-optimize", "Improve more", "Undo layout", notices list with a "Re-optimize now" action on the stale notice, shortfall per axis for an infeasible run.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/Summary.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STALE_CODE } from "../app/state";
import { Summary } from "./Summary";
import type { SummaryProps } from "./Summary";

afterEach(cleanup);

function props(over: Partial<SummaryProps> = {}): SummaryProps {
  return {
    summary: {
      fillPct: 81.4,
      trayCount: 7,
      stackCount: 4,
      filamentG: 412.2,
      playX: 1.2,
      playY: 1.8,
    },
    run: { status: "done" },
    notices: [],
    hasLayout: true,
    canUndo: true,
    canOptimize: true,
    shortfall: null,
    onReoptimize: vi.fn(),
    onImprove: vi.fn(),
    onUndo: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    ...over,
  };
}

describe("Summary", () => {
  it("shows the numbers with an upper-bound filament and play warnings", () => {
    render(<Summary {...props()} />);
    expect(screen.getByText("81 %")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText(/≤ 413 g/)).toBeTruthy();
    expect(screen.getByText(/upper bound/)).toBeTruthy();
    expect(screen.getByText("1.2 mm").className).not.toContain("play-warn");
    expect(screen.getByText("1.8 mm").className).toContain("play-warn");
  });

  it("shows progress and cancels while running", () => {
    const p = props({ run: { status: "running", done: 250, total: 1000 } });
    render(<Summary {...p} />);
    expect(screen.getByRole("status").textContent).toContain("25%");
    expect(screen.getByRole("progressbar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onCancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Re-optimize" }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps the last good result visible on failure and retries", () => {
    const p = props({ run: { status: "error", message: "Worker crashed" } });
    render(<Summary {...p} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Worker crashed.*last good layout/);
    expect(screen.getByText("81 %")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(p.onRetry).toHaveBeenCalled();
  });

  it("offers re-optimize on the stale notice and wires the buttons", () => {
    const p = props({
      notices: [
        {
          level: "info",
          code: STALE_CODE,
          message: "Inputs changed since this layout was made — re-optimize?",
        },
      ],
    });
    render(<Summary {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Re-optimize now" }));
    fireEvent.click(screen.getByRole("button", { name: "Improve more" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo layout" }));
    expect(p.onReoptimize).toHaveBeenCalledTimes(1);
    expect(p.onImprove).toHaveBeenCalledTimes(1);
    expect(p.onUndo).toHaveBeenCalledTimes(1);
  });

  it("explains an empty project and an infeasible run", () => {
    const view = render(
      <Summary
        {...props({
          summary: null,
          hasLayout: false,
          canUndo: false,
          canOptimize: false,
          run: { status: "idle" },
        })}
      />,
    );
    expect(screen.getByText(/add at least one component/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Improve more" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Undo layout" }).hasAttribute("disabled")).toBe(true);
    view.rerender(
      <Summary
        {...props({ summary: null, hasLayout: false, shortfall: { x: 12.345, y: 0, z: 3 } })}
      />,
    );
    expect(screen.getByText(/Doesn't fit/).textContent).toBe(
      "Doesn't fit: short by 12.3 mm left–right and 3.0 mm in height.",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/ui/Summary.test.tsx`
Expected: FAIL — `Failed to resolve import "./Summary"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/ui/Summary.tsx
import { STALE_CODE } from "../app/state";
import type { RunState } from "../app/state";
import type { LayoutSummary } from "../layout/types";
import type { Notice } from "../model/types";
import { Notices } from "./Notices";

export const PLAY_LIMIT_MM = 1.5;

export interface SummaryProps {
  summary: LayoutSummary | null;
  run: RunState;
  notices: readonly Notice[];
  hasLayout: boolean;
  canUndo: boolean;
  canOptimize: boolean;
  shortfall: { x: number; y: number; z: number } | null;
  onReoptimize: () => void;
  onImprove: () => void;
  onUndo: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

function shortfallText(s: { x: number; y: number; z: number }): string {
  const parts: string[] = [];
  if (s.x > 0) {
    parts.push(`${s.x.toFixed(1)} mm left–right`);
  }
  if (s.y > 0) {
    parts.push(`${s.y.toFixed(1)} mm front–back`);
  }
  if (s.z > 0) {
    parts.push(`${s.z.toFixed(1)} mm in height`);
  }
  return `Doesn't fit: short by ${parts.join(" and ")}.`;
}

function Play({ label, mm }: { label: string; mm: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd class={mm > PLAY_LIMIT_MM ? "play-warn" : undefined}>{`${mm.toFixed(1)} mm`}</dd>
    </div>
  );
}

export function Summary(p: SummaryProps) {
  const running = p.run.status === "running";
  return (
    <section class="panel summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">Summary</h2>
      {p.run.status === "running" ? (
        <div class="run-status" role="status">
          <progress value={p.run.done} max={p.run.total} aria-label="Optimizing" />
          <span>{`Optimizing… ${Math.floor((100 * p.run.done) / Math.max(1, p.run.total))}%`}</span>
          <button type="button" onClick={p.onCancel}>
            Cancel
          </button>
        </div>
      ) : null}
      {p.run.status === "error" ? (
        <div class="run-error" role="alert">
          <p>
            {`The optimizer failed: ${p.run.message}.`}
            {p.hasLayout ? " The last good layout is still shown." : ""}
          </p>
          <button type="button" onClick={p.onRetry}>
            Retry
          </button>
        </div>
      ) : null}
      {p.summary ? (
        <dl class="summary-grid">
          <div>
            <dt>Box filled</dt>
            <dd>{`${p.summary.fillPct.toFixed(0)} %`}</dd>
          </div>
          <div>
            <dt>Trays</dt>
            <dd>{p.summary.trayCount}</dd>
          </div>
          <div>
            <dt>Stacks</dt>
            <dd>{p.summary.stackCount}</dd>
          </div>
          <div>
            <dt>Filament</dt>
            <dd>
              {`≤ ${Math.ceil(p.summary.filamentG)} g `}
              <span class="hint">(upper bound: PLA at 100 % infill)</span>
            </dd>
          </div>
          <Play label="Play left–right" mm={p.summary.playX} />
          <Play label="Play front–back" mm={p.summary.playY} />
        </dl>
      ) : running ? null : (
        <p class="hint">
          {p.canOptimize
            ? "No layout yet."
            : "No layout yet. Enter the box size and add at least one component."}
        </p>
      )}
      {p.shortfall ? <p class="shortfall">{shortfallText(p.shortfall)}</p> : null}
      <div class="button-row">
        <button type="button" onClick={p.onReoptimize} disabled={running || !p.canOptimize}>
          Re-optimize
        </button>
        <button
          type="button"
          onClick={p.onImprove}
          disabled={running || !p.hasLayout || !p.canOptimize}
        >
          Improve more
        </button>
        <button type="button" onClick={p.onUndo} disabled={running || !p.canUndo}>
          Undo layout
        </button>
      </div>
      <Notices
        notices={p.notices}
        label="Layout messages"
        renderAction={(n) =>
          n.code === STALE_CODE ? (
            <button type="button" onClick={p.onReoptimize} disabled={running || !p.canOptimize}>
              Re-optimize now
            </button>
          ) : null
        }
      />
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/ui/Summary.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/ui/Summary.tsx src/ui/Summary.test.tsx
git commit -m "Add summary panel with optimizer controls"
```

---

### Task 15: Plan view with select, drag/keyboard swap and lock

**Files:**

- Create: `src/ui/TrayDetails.tsx`
- Create: `src/plan/PlanView.tsx`
- Create: `src/plan/plan.css`
- Modify: `vite.config.ts` (`test.css` lets `plan.css?raw` through)
- Test: `src/plan/PlanView.test.tsx`

**Interfaces:**

- Consumes: `planFrame`, `planViewBox`, `levelsOf`, `traysAt`, `toSvgRect`, `clientToSvg`, `hitTest`, `labelFontSize` (Task 13); `numberParts`, `partsByKey`, `NumberedPart` (Task 13); `isLockable` (Task 1); `Box`, `Settings`, `TraySpec`.
- Produces:
  - `interface TrayDetailsProps { part: NumberedPart; locked: boolean; sizeLocked?: boolean; onToggleSizeLock?: () => void }`; `TrayDetails(props)` — number, label, outer size, layer, position, spacer target, position and size lock state, contents; with `onToggleSizeLock`, lockable trays get a "Lock size" / "Unlock size" button.
  - `DRAG_THRESHOLD_PX = 6`
  - `interface PlanViewProps { trays: readonly TraySpec[]; box: Box; settings: Settings; lockedKeys: ReadonlySet<string>; selectedKey: string | null; onSelect: (key: string | null) => void; onSwap: (keyA: string, keyB: string) => void; onToggleLock: (key: string) => void; sizeLockedKeys: ReadonlySet<string>; onToggleSizeLock: (key: string) => void }`; `PlanView(props)` — size-locked trays show "size locked" and get ", size locked" in their label.

Interaction: one set of pointer handlers on the `<svg>` (mouse, pen, touch). A press that moves less than 6 px is a tap → select (tap again to deselect). A drag of more than 6 px onto another tray → `onSwap(dragged, target)`. `pointercancel` drops the drag. `plan.css` gives the SVG `touch-action: none`, so a touch drag swaps instead of scrolling the page. Keyboard: trays are focusable buttons (Enter/Space select, Escape clears); "Swap with…" then Enter on another tray swaps. "Lock position" toggles a position lock (disabled for leftovers/spacers); "Lock size" in the tray details toggles a size lock (not offered for leftovers/spacers).

- [ ] **Step 1: Write the failing test**

```tsx
// src/plan/PlanView.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import planCss from "./plan.css?raw";
import { planFrame, planViewBox } from "./layers";
import { PlanView } from "./PlanView";
import type { PlanViewProps } from "./PlanView";

beforeAll(() => {
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    Object.defineProperty(window, "PointerEvent", {
      value: PointerEventPolyfill,
      configurable: true,
    });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const box = { ...DEFAULT_BOX, innerWidth: 200, innerDepth: 100 };
const vb = planViewBox(planFrame(box, DEFAULT_SETTINGS));
const A = makeTray({
  key: "a:p0:0",
  path: "0",
  stack: 0,
  x: 0,
  y: 0,
  w: 90,
  d: 99,
  compartments: [],
});
const B = makeTray({
  key: "b:p0:0",
  path: "1",
  stack: 1,
  x: 100,
  y: 0,
  w: 99,
  d: 99,
  compartments: [],
});
const C = makeTray({
  key: "c:p0:0",
  path: "0",
  stack: 0,
  level: 1,
  x: 1.45,
  y: 1.45,
  w: 87,
  d: 96,
  compartments: [],
});
const L = makeTray({
  key: "leftover:0",
  part: "leftover",
  path: "11",
  stack: 2,
  x: 0,
  y: 0,
  w: 5,
  d: 5,
  compartments: [],
});

/** Client pixel of an SVG point: the SVG is laid out 1 px per mm at (0, 0). */
function at(svgX: number, svgY: number) {
  return { clientX: svgX - vb.x, clientY: svgY - vb.y };
}

function setup(over: Partial<PlanViewProps> = {}) {
  const p: PlanViewProps = {
    trays: [A, B, C],
    box,
    settings: DEFAULT_SETTINGS,
    lockedKeys: new Set<string>(),
    selectedKey: null,
    onSelect: vi.fn(),
    onSwap: vi.fn(),
    onToggleLock: vi.fn(),
    sizeLockedKeys: new Set<string>(),
    onToggleSizeLock: vi.fn(),
    ...over,
  };
  const view = render(<PlanView {...p} />);
  const svg = view.container.querySelector("svg");
  if (!svg) {
    throw new Error("no svg");
  }
  const rect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: vb.w,
    bottom: vb.h,
    width: vb.w,
    height: vb.h,
  };
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ ...rect, toJSON: () => rect });
  return { p, view, svg };
}

const centerA = at(45, 49.5);
const centerB = at(149.5, 49.5);

describe("PlanView", () => {
  it("labels trays with their part numbers", () => {
    setup();
    expect(screen.getByRole("button", { name: "Tray 1: a:p0:0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tray 3: b:p0:0" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /c:p0:0/ })).toBeNull();
  });

  it("selects a tray on tap", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /a:p0:0/ }), {
      ...centerA,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(svg, { ...centerA, pointerId: 1 });
    expect(p.onSelect).toHaveBeenCalledWith("a:p0:0");
    expect(p.onSwap).not.toHaveBeenCalled();
  });

  it("touch drag swaps; svg has touch-action none", () => {
    expect(planCss).toMatch(/\.plan-svg\s*{[^}]*touch-action:\s*none/);
    const { p, svg } = setup();
    const touch = { pointerId: 7, pointerType: "touch", button: 0 };
    fireEvent.pointerDown(screen.getByRole("button", { name: /a:p0:0/ }), { ...centerA, ...touch });
    fireEvent.pointerMove(svg, { ...at(100, 49.5), ...touch });
    fireEvent.pointerMove(svg, { ...centerB, ...touch });
    expect(screen.getByRole("button", { name: /b:p0:0/ }).getAttribute("class")).toContain(
      "is-drop",
    );
    fireEvent.pointerUp(svg, { ...centerB, ...touch });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("pointercancel resets the drag", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /a:p0:0/ }), {
      ...centerA,
      pointerId: 2,
      button: 0,
    });
    fireEvent.pointerMove(svg, { ...centerB, pointerId: 2 });
    fireEvent.pointerCancel(svg, { pointerId: 2 });
    fireEvent.pointerUp(svg, { ...centerB, pointerId: 2 });
    expect(p.onSwap).not.toHaveBeenCalled();
    expect(p.onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /b:p0:0/ }).getAttribute("class")).not.toContain(
      "is-drop",
    );
  });

  it("swaps with the keyboard: select, Swap with…, Enter on the other tray", () => {
    const { p, view } = setup();
    fireEvent.keyDown(screen.getByRole("button", { name: /a:p0:0/ }), { key: "Enter" });
    expect(p.onSelect).toHaveBeenCalledWith("a:p0:0");
    view.rerender(<PlanView {...p} selectedKey="a:p0:0" />);
    fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
    expect(screen.getByRole("status").textContent).toMatch(/Choose the tray to swap with/);
    fireEvent.keyDown(screen.getByRole("button", { name: /b:p0:0/ }), { key: "Enter" });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("toggles the lock of the selected tray and refuses leftovers", () => {
    const { p, view } = setup({ selectedKey: "a:p0:0" });
    fireEvent.click(screen.getByRole("button", { name: "Lock position" }));
    expect(p.onToggleLock).toHaveBeenCalledWith("a:p0:0");
    view.rerender(<PlanView {...p} lockedKeys={new Set(["a:p0:0"])} />);
    expect(screen.getByRole("button", { name: "Tray 1: a:p0:0, locked" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock position" })).toBeTruthy();
    view.rerender(<PlanView {...p} trays={[A, B, L]} selectedKey="leftover:0" />);
    expect(screen.getByRole("button", { name: "Lock position" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("toggles the size lock of the selected tray and marks size-locked trays", () => {
    const { p, view } = setup({ selectedKey: "a:p0:0" });
    expect(screen.getByText("Size locked").nextElementSibling?.textContent).toBe("No");
    fireEvent.click(screen.getByRole("button", { name: "Lock size" }));
    expect(p.onToggleSizeLock).toHaveBeenCalledWith("a:p0:0");
    view.rerender(<PlanView {...p} sizeLockedKeys={new Set(["a:p0:0"])} />);
    expect(screen.getByRole("button", { name: "Tray 1: a:p0:0, size locked" })).toBeTruthy();
    expect(screen.getByText("size locked")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock size" })).toBeTruthy();
    view.rerender(<PlanView {...p} trays={[A, B, L]} selectedKey="leftover:0" />);
    expect(screen.queryByRole("button", { name: "Lock size" })).toBeNull();
  });

  it("switches layers", () => {
    setup();
    fireEvent.click(screen.getByLabelText("2"));
    expect(screen.getByRole("button", { name: /c:p0:0/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /a:p0:0/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/plan/PlanView.test.tsx`
Expected: FAIL — `Failed to resolve import "./plan.css?raw"` (and `./PlanView`).

- [ ] **Step 3: Write the implementation**

```tsx
// src/ui/TrayDetails.tsx
import { isLockable } from "../app/actions";
import type { NumberedPart } from "../instructions/numbering";

export interface TrayDetailsProps {
  part: NumberedPart;
  locked: boolean;
  /** The tray has a size lock (spec §5 `Lock.kind "size"`). */
  sizeLocked?: boolean;
  /** When given, lockable trays get a "Lock size" / "Unlock size" toggle. */
  onToggleSizeLock?: () => void;
}

export function TrayDetails({
  part,
  locked,
  sizeLocked = false,
  onToggleSizeLock,
}: TrayDetailsProps) {
  const t = part.spec;
  const contents = t.compartments.filter((c) => c.contents !== "").map((c) => c.contents);
  return (
    <div class="tray-details" aria-live="polite">
      <h3>{`#${part.number} ${part.label}`}</h3>
      <dl>
        <div>
          <dt>Outer size</dt>
          <dd>{`${t.w.toFixed(1)} × ${t.d.toFixed(1)} × ${t.h.toFixed(1)} mm`}</dd>
        </div>
        <div>
          <dt>Layer</dt>
          <dd>{t.level === 0 ? "1 (bottom)" : String(t.level + 1)}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>{`${t.x.toFixed(1)} mm from the left, ${t.y.toFixed(1)} mm from the front`}</dd>
        </div>
        {part.parentNumber !== null ? (
          <div>
            <dt>Goes into</dt>
            <dd>{`Tray #${part.parentNumber}`}</dd>
          </div>
        ) : null}
        <div>
          <dt>Position locked</dt>
          <dd>{locked ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Size locked</dt>
          <dd>{sizeLocked ? "Yes" : "No"}</dd>
        </div>
      </dl>
      {onToggleSizeLock && isLockable(t) ? (
        <p class="button-row">
          <button type="button" onClick={onToggleSizeLock}>
            {sizeLocked ? "Unlock size" : "Lock size"}
          </button>
          <span class="hint">
            A size lock keeps this outer size when the layout is re-optimized.
          </span>
        </p>
      ) : null}
      {contents.length > 0 ? (
        <ul class="tray-contents">
          {contents.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

```css
/* src/plan/plan.css */
.plan-svg {
  display: block;
  width: 100%;
  height: auto;
  max-height: 70vh;
  touch-action: none;
  user-select: none;
}

.plan-box {
  fill: none;
  stroke: currentcolor;
  stroke-width: 0.8;
  vector-effect: non-scaling-stroke;
}

.plan-below {
  fill: none;
  stroke: color-mix(in srgb, currentcolor 35%, transparent);
  stroke-dasharray: 4 3;
  vector-effect: non-scaling-stroke;
}

.plan-tray {
  cursor: grab;
}

.plan-tray rect {
  fill: color-mix(in srgb, #2563eb 22%, Canvas);
  stroke: color-mix(in srgb, #2563eb 70%, CanvasText);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.plan-tray.is-leftover rect {
  fill: color-mix(in srgb, CanvasText 8%, Canvas);
  stroke-dasharray: 3 2;
}

.plan-tray.is-selected rect {
  stroke-width: 3;
}

.plan-tray.is-source rect {
  opacity: 0.6;
}

.plan-tray.is-drop rect {
  fill: color-mix(in srgb, #f59e0b 40%, Canvas);
}

.plan-tray:focus {
  outline: none;
}

.plan-tray:focus-visible rect {
  stroke: #f59e0b;
  stroke-width: 3;
}

.plan-label,
.plan-front,
.plan-lock {
  fill: currentcolor;
  pointer-events: none;
  text-anchor: middle;
  dominant-baseline: central;
}

.plan-lock {
  font-size: 5px;
  text-anchor: start;
}

.plan-front {
  font-size: 6px;
  letter-spacing: 0.1em;
}

.layer-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  border: 0;
  padding: 0;
  margin: 0 0 0.5rem;
}
```

```tsx
// src/plan/PlanView.tsx
import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { isLockable } from "../app/actions";
import { numberParts, partsByKey } from "../instructions/numbering";
import type { Box, Settings, TraySpec } from "../model/types";
import { TrayDetails } from "../ui/TrayDetails";
import {
  clientToSvg,
  hitTest,
  labelFontSize,
  levelsOf,
  planFrame,
  planViewBox,
  toSvgRect,
  traysAt,
} from "./layers";
import "./plan.css";

export const DRAG_THRESHOLD_PX = 6;

export interface PlanViewProps {
  trays: readonly TraySpec[];
  box: Box;
  settings: Settings;
  lockedKeys: ReadonlySet<string>;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onSwap: (keyA: string, keyB: string) => void;
  onToggleLock: (key: string) => void;
  /** trayKeys with a size lock (shown as "size locked" on the tray). */
  sizeLockedKeys: ReadonlySet<string>;
  onToggleSizeLock: (key: string) => void;
}

interface Drag {
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

type SvgPointer = JSX.TargetedPointerEvent<SVGSVGElement>;

export function PlanView(props: PlanViewProps) {
  const {
    trays,
    box,
    settings,
    lockedKeys,
    selectedKey,
    onSelect,
    onSwap,
    onToggleLock,
    sizeLockedKeys,
    onToggleSizeLock,
  } = props;
  const levels = levelsOf(trays);
  const [levelIndex, setLevelIndex] = useState(0);
  const idx = Math.min(levelIndex, Math.max(0, levels.length - 1));
  const level = levels[idx] ?? 0;
  const belowLevel = idx > 0 ? levels[idx - 1] : undefined;
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const frame = planFrame(box, settings);
  const vb = planViewBox(frame);
  const byKey = partsByKey(numberParts(trays));
  const shown = traysAt(trays, level);
  const below = belowLevel === undefined ? [] : traysAt(trays, belowLevel);
  const rects = shown.map((t) => ({ key: t.key, rect: toSvgRect(t, frame) }));
  const selectedPart = selectedKey === null ? null : (byKey.get(selectedKey) ?? null);

  function choose(key: string): void {
    if (swapFrom !== null && swapFrom !== key) {
      onSwap(swapFrom, key);
      setSwapFrom(null);
      onSelect(swapFrom);
      return;
    }
    setSwapFrom(null);
    onSelect(key === selectedKey ? null : key);
  }

  function keyAt(clientX: number, clientY: number): string | null {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }
    const p = clientToSvg(svg.getBoundingClientRect(), vb, clientX, clientY);
    return p ? hitTest(rects, p) : null;
  }

  function endDrag(): void {
    dragRef.current = null;
    setDragKey(null);
    setDropKey(null);
  }

  const onPointerDown = (e: SvgPointer): void => {
    if (e.button !== 0) {
      return;
    }
    const target = e.target instanceof Element ? e.target.closest("[data-key]") : null;
    const key = target?.getAttribute("data-key") ?? null;
    if (key === null) {
      return;
    }
    const svg = e.currentTarget;
    if ("setPointerCapture" in svg) {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety; the drag still works without it.
      }
    }
    dragRef.current = {
      key,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  };

  const onPointerMove = (e: SvgPointer): void => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD_PX) {
      d.moved = true;
      setDragKey(d.key);
    }
    if (d.moved) {
      e.preventDefault();
      const over = keyAt(e.clientX, e.clientY);
      setDropKey(over !== d.key ? over : null);
    }
  };

  const onPointerUp = (e: SvgPointer): void => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      return;
    }
    endDrag();
    if (!d.moved) {
      choose(d.key);
      return;
    }
    const over = keyAt(e.clientX, e.clientY);
    if (over !== null && over !== d.key) {
      onSwap(d.key, over);
      onSelect(d.key);
    }
  };

  const onKeyDown = (e: { key: string; preventDefault: () => void }, key: string): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(key);
    } else if (e.key === "Escape") {
      setSwapFrom(null);
      onSelect(null);
    }
  };

  const selectedLocked = selectedPart !== null && lockedKeys.has(selectedPart.spec.key);

  return (
    <div class="plan">
      {levels.length > 1 ? (
        <fieldset class="layer-picker">
          <legend>Layer</legend>
          {levels.map((l, i) => (
            <label key={l}>
              <input
                type="radio"
                name="plan-layer"
                checked={i === idx}
                onChange={() => setLevelIndex(i)}
              />
              {i === 0 ? "1 (bottom)" : String(i + 1)}
            </label>
          ))}
        </fieldset>
      ) : null}
      <svg
        ref={svgRef}
        class="plan-svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="group"
        aria-label={`Plan of layer ${idx + 1} of ${Math.max(1, levels.length)}, seen from above, box front at the bottom`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endDrag}
      >
        <rect
          class="plan-box"
          x={-frame.bc}
          y={-frame.bc}
          width={frame.innerW}
          height={frame.innerD}
        />
        {below.map((t) => {
          const r = toSvgRect(t, frame);
          return (
            <rect
              key={`below-${t.key}`}
              class="plan-below"
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
            />
          );
        })}
        {shown.map((t) => {
          const r = toSvgRect(t, frame);
          const part = byKey.get(t.key);
          const n = part ? part.number : 0;
          const locked = lockedKeys.has(t.key);
          const sizeLocked = sizeLockedKeys.has(t.key);
          const cls = [
            "plan-tray",
            t.part === "leftover" ? "is-leftover" : "",
            t.key === selectedKey ? "is-selected" : "",
            t.key === dropKey ? "is-drop" : "",
            t.key === dragKey || t.key === swapFrom ? "is-source" : "",
            locked ? "is-locked" : "",
            sizeLocked ? "is-size-locked" : "",
          ]
            .filter((c) => c !== "")
            .join(" ");
          return (
            <g
              key={t.key}
              data-key={t.key}
              class={cls}
              role="button"
              tabIndex={0}
              aria-pressed={t.key === selectedKey}
              aria-label={`Tray ${n}: ${part ? part.label : t.key}${locked ? ", locked" : ""}${sizeLocked ? ", size locked" : ""}`}
              onKeyDown={(e) => onKeyDown(e, t.key)}
            >
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx={Math.max(0, Math.min(settings.cornerRadius, r.w / 4, r.h / 4))}
              />
              <text
                class="plan-label"
                x={r.x + r.w / 2}
                y={r.y + r.h / 2}
                style={{ fontSize: `${labelFontSize(r)}px` }}
              >
                {n}
              </text>
              {locked ? (
                <text class="plan-lock" x={r.x + 2} y={r.y + 5}>
                  locked
                </text>
              ) : null}
              {sizeLocked ? (
                <text class="plan-lock" x={r.x + 2} y={r.y + r.h - 5}>
                  size locked
                </text>
              ) : null}
            </g>
          );
        })}
        <text class="plan-front" x={frame.usableW / 2} y={frame.usableD + frame.bc + 9}>
          FRONT
        </text>
      </svg>
      <div class="plan-toolbar">
        <p class="hint">
          Tap a tray to select it. Drag a tray onto another to swap them, or select one and use
          “Swap with…”. Swapped trays are locked in place, then the layout is re-optimized.
        </p>
        {swapFrom !== null ? (
          <p role="status">Choose the tray to swap with, or press Escape.</p>
        ) : null}
        {selectedPart ? (
          <>
            <TrayDetails
              part={selectedPart}
              locked={selectedLocked}
              sizeLocked={sizeLockedKeys.has(selectedPart.spec.key)}
              onToggleSizeLock={() => onToggleSizeLock(selectedPart.spec.key)}
            />
            <div class="button-row">
              <button
                type="button"
                aria-pressed={swapFrom !== null}
                disabled={selectedPart.spec.part === "spacer"}
                onClick={() => setSwapFrom(swapFrom === null ? selectedPart.spec.key : null)}
              >
                Swap with…
              </button>
              <button
                type="button"
                disabled={!isLockable(selectedPart.spec)}
                onClick={() => onToggleLock(selectedPart.spec.key)}
              >
                {selectedLocked ? "Unlock position" : "Lock position"}
              </button>
              {!isLockable(selectedPart.spec) ? (
                <span class="hint">Leftover trays and spacers can't be locked.</span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
```

Vitest replaces every CSS import with an empty string, so `import planCss from "./plan.css?raw"` would read `""`. Edit `vite.config.ts` (plans 1 and 3): add the `css` line at the end of `test`, and change nothing else. The whole file afterwards:

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
    // Vitest stubs CSS imports to ""; PlanView.test.tsx reads plan.css as `?raw` to check
    // `touch-action: none`, so that file is passed through.
    css: { include: [/plan\.css/] },
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/plan/PlanView.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Manual check on a touch device emulation**

Run `npm run dev`, open the printed URL in Chrome, open DevTools → Toggle device toolbar (iPhone 12). Import `test/fixtures/cards-heavy.json` (Import JSON…), wait for the layout, then drag tray 1 onto another tray with the emulated touch: the page must not scroll, the target turns orange while hovered, and after release both trays show "locked" and a re-optimize starts. Tap a tray: its details appear below the plan.

- [ ] **Step 6: Commit**

```bash
cd apps/insert-generator
git add src/ui/TrayDetails.tsx src/plan/PlanView.tsx src/plan/plan.css src/plan/PlanView.test.tsx vite.config.ts
git commit -m "Add plan view with drag, keyboard swap and lock"
```

(Step 5 needs Task 21's app shell; if you run tasks in order, do this manual check after Task 21 and note it there.)

---

### Task 16: Mesh source and export builders

**Files:**

- Create: `src/app/support.ts`
- Create: `src/app/meshes.ts`
- Create: `src/app/exportBuild.ts`
- Test: `src/app/meshes.test.ts`, `src/app/exportBuild.test.ts`

**Interfaces:**

- Consumes: `GeometryClient` (Task 2; plan 3, roadmap §4.3: `build(spec, settings, signal?): Promise<{ mesh; volumeMm3 }>`, lazy worker; every failure rejects with a `GeometryBuildError` whose `name` is the reason: `"TraySpecError"`, `"UnsupportedFeatureError"` (with `feature`), `"AbortError"`, `"TimeoutError"` after `BUILD_TIMEOUT_MS` counted from the call, queue time included, `"WorkerError"`, or `"WorkerRestartedError"` for builds that waited while the worker was replaced), `GeometryBuildError` (`geometry/client`, tests only), `Mesh`, `KNOWN_PARTS`, `KNOWN_COMPARTMENT_KINDS`, `KNOWN_FEATURE_TYPES` (`geometry/types`, plan 3 Task 1, roadmap §4.3); `to3mf`, `toStl`, `zipFiles`, `partFileName`, `gridLayout` (`export`, plan 3); `numberParts`, `NumberedPart` (Task 13); `cubeMesh`, `makeTray` (Task 2, tests).
- Produces:
  - `unsupportedReason(spec: TraySpec): string | null` — `part`, compartment `kind` or feature `type` (of a compartment or of the part itself, `spec.features`) outside plan 3's `KNOWN_*` lists (newer-minor files, spec §9).
  - `buildErrorReason(e: unknown): string` — by `GeometryBuildError.name` (never `instanceof RangeError`): `"UnsupportedFeatureError"` → `Uses feature "<feature>" from a newer app version.`; `"TimeoutError"` → `Building this tray took too long.`; `"AbortError"` → `Cancelled.`; `"TraySpecError"` ("Tray <key>: …", an invalid spec) and others → their message. `isInvalidSpec(e): boolean` — `e.name === "TraySpecError"`.
  - `interface BuiltMesh { mesh: Mesh; volumeMm3: number }`; `class UnsupportedTrayError extends Error`
  - `interface MeshSource { get(spec: TraySpec, settings: Settings, signal?: AbortSignal): Promise<BuiltMesh>; reset(): void; dispose(): void }`; `MESH_CACHE_LIMIT = 64`; `MAX_IN_FLIGHT = 2`; `createMeshSource(load: () => Promise<GeometryClient>): MeshSource` — cached by `(spec, settings)`, failures are not cached, LRU-capped. Roadmap §4.3 contract: a build that fails with `"WorkerRestartedError"` or `"WorkerError"` is retried once; a spec that fails twice in a row (aborts aside; a success clears the count) is marked failed and rejects at once with its last error until `reset()`; at most `MAX_IN_FLIGHT` builds are in the worker at a time (the timeout counts queue time); the signal is passed to `build`, and a build still waiting for its turn when the signal aborts rejects without being sent.
  - `interface ExportPlan { parts: NumberedPart[]; skipped: { part: NumberedPart; reason: string }[] }`; `planExport(trays: readonly TraySpec[]): ExportPlan`
  - `interface ExportProgress { done: number; total: number }`; `interface ExportOptions { getMesh: (spec: TraySpec) => Promise<BuiltMesh>; onProgress: (p: ExportProgress) => void; yieldToUi?: () => Promise<void> }`; `interface ExportOutput { data: Uint8Array; failed: { part: NumberedPart; reason: string }[]; included: number }`
  - `GRID_GAP_MM = 5`; `yieldToUi(): Promise<void>`; `objectName(part: NumberedPart): string`; `meshFootprint(mesh: Mesh): { w: number; d: number }`; `usableBed(p: Printer): { x: number; y: number }`; `class NothingToExportError extends Error`
  - `buildPartsZip(parts: readonly NumberedPart[], opts: ExportOptions): Promise<ExportOutput>` (zip of one 3MF per part, `NN-<contents>.3mf`)
  - `buildCombined3mf(parts: readonly NumberedPart[], bed: { x: number; y: number }, opts: ExportOptions): Promise<ExportOutput>` (all parts in a grid at z = 0)
  - `buildStlZip(parts: readonly NumberedPart[], opts: ExportOptions): Promise<ExportOutput>`

A part whose mesh fails (e.g. a `GeometryBuildError` named `"TraySpecError"` for an invalid spec) is reported in `failed` and the export continues with the others. The builders await `yieldToUi()` after every mesh and every written file, so a 25-part export keeps the page responsive and the progress bar moving.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/meshes.test.ts
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { FeatureSpec } from "../model/types";
import { GeometryBuildError } from "../geometry/client";
import type { GeometryClient } from "./clients";
import { MAX_IN_FLIGHT, MESH_CACHE_LIMIT, UnsupportedTrayError, createMeshSource } from "./meshes";
import { buildErrorReason, isInvalidSpec, unsupportedReason } from "./support";
import { cubeMesh, makeTray } from "./test-helpers";

function fakeClient() {
  const build = vi.fn<GeometryClient["build"]>(() =>
    Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
  );
  const dispose = vi.fn();
  const client: GeometryClient = { build, dispose };
  return { client, build, dispose };
}

const magnet = makeTray({
  key: "m:p0:0",
  compartments: [
    {
      x: 2,
      y: 2,
      w: 10,
      d: 10,
      floorZ: 1.2,
      kind: "well",
      contents: "M",
      features: [{ type: "magnet" } as unknown as FeatureSpec],
    },
  ],
});

describe("unsupportedReason / buildErrorReason", () => {
  it("flags unknown features and accepts known trays", () => {
    expect(unsupportedReason(makeTray())).toBeNull();
    expect(unsupportedReason(magnet)).toBe('Uses feature "magnet" from a newer app version.');
  });

  it("turns build errors into readable reasons by their name", () => {
    const unsupported = new GeometryBuildError(
      'Unsupported tray feature "lid": this tray was made with a newer app version',
      "UnsupportedFeatureError",
      { feature: "lid" },
    );
    expect(buildErrorReason(unsupported)).toBe('Uses feature "lid" from a newer app version.');
    const invalid = new GeometryBuildError("Tray a:p0:0: compartments overlap", "TraySpecError");
    expect(buildErrorReason(invalid)).toBe("Tray a:p0:0: compartments overlap");
    expect(isInvalidSpec(invalid)).toBe(true);
    // A RangeError from elsewhere (the WASM heap) is not a verdict on the spec.
    expect(isInvalidSpec(new RangeError("Tray a:p0:0: out of memory"))).toBe(false);
    expect(buildErrorReason(new GeometryBuildError("slow", "TimeoutError"))).toBe(
      "Building this tray took too long.",
    );
    expect(buildErrorReason(new GeometryBuildError("cancelled", "AbortError"))).toBe("Cancelled.");
    expect(buildErrorReason("boom")).toBe("boom");
  });
});

describe("createMeshSource", () => {
  it("builds each spec once and loads the client lazily", async () => {
    const f = fakeClient();
    const load = vi.fn(() => Promise.resolve(f.client));
    const source = createMeshSource(load);
    expect(load).not.toHaveBeenCalled();
    const t = makeTray();
    await source.get(t, DEFAULT_SETTINGS);
    await source.get({ ...t }, DEFAULT_SETTINGS);
    expect(f.build).toHaveBeenCalledTimes(1);
    await source.get(t, { ...DEFAULT_SETTINGS, wall: 2 });
    expect(f.build).toHaveBeenCalledTimes(2);
  });

  it("rejects unsupported trays without building them", async () => {
    const f = fakeClient();
    const source = createMeshSource(() => Promise.resolve(f.client));
    await expect(source.get(magnet, DEFAULT_SETTINGS)).rejects.toBeInstanceOf(UnsupportedTrayError);
    expect(f.build).not.toHaveBeenCalled();
  });

  it("does not cache failures, so a retry builds again", async () => {
    const f = fakeClient();
    f.build.mockRejectedValueOnce(new Error("Geometry worker failed: oom"));
    const source = createMeshSource(() => Promise.resolve(f.client));
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).rejects.toThrow(/oom/);
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).resolves.toBeDefined();
    expect(f.build).toHaveBeenCalledTimes(2);
  });

  it("retries a build once when the worker was restarted under it or crashed", async () => {
    for (const reason of ["WorkerRestartedError", "WorkerError"]) {
      const f = fakeClient();
      f.build.mockRejectedValueOnce(new GeometryBuildError("worker gone", reason));
      const source = createMeshSource(() => Promise.resolve(f.client));
      await expect(source.get(makeTray(), DEFAULT_SETTINGS)).resolves.toBeDefined();
      expect(f.build).toHaveBeenCalledTimes(2);
    }
  });

  it("clears a spec's failure count when it builds", async () => {
    const f = fakeClient();
    const source = createMeshSource(() => Promise.resolve(f.client));
    const fail = (): void => {
      f.build.mockRejectedValueOnce(new GeometryBuildError("Tray t: bad", "TraySpecError"));
    };
    fail();
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).rejects.toThrow("bad");
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).resolves.toBeDefined();
    // Evict its mesh from the cache, so the next get builds it again.
    for (let i = 0; i < MESH_CACHE_LIMIT; i += 1) {
      await source.get(makeTray({ key: `other${i}` }), DEFAULT_SETTINGS);
    }
    fail();
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).rejects.toThrow("bad");
    // One failure since the success: not marked failed, so it builds again.
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).resolves.toBeDefined();
    expect(f.build).toHaveBeenCalledTimes(MESH_CACHE_LIMIT + 4);
  });

  it("marks a spec that fails twice as failed until reset, so it can't livelock the worker", async () => {
    const f = fakeClient();
    f.build.mockRejectedValueOnce(new GeometryBuildError("restarted", "WorkerRestartedError"));
    f.build.mockRejectedValueOnce(new GeometryBuildError("too slow", "TimeoutError"));
    const source = createMeshSource(() => Promise.resolve(f.client));
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).rejects.toThrow("too slow");
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).rejects.toThrow("too slow");
    expect(f.build).toHaveBeenCalledTimes(2);
    source.reset();
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).resolves.toBeDefined();
    expect(f.build).toHaveBeenCalledTimes(3);
  });

  it("passes the abort signal on and never sends a build aborted while it waited", async () => {
    const f = fakeClient();
    const releases: (() => void)[] = [];
    f.build.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ mesh: cubeMesh(), volumeMm3: 1000 }));
        }),
    );
    const source = createMeshSource(() => Promise.resolve(f.client));
    const busy = Array.from({ length: MAX_IN_FLIGHT }, (_v, i) =>
      source.get(makeTray({ key: `busy${i}` }), DEFAULT_SETTINGS),
    );
    const controller = new AbortController();
    const waiting = source.get(makeTray({ key: "late" }), DEFAULT_SETTINGS, controller.signal);
    await vi.waitFor(() => expect(f.build).toHaveBeenCalledTimes(MAX_IN_FLIGHT));
    expect(f.build.mock.calls[0]?.[2]).toBeUndefined();
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    for (const release of releases) {
      release();
    }
    await Promise.all(busy);
    await vi.waitFor(() => expect(f.build).toHaveBeenCalledTimes(MAX_IN_FLIGHT));
    expect(f.build).toHaveBeenCalledTimes(MAX_IN_FLIGHT);
  });

  it("caps the cache, resets and disposes", async () => {
    const f = fakeClient();
    const source = createMeshSource(() => Promise.resolve(f.client));
    for (let i = 0; i <= MESH_CACHE_LIMIT; i += 1) {
      await source.get(makeTray({ key: `k${i}` }), DEFAULT_SETTINGS);
    }
    await source.get(makeTray({ key: "k0" }), DEFAULT_SETTINGS);
    expect(f.build).toHaveBeenCalledTimes(MESH_CACHE_LIMIT + 2);
    source.reset();
    await source.get(makeTray({ key: "k1" }), DEFAULT_SETTINGS);
    expect(f.build).toHaveBeenCalledTimes(MESH_CACHE_LIMIT + 3);
    source.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.dispose).toHaveBeenCalled();
  });
});
```

```ts
// src/app/exportBuild.test.ts
import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { GeometryBuildError } from "../geometry/client";
import type { FeatureSpec } from "../model/types";
import {
  NothingToExportError,
  buildCombined3mf,
  buildPartsZip,
  buildStlZip,
  meshFootprint,
  objectName,
  planExport,
} from "./exportBuild";
import type { ExportProgress } from "./exportBuild";
import type { BuiltMesh } from "./meshes";
import { cubeMesh, makeTray } from "./test-helpers";

const ok = (): Promise<BuiltMesh> =>
  Promise.resolve({ mesh: cubeMesh([20, 30, 10]), volumeMm3: 6000 });

function trays(n: number) {
  return Array.from({ length: n }, (_v, i) => makeTray({ key: `t${i}:p0:0`, stack: i }));
}

describe("planExport", () => {
  it("numbers parts and sets aside unsupported ones with a reason", () => {
    const magnet = makeTray({
      key: "m:p0:0",
      stack: 9,
      compartments: [
        {
          x: 2,
          y: 2,
          w: 9,
          d: 9,
          floorZ: 1.2,
          kind: "well",
          contents: "M",
          features: [{ type: "magnet" } as unknown as FeatureSpec],
        },
      ],
    });
    const plan = planExport([...trays(2), magnet]);
    expect(plan.parts.map((p) => p.number)).toEqual([1, 2]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]?.reason).toMatch(/magnet/);
    expect(plan.skipped[0]?.part.number).toBe(3);
  });
});

describe("export builders", () => {
  it("yields after every part for 25 parts and reports monotonic progress", async () => {
    const parts = planExport(trays(25)).parts;
    const progress: ExportProgress[] = [];
    const yieldToUi = vi.fn(() => Promise.resolve());
    const out = await buildPartsZip(parts, {
      getMesh: ok,
      onProgress: (p) => progress.push(p),
      yieldToUi,
    });
    expect(yieldToUi.mock.calls.length).toBeGreaterThanOrEqual(25);
    expect(progress[0]).toEqual({ done: 0, total: 25 });
    expect(progress.at(-1)).toEqual({ done: 25, total: 25 });
    for (let i = 1; i < progress.length; i += 1) {
      expect(progress[i]?.done).toBeGreaterThanOrEqual(progress[i - 1]?.done ?? 0);
    }
    const files = Object.keys(unzipSync(out.data));
    expect(files).toHaveLength(25);
    expect(files.every((f) => /^\d\d-[A-Za-z0-9._-]+\.3mf$/.test(f))).toBe(true);
    expect(out.included).toBe(25);
  });

  it("continues past a tray whose mesh fails and reports it", async () => {
    const parts = planExport(trays(3)).parts;
    const getMesh = vi.fn((spec: { key: string }) =>
      spec.key === "t1:p0:0"
        ? Promise.reject(
            new GeometryBuildError("Tray t1:p0:0: compartments overlap", "TraySpecError"),
          )
        : ok(),
    );
    const out = await buildStlZip(parts, {
      getMesh,
      onProgress: vi.fn(),
      yieldToUi: () => Promise.resolve(),
    });
    expect(Object.keys(unzipSync(out.data))).toHaveLength(2);
    expect(Object.keys(unzipSync(out.data)).every((f) => f.endsWith(".stl"))).toBe(true);
    expect(out.failed.map((f) => [f.part.number, f.reason])).toEqual([
      [2, "Tray t1:p0:0: compartments overlap"],
    ]);
  });

  it("writes one combined 3MF laid out in a grid", async () => {
    const parts = planExport(trays(4)).parts;
    const out = await buildCombined3mf(
      parts,
      { x: 200, y: 200 },
      {
        getMesh: ok,
        onProgress: vi.fn(),
        yieldToUi: () => Promise.resolve(),
      },
    );
    expect(String.fromCharCode(out.data[0] ?? 0, out.data[1] ?? 0)).toBe("PK");
    expect(out.included).toBe(4);
  });

  it("refuses when nothing could be built", async () => {
    const parts = planExport(trays(1)).parts;
    await expect(
      buildPartsZip(parts, {
        getMesh: () => Promise.reject(new Error("Geometry worker failed: crash")),
        onProgress: vi.fn(),
        yieldToUi: () => Promise.resolve(),
      }),
    ).rejects.toBeInstanceOf(NothingToExportError);
  });

  it("names objects and measures footprints", () => {
    const part = planExport(trays(1)).parts[0];
    if (!part) {
      throw new Error("no part");
    }
    expect(objectName(part)).toBe("01 Deck A ×40");
    expect(meshFootprint(cubeMesh([20, 30, 10]))).toEqual({ w: 20, d: 30 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/insert-generator && npx vitest run src/app/meshes.test.ts src/app/exportBuild.test.ts`
Expected: FAIL — `Failed to resolve import "./meshes"` / `"./exportBuild"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/support.ts
import { KNOWN_COMPARTMENT_KINDS, KNOWN_FEATURE_TYPES, KNOWN_PARTS } from "../geometry/types";
import type { TraySpec } from "../model/types";

// Plan 3's lists (geometry/types has no WASM import, so the main bundle stays light).
const PARTS = new Set<string>(KNOWN_PARTS);
const KINDS = new Set<string>(KNOWN_COMPARTMENT_KINDS);
const FEATURES = new Set<string>(KNOWN_FEATURE_TYPES);

/** Why this app version can't build a stored tray (newer-minor files, spec §9), or null. */
export function unsupportedReason(spec: TraySpec): string | null {
  if (!PARTS.has(spec.part)) {
    return `Uses part type "${String(spec.part)}" from a newer app version.`;
  }
  // The part's own features (a card spacer's notch).
  for (const f of spec.features ?? []) {
    if (!FEATURES.has(f.type)) {
      return `Uses feature "${String(f.type)}" from a newer app version.`;
    }
  }
  for (const c of spec.compartments) {
    if (!KINDS.has(c.kind)) {
      return `Uses compartment kind "${String(c.kind)}" from a newer app version.`;
    }
    for (const f of c.features) {
      if (!FEATURES.has(f.type)) {
        return `Uses feature "${String(f.type)}" from a newer app version.`;
      }
    }
  }
  return null;
}

/**
 * Readable reason for a failed mesh build. The geometry client rejects with a
 * GeometryBuildError whose `name` is the reason (roadmap §4.3); it is matched by name, so this
 * module never imports the client.
 */
export function buildErrorReason(e: unknown): string {
  if (!(e instanceof Error)) {
    return String(e);
  }
  switch (e.name) {
    case "UnsupportedFeatureError": {
      const feature = (e as { feature?: unknown }).feature;
      return `Uses feature "${typeof feature === "string" ? feature : "?"}" from a newer app version.`;
    }
    case "TimeoutError":
      return "Building this tray took too long.";
    case "AbortError":
      return "Cancelled.";
    default:
      // "TraySpecError" (an invalid spec: "Tray <key>: …"), worker failures and anything else.
      return e.message;
  }
}

/** Whether a build failed because the spec is invalid (planTray's TraySpecError), by name. */
export function isInvalidSpec(e: unknown): boolean {
  return e instanceof Error && e.name === "TraySpecError";
}
```

```ts
// src/app/meshes.ts
import type { Mesh } from "../geometry/types";
import type { Settings, TraySpec } from "../model/types";
import type { GeometryClient } from "./clients";
import { unsupportedReason } from "./support";

export interface BuiltMesh {
  mesh: Mesh;
  volumeMm3: number;
}

export class UnsupportedTrayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedTrayError";
  }
}

export interface MeshSource {
  get(spec: TraySpec, settings: Settings, signal?: AbortSignal): Promise<BuiltMesh>;
  /** Forget cached meshes and failed specs (Retry after a failure). */
  reset(): void;
  dispose(): void;
}

export const MESH_CACHE_LIMIT = 64;

/**
 * Builds in the geometry worker at a time. The worker runs one build at a time and
 * BUILD_TIMEOUT_MS counts queue time, so the rest wait here (roadmap §4.3).
 */
export const MAX_IN_FLIGHT = 2;

function abortError(): Error {
  const error = new Error("cancelled");
  error.name = "AbortError";
  return error;
}

function isNamed(e: unknown, name: string): boolean {
  return e instanceof Error && e.name === name;
}

export function createMeshSource(load: () => Promise<GeometryClient>): MeshSource {
  let client: Promise<GeometryClient> | null = null;
  const cache = new Map<string, Promise<BuiltMesh>>();
  // Roadmap §4.3: a spec that fails twice is not built again until reset(), so a spec that kills
  // the worker can't keep restarting it.
  const failures = new Map<string, number>();
  const failed = new Map<string, unknown>();
  let inFlight = 0;
  const waiting: { start: () => void }[] = [];

  /** Waits for a free build slot; rejects when the signal aborts first. */
  function acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(abortError());
    }
    if (inFlight < MAX_IN_FLIGHT) {
      inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const entry = {
        start: () => {
          signal?.removeEventListener("abort", onAbort);
          inFlight += 1;
          resolve();
        },
      };
      const onAbort = (): void => {
        const i = waiting.indexOf(entry);
        if (i >= 0) {
          waiting.splice(i, 1);
        }
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      waiting.push(entry);
    });
  }

  function release(): void {
    inFlight -= 1;
    waiting.shift()?.start();
  }

  async function buildOnce(
    spec: TraySpec,
    settings: Settings,
    signal?: AbortSignal,
  ): Promise<BuiltMesh> {
    const c = await getClient();
    await acquire(signal);
    try {
      return await c.build(spec, settings, signal);
    } finally {
      release();
    }
  }

  /**
   * One build, retried once when the worker died under it (restarted while the build waited, or
   * crashed, maybe because of another build). Failures in a row count toward `failed`; a success
   * clears the count.
   */
  async function build(
    key: string,
    spec: TraySpec,
    settings: Settings,
    signal?: AbortSignal,
  ): Promise<BuiltMesh> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const built = await buildOnce(spec, settings, signal);
        failures.delete(key);
        return built;
      } catch (error) {
        if (isNamed(error, "AbortError")) {
          throw error;
        }
        const count = (failures.get(key) ?? 0) + 1;
        failures.set(key, count);
        if (count >= 2) {
          failed.set(key, error);
          throw error;
        }
        const workerDied = isNamed(error, "WorkerRestartedError") || isNamed(error, "WorkerError");
        if (attempt > 0 || !workerDied) {
          throw error;
        }
      }
    }
  }

  function getClient(): Promise<GeometryClient> {
    if (!client) {
      const loading = load();
      loading.catch(() => {
        if (client === loading) {
          client = null;
        }
      });
      client = loading;
    }
    return client;
  }

  /** The cached (or a new) build of a spec; the signal of the caller that started it applies. */
  function shared(
    key: string,
    spec: TraySpec,
    settings: Settings,
    signal?: AbortSignal,
  ): Promise<BuiltMesh> {
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const built = build(key, spec, settings, signal);
    cache.set(key, built);
    built.catch(() => {
      if (cache.get(key) === built) {
        cache.delete(key);
      }
    });
    while (cache.size > MESH_CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      cache.delete(oldest);
    }
    return built;
  }

  const source: MeshSource = {
    get(spec, settings, signal) {
      const reason = unsupportedReason(spec);
      if (reason !== null) {
        return Promise.reject(new UnsupportedTrayError(reason));
      }
      const key = JSON.stringify([spec, settings]);
      if (failed.has(key)) {
        return Promise.reject(failed.get(key));
      }
      // Another caller's abort must not fail this one: an aborted build has left the cache, so
      // asking again starts a new one.
      return shared(key, spec, settings, signal).catch((error: unknown) =>
        isNamed(error, "AbortError") && signal?.aborted !== true
          ? source.get(spec, settings, signal)
          : Promise.reject(error),
      );
    },
    reset() {
      cache.clear();
      failures.clear();
      failed.clear();
    },
    dispose() {
      cache.clear();
      const current = client;
      client = null;
      void current?.then(
        (c) => c.dispose(),
        () => undefined,
      );
    },
  };
  return source;
}
```

```ts
// src/app/exportBuild.ts
import { gridLayout, partFileName, to3mf, toStl, zipFiles } from "../export";
import type { Mesh } from "../geometry/types";
import { numberParts } from "../instructions/numbering";
import type { NumberedPart } from "../instructions/numbering";
import type { Printer, TraySpec } from "../model/types";
import type { BuiltMesh } from "./meshes";
import { buildErrorReason, unsupportedReason } from "./support";

export interface ExportPlan {
  parts: NumberedPart[];
  skipped: { part: NumberedPart; reason: string }[];
}

export interface ExportProgress {
  done: number;
  total: number;
}

export interface ExportOptions {
  getMesh: (spec: TraySpec) => Promise<BuiltMesh>;
  onProgress: (p: ExportProgress) => void;
  yieldToUi?: () => Promise<void>;
}

export interface ExportOutput {
  data: Uint8Array;
  failed: { part: NumberedPart; reason: string }[];
  included: number;
}

export const GRID_GAP_MM = 5;

export class NothingToExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NothingToExportError";
  }
}

export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function planExport(trays: readonly TraySpec[]): ExportPlan {
  const parts: NumberedPart[] = [];
  const skipped: ExportPlan["skipped"] = [];
  for (const part of numberParts(trays)) {
    const reason = unsupportedReason(part.spec);
    if (reason === null) {
      parts.push(part);
    } else {
      skipped.push({ part, reason });
    }
  }
  return { parts, skipped };
}

export function objectName(part: NumberedPart): string {
  return `${String(part.number).padStart(2, "0")} ${part.label}`;
}

/** Mesh frame: origin at the outer min corner (plan 3), so the footprint is max x / max y. */
export function meshFootprint(mesh: Mesh): { w: number; d: number } {
  let w = 0;
  let d = 0;
  for (let i = 0; i + 2 < mesh.positions.length; i += 3) {
    w = Math.max(w, mesh.positions[i] ?? 0);
    d = Math.max(d, mesh.positions[i + 1] ?? 0);
  }
  return { w, d };
}

export function usableBed(p: Printer): { x: number; y: number } {
  return { x: p.bedX - 2 * p.bedMargin, y: p.bedY - 2 * p.bedMargin };
}

interface Built {
  part: NumberedPart;
  mesh: Mesh;
}

async function collect(
  parts: readonly NumberedPart[],
  opts: ExportOptions,
): Promise<{ built: Built[]; failed: ExportOutput["failed"] }> {
  const pause = opts.yieldToUi ?? yieldToUi;
  const total = parts.length;
  const built: Built[] = [];
  const failed: ExportOutput["failed"] = [];
  opts.onProgress({ done: 0, total });
  for (const [i, part] of parts.entries()) {
    try {
      const { mesh } = await opts.getMesh(part.spec);
      built.push({ part, mesh });
    } catch (e) {
      failed.push({ part, reason: buildErrorReason(e) });
    }
    opts.onProgress({ done: i + 1, total });
    await pause();
  }
  if (built.length === 0) {
    throw new NothingToExportError(failed[0]?.reason ?? "There are no printable parts.");
  }
  return { built, failed };
}

export async function buildPartsZip(
  parts: readonly NumberedPart[],
  opts: ExportOptions,
): Promise<ExportOutput> {
  const pause = opts.yieldToUi ?? yieldToUi;
  const { built, failed } = await collect(parts, opts);
  const files: { name: string; data: Uint8Array }[] = [];
  for (const b of built) {
    files.push({
      name: partFileName(b.part.number, b.part.label, "3mf"),
      data: to3mf([{ name: objectName(b.part), mesh: b.mesh }]),
    });
    await pause();
  }
  return { data: zipFiles(files), failed, included: built.length };
}

export async function buildCombined3mf(
  parts: readonly NumberedPart[],
  bed: { x: number; y: number },
  opts: ExportOptions,
): Promise<ExportOutput> {
  const { built, failed } = await collect(parts, opts);
  const offsets = gridLayout(
    built.map((b) => meshFootprint(b.mesh)),
    bed,
    GRID_GAP_MM,
  );
  const data = to3mf(
    built.map((b, i) => ({
      name: objectName(b.part),
      mesh: b.mesh,
      transform: offsets[i] ?? [0, 0, 0],
    })),
  );
  return { data, failed, included: built.length };
}

export async function buildStlZip(
  parts: readonly NumberedPart[],
  opts: ExportOptions,
): Promise<ExportOutput> {
  const pause = opts.yieldToUi ?? yieldToUi;
  const { built, failed } = await collect(parts, opts);
  const files: { name: string; data: Uint8Array }[] = [];
  for (const b of built) {
    files.push({
      name: partFileName(b.part.number, b.part.label, "stl"),
      data: toStl(b.mesh, objectName(b.part)),
    });
    await pause();
  }
  return { data: zipFiles(files), failed, included: built.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/insert-generator && npx vitest run src/app/meshes.test.ts src/app/exportBuild.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/app/support.ts src/app/meshes.ts src/app/exportBuild.ts src/app/meshes.test.ts src/app/exportBuild.test.ts
git commit -m "Add cached mesh source and yielding export builders"
```

---

### Task 17: Export panel

**Files:**

- Create: `src/ui/ExportPanel.tsx`
- Test: `src/ui/ExportPanel.test.tsx`

**Interfaces:**

- Consumes: `planExport`, `buildPartsZip`, `buildCombined3mf`, `buildStlZip`, `usableBed`, `ExportOptions`, `ExportOutput` (Task 16); `MeshSource` (Task 16); `buildErrorReason` (Task 16); `downloadBlob`, `bytesToBlob`, `fileSlug` (Task 12).
- Produces:
  - `type ExportKind = "parts" | "combined" | "stl"`; `EXPORT_LABELS: Record<ExportKind, string>`
  - `interface ExportPanelProps { trays: readonly TraySpec[]; printer: Printer; settings: Settings; meshes: MeshSource; projectName: string; disabled: boolean; download?: (blob: Blob, filename: string) => void }`; `ExportPanel(props)` — three export buttons, progress while meshes build, per-tray "Not exported" list (unsupported features, failed builds), error with Retry (clears the mesh cache; the geometry client restarts a crashed worker on the next build).

File names: `<project>-3mf-parts.zip`, `<project>.3mf`, `<project>-stl.zip`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/ExportPanel.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, makeTray } from "../app/test-helpers";
import { GeometryBuildError } from "../geometry/client";
import { DEFAULT_PRINTER } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { FeatureSpec } from "../model/types";
import { ExportPanel } from "./ExportPanel";
import type { ExportPanelProps } from "./ExportPanel";

afterEach(cleanup);

function meshes() {
  const get = vi.fn<MeshSource["get"]>(() =>
    Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
  );
  const reset = vi.fn();
  return { get, reset, dispose: vi.fn() };
}

const magnet = makeTray({
  key: "m:p0:0",
  stack: 5,
  compartments: [
    {
      x: 2,
      y: 2,
      w: 9,
      d: 9,
      floorZ: 1.2,
      kind: "well",
      contents: "Magnets",
      features: [{ type: "magnet" } as unknown as FeatureSpec],
    },
  ],
});

function props(over: Partial<ExportPanelProps> = {}): ExportPanelProps {
  return {
    trays: [makeTray({ key: "a:p0:0", stack: 0 }), makeTray({ key: "b:p0:0", stack: 1 }), magnet],
    printer: DEFAULT_PRINTER,
    settings: DEFAULT_SETTINGS,
    meshes: meshes(),
    projectName: "Wing span",
    disabled: false,
    download: vi.fn(),
    ...over,
  };
}

describe("ExportPanel", () => {
  it("exports a zip of 3MF parts and lists the unsupported tray", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    expect(screen.getByText(/#3 Magnets: Uses feature "magnet"/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    expect(screen.getByRole("button", { name: "STL files (.zip)" }).hasAttribute("disabled")).toBe(
      true,
    );
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    const [blob, name] = vi.mocked(p.download ?? vi.fn()).mock.calls[0] ?? [];
    expect(name).toBe("Wing-span-3mf-parts.zip");
    expect(blob).toBeInstanceOf(Blob);
    expect(p.meshes.get).toHaveBeenCalledTimes(2);
  });

  it("exports the combined 3MF and the STL zip", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "One combined 3MF" }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "STL files (.zip)" }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(2));
    const names = vi.mocked(p.download ?? vi.fn()).mock.calls.map((c) => c[1]);
    expect(names).toEqual(["Wing-span.3mf", "Wing-span-stl.zip"]);
  });

  it("lists a tray whose build fails and still exports the rest", async () => {
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "b:p0:0"
        ? Promise.reject(
            new GeometryBuildError("Tray b:p0:0: compartments overlap", "TraySpecError"),
          )
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
    );
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    expect(screen.getByText(/#2 .*compartments overlap/)).toBeTruthy();
  });

  it("shows a worker failure with Retry", async () => {
    const m = meshes();
    m.get.mockImplementation(() =>
      Promise.reject(new Error("Geometry worker failed: out of memory")),
    );
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/out of memory/));
    m.get.mockImplementation(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(m.reset).toHaveBeenCalled();
    await waitFor(() => expect(p.download).toHaveBeenCalled());
  });

  it("disables everything while the layout is not ready", () => {
    render(<ExportPanel {...props({ disabled: true })} />);
    for (const name of ["3MF per part (.zip)", "One combined 3MF", "STL files (.zip)"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/ui/ExportPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./ExportPanel"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/ui/ExportPanel.tsx
import { useMemo, useState } from "preact/hooks";
import { bytesToBlob, downloadBlob, fileSlug } from "../app/download";
import {
  buildCombined3mf,
  buildPartsZip,
  buildStlZip,
  planExport,
  usableBed,
} from "../app/exportBuild";
import type { ExportOptions, ExportOutput } from "../app/exportBuild";
import type { MeshSource } from "../app/meshes";
import { buildErrorReason } from "../app/support";
import type { Printer, Settings, TraySpec } from "../model/types";

export type ExportKind = "parts" | "combined" | "stl";

const KINDS: ExportKind[] = ["parts", "combined", "stl"];

export const EXPORT_LABELS: Record<ExportKind, string> = {
  parts: "3MF per part (.zip)",
  combined: "One combined 3MF",
  stl: "STL files (.zip)",
};

export interface ExportPanelProps {
  trays: readonly TraySpec[];
  printer: Printer;
  settings: Settings;
  meshes: MeshSource;
  projectName: string;
  disabled: boolean;
  download?: (blob: Blob, filename: string) => void;
}

interface Busy {
  kind: ExportKind;
  done: number;
  total: number;
}

export function ExportPanel(p: ExportPanelProps) {
  const plan = useMemo(() => planExport(p.trays), [p.trays]);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<{ kind: ExportKind; message: string } | null>(null);
  const [failed, setFailed] = useState<ExportOutput["failed"]>([]);
  const download = p.download ?? downloadBlob;
  const slug = fileSlug(p.projectName);

  async function run(kind: ExportKind): Promise<void> {
    setError(null);
    setFailed([]);
    setBusy({ kind, done: 0, total: plan.parts.length });
    const opts: ExportOptions = {
      getMesh: (spec) => p.meshes.get(spec, p.settings),
      onProgress: (progress) => setBusy({ kind, ...progress }),
    };
    try {
      if (kind === "parts") {
        const out = await buildPartsZip(plan.parts, opts);
        download(bytesToBlob(out.data, "application/zip"), `${slug}-3mf-parts.zip`);
        setFailed(out.failed);
      } else if (kind === "combined") {
        const out = await buildCombined3mf(plan.parts, usableBed(p.printer), opts);
        download(bytesToBlob(out.data, "model/3mf"), `${slug}.3mf`);
        setFailed(out.failed);
      } else {
        const out = await buildStlZip(plan.parts, opts);
        download(bytesToBlob(out.data, "application/zip"), `${slug}-stl.zip`);
        setFailed(out.failed);
      }
    } catch (e) {
      setError({ kind, message: buildErrorReason(e) });
    } finally {
      setBusy(null);
    }
  }

  const notExported = [...plan.skipped, ...failed];

  return (
    <div class="export-panel">
      <p class="hint">
        Every part prints open side up, the way it sits in the box. Parts are numbered as in the
        plan view and on the assembly page.
      </p>
      <div class="button-row">
        {KINDS.map((k) => (
          <button
            type="button"
            key={k}
            disabled={p.disabled || busy !== null || plan.parts.length === 0}
            onClick={() => {
              void run(k);
            }}
          >
            {EXPORT_LABELS[k]}
          </button>
        ))}
      </div>
      {busy ? (
        <div class="run-status" role="status">
          <progress value={busy.done} max={Math.max(1, busy.total)} aria-label="Building meshes" />
          <span>{`Building meshes ${busy.done}/${busy.total}…`}</span>
        </div>
      ) : null}
      {error ? (
        <div class="run-error" role="alert">
          <p>{`Export failed: ${error.message}`}</p>
          <button
            type="button"
            onClick={() => {
              p.meshes.reset();
              void run(error.kind);
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      {notExported.length > 0 ? (
        <div class="export-skipped">
          <h3>Not exported</h3>
          <ul>
            {notExported.map((s) => (
              <li key={s.part.spec.key}>{`#${s.part.number} ${s.part.label}: ${s.reason}`}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/ui/ExportPanel.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/ui/ExportPanel.tsx src/ui/ExportPanel.test.tsx
git commit -m "Add export panel with progress and per-tray failures"
```

---

### Task 18: 3D viewer (lazy three.js)

**Files:**

- Create: `src/viewer/types.ts`
- Create: `src/viewer/transform.ts`
- Create: `src/viewer/webgl.ts`
- Create: `src/viewer/scene.ts`
- Create: `src/viewer/Viewer.tsx`
- Test: `src/viewer/transform.test.ts`, `src/viewer/Viewer.test.tsx`

**Interfaces:**

- Consumes: `Mesh` (`geometry/types`); `MeshSource` (Task 16); `effective` (`model/settings`); `levelsOf` (Task 13); `numberParts`, `partsByKey` (Task 13); `TrayDetails` (Task 15); `SelectField` (Task 6); `three` (`WebGLRenderer`, `Scene`, …, `three/addons/controls/OrbitControls.js`).
- Produces:
  - `interface SceneTray { spec: TraySpec; mesh: Mesh }`; `interface BoxOutline { min: [number, number, number]; size: [number, number, number] }`
  - `interface SceneHandle { setBox(outline: BoxOutline): void; setTrays(trays: readonly SceneTray[]): void; setExplode(f: number): void; setMaxLevel(level: number | null): void; setSelected(key: string | null): void; onPick(cb: (key: string | null) => void): void; resize(width: number, height: number): void; dispose(): void }`; `type SceneFactory = (canvas: HTMLCanvasElement) => SceneHandle`
  - `EXPLODE_MM = 40`; `trayPosition(spec: TraySpec, explode: number): [number, number, number]`; `isVisible(spec: TraySpec, maxLevel: number | null): boolean`; `boxOutline(box: Box, settings: Settings): BoxOutline`; `trayColor(index: number): { h: number; s: number; l: number }`
  - `hasWebGL(): boolean`
  - `createScene: SceneFactory` (`viewer/scene.ts`, the only module importing `three`; loaded with `import("./scene")`)
  - `interface ViewerProps { trays: readonly TraySpec[]; box: Box; settings: Settings; meshes: MeshSource; selectedKey: string | null; lockedKeys: ReadonlySet<string>; sizeLockedKeys?: ReadonlySet<string>; onToggleSizeLock?: (key: string) => void; onSelect: (key: string | null) => void; webgl?: () => boolean; loadScene?: () => Promise<SceneFactory> }`; `Viewer(props)` — no-WebGL message, lazy scene, explode slider, layer select, click → details, mesh progress, per-part failure + Retry, `dispose()` on unmount.

The scene uses Z-up box coordinates (camera `up = (0, 0, 1)`), renders on demand (OrbitControls `change`), and picks with a raycaster on a click that moved less than 5 px.

- [ ] **Step 1: Write the failing tests**

```ts
// src/viewer/transform.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import { EXPLODE_MM, boxOutline, isVisible, trayColor, trayPosition } from "./transform";

describe("viewer transforms", () => {
  it("lifts upper levels when exploded", () => {
    const upper = makeTray({ x: 3, y: 4, z: 40, level: 1 });
    expect(trayPosition(upper, 0)).toEqual([3, 4, 40]);
    expect(trayPosition(upper, 1)).toEqual([3, 4, 40 + EXPLODE_MM]);
    expect(trayPosition(makeTray({ level: 0 }), 1)).toEqual([0, 0, 0]);
  });

  it("filters layers", () => {
    expect(isVisible(makeTray({ level: 2 }), null)).toBe(true);
    expect(isVisible(makeTray({ level: 2 }), 1)).toBe(false);
  });

  it("outlines the inner box around the clearance origin", () => {
    expect(
      boxOutline(
        { ...DEFAULT_BOX, innerWidth: 200, innerDepth: 100, innerHeight: 50 },
        DEFAULT_SETTINGS,
      ),
    ).toEqual({
      min: [-0.5, -0.5, 0],
      size: [200, 100, 50],
    });
  });

  it("spreads colours", () => {
    expect(trayColor(0)).toEqual({ h: 0, s: 0.45, l: 0.62 });
    expect(trayColor(1).h).not.toBe(trayColor(2).h);
  });
});
```

```tsx
// src/viewer/Viewer.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { SceneFactory, SceneHandle } from "./types";
import { Viewer } from "./Viewer";
import type { ViewerProps } from "./Viewer";

afterEach(cleanup);

function stubScene() {
  let picked: ((key: string | null) => void) | null = null;
  const handle: SceneHandle = {
    setBox: vi.fn(),
    setTrays: vi.fn(),
    setExplode: vi.fn(),
    setMaxLevel: vi.fn(),
    setSelected: vi.fn(),
    onPick: vi.fn((cb: (key: string | null) => void) => {
      picked = cb;
    }),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  const factory = vi.fn<SceneFactory>(() => handle);
  return { handle, factory, pick: (key: string | null) => picked?.(key) };
}

function meshes() {
  const get = vi.fn<MeshSource["get"]>(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 }));
  return { get, reset: vi.fn(), dispose: vi.fn() };
}

const trays = [
  makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
  makeTray({ key: "b:p0:0", stack: 0, level: 1, z: 40 }),
];

function props(over: Partial<ViewerProps>, scene: ReturnType<typeof stubScene>): ViewerProps {
  return {
    trays,
    box: DEFAULT_BOX,
    settings: DEFAULT_SETTINGS,
    meshes: meshes(),
    selectedKey: null,
    lockedKeys: new Set(),
    onSelect: vi.fn(),
    webgl: () => true,
    loadScene: () => Promise.resolve(scene.factory),
    ...over,
  };
}

describe("Viewer", () => {
  it("shows a message without WebGL and never loads three", () => {
    const scene = stubScene();
    render(<Viewer {...props({ webgl: () => false }, scene)} />);
    expect(screen.getByRole("note").textContent).toMatch(/needs WebGL/);
    expect(scene.factory).not.toHaveBeenCalled();
  });

  it("falls back when creating the renderer throws", async () => {
    const scene = stubScene();
    const broken = vi.fn<SceneFactory>(() => {
      throw new Error("Error creating WebGL context");
    });
    render(<Viewer {...props({ loadScene: () => Promise.resolve(broken) }, scene)} />);
    await waitFor(() => expect(screen.getByRole("note").textContent).toMatch(/needs WebGL/));
  });

  it("loads the scene, builds meshes and wires the controls", async () => {
    const scene = stubScene();
    const p = props({}, scene);
    const view = render(<Viewer {...p} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    expect(vi.mocked(scene.handle.setTrays).mock.calls.at(-1)?.[0]).toHaveLength(2);
    expect(scene.handle.setBox).toHaveBeenCalled();
    fireEvent.input(screen.getByLabelText("Explode"), { target: { value: "0.5" } });
    expect(scene.handle.setExplode).toHaveBeenLastCalledWith(0.5);
    fireEvent.change(screen.getByLabelText("Show layers"), { target: { value: "0" } });
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(0);
    scene.pick("b:p0:0");
    expect(p.onSelect).toHaveBeenCalledWith("b:p0:0");
    view.rerender(<Viewer {...p} selectedKey="b:p0:0" />);
    expect(scene.handle.setSelected).toHaveBeenLastCalledWith("b:p0:0");
    expect(screen.getByRole("heading", { name: /^#2 / })).toBeTruthy();
    view.unmount();
    expect(scene.handle.dispose).toHaveBeenCalled();
  });

  it("reports parts that could not be built and retries", async () => {
    const scene = stubScene();
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "b:p0:0"
        ? Promise.reject(new Error("bad"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 }),
    );
    render(<Viewer {...props({ meshes: m }, scene)} />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/1 part\(s\) couldn't be shown/),
    );
    m.get.mockImplementation(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(m.reset).toHaveBeenCalled();
    await waitFor(() =>
      expect(vi.mocked(scene.handle.setTrays).mock.calls.at(-1)?.[0]).toHaveLength(2),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/insert-generator && npx vitest run src/viewer`
Expected: FAIL — `Failed to resolve import "./transform"` / `"./Viewer"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/viewer/types.ts
import type { Mesh } from "../geometry/types";
import type { TraySpec } from "../model/types";

export interface SceneTray {
  spec: TraySpec;
  mesh: Mesh;
}

export interface BoxOutline {
  min: [number, number, number];
  size: [number, number, number];
}

export interface SceneHandle {
  setBox(outline: BoxOutline): void;
  setTrays(trays: readonly SceneTray[]): void;
  setExplode(f: number): void;
  setMaxLevel(level: number | null): void;
  setSelected(key: string | null): void;
  onPick(cb: (key: string | null) => void): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export type SceneFactory = (canvas: HTMLCanvasElement) => SceneHandle;
```

```ts
// src/viewer/transform.ts
import { effective } from "../model/settings";
import type { Box, Settings, TraySpec } from "../model/types";
import type { BoxOutline } from "./types";

export const EXPLODE_MM = 40;

export function trayPosition(spec: TraySpec, explode: number): [number, number, number] {
  return [spec.x, spec.y, spec.z + spec.level * explode * EXPLODE_MM];
}

export function isVisible(spec: TraySpec, maxLevel: number | null): boolean {
  return maxLevel === null || spec.level <= maxLevel;
}

/** Tray coordinates start after boxClearance, so the inner box starts at −boxClearance. */
export function boxOutline(box: Box, settings: Settings): BoxOutline {
  const bc = effective(settings).boxClearance;
  return { min: [-bc, -bc, 0], size: [box.innerWidth, box.innerDepth, box.innerHeight] };
}

export function trayColor(index: number): { h: number; s: number; l: number } {
  return { h: (index * 0.137) % 1, s: 0.45, l: 0.62 };
}
```

```ts
// src/viewer/webgl.ts
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
```

```ts
// src/viewer/scene.ts
// The only module that imports three; Viewer loads it with import("./scene").
import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh as ThreeMesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TraySpec } from "../model/types";
import { isVisible, trayColor, trayPosition } from "./transform";
import type { BoxOutline, SceneFactory, SceneHandle, SceneTray } from "./types";

interface TrayObject {
  spec: TraySpec;
  object: ThreeMesh;
  material: MeshStandardMaterial;
}

const CLICK_SLOP_PX = 5;

export const createScene: SceneFactory = (canvas) => {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 1, 10000);
  camera.up.set(0, 0, 1);
  camera.position.set(150, -300, 300);
  const controls = new OrbitControls(camera, canvas);
  scene.add(new AmbientLight(0xffffff, 0.7));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-1, -2, 3);
  scene.add(sun);

  let trays: TrayObject[] = [];
  let outline: { line: LineSegments; material: LineBasicMaterial } | null = null;
  let explode = 0;
  let maxLevel: number | null = null;
  let selected: string | null = null;
  let pick: ((key: string | null) => void) | null = null;
  let frameId = 0;
  let down: { x: number; y: number } | null = null;
  const raycaster = new Raycaster();

  const draw = (): void => {
    frameId = 0;
    renderer.render(scene, camera);
  };
  const requestDraw = (): void => {
    if (frameId === 0) {
      frameId = requestAnimationFrame(draw);
    }
  };
  controls.addEventListener("change", requestDraw);

  function apply(): void {
    for (const t of trays) {
      const [x, y, z] = trayPosition(t.spec, explode);
      t.object.position.set(x, y, z);
      t.object.visible = isVisible(t.spec, maxLevel);
      t.material.emissive.setHex(t.spec.key === selected ? 0x444444 : 0x000000);
    }
    requestDraw();
  }

  function clearTrays(): void {
    for (const t of trays) {
      scene.remove(t.object);
      t.object.geometry.dispose();
      t.material.dispose();
    }
    trays = [];
  }

  function clearOutline(): void {
    if (outline) {
      scene.remove(outline.line);
      outline.line.geometry.dispose();
      outline.material.dispose();
      outline = null;
    }
  }

  const onPointerDown = (e: PointerEvent): void => {
    down = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent): void => {
    const start = down;
    down = null;
    if (!start || !pick || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const visible = trays.filter((t) => t.object.visible).map((t) => t.object);
    const hit = raycaster.intersectObjects(visible, false)[0];
    const found = hit ? trays.find((t) => t.object === hit.object) : undefined;
    pick(found ? found.spec.key : null);
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);

  const handle: SceneHandle = {
    setBox(o: BoxOutline) {
      clearOutline();
      const [w, d, h] = o.size;
      const [x0, y0, z0] = o.min;
      const solid = new BoxGeometry(w, d, h);
      const edges = new EdgesGeometry(solid);
      solid.dispose();
      const material = new LineBasicMaterial({ color: 0x888888 });
      const line = new LineSegments(edges, material);
      line.position.set(x0 + w / 2, y0 + d / 2, z0 + h / 2);
      scene.add(line);
      outline = { line, material };
      const dist = Math.max(w, d, h) * 1.6;
      controls.target.set(x0 + w / 2, y0 + d / 2, z0 + h / 2);
      camera.position.set(x0 + w / 2, y0 + d / 2 - dist, z0 + h / 2 + dist * 0.9);
      camera.far = dist * 10;
      camera.updateProjectionMatrix();
      controls.update();
      requestDraw();
    },
    setTrays(list: readonly SceneTray[]) {
      clearTrays();
      list.forEach(({ spec, mesh }, i) => {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
        geometry.setIndex(new BufferAttribute(mesh.indices, 1));
        geometry.computeVertexNormals();
        const c = trayColor(i);
        const material = new MeshStandardMaterial({
          color: new Color().setHSL(c.h, c.s, c.l),
          flatShading: true,
          roughness: 0.8,
        });
        const object = new ThreeMesh(geometry, material);
        scene.add(object);
        trays.push({ spec, object, material });
      });
      apply();
    },
    setExplode(f) {
      explode = f;
      apply();
    },
    setMaxLevel(level) {
      maxLevel = level;
      apply();
    },
    setSelected(key) {
      selected = key;
      apply();
    },
    onPick(cb) {
      pick = cb;
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) {
        return;
      }
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestDraw();
    },
    dispose() {
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      controls.removeEventListener("change", requestDraw);
      controls.dispose();
      clearTrays();
      clearOutline();
      renderer.dispose();
      pick = null;
    },
  };
  return handle;
};
```

```tsx
// src/viewer/Viewer.tsx
import { useEffect, useRef, useState } from "preact/hooks";
import type { MeshSource } from "../app/meshes";
import { numberParts, partsByKey } from "../instructions/numbering";
import type { Box, Settings, TraySpec } from "../model/types";
import { levelsOf } from "../plan/layers";
import { SelectField } from "../ui/fields";
import { TrayDetails } from "../ui/TrayDetails";
import { boxOutline } from "./transform";
import type { SceneFactory, SceneHandle, SceneTray } from "./types";
import { hasWebGL } from "./webgl";

export interface ViewerProps {
  trays: readonly TraySpec[];
  box: Box;
  settings: Settings;
  meshes: MeshSource;
  selectedKey: string | null;
  lockedKeys: ReadonlySet<string>;
  /** trayKeys with a size lock; with `onToggleSizeLock` the details offer "Lock size". */
  sizeLockedKeys?: ReadonlySet<string>;
  onToggleSizeLock?: (key: string) => void;
  onSelect: (key: string | null) => void;
  webgl?: () => boolean;
  loadScene?: () => Promise<SceneFactory>;
}

type Status = "loading" | "ready" | "nowebgl" | "error";

async function defaultLoadScene(): Promise<SceneFactory> {
  const mod = await import("./scene");
  return mod.createScene;
}

export function Viewer(p: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const onSelectRef = useRef(p.onSelect);
  onSelectRef.current = p.onSelect;
  const [status, setStatus] = useState<Status>(() =>
    (p.webgl ?? hasWebGL)() ? "loading" : "nowebgl",
  );
  const [explode, setExplode] = useState(0);
  const [maxLevel, setMaxLevel] = useState<number | null>(null);
  const [build, setBuild] = useState({ done: 0, total: 0, failed: 0 });
  const [attempt, setAttempt] = useState(0);
  const levels = levelsOf(p.trays);
  const byKey = partsByKey(numberParts(p.trays));

  useEffect(
    () => () => {
      handleRef.current?.dispose();
      handleRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (status !== "loading") {
      return undefined;
    }
    let cancelled = false;
    (p.loadScene ?? defaultLoadScene)().then(
      (factory) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) {
          return;
        }
        try {
          const handle = factory(canvas);
          handle.onPick((key) => onSelectRef.current(key));
          handleRef.current = handle;
          setStatus("ready");
        } catch {
          setStatus("nowebgl");
        }
      },
      () => {
        if (!cancelled) {
          setStatus("error");
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    const h = handleRef.current;
    if (status === "ready" && h) {
      h.setBox(boxOutline(p.box, p.settings));
    }
  }, [status, p.box, p.settings]);

  useEffect(() => {
    const h = handleRef.current;
    if (status !== "ready" || !h) {
      return undefined;
    }
    let cancelled = false;
    // Builds this effect no longer needs are aborted (roadmap §4.3): the worker skips them.
    const controller = new AbortController();
    const list = p.trays;
    const results: (SceneTray | null)[] = list.map(() => null);
    let done = 0;
    let failed = 0;
    setBuild({ done: 0, total: list.length, failed: 0 });
    void Promise.all(
      list.map(async (spec, i) => {
        try {
          const built = await p.meshes.get(spec, p.settings, controller.signal);
          results[i] = { spec, mesh: built.mesh };
        } catch {
          failed += 1;
        }
        done += 1;
        if (!cancelled) {
          setBuild({ done, total: list.length, failed });
        }
      }),
    ).then(() => {
      if (!cancelled) {
        h.setTrays(results.filter((r): r is SceneTray => r !== null));
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [status, p.trays, p.settings, p.meshes, attempt]);

  useEffect(() => {
    handleRef.current?.setExplode(explode);
  }, [status, explode]);

  useEffect(() => {
    handleRef.current?.setMaxLevel(maxLevel);
  }, [status, maxLevel]);

  useEffect(() => {
    handleRef.current?.setSelected(p.selectedKey);
  }, [status, p.selectedKey]);

  useEffect(() => {
    const h = handleRef.current;
    const canvas = canvasRef.current;
    if (status !== "ready" || !h || !canvas) {
      return undefined;
    }
    const fit = (): void => h.resize(canvas.clientWidth, canvas.clientHeight);
    fit();
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [status]);

  if (status === "nowebgl") {
    return (
      <p class="viewer-fallback" role="note">
        The 3D preview needs WebGL, which isn't available in this browser. The plan view, export and
        assembly page still work.
      </p>
    );
  }

  const selected = p.selectedKey === null ? undefined : byKey.get(p.selectedKey);
  return (
    <div class="viewer">
      <canvas
        ref={canvasRef}
        class="viewer-canvas"
        aria-label="3D preview. Drag to turn, scroll or pinch to zoom, click a tray for details."
      />
      {status === "loading" ? <p class="hint">Loading the 3D preview…</p> : null}
      {status === "error" ? (
        <p role="alert">
          Couldn't load the 3D preview.{" "}
          <button type="button" onClick={() => setStatus("loading")}>
            Retry
          </button>
        </p>
      ) : null}
      {build.total > 0 && build.done < build.total ? (
        <div class="run-status" role="status">
          <progress value={build.done} max={build.total} aria-label="Building 3D models" />
          <span>{`Building 3D models ${build.done}/${build.total}…`}</span>
        </div>
      ) : null}
      {build.failed > 0 && build.done === build.total ? (
        <p role="alert">
          {`${build.failed} part(s) couldn't be shown. `}
          <button
            type="button"
            onClick={() => {
              p.meshes.reset();
              setAttempt((a) => a + 1);
            }}
          >
            Retry
          </button>
        </p>
      ) : null}
      <div class="viewer-controls">
        <label class="range-field">
          Explode
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={explode}
            onInput={(e) => setExplode(Number(e.currentTarget.value))}
          />
        </label>
        {levels.length > 1 ? (
          <SelectField
            id="viewer-layers"
            label="Show layers"
            value={maxLevel === null ? "all" : String(maxLevel)}
            options={[
              { value: "all", label: "All layers" },
              ...levels.map((l, i) => ({
                value: String(l),
                label: i === 0 ? "Bottom layer only" : `Up to layer ${i + 1}`,
              })),
            ]}
            onChange={(v) => setMaxLevel(v === "all" ? null : Number(v))}
          />
        ) : null}
      </div>
      {selected ? (
        <TrayDetails
          part={selected}
          locked={p.lockedKeys.has(selected.spec.key)}
          sizeLocked={p.sizeLockedKeys?.has(selected.spec.key) ?? false}
          onToggleSizeLock={
            p.onToggleSizeLock ? () => p.onToggleSizeLock?.(selected.spec.key) : undefined
          }
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/insert-generator && npx vitest run src/viewer`
Expected: PASS (8 tests).

- [ ] **Step 5: Type-check the three.js module**

Run: `cd apps/insert-generator && npx tsc --noEmit`
Expected: no errors (`scene.ts` is only type-checked; jsdom has no WebGL, so it is exercised in the manual check of Task 21).

- [ ] **Step 6: Commit**

```bash
cd apps/insert-generator
git add src/viewer
git commit -m "Add lazy three.js viewer with explode, layers and picking"
```

---

### Task 19: Assembly diagrams, packing order and PNG

**Files:**

- Create: `src/instructions/render.ts`
- Create: `src/instructions/png.ts`
- Test: `src/instructions/render.test.ts`

**Interfaces:**

- Consumes: `planFrame`, `planViewBox`, `levelsOf`, `traysAt`, `spacersAt`, `toSvgRect`, `labelFontSize` (Task 13); `numberParts`, `partsByKey`, `NumberedPart` (Task 13); `Project`, `StoredLayout`.
- Produces:
  - `escapeXml(s: string): string`
  - `render(layout: StoredLayout, project: Project): string[]` — one standalone SVG document per layer (spec §4 `render(layout, project) → SVG[]`), bottom layer first, numbered parts, box outline, "FRONT" marker, the layer below as dashed outlines, spacers hatched.
  - `interface PartRow { number: number; label: string; size: string; layer: number; contents: string[]; goesInto: number | null }`; `whatGoesWhere(layout: StoredLayout): PartRow[]`
  - `packingSteps(layout: StoredLayout): string[]` — bottom layer first, each spacer right after its tray.
  - `svgDataUrl(svg: string): string`; `pngSize(svg: string, widthPx: number): { width: number; height: number }`; `svgToPng(svg: string, widthPx?: number): Promise<Blob>` (canvas, white background).

- [ ] **Step 1: Write the failing test**

```ts
// src/instructions/render.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { pngSize, svgDataUrl } from "./png";
import { escapeXml, packingSteps, render, whatGoesWhere } from "./render";

const bottom = makeTray({ key: "a:p0:0", stack: 0, level: 0, x: 0, y: 0, w: 120, d: 90, h: 30 });
const spacer = makeTray({
  key: "a:p0:0:spacer",
  part: "spacer",
  path: "",
  stack: 0,
  level: 0,
  x: 5,
  y: 5,
  w: 10,
  d: 60,
  h: 20,
  solid: true,
  compartments: [],
});
const top = makeTray({
  key: "b:p0:0",
  stack: 0,
  level: 1,
  x: 1.45,
  y: 1.45,
  z: 30,
  w: 117,
  d: 87,
  h: 25,
  compartments: [
    {
      x: 2,
      y: 2,
      w: 100,
      d: 70,
      floorZ: 1.2,
      kind: "scoop",
      contents: "<Coins> & gems",
      features: [],
    },
  ],
});
const side = makeTray({ key: "c:p0:0", stack: 1, level: 0, x: 130, y: 0, w: 100, d: 90, h: 55 });
const layout = makeLayout("h", [bottom, spacer, top, side]);

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

describe("render", () => {
  it("draws one well-formed SVG per layer, bottom first", () => {
    const svgs = render(layout, fixtureProject());
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      expect(parse(svg).getElementsByTagName("parsererror")).toHaveLength(0);
      expect(svg).toContain(">FRONT<");
    }
    const [first, second] = svgs;
    expect(first).toContain("<title>Layer 1 of 2</title>");
    expect(first).toMatch(/>1<\/text>/);
    expect(first).toMatch(/>2<\/text>/);
    expect(first).toMatch(/>4<\/text>/);
    expect(second).toMatch(/>3<\/text>/);
    expect(second).toContain("&lt;Coins&gt; &amp; gems");
    expect(second).not.toMatch(/>4<\/text>/);
  });

  it("escapes XML", () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;",
    );
  });
});

describe("packing order and parts list", () => {
  it("packs bottom first, spacers after their tray", () => {
    expect(packingSteps(layout)).toEqual([
      "Layer 1: place #1 Deck A ×40.",
      "Slide card spacer #2 into tray #1.",
      "Layer 1: place #4 Deck A ×40.",
      "Layer 2: place #3 <Coins> & gems on top.",
    ]);
  });

  it("lists what goes where", () => {
    const rows = whatGoesWhere(layout);
    expect(rows.map((r) => [r.number, r.layer, r.goesInto])).toEqual([
      [1, 1, null],
      [2, 1, 1],
      [3, 2, null],
      [4, 1, null],
    ]);
    expect(rows[0]?.size).toBe("120.0 × 90.0 × 30.0 mm");
    expect(rows[2]?.contents).toEqual(["<Coins> & gems"]);
  });
});

describe("png helpers", () => {
  it("builds a data URL and keeps the aspect ratio", () => {
    expect(svgDataUrl("<svg/>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
    expect(pngSize('<svg viewBox="-4.5 -4.5 209 125">', 1000)).toEqual({
      width: 1000,
      height: 598,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/instructions/render.test.ts`
Expected: FAIL — `Failed to resolve import "./png"` / `"./render"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/instructions/render.ts
import type { Project, StoredLayout } from "../model/types";
import {
  labelFontSize,
  levelsOf,
  planFrame,
  planViewBox,
  spacersAt,
  toSvgRect,
  traysAt,
} from "../plan/layers";
import type { PlanFrame, ViewBox } from "../plan/layers";
import { numberParts, partsByKey } from "./numbering";
import type { NumberedPart } from "./numbering";

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const n = (v: number): string => v.toFixed(2);

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`;
}

const SVG_PX_PER_MM = 3;

function layerSvg(
  layout: StoredLayout,
  frame: PlanFrame,
  vb: ViewBox,
  byKey: Map<string, NumberedPart>,
  levels: number[],
  index: number,
): string {
  const level = levels[index] ?? 0;
  const belowLevel = index > 0 ? levels[index - 1] : undefined;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}" width="${n(vb.w * SVG_PX_PER_MM)}" height="${n(vb.h * SVG_PX_PER_MM)}" font-family="system-ui, sans-serif">`,
    `<title>${escapeXml(`Layer ${index + 1} of ${levels.length}`)}</title>`,
    `<rect x="${n(vb.x)}" y="${n(vb.y)}" width="${n(vb.w)}" height="${n(vb.h)}" fill="#ffffff"/>`,
    `<rect x="${n(-frame.bc)}" y="${n(-frame.bc)}" width="${n(frame.innerW)}" height="${n(frame.innerD)}" fill="none" stroke="#333333" stroke-width="0.6"/>`,
  ];
  if (belowLevel !== undefined) {
    for (const t of traysAt(layout.trays, belowLevel)) {
      const r = toSvgRect(t, frame);
      out.push(
        `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="#eeeeee" stroke="#bbbbbb" stroke-width="0.3" stroke-dasharray="2 1.5"/>`,
      );
    }
  }
  for (const t of traysAt(layout.trays, level)) {
    const r = toSvgRect(t, frame);
    const part = byKey.get(t.key);
    const fs = labelFontSize(r);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const fill = t.part === "leftover" ? "#f0f0f0" : "#cfe3f7";
    out.push(
      `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="1.5" fill="${fill}" stroke="#1d4f80" stroke-width="0.5"/>`,
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(fs * 0.75)}" fill="#ffffff" stroke="#1d4f80" stroke-width="0.4"/>`,
      `<text x="${n(cx)}" y="${n(cy)}" font-size="${n(fs)}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#111111">${part ? part.number : "?"}</text>`,
    );
    if (part && r.w >= 30 && r.h >= 24) {
      const labelSize = Math.min(5, fs * 0.45);
      const maxChars = Math.floor(r.w / (labelSize * 0.6));
      out.push(
        `<text x="${n(cx)}" y="${n(cy + fs * 0.75 + labelSize * 1.2)}" font-size="${n(labelSize)}" text-anchor="middle" fill="#111111">${escapeXml(truncate(part.label, maxChars))}</text>`,
      );
    }
  }
  for (const s of spacersAt(layout.trays, level)) {
    const r = toSvgRect(s, frame);
    const part = byKey.get(s.key);
    out.push(
      `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="#f7e3c4" stroke="#8a5a00" stroke-width="0.4" stroke-dasharray="1.5 1"/>`,
      `<text x="${n(r.x + r.w / 2)}" y="${n(r.y + r.h / 2)}" font-size="4" text-anchor="middle" dominant-baseline="central" fill="#5a3a00">${part ? part.number : "?"}</text>`,
    );
  }
  out.push(
    `<text x="${n(frame.usableW / 2)}" y="${n(frame.usableD + frame.bc + 9)}" font-size="6" letter-spacing="0.6" text-anchor="middle" fill="#333333">FRONT</text>`,
    "</svg>",
  );
  return out.join("");
}

export function render(layout: StoredLayout, project: Project): string[] {
  const frame = planFrame(project.box, project.settings);
  const vb = planViewBox(frame);
  const byKey = partsByKey(numberParts(layout.trays));
  const levels = levelsOf(layout.trays);
  return levels.map((_level, i) => layerSvg(layout, frame, vb, byKey, levels, i));
}

export interface PartRow {
  number: number;
  label: string;
  size: string;
  layer: number;
  contents: string[];
  goesInto: number | null;
}

function layerNumber(levels: number[], level: number): number {
  return levels.indexOf(level) + 1;
}

export function whatGoesWhere(layout: StoredLayout): PartRow[] {
  const levels = levelsOf(layout.trays);
  return numberParts(layout.trays).map((p) => ({
    number: p.number,
    label: p.label,
    size: `${p.spec.w.toFixed(1)} × ${p.spec.d.toFixed(1)} × ${p.spec.h.toFixed(1)} mm`,
    layer: layerNumber(levels, p.spec.level),
    contents: p.spec.compartments.filter((c) => c.contents !== "").map((c) => c.contents),
    goesInto: p.parentNumber,
  }));
}

export function packingSteps(layout: StoredLayout): string[] {
  const parts = numberParts(layout.trays);
  const levels = levelsOf(layout.trays);
  const steps: string[] = [];
  levels.forEach((level, i) => {
    for (const p of parts) {
      if (p.spec.part === "spacer" || p.spec.level !== level) {
        continue;
      }
      steps.push(`Layer ${i + 1}: place #${p.number} ${p.label}${i > 0 ? " on top" : ""}.`);
      for (const s of parts) {
        if (s.spec.part === "spacer" && s.parentNumber === p.number) {
          steps.push(`Slide card spacer #${s.number} into tray #${p.number}.`);
        }
      }
    }
  });
  return steps;
}
```

```ts
// src/instructions/png.ts
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const VIEW_BOX = /viewBox="(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)"/;

export function pngSize(svg: string, widthPx: number): { width: number; height: number } {
  const m = VIEW_BOX.exec(svg);
  const w = Number(m?.[3] ?? "1");
  const h = Number(m?.[4] ?? "1");
  return { width: widthPx, height: Math.round((widthPx * h) / Math.max(w, 1e-9)) };
}

/** Draws the SVG on a white canvas and returns a PNG (spec §8.3 "PNG download per layer"). */
export async function svgToPng(svg: string, widthPx = 1600): Promise<Blob> {
  const { width, height } = pngSize(svg, widthPx);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Couldn't draw the layer picture."));
    img.src = svgDataUrl(svg);
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Drawing on a canvas isn't available in this browser.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("PNG export failed."));
      }
    }, "image/png");
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/instructions/render.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/instructions/render.ts src/instructions/png.ts src/instructions/render.test.ts
git commit -m "Add assembly diagrams, packing order and PNG helpers"
```

---

### Task 20: Printable assembly page

**Files:**

- Create: `src/instructions/AssemblyPage.tsx`
- Test: `src/instructions/AssemblyPage.test.tsx`

**Interfaces:**

- Consumes: `render`, `packingSteps`, `whatGoesWhere` (Task 19); `svgDataUrl`, `svgToPng` (Task 19); `downloadBlob`, `fileSlug` (Task 12); `Project`, `StoredLayout`.
- Produces:
  - `interface AssemblyPageProps { project: Project; layout: StoredLayout; onBack: () => void; print?: () => void; toPng?: (svg: string, widthPx: number) => Promise<Blob>; download?: (blob: Blob, filename: string) => void }`
  - `AssemblyPage(props)` — toolbar (Back, Print / save as PDF) marked `no-print`; packing order list; one figure per layer (`<img>` of the SVG with alt text) with a "Download PNG" button (`<project>-layer-<n>.png`); "What goes where" table.

The print styles live in `src/style.css` (Task 21): `.no-print` and the app chrome are hidden, layers don't split across pages.

- [ ] **Step 1: Write the failing test**

```tsx
// src/instructions/AssemblyPage.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { AssemblyPage } from "./AssemblyPage";

afterEach(cleanup);

const layout = makeLayout("h", [
  makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
  makeTray({ key: "b:p0:0", stack: 0, level: 1, z: 40 }),
]);

describe("AssemblyPage", () => {
  it("shows packing order, one picture per layer and the parts table", () => {
    const project = { ...fixtureProject(), name: "Wing span" };
    render(<AssemblyPage project={project} layout={layout} onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Wing span — assembly");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toContain(
      "Layer 1: place #1 Deck A ×40.",
    );
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]?.getAttribute("alt")).toMatch(/Layer 1 \(bottom\)/);
    expect(images[0]?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("prints and goes back", () => {
    const print = vi.fn();
    const onBack = vi.fn();
    render(
      <AssemblyPage project={fixtureProject()} layout={layout} onBack={onBack} print={print} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Print / save as PDF" }));
    expect(print).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to the editor" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("downloads a PNG per layer and reports failures", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const toPng = vi.fn(() => Promise.resolve(blob));
    const download = vi.fn();
    const project = { ...fixtureProject(), name: "Wing span" };
    const view = render(
      <AssemblyPage
        project={project}
        layout={layout}
        onBack={vi.fn()}
        toPng={toPng}
        download={download}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download PNG of layer 2" }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(blob, "Wing-span-layer-2.png"));
    view.unmount();
    render(
      <AssemblyPage
        project={project}
        layout={layout}
        onBack={vi.fn()}
        toPng={() => Promise.reject(new Error("canvas blocked"))}
        download={download}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download PNG of layer 1" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/canvas blocked/));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/instructions/AssemblyPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./AssemblyPage"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/instructions/AssemblyPage.tsx
import { useMemo, useState } from "preact/hooks";
import { downloadBlob, fileSlug } from "../app/download";
import type { Project, StoredLayout } from "../model/types";
import { svgDataUrl, svgToPng } from "./png";
import { packingSteps, render, whatGoesWhere } from "./render";

export interface AssemblyPageProps {
  project: Project;
  layout: StoredLayout;
  onBack: () => void;
  print?: () => void;
  toPng?: (svg: string, widthPx: number) => Promise<Blob>;
  download?: (blob: Blob, filename: string) => void;
}

const PNG_WIDTH_PX = 1600;

export function AssemblyPage(p: AssemblyPageProps) {
  const svgs = useMemo(() => render(p.layout, p.project), [p.layout, p.project]);
  const steps = useMemo(() => packingSteps(p.layout), [p.layout]);
  const rows = useMemo(() => whatGoesWhere(p.layout), [p.layout]);
  const [pngError, setPngError] = useState<string | null>(null);
  const slug = fileSlug(p.project.name);
  const { box } = p.project;

  async function savePng(svg: string, layer: number): Promise<void> {
    setPngError(null);
    try {
      const blob = await (p.toPng ?? svgToPng)(svg, PNG_WIDTH_PX);
      (p.download ?? downloadBlob)(blob, `${slug}-layer-${layer}.png`);
    } catch (e) {
      setPngError(`Couldn't make the PNG: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <article class="assembly" aria-labelledby="assembly-title">
      <div class="assembly-toolbar no-print">
        <button type="button" onClick={p.onBack}>
          Back to the editor
        </button>
        <button type="button" onClick={() => (p.print ?? (() => window.print()))()}>
          Print / save as PDF
        </button>
      </div>
      <h1 id="assembly-title">{`${p.project.name} — assembly`}</h1>
      <p class="hint">
        {`Box ${box.innerWidth} × ${box.innerDepth} × ${box.innerHeight} mm. Layers are drawn from above with the box front at the bottom; numbers match the exported files.`}
      </p>
      {pngError !== null ? (
        <p class="run-error no-print" role="alert">
          {pngError}
        </p>
      ) : null}
      <section aria-labelledby="packing-title">
        <h2 id="packing-title">Packing order (bottom first)</h2>
        <ol>
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>
      {svgs.map((svg, i) => {
        const layer = i + 1;
        const title = `Layer ${layer}${i === 0 ? " (bottom)" : ""}`;
        return (
          <section class="assembly-layer" key={i} aria-labelledby={`layer-title-${layer}`}>
            <h2 id={`layer-title-${layer}`}>{title}</h2>
            <img
              class="assembly-svg"
              src={svgDataUrl(svg)}
              alt={`${title}: numbered trays seen from above`}
            />
            <button
              type="button"
              class="no-print"
              onClick={() => {
                void savePng(svg, layer);
              }}
            >
              {`Download PNG of layer ${layer}`}
            </button>
          </section>
        );
      })}
      <section aria-labelledby="parts-title">
        <h2 id="parts-title">What goes where</h2>
        <table class="parts-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Part</th>
              <th scope="col">Size</th>
              <th scope="col">Layer</th>
              <th scope="col">Holds</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.number}>
                <td>{r.number}</td>
                <td>{r.label}</td>
                <td>{r.size}</td>
                <td>{r.layer}</td>
                <td>
                  {r.goesInto !== null
                    ? `Goes into tray #${r.goesInto}`
                    : r.contents.length > 0
                      ? r.contents.join(", ")
                      : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </article>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/instructions/AssemblyPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add src/instructions/AssemblyPage.tsx src/instructions/AssemblyPage.test.tsx
git commit -m "Add printable assembly page with PNG per layer"
```

---

### Task 21: App shell, entry point, page and styles

**Files:**

- Modify (replace contents): `src/app/App.tsx`, `src/app/App.test.tsx`, `src/main.tsx`, `src/style.css`, `index.html` (all created as placeholders by plan 1 Task 1)

**Interfaces:**

- Consumes: everything above — `AppStore`, `connectWindow`, `createAppStore` (Task 5); `createMeshSource`, `MeshSource` (Task 16); `loadLayoutClient`, `loadGeometryClient` (Task 2); `canOptimize` (Task 3); `CONFLICT_CODE` (Task 4); actions (Task 1); `copyLink`, `shareLink`, `CopyLinkResult`, `downloadBlob` (Task 12); `ValidationContext` (Task 6); `BoxForm`, `PrinterForm` (Task 7); `SettingsForm` (Task 8); `ComponentList` (Task 11); `ProjectMenu` (Task 12); `Summary` (Task 14); `PlanView` (Task 15); `ExportPanel` (Task 17); `Viewer`, `ViewerProps` (Task 18); `AssemblyPage` (Task 20); `encodeHash`, `exportJsonFile`, `jsonFileName`, `createProjectStore` (`share`); `APP_VERSION`, `isPreview` (`model/version`).
- Produces:
  - `interface AppProps { store: AppStore; meshes: MeshSource; clipboard?: (text: string) => Promise<void>; currentHref?: () => string; confirm?: (message: string) => boolean; download?: (blob: Blob, filename: string) => void; viewerProps?: Pick<ViewerProps, "webgl" | "loadScene"> }`; `App(props)`.
  - `src/main.tsx` wires real dependencies: `createProjectStore()`, `loadLayoutClient`, `history.replaceState`, `window.confirm`, `createMeshSource(loadGeometryClient)`, `store.start(location.hash)`, `connectWindow(store, window)`.

Page structure (spec §8.1): header (title, Simple ⇄ Advanced, preview banner, project menu, app notices with conflict actions); `main.workspace` with `.inputs` (Box → Printer → Components → Settings) and `.results` (Summary, Plan view, 3D view, Export + "Open the assembly page"); footer (version, third-party licenses link, all apps). Two columns above 960 px, one below; 16 px side gutter; nothing wider than the viewport.

- [ ] **Step 1: Write the failing test (replace plan 1's placeholder test)**

```tsx
// src/app/App.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import { createProjectStore, encodeHash } from "../share";
import { MemoryStorage } from "../test-support/memory-storage";
import { App } from "./App";
import type { MeshSource } from "./meshes";
import { createAppStore } from "./store";
import {
  EMPTY_FOREIGN,
  cubeMesh,
  fixtureProject,
  makeLayout,
  makeTray,
  stubLayoutClient,
} from "./test-helpers";

afterEach(cleanup);

function setup(hash = "") {
  const stub = stubLayoutClient();
  const store = createAppStore({
    projectStore: createProjectStore(new MemoryStorage()),
    loadLayoutClient: () => Promise.resolve(stub.client),
    replaceHash: vi.fn(),
    confirm: () => true,
  });
  store.start(hash);
  const meshes: MeshSource = {
    get: vi.fn(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 })),
    reset: vi.fn(),
    dispose: vi.fn(),
  };
  const clipboard = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
  render(
    <App
      store={store}
      meshes={meshes}
      clipboard={clipboard}
      currentHref={() => "https://example.test/insert-generator/"}
      confirm={() => true}
      download={vi.fn()}
      viewerProps={{ webgl: () => false }}
    />,
  );
  return { store, stub, clipboard };
}

function withLayoutHash(): string {
  const p = fixtureProject();
  const trays = [
    makeTray({ key: "a:p0:0", path: "0", stack: 0, x: 0, y: 0 }),
    makeTray({ key: "b:p0:0", path: "1", stack: 1, x: 110, y: 0 }),
  ];
  return encodeHash({ ...p, layout: makeLayout(inputsHash(p), trays) }, EMPTY_FOREIGN);
}

describe("App", () => {
  it("lays out inputs then results with the preview banner and footer", () => {
    setup();
    const inputs = screen.getByRole("region", { name: "Inputs" });
    expect(
      within(inputs)
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(["Box", "Printer", "Components", "Settings"]);
    const results = screen.getByRole("region", { name: "Results" });
    expect(within(results).getByRole("heading", { name: "Summary" })).toBeTruthy();
    expect(screen.getByText(/shared links may break/)).toBeTruthy();
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain("v0.1.0");
    expect(
      within(footer).getByRole("link", { name: "Third-party licenses" }).getAttribute("href"),
    ).toBe("./third-party-licenses.txt");
  });

  it("switches to advanced inputs", () => {
    setup();
    expect(screen.queryByLabelText(/Bed margin/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Advanced"));
    expect(screen.getByLabelText(/Bed margin/)).toBeTruthy();
  });

  it("adds a component and starts an optimizer run after the pause", async () => {
    const { stub } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add cards" }));
    expect(screen.getByRole("heading", { name: "Cards: Cards" })).toBeTruthy();
    await waitFor(() => expect(stub.calls).toHaveLength(1));
  });

  it("shows plan, 3D fallback and export for a stored layout and swaps with the keyboard", () => {
    const { store, stub } = setup(withLayoutHash());
    expect(stub.calls).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Plan view" })).toBeTruthy();
    expect(screen.getByText(/needs WebGL/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "3MF per part (.zip)" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1:/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 2:/ }), { key: "Enter" });
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "a:p0:0", path: "1", rotated: false },
      { kind: "position", trayKey: "b:p0:0", path: "0", rotated: false },
    ]);
  });

  it("locks and unlocks a tray's size from the tray details", () => {
    const { store } = setup(withLayoutHash());
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1:/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Lock size" }));
    expect(store.state.project.value.locks).toEqual([
      { kind: "size", trayKey: "a:p0:0", w: 100, d: 80, h: 40 },
    ]);
    expect(screen.getByRole("button", { name: /^Tray 1: .*, size locked$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unlock size" }));
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("opens the assembly page and comes back", () => {
    setup(withLayoutHash());
    fireEvent.click(screen.getByRole("button", { name: "Open the assembly page" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/— assembly$/);
    fireEvent.click(screen.getByRole("button", { name: "Back to the editor" }));
    expect(screen.getByRole("heading", { name: "Plan view" })).toBeTruthy();
  });

  it("copies a share link built from the current page", async () => {
    const { clipboard } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(clipboard).toHaveBeenCalled());
    expect(clipboard.mock.calls[0]?.[0]).toMatch(
      /^https:\/\/example\.test\/insert-generator\/#1\./,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/app/App.test.tsx`
Expected: FAIL — the placeholder `App` has no "Inputs" region (`Unable to find role="region" and name "Inputs"`).

- [ ] **Step 3: Write the shell**

```tsx
// src/app/App.tsx
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { AssemblyPage } from "../instructions/AssemblyPage";
import { APP_VERSION, isPreview } from "../model/version";
import { PlanView } from "../plan/PlanView";
import { encodeHash, exportJsonFile, jsonFileName } from "../share";
import { BoxForm } from "../ui/BoxForm";
import { ComponentList } from "../ui/components/ComponentList";
import { ExportPanel } from "../ui/ExportPanel";
import { Notices } from "../ui/Notices";
import { PrinterForm } from "../ui/PrinterForm";
import { ProjectMenu } from "../ui/ProjectMenu";
import { SettingsForm } from "../ui/SettingsForm";
import { Summary } from "../ui/Summary";
import { ValidationContext } from "../ui/validation";
import { Viewer } from "../viewer/Viewer";
import type { ViewerProps } from "../viewer/Viewer";
import {
  addComponent,
  lockedKeys,
  removeComponent,
  renameProject,
  setSettings,
  swapTrays,
  sizeLockedKeys,
  toggleLock,
  toggleSizeLock,
  updateBox,
  updateComponent,
  updatePrinter,
} from "./actions";
import { downloadBlob } from "./download";
import { copyLink, shareLink } from "./link";
import type { CopyLinkResult } from "./link";
import type { MeshSource } from "./meshes";
import { CONFLICT_CODE } from "./persistence";
import { canOptimize } from "./runner";
import type { AppStore } from "./store";

export interface AppProps {
  store: AppStore;
  meshes: MeshSource;
  clipboard?: (text: string) => Promise<void>;
  currentHref?: () => string;
  confirm?: (message: string) => boolean;
  download?: (blob: Blob, filename: string) => void;
  viewerProps?: Pick<ViewerProps, "webgl" | "loadScene">;
}

function Panel({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ComponentChildren;
}) {
  return (
    <section class="panel" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{title}</h2>
      {children}
    </section>
  );
}

export function App(props: AppProps) {
  const { store, meshes } = props;
  const s = store.state;
  const [view, setView] = useState<"editor" | "assembly">("editor");
  const project = s.project.value;
  const layout = project.layout;
  const advanced = s.mode.value === "advanced";
  const run = s.run.value;
  const locked = lockedKeys(project);
  const sizeLocked = sizeLockedKeys(project);
  const toggleSize = (key: string): void => {
    const tray = layout?.trays.find((t) => t.key === key);
    if (tray) {
      store.edit((q) => toggleSizeLock(q, tray));
    }
  };
  const confirm = props.confirm ?? ((message: string) => window.confirm(message));
  const download = props.download ?? downloadBlob;
  const last = s.lastResult.value;
  const shortfall =
    last && last.layout === null && last.bestAttempt ? last.bestAttempt.shortfall : null;

  function onCopyLink(): Promise<CopyLinkResult> {
    const href = (props.currentHref ?? (() => window.location.href))();
    const link = shareLink(href, encodeHash(project, s.foreign.value));
    const write = props.clipboard ?? ((text: string) => navigator.clipboard.writeText(text));
    return copyLink(link, write);
  }

  if (view === "assembly" && layout) {
    return (
      <main>
        <AssemblyPage project={project} layout={layout} onBack={() => setView("editor")} />
      </main>
    );
  }

  return (
    <ValidationContext.Provider value={s.validation.value}>
      <header class="app-header">
        <div class="app-title">
          <h1>Board Game Insert Generator</h1>
          <fieldset class="mode-toggle">
            <legend>Input mode</legend>
            <label>
              <input
                type="radio"
                name="input-mode"
                checked={!advanced}
                onChange={() => {
                  s.mode.value = "simple";
                }}
              />
              Simple
            </label>
            <label>
              <input
                type="radio"
                name="input-mode"
                checked={advanced}
                onChange={() => {
                  s.mode.value = "advanced";
                }}
              />
              Advanced
            </label>
          </fieldset>
        </div>
        {isPreview(APP_VERSION) ? (
          <p class="preview-banner" role="note">
            Preview: saved projects and shared links may break between versions.
          </p>
        ) : null}
        <ProjectMenu
          name={project.name}
          currentId={project.id}
          projects={s.projects.value}
          storageAvailable={store.storageAvailable}
          onRename={(name) => store.edit((q) => renameProject(q, name))}
          onOpen={(id) => store.openProject(id)}
          onNew={() => store.newProject()}
          onDelete={(id) => store.deleteProject(id)}
          onImport={(text) => {
            store.importJson(text);
          }}
          onExportJson={() =>
            download(exportJsonFile(project, s.foreign.value), jsonFileName(project))
          }
          onCopyLink={onCopyLink}
        />
        <Notices
          notices={s.appNotices.value}
          label="App messages"
          onDismiss={(code) => store.dismissNotice(code)}
          renderAction={(n) =>
            n.code === CONFLICT_CODE ? (
              <>
                <button type="button" onClick={() => store.resolveConflict("keepMine")}>
                  Keep my version
                </button>
                <button type="button" onClick={() => store.resolveConflict("loadTheirs")}>
                  Load the other tab's version
                </button>
              </>
            ) : null
          }
        />
      </header>
      <main class="workspace">
        <section class="inputs" aria-label="Inputs">
          <Panel id="box" title="Box">
            <BoxForm
              box={project.box}
              onChange={(patch) => store.edit((q) => updateBox(q, patch))}
            />
          </Panel>
          <Panel id="printer" title="Printer">
            <PrinterForm
              printer={project.printer}
              advanced={advanced}
              onChange={(patch) => store.edit((q) => updatePrinter(q, patch))}
            />
          </Panel>
          <Panel id="components" title="Components">
            <ComponentList
              components={project.components}
              advanced={advanced}
              onAdd={(kind) => store.edit((q) => addComponent(q, kind))}
              onChange={(id, next) => store.edit((q) => updateComponent(q, id, next))}
              onRemove={(id) => {
                const c = project.components.find((x) => x.id === id);
                if (confirm(`Remove “${c ? c.name : "this component"}”?`)) {
                  store.edit((q) => removeComponent(q, id));
                }
              }}
            />
          </Panel>
          <Panel id="settings" title="Settings">
            <SettingsForm
              settings={project.settings}
              advanced={advanced}
              onChange={(next) => store.edit((q) => setSettings(q, next))}
            />
          </Panel>
        </section>
        <section class="results" aria-label="Results">
          <Summary
            summary={s.summary.value}
            run={run}
            notices={s.layoutNotices.value}
            hasLayout={layout !== undefined}
            canUndo={s.undoSlot.value !== null}
            canOptimize={canOptimize(project)}
            shortfall={shortfall}
            onReoptimize={() => store.reoptimize()}
            onImprove={() => store.improveMore()}
            onUndo={() => store.undo()}
            onCancel={() => store.cancelRun()}
            onRetry={() => store.retry()}
          />
          {layout ? (
            <>
              <Panel id="plan" title="Plan view">
                <PlanView
                  trays={layout.trays}
                  box={project.box}
                  settings={project.settings}
                  lockedKeys={locked}
                  selectedKey={s.selection.value}
                  onSelect={(key) => {
                    s.selection.value = key;
                  }}
                  onSwap={(a, b) => store.edit((q) => swapTrays(q, a, b))}
                  sizeLockedKeys={sizeLocked}
                  onToggleSizeLock={toggleSize}
                  onToggleLock={(key) => {
                    const tray = layout.trays.find((t) => t.key === key);
                    if (tray) {
                      store.edit((q) => toggleLock(q, tray));
                    }
                  }}
                />
              </Panel>
              <Panel id="viewer" title="3D view">
                <Viewer
                  trays={layout.trays}
                  box={project.box}
                  settings={project.settings}
                  meshes={meshes}
                  selectedKey={s.selection.value}
                  lockedKeys={locked}
                  sizeLockedKeys={sizeLocked}
                  onToggleSizeLock={toggleSize}
                  onSelect={(key) => {
                    s.selection.value = key;
                  }}
                  {...props.viewerProps}
                />
              </Panel>
              <Panel id="export" title="Export">
                <ExportPanel
                  trays={layout.trays}
                  printer={project.printer}
                  settings={project.settings}
                  meshes={meshes}
                  projectName={project.name}
                  disabled={run.status === "running"}
                  download={download}
                />
                <p>
                  <button type="button" onClick={() => setView("assembly")}>
                    Open the assembly page
                  </button>
                </p>
              </Panel>
            </>
          ) : null}
        </section>
      </main>
      <footer class="app-footer">
        {`Insert Generator v${APP_VERSION} · `}
        <a href="./third-party-licenses.txt">Third-party licenses</a>
        {" · "}
        <a href="../">All apps</a>
      </footer>
    </ValidationContext.Provider>
  );
}
```

- [ ] **Step 4: Write the entry point, the page and the styles**

```tsx
// src/main.tsx
import { render } from "preact";
import { App } from "./app/App";
import { loadGeometryClient, loadLayoutClient } from "./app/clients";
import { createMeshSource } from "./app/meshes";
import { connectWindow, createAppStore } from "./app/store";
import { createProjectStore } from "./share";
import "./style.css";

const store = createAppStore({
  projectStore: createProjectStore(),
  loadLayoutClient,
  replaceHash: (hash) => {
    history.replaceState(null, "", hash);
  },
  confirm: (message) => window.confirm(message),
});
const meshes = createMeshSource(loadGeometryClient);
store.start(window.location.hash);
connectWindow(store, window);

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app element");
}
render(<App store={store} meshes={meshes} />, root);
```

`index.html` (complete file):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      name="description"
      content="Measure a board game box and its components; get a 3D-printable insert of stacking trays."
    />
    <title>Board Game Insert Generator</title>
  </head>
  <body>
    <div id="app"></div>
    <noscript>This app needs JavaScript.</noscript>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```css
/* src/style.css */
:root {
  color-scheme: light dark;
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    sans-serif;

  --gutter: 16px;
  --radius: 8px;
  --border: color-mix(in srgb, CanvasText 18%, transparent);
  --muted: color-mix(in srgb, CanvasText 65%, Canvas);
  --surface: color-mix(in srgb, Canvas 95%, CanvasText);
  --focus: #f59e0b;
  --warn-bg: color-mix(in srgb, #f59e0b 18%, Canvas);
  --error-bg: color-mix(in srgb, #dc2626 15%, Canvas);
  --info-bg: color-mix(in srgb, #2563eb 12%, Canvas);
  --error-text: color-mix(in srgb, #dc2626 80%, CanvasText);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: Canvas;
  color: CanvasText;
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

a {
  color: LinkText;
}

button,
input,
select {
  font: inherit;
}

button {
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: CanvasText;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}

input[type="text"],
select {
  width: 100%;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: Field;
  color: FieldText;
}

input[aria-invalid="true"] {
  border-color: var(--error-text);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.app-header {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem var(--gutter) 0;
}

.app-title {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  align-items: center;
  justify-content: space-between;
}

.app-title h1 {
  margin: 0;
  font-size: 1.5rem;
}

.mode-toggle {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  margin: 0;
  padding: 0;
  border: 0;
}

.mode-toggle legend {
  float: left;
  margin-right: 0.5rem;
  font-weight: 600;
}

.preview-banner {
  margin: 0.75rem 0;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  background: var(--warn-bg);
}

.project-menu {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: 0.5rem 1rem;
  align-items: end;
  margin: 0.75rem 0;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 1.5rem;
  align-items: start;
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem var(--gutter) 2rem;
}

@media (width <= 960px) {
  .workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}

.inputs,
.results {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.panel {
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: Canvas;
}

.panel h2 {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr));
  gap: 0.75rem 1rem;
}

.field {
  display: grid;
  gap: 0.2rem;
  align-content: start;
}

.field label {
  font-size: 0.95rem;
  font-weight: 600;
}

.unit {
  font-weight: 400;
  color: var(--muted);
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}

.field-error {
  margin: 0;
  font-size: 0.85rem;
  color: var(--error-text);
}

.check-field {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.5rem;
  align-items: center;
}

.check-field .hint {
  grid-column: 2;
}

.list-rows {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.list-rows legend {
  padding: 0 0.25rem;
  font-weight: 600;
}

.list-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr));
  gap: 0.5rem;
  align-items: end;
  padding-bottom: 0.75rem;
  border-bottom: 1px dashed var(--border);
}

.list-row:last-of-type {
  padding-bottom: 0;
  border-bottom: 0;
}

.row-remove {
  justify-self: start;
}

.more-options {
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.more-options summary {
  font-weight: 600;
  cursor: pointer;
}

.more-options > .form-grid {
  margin-top: 0.75rem;
}

.component-list {
  display: grid;
  gap: 1rem;
}

.component-card {
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.component-card-header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.component-card-header h3 {
  margin: 0;
  font-size: 1rem;
}

.add-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.notices {
  display: grid;
  gap: 0.4rem;
  margin: 0.5rem 0;
  padding: 0;
  list-style: none;
}

.notice {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  align-items: baseline;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: var(--info-bg);
}

.notice-warning {
  background: var(--warn-bg);
}

.notice-error {
  background: var(--error-bg);
}

.notice-level {
  font-weight: 700;
}

.notice-text {
  flex: 1 1 16rem;
}

.notice-action {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.notice-dismiss {
  padding: 0 0.5rem;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
  gap: 0.5rem 1rem;
  margin: 0 0 0.75rem;
}

.summary-grid dt {
  font-size: 0.85rem;
  color: var(--muted);
}

.summary-grid dd {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
}

.play-warn {
  color: color-mix(in srgb, #d97706 85%, CanvasText);
}

.run-status {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin: 0 0 0.75rem;
}

.run-status progress {
  flex: 1 1 10rem;
}

.run-error {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: var(--error-bg);
}

.run-error p {
  margin: 0 0 0.5rem;
}

.shortfall {
  font-weight: 600;
}

.plan-toolbar {
  margin-top: 0.75rem;
}

.tray-details {
  margin-top: 0.75rem;
}

.tray-details h3 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.tray-details dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 0.25rem 1rem;
  margin: 0;
}

.tray-details dt {
  font-size: 0.85rem;
  color: var(--muted);
}

.tray-details dd {
  margin: 0;
}

.tray-contents {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
}

.viewer-canvas {
  display: block;
  width: 100%;
  height: min(60vh, 480px);
  border-radius: var(--radius);
  background: var(--surface);
  touch-action: none;
}

.viewer-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
  align-items: end;
  margin-top: 0.75rem;
}

.range-field {
  display: grid;
  gap: 0.2rem;
  font-weight: 600;
}

.viewer-fallback {
  margin: 0;
  padding: 1rem;
  border-radius: var(--radius);
  background: var(--surface);
}

.export-skipped h3 {
  margin: 0.75rem 0 0.25rem;
  font-size: 1rem;
}

.export-skipped ul {
  margin: 0;
  padding-left: 1.25rem;
}

.link-status {
  margin: 0.5rem 0 0;
}

/* Full-width grid children; after the base rules (no-descending-specificity). */
.form-grid > fieldset,
.form-grid > details,
.form-grid > .check-field,
.form-grid > .field-error {
  grid-column: 1 / -1;
}

.project-menu > .button-row,
.project-menu > .link-status {
  grid-column: 1 / -1;
}

.link-warning {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: var(--warn-bg);
}

.copy-fallback {
  margin-top: 0.5rem;
  font-family: ui-monospace, monospace;
}

.assembly {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem var(--gutter) 2rem;
}

.assembly-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.assembly-layer {
  margin: 1.5rem 0;
}

.assembly-svg {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--border);
  background: #fff;
}

.parts-table {
  width: 100%;
  border-collapse: collapse;
}

.parts-table th,
.parts-table td {
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.app-footer {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem var(--gutter) 2rem;
  font-size: 0.875rem;
  color: var(--muted);
  text-align: center;
}

@media print {
  .no-print,
  .app-header,
  .app-footer {
    display: none;
  }

  body {
    background: #fff;
    color: #000;
  }

  .assembly {
    max-width: none;
    padding: 0;
  }

  .assembly-layer {
    break-inside: avoid;
  }
}
```

- [ ] **Step 5: Run the tests and the repo checks**

Run: `cd apps/insert-generator && npx vitest run src/app/App.test.tsx && npx tsc --noEmit`
Expected: PASS (7 tests); no type errors.

Run (repo root): `npx stylelint "apps/insert-generator/**/*.css" && npx html-validate apps/insert-generator/index.html`
Expected: no output (both clean).

- [ ] **Step 6: Manual check (layout, responsiveness, focus, 3D)**

1. `cd apps/insert-generator && npm run dev`, open the printed URL.
2. Desktop width: inputs on the left (Box, Printer, Components, Settings), Summary on the right. Click "Add cards": after about half a second the summary shows "Optimizing…", then numbers, a plan, a 3D view and the export panel.
3. Press Tab repeatedly from the top: every control, including each tray in the plan, shows an orange focus ring.
4. In the 3D view: drag to orbit, move the Explode slider (upper trays lift), pick "Bottom layer only", click a tray: its details appear under the canvas.
5. DevTools device toolbar at 360 px wide: panels stack in one column, there is a 16 px gap at both sides and no horizontal scrollbar (`document.documentElement.scrollWidth === innerWidth` in the console prints `true`).
6. Do the touch-drag check from Task 15 Step 5.
7. Chrome DevTools → Rendering → emulate `prefers-color-scheme: dark`: text stays readable, notices keep their tinted backgrounds.

- [ ] **Step 7: Commit**

```bash
cd apps/insert-generator
git add src/app/App.tsx src/app/App.test.tsx src/main.tsx src/style.css index.html
git commit -m "Wire the app shell, entry point and styles"
```

---

### Task 22: Third-party licenses file in dist

**Files:**

- Create: `src/licenses/renderLicenses.ts`
- Create: `licenses.config.ts`
- Create: `licenses/clipper2-LICENSE.txt`
- Modify: `vite.config.ts` (add one import and one plugin)
- Modify: `tsconfig.node.json` (add `licenses.config.ts` to `include`; plan 1 created it with Node types)
- Test: `src/licenses/renderLicenses.test.ts`

**Interfaces:**

- Consumes: `rollup-plugin-license` (`license({ thirdParty: { includePrivate, output: { file, template } } })`; `template` receives the bundled dependencies with `name`, `version`, `license`, `licenseText`, `noticeText`).
- Produces:
  - `interface DependencyInfo { name?: string | null; version?: string | null; license?: string | null; licenseText?: string | null; noticeText?: string | null }`; `interface LicenseEntry { name: string; version: string; license: string; text: string }`
  - `REQUIRED_PACKAGES = ["manifold-3d", "Clipper2", "three", "preact", "@preact/signals", "fflate"]`
  - `toEntries(deps: readonly DependencyInfo[]): LicenseEntry[]`; `renderLicenses(entries: readonly LicenseEntry[], appName: string): string`; `missingPackages(text: string, required: readonly string[]): string[]`
  - `LICENSES_FILE = "third-party-licenses.txt"`; `licensePlugin(): Plugin` (build only) writing `dist/third-party-licenses.txt`, linked from the footer (Task 21). manifold-3d (Apache-2.0 + NOTICE) and Clipper2 (BSL-1.0) are added by hand because they live only in the geometry worker bundle, which the main-bundle plugin never sees. The build fails if any required package is missing.

- [ ] **Step 1: Write the failing test**

```ts
// src/licenses/renderLicenses.test.ts
import { describe, expect, it } from "vitest";
import { REQUIRED_PACKAGES, missingPackages, renderLicenses, toEntries } from "./renderLicenses";

describe("licenses file", () => {
  it("turns bundled dependencies into entries with license and notice text", () => {
    expect(
      toEntries([
        {
          name: "preact",
          version: "10.29.8",
          license: "MIT",
          licenseText: "MIT text",
          noticeText: null,
        },
        { name: null, version: "1", license: "MIT", licenseText: "x" },
        { name: "odd", version: null, license: null, licenseText: null, noticeText: "NOTICE only" },
      ]),
    ).toEqual([
      { name: "preact", version: "10.29.8", license: "MIT", text: "MIT text" },
      { name: "odd", version: "", license: "UNKNOWN", text: "NOTICE only" },
    ]);
  });

  it("renders sorted, de-duplicated sections under a header", () => {
    const text = renderLicenses(
      [
        { name: "three", version: "0.186.1", license: "MIT", text: "three text" },
        { name: "fflate", version: "0.8.3", license: "MIT", text: "fflate text" },
        { name: "three", version: "0.186.1", license: "MIT", text: "three text" },
      ],
      "Board Game Insert Generator",
    );
    expect(text.startsWith("Third-party software in Board Game Insert Generator")).toBe(true);
    expect(text.indexOf("fflate 0.8.3 — MIT")).toBeLessThan(text.indexOf("three 0.186.1 — MIT"));
    expect(text.split("three 0.186.1 — MIT")).toHaveLength(2);
  });

  it("finds missing required packages", () => {
    expect(missingPackages("manifold-3d three preact", REQUIRED_PACKAGES)).toEqual([
      "Clipper2",
      "@preact/signals",
      "fflate",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/insert-generator && npx vitest run src/licenses/renderLicenses.test.ts`
Expected: FAIL — `Failed to resolve import "./renderLicenses"`.

- [ ] **Step 3: Write the renderer**

```ts
// src/licenses/renderLicenses.ts
// Pure text builder for dist/third-party-licenses.txt (used by licenses.config.ts at build time).

export interface DependencyInfo {
  name?: string | null;
  version?: string | null;
  license?: string | null;
  licenseText?: string | null;
  noticeText?: string | null;
}

export interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  text: string;
}

export const REQUIRED_PACKAGES = [
  "manifold-3d",
  "Clipper2",
  "three",
  "preact",
  "@preact/signals",
  "fflate",
];

const RULE = "=".repeat(72);

export function toEntries(deps: readonly DependencyInfo[]): LicenseEntry[] {
  const entries: LicenseEntry[] = [];
  for (const d of deps) {
    if (!d.name) {
      continue;
    }
    const parts = [d.licenseText, d.noticeText].filter(
      (t): t is string => typeof t === "string" && t.trim() !== "",
    );
    entries.push({
      name: d.name,
      version: d.version ?? "",
      license: d.license ?? "UNKNOWN",
      text: parts.length > 0 ? parts.join("\n\n") : "(The package ships no license text.)",
    });
  }
  return entries;
}

export function renderLicenses(entries: readonly LicenseEntry[], appName: string): string {
  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    const key = `${e.name}@${e.version}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.name.localeCompare(b.name));
  const sections = unique.map((e) => {
    const title = `${e.name}${e.version === "" ? "" : ` ${e.version}`} — ${e.license}`;
    return `${RULE}\n${title}\n${RULE}\n\n${e.text.trim()}\n`;
  });
  return `Third-party software in ${appName}\n\nThis app bundles the following open-source software. Their licenses follow.\n\n${sections.join("\n")}`;
}

export function missingPackages(text: string, required: readonly string[]): string[] {
  return required.filter((name) => !text.includes(name));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run src/licenses/renderLicenses.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the Clipper2 license, the plugin and wire it into Vite**

`licenses/clipper2-LICENSE.txt` (complete file; Clipper2 is compiled into manifold-3d's WASM):

```text
Clipper2 polygon clipping library (https://github.com/AngusJohnson/Clipper2)
Copyright (c) 2010-2024 Angus Johnson
Embedded in manifold-3d's WebAssembly module.

Boost Software License - Version 1.0 - August 17th, 2003

Permission is hereby granted, free of charge, to any person or organization
obtaining a copy of the software and accompanying documentation covered by
this license (the "Software") to use, reproduce, display, distribute,
execute, and transmit the Software, and to prepare derivative works of the
Software, and to permit third-parties to whom the Software is furnished to
do so, all subject to the following:

The copyright notices in the Software and this entire statement, including
the above license grant, this restriction and the following disclaimer,
must be included in all copies of the Software, in whole or in part, and
all derivative works of the Software, unless such copies or derivative
works are solely in the form of machine-executable object code generated by
a source language processor.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. IN NO EVENT
SHALL THE COPYRIGHT HOLDERS OR ANYONE DISTRIBUTING THE SOFTWARE BE LIABLE
FOR ANY DAMAGES OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
```

`licenses.config.ts` runs in Node (it reads files with `node:fs`), so it belongs to plan 1's `tsconfig.node.json`, which has `@types/node`; the app's `tsconfig.json` (`src/`) stays without Node types. Check the license file name first:

```bash
cd apps/insert-generator
ls node_modules/manifold-3d
```

Expected: the listing shows `LICENSE` (and `NOTICE` if the package ships one). If the license file has another name (e.g. `LICENSE.txt`), use that name in `manifoldEntry()` below.

`licenses.config.ts` (complete file, next to `vite.config.ts`):

```ts
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import license from "rollup-plugin-license";
import type { Plugin } from "vite";
import {
  REQUIRED_PACKAGES,
  missingPackages,
  renderLicenses,
  toEntries,
} from "./src/licenses/renderLicenses";
import type { DependencyInfo, LicenseEntry } from "./src/licenses/renderLicenses";

export const LICENSES_FILE = "third-party-licenses.txt";

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** manifold-3d is only in the geometry worker bundle, which the main-build plugin never sees. */
function manifoldEntry(): LicenseEntry {
  const dir = here("./node_modules/manifold-3d/");
  const pkg = JSON.parse(readIfExists(`${dir}package.json`) || "{}") as {
    version?: string;
    license?: string;
  };
  const text = [readIfExists(`${dir}LICENSE`), readIfExists(`${dir}NOTICE`)]
    .filter((t) => t.trim() !== "")
    .join("\n\n");
  if (text === "") {
    throw new Error("manifold-3d license text not found in node_modules/manifold-3d");
  }
  return {
    name: "manifold-3d",
    version: pkg.version ?? "",
    license: pkg.license ?? "Apache-2.0",
    text,
  };
}

function clipperEntry(): LicenseEntry {
  return {
    name: "Clipper2 (inside manifold-3d's WASM)",
    version: "",
    license: "BSL-1.0",
    text: readFileSync(here("./licenses/clipper2-LICENSE.txt"), "utf8"),
  };
}

export function licensePlugin(): Plugin {
  // rollup-plugin-license is typed against its own rollup version; the hooks it uses are
  // the same in Vite's rollup, so the plugin object is passed through as a Vite plugin.
  const plugin = license({
    thirdParty: {
      includePrivate: false,
      output: {
        file: here(`./dist/${LICENSES_FILE}`),
        template: (dependencies: DependencyInfo[]) => {
          const entries = [
            ...toEntries(dependencies).filter((e) => e.name !== "manifold-3d"),
            manifoldEntry(),
            clipperEntry(),
          ];
          const text = renderLicenses(entries, "Board Game Insert Generator");
          const missing = missingPackages(text, REQUIRED_PACKAGES);
          if (missing.length > 0) {
            throw new Error(`Third-party licenses file is missing: ${missing.join(", ")}`);
          }
          return text;
        },
      },
    },
  }) as unknown as Plugin;
  return { ...plugin, apply: "build" };
}
```

Edit `tsconfig.node.json` (plan 1): add `licenses.config.ts` to `include`. The whole file afterwards:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "licenses.config.ts"]
}
```

Edit `vite.config.ts` (plans 1, 3 and Task 15): import `licensePlugin` below the existing imports and add it to `plugins`; change nothing else. The whole file afterwards:

```ts
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import pkg from "./package.json";
import { licensePlugin } from "./licenses.config";

// `base: "./"` keeps every asset URL relative, so the built app works from any
// subpath (e.g. /<repo>/insert-generator/).
export default defineConfig({
  base: "./",
  plugins: [preact(), licensePlugin()],
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
    // Vitest stubs CSS imports to ""; PlanView.test.tsx reads plan.css as `?raw` to check
    // `touch-action: none`, so that file is passed through.
    css: { include: [/plan\.css/] },
  },
});
```

- [ ] **Step 6: Build and check the file**

Run: `cd apps/insert-generator && npm run typecheck && npx vite build && grep -E "^(manifold-3d|Clipper2|three|preact|@preact/signals|fflate)" dist/third-party-licenses.txt`
Expected: both `tsc` runs print nothing (`licenses.config.ts` is checked by `tsconfig.node.json`); the build succeeds; grep prints one title line per required package (e.g. `fflate 0.8.3 — MIT`, `manifold-3d 3.5.4 — Apache-2.0`, `Clipper2 (inside manifold-3d's WASM) — BSL-1.0`).

- [ ] **Step 7: Commit**

```bash
cd apps/insert-generator
git add src/licenses licenses.config.ts licenses/clipper2-LICENSE.txt vite.config.ts tsconfig.node.json
git commit -m "Ship a third-party licenses file with the build"
```

---

### Task 23: Build smoke test of dist served from a subpath

**Files:**

- Create: `scripts/smoke-dist.mjs`
- Create: `scripts/smoke-dist.test.mjs`
- Create: `src/app/bulkBuild.smoke.test.ts`
- Modify: `package.json` (`build` script)
- Modify: `vite.config.ts` (`test.include`)

**Interfaces:**

- Consumes: the built `dist/` (Tasks 21–22), Node 22 built-ins only (`node:http`, `node:fs/promises`, `node:path`, `node:process`), global `fetch`.
- Produces: `node scripts/smoke-dist.mjs [distDir]` — exits 0 and prints `smoke-dist: OK …`, or exits 1 listing every problem. Checks (spec §11 "Build"):
  1. `index.html` exists; every `src`/`href` in it is relative (no leading `/`, `//` or scheme) and loads with HTTP 200 when the page is served from `/static-web-apps/insert-generator/`.
  2. At least one `.wasm` and at least two worker scripts (`*worker*.js`: layout + geometry) exist in `dist/`, each is referenced by name from some `.js` file, and each loads with 200 (`.wasm` with `content-type: application/wasm`).
  3. No `.html`, `.js` or `.css` file references an absolute `/assets/…` path.
  4. `third-party-licenses.txt` exists and names manifold-3d, Clipper2, three, preact, @preact/signals and fflate.
- Limits (stated in the script header and README): no browser runs the page, so the check proves files exist and are referenced relatively, not that the worker or WASM execute; Task 25's manual run covers that.

- [ ] **Step 1: Write the failing test**

```js
// scripts/smoke-dist.test.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./smoke-dist.mjs", import.meta.url));
const created = [];

function makeDist(files) {
  const dir = mkdtempSync(join(tmpdir(), "smoke-dist-"));
  created.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

function run(dir) {
  return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
}

function goodFiles() {
  return {
    "index.html":
      '<!doctype html><html><head><script type="module" crossorigin src="./assets/index-abc.js"></script><link rel="stylesheet" crossorigin href="./assets/index-abc.css"></head><body><div id="app"></div></body></html>',
    "assets/index-abc.js":
      'new Worker(new URL("worker-l1.js", import.meta.url), { type: "module" }); import("./client-x.js");',
    "assets/client-x.js":
      'new Worker(new URL("worker-g2.js", import.meta.url), { type: "module" });',
    "assets/worker-l1.js": "self.onmessage = () => {};",
    "assets/worker-g2.js": 'fetch(new URL("manifold-m3.wasm", import.meta.url));',
    "assets/manifold-m3.wasm": "\u0000asm",
    "assets/index-abc.css": "body { margin: 0; }",
    "third-party-licenses.txt": "manifold-3d Clipper2 three preact @preact/signals fflate",
  };
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("smoke-dist", () => {
  it("passes a dist with relative assets, workers, wasm and licenses", () => {
    const result = run(makeDist(goodFiles()));
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/smoke-dist: OK/);
  });

  it("fails on an absolute asset path in index.html", () => {
    const files = goodFiles();
    files["index.html"] = files["index.html"].replace(
      "./assets/index-abc.js",
      "/assets/index-abc.js",
    );
    const result = run(makeDist(files));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/absolute/);
  });

  it("fails on an absolute /assets/ reference inside a script", () => {
    const files = goodFiles();
    files["assets/client-x.js"] = 'new Worker("/assets/worker-g2.js");';
    const result = run(makeDist(files));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/absolute \/assets\//);
  });

  it("fails without wasm or with an unreferenced worker", () => {
    const noWasm = goodFiles();
    delete noWasm["assets/manifold-m3.wasm"];
    expect(run(makeDist(noWasm)).stderr).toMatch(/no \.wasm/);
    const orphan = goodFiles();
    orphan["assets/client-x.js"] = "export {};";
    expect(run(makeDist(orphan)).stderr).toMatch(/worker-g2\.js is not referenced/);
  });

  it("fails when the licenses file misses a package", () => {
    const files = goodFiles();
    files["third-party-licenses.txt"] = "three preact";
    const result = run(makeDist(files));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/manifold-3d/);
  });
});
```

- [ ] **Step 2: Include script tests in Vitest and run the test to verify it fails**

Edit `vite.config.ts`: add `"scripts/**/*.test.mjs"` to `test.include` (plan 1's line) and change nothing else. The whole file afterwards:

```ts
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import pkg from "./package.json";
import { licensePlugin } from "./licenses.config";

// `base: "./"` keeps every asset URL relative, so the built app works from any
// subpath (e.g. /<repo>/insert-generator/).
export default defineConfig({
  base: "./",
  plugins: [preact(), licensePlugin()],
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
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    // Vitest stubs CSS imports to ""; PlanView.test.tsx reads plan.css as `?raw` to check
    // `touch-action: none`, so that file is passed through.
    css: { include: [/plan\.css/] },
  },
});
```

Run: `cd apps/insert-generator && npx vitest run scripts/smoke-dist.test.mjs`
Expected: FAIL — every case reports a non-zero status with `Cannot find module '…/scripts/smoke-dist.mjs'` in `stderr`.

- [ ] **Step 3: Write the smoke script**

```js
#!/usr/bin/env node
// scripts/smoke-dist.mjs — build smoke test (spec §11 "Build").
//
//   node scripts/smoke-dist.mjs [distDir]
//
// Serves dist/ from a subpath, the way GitHub Pages does
// (/static-web-apps/insert-generator/), and checks that index.html only uses
// relative asset URLs that load, that the layout and geometry workers and the
// manifold WASM exist and are referenced by name, that no file points at an
// absolute /assets/ path, and that the third-party licenses file is complete.
//
// Limits: no browser runs the page. This proves the files are there and wired
// relatively; it does not prove that the workers or the WASM execute. The
// manual end-to-end check in the UI plan covers that.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const BASE = "/static-web-apps/insert-generator/";
const REQUIRED_LICENSES = [
  "manifold-3d",
  "Clipper2",
  "three",
  "preact",
  "@preact/signals",
  "fflate",
];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const root = resolve(process.argv[2] ?? "dist");
const problems = [];

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(path)));
    } else {
      out.push(relative(root, path).split(sep).join("/"));
    }
  }
  return out;
}

function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const rel = decodeURIComponent(url.pathname.slice(BASE.length)) || "index.html";
    const file = resolve(root, rel);
    if (!file.startsWith(`${root}${sep}`)) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

async function check() {
  let files;
  try {
    files = await listFiles(root);
  } catch {
    problems.push(`${root} does not exist or is not readable`);
    return;
  }
  if (!files.includes("index.html")) {
    problems.push("index.html is missing");
    return;
  }
  const server = await startServer();
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const page = new URL(`http://127.0.0.1:${port}${BASE}`);
  try {
    const html = await readFile(join(root, "index.html"), "utf8");
    const refs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    if (refs.length === 0) {
      problems.push("index.html references no assets");
    }
    for (const ref of refs) {
      if (/^(?:\/|[a-z][a-z0-9+.-]*:)/i.test(ref)) {
        problems.push(`index.html uses an absolute URL: ${ref}`);
        continue;
      }
      const res = await fetch(new URL(ref, page));
      if (res.status !== 200) {
        problems.push(`${ref} (from index.html) returned ${res.status} under ${BASE}`);
      }
    }

    const texts = new Map();
    for (const f of files.filter((name) => /\.(?:js|css|html)$/.test(name))) {
      texts.set(f, await readFile(join(root, f), "utf8"));
    }
    for (const [name, text] of texts) {
      if (/["'(`]\/assets\//.test(text)) {
        problems.push(`${name} contains an absolute /assets/ reference`);
      }
    }

    const scripts = [...texts].filter(([name]) => name.endsWith(".js"));
    const base = (path) => path.split("/").at(-1) ?? path;
    const wasm = files.filter((f) => f.endsWith(".wasm"));
    const workers = files.filter((f) => f.endsWith(".js") && /worker/i.test(base(f)));
    if (wasm.length === 0) {
      problems.push("no .wasm file in dist (manifold-3d)");
    }
    if (workers.length < 2) {
      problems.push(`expected the layout and geometry worker scripts, found ${workers.length}`);
    }
    for (const f of [...wasm, ...workers]) {
      const name = base(f);
      if (!scripts.some(([other, text]) => other !== f && text.includes(name))) {
        problems.push(`${name} is not referenced by any script`);
      }
      const res = await fetch(new URL(f, page));
      if (res.status !== 200) {
        problems.push(`${f} returned ${res.status} under ${BASE}`);
      } else if (f.endsWith(".wasm") && res.headers.get("content-type") !== "application/wasm") {
        problems.push(`${f} is not served as application/wasm`);
      }
    }

    if (!files.includes("third-party-licenses.txt")) {
      problems.push("third-party-licenses.txt is missing");
    } else {
      const licenses = await readFile(join(root, "third-party-licenses.txt"), "utf8");
      for (const name of REQUIRED_LICENSES) {
        if (!licenses.includes(name)) {
          problems.push(`third-party-licenses.txt does not mention ${name}`);
        }
      }
    }
  } finally {
    server.close();
  }
}

await check();
if (problems.length > 0) {
  process.stderr.write(`smoke-dist: FAILED\n${problems.map((p) => `  - ${p}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`smoke-dist: OK (${root} served from ${BASE})\n`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/insert-generator && npx vitest run scripts/smoke-dist.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the smoke test into the build and run it on the real dist**

In `package.json`, change only the `build` script (plan 1's value plus the smoke step at the end); every other field, script and dependency stays as it is:

```diff
-    "build": "vitest run && tsc --noEmit && tsc --noEmit -p tsconfig.node.json && vite build",
+    "build": "vitest run && tsc --noEmit && tsc --noEmit -p tsconfig.node.json && vite build && node scripts/smoke-dist.mjs dist",
```

Run: `cd apps/insert-generator && npm run build`
Expected: all tests pass, both `tsc` runs print nothing, Vite prints `✓ built`, and the last line is `smoke-dist: OK (…/dist served from /static-web-apps/insert-generator/)`. Two Vite warnings are expected and harmless: `Module "node:module" has been externalized for browser compatibility` (manifold's Node-only branch, plan 3) and "Some chunks are larger than 500 kB" for the lazily loaded three.js chunk (`scene-<hash>.js`, ≈ 550 kB, loaded only when the 3D view opens). If it reports fewer than two worker scripts, list `dist/assets` and check the worker file names: Vite names worker chunks after their source file (`worker-<hash>.js` for both `layout/worker.ts` and `geometry/worker.ts`).

- [ ] **Step 6: Bulk-build smoke test of the geometry timeout**

The geometry client (plan 3) rejects a build after `BUILD_TIMEOUT_MS` (30 s) counted from the call, queue time included, and `meshes.ts` keeps at most `MAX_IN_FLIGHT` builds in the worker (roadmap §4.3). Build every part (trays, spacers, leftovers) of the optimized fixture layouts with the kernel, in Node, and check the slowest build leaves that timeout a wide margin: a build waits for at most `MAX_IN_FLIGHT − 1` others, and a slow laptop is assumed 5× slower.

```ts
// src/app/bulkBuild.smoke.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildTray, loadManifold } from "../geometry";
import { BUILD_TIMEOUT_MS } from "../geometry/client";
import { optimize } from "../layout";
import { FIXTURES, fixtureInput, type FixtureName } from "../layout/test-fixtures";
import { MAX_IN_FLIGHT } from "./meshes";

describe("bulk build smoke", () => {
  it(
    "builds every part of the fixture layouts well inside BUILD_TIMEOUT_MS",
    { timeout: 120_000 },
    async () => {
      const m = await loadManifold();
      const names = Object.keys(FIXTURES) as FixtureName[];
      const layouts = names.map((name) => {
        const input = fixtureInput(name);
        return { name, settings: input.settings, layout: optimize(input, 1, 2000).layout };
      });
      // Every fixture but tiny-box (infeasible by design, roadmap §5) has a layout to build.
      expect(layouts.filter((l) => l.layout === null).map((l) => l.name)).toEqual(["tiny-box"]);
      const builds = layouts.flatMap(({ settings, layout }) =>
        (layout?.trays ?? []).map((spec) => ({ spec, settings })),
      );
      // At least one part per feasible fixture.
      expect(builds.length).toBeGreaterThanOrEqual(names.length - 1);
      let slowest = 0;
      for (const { spec, settings } of builds) {
        const start = performance.now();
        buildTray(m, spec, settings);
        slowest = Math.max(slowest, performance.now() - start);
      }
      expect(slowest * MAX_IN_FLIGHT * 5, `slowest build ${slowest.toFixed(0)} ms`).toBeLessThan(
        BUILD_TIMEOUT_MS,
      );
    },
  );
});
```

Run: `cd apps/insert-generator && npx vitest run src/app/bulkBuild.smoke.test.ts`
Expected: PASS. If it fails, raise `BUILD_TIMEOUT_MS` in plan 3's `geometry/client.ts` (and roadmap §4.3) rather than lowering the margin.

- [ ] **Step 7: Commit**

```bash
cd apps/insert-generator
git add scripts/smoke-dist.mjs scripts/smoke-dist.test.mjs src/app/bulkBuild.smoke.test.ts package.json vite.config.ts
git commit -m "Add a build smoke test of dist served from a subpath"
```

---

### Task 24: README and app.json

**Files:**

- Modify (replace contents): `README.md` (app folder), `app.json`

**Interfaces:**

- Consumes: the finished app (Tasks 1–23).
- Produces: developer documentation (commands, architecture, data flow, how to add a component kind, smoke-test limits) and the landing-page description.

- [ ] **Step 1: Write the failing check**

Run (repo root): `grep -q "How to add a component kind" apps/insert-generator/README.md && grep -q "stacking trays" apps/insert-generator/app.json`
Expected: exit status 1 (plan 1's placeholder README and app.json don't contain these yet).

- [ ] **Step 2: Replace `apps/insert-generator/app.json`**

```json
{
  "title": "Board Game Insert Generator",
  "description": "Measure a board game box and its components; get a 3D-printable insert of stacking trays (3MF/STL) with assembly pictures. Preview."
}
```

- [ ] **Step 3: Replace `apps/insert-generator/README.md`**

````markdown
# insert-generator

Built app: **Vite + TypeScript + Preact (signals)**. Turns a board game box and
its components into a 3D-printable insert: trays that tile the box, stack with
a locating lip, open upward and fit the print bed. Exports 3MF/STL and a
printable assembly page. Design: [`docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md`](../../docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md).

Status: **preview (0.x)**: saved projects and shared links may break between
versions.

```bash
cd apps/insert-generator
npm install
npm run dev        # dev server
npm test           # vitest run (unit + jsdom component tests + script tests)
npm run build      # vitest run && tsc --noEmit && vite build && smoke test of dist/
npm run preview    # serve the production build
```

Tests run inside `npm run build`, because the repo's quality gate only runs
lint, format and build. Component tests opt in to jsdom with
`// @vitest-environment jsdom` in their header comment and stub the layout and
geometry clients, so they never start a worker or load WASM.

## Architecture

| Folder          | What it does                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `model/`        | Types, defaults, validation, schema versioning, `inputsHash`                                     |
| `share/`        | `#1.` link codec, local project store, JSON files                                                |
| `sizing/`       | Component (group) → tray requirements with variants                                              |
| `layout/`       | Optimizer (Web Worker, deterministic), `summarize`, `swapLocks`                                  |
| `geometry/`     | `TraySpec` → manifold mesh (Web Worker; only `geometry/client.ts` is imported by the page)       |
| `export/`       | 3MF / STL writers, zip, grid layout                                                              |
| `app/`          | State (`state.ts`), optimizer runner, persistence, store, export builders, mesh cache, `App.tsx` |
| `ui/`           | Forms, component editors, project menu, summary, export panel                                    |
| `plan/`         | Top-down plan view with select, drag/keyboard swap and lock                                      |
| `viewer/`       | three.js 3D view (`scene.ts` is loaded lazily)                                                   |
| `instructions/` | Part numbering, assembly SVGs, packing order, printable page, PNG                                |
| `licenses/`     | Builds `dist/third-party-licenses.txt` (see `licenses.config.ts`)                                |

**Data flow.** Every edit goes through `store.edit(fn)` with a pure function
from `app/actions.ts`. If `inputsHash` changed, `app/runner.ts` waits 400 ms,
cancels any running optimization, runs `size()` and the layout worker (same
seed, warm start from the current layout) and auto-accepts the result into
`project.layout`, keeping the previous layout for one-step Undo. A result whose
inputs no longer match the project is discarded. `app/persistence.ts` autosaves
(500 ms) to localStorage, writes the `#1.` link with `history.replaceState`,
opens links and files as separate projects (a different project with the same
id becomes a copy) and pauses autosave if another tab saved the same project.
A project with a stored layout is never re-optimized on load; if its inputs
changed, an "Inputs changed — re-optimize?" notice appears instead. Meshes are
built on demand by the geometry worker and cached in `app/meshes.ts`.

## How to add a component kind

1. **Model (additive schema bump):** add the interface to `src/model/types.ts`
   (roadmap §4.1), add it to the `Component` union, give it defaults in
   `newComponent()` and `KIND_NAMES` (`model/defaults.ts`), validation in
   `model/validate.ts`, and reading support in
   `model/schema-read-components.ts`. Bump `SCHEMA_VERSION`
   (`model/version.ts`) for an additive change: while MAJOR is 0 that is the
   PATCH (MINOR is breaking and needs a migration); from 1.0 on it is the
   MINOR (MAJOR is breaking). Add a fixture under `test/fixtures/schema/`.
2. **Sizing:** turn it into `TrayRequirement` variants in `src/sizing/`
   (one compartment requirement per item, finger cuts, elastic axes).
3. **Geometry:** only if it needs a new compartment kind or feature. Bump
   `GEOMETRY_VERSION` (`geometry/version.ts`): while MAJOR is 0 a new optional
   feature is a PATCH and a change that breaks fit (or makes `planTray` reject
   specs it accepted before) is a MINOR, which `isOlderGeometryLine` treats as
   a new line ("reprint the whole insert"); from 1.0 on they are MINOR and
   MAJOR.
4. **UI:** create `src/ui/components/<Kind>Editor.tsx` taking
   `EditorProps<YourComponent>` (simple fields first, extra ones inside
   `<MoreOptions open={advanced}>` together with `<CommonOptions …/>`), add a
   `case` to `KindEditor` in `ComponentCard.tsx`, and add the kind to `KINDS`
   and `ADD_LABELS` in `ComponentList.tsx`. Field paths must match
   `validateProject()` so errors show next to the field.
5. **Tests:** sizing unit tests, an editor test next to the editor, and run
   `npm run build`.

## Build smoke test and its limits

`scripts/smoke-dist.mjs` serves `dist/` from `/static-web-apps/insert-generator/`
with a tiny `node:http` server and checks that `index.html` only uses relative
URLs that load, that the layout and geometry worker scripts and the manifold
WASM exist and are referenced by name, that nothing points at `/assets/`
absolutely, and that `third-party-licenses.txt` names every bundled library.
No browser runs the page, so it cannot prove the workers or WASM execute; do the
manual check in the UI plan (import a fixture, export, open the link) before a
release.

`vite.config.ts` sets `base: "./"` for subpath hosting and defines
`__APP_VERSION__` from `package.json`. TypeScript strictness comes from the
repo's [`tsconfig.base.json`](../../tsconfig.base.json).
````

- [ ] **Step 4: Run the check and the formatter**

Run (repo root): `grep -q "How to add a component kind" apps/insert-generator/README.md && grep -q "stacking trays" apps/insert-generator/app.json && npx prettier --check apps/insert-generator/README.md apps/insert-generator/app.json`
Expected: exit status 0 and `All matched files use Prettier code style!` (if Prettier reports the README, run `npx prettier --write apps/insert-generator/README.md` and re-check).

- [ ] **Step 5: Commit**

```bash
cd apps/insert-generator
git add README.md app.json
git commit -m "Document the insert generator UI and architecture"
```

---

### Task 25: Full verification and manual end-to-end check

**Files:**

- None created. Fix-ups only if a check fails (commit them with a message naming the fix).

**Interfaces:**

- Consumes: the whole app.
- Produces: a green `npm run verify` and a recorded manual run.

- [ ] **Step 1: Run the repo quality gate**

Run (repo root): `npm run verify`
Expected: ESLint, Stylelint and html-validate print no errors; Prettier prints `All matched files use Prettier code style!`; `build:all` builds every app, and the insert-generator build ends with `smoke-dist: OK …`. Final line: `Built 4 app(s).`

If Prettier fails, run `npx prettier --write apps/insert-generator` and re-run. If ESLint reports `curly`, `eqeqeq`, `prefer-template` or `no-param-reassign`, fix the code the way the rule says (never disable the rule).

- [ ] **Step 2: Manual end-to-end check in a real browser**

1. `cd apps/insert-generator && npm run build && npx vite preview --base /static-web-apps/insert-generator/ --port 4173`, open `http://localhost:4173/static-web-apps/insert-generator/` in Chrome (real subpath, real workers and WASM).
2. **Import:** Project menu → "Import JSON…" → choose `apps/insert-generator/test/fixtures/cards-heavy.json`. Expected: the project name changes, inputs fill in, the summary shows "Optimizing… N%" and then fill %, trays, stacks, "≤ N g (upper bound…)" and play per axis; the plan view and 3D view appear.
3. **No re-optimize on reload:** reload the page. Expected: the same layout appears at once, no "Optimizing…".
4. **Lock & swap:** in the plan view, drag tray 1 onto tray 2 (mouse). Expected: both show "locked", a re-optimize runs, the trays have traded places. Then select tray 3, click "Lock position": its label gets ", locked". Click "Undo layout": the previous layout returns and the "Inputs changed — re-optimize?" notice offers "Re-optimize now".
5. **Edit storm:** in Box → Inner width type `2`, `29`, `290,5` quickly. Expected: one "Optimizing…" after you stop typing, no error message while typing `290,`.
6. **Export:** Export → "3MF per part (.zip)". Expected: a progress bar "Building meshes k/N…", then `<name>-3mf-parts.zip` downloads; unzip it: files `01-….3mf`, `02-….3mf`, …; open one in PrusaSlicer or Bambu Studio: a single upright tray in millimetres. Also try "One combined 3MF" (all parts in a grid at z = 0) and "STL files (.zip)".
7. **Assembly page:** "Open the assembly page". Expected: packing order (bottom first), one numbered picture per layer, the "What goes where" table. Click "Download PNG of layer 1" (PNG downloads), then "Print / save as PDF": the print preview shows only the assembly content, each layer on one page. "Back to the editor".
8. **Share link:** Project menu → "Copy link". Expected: "Link copied." (or the long-link warning with "Download JSON instead" if the whole link exceeds 2 000 characters). Open a new tab, paste the link. Expected: the same layout appears at once, without optimizing; the project list in both tabs now has the project once (same id, same content). Edit the name in the first tab, then edit the box width in the second tab and wait a second: the first tab shows "This project was changed in another tab…" with "Keep my version" / "Load the other tab's version".
9. **Broken link:** change one character in the middle of the URL hash and press Enter. Expected: an error notice "Couldn't open this link: …" and the current project stays.
10. **Licenses:** footer → "Third-party licenses": the text file lists manifold-3d (Apache-2.0 and its NOTICE), Clipper2 (BSL-1.0), three, preact, @preact/signals and fflate.
11. **Mobile:** DevTools device toolbar (iPhone 12): one column, no horizontal scroll, dragging a tray in the plan swaps instead of scrolling.
12. **No WebGL:** start Chrome with `--disable-webgl` (or `chrome://flags` → WebGL off), reload: the 3D panel says "The 3D preview needs WebGL…", everything else works.

Write down any failure, fix it in the owning task's files with a test that reproduces it, and re-run Step 1.

- [ ] **Step 3: Commit fix-ups (only if Step 1 or 2 needed changes)**

```bash
git add apps/insert-generator
git commit -m "Fix issues found in the end-to-end check"
```

---

## Contract changes

None to the names, types or signatures in roadmap §4. This plan relies on these additive exports and conventions from the final plans 1–4, and records two clarifications:

1. **Imports used (all exist in plans 1–4):** `share/index.ts` (`encodeHash`, `decodeHash`, `createProjectStore(storage?: Storage | null)`, `ProjectStore`, `ProjectListEntry`, `StoreWriteError`, `exportJsonFile`, `importJsonText`, `jsonFileName`, `LINK_MAX_URL_CHARS`); `model/schema.ts` `noForeign()`; `model/validate.ts` `SETTING_RANGES`; `model/defaults.ts` `DEFAULT_BOX`, `DEFAULT_PRINTER`, `KIND_NAMES`; `model/settings.ts` `WALL_CHOICES`, `FIT_CHOICES`; `model/version.ts` `isPreview`; `layout/index.ts` `swapLocks(locks, keyA, keyB, layout)`, `summarize`, `DEFAULT_ITERATIONS`; `layout/client.ts` `LayoutClient` (and `LayoutCancelledError`, matched by `name` so the lazily loaded client isn't imported statically); `geometry/client.ts` `GeometryClient`, `GeometryBuildError` (tests; the app matches errors by `name`); `geometry/version.ts` `isOlderGeometryLine`; `test-support/memory-storage.ts` `MemoryStorage` (tests only). The page never imports `geometry/index`.
2. **"Improve more" call shape (roadmap §4.8).** The UI calls `run(input, layout.seed, 3 × DEFAULT_ITERATIONS, layout, onProgress)`: `iterations` is this run's budget and `warmStart` is the stored layout, so plan 4 continues the search from it and stores `layout.iterations + 3 × DEFAULT_ITERATIONS` (spec §7.2 "improve more adds 3N, continuing from the stored (seed, iterations)").
3. **Node types stay out of the app.** `licenses.config.ts` (Node-side, `node:fs` / `node:url`) is added to plan 1's `tsconfig.node.json`, which has `"types": ["node"]` (`@types/node ^22.0.0`, installed by plan 1). The app's `tsconfig.json` covers only `src/` without Node types, so browser code can't use `process` or `Buffer` by accident. `npm run build` and `npm run typecheck` check both projects.
4. **Unsupported trays are detected on the UI side too.** `app/support.ts` imports plan 3's `KNOWN_PARTS`, `KNOWN_COMPARTMENT_KINDS` and `KNOWN_FEATURE_TYPES` from `geometry/types` (roadmap §4.3; no WASM) to disable those trays in the export panel before any worker call; failed builds reject with plan 3's `GeometryBuildError`, told apart by `name`, never `instanceof RangeError`: `"UnsupportedFeatureError"` (with `feature`) and `"TraySpecError"` (an invalid spec, `Tray <key>: …`) are shown per tray, like `"TimeoutError"` and worker failures (roadmap §4.3). New values are added in plan 3's lists only.
5. **Dropped locks and size locks.** Plan 4's `lock.dropped` notices carry `path: "/locks/<index>"` (the lock's index in `LayoutInput.locks`, i.e. `project.locks`); the runner removes those locks when it accepts a result and stores the layout under the post-prune `inputsHash` (Task 3). Size locks are created from the tray details ("Lock size", Tasks 1, 15, 18, 21).
6. **Link length.** The warning compares the whole URL with plan 1's `LINK_MAX_URL_CHARS = 2000` (Discord's message limit); plan 1's `LINK_TARGET_CHARS = 1900` stays the hash budget for fixtures without a layout.
