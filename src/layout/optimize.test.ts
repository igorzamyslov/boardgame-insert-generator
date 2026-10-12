import { beforeAll, describe, expect, it } from "vitest";
import { GEOMETRY_VERSION } from "../geometry/version";
import { DEFAULT_SETTINGS, effective } from "../model/settings";
import { minOuter } from "../sizing";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { fixtureInput } from "./test-fixtures";
import { checkHardRules } from "./test-hard-rules";
import { materialize } from "./materialize";
import { createRun, DEFAULT_ITERATIONS, optimize } from "./optimize";
import { boxReq, comp, makeInput, part, req, variant } from "./test-utils";
import type { LayoutResult } from "./types";
import { warmHints, warmTree } from "./warmstart";

const reqs = [
  boxReq("a", 120, 80, 20),
  boxReq("b", 90, 80, 20, { access: "often" }),
  boxReq("c", 60, 40, 15, { elastic: { w: true, d: true, h: true }, loose: true }),
  boxReq("d", 70, 50, 25),
];
const input = makeInput(reqs, { box: { innerWidth: 280, innerDepth: 200, innerHeight: 60 } });

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

  it("drops locks that make the box infeasible and lays out without them", () => {
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
    expect(r.notices.filter((n) => n.code === "lock.dropped").map((n) => n.path)).toEqual([
      "/locks/0",
      "/locks/1",
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
    expect(n?.message).toContain("Try:");
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
      expect(r.notices.some((n) => n.code === "lock.dropped")).toBe(true);
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

    it("keeps the progress fraction from going backwards when the extra chains start", () => {
      const run = createRun(fallbackInput, 1, 3000);
      const fractions: number[] = [];
      const totals = new Set<number>();
      let steps = 0;
      do {
        steps++;
        const finished = run.step();
        fractions.push(run.done / run.total);
        totals.add(run.total);
        if (finished) {
          break;
        }
      } while (steps < 100);
      // main chain, derived-seed chain, unlocked chain: 3 chunks each
      expect(steps).toBe(9);
      expect(totals.size).toBe(1);
      expect(fractions.every((f, i) => i === 0 || f >= (fractions[i - 1] ?? 0))).toBe(true);
      expect(fractions.every((f) => f <= 1)).toBe(true);
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
      expect(early.notices.filter((n) => n.code === "lock.dropped")).toEqual([]);
      // one step later the unlocked chain has started (it ran nothing yet) and gives the layout
      const late = capAfter(2);
      expect(late.layout?.capped).toBe(true);
      expect(late.notices.some((n) => n.code === "lock.dropped")).toBe(true);
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
        expect(r.notices.filter((n) => n.code === "lock.dropped")).toEqual([]);
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
    const splitOnly = makeInput([req("k", [split])]);
    const base = optimize(splitOnly, 1, 1000).layout;
    const t = base?.trays.find((x) => x.key === "k:p0:1");
    expect(t).toBeDefined();
    if (!t) {
      return;
    }
    const both = makeInput([req("k", [one, split])], {
      locks: [{ kind: "position", trayKey: "k:p0:1", path: t.path, rotated: t.rotated }],
    });
    const r = optimize(both, 1, 1500);
    expect(r.layout).not.toBeNull();
    expect(r.notices.filter((n) => n.code === "lock.dropped")).toEqual([]);
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
