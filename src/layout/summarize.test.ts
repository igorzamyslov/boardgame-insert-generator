import { describe, expect, it } from "vitest";
import {
  EXTRUSION_WIDTH_MM,
  PERIMETERS,
  SOLID_LAYERS,
  shellThickness,
  summarize,
} from "./summarize";
import { makeInput, traySpec } from "./test-utils";

describe("summarize", () => {
  const input = makeInput([], { box: { innerWidth: 201.4, innerDepth: 51, innerHeight: 20 } });

  it("computes fill, counts, filament and play", () => {
    const trays = [
      traySpec({
        key: "a",
        x: 0,
        stack: 0,
        compartments: [
          { x: 1, y: 1, w: 98, d: 48, floorZ: 1, kind: "well", contents: "", features: [] },
        ],
      }),
      traySpec({ key: "leftover:0", part: "leftover", x: 100.2, stack: 1, solid: true }),
      traySpec({ key: "a:spacer", part: "spacer", path: "", w: 5, d: 10, h: 10, solid: true }),
    ];
    const s = summarize(trays, input);
    expect(s.trayCount).toBe(2);
    expect(s.stackCount).toBe(2);
    expect(s.fillPct).toBe(round1(((2 * 100 * 50 * 20) / (200.4 * 50 * 20)) * 100));
    const g = (100 * 50 * 20 - 98 * 48 * 19 + 100 * 50 * 20 + 5 * 10 * 10) * 0.00124;
    expect(s.filamentG).toBe(round1(g));
    expect(s.playX).toBe(1.2);
    expect(s.playY).toBe(1);
    // two trays side by side: the 1.2 mm is 2 × 0.5 + 1 × 0.2
    expect(s.crossX).toBe(2);
    expect(s.crossY).toBe(1);
  });

  it("adds the lip ring to the filament estimate", () => {
    const plain = summarize([traySpec({ solid: false })], input).filamentG;
    const lipped = summarize([traySpec({ lip: true })], input).filamentG;
    const ring = (100 * 50 - 97.6 * 47.6) * 2 * 0.00124;
    expect(lipped).toBeCloseTo(plain + ring, 1);
  });

  describe("filament at infill", () => {
    // fillToTop off: nothing is split into a riser, so these test the stored geometry as it is
    const at = (infill: number) => makeInput([], { settings: { infill, fillToTop: false } });
    const g = (trays: ReturnType<typeof traySpec>[], infill: number) =>
      summarize(trays, at(infill)).filamentAtInfillG;
    const thinTray = traySpec({
      compartments: [
        { x: 1.6, y: 1.6, w: 96.8, d: 46.8, floorZ: 1.2, kind: "well", contents: "", features: [] },
      ],
    });

    it("derives the shell from perimeters and solid layers", () => {
      expect(shellThickness(0.2)).toEqual({
        side: PERIMETERS * EXTRUSION_WIDTH_MM,
        vertical: SOLID_LAYERS * 0.2,
      });
    });

    it("keeps the solid upper bound whatever the infill", () => {
      const solid = summarize([thinTray], at(100)).filamentG;
      expect(summarize([thinTray], at(5)).filamentG).toBe(solid);
      expect(summarize([thinTray], at(100)).filamentAtInfillG).toBe(solid);
      expect(summarize([thinTray], at(15)).infillPct).toBe(15);
    });

    it("barely moves for a thin-walled tray between 100 % and 15 %", () => {
      // 1.2 mm floor is under two shells (2 mm), so the floor slab is solid
      expect(g([thinTray], 15)).toBe(g([thinTray], 100));
    });

    it("drops substantially for a thick solid filler block", () => {
      const block = traySpec({ part: "leftover", solid: true, w: 60, d: 60, h: 40 });
      const solid = g([block], 100);
      const light = g([block], 15);
      expect(light).toBeLessThan(solid * 0.4);
      // exact: core (60-2.7)^2 (40-2) mm³ at 15 %
      const core = (60 - 2.7) ** 2 * (40 - 2);
      const expected = (60 * 60 * 40 - core * 0.85) * 0.00124;
      expect(light).toBeCloseTo(expected, 1);
    });

    it("counts a region thinner than two shells fully solid", () => {
      // thin in X: 2.6 < 2 × 1.35
      const slab = traySpec({ part: "leftover", solid: true, w: 2.6, d: 80, h: 40 });
      expect(g([slab], 0)).toBe(g([slab], 100));
      // thin in Z: 1.9 < 2 × 1.0
      const plate = traySpec({ part: "leftover", solid: true, w: 80, d: 80, h: 1.9 });
      expect(g([plate], 0)).toBe(g([plate], 100));
    });

    it("erodes only the raised-floor slab under a compartment of a hollow tray", () => {
      const raised = traySpec({
        compartments: [
          { x: 1.6, y: 1.6, w: 60, d: 40, floorZ: 11.2, kind: "well", contents: "", features: [] },
        ],
      });
      const drop = g([raised], 100) - g([raised], 15);
      const core = (60 - 2.7) * (40 - 2.7) * (11.2 - 2);
      expect(drop).toBeCloseTo(core * 0.85 * 0.00124, 1);
    });

    it("counts a spacer solid, since it prints as thin plates", () => {
      const spacer = traySpec({ part: "spacer", solid: true, w: 60, d: 60, h: 40 });
      expect(g([spacer], 15)).toBe(g([spacer], 100));
    });
  });

  describe("raised floors print as risers", () => {
    const raised = traySpec({
      h: 40,
      compartments: [
        {
          x: 1.6,
          y: 1.6,
          w: 96.8,
          d: 46.8,
          floorZ: 21.2,
          kind: "well",
          contents: "",
          features: [],
        },
      ],
    });
    const withLeftover = (leftover: "spare" | "solid", fillToTop = true) =>
      makeInput([], { settings: { leftover, fillToTop } });

    it("estimates far less plastic when the riser is open than when it is solid", () => {
      const open = summarize([raised], withLeftover("spare"));
      const solid = summarize([raised], withLeftover("solid"));
      expect(open.filamentG).toBeLessThan(solid.filamentG * 0.4);
      // a solid block is already light at 15 %, so the gap there is smaller than at 100 %
      expect(open.filamentAtInfillG).toBeLessThan(solid.filamentAtInfillG * 0.8);
    });

    it("keeps the raised floor solid when nothing is split (fillToTop off)", () => {
      const off = summarize([raised], withLeftover("spare", false));
      const solid = summarize([raised], withLeftover("solid"));
      expect(off.filamentG).toBeGreaterThan(solid.filamentG * 0.9);
    });

    it("leaves the fill, tray count and stack count as they are", () => {
      const a = summarize([raised], withLeftover("spare"));
      const b = summarize([raised], withLeftover("spare", false));
      expect(a.fillPct).toBe(b.fillPct);
      expect(a.trayCount).toBe(1);
      expect(a.stackCount).toBe(1);
    });
  });

  it("returns 0 fill for a box with no usable height", () => {
    expect(summarize([], makeInput([], { box: { headroom: 60 } })).fillPct).toBe(0);
  });
});

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
