import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { stackLevels } from "./stack";
import { cut, leaf } from "./tree";
import { boxReq, item, makeInput } from "./test-utils";

// A stack's shared room (trays set to "As much as fits" split its spare height) is spare height up
// to the stack's own top plane: the low plane under a kept-free area, the lid elsewhere. Combined
// from two changes that each passed alone (the area over part of the box, the shared room).

const bin = (key: string) => boxReq(key, 50, 40, 10, { elastic: { h: true }, loose: true });
const BOX = {
  innerWidth: 300,
  innerDepth: 200,
  innerHeight: 80,
  headroom: 20,
  headroomCoverage: "partial" as const,
  headroomAreas: [{ w: 120, d: 80 }],
};

describe("the shared room of a stack under a kept-free area", () => {
  const ctx = createCtx(makeInput([bin("a"), bin("b"), bin("c"), bin("d")], { box: BOX }));
  const plan = evaluate(ctx, {
    root: cut("x", leaf([item(0), item(1)]), leaf([item(2), item(3)])),
    variants: [0, 0, 0, 0],
    reserve: [0],
  });
  const stack = (under: boolean) =>
    plan.trays.filter((t) => t.under === under).sort((x, y) => x.z - y.z);
  const levels = stackLevels(ctx, [item(0), item(1)]);

  it("stands the stack under the area at the low plane, the other at the lid", () => {
    expect(ctx.topPlane - ctx.lowPlane).toBeGreaterThan(0);
    const under = stack(true);
    const rest = stack(false);
    expect(under).toHaveLength(2);
    expect(rest).toHaveLength(2);
    expect(Math.max(...under.map((t) => t.z + t.h))).toBe(ctx.lowPlane);
    expect(Math.max(...rest.map((t) => t.z + t.h))).toBe(ctx.topPlane);
  });

  it("shares the room it has under the area between its trays, in whole layers", () => {
    const [a, b] = stack(true);
    const grown = (t: typeof a, k: number) => (t?.h ?? 0) - (levels[k]?.minH ?? 0);
    expect(grown(a, 0)).toBeGreaterThan(0);
    expect(grown(b, 1)).toBeGreaterThan(0);
    expect(Math.abs(grown(a, 0) - grown(b, 1))).toBeLessThanOrEqual(ctx.layer);
  });

  it("shares what the other stack has up to the lid, which is more", () => {
    const [a, b] = stack(false);
    const [c, d] = stack(true);
    expect((a?.h ?? 0) + (b?.h ?? 0)).toBeGreaterThan((c?.h ?? 0) + (d?.h ?? 0));
    expect(Math.abs((a?.h ?? 0) - (b?.h ?? 0))).toBeLessThanOrEqual(ctx.layer);
  });
});
