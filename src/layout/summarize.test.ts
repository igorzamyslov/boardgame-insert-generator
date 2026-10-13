import { describe, expect, it } from "vitest";
import { summarize } from "./summarize";
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

  it("returns 0 fill for a box with no usable height", () => {
    expect(summarize([], makeInput([], { box: { headroom: 60 } })).fillPct).toBe(0);
  });
});

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
