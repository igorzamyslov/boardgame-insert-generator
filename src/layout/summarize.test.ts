import { describe, expect, it } from "vitest";
import { summarize } from "./summarize";
import { makeInput, traySpec } from "./test-utils";

describe("summarize", () => {
  const input = makeInput([], { box: { innerWidth: 201.2, innerDepth: 51, innerHeight: 20 } });

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
    expect(s.fillPct).toBe(round1(((2 * 100 * 50 * 20) / (200.2 * 50 * 20)) * 100));
    const g = (100 * 50 * 20 - 98 * 48 * 19 + 100 * 50 * 20 + 5 * 10 * 10) * 0.00124;
    expect(s.filamentG).toBe(round1(g));
    expect(s.playX).toBe(1.2);
    expect(s.playY).toBe(1);
    // two trays side by side: the 1.2 mm is 2 × 0.5 + 1 × 0.2
    expect(s.crossX).toBe(2);
    expect(s.crossY).toBe(1);
  });

  it("adds room left empty in a row to the play: the row lets a tray shift in it as well", () => {
    // the same two trays in a box 1.8 mm wider than they need, a gap too thin for any filler
    const wide = makeInput([], { box: { innerWidth: 203, innerDepth: 51, innerHeight: 20 } });
    const trays = [
      traySpec({ key: "a", x: 0, stack: 0 }),
      traySpec({ key: "b", x: 100.2, stack: 1 }),
    ];
    expect(summarize(trays, wide).playX).toBe(3);
    expect(summarize(trays, wide).playY).toBe(1);
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
