import { describe, expect, it } from "vitest";
import type { Component, Settings, TraySpec } from "../model/types";
import { settingsValid } from "../model/validate";
import { minOuter, realizeTray, rotateRealized, size } from "../sizing";
import { openSpacers } from "../layout/spacers";
import { planTray } from "./plan";
import {
  PROFILES,
  SWEEP_FIXTURES,
  SWEEP_OPTIONS,
  SWEEP_SLACKS,
  loadFixture,
  traySpecFrom,
} from "./test-specs";

// Real sizing output must always be buildable: planTray's limits (with their
// tolerance) have to accept every spec sitting exactly on a sizing minimum,
// for the default settings and for settings at the edges of their ranges.

interface Tally {
  planned: number;
  lipped: number;
  spacers: number;
  open: number;
  rotated: number;
  failures: string[];
}

function exercise(components: Component[], settings: Settings, label: string): Tally {
  const tally: Tally = { planned: 0, lipped: 0, spacers: 0, open: 0, rotated: 0, failures: [] };
  const check = (spec: TraySpec, where: string): void => {
    try {
      planTray(spec, settings);
      tally.planned++;
      tally.lipped += spec.lip ? 1 : 0;
      tally.spacers += spec.part === "spacer" ? 1 : 0;
      tally.open += spec.part === "spacer" && !spec.solid ? 1 : 0;
    } catch (error) {
      tally.failures.push(`${where}: ${String(error)}`);
    }
  };
  // A spacer is checked as stored (solid) and as printed (open where it can be).
  const checkSpacer = (sp: TraySpec, where: string): void => {
    check(sp, where);
    openSpacers([sp], { settings }).forEach((open) => check(open, `${where} (open)`));
  };
  const { requirements } = size(components, settings);
  for (const req of requirements) {
    for (const variant of req.variants) {
      for (const part of variant.parts) {
        for (const opts of SWEEP_OPTIONS) {
          const min = minOuter(part, settings, opts);
          for (const [dw, dd, dh] of SWEEP_SLACKS) {
            const outer = { w: min.w + dw, d: min.d + dd, h: min.h + dh };
            const where = `${label} ${variant.id} ${part.trayKey} ${JSON.stringify(opts)} +${dw}/${dd}/${dh}`;
            const realized = realizeTray(part, outer, settings, opts);
            check(traySpecFrom(realized, outer, opts, settings, part.trayKey), `${where} plain`);
            realized.spacers.forEach((sp) => checkSpacer(sp, `${where} plain spacer`));
            const turned = rotateRealized(realized, outer);
            const turnedOuter = { w: outer.d, d: outer.w, h: outer.h };
            check(
              traySpecFrom(turned, turnedOuter, opts, settings, part.trayKey),
              `${where} rotated`,
            );
            tally.rotated++;
            turned.spacers.forEach((sp) => checkSpacer(sp, `${where} rotated spacer`));
          }
        }
      }
    }
  }
  return tally;
}

describe.each(SWEEP_FIXTURES)("planTray accepts sizing output of %s", (_name, raw) => {
  const { components, settings: base } = loadFixture(raw);

  it.each(PROFILES)("with %s", { timeout: 60_000 }, (label, profile) => {
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
    const tallies = SWEEP_FIXTURES.map(([name, raw]) => {
      const { components, settings } = loadFixture(raw);
      return exercise(components, settings, name);
    });
    expect(tallies.reduce((a, t) => a + t.spacers, 0)).toBeGreaterThan(0);
    expect(
      tallies.reduce((a, t) => a + t.open, 0),
      "open spacers",
    ).toBeGreaterThan(0);
  });
});
