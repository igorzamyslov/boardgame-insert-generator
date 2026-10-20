import { beforeAll, describe, expect, it } from "vitest";
import { GEOMETRY_VERSION } from "../geometry/version";
import { DEFAULT_SETTINGS, effective } from "../model/settings";
import { minOuter } from "../sizing";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { bedLipInput, fixtureInput, TIGHT_FIXTURES, type TightFixtureName } from "./test-fixtures";
import { checkHardRules } from "./test-hard-rules";
import { materialize } from "./materialize";
import { createRun, DEFAULT_ITERATIONS, optimize } from "./optimize";
import { boxReq, comp, makeInput, part, req, variant } from "./test-utils";
import type { StoredLayout } from "../model/types";
import type { LayoutResult } from "./types";
import { warmHints, warmTree } from "./warmstart";

const reqs = [
  boxReq("a", 120, 80, 20),
  boxReq("b", 90, 80, 20, { access: "often" }),
  boxReq("c", 60, 40, 15, { elastic: { w: true, d: true, h: true }, loose: true }),
  boxReq("d", 70, 50, 25),
];
const input = makeInput(reqs, { box: { innerWidth: 280, innerDepth: 200, innerHeight: 60 } });

// A 103.2 × 63.2 mm tray in a 106.2 × 63.25 mm floor: 3 mm of slack along X, a 0.05 mm sliver along Y.
describe("leaf slack: a filler part, or thicker walls only when the user allows them", () => {
  const run = (wallAbsorb: number) => {
    const inp = makeInput([boxReq("a", 100, 60, 20)], {
      box: { innerWidth: 107.2, innerDepth: 64.25, innerHeight: 60 },
      settings: { wallAbsorb },
    });
    const r = optimize(inp, 1, 500);
    const trays = r.layout?.trays ?? [];
    expect(r.layout).not.toBeNull();
    return {
      tray: trays.find((t) => t.part === "tray"),
      leftovers: trays.filter((t) => t.part === "leftover"),
    };
  };

  it("prints a filler by default instead of thickening the walls", () => {
    const { tray, leftovers } = run(0);
    expect(tray).toMatchObject({ w: 103.2, wall: 1.6 });
    expect(leftovers.map((l) => l.w)).toEqual([2.8]);
  });

  it("absorbs the slack into thicker walls once wallAbsorb covers it, and not before", () => {
    // Two walls each take wallAbsorb: 2 × 1.4 = 2.8 mm is under the 3 mm, 2 × 1.6 = 3.2 is over.
    expect(run(1.4).leftovers).toHaveLength(1);
    const absorbed = run(1.6);
    expect(absorbed.leftovers).toEqual([]);
    expect(absorbed.tray?.w).toBe(106.2);
  });

  it("absorbs a gap too small to be a part even with wallAbsorb 0", () => {
    // The 0.05 mm of depth slack never becomes a leftover.
    expect(run(0).tray?.d).toBe(63.25);
    expect(run(0).leftovers.every((l) => l.d > 60)).toBe(true);
  });
});

