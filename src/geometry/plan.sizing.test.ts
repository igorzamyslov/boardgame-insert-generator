import { describe, expect, it } from "vitest";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tinyBox from "../../test/fixtures/tiny-box.json";
import { MIN_FEATURE_MM, maxBottomChamfer } from "../model/settings";
import type { Component, Settings, TraySpec } from "../model/types";
import { SETTING_RANGES, settingsValid } from "../model/validate";
import { minOuter, realizeTray, rotateRealized, size } from "../sizing";
import type { RealizeOptions } from "../sizing/types";
import { planTray } from "./plan";
import { loadFixture, traySpecFrom } from "./test-specs";

// Real sizing output must always be buildable: planTray's limits (with their
// tolerance) have to accept every spec sitting exactly on a sizing minimum,
// for the default settings and for settings at the edges of their ranges.

const FIXTURES: [string, unknown][] = [
  ["cards-heavy", cardsHeavy],
  ["bits-heavy", bitsHeavy],
  ["tiles-minis", tilesMinis],
  ["tiny-box", tinyBox],
];

type Profile = (base: Settings) => Settings;

// The thinnest valid wall (SETTING_RANGES).
const WALL_MIN = SETTING_RANGES.find((r) => r.path === "wall")?.min ?? Number.NaN;

// Settings at the SETTING_RANGES extremes. Each is checked to be valid, so the
// chamfer profiles sit exactly on maxBottomChamfer.
const PROFILES: [string, Profile][] = [
  ["fixture settings", (s) => s],
  [
    "thinnest wall, floor and divider",
    (s) => ({ ...s, wall: WALL_MIN, floor: MIN_FEATURE_MM, divider: MIN_FEATURE_MM }),
  ],
  ["no chamfer", (s) => ({ ...s, bottomChamfer: 0 })],
  ["largest chamfer", (s) => ({ ...s, bottomChamfer: maxBottomChamfer(s) })],
  [
    "largest chamfer, thin wall and floor",
    (s) => {
      const thin = { ...s, wall: WALL_MIN, floor: MIN_FEATURE_MM };
      return { ...thin, bottomChamfer: maxBottomChamfer(thin) };
    },
  ],
  [
    "largest chamfer, wall and floor 1.2",
    (s) => {
      const even = { ...s, wall: 1.2, floor: 1.2 };
      return { ...even, bottomChamfer: maxBottomChamfer(even) };
    },
  ],
  [
    "largest chamfer, thick wall and floor",
    (s) => {
      const thick = { ...s, wall: 3, floor: 3 };
      return { ...thick, bottomChamfer: Math.min(3, maxBottomChamfer(thick)) };
    },
  ],
  ["lip height 1", (s) => ({ ...s, lip: { ...s.lip, enabled: true, height: 1 } })],
  ["lip thickness 0.8", (s) => ({ ...s, lip: { ...s.lip, enabled: true, thickness: 0.8 } })],
  [
    "three decimals",
    (s) => ({
      ...s,
      wall: 1.234,
      floor: 1.001,
      divider: 0.999,
      bottomChamfer: 0.333,
      fingerPocket: { width: 22.001, reach: 12.003 },
      lip: { ...s.lip, enabled: true, height: 2.001, thickness: 1.003, ledge: 1.707 },
    }),
  ],
];

const OPTIONS: RealizeOptions[] = [
  { lipped: false, level: 0 },
  { lipped: true, level: 0 },
  { lipped: false, level: 1 },
  { lipped: true, level: 1 },
];

// Extra mm over minOuter per axis: uniform, one axis at a time, and a hair.
const SLACKS: [number, number, number][] = [
  [0, 0, 0],
  [10, 10, 10],
  [5, 0, 0],
  [0, 5, 0],
  [0, 0, 5],
  [0.01, 0.01, 0.01],
];

interface Tally {
  planned: number;
  lipped: number;
  spacers: number;
  rotated: number;
  failures: string[];
}

function exercise(components: Component[], settings: Settings, label: string): Tally {
  const tally: Tally = { planned: 0, lipped: 0, spacers: 0, rotated: 0, failures: [] };
  const check = (spec: TraySpec, where: string): void => {
    try {
      planTray(spec, settings);
      tally.planned++;
      tally.lipped += spec.lip ? 1 : 0;
      tally.spacers += spec.part === "spacer" ? 1 : 0;
    } catch (error) {
      tally.failures.push(`${where}: ${String(error)}`);
    }
  };
  const { requirements } = size(components, settings);
  for (const req of requirements) {
    for (const variant of req.variants) {
      for (const part of variant.parts) {
        for (const opts of OPTIONS) {
          const min = minOuter(part, settings, opts);
          for (const [dw, dd, dh] of SLACKS) {
            const outer = { w: min.w + dw, d: min.d + dd, h: min.h + dh };
            const where = `${label} ${variant.id} ${part.trayKey} ${JSON.stringify(opts)} +${dw}/${dd}/${dh}`;
            const realized = realizeTray(part, outer, settings, opts);
            check(traySpecFrom(realized, outer, opts, settings, part.trayKey), `${where} plain`);
            realized.spacers.forEach((sp) => check(sp, `${where} plain spacer`));
            const turned = rotateRealized(realized, outer);
            const turnedOuter = { w: outer.d, d: outer.w, h: outer.h };
            check(
              traySpecFrom(turned, turnedOuter, opts, settings, part.trayKey),
              `${where} rotated`,
            );
            tally.rotated++;
            turned.spacers.forEach((sp) => check(sp, `${where} rotated spacer`));
          }
        }
      }
    }
  }
  return tally;
}

describe.each(FIXTURES)("planTray accepts sizing output of %s", (_name, raw) => {
  const { components, settings: base } = loadFixture(raw);

  it.each(PROFILES)("with %s", (label, profile) => {
    const settings = profile(base);
    expect(settingsValid(settings), "profile settings are valid").toBe(true);
    const tally = exercise(components, settings, label);
    expect(tally.failures.slice(0, 3)).toEqual([]);
    expect(tally.planned).toBeGreaterThan(0);
    expect(tally.rotated).toBeGreaterThan(0);
    expect(tally.lipped).toBeGreaterThan(0);
  });
});

describe("the sizing fixtures cover spacers", () => {
  it("plans spacers from at least one fixture", () => {
    const spacers = FIXTURES.map(([name, raw]) => {
      const { components, settings } = loadFixture(raw);
      return exercise(components, settings, name).spacers;
    });
    expect(spacers.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});
