// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tinyBox from "../../test/fixtures/tiny-box.json";
import { MIN_FEATURE_MM, maxBottomChamfer } from "../model/settings";
import type { Component, Settings, TraySpec } from "../model/types";
import { SETTING_RANGES, settingsValid } from "../model/validate";
import { minOuter, realizeTray, rotateRealized, size } from "../sizing";
import type { RealizeOptions } from "../sizing/types";
import { loadManifold } from "./load";
import { checkPrintability } from "./printability";
import { bounds, signedVolume, topology } from "./test-mesh";
import { loadFixture, traySpecFrom } from "./test-specs";
import { buildTray } from "./tray";

// Real sizing output built into meshes: every sampled part, at its sizing
// minimum and 10 mm above it, lipped or not, at level 0 and 1, plain and
// rotated, plus the spacers, must come out as a closed, printable solid whose
// bounding box is the spec size.

const FIXTURES: [string, unknown][] = [
  ["cards-heavy", cardsHeavy],
  ["bits-heavy", bitsHeavy],
  ["tiles-minis", tilesMinis],
  ["tiny-box", tinyBox],
];

const WALL_MIN = SETTING_RANGES.find((r) => r.path === "wall")?.min ?? Number.NaN;

type Profile = (base: Settings) => Settings;

const PROFILES: [string, Profile][] = [
  ["fixture settings", (s) => s],
  [
    "thinnest wall, floor, lip and the largest chamfer",
    (s) => {
      const thin: Settings = {
        ...s,
        wall: WALL_MIN,
        floor: MIN_FEATURE_MM,
        divider: MIN_FEATURE_MM,
        lip: { ...s.lip, enabled: true, thickness: WALL_MIN, height: 1 },
      };
      return { ...thin, bottomChamfer: maxBottomChamfer(thin) };
    },
  ],
];

const OPTIONS: RealizeOptions[] = [
  { lipped: false, level: 0 },
  { lipped: true, level: 0 },
  { lipped: false, level: 1 },
  { lipped: true, level: 1 },
];

// Extra mm over minOuter on every axis.
const SLACKS = [0, 10];

// Every STRIDE-th part of a fixture is built; it keeps the run well under 15 s
// while still reaching every fixture, option, slack and the spacers.
const STRIDE = 6;

interface Tally {
  built: number;
  lipped: number;
  spacers: number;
  rotated: number;
  failures: string[];
}

function exercise(m: ManifoldToplevel, components: Component[], settings: Settings): Tally {
  const tally: Tally = { built: 0, lipped: 0, spacers: 0, rotated: 0, failures: [] };

  const check = (spec: TraySpec, where: string): void => {
    try {
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
      const top = spec.h + (spec.lip ? settings.lip.height : 0);
      const expected = [spec.w, spec.d, top];
      b.max.forEach((v, k) => {
        if (Math.abs(v - (expected[k] ?? 0)) > 1e-3 || Math.abs(b.min[k] ?? 1) > 1e-3) {
          problems.push(
            `bounding box ${b.min.join(",")}..${b.max.join(",")} vs ${expected.join(",")}`,
          );
        }
      });
      const report = checkPrintability(mesh);
      if (!report.ok) {
        problems.push(...report.problems);
      }
      tally.built += 1;
      tally.lipped += spec.lip ? 1 : 0;
      tally.spacers += spec.part === "spacer" ? 1 : 0;
      if (problems.length > 0) {
        tally.failures.push(`${where}: ${problems.join("; ")}`);
      }
    } catch (error) {
      tally.failures.push(`${where}: ${String(error)}`);
    }
  };

  let index = 0;
  const { requirements } = size(components, settings);
  for (const req of requirements) {
    for (const variant of req.variants) {
      for (const part of variant.parts) {
        index += 1;
        if (index % STRIDE !== 0) {
          continue;
        }
        for (const opts of OPTIONS) {
          const min = minOuter(part, settings, opts);
          for (const slack of SLACKS) {
            const outer = { w: min.w + slack, d: min.d + slack, h: min.h + slack };
            const where = `${variant.id} ${part.trayKey} ${JSON.stringify(opts)} +${slack}`;
            const realized = realizeTray(part, outer, settings, opts);
            check(traySpecFrom(realized, outer, opts, settings, part.trayKey), `${where} plain`);
            realized.spacers.forEach((sp) => check(sp, `${where} plain spacer`));
            const turned = rotateRealized(realized, outer);
            const turnedOuter = { w: outer.d, d: outer.w, h: outer.h };
            check(
              traySpecFrom(turned, turnedOuter, opts, settings, part.trayKey),
              `${where} rotated`,
            );
            tally.rotated += 1;
            turned.spacers.forEach((sp) => check(sp, `${where} rotated spacer`));
          }
        }
      }
    }
  }
  return tally;
}

let m: ManifoldToplevel;
let spacersBuilt = 0;
beforeAll(async () => {
  m = await loadManifold();
});

describe.each(FIXTURES)("buildTray builds sizing output of %s", (_name, raw) => {
  const { components, settings: base } = loadFixture(raw);

  it.each(PROFILES)("with %s", (_label, profile) => {
    const settings = profile(base);
    expect(settingsValid(settings), "profile settings are valid").toBe(true);
    const tally = exercise(m, components, settings);
    spacersBuilt += tally.spacers;
    expect(tally.failures.slice(0, 3)).toEqual([]);
    expect(tally.built).toBeGreaterThan(0);
    expect(tally.rotated).toBeGreaterThan(0);
    expect(tally.lipped).toBeGreaterThan(0);
  });
});

// Runs after the fixtures above (tests in a file run in order).
describe("the sampled sizing output covers spacers", () => {
  it("built spacers from at least one fixture", () => {
    expect(spacersBuilt).toBeGreaterThan(0);
  });
});
