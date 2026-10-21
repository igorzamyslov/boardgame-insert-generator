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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createModuleLoader } from "./viteModules.mjs";

const OUT = fileURLToPath(new URL("../../docs/design/seeds/", import.meta.url));
const STAR_REALMS = fileURLToPath(
  new URL("../../test/fixtures/star-realms-owner-4.json", import.meta.url),
);
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
  const numbering = await loader.load("src/instructions/numbering.ts");
  const naming = await loader.load("src/instructions/naming.ts");

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
      project.groups ?? [],
    );
    return `no fit, misfit ${misfit?.name ?? "none"}`;
  }

  /** The names the packing guide and the plan give the parts of `project`'s layout, by tray key. */
  function namesOf(project, layout) {
    return naming.trayNames(
      numbering.numberParts(layout.trays),
      project.components,
      project.groups ?? [],
    );
  }

  /** Searches `project` with seed `seed` (cold start), as the runner would with a plan stored under it. */
  function searchWith(project, seed) {
    return optimize(buildLayoutInput(project), seed, DEFAULT_ITERATIONS, {
      timeCapMs: DEFAULT_TIME_CAP_MS,
    });
  }

  /**
   * R12's definition of the kit (the group's copies and access, its members in order, then Market
   * deck and Hex tiles), and of the loose seed (the same five items, no group, G3's list order).
   * Returns what is wrong, or null.
   */
  function kitDefinitionProblem(project, loose) {
    const names = project.components.map((c) => c.name).join(", ");
    if (loose) {
      const want = "Market deck, Starter deck, Resources, Hero, Hex tiles";
      if ((project.groups ?? []).length > 0) {
        return "the loose kit has a group";
      }
      return names === want ? null : `items are ${names}`;
    }
    const groups = project.groups ?? [];
    const group = groups[0];
    if (groups.length !== 1 || group === undefined) {
      return `${groups.length} groups`;
    }
    const members = group.memberIds
      .map((id) => project.components.find((c) => c.id === id)?.name)
      .join(", ");
    if (group.name !== "Player kit" || group.copies !== 4 || group.access !== "often") {
      return `group is ${group.name} x${group.copies}, ${group.access}`;
    }
    if (members !== "Starter deck, Resources, Hero") {
      return `members are ${members}`;
    }
    return names === "Starter deck, Resources, Hero, Market deck, Hex tiles"
      ? null
      : `items are ${names}`;
  }

  /**
   * G1's arrangement (R12): one layer, six trays, the four "Player kit 1…4" trays on one x, and
   * Market deck and Hex tiles in the other column (starting where the kit trays end, give or take
   * the 3 mm a tray's width may differ). Returns what is wrong with `result`, or null.
   */
  function kitArrangementProblem(project, result) {
    if (result.layout === null) {
      return "no layout";
    }
    const definition = kitDefinitionProblem(project, false);
    if (definition !== null) {
      return definition;
    }
    const trays = result.layout.trays;
    const parts = trays.filter((t) => t.part === "tray");
    const kits = parts.filter((t) => t.key.startsWith("plrkit01:"));
    const others = parts.filter((t) => !t.key.startsWith("plrkit01:"));
    if (layers.levelsOf(trays).length !== 1) {
      return `${layers.levelsOf(trays).length} layers`;
    }
    if (parts.length !== 6 || kits.length !== 4 || others.length !== 2) {
      return `${parts.length} trays (${kits.length} of the kit)`;
    }
    const names = namesOf(project, result.layout);
    const kitNames = kits.map((t) => names.get(t.key)?.full).sort();
    if (kitNames.join("|") !== "Player kit 1|Player kit 2|Player kit 3|Player kit 4") {
      return `kit trays named ${kitNames.join(", ")}`;
    }
    if (!kits.every((t) => Math.abs(t.x - (kits[0]?.x ?? 0)) < 1)) {
      return "the kit trays are not on one x";
    }
    const kitLeft = Math.min(...kits.map((t) => t.x));
    const kitRight = Math.max(...kits.map((t) => t.x + t.w));
    const right = others.every((t) => t.x >= kitRight - 3);
    const left = others.every((t) => t.x + t.w <= kitLeft + 3);
    return right || left ? null : "Market deck and Hex tiles are not in the other column";
  }

  /** Searches seeds 1, 2, 3 … until `accept` takes the run; the stored plan records the seed. */
  function findSeed(label, project, accept, last = 400) {
    const tried = [];
    for (let seed = DEFAULT_SEED; seed <= last; seed++) {
      const result = searchWith(project, seed);
      const problem = accept(project, result);
      if (problem === null) {
        if (result.layout.capped) {
          console.warn(`warning: ${label} hit the time cap`);
        }
        return { ...project, layout: result.layout };
      }
      if (tried.length < 12) {
        tried.push({ count: seed, what: problem });
      }
    }
    failures.push({ label, first: 0, tried, text: `no search seed in 1..${last} gives it` });
    return null;
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
   * every component, then the Heroes pockets, then a clearance of its own on each). The first that
   * works wins, and its no-fit plan has no sliver of a spacer (see noSlivers). Prints each try.
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
    // Last: a different clearance (2 to 10 mm, in halves) on each component, from a fixed
    // pseudo-random sequence, so a rerun tries the same ones. Plans move a lot with these, and
    // the engine's later weights (one stack per item) leave few of the even ones with two layers.
    let state = 1;
    const next = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
    for (let i = 0; i < 300; i++) {
      yield {
        settings: {},
        components: Object.fromEntries(
          ids.map((id) => [id, { clearance: Math.round((2 + next() * 8) * 2) / 2 }]),
        ),
      };
    }
  }

  /**
   * The plan draws a tile 3 px in on each side (a 6 px gap) and its 2 px dashed border needs 4 px
   * more, so a spacer under 6 mm (12 px at the board's scale) is a bare dashed line against its
   * neighbour and the plan-gaps probe fails. The no-fit state draws the closest attempt of a
   * failed search, which varies a lot with the tuning (the no-fit seed's own tuning checks it too).
   */
  function noSliverTrays(trays) {
    return trays.every((t) => t.part === "tray" || Math.min(t.w, t.d) >= 6);
  }

  function noSlivers(project, result) {
    const base = { ...project, layout: result.layout };
    const failed = search(kit.harbourKingsNoFit(base, 80)).result;
    const trays = [...result.layout.trays, ...(failed.layout ?? failed.bestAttempt).trays];
    return noSliverTrays(trays);
  }

  function tuneLayers() {
    for (const tuning of tuningCandidates()) {
      const project = kit.harbourKings(tuning);
      const { result } = search(project);
      const levels = result.layout ? layers.levelsOf(result.layout.trays).length : 0;
      console.error(`  tried ${JSON.stringify(tuning)}: ${levels} layers`);
      if (twoLayers(project, result) && noSlivers(project, result)) {
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

  // The owner's Star Realms (a tall box, 101 x 195 x 37 mm), the project WideStage2 draws: his file
  // as the app reads it, without the plan his version stored, searched here under the runner's own
  // seed and budget like the others. The boards draw Trade deck, Starter deck (3 trays) and Counter.
  const starFile = JSON.parse(readFileSync(STAR_REALMS, "utf8"));
  delete starFile.layout;
  const starParsed = schema.parseProject(starFile);
  if (!starParsed.ok) {
    throw new Error(`star-realms-owner-4.json does not open: ${starParsed.error}`);
  }
  const star = withLayout(starParsed.project);
  const starTrays = star.layout.trays.filter((t) => t.part === "tray").length;
  const starLevels = layers.levelsOf(star.layout.trays).length;
  if (starTrays !== 5 || starLevels !== 4) {
    failures.push({
      label: "star-realms",
      first: 0,
      tried: [],
      text: `the plan has ${starTrays} trays in ${starLevels} layers; WideStage2 draws 5 trays in 4 layers`,
    });
  }

  // Groups (0.7.0). The kit is G1's project: found under a search seed, which the plan records.
  const kitProject = findSeed("harbour-kings-kit", kit.harbourKingsKit(), kitArrangementProblem);
  const kitLoose = withLayout(kit.harbourKingsKitLoose());
  const looseProblem = kitDefinitionProblem(kitLoose, true);
  if (looseProblem !== null) {
    failures.push({
      label: "harbour-kings-kit-loose",
      first: 0,
      tried: [],
      text: looseProblem,
    });
  }
  // The kit with a Hero too long for one copy to fit the bed: each copy is two trays, 1a and 1b.
  const kitSplit = withLayout(kit.harbourKingsKitSplit());
  const splitNames = namesOf(kitSplit, kitSplit.layout);
  for (const want of ["Player kit 1a", "Player kit 1b"]) {
    if (![...splitNames.values()].some((n) => n.full === want)) {
      failures.push({
        label: "harbour-kings-kit-split",
        first: 0,
        tried: [],
        text: `no tray is named "${want}" (names: ${[...splitNames.values()].map((n) => n.full).join(", ")})`,
      });
    }
  }
  // Three flat decks in one well: the Starter deck is one tray with one compartment.
  const flat = withLayout(kit.harbourKingsFlat());
  const flatTrays = flat.layout.trays.filter(
    (t) => t.part === "tray" && t.key.startsWith("flatdeck:"),
  );
  if (flatTrays.length !== 1 || flatTrays[0]?.compartments.length !== 1) {
    failures.push({
      label: "harbour-kings-flat",
      first: 0,
      tried: [],
      text: `the Starter deck is ${flatTrays.length} tray(s) with ${flatTrays.map((t) => t.compartments.length).join(", ")} compartment(s), not one well`,
    });
  }

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
      ? noFit.misfitOf(
          result.bestAttempt,
          project.box,
          project.settings,
          project.components,
          project.groups ?? [],
        )
      : null;
  // The height story: a figure too tall for the box, so the closest attempt overhangs it.
  const noFitRun = tune(
    "harbour-kings-nofit (Heroes figure height)",
    80,
    (height) => kit.harbourKingsNoFit(base, height),
    (project, result) => {
      const m = misfitOf(project, result);
      return m?.name === "Heroes" && m.reason === "box" && noSliverTrays(result.bestAttempt.trays);
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
      "star-realms": { project: star },
      "harbour-kings-kit": { project: kitProject },
      "harbour-kings-kit-loose": { project: kitLoose },
      "harbour-kings-kit-split": { project: kitSplit },
      "harbour-kings-flat": { project: flat },
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
      `\nsearch seeds: kit ${kitProject.layout.seed}, headroom ${headroom.layout.seed}; final values: Heroes figure height ${noFitRun.count} mm (no fit, box), Heroes figures ${noFitBedRun.count} (no fit, bed), Hex tiles ${pinsRun.count} (pin conflict), sizing notices ${noticeCodes.length}`,
    );
  }
} finally {
  await loader.close();
}
