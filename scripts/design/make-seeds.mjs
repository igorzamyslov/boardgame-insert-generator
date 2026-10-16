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
    failures.push({ label, first, tried });
    return null;
  }

  const base = withLayout(kit.harbourKings());
  const headroom = withLayout(kit.harbourKingsHeadroom());
  const long = withLayout(kit.harbourKingsLong());

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

  const noFitRun = tune(
    "harbour-kings-nofit (Heroes figures)",
    40,
    (count) => kit.harbourKingsNoFit(base, count),
    (project, result) =>
      result.layout === null &&
      noFit.misfitOf(result.bestAttempt, project.box, project.settings, project.components)
        ?.name === "Heroes",
  );
  const pinsRun = tune(
    "harbour-kings-pins (Hex tiles)",
    155,
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
        console.error(`  count ${t.count}: ${t.what}`);
      }
    }
    console.error(
      "\nEdit the fixture (src/test-support/harbourKings.ts) to a count that works, then run npm run seeds again.",
    );
    process.exitCode = 1;
  } else {
    mkdirSync(OUT, { recursive: true });
    const seeds = {
      "harbour-kings": { project: base },
      "harbour-kings-headroom": { project: headroom },
      "harbour-kings-long": { project: long },
      "harbour-kings-stale": { project: stale },
      "harbour-kings-notes": { project: notes },
      "harbour-kings-nofit": { project: noFitRun.project, result: noFitRun.result },
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
      `\nfinal counts: Heroes ${noFitRun.count} figures (no fit), Hex tiles ${pinsRun.count} (pin conflict), sizing notices ${noticeCodes.length}`,
    );
  }
} finally {
  await loader.close();
}
