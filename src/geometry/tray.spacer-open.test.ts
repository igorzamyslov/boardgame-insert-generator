// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { openSpacers } from "../layout/spacers";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { TraySpec } from "../model/types";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { problemsOf } from "./test-build";
import { notchedSpacer } from "./test-specs";
import { buildTray } from "./tray";

// An open spacer (openSpacers) is built from a stored spacer at any size sizing can make one,
// narrow ones included, with and without a finger notch, and it is lighter than the solid block.
let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

const settings = DEFAULT_SETTINGS;
const solidSpacer = (o: Partial<TraySpec>): TraySpec => ({ ...notchedSpacer, features: [], ...o });
const opened = (spec: TraySpec): TraySpec => openSpacers([spec], { settings })[0] as TraySpec;

const buildable = (spec: TraySpec): boolean => {
  try {
    planTray(spec, settings);
    return true;
  } catch {
    return false;
  }
};

describe("an open spacer builds", () => {
  const lengths = [14, 15, 30, 60, 178];
  const depths = [14, 16.82, 30, 56.8, 92.5];
  const heights = [6.2, 9.7, 20, 63];
  const notches: TraySpec["features"][] = [
    [],
    [{ type: "spacerNotch", axis: "x", at: 8.41, width: 10.82, depth: 4 }],
    [{ type: "spacerNotch", axis: "x", at: 28.4, width: 20, depth: 12 }],
  ];

  it("as a closed, printable solid of its size, over lengths, depths, heights and notches", () => {
    let hollow = 0;
    const failures: string[] = [];
    for (const w of lengths) {
      for (const d of depths) {
        for (const h of heights) {
          for (const features of notches) {
            const at = d / 2;
            const fitted = features?.map((f) => (f.type === "spacerNotch" ? { ...f, at } : f));
            const block = solidSpacer({ w, d, h, features: fitted });
            // only a spacer sizing could make: one whose notch the solid block accepts
            if (!buildable(block)) {
              continue;
            }
            const spec = opened(block);
            if (spec.solid) {
              continue;
            }
            hollow += 1;
            try {
              const problems = problemsOf(m, spec, settings);
              if (problems.length > 0) {
                failures.push(`${w}x${d}x${h} ${JSON.stringify(fitted)}: ${problems.join("; ")}`);
              }
            } catch (error) {
              failures.push(`${w}x${d}x${h} ${JSON.stringify(fitted)}: ${String(error)}`);
            }
          }
        }
      }
    }
    expect(failures.slice(0, 3), `${failures.length} of ${hollow} failed`).toEqual([]);
    expect(hollow).toBeGreaterThan(40);
  });

  it("as one 14 mm wide and one turned the other way, the narrowest that opens", () => {
    for (const [w, d] of [
      [14, 90],
      [90, 14],
    ] as const) {
      const spec = opened(solidSpacer({ w, d, h: 30 }));
      expect(spec.solid).toBe(false);
      expect(problemsOf(m, spec, settings)).toEqual([]);
    }
  });

  it("with less plastic than the solid block, and a closed pocket volume that adds up", () => {
    const block = solidSpacer({ w: 178, d: 16.82, h: 9.7 });
    const open = opened(block);
    const a = buildTray(m, block, settings).volumeMm3;
    const b = buildTray(m, open, settings).volumeMm3;
    expect(b).toBeLessThan(a * 0.5);
    expect(b).toBeGreaterThan(0.2 * a);
  });
});
