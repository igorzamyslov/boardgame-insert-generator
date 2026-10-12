import { describe, expect, it } from "vitest";
import { optimize } from "./optimize";
import { bedLipInput } from "./test-fixtures";
import { checkHardRules } from "./test-hard-rules";
import { boxReq, makeInput } from "./test-utils";

// Captured regressions (test/fixtures/layout-bed-lip.json): parts that fit the print bed plain
// but not with the locating lip's thicker walls cannot carry a tray above them.
describe("parts the lip makes too big for the bed", () => {
  it("case1: a feasible box is found on the seeds that used to fail (1, 2)", () => {
    const input = bedLipInput("case1");
    for (const seed of [1, 2]) {
      const r = optimize(input, seed, 50_000);
      expect(r.layout).not.toBeNull();
      expect(checkHardRules(input, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
    }
  });

  for (const [name, tray] of [
    ["case0", "r2c0"],
    ["case3", "r4c0"],
  ] as const) {
    it(`${name}: genuinely too small; says so with the shortfall, naming the tray that can only stand alone`, () => {
      const r = optimize(bedLipInput(name), 1, 50_000);
      expect(r.layout).toBeNull();
      const sf = r.bestAttempt?.shortfall;
      expect((sf?.x ?? 0) + (sf?.y ?? 0) + (sf?.z ?? 0)).toBeGreaterThan(0);
      const dnf = r.notices.find((n) => n.code === "layout.doesNotFit")?.message ?? "";
      expect(dnf).toContain("too small by");
      expect(dnf).not.toContain("Some trays don't fit");
      const bed = r.notices.find((n) => n.code === "layout.bed");
      expect(bed?.level).toBe("warning");
      expect(bed?.message).toContain(tray);
      expect(bed?.message).toContain("on its own");
      expect(bed?.message).toContain("turn off the locating lip");
    });
  }

  it("names the tray that is over the bed", () => {
    const board = boxReq("board", 300, 40, 10);
    const r = optimize(
      makeInput([board], {
        box: { innerWidth: 400, innerDepth: 300, innerHeight: 60 },
        printer: { bedX: 200, bedY: 200 },
      }),
      1,
      500,
    );
    expect(r.layout).toBeNull();
    const dnf = r.notices.find((n) => n.code === "layout.doesNotFit")?.message ?? "";
    expect(dnf).toContain('"board"');
    expect(dnf).toContain("usable bed is 190.0 × 190.0 mm");
    expect(dnf).toContain("larger bed");
  });
});

function emptyLayout() {
  return {
    createdWith: "",
    geometryVersion: "",
    inputsHash: "",
    seed: 0,
    iterations: 0,
    capped: false,
    trays: [],
  };
}
