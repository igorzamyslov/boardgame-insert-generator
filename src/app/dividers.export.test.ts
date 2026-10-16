// @vitest-environment node
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildTray, loadManifold } from "../geometry";
import { optimize, printableParts } from "../layout";
import { FIXTURES } from "../layout/test-fixtures";
import { inputsHash } from "../model/hash";
import { noForeign, parseProject } from "../model/schema";
import { encodeHash, decodeHash } from "../share/link";
import { size } from "../sizing";
import { buildCombined3mf, buildPartsZip, buildStlZip, planExport } from "./exportBuild";

// A project that uses dividers, end to end: laid out, listed as printable parts, built into real
// meshes, exported three ways, saved and shared through a link, and the same parts back out.
const raw = FIXTURES["cards-heavy"] as unknown as Record<string, unknown> & {
  box: Record<string, unknown>;
  components: Record<string, unknown>[];
};

function divided() {
  const parsed = parseProject({
    ...raw,
    box: { ...raw.box, innerWidth: 150, innerDepth: 110, innerHeight: 120 },
    components: [
      {
        ...(raw.components[0] as Record<string, unknown>),
        decks: [{ name: "Action", count: 60 }],
        storage: "upright-long",
        growth: { stack: "max" },
        dividers: 3,
      },
    ],
  });
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

const parts = (p: ReturnType<typeof divided>) =>
  printableParts(p.layout.trays, {
    components: p.components,
    settings: p.settings,
    printer: p.printer,
    locks: p.locks,
  }).trays;

describe("a project with dividers", () => {
  it("builds every part, dividers included, and exports them numbered after their tray", async () => {
    const p = divided();
    const m = await loadManifold();
    const plan = planExport(parts(p));
    expect(plan.skipped).toEqual([]);
    const labels = plan.parts.map((x) => x.label);
    expect(labels.filter((l) => l.startsWith("Divider"))).toEqual([
      "Divider 1",
      "Divider 2",
      "Divider 3",
    ]);
    // each divider is numbered straight after the tray it stands in
    const tray = plan.parts.find((x) => x.spec.part === "tray");
    const dividers = plan.parts.filter((x) => x.spec.part === "divider");
    expect(dividers.map((x) => x.number)).toEqual([1, 2, 3].map((k) => (tray?.number ?? 0) + k));
    expect(dividers.every((x) => x.parentNumber === tray?.number)).toBe(true);
    const options = {
      getMesh: (spec: Parameters<typeof buildTray>[1]) =>
        Promise.resolve(buildTray(m, spec, p.settings)),
      onProgress: () => undefined,
      yieldToUi: () => Promise.resolve(),
    };
    const zip = await buildPartsZip(plan.parts, options);
    expect(zip.failed).toEqual([]);
    expect(zip.included).toBe(plan.parts.length);
    const files = Object.keys(unzipSync(zip.data));
    expect(files.filter((f) => /Divider/.test(f))).toHaveLength(3);
    const stl = await buildStlZip(plan.parts, options);
    expect(stl.failed).toEqual([]);
    expect(Object.keys(unzipSync(stl.data)).filter((f) => /Divider/.test(f))).toHaveLength(3);
    const combined = await buildCombined3mf(plan.parts, { x: 246, y: 246 }, options);
    expect(combined.failed).toEqual([]);
    expect(combined.included).toBe(plan.parts.length);
  });

  it("round-trips through a share link and prints the same parts", () => {
    const p = divided();
    const link = encodeHash(p, noForeign());
    const back = decodeHash(link);
    if (!back.ok) {
      throw new Error(back.error);
    }
    expect({ ...back.project, createdWith: p.createdWith }).toEqual(p);
    expect(parts({ ...p, ...back.project, layout: back.project.layout ?? p.layout })).toEqual(
      parts(p),
    );
  });
});
