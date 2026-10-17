#!/usr/bin/env node
// scripts/design/make-seeds.mjs — `npm run seeds`
//
// Writes docs/design/seeds/<name>.json: the whole localStorage content the real stores leave for
// each "Harbour Kings" state the screenshots start from, made with the real optimizer under the
// runner's seed and budget and the worker's time cap. Reruns give the same files: every index
// entry's updatedAt is pinned. The fixture (src/test-support/harbourKings.ts) is never edited
// here: when an outcome is not the one a state needs, the script prints the counts it tried and
// exits 1, and a person edits the fixture.
import { deepStrictEqual } from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createModuleLoader } from "./viteModules.mjs";

const OUT = fileURLToPath(new URL("../../docs/design/seeds/", import.meta.url));
const PINNED_AT = 1792108800000; // 2026-10-16T00:00:00Z
const TRY_OFFSETS = [10, 20, 30, 40, 50];

const loader = await createModuleLoader();
const failures = [];
try {
  const kit = await loader.load("src/test-support/harbourKings.ts");
  const runner = await loader.load("src/app/runner.ts");
  const optimizeModule = await loader.load("src/layout/optimize.ts");
  const hash = await loader.load("src/model/hash.ts");
  const noFit = await loader.load("src/ui/noFit.ts");
  const sizing = await loader.load("src/sizing/index.ts");
  const share = await loader.load("src/share/index.ts");
  const schema = await loader.load("src/model/schema.ts");
  const memory = await loader.load("src/test-support/memory-storage.ts");
  const geometry = await loader.load("src/geometry/version.ts");
  const layers = await loader.load("src/plan/layers.ts");

  const { DEFAULT_ITERATIONS, DEFAULT_TIME_CAP_MS, optimize } = optimizeModule;
  const { DEFAULT_SEED, buildLayoutInput } = runner;

  /** One search the way the runner starts it: its seed, budget and warm start, the worker's cap. */
  function search(project) {
    const previous = project.layout;
    const started = Date.now();
    const result = optimize(
      buildLayoutInput(project),
      previous?.seed ?? DEFAULT_SEED,
      DEFAULT_ITERATIONS,
      { warmStart: previous, timeCapMs: DEFAULT_TIME_CAP_MS },
    );
    return { result, seconds: (Date.now() - started) / 1000 };
  }

  /** What a run came to, in the words the failure report uses. */
  function outcome(project, result) {
    if (result.layout !== null && result.lockConflicts.length === 0) {
      return "layout";
    }
    if (result.layout !== null) {
      return "pin conflict";
    }
    const misfit = noFit.misfitOf(
      result.bestAttempt,
      project.box,
      project.settings,
      project.components,
    );
    return `no fit, misfit ${misfit?.name ?? "none"}`;
  }

  function withLayout(project) {
    const { result, seconds } = search(project);
    if (result.layout === null) {
      throw new Error(
        `${project.name}: the fresh run found no layout (${outcome(project, result)})`,
      );
    }
    if (result.layout.capped) {
      console.warn(
        `warning: ${project.id} hit the ${DEFAULT_TIME_CAP_MS / 1000} s cap (${seconds} s): a slower browser could land elsewhere`,
      );
    }
    return { ...project, layout: result.layout };
  }

  /** Tries `build(count)` at `first`, then at first + 10 .. + 50, until `accept` takes the run. */
  function tune(label, first, build, accept) {
    const tried = [];
    for (const count of [first, ...TRY_OFFSETS.map((n) => first + n)]) {
      const project = build(count);
      const { result, seconds } = search(project);
      const what = outcome(project, result);
      tried.push({ count, what });
      if (accept(project, result)) {
        if (result.layout?.capped) {
          console.warn(`warning: ${label} hit the time cap (${seconds} s)`);
        }
        return { project, result, count, tried };
      }
    }
    // The counts that would work: a wider scan, for whoever edits the fixture.
    const works = [];
    for (let count = first + 5; count <= first + 150; count += 5) {
      if (!TRY_OFFSETS.some((n) => first + n === count)) {
        const project = build(count);
        if (accept(project, search(project).result)) {
          works.push(count);
        }
      }
    }
    failures.push({ label, first, tried, works });
    return null;
  }

  /**
   * Two layers, as Main draws the game: the Heroes pockets stand on the bottom layer and fit in a
   * short one (a tray of at most 46 mm; Main has 40 mm, the box 70).
   */
  function twoLayers(project, result) {
    if (result.layout === null || layers.levelsOf(result.layout.trays).length !== 2) {
      return false;
    }
    const heroes = result.layout.trays.find(
      (t) => t.part === "tray" && t.key.startsWith("heroes01:"),
    );
    return heroes !== undefined && heroes.level === 0 && heroes.h <= 46;
  }

  /**
   * Looks for a tuning (values the rail never shows) that gives two layers, in this order: the
   * Settings board's own values (the wall at 1.6, and the "Room around things" values it shows as
   * changed), the sleeve or thickness of the Market and Starter decks, then padding (a clearance on
   * every component, then the Heroes pockets). The first that works wins. Prints each try.
   */
  function* tuningCandidates() {
    for (const cardClearance of [2, 2.5, 3, 3.5, 4, 5]) {
      for (const cardStackClearance of [1, 1.5, 2]) {
        yield { settings: { wall: 1.6, cardClearance, cardStackClearance }, components: {} };
      }
    }
    const decks = ["market01", "starter1"];
    const on = (patch) => Object.fromEntries(decks.map((id) => [id, patch]));
    for (const sleeve of [
      "premium",
      { w: 68, h: 92, thickness: 0.12 },
      { w: 70, h: 95, thickness: 0.2 },
    ]) {
      yield { settings: {}, components: on({ sleeve }) };
    }
    for (const scale of [1.1, 1.25, 1.5]) {
      yield { settings: {}, components: on({ thickness: { mode: "preset", scale } }) };
    }
    const ids = kit.harbourKings(kit.NO_TUNING).components.map((c) => c.id);
    for (let clearance = 1; clearance <= 12; clearance++) {
      yield { settings: {}, components: Object.fromEntries(ids.map((id) => [id, { clearance }])) };
    }
    for (const pad of [2, 4, 6, 8]) {
      const figure = { name: "Hero", w: 30 + pad, d: 30 + pad, h: 38, count: 6 };
      yield { settings: {}, components: { heroes01: { figures: [figure] } } };
    }
  }

  function tuneLayers() {
    for (const tuning of tuningCandidates()) {
      const project = kit.harbourKings(tuning);
      const { result } = search(project);
      const levels = result.layout ? layers.levelsOf(result.layout.trays).length : 0;
      console.error(`  tried ${JSON.stringify(tuning)}: ${levels} layers`);
      if (twoLayers(project, result)) {
        return tuning;
      }
    }
    return null;
  }

  // The fixture carries the tuning (LAYER_TUNING); when its plan is not two layers, look for one.
  const first = search(kit.harbourKings());
  if (!twoLayers(kit.harbourKings(), first.result)) {
    console.error(
      "harbour-kings: the plan is not two layers with the Heroes in a short bottom layer.",
    );
    const found = tuneLayers();
    console.error(
      found === null
        ? "\nNo tuning gives two layers. Fall back to a separate seed for the workspace states."
        : `\nPaste this into LAYER_TUNING in src/test-support/harbourKings.ts, then run npm run seeds again:\n${JSON.stringify(found, null, 2)}`,
    );
    process.exit(1);
  }
  const base = withLayout(kit.harbourKings());
  const headroom = withLayout(kit.harbourKingsHeadroom());
  const long = withLayout(kit.harbourKingsLong());
  const wide = withLayout(kit.harbourKingsWide());

  // Stale seeds: the base plan with an edit that the plan does not cover.
  const stale = {
    ...base,
    components: base.components.map((c) =>
      c.id === "market01" ? { ...c, decks: c.decks.map((d) => ({ ...d, count: 81 })) } : c,
    ),
  };
  const notes = kit.harbourKingsNotes(base);
  const noticeCodes = sizing.size(notes.components, notes.settings).notices.map((n) => n.code);
  if (noticeCodes.length < 3) {
    failures.push({
      label: "harbour-kings-notes",
      first: 0,
      tried: [],
      text: `only ${noticeCodes.length} sizing notices: ${noticeCodes.join(", ") || "none"}`,
    });
  }

  const misfitOf = (project, result) =>
    result.layout === null
      ? noFit.misfitOf(result.bestAttempt, project.box, project.settings, project.components)
      : null;
  // The height story: a figure too tall for the box, so the closest attempt overhangs it.
  const noFitRun = tune(
    "harbour-kings-nofit (Heroes figure height)",
    80,
    (height) => kit.harbourKingsNoFit(base, height),
    (project, result) => {
      const m = misfitOf(project, result);
      return m?.name === "Heroes" && m.reason === "box";
    },
  );
  // An extra, kept because it is cheap: too many pockets for the print bed.
  const noFitBedRun = tune(
    "harbour-kings-nofit-bed (Heroes figures)",
    40,
    (count) => kit.harbourKingsNoFitBed(base, count),
    (project, result) => {
      const m = misfitOf(project, result);
      return m?.name === "Heroes" && m.reason === "bed";
    },
  );
  const pinsRun = tune(
    "harbour-kings-pins (Hex tiles)",
    100,
    (count) => kit.harbourKingsPinConflict(base, count),
    (_project, result) => result.lockConflicts.length > 0 && result.layout !== null,
  );

  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`\n${f.label}: not the outcome the state needs.`);
      if (f.text) {
        console.error(`  ${f.text}`);
      }
      for (const t of f.tried) {
        console.error(`  ${t.count}: ${t.what}`);
      }
      if (f.works) {
        console.error(
          `  would work (steps of 5 up to ${f.first + 150}): ${f.works.join(", ") || "none"}`,
        );
      }
    }
    console.error(
      "\nEdit the fixture (src/test-support/harbourKings.ts) to a value that works, then run npm run seeds again.",
    );
    process.exitCode = 1;
  } else {
    mkdirSync(OUT, { recursive: true });
    const seeds = {
      "harbour-kings": { project: base },
      "harbour-kings-headroom": { project: headroom },
      "harbour-kings-long": { project: long },
      "harbour-kings-wide": { project: wide },
      "harbour-kings-stale": { project: stale },
      "harbour-kings-notes": { project: notes },
      "harbour-kings-nofit": { project: noFitRun.project, result: noFitRun.result },
      "harbour-kings-nofit-bed": { project: noFitBedRun.project, result: noFitBedRun.result },
      "harbour-kings-pins": { project: pinsRun.project, result: pinsRun.result },
    };
    for (const [name, { project, result }] of Object.entries(seeds)) {
      const storage = new memory.MemoryStorage();
      share.createProjectStore(storage).save(project, schema.noForeign());
      const indexKey = `${share.STORAGE_PREFIX}index`;
      const index = JSON.parse(storage.getItem(indexKey)).map((e) => ({
        ...e,
        updatedAt: PINNED_AT,
      }));
      storage.setItem(indexKey, JSON.stringify(index));
      const content = {};
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        content[key] = storage.getItem(key);
      }
      writeFileSync(
        `${OUT}${name}.json`,
        `${JSON.stringify({ storage: content, projectId: project.id }, null, 2)}\n`,
      );
      if (result !== undefined) {
        const text = JSON.stringify(result, null, 2);
        deepStrictEqual(JSON.parse(text), result);
        writeFileSync(`${OUT}${name}.result.json`, `${text}\n`);
      }
      const fresh = hash.inputsHash(project);
      const stored = project.layout?.inputsHash;
      console.log(
        `${name}: ${project.components.length} components, plan ${stored === fresh ? "current" : "stale"}, geometry ${geometry.GEOMETRY_VERSION}`,
      );
    }
    console.log(
      `\nfinal values: Heroes figure height ${noFitRun.count} mm (no fit, box), Heroes figures ${noFitBedRun.count} (no fit, bed), Hex tiles ${pinsRun.count} (pin conflict), sizing notices ${noticeCodes.length}`,
    );
  }
} finally {
  await loader.close();
}
