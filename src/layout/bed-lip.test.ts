import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { optimize } from "./optimize";
import { bedLipInput } from "./test-fixtures";
import { checkHardRules } from "./test-hard-rules";
import { boxReq, makeInput } from "./test-utils";
import { toMm } from "./units";
import { bedNotices } from "./warnings";

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

// A lipped tray prints h + lip.height tall (the lip is part of the printed part), so the bed's
// Z limit applies to that, in the engine, the warnings and the checker alike.
describe("the lip counts toward the bed height", () => {
  const stacked = (innerHeight: number, bedZ = 60) =>
    makeInput(
      [
        boxReq("a", 120, 80, 20, { elastic: { w: true, d: true, h: true } }),
        boxReq("b", 110, 70, 20, { elastic: { w: true, d: true } }),
      ],
      {
        box: { innerWidth: 140, innerDepth: 100, innerHeight },
        printer: { bedZ },
        locks: [{ kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] }],
      },
    );

  it("a stack whose lipped bottom tray would print above the bed is not kept", () => {
    const fits = optimize(stacked(78), 1, 2000);
    expect(fits.notices.some((n) => n.code === "lock.dropped")).toBe(false);
    // 58.8 mm of tray plus the 2 mm lip is 60.8 mm: the lock gives way (the flipped stack fits)
    const tooTall = optimize(stacked(80), 1, 2000);
    expect(tooTall.notices.some((n) => n.code === "lock.dropped")).toBe(true);
    // nothing fits at all
    const hopeless = optimize(stacked(83), 1, 2000);
    expect(hopeless.layout).toBeNull();
    expect(hopeless.notices.some((n) => n.code === "layout.doesNotFit")).toBe(true);
  });

  it("every feasible layout prints within the bed height, lip included", () => {
    for (let h = 70; h <= 82; h++) {
      const input = stacked(h);
      const r = optimize(input, 1, 2000);
      for (const t of r.layout?.trays ?? []) {
        expect(t.h + (t.lip ? input.settings.lip.height : 0)).toBeLessThanOrEqual(60);
      }
    }
  });

  it("bedNotices says a part whose lip makes it too tall can only stand on top or alone", () => {
    const req = boxReq("t", 40, 40, 30);
    const probe = makeInput([req]);
    const lipped = createCtx(probe).metrics({ req: 0, variant: 0, part: 0 }, true, 0);
    // the bed is as tall as the lipped part's body, so only the lip's 2 mm is too much
    const input = makeInput([req], { printer: { bedZ: toMm(lipped.h) } });
    const notice = bedNotices(createCtx(input)).find((n) => n.code === "layout.bed");
    expect(notice?.level).toBe("warning");
    expect(notice?.message).toContain('"t" fits the bed only with nothing stacked on it');
    expect(notice?.message).toContain("as a lower tray (lipped walls and lip)");
  });

  it("the checker rejects a lipped tray whose lip pokes above the bed", () => {
    const input = stacked(78);
    const r = optimize(input, 1, 2000);
    const bottom = r.layout?.trays.find((t) => t.key === "a:p0:0");
    expect(bottom?.lip).toBe(true);
    // bed height between the tray's body and its lip
    const low = makeInput(input.requirements, {
      box: input.box,
      printer: { bedZ: (bottom?.h ?? 0) + 1 },
      locks: input.locks,
    });
    expect(checkHardRules(low, r.layout ?? emptyLayout(), r.notices).join("\n")).toContain(
      "does not fit the print bed",
    );
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
