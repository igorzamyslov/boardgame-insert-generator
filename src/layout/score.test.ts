import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { OVERFLOW_WEIGHT, scorePlan, WEIGHTS, type PrevPos } from "./score";
import { boxReq, comp, fakeMeasure, item, makeInput, part, req, variant } from "./test-utils";
import { cut, leaf, type Tree } from "./tree";

describe("score", () => {
  it("orders the unit steps of the terms as in spec §7.2", () => {
    const steps = [
      1000 * WEIGHTS.leftover,
      WEIGHTS.coverage,
      WEIGHTS.access,
      20 * WEIGHTS.play,
      WEIGHTS.stacked,
      WEIGHTS.trays,
      WEIGHTS.setup,
      1000 * WEIGHTS.filament,
      WEIGHTS.moved,
    ];
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThan(steps[i - 1] ?? 0);
    }
    for (const w of Object.values(WEIGHTS)) {
      expect(Number.isInteger(w)).toBe(true);
    }
  });

  it("makes 0.01 mm of overflow cost more than any feasible score", () => {
    const maxFeasible =
      100_000 * WEIGHTS.leftover +
      200 *
        (WEIGHTS.coverage +
          WEIGHTS.access +
          WEIGHTS.setup +
          WEIGHTS.stacked +
          WEIGHTS.trays +
          WEIGHTS.moved +
          WEIGHTS.unturned +
          WEIGHTS.apart +
          WEIGHTS.fillers) +
      20_000 * WEIGHTS.play +
      100_000 * WEIGHTS.filament;
    expect(OVERFLOW_WEIGHT).toBeGreaterThan(maxFeasible);
  });

  const reqs = [
    boxReq("a", 140, 90, 20, { loose: true }),
    boxReq("b", 140, 90, 20, { access: "often" }),
  ];

  it("penalizes leftover volume", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const side: Tree = { root: cut("x", leaf([item(0)]), leaf([item(1)])), variants: [0, 0] };
    const s = scorePlan(ctx, evaluate(ctx, side));
    expect(s.overflow).toBe(0);
    expect(s.terms.leftover).toBeGreaterThan(0);
    const roomy = createCtx(makeInput(reqs, { box: { innerDepth: 290 } }), fakeMeasure);
    expect(scorePlan(roomy, evaluate(roomy, side)).terms.leftover).toBeGreaterThan(
      s.terms.leftover,
    );
  });

  it("with oneWall, counts a thick wall as wasted room, and saves the filler's parts", () => {
    // A 100 × 60 tray (106 × 66 with its lip) in a 120 × 70 box: 14 mm of width to place.
    const one = [boxReq("a", 100, 60, 20)];
    const box = { innerWidth: 120, innerDepth: 70 };
    const tree: Tree = { root: leaf([item(0)]), variants: [0] };
    const printed = createCtx(makeInput(one, { box }), fakeMeasure);
    const walled = createCtx(makeInput(one, { box, settings: { oneWall: true } }), fakeMeasure);
    const a = scorePlan(printed, evaluate(printed, tree));
    const b = scorePlan(walled, evaluate(walled, tree));
    expect(a.terms.fillers).toBeGreaterThan(0);
    expect(b.terms.fillers).toBeLessThan(a.terms.fillers);
    expect(b.terms.trays).toBeLessThan(a.terms.trays);
    // The room is still wasted, not capacity: the wall costs about what the filler's room did
    // (within a few per cent: the tray gap and the filler's height differ), where thin walls
    // (wallAbsorb) would have made it free.
    expect(b.terms.leftover).toBeGreaterThan(0.9 * a.terms.leftover);
  });

  it("applies the coverage penalty only with partial coverage or a box stored on its side", () => {
    const tree: Tree = { root: cut("x", leaf([item(0)]), leaf([item(1)])), variants: [0, 0] };
    const full = createCtx(makeInput(reqs, { box: { headroom: 5 } }), fakeMeasure);
    expect(scorePlan(full, evaluate(full, tree)).terms.coverage).toBe(0);
    const partial = createCtx(
      makeInput(reqs, { box: { headroom: 5, headroomCoverage: "partial" } }),
      fakeMeasure,
    );
    expect(scorePlan(partial, evaluate(partial, tree)).terms.coverage).toBe(1);
    const side = createCtx(makeInput(reqs, { box: { storedOnSide: true } }), fakeMeasure);
    expect(scorePlan(side, evaluate(side, tree)).terms.coverage).toBe(1);
  });

  it("penalizes often-used trays under other trays and counts stacked trays", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const buried: Tree = { root: leaf([item(1), item(0)]), variants: [0, 0] };
    const s = scorePlan(ctx, evaluate(ctx, buried));
    expect(s.terms.access).toBe(1);
    expect(s.terms.stacked).toBe(1);
    const onTop: Tree = { root: leaf([item(0), item(1)]), variants: [0, 0] };
    expect(scorePlan(ctx, evaluate(ctx, onTop)).terms.access).toBe(0);
  });

  describe("access values", () => {
    const three = [
      boxReq("o", 140, 90, 20, { access: "often" }),
      boxReq("m", 140, 90, 20, { access: "sometimes" }),
      boxReq("s", 140, 90, 20, { access: "setup" }),
    ];
    const ctx = createCtx(makeInput(three), fakeMeasure);
    const score = (order: number[]) =>
      scorePlan(ctx, evaluate(ctx, { root: leaf(order.map((i) => item(i))), variants: [0, 0, 0] }));
    const [O, M, S] = [0, 1, 2];

    it("prefers a setup tray buried, and charges one left on top", () => {
      // leaf order is bottom to top
      const buried = score([S, M]);
      const exposed = score([M, S]);
      expect(buried.terms.setup).toBe(0);
      expect(exposed.terms.setup).toBe(1);
      expect(exposed.total - buried.total).toBe(WEIGHTS.setup);
    });

    it("scores nothing for sometimes, buried or not", () => {
      const twin = [
        boxReq("m1", 140, 90, 20, { access: "sometimes" }),
        boxReq("m2", 140, 90, 20, { access: "sometimes" }),
      ];
      const c = createCtx(makeInput(twin), fakeMeasure);
      for (const order of [
        [0, 1],
        [1, 0],
      ]) {
        const s = scorePlan(
          c,
          evaluate(c, { root: leaf(order.map((i) => item(i))), variants: [0, 0] }),
        );
        expect(s.terms.access).toBe(0);
        expect(s.terms.setup).toBe(0);
      }
    });

    it("leaves often as before: only a buried often tray scores", () => {
      expect(score([O, M]).terms.access).toBe(1);
      expect(score([M, O]).terms.access).toBe(0);
      expect(score([O, M]).terms.setup).toBe(0);
    });

    it("gives the three values three distinct scores on the same layout", () => {
      // identical geometry, only the access value differs; each sits at the bottom of a pair
      const totals = (["often", "sometimes", "setup"] as const).map((a) => {
        const reqs2 = [
          boxReq("x", 140, 90, 20, { access: a }),
          boxReq("y", 140, 90, 20, { access: "sometimes" }),
        ];
        const c = createCtx(makeInput(reqs2), fakeMeasure);
        const bottom = scorePlan(
          c,
          evaluate(c, { root: leaf([item(0), item(1)]), variants: [0, 0] }),
        );
        const top = scorePlan(c, evaluate(c, { root: leaf([item(1), item(0)]), variants: [0, 0] }));
        return `${bottom.total}/${top.total}`;
      });
      expect(new Set(totals).size).toBe(3);
    });
  });

  describe("keeping one requirement's parts together (spec §6)", () => {
    // One requirement of three square parts, "often" used, and one more tray to stack with.
    const parts = [0, 1, 2].map((i) =>
      part(`s:p0:${i}`, [comp({ minW: 40, minD: 40, minH: 10, contents: `part ${i}` })]),
    );
    const family = [
      req("s", [variant("v", parts)], { access: "often" }),
      boxReq("k", 40, 40, 10, { access: "sometimes" }),
    ];
    const ctx = createCtx(makeInput(family), fakeMeasure);
    const piece = (p: number, rotated = false) => ({ req: 0, variant: 0, part: p, rotated });
    const k = { req: 1, variant: 0, part: 0, rotated: false };
    const side = (...stacks: (typeof k)[][]): Tree["root"] => {
      let root: Tree["root"] = leaf(stacks[stacks.length - 1] ?? []);
      for (let i = stacks.length - 2; i >= 0; i--) {
        root = cut("x", leaf(stacks[i] ?? []), root);
      }
      return root;
    };
    const score = (root: Tree["root"]) => scorePlan(ctx, evaluate(ctx, { root, variants: [0, 0] }));

    it("counts the parts turned unlike most of their siblings, per requirement", () => {
      const turned = (...flags: boolean[]) =>
        score(side(...flags.map((r, i) => [piece(i, r)]), [k])).terms.unturned;
      expect(turned(false, false, false)).toBe(0);
      expect(turned(true, true, true)).toBe(0);
      expect(turned(false, false, true)).toBe(1);
      expect(turned(true, false, true)).toBe(1);
      // a requirement of one part has nothing to agree with
      expect(score(side([item(1, true)])).terms.unturned).toBe(0);
    });

    it("prefers one orientation by exactly its weight when the parts are square in plan", () => {
      const same = score(side([piece(0)], [piece(1)], [piece(2)], [k]));
      const mixed = score(side([piece(0)], [piece(1, true)], [piece(2)], [k]));
      expect(mixed.overflow).toBe(0);
      expect(mixed.terms.leftover).toBe(same.terms.leftover);
      expect(mixed.total - same.total).toBe(WEIGHTS.unturned);
    });

    it("counts the extra stacks a requirement's parts stand in", () => {
      expect(score(side([piece(0), piece(1), piece(2)], [k])).terms.apart).toBe(0);
      expect(score(side([piece(0), piece(1)], [piece(2)], [k])).terms.apart).toBe(1);
      expect(score(side([piece(0)], [piece(1)], [piece(2)], [k])).terms.apart).toBe(2);
    });

    it("never outweighs keeping an often-used tray on top", () => {
      // The Star Realms case: grouping all three parts buries two of them, the interleaved layout
      // only one. The weak term must not decide it, however it is arranged around them.
      const grouped = score(side([piece(0), piece(1), piece(2)], [k]));
      const split = score(side([piece(0), piece(1)], [k, piece(2)]));
      expect(grouped.terms.access).toBe(2);
      expect(split.terms.access).toBe(1);
      expect(grouped.terms.apart).toBe(0);
      expect(split.terms.apart).toBe(1);
      expect(split.total).toBeLessThan(grouped.total);
      // and by construction, for any number of parts: one buried tray costs more than every stack
      // it could save, and than every orientation
      expect(WEIGHTS.apart).toBeLessThan(WEIGHTS.access);
      expect(WEIGHTS.unturned).toBeLessThan(WEIGHTS.access);
    });

    it("stays below an extra printed part and a stacked tray, and above a moved one", () => {
      for (const w of [WEIGHTS.unturned, WEIGHTS.apart]) {
        expect(w).toBeLessThan(WEIGHTS.trays);
        expect(w).toBeLessThan(WEIGHTS.stacked);
        expect(w).toBeGreaterThan(WEIGHTS.moved);
      }
    });

    it("cannot make an infeasible layout beat a feasible one", () => {
      // The worst case a requirement can add: 100 parts, each turned unlike the other half and in
      // a stack of its own.
      const most = 100 * WEIGHTS.apart + 50 * WEIGHTS.unturned;
      expect(most).toBeLessThan(OVERFLOW_WEIGHT);
      const flat = createCtx(makeInput(family, { box: { innerWidth: 60 } }), fakeMeasure);
      const over = scorePlan(
        flat,
        evaluate(flat, { root: side([piece(0)], [piece(1)], [k]), variants: [0, 0] }),
      );
      expect(over.overflow).toBeGreaterThan(0);
      expect(over.total).toBeGreaterThan(score(side([piece(0), piece(1), piece(2)], [k])).total);
    });
  });

  describe("filler count (spec §6, lever 2)", () => {
    // One 100 × 60 tray in a box with room beside it. The leftovers of the plan are replaced by
    // hand, so that the volume left over is exactly the same and only their number differs.
    const one = [boxReq("a", 100, 60, 20)];
    const ctx = createCtx(
      makeInput(one, { box: { innerWidth: 250, innerDepth: 100 } }),
      fakeMeasure,
    );
    const base = evaluate(ctx, { root: leaf([item(0)]), variants: [0] });
    const block = (x: number, w: number): (typeof base.leftovers)[number] => ({
      path: "0",
      stack: 1,
      level: 0,
      x,
      y: 0,
      z: 0,
      w,
      d: 5000,
      h: 3000,
      solid: true,
    });
    const withFillers = (...ws: number[]) => {
      let x = 11000;
      const leftovers = ws.map((w) => {
        const b = block(x, w);
        x += w + 20;
        return b;
      });
      return scorePlan(ctx, { ...base, leftovers });
    };

    it("counts the filler parts, those in a stack level too", () => {
      expect(withFillers().terms.fillers).toBe(0);
      expect(withFillers(4000).terms.fillers).toBe(1);
      expect(withFillers(2000, 2000).terms.fillers).toBe(2);
      const inLevel = { ...block(0, 1000), level: 1, z: 2000, h: 1000 };
      expect(scorePlan(ctx, { ...base, leftovers: [inLevel] }).terms.fillers).toBe(1);
    });

    it("prefers one large filler to two small ones of the same volume, by a part and a filler", () => {
      const large = withFillers(4000);
      const small = withFillers(2000, 2000);
      expect(small.terms.leftover).toBe(large.terms.leftover);
      expect(small.terms.filament).toBe(large.terms.filament);
      expect(small.total - large.total).toBe(WEIGHTS.trays + WEIGHTS.fillers);
      expect(large.total).toBeLessThan(small.total);
    });

    it("costs more than any cohesion preference, so none of them buys a filler", () => {
      expect(WEIGHTS.fillers).toBeGreaterThan(WEIGHTS.unturned);
      expect(WEIGHTS.fillers).toBeGreaterThan(WEIGHTS.apart);
      expect(WEIGHTS.fillers).toBeGreaterThan(WEIGHTS.setup);
      expect(WEIGHTS.fillers).toBeGreaterThan(WEIGHTS.moved);
    });

    it("stays under a stacked tray with its part, and far under a buried often tray", () => {
      // so avoiding a filler never costs a stacked tray, nor a tray buried under another
      expect(WEIGHTS.trays + WEIGHTS.fillers).toBeLessThan(WEIGHTS.stacked);
      expect(WEIGHTS.fillers).toBeLessThan(WEIGHTS.access);
    });
  });

  it("counts trays moved relative to a warm start", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const tree: Tree = { root: cut("x", leaf([item(0)]), leaf([item(1)])), variants: [0, 0] };
    const plan = evaluate(ctx, tree);
    const prev = new Map<string, PrevPos>(
      plan.trays.map((t) => [
        `${t.item.req === 0 ? "a" : "b"}:p0:0`,
        { x: t.x, y: t.y, level: t.level },
      ]),
    );
    expect(scorePlan(ctx, plan, prev).terms.moved).toBe(0);
    prev.set("a:p0:0", { x: 1, y: 0, level: 0 });
    expect(scorePlan(ctx, plan, prev).terms.moved).toBe(1);
  });

  it("measures play against the Play limit setting", () => {
    const many = Array.from({ length: 8 }, (_, i) => boxReq(`r${i}`, 20, 20, 10));
    const termsAt = (playLimit: number) => {
      const ctx = createCtx(makeInput(many, { settings: { playLimit } }), fakeMeasure);
      let root = leaf([item(7)]) as Tree["root"];
      for (let i = 6; i >= 0; i--) {
        root = cut("x", leaf([item(i)]), root);
      }
      return scorePlan(ctx, evaluate(ctx, { root, variants: many.map(() => 0) })).terms.play;
    };
    // eight trays in one row: a lot of play, which a raised limit forgives
    expect(termsAt(1.5)).toBeGreaterThan(0);
    expect(termsAt(1.5)).toBeGreaterThan(termsAt(2));
    expect(termsAt(3)).toBeLessThan(termsAt(2));
    expect(termsAt(5)).toBe(0);
  });

  it("penalizes nominal play above 1.5 mm", () => {
    const many = Array.from({ length: 8 }, (_, i) => boxReq(`r${i}`, 20, 20, 10));
    const ctx = createCtx(makeInput(many), fakeMeasure);
    let root = leaf([item(7)]) as Tree["root"];
    for (let i = 6; i >= 0; i--) {
      root = cut("x", leaf([item(i)]), root);
    }
    const s = scorePlan(ctx, evaluate(ctx, { root, variants: many.map(() => 0) }));
    expect(s.terms.play).toBeGreaterThan(0);
  });
});
