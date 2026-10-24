// src/layout/topArea.test.ts
// "Keep space free on top → Part of it" with a size: the paper's rectangle lies in a corner, the
// stacks under it stop at the low plane (filled to it), and every other stack reaches the lid.
import { describe, expect, it } from "vitest";
import { effective, lidPlane, topPlane } from "../model/settings";
import type { Box, TraySpec } from "../model/types";
import { optimize } from "./optimize";
import { checkHardRules } from "./test-hard-rules";
import { boxReq, makeInput } from "./test-utils";
import type { LayoutInput } from "./types";

const AREA_BOX: Partial<Box> = {
  innerWidth: 300,
  innerDepth: 200,
  innerHeight: 60,
  headroom: 12,
  headroomCoverage: "partial",
  headroomAreas: [{ w: 140, d: 100 }],
};

const reqs = () => [
  boxReq("tall1", 140, 90, 45),
  boxReq("tall2", 140, 90, 45),
  boxReq("tall3", 100, 90, 45),
  boxReq("low1", 120, 80, 20),
  boxReq("low2", 120, 80, 25),
];

function plan(box: Partial<Box> = AREA_BOX, requirements = reqs()) {
  const input = makeInput(requirements, { box });
  const result = optimize(input, 1, 4000);
  return { input, result, layout: result.layout };
}

/** The top of the stack a part belongs to: the highest z + h among the parts of its stack. */
function stackTops(trays: readonly TraySpec[]): Map<number, number> {
  const tops = new Map<number, number>();
  for (const t of trays) {
    tops.set(t.stack, Math.max(tops.get(t.stack) ?? 0, t.z + t.h));
  }
  return tops;
}

const touches = (a: { x: number; y: number; w: number; d: number }, b: typeof a): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

describe("a kept-free area is placed by the layout", () => {
  it("finds a layout, with the area's place stored", () => {
    const { layout } = plan();
    expect(layout).not.toBeNull();
    expect(layout?.reserved).toHaveLength(1);
    const r = layout?.reserved?.[0];
    expect(r?.area).toBe(0);
    expect(r?.name).toBe("Rulebook");
    // the person's 140 × 100, either way round
    expect([r?.w, r?.d]).toSatisfy((wd: number[]) => {
      const [w, d] = wd;
      return (w === 140 && d === 100) || (w === 100 && d === 140);
    });
  });

  it("lies in a corner of the floor", () => {
    const { layout, input } = plan();
    const r = layout?.reserved?.[0];
    expect(r).toBeDefined();
    if (!r) {
      return;
    }
    const clearance = effective(input.settings).boxClearance;
    const floorW = input.box.innerWidth - 2 * clearance;
    const floorD = input.box.innerDepth - 2 * clearance;
    const atX = r.x === 0 || Math.abs(r.x + r.w - floorW) < 0.05;
    const atY = r.y === 0 || Math.abs(r.y + r.d - floorD) < 0.05;
    expect(atX && atY).toBe(true);
  });

  it("stops every stack under it at the low plane and reaches the lid elsewhere", () => {
    const { layout, input } = plan();
    const trays = layout?.trays ?? [];
    const r = layout?.reserved?.[0];
    expect(r).toBeDefined();
    if (!r) {
      return;
    }
    const low = topPlane(input.box, input.settings);
    const lid = lidPlane(input.box, input.settings);
    expect(lid - low).toBeCloseTo(12, 5);
    const tops = stackTops(trays);
    let under = 0;
    let elsewhere = 0;
    for (const [stack, top] of tops) {
      const parts = trays.filter((t) => t.stack === stack && t.level === 0);
      const isUnder = parts.some((t) => touches(t, r));
      if (isUnder) {
        under++;
        // a flat top at one height, under the paper
        expect(top).toBeLessThanOrEqual(low + 0.11);
      } else {
        elsewhere++;
        expect(top).toBeLessThanOrEqual(lid + 0.11);
      }
    }
    expect(under).toBeGreaterThan(0);
    expect(elsewhere).toBeGreaterThan(0);
    // somewhere a stack goes above the paper's plane: that is the volume the area gives back
    expect(Math.max(...tops.values())).toBeGreaterThan(low + 0.5);
  });

  it("leaves nothing under the paper below its plane", () => {
    const { layout, input } = plan();
    const trays = layout?.trays ?? [];
    const r = layout?.reserved?.[0];
    if (!r) {
      throw new Error("no area stored");
    }
    const low = topPlane(input.box, input.settings);
    const tops = stackTops(trays);
    for (const t of trays.filter((x) => x.level === 0 && touches(x, r))) {
      expect(tops.get(t.stack)).toBeGreaterThan(low - 0.5);
    }
  });

  it("passes the engine's hard rules", () => {
    const { layout, input, result } = plan();
    expect(layout).not.toBeNull();
    if (layout) {
      expect(checkHardRules(input, layout, result.notices)).toEqual([]);
    }
  });

  it("is deterministic", () => {
    const a = plan().layout;
    const b = plan().layout;
    expect(b).toEqual(a);
  });
});

