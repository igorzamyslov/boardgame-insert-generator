// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { SPEC_TOLERANCE } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import { settingsValid } from "../model/validate";
import { minOuter, realizeTray, rotateRealized, size } from "../sizing";
import { loadManifold } from "./load";
import { checkPrintability } from "./printability";
import { bounds, signedVolume, topology } from "./test-mesh";
import { thinnestWedge } from "./test-wedge";
import {
  FIXTURE_SETTINGS,
  SWEEP_FIXTURES,
  SWEEP_OPTIONS,
  THINNEST,
  loadFixture,
  traySpecFrom,
} from "./test-specs";
import type { Profile } from "./test-specs";
import { buildTray } from "./tray";

// Real sizing output built into meshes: every part of every variant of every
// fixture, under the fixture settings and under the thinnest walls with the
// largest chamfer, must come out as a closed, printable solid whose bounding
// box is the spec size, and so must its spacers. Each part is built at every
// lip and level option; the slack over minOuter and the rotation rotate with
// the part's index, so every combination is reached while the run stays well
// under 15 s.

const MESH_PROFILES: [string, Profile][] = [
  ["fixture settings", FIXTURE_SETTINGS],
  ["thinnest wall, floor, lip and the largest chamfer", THINNEST],
];

// Extra mm over minOuter on every axis (meshes are costly, so one axis value per build).
const SLACKS = [0, 10, 30];

interface Selected {
  spec: TraySpec;
  where: string;
}

interface Selection {
  settings: Settings;
  specs: Selected[];
}

const selections = new Map<string, Selection>();

// The specs one fixture and profile builds: each part at every lip and level option, with the
// slack and the rotation picked by the part's and the option's index, then that tray's spacers.
// Sized once per fixture and profile, then shared by the build and the coverage tests.
function selection(fixture: string, raw: unknown, [label, profile]: [string, Profile]): Selection {
  const key = `${fixture}|${label}`;
  const cached = selections.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const { components, settings: base } = loadFixture(raw);
  const settings = profile(base);
  const specs: Selected[] = [];
  let index = 0;
  for (const req of size(components, settings).requirements) {
    for (const variant of req.variants) {
      for (const part of variant.parts) {
        SWEEP_OPTIONS.forEach((opts, k) => {
          const slack = SLACKS[(index + k) % SLACKS.length] ?? 0;
          const rotated = (index + k) % 2 === 1;
          const min = minOuter(part, settings, opts);
          const outer = { w: min.w + slack, d: min.d + slack, h: min.h + slack };
          const where = `${variant.id} ${part.trayKey} ${JSON.stringify(opts)} +${slack}${rotated ? " rotated" : ""}`;
          const plain = realizeTray(part, outer, settings, opts);
          const realized = rotated ? rotateRealized(plain, outer) : plain;
          const placed = rotated ? { w: outer.d, d: outer.w, h: outer.h } : outer;
          const tray = traySpecFrom(realized, placed, opts, settings, part.trayKey);
          specs.push({ spec: { ...tray, rotated }, where });
          realized.spacers.forEach((sp) => specs.push({ spec: sp, where: `${where} spacer` }));
        });
        index += 1;
      }
    }
  }
  const result = { settings, specs };
  selections.set(key, result);
  return result;
}

// Everything wrong with the mesh of `spec`, or [] when it is a closed, printable solid of the
// spec's size.
function problemsOf(m: ManifoldToplevel, spec: TraySpec, settings: Settings): string[] {
  const { mesh, volumeMm3 } = buildTray(m, spec, settings);
  const problems: string[] = [];
  const topo = topology(mesh);
  if (!topo.closed || topo.genus !== 0) {
    problems.push(`not a closed genus-0 solid (closed ${topo.closed}, genus ${topo.genus})`);
  }
  if (!(volumeMm3 > 0) || Math.abs(signedVolume(mesh) - volumeMm3) > 1) {
    problems.push(`volume ${volumeMm3} (mesh ${signedVolume(mesh)})`);
  }
  const b = bounds(mesh);
  const expected = [spec.w, spec.d, spec.h + (spec.lip ? settings.lip.height : 0)];
  const off = b.max.some(
    (v, k) => Math.abs(v - (expected[k] ?? 0)) > 1e-3 || Math.abs(b.min[k] ?? 1) > 1e-3,
  );
  if (off) {
    problems.push(`bounding box ${b.min.join(",")}..${b.max.join(",")} vs ${expected.join(",")}`);
  }
  const report = checkPrintability(mesh);
  if (!report.ok) {
    problems.push(...report.problems);
  }
  const wedge = thinnestWedge(spec, settings);
  if (wedge.width < 0.8 - 0.01) {
    problems.push(`${wedge.width.toFixed(3)} mm wedge at ${wedge.where}`);
  }
  return problems;
}

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

describe.each(SWEEP_FIXTURES)("buildTray builds the sizing output of %s", (name, raw) => {
  it.each(MESH_PROFILES)("with %s", { timeout: 60_000 }, (label, profile) => {
    const { settings, specs } = selection(name, raw, [label, profile]);
    expect(settingsValid(settings), "profile settings are valid").toBe(true);
    let built = 0;
    let rotated = 0;
    const failures: string[] = [];
    for (const { spec, where } of specs) {
      try {
        const problems = problemsOf(m, spec, settings);
        if (problems.length > 0) {
          failures.push(`${where}: ${problems.join("; ")}`);
          continue;
        }
        built += 1;
        rotated += spec.rotated && spec.part === "tray" ? 1 : 0;
      } catch (error) {
        failures.push(`${where}: ${String(error)}`);
      }
    }
    expect(failures.slice(0, 3), `${failures.length} of ${specs.length} specs failed`).toEqual([]);
    expect(built).toBe(specs.length);
    expect(rotated).toBeGreaterThan(0);
  });
});

describe("the built sizing output covers", () => {
  let specs: TraySpec[] = [];
  let trays: TraySpec[] = [];
  let compartments: { tray: TraySpec; c: TraySpec["compartments"][number] }[] = [];
  beforeAll(() => {
    specs = SWEEP_FIXTURES.flatMap(([name, raw]) =>
      MESH_PROFILES.flatMap((profile) => selection(name, raw, profile).specs.map((s) => s.spec)),
    );
    trays = specs.filter((s) => s.part === "tray");
    compartments = trays.flatMap((s) => s.compartments.map((c) => ({ tray: s, c })));
  });

  it.each(["well", "pocket", "spare", "scoop"])("compartment kind %s", (kind) => {
    expect(compartments.some(({ c }) => c.kind === kind)).toBe(true);
  });

  it.each(["fingerPocket", "scoop", "cornerRelief"])("feature %s", (type) => {
    expect(compartments.some(({ c }) => c.features.some((f) => f.type === type))).toBe(true);
  });

  it("raised floors, lipped, unlipped, upper and rotated trays, and spacers", () => {
    expect(
      compartments.some(({ tray, c }) => c.floorZ > tray.floor + SPEC_TOLERANCE),
      "raised floor",
    ).toBe(true);
    expect(trays.some((s) => s.lip)).toBe(true);
    expect(trays.some((s) => !s.lip)).toBe(true);
    expect(trays.some((s) => s.level > 0)).toBe(true);
    expect(trays.some((s) => s.rotated)).toBe(true);
    expect(specs.some((s) => s.part === "spacer")).toBe(true);
  });
});
