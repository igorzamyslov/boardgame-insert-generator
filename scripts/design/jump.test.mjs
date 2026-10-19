// scripts/design/jump.test.mjs
import { describe, expect, it } from "vitest";
import { JUMP_REGIONS, jumpProblems } from "./jump.mjs";

const box = (x, y, w, h) => ({ x, y, w, h });
const page = (over = {}) => ({
  header: box(0, 0, 1440, 61),
  rail: box(0, 61, 300, 839),
  status: box(337, 83, 1067, 60),
  "view-switch": box(1100, 85, 150, 50),
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

  it("lets a region named in sizeOnly move, and not change size", () => {
    const slid = page({ "plan-box": box(337, 153, 1067, 700) });
    expect(jumpProblems(page(), slid, { sizeOnly: ["plan-box"] })).toEqual([]);
    expect(jumpProblems(page(), slid)).toHaveLength(1);
    const smaller = page({ "plan-box": box(337, 153, 1067, 690) });
    expect(jumpProblems(page(), smaller, { sizeOnly: ["plan-box"] })).toEqual([
      "plan-box changed size: 337,143 1067×700 against 337,153 1067×690",
    ]);
  });

  it("still holds the other regions still when the plan's box may slide", () => {
    const problems = jumpProblems(
      page(),
      page({ "plan-box": box(337, 153, 1067, 700), status: box(337, 93, 1067, 60) }),
      { sizeOnly: ["plan-box"] },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^status moved/);
  });

  it("finds the plan's box by its data-region, with no fallback", () => {
    expect(JUMP_REGIONS["plan-box"]).toBe('[data-region="plan-box"]');
  });
});
