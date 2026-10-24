import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate, type PlacedLeftover, type PlacedTray } from "./fill";
import { boxReq, fakeMeasure, item, makeInput } from "./test-utils";
import { cut, leaf, SHARE_HALF } from "./tree";

// Owner, 2026-10-23: a spacer in the middle of a row splits it and makes the trays harder to take
// out, so the room left over lies at the box wall and the trays pack together.
describe("room left over goes to the wall", () => {
  const input = makeInput([boxReq("a", 40, 40, 10), boxReq("b", 40, 40, 10)], {
    box: { innerWidth: 200, innerDepth: 45 },
  });
  // the last step of planning: nothing here grows, so the room goes to the wall
  const ctx = createCtx(input, fakeMeasure);

  it("puts one spacer at the end of a row of two trays, not between them", () => {
    const plan = evaluate(ctx, {
      root: cut("x", leaf([item(0)]), leaf([item(1)]), SHARE_HALF),
      variants: [0, 0],
    });
    const [a, b] = [...plan.trays].sort((p, q) => p.x - q.x) as [PlacedTray, PlacedTray];
    expect(plan.leftovers).toHaveLength(1);
    expect(b.x).toBe(a.x + a.w + ctx.gap);
    const [s] = plan.leftovers as [PlacedLeftover];
    expect(s.x).toBeGreaterThanOrEqual(b.x + b.w);
    expect(s.x + s.w).toBe(ctx.floorW);
  });

  it("does so whatever share the search gave the cut", () => {
    for (const share of [0, SHARE_HALF, 1 << 20]) {
      const plan = evaluate(ctx, {
        root: cut("x", leaf([item(0)]), leaf([item(1)]), share),
        variants: [0, 0],
      });
      expect(plan.leftovers.map((l) => l.x + l.w)).toEqual([ctx.floorW]);
    }
  });
});

describe("room left over, once trays may grow", () => {
  const grow = { elastic: { w: true, d: false, h: false } };
  const input = makeInput([boxReq("a", 40, 40, 10, grow), boxReq("b", 40, 40, 10, grow)], {
    box: { innerWidth: 200, innerDepth: 45 },
  });
  const ctx = createCtx(input, fakeMeasure);

  it("is shared by the trays that grow: both are one size, with no spacer between or after", () => {
    const plan = evaluate(ctx, {
      root: cut("x", leaf([item(0)]), leaf([item(1)]), 0),
      variants: [0, 0],
    });
    const [a, b] = [...plan.trays].sort((p, q) => p.x - q.x) as [PlacedTray, PlacedTray];
    expect(plan.leftovers).toHaveLength(0);
    expect(Math.abs(a.w - b.w)).toBeLessThanOrEqual(1);
    expect(b.x + b.w).toBe(ctx.floorW);
  });
});
