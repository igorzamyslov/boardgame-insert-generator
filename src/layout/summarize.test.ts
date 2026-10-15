import { describe, expect, it } from "vitest";
import {
  EXTRUSION_WIDTH_MM,
  PERIMETERS,
  PRINT_FLOW_MM3_PER_S,
  printMinutes,
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

  describe("merged fillers (mergeParts)", () => {
    // Two solid strips of one strip, in two leaves, 0.2 mm apart (the tray gap): one part.
    const strips = [
      traySpec({
        key: "leftover:0",
        part: "leftover",
        x: 0,
        y: 0,
        w: 10,
        d: 100,
        h: 20,
        solid: true,
      }),
      traySpec({
        key: "leftover:1",
        part: "leftover",
        x: 0,
        y: 100.2,
        w: 10,
        d: 80,
        h: 20,
        solid: true,
        stack: 1,
      }),
    ];
    const at = (s: Record<string, unknown>) =>
      makeInput([], { settings: { fillToTop: false, ...s } });

    it("counts the filler parts to place by hand, merged ones as one", () => {
      expect(summarize(strips, at({ mergeFillers: true })).fillerCount).toBe(1);
      expect(summarize(strips, at({ mergeFillers: false })).fillerCount).toBe(2);
      const none = [traySpec({ key: "a" })];
      expect(summarize(none, at({})).fillerCount).toBe(0);
      // the stored count does not change: fill and the tray count stay on the stored parts
      const merged = summarize(strips, at({ mergeFillers: true }));
      const alone = summarize(strips, at({ mergeFillers: false }));
      expect(merged.trayCount).toBe(alone.trayCount);
      expect(merged.fillPct).toBe(alone.fillPct);
    });

    it("records the switches the summary was made under", () => {
      const s = summarize(strips, at({ mergeFillers: false, mergeRisers: true }));
      expect([s.mergeFillers, s.mergeRisers]).toEqual([false, true]);
    });

    it("weighs the plastic of the strips plus the gap the part takes in, no more", () => {
      const merged = summarize(strips, at({ mergeFillers: true })).filamentG;
      const alone = summarize(strips, at({ mergeFillers: false })).filamentG;
      const gap = 0.2 * 80 * 20 * 0.00124; // the bridge outside the strips: the 0.2 mm between them
      expect(merged).toBeGreaterThanOrEqual(alone);
      expect(merged - alone).toBeLessThan(gap + 0.1);
      expect(merged - alone).toBeLessThan(1);
    });
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

  describe("print time", () => {
    const at = (infill: number) => makeInput([], { settings: { infill, fillToTop: false } });

    it("is the plastic volume divided by the nominal flow", () => {
      const block = traySpec({ part: "leftover", solid: true, w: 60, d: 60, h: 40 });
      const s = summarize([block], at(100));
      // 144 000 mm³ at 4 mm³/s = 36 000 s = 600 min
      expect(PRINT_FLOW_MM3_PER_S).toBe(4);
      expect(s.printMinutes).toBe(600);
      expect(s.printMinutes).toBe(printMinutes(60 * 60 * 40));
    });

    it("follows the estimate at the infill, not the upper bound", () => {
      const block = traySpec({ part: "leftover", solid: true, w: 60, d: 60, h: 40 });
      const core = (60 - 2.7) ** 2 * (40 - 2);
      const mm3 = 60 * 60 * 40 - core * 0.85;
      expect(summarize([block], at(15)).printMinutes).toBeCloseTo(mm3 / 4 / 60, 1);
      expect(summarize([block], at(15)).printMinutes).toBeLessThan(
        summarize([block], at(100)).printMinutes,
      );
    });

    it("adds the parts up and reports the longest one", () => {
      const big = traySpec({ key: "a", part: "leftover", solid: true, w: 60, d: 60, h: 40 });
      const small = traySpec({
        key: "b",
        part: "leftover",
        solid: true,
        w: 20,
        d: 20,
        h: 10,
        stack: 1,
        x: 70,
      });
      const both = summarize([big, small], {
        ...at(100),
        settings: { ...at(100).settings, mergeFillers: false },
      });
      expect(both.printMinutes).toBe(printMinutes(144_000 + 4_000));
      expect(both.longestPartMinutes).toBe(600);
    });

    it("is 0 for no parts", () => {
      const s = summarize([], at(15));
      expect([s.printMinutes, s.longestPartMinutes]).toEqual([0, 0]);
    });
  });

  it("records the play limit it was made under", () => {
    const s = summarize([traySpec({})], makeInput([], { settings: { playLimit: 2.25 } }));
    expect(s.playLimit).toBe(2.25);
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
