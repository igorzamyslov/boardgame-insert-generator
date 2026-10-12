import { describe, expect, it, vi } from "vitest";
import * as plan from "../geometry/plan";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { CompartmentSpec } from "../model/types";
import { assertTrayInvariants, at } from "./test-helpers";
import type { RealizedTray } from "./types";

// planTray itself refuses a post under 3 mm; here it is mocked to return a plan that hides one,
// so the helper's own check of the compartment a cut runs into is what must catch it.
vi.mock("../geometry/plan", async (importOriginal) => {
  const actual = await importOriginal<typeof plan>();
  return { ...actual, planTray: vi.fn(actual.planTray) };
});

const well: CompartmentSpec = {
  x: 1.6,
  y: 1.6,
  w: 20,
  d: 40,
  floorZ: 1.2,
  kind: "well",
  contents: "Deck",
  features: [{ type: "wallCutout", side: "right", at: 21.6, width: 10, depth: 10, floorNotch: 0 }],
};
const spare = (y: number): CompartmentSpec => ({
  x: 22.8,
  y,
  w: 20,
  d: 16,
  floorZ: 1.2,
  kind: "spare",
  contents: "Spare",
  features: [],
});

describe("assertTrayInvariants: the posts of the compartment a cut runs into (review 3, M3)", () => {
  it("rejects a cut that leaves under 3 mm of post in the compartment it runs into", () => {
    // The deck's right cut (16.6…26.6 along y) runs across the divider into a spare.
    const tray = (spareY: number): RealizedTray => ({
      wall: 1.6,
      compartments: [well, spare(spareY)],
      spacers: [],
    });
    const outer = { w: 44.4, d: 43.2, h: 30 };
    const ground = { lipped: false, level: 0 };
    assertTrayInvariants(tray(13.6), outer, DEFAULT_SETTINGS, ground);
    // The spare 1 mm higher: its face is 2 mm beside the cut. The valid plan, with the spare moved.
    const valid = plan.planTray(
      {
        key: "posts",
        part: "tray",
        path: "",
        stack: 0,
        level: 0,
        x: 0,
        y: 0,
        z: 0,
        ...outer,
        rotated: false,
        wall: 1.6,
        floor: 1.2,
        lip: false,
        solid: false,
        compartments: tray(13.6).compartments,
      },
      DEFAULT_SETTINGS,
    );
    const b = at(valid.compartments, 1);
    vi.mocked(plan.planTray).mockReturnValue({
      ...valid,
      compartments: [at(valid.compartments, 0), { ...b, rect: { ...b.rect, y0: 14.6, y1: 30.6 } }],
    });
    expect(() => assertTrayInvariants(tray(14.6), outer, DEFAULT_SETTINGS, ground)).toThrow(
      /compartment 0 \(Deck\) right cutout posts in compartment 1/,
    );
  });
});