describe("optimize", () => {
  it("returns a feasible StoredLayout that satisfies every hard rule", () => {
    const r = optimize(input, 1, 3000);
    expect(r.layout).not.toBeNull();
    expect(r.bestAttempt).toBeNull();
    expect(r.summary?.trayCount).toBe(r.layout?.trays.filter((t) => t.part !== "spacer").length);
    expect(r.layout).toMatchObject({
      createdWith: "0.0.0-test",
      geometryVersion: GEOMETRY_VERSION,
      inputsHash: "test-hash",
      seed: 1,
      iterations: 3000,
      capped: false,
    });
    expect(checkHardRules(input, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
  });

  it("is deterministic: same seed + iterations → deep-equal result", () => {
    expect(optimize(input, 42, 2500)).toEqual(optimize(input, 42, 2500));
  });

  it("reports progress per chunk and stops when cancelled", () => {
    const done: number[] = [];
    optimize(input, 3, 3000, { onProgress: (d) => done.push(d) });
    expect(done).toEqual([1000, 2000, 3000]);
    let calls = 0;
    const r = optimize(input, 3, 5000, { shouldCancel: () => ++calls >= 2 });
    expect(calls).toBe(2);
    expect(r.layout?.capped).toBe(true);
  });

  it("stops at the time cap and marks the result capped", () => {
    const r = optimize(input, 5, 5000, { timeCapMs: 0 });
    expect(r.layout?.capped).toBe(true);
    expect(r.layout?.iterations).toBe(1000);
    expect(r.notices.map((n) => n.code)).toContain("layout.capped");
  });

  it("uses a clock injected into createRun", () => {
    let t = 0;
    const run = createRun(input, 5, 5000, { timeCapMs: 10, now: () => (t += 6) });
    expect(run.step()).toBe(false);
    expect(run.step()).toBe(true);
    expect(run.result().layout?.capped).toBe(true);
  });

  it("warm start reproduces the previous layout exactly (tree, shares, positions)", () => {
    const first = optimize(input, 9, 2000);
    const prev = first.layout;
    expect(prev).not.toBeNull();
    if (!prev) {
      return;
    }
    const ctx = createCtx(input);
    const hints = warmHints(ctx, prev.trays);
    const tree = warmTree(
      ctx,
      prev.trays,
      reqs.map(() => null),
      hints,
    );
    expect(tree).not.toBeNull();
    if (tree) {
      expect(materialize(ctx, evaluate(ctx, tree))).toEqual(prev.trays);
    }
    const again = optimize(input, 9, 0, { warmStart: prev });
    expect(again.layout?.trays).toEqual(prev.trays);
    expect(again.layout?.iterations).toBe(2000);
  });

  it("keeps the seed, counts iterations cumulatively and is deterministic with a warm start", () => {
    const prev = optimize(input, 11, 1000).layout ?? undefined;
    const a = optimize(input, 11, 2000, { warmStart: prev });
    const b = optimize(input, 11, 2000, { warmStart: prev });
    expect(a).toEqual(b);
    expect(a.layout?.seed).toBe(11);
    // `iterations` is this run's budget; the stored count is cumulative ("improve more").
    expect(a.layout?.iterations).toBe(1000 + 2000);
  });

  it("respects a position lock or drops it with a notice", () => {
    const prev = optimize(input, 2, 2000).layout;
    const t = prev?.trays.find((x) => x.key === "a:p0:0");
    expect(t).toBeDefined();
    if (!prev || !t) {
      return;
    }
    const locked = {
      ...input,
      locks: [{ kind: "position" as const, trayKey: "a:p0:0", path: t.path, rotated: t.rotated }],
    };
    const r = optimize(locked, 2, 2000, { warmStart: prev });
    expect(r.layout).not.toBeNull();
    expect(checkHardRules(locked, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
    expect(r.layout?.trays.find((x) => x.key === "a:p0:0")?.path).toBe(t.path);
  });

  it("reports locks that make the box infeasible and lays out without them", () => {
    const tall = [
      boxReq("p", 140, 90, 20, { rotatable: false }),
      boxReq("q", 140, 90, 20, { rotatable: false }),
    ];
    const box = { innerWidth: 150, innerDepth: 190, innerHeight: 30 };
    const locks = [
      { kind: "position" as const, trayKey: "p:p0:0", path: "0", rotated: false },
      { kind: "position" as const, trayKey: "q:p0:0", path: "1", rotated: false },
    ];
    const r = optimize(makeInput(tall, { box, locks }), 1, 1000);
    expect(r.layout).not.toBeNull();
    expect(r.lockConflicts.map((c) => c.trayKey)).toEqual(["p:p0:0", "q:p0:0"]);
    expect(r.lockConflicts[0]?.reason).toBe("the pins together leave no layout that fits");
  });

  it("reports pins that conflict up front without searching", () => {
    const locks = [{ kind: "position" as const, trayKey: "ghost:p0:0", path: "0", rotated: false }];
    const input = makeInput([boxReq("a", 50, 50, 20)], { locks });
    const run = createRun(input, 1, 5000);
    expect(run.step()).toBe(true);
    expect(run.done).toBe(0);
    const r = run.result();
    expect(r.layout).toBeNull();
    expect(r.bestAttempt).toBeNull();
    expect(r.notices).toEqual([]);
    expect(r.lockConflicts).toEqual([
      expect.objectContaining({ trayKey: "ghost:p0:0", kind: "position" }),
    ]);
  });

  // Review focus: a single requirement filling exactly the whole box.
  it("fills a box exactly with one tray and no leftovers", () => {
    const one = [boxReq("only", 100, 60, 30)];
    const m = minOuter(
      one[0]?.variants[0]?.parts[0] ?? {
        trayKey: "",
        arrangement: "strip",
        compartments: [],
        rotatable: true,
      },
      DEFAULT_SETTINGS,
      { lipped: false, level: 0 },
    );
    const bc = effective(DEFAULT_SETTINGS).boxClearance;
    const exact = makeInput(one, {
      box: {
        innerWidth: Math.ceil(m.w * 100) / 100 + 2 * bc,
        innerDepth: Math.ceil(m.d * 100) / 100 + 2 * bc,
        innerHeight: 40,
      },
    });
    const r = optimize(exact, 1, 500);
    const printed = r.layout?.trays.filter((t) => t.part !== "spacer") ?? [];
    expect(printed).toHaveLength(1);
    // exactly the floor size: the box minus the clearance on every side
    expect(printed[0]?.w).toBeCloseTo(exact.box.innerWidth - 2 * bc, 2);
    expect(printed[0]?.d).toBeCloseTo(exact.box.innerDepth - 2 * bc, 2);
    expect(checkHardRules(exact, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
  });

  // Review focus: headroom ≥ inner height (topPlane ≤ 0).
  it("reports doesNotFit instead of throwing when headroom ≥ inner height", () => {
    const r = optimize(makeInput(reqs, { box: { innerHeight: 30, headroom: 35 } }), 1, 500);
    expect(r.layout).toBeNull();
    expect(r.bestAttempt?.shortfall.z).toBeGreaterThan(0);
    const n = r.notices.find((x) => x.code === "layout.doesNotFit");
    expect(n?.message).toContain("less headroom");
  });

  // Review focus: a box larger than the bed in both axes with only one component.
  it("splits the leftover of a box larger than the bed into bed-sized pieces", () => {
    const big = makeInput([boxReq("small", 50, 40, 20)], {
      box: { innerWidth: 400, innerDepth: 350, innerHeight: 40 },
      printer: { bedX: 220, bedY: 220, bedZ: 250 },
    });
    const r = optimize(big, 1, 1000);
    expect(r.layout).not.toBeNull();
    expect(checkHardRules(big, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
    const scoop = makeInput(
      [boxReq("scoop", 50, 40, 20, { elastic: { w: true, d: true, h: true } })],
      {
        box: { innerWidth: 400, innerDepth: 350, innerHeight: 40 },
        printer: { bedX: 220, bedY: 220, bedZ: 250 },
      },
    );
    const s = optimize(scoop, 1, 1000);
    expect(checkHardRules(scoop, s.layout ?? emptyLayout(), s.notices)).toEqual([]);
  });

  it("reports the infeasible tiny-box fixture with a shortfall and suggestions", () => {
    const tiny = fixtureInput("tiny-box");
    const r = optimize(tiny, 1, 2000);
    expect(r.layout).toBeNull();
    expect(r.summary).toBeNull();
    const sf = r.bestAttempt?.shortfall;
    expect((sf?.x ?? 0) + (sf?.y ?? 0) + (sf?.z ?? 0)).toBeGreaterThan(0);
    const n = r.notices.find((x) => x.code === "layout.doesNotFit");
    expect(n?.level).toBe("error");
    expect(n?.message).toContain("try:");
    // Not found yet is not a verdict: it names the search it ran (two chains of 2000 here).
    expect(n?.message).toContain("No fit found yet");
    expect(n?.message).toContain("4,000 iterations");
  });

  // Review focus: 30+ requirements must not make the search unusably slow.
  it("handles 32 requirements within the time budget", () => {
    const many = Array.from({ length: 32 }, (_, i) =>
      boxReq(`m${i}`, 20 + (i % 5) * 7, 25 + (i % 3) * 9, 8 + (i % 4) * 3),
    );
    const big = makeInput(many, { box: { innerWidth: 400, innerDepth: 400, innerHeight: 60 } });
    const t0 = Date.now();
    const r = optimize(big, 1, 2000);
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(r.layout).not.toBeNull();
    expect(checkHardRules(big, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
  });

  it("treats a non-finite or negative budget as zero iterations", () => {
    expect(optimize(input, 1, Number.NaN).layout?.iterations).toBe(0);
    expect(optimize(input, 1, -5).layout?.iterations).toBe(0);
  });

  describe("iterations, caps and locks in infeasible runs", () => {
    const tall = [
      boxReq("p", 140, 90, 20, { rotatable: false }),
      boxReq("q", 140, 90, 20, { rotatable: false }),
    ];
    const fallbackLocks = [
      { kind: "position" as const, trayKey: "p:p0:0", path: "0", rotated: false },
      { kind: "position" as const, trayKey: "q:p0:0", path: "1", rotated: false },
    ];
    const fallbackInput = makeInput(tall, {
      box: { innerWidth: 150, innerDepth: 190, innerHeight: 30 },
      locks: fallbackLocks,
    });

    it("stores the iterations actually run, whatever the budget is a multiple of", () => {
      expect(optimize(input, 1, 1500).layout?.iterations).toBe(1500);
      expect(optimize(input, 1, 700).layout?.iterations).toBe(700);
    });

    it("stores the iterations of the phase that produced the layout (fallback phase)", () => {
      const r = optimize(fallbackInput, 1, 1000);
      expect(r.lockConflicts.length).toBeGreaterThan(0);
      expect(r.layout?.iterations).toBe(1000);
      // stopped as soon as the unlocked phase started (after the main and derived-seed chains):
      // it ran nothing yet
      let t = 0;
      const run = createRun(fallbackInput, 1, 1000, { timeCapMs: 2, now: () => t++ });
      while (!run.step()) {
        // step until the cap
      }
      const capped = run.result();
      expect(capped.layout).not.toBeNull();
      expect(capped.layout?.capped).toBe(true);
      expect(capped.layout?.iterations).toBe(0);
    });

    /** done and total after every step of a run. */
    const progress = (run: ReturnType<typeof createRun>) => {
      const out: { done: number; total: number }[] = [];
      for (let i = 0; i < 100; i++) {
        const finished = run.step();
        out.push({ done: run.done, total: run.total });
        if (finished) {
          break;
        }
      }
      return out;
    };
    /** done only grows, total only shrinks, so the fraction never goes backwards. */
    const monotone = (steps: { done: number; total: number }[]): boolean =>
      steps.every((s, i) => {
        const p = steps[i - 1];
        return s.done <= s.total && (!p || (s.done >= p.done && s.total <= p.total));
      });

    it("shows progress over every chain that may still run, never going backwards", () => {
      // main chain, derived-seed chain, unlocked chain: 3 chunks each, 9 announced up front
      const steps = progress(createRun(fallbackInput, 1, 3000));
      expect(steps).toHaveLength(9);
      expect(steps.map((s) => s.total)).toEqual(Array<number>(9).fill(9000));
      expect(steps.map((s) => s.done)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => n * 1000));
      expect(monotone(steps)).toBe(true);
      // without locks there is no unlocked chain: two chains announced, and the total shrinks
      // to one chain when the start is feasible
      const free = progress(createRun(bedLipInput("case0"), 1, 3000));
      expect(free.map((s) => s.total)).toEqual(Array<number>(6).fill(6000));
      expect(monotone(free)).toBe(true);
      const easy = progress(createRun(input, 3, 3000));
      expect(easy).toEqual([
        { done: 1000, total: 3000 },
        { done: 2000, total: 3000 },
        { done: 3000, total: 3000 },
      ]);
    });

    it("shrinks the total, never grows it, when a chain finds a layout", () => {
      // case1 seed 20 (39 before 0.5.3 moved the search) with a small budget: the first chain
      // dead-ends and the derived-seed chain finds a layout (at the default budget the first
      // chain finds one on every seed measured)
      const steps = progress(createRun(bedLipInput("case1"), 20, 1000));
      expect(steps[0]?.total).toBe(2000);
      expect(steps.at(-1)).toEqual({ done: 2000, total: 2000 });
      expect(monotone(steps)).toBe(true);
    });

    it("runs the derived-seed chain before the lock fallback", () => {
      // a clock that ticks once per step: the cap is hit after the first step, when the main
      // chain is over and only the derived chain has started, so the locks are still kept
      const capAfter = (steps: number) => {
        let t = 0;
        const run = createRun(fallbackInput, 1, 1000, { timeCapMs: steps, now: () => t++ });
        while (!run.step()) {
          // step until the cap
        }
        return run.result();
      };
      const early = capAfter(1);
      expect(early.layout).toBeNull();
      expect(early.lockConflicts).toEqual([]);
      // one step later the unlocked chain has started (it ran nothing yet) and gives the layout
      const late = capAfter(2);
      expect(late.layout?.capped).toBe(true);
      expect(late.lockConflicts.length).toBeGreaterThan(0);
    });

    it("adds a capped run's iterations to the warm start's cumulative count", () => {
      const prev = optimize(input, 11, 1000).layout ?? undefined;
      const r = optimize(input, 11, 5000, { warmStart: prev, timeCapMs: 0 });
      expect(r.layout?.capped).toBe(true);
      expect(r.layout?.iterations).toBe(1000 + 1000);
    });

    it("returns a best attempt that keeps the locks it did not drop", () => {
      const first = optimize(
        makeInput(
          [
            boxReq("a", 100, 80, 30),
            boxReq("b", 90, 70, 30),
            boxReq("c", 60, 50, 30),
            boxReq("d", 70, 60, 30),
          ],
          { box: { innerWidth: 300, innerDepth: 200, innerHeight: 40 } },
        ),
        1,
        1000,
      );
      const locks = (first.layout?.trays ?? [])
        .filter((t) => t.part === "tray")
        .map((t) => ({
          kind: "position" as const,
          trayKey: t.key,
          path: t.path,
          rotated: t.rotated,
        }));
      expect(locks).toHaveLength(4);
      const small = makeInput(
        [
          boxReq("a", 100, 80, 30),
          boxReq("b", 90, 70, 30),
          boxReq("c", 60, 50, 30),
          boxReq("d", 70, 60, 30),
        ],
        { box: { innerWidth: 180, innerDepth: 140, innerHeight: 40 }, locks },
      );
      for (const seed of [1, 2]) {
        const r = optimize(small, seed, 1000);
        expect(r.layout).toBeNull();
        expect(r.lockConflicts).toEqual([]);
        for (const l of locks) {
          const t = r.bestAttempt?.trays.find((x) => x.key === l.trayKey);
          expect({ path: t?.path, rotated: t?.rotated }).toEqual({
            path: l.path,
            rotated: l.rotated,
          });
        }
      }
    });

    it("words the capped notice from the actual stop reason", () => {
      const message = (r: LayoutResult): string =>
        r.notices.find((n) => n.code === "layout.capped")?.message ?? "";
      expect(message(optimize(input, 5, 5000, { timeCapMs: 0 }))).toContain("0 ms safety limit");
      expect(
        message(optimize(input, 5, 5000, { timeCapMs: 12_000, shouldCancel: () => true })),
      ).toBe(message(optimize(input, 5, 5000, { shouldCancel: () => true })));
      const cancelled = message(optimize(input, 5, 5000, { shouldCancel: () => true }));
      expect(cancelled).toContain("stopped");
      expect(cancelled).not.toContain("safety limit");
      let t = 0;
      const run = createRun(input, 5, 5000, { timeCapMs: 12_000, now: () => (t += 13_000) });
      run.step();
      expect(message(run.result())).toContain("12 s safety limit");
      let u = 0;
      const dflt = createRun(input, 5, 5000, { now: () => (u += 31_000) });
      dflt.step();
      expect(message(dflt.result())).toContain("30 s safety limit");
    });

    it("treats a NaN or negative time cap like the default or zero, never as no cap", () => {
      let t = 0;
      const nan = createRun(input, 5, 5000, { timeCapMs: Number.NaN, now: () => (t += 40_000) });
      expect(nan.step()).toBe(true);
      expect(nan.result().layout?.capped).toBe(true);
      let u = 0;
      const neg = createRun(input, 5, 5000, { timeCapMs: -1, now: () => (u += 1) });
      expect(neg.step()).toBe(true);
    });
  });

  it("respects a lock on a part that exists only in the split variant", () => {
    const c0 = comp({ minW: 60, minD: 50, minH: 20, contents: "k0" });
    const c1 = comp({ minW: 50, minD: 40, minH: 20, contents: "k1" });
    const one = variant("one", [part("k:p0:0", [c0, c1])]);
    const split = variant("split", [part("k:p0:0", [c0]), part("k:p0:1", [c1])]);
    // 35 mm of height holds one 20 mm tray, not two: the split trays stand side by side, so
    // k:p0:1 has a leaf of its own to be pinned to. In a taller box the search keeps one item's
    // trays in one stack (`apart`), the whole layout one leaf at the root path "", where a pin
    // needs the layout it came from (resolveLocks: `singleLeaf`, `levelOf`).
    const box = { innerHeight: 35 };
    const splitOnly = makeInput([req("k", [split])], { box });
    const base = optimize(splitOnly, 1, 1000).layout;
    const t = base?.trays.find((x) => x.key === "k:p0:1");
    expect(t).toBeDefined();
    if (!t) {
      return;
    }
    expect(t.path).not.toBe("");
    const both = makeInput([req("k", [one, split])], {
      box,
      locks: [{ kind: "position", trayKey: "k:p0:1", path: t.path, rotated: t.rotated }],
    });
    const r = optimize(both, 1, 1500);
    expect(r.layout).not.toBeNull();
    expect(r.lockConflicts).toEqual([]);
    expect(r.layout?.trays.some((x) => x.key === "k:p0:1")).toBe(true);
    expect(checkHardRules(both, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
  });

  it("exports a sane default budget", () => {
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(5000);
    expect(DEFAULT_ITERATIONS % 1000).toBe(0);
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

describe("checkHardRules on optimizer output", () => {
  const input = makeInput([boxReq("a", 120, 80, 20), boxReq("b", 90, 80, 20)]);
  let r: LayoutResult;
  beforeAll(() => {
    r = optimize(input, 1, 1000);
  });

  it("passes a real layout", () => {
    expect(r.layout).not.toBeNull();
    expect(checkHardRules(input, r.layout ?? emptyLayout(), r.notices)).toEqual([]);
  });

  it("flags a moved tray, a wrong height and an ignored lock", () => {
    const layout = r.layout;
    if (!layout) {
      return;
    }
    const broken = {
      ...layout,
      trays: layout.trays.map((t) => (t.key === "a:p0:0" ? { ...t, x: t.x + 0.5, h: t.h - 1 } : t)),
    };
    const locked = {
      ...input,
      locks: [{ kind: "position" as const, trayKey: "a:p0:0", path: "0101", rotated: false }],
    };
    const v = checkHardRules(locked, broken, []);
    expect(v.some((s) => s.includes("tile"))).toBe(true);
    expect(v.some((s) => s.includes("topPlane"))).toBe(true);
    expect(v.some((s) => s.includes("position lock"))).toBe(true);
  });
});

/** The layout of a result the test expects to be feasible. */
function stored(r: LayoutResult): StoredLayout {
  if (!r.layout) {
    throw new Error("expected a feasible layout");
  }
  return r.layout;
}

describe("a stack level holds a tray plus fillers (spec: minimal trays)", () => {
  // The floor is exactly one 100 × 60 tray, so the 50 × 40 tray can only share it by stacking.
  const stacked = [boxReq("a", 100, 60, 20), boxReq("b", 50, 40, 10)];
  const box = { innerWidth: 107.5, innerDepth: 67.5, innerHeight: 60 };
  const big = { kind: "stack" as const, trayKeys: ["a:p0:0", "b:p0:0"] };
  const small = { kind: "stack" as const, trayKeys: ["b:p0:0", "a:p0:0"] };

  it("keeps the upper tray at its own size and fills its level with fillers", () => {
    const inp = makeInput(stacked, { box, locks: [big] });
    const r = optimize(inp, 1, 2000);
    const trays = r.layout?.trays ?? [];
    expect(r.layout).not.toBeNull();
    const b = trays.find((t) => t.key === "b:p0:0");
    const a = trays.find((t) => t.key === "a:p0:0");
    expect(b?.level).toBe(1);
    // minimal: as small as its content needs, whatever it stands on
    const alone = createCtx(makeInput([stacked[1] ?? boxReq("b", 50, 40, 10)])).metrics(
      { req: 0, variant: 0, part: 0 },
      false,
      1,
    );
    expect(b?.w).toBe(alone.w / 100);
    expect(b?.d).toBe(alone.d / 100);
    expect(b?.w).toBeLessThan((a?.w ?? 0) - 10);
    const inLevel = trays.filter((t) => t.part === "leftover" && t.level === 1);
    expect(inLevel.length).toBeGreaterThan(0);
    for (const f of inLevel) {
      expect(f.stack).toBe(b?.stack);
    }
    expect(checkHardRules(inp, stored(r), r.notices)).toEqual([]);
  });

  it.each([
    ["the wider tray under", big, ["a:p0:0", "b:p0:0"]],
    ["the smaller tray under", small, ["b:p0:0", "a:p0:0"]],
  ])("honours a stack lock with %s", (_name, lock, order) => {
    const inp = makeInput(stacked, { box, locks: [lock] });
    const r = optimize(inp, 1, 2000);
    const trays = r.layout?.trays ?? [];
    expect(r.lockConflicts).toEqual([]);
    expect(trays.filter((t) => t.part === "tray").map((t) => [t.key, t.level])).toEqual(
      order.map((k, i) => [k, i]),
    );
    expect(checkHardRules(inp, stored(r), r.notices)).toEqual([]);
  });

  it("plans the same trays again from its own stored layout (warm start)", () => {
    const inp = makeInput(stacked, { box, locks: [big] });
    const first = optimize(inp, 1, 2000);
    const again = optimize(inp, 1, 500, { warmStart: stored(first) });
    const sig = (r: LayoutResult) =>
      (r.layout?.trays ?? []).map((t) => [t.key, t.part, t.level, t.x, t.y, t.w, t.d]);
    expect(sig(again)).toEqual(sig(first));
  });
});

describe("one requirement's parts look alike (spec §6)", () => {
  // Three near-square parts of one component, and two more trays: turning one costs the packing
  // next to nothing, so the weak orientation term decides and every seed leaves them turned alike.
  const parts = [0, 1, 2].map((i) =>
    part(`s:p0:${i}`, [comp({ minW: 40, minD: 40, minH: 10, contents: `part ${i}` })]),
  );
  const family = [
    req("s", [variant("three", parts)], { access: "sometimes" }),
    boxReq("k", 90, 60, 20),
    boxReq("m", 70, 50, 15),
  ];
  const inp = makeInput(family, { box: { innerWidth: 200, innerDepth: 150, innerHeight: 60 } });

  // The orientation term is weak (15 000, under a part's 20 000), so what the search finds is a
  // matter of how far it gets: over seeds 1 to 30 the parts end up turned alike from 10 000
  // iterations on (20 000 here, for margin), but at 5 000 two seeds (3 and 8) were still mixed
  // once fillers got a term of their own, and the code before that was no better (one seed at
  // 5 000, two at 10 000, one at 20 000 and one at 50 000 were mixed).
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("turns them all the same way (seed %i)", (seed) => {
    const r = optimize(inp, seed, 20_000);
    expect(r.layout).not.toBeNull();
    const trays = (r.layout?.trays ?? []).filter((t) => t.key.startsWith("s:"));
    expect(trays).toHaveLength(3);
    expect(new Set(trays.map((t) => t.rotated)).size).toBe(1);
  });
});

describe("a tight box with one exact partition of the heights is solved cold", () => {
  // Before `moveItem`, `swapItems` and the partition starts, the first took about 4 000 000
  // iterations to solve (0 of 10 seeds at the default budget, 0 of 10 at 300 000), the second
  // 0 of 10 at the default budget: a part had to change stacks through a floor overflow, and the
  // greedy start deals the heights out by first fit, nowhere near the one split that works.
  const names = Object.keys(TIGHT_FIXTURES) as TightFixtureName[];
  for (const name of names) {
    it.each([1, 2, 3, 4, 5])(`${name} gets a layout at the default budget (seed %i)`, (seed) => {
      const r = optimize(fixtureInput(name), seed, DEFAULT_ITERATIONS);
      expect(r.layout).not.toBeNull();
      expect(r.notices.map((n) => n.code)).not.toContain("layout.doesNotFit");
    });
  }
});
