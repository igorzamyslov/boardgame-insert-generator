// scripts/design/jump.test.mjs
import { describe, expect, it } from "vitest";
import { jumpProblems } from "./jump.mjs";

const box = (x, y, w, h) => ({ x, y, w, h });
const page = (over = {}) => ({
  header: box(0, 0, 1440, 61),
  rail: box(0, 61, 300, 839),
  status: box(337, 83, 1067, 60),
  "plan-box": box(337, 143, 1067, 700),
  ...over,
});

describe("jumpProblems", () => {
  it("finds nothing when the regions stay put", () => {
    expect(jumpProblems(page(), page())).toEqual([]);
  });

  it("allows a pixel of difference, not two", () => {
    expect(jumpProblems(page(), page({ status: box(337.5, 83, 1067, 60.9) }))).toEqual([]);
    expect(jumpProblems(page(), page({ status: box(337, 83, 1067, 62) }))).toEqual([
      "status moved: 337,83 1067×60 against 337,83 1067×62",
    ]);
  });

  it("names the region that moved", () => {
    const moved = jumpProblems(page(), page({ "plan-box": box(337, 183, 1067, 700) }));
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatch(/^plan-box moved/);
  });

  it("says when a region is in only one state, and when in neither", () => {
    expect(jumpProblems(page(), page({ rail: null }))).toEqual([
      "rail: in only one of the two states",
    ]);
    expect(jumpProblems(page({ rail: null }), page({ rail: null }))).toEqual([
      "rail: in neither state (nothing compared)",
    ]);
  });
});
