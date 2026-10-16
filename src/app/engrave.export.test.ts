// @vitest-environment node
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildTray, loadManifold } from "../geometry";
import { optimize, printableParts } from "../layout";
import { FIXTURES } from "../layout/test-fixtures";
import { trayNames } from "../instructions/naming";
import { numberParts } from "../instructions/numbering";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import { size } from "../sizing";
import { buildPartsZip, planExport } from "./exportBuild";

// The closest automated stand-in for opening an export in a 3MF viewer: a real fixture project,
// laid out, named, built into meshes with and without the engraving, and exported. The visual
// check of the lettering in a viewer is left to a person.
function named() {
  const parsed = parseProject(FIXTURES["cards-heavy"]);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const p = parsed.project;
  const { requirements } = size(p.components, p.settings);
  const { layout } = optimize(
    {
      requirements,
      box: p.box,
      printer: p.printer,
      settings: p.settings,
      locks: p.locks,
      inputsHash: inputsHash(p),
      appVersion: "0.0.0-test",
    },
    1,
    20_000,
  );
  if (!layout) {
    throw new Error("no layout");
  }
  return { ...p, layout };
}

describe("an export of a named fixture project", () => {
  it("engraves each tray's short name: the engraved mesh has less material than the plain one", async () => {
    const p = named();
    const m = await loadManifold();
    const trays = printableParts(p.layout.trays, {
      components: p.components,
      settings: p.settings,
      printer: p.printer,
      locks: p.locks,
    }).trays;
    const plan = planExport(trays);
    expect(plan.skipped).toEqual([]);
    const names = trayNames(numberParts(trays), p.components);
    const shorts = plan.parts.map((x) => names.get(x.spec.key)?.short ?? "");
    expect(shorts.every((s) => /^[A-Za-z0-9 -]{1,10}$/.test(s))).toBe(true);
    expect(new Set(shorts.map((s) => s.toUpperCase())).size).toBe(shorts.length);
    const asked: (string | undefined)[] = [];
    const volumes: number[] = [];
    const plainVolumes: number[] = [];
    const options = {
      names,
      engrave: true,
      getMesh: (spec: Parameters<typeof buildTray>[1]) => {
        asked.push(spec.partName);
        const built = buildTray(m, spec, p.settings);
        volumes.push(built.volumeMm3);
        plainVolumes.push(buildTray(m, { ...spec, partName: undefined }, p.settings).volumeMm3);
        return Promise.resolve(built);
      },
      onProgress: () => undefined,
      yieldToUi: () => Promise.resolve(),
    };
    const zip = await buildPartsZip(plan.parts, options);
    expect(zip.failed).toEqual([]);
    // every tray asked for its own name; at least one has room for it and is cut into
    const plates = new Set(["spacer", "divider"]);
    expect(asked).toEqual(
      plan.parts.map((x) => (plates.has(x.spec.part) ? undefined : names.get(x.spec.key)?.short)),
    );
    const cut = volumes.filter((v, i) => v < (plainVolumes[i] ?? 0));
    expect(cut.length).toBeGreaterThan(0);
    // files are called by the tray names
    const files = Object.keys(unzipSync(zip.data));
    expect(files).toHaveLength(plan.parts.length);
    expect(files.some((f) => /^\d/.test(f))).toBe(false);
  });
});
