#!/usr/bin/env node
// scripts/make-legacy-fixtures.mjs
//
// Run once, with the 0.6 (schema 0.1.16) code, and kept for reference: it writes the projects the
// 0.7.0 migration tests start from into test/fixtures/legacy/, and the inputsHash of each into
// hashes.json. The schema history fixtures (test/fixtures/schema/0.1.*.json) all carry the group
// "setup" and `perPlayer`, and none has a stored layout; these have the stored layouts and the
// group texts and pins the migration has to carry (groups spec §4.2, R18, R19).
//
//   per-player.json     ungrouped, one item `perPlayer {players: 3}`, a stored layout, a pin on :p1:0
//   grouped-space.json  a group text "Player kit" (with a space) of two members, a stored layout,
//                       a position pin and a stack pin on its trays
//   combined.json       a stored layout whose variant is the combined one (":pall:" keys)
//   plain.json          no groups and no per-player
//
// It needs the pre-0.7 model: from 0.7.0 on `groupId` and `perPlayer` no longer exist, so the
// output is committed and this script is not meant to run again.
import { mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createModuleLoader } from "./design/viteModules.mjs";

const OUT = fileURLToPath(new URL("../test/fixtures/legacy/", import.meta.url));
const SEED = 7;
const ITERATIONS = 20_000;

const loader = await createModuleLoader();
try {
  const defaults = await loader.load("src/model/defaults.ts");
  const schema = await loader.load("src/model/schema.ts");
  const hash = await loader.load("src/model/hash.ts");
  const runner = await loader.load("src/app/runner.ts");
  const optimizeModule = await loader.load("src/layout/optimize.ts");

  const { optimize } = optimizeModule;

  function search(project) {
    return optimize(runner.buildLayoutInput(project), SEED, ITERATIONS, { timeCapMs: 60_000 });
  }

  function base(name, components, extra = {}) {
    return {
      ...defaults.newProject(),
      id: "legacy01",
      name,
      createdWith: "0.6.0",
      schemaVersion: "0.1.16",
      box: { ...defaults.DEFAULT_BOX, innerWidth: 290, innerDepth: 210, innerHeight: 60 },
      components,
      ...extra,
    };
  }

  const cards = (id, name, count, extra = {}) => ({
    id,
    name,
    access: "sometimes",
    kind: "cards",
    shortSide: 63.5,
    longSide: 88,
    decks: [{ name: "", count }],
    sleeve: "standard",
    thickness: { mode: "preset" },
    storage: "auto",
    ...extra,
  });
  const bulk = (id, name, extra = {}) => ({
    id,
    name,
    access: "sometimes",
    kind: "bulk",
    items: [{ name: "Cubes", count: 20, w: 12, d: 12, h: 12 }],
    ...extra,
  });

  /** Runs the search and stores its layout; refuses a run that finds none. */
  function withLayout(project) {
    const result = search(project);
    if (result.layout === null) {
      throw new Error(`${project.name}: no layout`);
    }
    if (result.lockConflicts.length > 0) {
      throw new Error(`${project.name}: pin conflicts ${JSON.stringify(result.lockConflicts)}`);
    }
    return { ...project, layout: result.layout };
  }

  function trayOf(project, keyPrefix) {
    const tray = project.layout.trays.find((t) => t.part === "tray" && t.key.startsWith(keyPrefix));
    if (tray === undefined) {
      throw new Error(`${project.name}: no tray ${keyPrefix}`);
    }
    return tray;
  }

  // plain: two ungrouped items.
  const plain = withLayout(
    base("Legacy plain", [cards("cards001", "Deck", 60), bulk("bulk0001", "Cubes")]),
  );

  // per-player: an item for 3 players, a pin on the second player's tray.
  const perPlayerFree = withLayout(
    base("Legacy per player", [
      cards("cards001", "Deck", 60),
      bulk("bits0001", "Player bits", { perPlayer: { players: 3 } }),
    ]),
  );
  const pinned = trayOf(perPlayerFree, "bits0001:p1:0");
  const perPlayer = withLayout({
    ...perPlayerFree,
    locks: [{ kind: "position", trayKey: pinned.key, path: pinned.path, rotated: pinned.rotated }],
  });

  // grouped-space: group "Player kit", two members, a position pin and a stack pin.
  const kitFree = withLayout(
    base("Legacy grouped", [
      cards("cards001", "Deck", 60),
      cards("kitcard1", "Hero cards", 20, { groupId: "Player kit", access: "often" }),
      bulk("kitbits1", "Hero bits", { groupId: "Player kit", access: "sometimes" }),
      bulk("spare001", "Spare cubes"),
    ]),
  );
  const kitTray = trayOf(kitFree, "Player kit:p0:0");
  const otherTray = trayOf(kitFree, "cards001:p0:0");
  const grouped = withLayout({
    ...kitFree,
    locks: [
      { kind: "position", trayKey: kitTray.key, path: kitTray.path, rotated: kitTray.rotated },
      { kind: "stack", trayKeys: [kitTray.key, otherTray.key] },
    ],
  });

  // combined: a stored layout of the "combined" per-player variant. Pinning a tray of it picks the
  // variant; the pin is dropped afterwards and the layout keeps the hash of the unpinned project.
  const combinedFree = base("Legacy combined", [
    cards("cards001", "Deck", 60),
    bulk("bits0001", "Player bits", { perPlayer: { players: 3 } }),
  ]);
  const combinedKey = "bits0001:pall:0";
  let combined = null;
  for (const path of ["", "0", "1", "00", "01", "10", "11"]) {
    for (const rotated of [false, true]) {
      const result = search({
        ...combinedFree,
        locks: [{ kind: "position", trayKey: combinedKey, path, rotated }],
      });
      if (
        result.layout !== null &&
        result.lockConflicts.length === 0 &&
        result.layout.trays.some((t) => t.key.includes(":pall:"))
      ) {
        combined = {
          ...combinedFree,
          layout: { ...result.layout, inputsHash: hash.inputsHash(combinedFree) },
        };
        break;
      }
    }
    if (combined !== null) {
      break;
    }
  }
  if (combined === null) {
    throw new Error("combined: no run chose the combined variant");
  }

  const fixtures = {
    "plain.json": plain,
    "per-player.json": perPlayer,
    "grouped-space.json": grouped,
    "combined.json": combined,
  };
  mkdirSync(OUT, { recursive: true });
  const hashes = {};
  for (const [file, project] of Object.entries(fixtures)) {
    const text = schema.serializeProject(project, schema.noForeign());
    writeFileSync(`${OUT}${file}`, text.endsWith("\n") ? text : `${text}\n`);
    hashes[file.replace(/\.json$/, "")] = hash.inputsHash(project);
    const keys = project.layout.trays.map((t) => t.key).join(", ");
    console.log(`${file}: hash ${hashes[file.replace(/\.json$/, "")]} trays ${keys}`);
  }
  writeFileSync(`${OUT}hashes.json`, `${JSON.stringify(hashes, null, 2)}\n`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await loader.close();
}
