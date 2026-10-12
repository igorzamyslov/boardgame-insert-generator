import { beforeAll, describe, expect, it } from "vitest";
import type { Notice, StoredLayout, TraySpec } from "../model/types";
import { optimize } from "./optimize";
import { checkHardRules, isDropped, isGuillotineTiling } from "./test-hard-rules";
import { boxReq, makeInput } from "./test-utils";
import type { LayoutResult } from "./types";

describe("isGuillotineTiling", () => {
  const region = { x: 0, y: 0, w: 1000, d: 500 };

  it("accepts exact tilings with the gap along every cut", () => {
    expect(isGuillotineTiling([region], region, 20)).toBe(true);
    expect(
      isGuillotineTiling(
        [
          { x: 0, y: 0, w: 490, d: 500 },
          { x: 510, y: 0, w: 490, d: 240 },
          { x: 510, y: 260, w: 490, d: 240 },
        ],
        region,
        20,
      ),
    ).toBe(true);
  });

  it("rejects holes, wrong gaps and overlaps", () => {
    expect(isGuillotineTiling([{ x: 0, y: 0, w: 900, d: 500 }], region, 20)).toBe(false);
    expect(
      isGuillotineTiling(
        [
          { x: 0, y: 0, w: 490, d: 500 },
          { x: 500, y: 0, w: 500, d: 500 },
        ],
        region,
        20,
      ),
    ).toBe(false);
    expect(
      isGuillotineTiling(
        [
          { x: 0, y: 0, w: 600, d: 500 },
          { x: 500, y: 0, w: 500, d: 500 },
        ],
        region,
        20,
      ),
    ).toBe(false);
  });
});

// Negative tests: each mutates a real optimizer output and must be caught by the checker.
describe("checkHardRules catches broken layouts", () => {
  const input = makeInput([boxReq("a", 60, 50, 20), boxReq("b", 60, 50, 20)], {
    box: { innerWidth: 300, innerDepth: 200, innerHeight: 40 },
  });
  let layout: StoredLayout;
  let notices: Notice[];
  beforeAll(() => {
    const result = optimize(input, 1, 2000);
    layout = result.layout as StoredLayout;
    notices = result.notices;
  });
  const mutate = (pick: (t: TraySpec) => boolean, f: (t: TraySpec) => TraySpec): StoredLayout => ({
    ...layout,
    trays: layout.trays.map((t) => (pick(t) ? f(t) : t)),
  });
  const bigLeftover = (t: TraySpec): boolean => t.part === "leftover" && t.w > 70 && t.d > 60;
  const mentions = (v: string[], text: string): boolean => v.some((s) => s.includes(text));

  it("passes the unmodified optimizer output", () => {
    expect(layout).toBeDefined();
    expect(checkHardRules(input, layout, notices)).toEqual([]);
  });

  it("flags a duplicate tray key even when its stack is otherwise valid", () => {
    const a = layout.trays.find((t) => t.key === "a:p0:0") as TraySpec;
    const dup = mutate(bigLeftover, (l) => ({
      ...a,
      path: "0101",
      x: l.x,
      y: l.y,
      w: l.w,
      d: l.d,
      h: l.h,
      stack: l.stack,
    }));
    expect(mentions(checkHardRules(input, dup, notices), "a:p0:0: duplicate tray key")).toBe(true);
  });

  it("flags a tray no requirement owns", () => {
    const a = layout.trays.find((t) => t.key === "a:p0:0") as TraySpec;
    const stray = mutate(bigLeftover, (l) => ({
      ...a,
      key: "zzz:p0:0",
      path: "0101",
      x: l.x,
      y: l.y,
      w: l.w,
      d: l.d,
      h: l.h,
      stack: l.stack,
    }));
    expect(
      mentions(checkHardRules(input, stray, notices), "zzz:p0:0: owned by no requirement"),
    ).toBe(true);
  });

  it("flags a leftover that does not start at z = 0 or pokes above the top plane", () => {
    const raised = mutate(
      (t) => t.part === "leftover",
      (t) => ({ ...t, z: 5 }),
    );
    expect(mentions(checkHardRules(input, raised, notices), "leftover")).toBe(true);
    expect(mentions(checkHardRules(input, raised, notices), "top plane")).toBe(true);
  });

  it("flags a leftover on a level above 0", () => {
    const up = mutate(
      (t) => t.part === "leftover",
      (t) => ({ ...t, level: 1 }),
    );
    expect(mentions(checkHardRules(input, up, notices), "leftover")).toBe(true);
  });

  describe("coverage and lip-off notices", () => {
    const loose = makeInput([boxReq("a", 60, 50, 20, { loose: true }), boxReq("b", 60, 50, 20)], {
      box: {
        innerWidth: 300,
        innerDepth: 200,
        innerHeight: 40,
        headroom: 5,
        headroomCoverage: "partial",
      },
    });
    let lr: LayoutResult;
    beforeAll(() => {
      lr = optimize(loose, 1, 2000);
    });

    it("requires layout.coverage for an uncovered loose tray under partial coverage", () => {
      expect(lr.notices.map((n) => n.code)).toContain("layout.coverage");
      expect(checkHardRules(loose, lr.layout as StoredLayout, lr.notices)).toEqual([]);
      const stripped = lr.notices.filter((n) => n.code !== "layout.coverage");
      expect(
        mentions(checkHardRules(loose, lr.layout as StoredLayout, stripped), "layout.coverage"),
      ).toBe(true);
    });

    const stackInput = makeInput([boxReq("a", 120, 80, 10), boxReq("b", 110, 70, 10)], {
      box: { innerWidth: 135, innerDepth: 95, innerHeight: 40 },
      settings: { lip: { enabled: false, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 } },
    });
    let sr: LayoutResult;
    beforeAll(() => {
      sr = optimize(stackInput, 1, 2000);
    });

    it("requires layout.lipOff when the lip is off and trays stack", () => {
      expect(sr.layout?.trays.some((t) => t.level > 0)).toBe(true);
      expect(checkHardRules(stackInput, sr.layout as StoredLayout, sr.notices)).toEqual([]);
      const stripped = sr.notices.filter((n) => n.code !== "layout.lipOff");
      expect(
        mentions(checkHardRules(stackInput, sr.layout as StoredLayout, stripped), "layout.lipOff"),
      ).toBe(true);
    });

    it("flags a lipOff notice that nothing asks for", () => {
      const extra = [
        ...notices,
        { level: "warning" as const, code: "layout.lipOff", message: "x" },
      ];
      expect(mentions(checkHardRules(input, layout, extra), "layout.lipOff")).toBe(true);
    });
  });
});

describe("isDropped", () => {
  it("matches the notice path of the lock's index, not its message", () => {
    const n = { level: "warning" as const, code: "lock.dropped", message: "x", path: "/locks/1" };
    expect(isDropped(1, [n])).toBe(true);
    expect(isDropped(0, [n])).toBe(false);
    // the same wording at another index does not make this lock dropped
    const same = { ...n, message: "Position lock on k was dropped: r.", path: "/locks/2" };
    expect(isDropped(0, [same])).toBe(false);
  });
});