describe("without an area, nothing changes", () => {
  const whole: Partial<Box> = { ...AREA_BOX, headroomAreas: undefined };

  it("keeps the whole top for 'Part of it' with no size", () => {
    const { layout, input } = plan(whole, [boxReq("a", 100, 80, 20), boxReq("b", 90, 80, 30)]);
    expect(layout?.reserved).toBeUndefined();
    const low = topPlane(input.box, input.settings);
    expect(Math.max(...(layout?.trays ?? []).map((t) => t.z + t.h))).toBeLessThanOrEqual(
      low + 0.11,
    );
  });

  it("ignores the areas of a box that keeps the whole top", () => {
    const full: Partial<Box> = { ...AREA_BOX, headroomCoverage: "full" };
    const { layout } = plan(full, [boxReq("a", 100, 80, 20)]);
    expect(layout?.reserved).toBeUndefined();
  });
});

describe("the area is part of what a fit means", () => {
  it("does not fit what needs the lid under the paper everywhere", () => {
    // four stacks 55 mm tall in a 300 × 200 box with a 200 × 190 area: nowhere to stand them but under it
    const box: Partial<Box> = { ...AREA_BOX, headroomAreas: [{ w: 280, d: 190 }] };
    const { result } = plan(box, [boxReq("t1", 130, 90, 55), boxReq("t2", 130, 90, 55)]);
    expect(result.layout).toBeNull();
  });

  it("an area wider than the floor is not placed", () => {
    const box: Partial<Box> = { ...AREA_BOX, headroomAreas: [{ w: 400, d: 300 }] };
    const { layout } = plan(box, [boxReq("a", 100, 80, 20)]);
    expect(layout?.reserved).toBeUndefined();
  });
});

describe("a stored plan keeps its area when it is improved", () => {
  it("warm starts with the area where it was", () => {
    const first = plan();
    const input: LayoutInput = first.input;
    const again = optimize(input, 2, 500, { warmStart: first.layout ?? undefined });
    expect(again.layout?.reserved?.[0]).toMatchObject({
      x: first.layout?.reserved?.[0]?.x,
      y: first.layout?.reserved?.[0]?.y,
    });
  });
});

describe("the coverage warning with an area", () => {
  const loose = (key: string) => boxReq(key, 120, 90, 30, { loose: true });

  it("names the area, and does not count the trays under the paper as exposed", () => {
    const { result, layout } = plan(AREA_BOX, [loose("a"), loose("b"), loose("c"), loose("d")]);
    expect(layout).not.toBeNull();
    const notice = result.notices.find((n) => n.code === "layout.coverage");
    expect(notice?.message).toContain("Rulebook covers only some of the top layer");
    // the trays named are the ones outside the paper: at most all four minus the ones under it
    const named = ["a", "b", "c", "d"].filter((k) => notice?.message.includes(`${k}:`)).length;
    expect(named).toBeLessThan(4);
  });

  it("says nothing when the paper covers every loose tray", () => {
    const { result } = plan(AREA_BOX, [loose("a")]);
    expect(result.notices.find((n) => n.code === "layout.coverage")).toBeUndefined();
  });
});
