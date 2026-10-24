import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import {
  OVERFLOW_WEIGHT,
  SEAL_REACH_MM,
  SWOLLEN_CAP_MM,
  scorePlan,
  WEIGHTS,
  type PrevPos,
} from "./score";
import { CHANNEL_DEPTH } from "../sizing/constants";
import { optimize } from "./optimize";
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
          WEIGHTS.scattered +
          WEIGHTS.fillers +
          WEIGHTS.sealed) +
      20_000 * WEIGHTS.play +
      100_000 * WEIGHTS.filament +
      // thirty trays, each swollen to the cap on both axes, each but one in a stack apart from the
      // rest of its requirement, and each one tray more than its requirement needed
      30 * (2 * SWOLLEN_CAP_MM ** 2 * WEIGHTS.swollen + WEIGHTS.apart + WEIGHTS.split);
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

    it("charges exactly its weight for each extra stack, all else equal", () => {
      // The third part on the other requirement's tray, and the same plan with that part's stack
      // relabelled as its siblings' (on top of them, still on top and still stacked): only the
      // count of stacks the requirement stands in differs.
      const plan = evaluate(ctx, {
        root: side([piece(0), piece(1)], [k, piece(2)]),
        variants: [0, 0],
      });
      const home = plan.trays.find((t) => t.item.req === 0 && t.item.part === 0)?.stack ?? -1;
      const together = {
        ...plan,
        trays: plan.trays.map((t) =>
          t.item.req === 0 && t.item.part === 2 ? { ...t, stack: home, level: 2 } : t,
        ),
      };
      const a = scorePlan(ctx, plan);
      const b = scorePlan(ctx, together);
      expect(a.terms.apart).toBe(1);
      expect(b.terms.apart).toBe(0);
      // the weak adjacency term counts the same stack, and nothing else moves
      expect(a.terms.scattered - b.terms.scattered).toBe(1);
      expect(a.total - b.total).toBe(WEIGHTS.apart + WEIGHTS.scattered);
    });

    it("counts the trays of other requirements standing between a requirement's parts", () => {
      // adjacent in the stack, or not: one foreign tray between two of its parts is one more
      expect(score(side([piece(0), piece(1), k])).terms.scattered).toBe(0);
      expect(score(side([k, piece(0), piece(1)])).terms.scattered).toBe(0);
      const between = score(side([piece(0), k, piece(1)])).terms;
      expect(between.scattered).toBe(1);
      expect(between.apart).toBe(0); // still one stack
      const two = score(side([piece(0), k, piece(1)], [piece(2)])).terms;
      expect(two.scattered).toBe(2);
      expect(two.apart).toBe(1);
    });

    it("keeps one player's trays together, and the players' only weakly", () => {
      // one tray per player: four copies of one tray, in four stacks, is no item split apart
      const kit = req("k", [
        variant(
          "separate",
          [0, 1, 2, 3].map((p) => part(`k:p${p}:0`, [comp({ minW: 40, minD: 40, minH: 10 })])),
        ),
      ]);
      const kits = createCtx(makeInput([kit]), fakeMeasure);
      const player = (p: number) => ({ req: 0, variant: 0, part: p, rotated: false });
      const spread = scorePlan(
        kits,
        evaluate(kits, {
          root: cut(
            "x",
            cut("x", leaf([player(0)]), leaf([player(1)])),
            cut("x", leaf([player(2)]), leaf([player(3)])),
          ),
          variants: [0],
        }),
      );
      expect(spread.overflow).toBe(0);
      expect(spread.terms.apart).toBe(0);
      expect(spread.terms.scattered).toBe(3);
    });

    it("keeps the parts in one stack even when that buries one more often-used part", () => {
      // The Star Realms case (owner, 0.5.3): grouping all three parts buries two of them, the
      // interleaved layout only one. Keeping one item's trays together now comes first.
      const grouped = score(side([piece(0), piece(1), piece(2)], [k]));
      const split = score(side([piece(0), piece(1)], [k, piece(2)]));
      expect(grouped.terms.access).toBe(2);
      expect(split.terms.access).toBe(1);
      expect(grouped.terms.apart).toBe(0);
      expect(split.terms.apart).toBe(1);
      expect(grouped.total).toBeLessThan(split.total);
    });

    it("weighs an extra stack as 5 % of the box, above a loose tray on top and a filler", () => {
      // so keeping an item together may cost a filler, a buried tray or up to 5 % of the box
      // (the owner's Star Realms box, 0.8.1: 2.25 % and a filler's filament), never fit
      expect(WEIGHTS.apart).toBeGreaterThan(WEIGHTS.coverage);
      expect(WEIGHTS.apart).toBeGreaterThan(WEIGHTS.access);
      expect(WEIGHTS.apart).toBeGreaterThan(WEIGHTS.trays + WEIGHTS.fillers);
      expect(WEIGHTS.apart).toBe(5000 * WEIGHTS.leftover);
      expect(WEIGHTS.apart).toBeLessThan(OVERFLOW_WEIGHT / 100);
    });

    it("keeps orientation and adjacency below an extra printed part and a stacked tray, above a moved one", () => {
      for (const w of [WEIGHTS.unturned, WEIGHTS.scattered]) {
        expect(w).toBeLessThan(WEIGHTS.trays);
        expect(w).toBeLessThan(WEIGHTS.stacked);
        expect(w).toBeGreaterThan(WEIGHTS.moved);
        expect(w).toBeLessThan(WEIGHTS.access);
      }
    });

    it("cannot make an infeasible layout beat a feasible one", () => {
      // The worst case a requirement can add: 100 parts, each turned unlike the other half and in
      // a stack of its own.
      const most =
        100 * (WEIGHTS.apart + WEIGHTS.scattered + WEIGHTS.split) + 50 * WEIGHTS.unturned;
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

  describe("one tray unless no single tray fits (groups spec §6.3)", () => {
    const a = comp({ minW: 90, minD: 80, minH: 20, contents: "a" });
    const b = comp({ minW: 90, minD: 80, minH: 20, contents: "b" });
    const w = req("w", [
      variant("whole", [part("w:p0:0", [a, b])]),
      variant("halves", [part("w:p0:0", [a]), part("w:p0:1", [b])]),
    ]);
    const whole: Tree = { root: leaf([item(0)]), variants: [0] };
    const halves: Tree = {
      root: cut(
        "x",
        leaf([{ req: 0, variant: 1, part: 0, rotated: false }]),
        leaf([{ req: 0, variant: 1, part: 1, rotated: false }]),
      ),
      variants: [1],
    };

    it("charges each tray beyond one when a whole tray fits", () => {
      const ctx = createCtx(makeInput([w]), fakeMeasure);
      expect(scorePlan(ctx, evaluate(ctx, whole)).terms.split).toBe(0);
      const split = scorePlan(ctx, evaluate(ctx, halves));
      expect(split.overflow).toBe(0);
      expect(split.terms.split).toBe(1);
    });

    it("charges nothing when no whole tray fits", () => {
      // 180 mm of usable bed: the 184 mm whole tray is over it, the halves are not
      const ctx = createCtx(makeInput([w], { printer: { bedX: 190, bedY: 190 } }), fakeMeasure);
      const split = scorePlan(ctx, evaluate(ctx, halves));
      expect(split.overflow).toBe(0);
      expect(split.terms.split).toBe(0);
    });

    it("outweighs every packing preference but coverage, and stays under overflow", () => {
      for (const other of [
        WEIGHTS.access,
        WEIGHTS.stacked,
        WEIGHTS.trays + WEIGHTS.fillers,
        WEIGHTS.setup,
        WEIGHTS.unturned,
        WEIGHTS.scattered,
        WEIGHTS.sealed,
      ]) {
        expect(WEIGHTS.split).toBeGreaterThan(other);
      }
      expect(WEIGHTS.split).toBeLessThan(WEIGHTS.coverage);
      expect(WEIGHTS.split).toBeLessThan(OVERFLOW_WEIGHT / 100);
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

    it("costs more than the weak cohesion preferences, so none of them buys a filler", () => {
      expect(WEIGHTS.fillers).toBeGreaterThan(WEIGHTS.unturned);
      expect(WEIGHTS.fillers).toBeGreaterThan(WEIGHTS.scattered);
      expect(WEIGHTS.fillers).toBeGreaterThan(WEIGHTS.setup);
      expect(WEIGHTS.fillers).toBeGreaterThan(WEIGHTS.moved);
    });

    it("stays under a stacked tray with its part, and far under a buried often tray", () => {
      // so avoiding a filler never costs a stacked tray, nor a tray buried under another
      expect(WEIGHTS.trays + WEIGHTS.fillers).toBeLessThan(WEIGHTS.stacked);
      expect(WEIGHTS.fillers).toBeLessThan(WEIGHTS.access);
    });
  });

  describe("stack order by footprint (spec §6.4)", () => {
    // 100 × 60 and 50 × 40 parts in one stack: the small one under the large one has to carry the
    // large one's footprint in its walls, over it stands at its own size with a filler beside it.
    const wide = boxReq("wide", 100, 60, 20);
    const small = boxReq("small", 50, 40, 10);
    const ctx = createCtx(makeInput([wide, small]), fakeMeasure);
    const stackOf = (...order: number[]) =>
      scorePlan(ctx, evaluate(ctx, { root: leaf(order.map((r) => item(r))), variants: [0, 0] }));

    it("charges a small tray under a large one, and nothing for the other way round", () => {
      const smallFirst = stackOf(1, 0);
      const wideFirst = stackOf(0, 1);
      expect(smallFirst.overflow).toBe(0);
      expect(wideFirst.overflow).toBe(0);
      expect(smallFirst.terms.swollen).toBeGreaterThan(0);
      expect(wideFirst.terms.swollen).toBe(0);
    });

    it("prefers the largest tray at the bottom", () => {
      expect(stackOf(0, 1).total).toBeLessThan(stackOf(1, 0).total);
    });

    it("does not charge the room two equal trays ask of each other, in either order", () => {
      const twin = createCtx(
        makeInput([boxReq("a", 60, 40, 10), boxReq("b", 60, 40, 10)]),
        fakeMeasure,
      );
      const s = scorePlan(
        twin,
        evaluate(twin, { root: leaf([item(0), item(1)]), variants: [0, 0] }),
      );
      expect(s.overflow).toBe(0);
      expect(s.terms.swollen).toBe(0);
    });

    it("does not charge room the tray's contents may grow into", () => {
      const grows = boxReq("small", 50, 40, 10, { elastic: { w: true, d: true } });
      const c = createCtx(makeInput([wide, grows]), fakeMeasure);
      const s = scorePlan(c, evaluate(c, { root: leaf([item(1), item(0)]), variants: [0, 0] }));
      expect(s.terms.swollen).toBe(0);
    });

    it("keeps an often-used tray on top: the tray under it carries its footprint uncharged", () => {
      const often = createCtx(
        makeInput([boxReq("wide", 100, 60, 20, { access: "often" }), small]),
        fakeMeasure,
      );
      const run = (...order: number[]) =>
        scorePlan(
          often,
          evaluate(often, { root: leaf(order.map((r) => item(r))), variants: [0, 0] }),
        );
      const onTop = run(1, 0);
      const buried = run(0, 1);
      expect(onTop.terms.swollen).toBe(0);
      expect(onTop.terms.access).toBe(0);
      expect(buried.terms.access).toBe(1);
      expect(onTop.total).toBeLessThan(buried.total);
    });

    it("stays under the box's own coverage at a millimetre or two, and cannot beat feasibility", () => {
      expect(WEIGHTS.swollen).toBeGreaterThan(WEIGHTS.fillers);
      expect(WEIGHTS.swollen * 2.5 ** 2).toBeGreaterThanOrEqual(WEIGHTS.coverage);
      // one tray at the cap on both axes is far under a single unit of overflow
      expect(2 * SWOLLEN_CAP_MM ** 2 * WEIGHTS.swollen * 30).toBeLessThan(OVERFLOW_WEIGHT);
    });

    it("orders a stack largest-first when the search is free to", () => {
      // Three trays of three different footprints that must stack (one 70 × 60 floor spot each
      // would not fit beside each other), offered smallest first.
      const trio = [
        boxReq("big", 90, 60, 14),
        boxReq("mid", 70, 50, 14),
        boxReq("tiny", 40, 30, 14),
      ];
      const input = makeInput(trio, { box: { innerWidth: 100, innerDepth: 70, innerHeight: 60 } });
      const { layout } = optimize(input, 1, 20_000);
      expect(layout).not.toBeNull();
      const stack = (layout?.trays ?? [])
        .filter((t) => t.part === "tray")
        .sort((a, b) => a.level - b.level);
      expect(stack.map((t) => t.key)).toEqual(["big:p0:0", "mid:p0:0", "tiny:p0:0"]);
    });
  });

  describe("fillers and finger cuts (spec §6.4)", () => {
    // A tray with a cut on its front wall (`comp` default for a narrow part), and a box with room
    // for a filler beside it on one axis only.
    const cutAt = (side: "front" | "back" | "left" | "right") => ({
      ...comp({ minW: 60, minD: 40, minH: 10 }),
      features: [
        { type: "wallCutout" as const, side, depthFraction: CHANNEL_DEPTH, floorNotch: false },
      ],
    });
    const withCut = (side: "front" | "back" | "left" | "right") =>
      req("cut", [variant("v", [part("cut:p0:0", [cutAt(side)], false)])]);
    const run = (side: "front" | "back" | "left" | "right", box: Record<string, number>) => {
      const c = createCtx(makeInput([withCut(side)], { box }), fakeMeasure);
      const plan = evaluate(c, { root: leaf([item(0)]), variants: [0] });
      return { plan, score: scorePlan(c, plan) };
    };

    it("counts a cut wall with a filler against it, not one with a filler at another face", () => {
      // 40 mm of slack along X, none along Y: the filler stands against the right wall
      const alongX = { innerWidth: 110, innerDepth: 46 };
      expect(run("right", alongX).plan.leftovers.length).toBe(1);
      expect(run("right", alongX).score.terms.sealed).toBe(1);
      expect(run("front", alongX).score.terms.sealed).toBe(0);
      expect(run("left", alongX).score.terms.sealed).toBe(0);
    });

    it("prefers the layout with no sealed cut by exactly its weight, all else equal", () => {
      const alongX = { innerWidth: 110, innerDepth: 46 };
      const sealed = run("right", alongX).score;
      const clear = run("front", alongX).score;
      expect(clear.terms.leftover).toBe(sealed.terms.leftover);
      expect(sealed.total - clear.total).toBe(WEIGHTS.sealed);
    });

    it("counts only a filler within reach of the wall", () => {
      const alongX = { innerWidth: 110, innerDepth: 46 };
      const { plan } = run("right", alongX);
      const c = createCtx(makeInput([withCut("right")], { box: alongX }), fakeMeasure);
      const far = plan.leftovers.map((l) => ({ ...l, x: l.x + Math.round(SEAL_REACH_MM * 100) }));
      expect(scorePlan(c, { ...plan, leftovers: far }).terms.sealed).toBe(0);
    });

    it("yields when there is no other face: a layout that must seal a cut still comes out", () => {
      // Slack only along X and the only tray cut on both X walls: any layout seals one.
      const both = req("cut", [
        variant("v", [
          part(
            "cut:p0:0",
            [
              {
                ...comp({ minW: 60, minD: 40, minH: 10 }),
                features: (["left", "right"] as const).map((side) => ({
                  type: "wallCutout" as const,
                  side,
                  depthFraction: CHANNEL_DEPTH,
                  floorNotch: false,
                })),
              },
            ],
            false,
          ),
        ]),
      ]);
      const input = makeInput([both], { box: { innerWidth: 110, innerDepth: 46 } });
      const { layout } = optimize(input, 1, 5_000);
      expect(layout).not.toBeNull();
      expect(layout?.trays.some((t) => t.part === "leftover")).toBe(true);
      const c = createCtx(input, fakeMeasure);
      const plan = evaluate(c, { root: leaf([item(0)]), variants: [0] });
      expect(scorePlan(c, plan).terms.sealed).toBeGreaterThan(0);
      expect(scorePlan(c, plan).overflow).toBe(0);
    });

    it("stays below an extra printed part and above a moved tray, so it never buys a part", () => {
      expect(WEIGHTS.sealed).toBeLessThan(WEIGHTS.trays);
      expect(WEIGHTS.sealed).toBeGreaterThan(WEIGHTS.moved);
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

  it("counts the room beside an alike tray that is too thin for a filler as left over", () => {
    const cell = comp({ minW: 50, minD: 40, minH: 10, elastic: { w: true, d: true } });
    const set = req("c", [variant("v", [part("c:p0:0", [cell]), part("c:p1:0", [cell])])]);
    const ctx = createCtx(
      makeInput([set], { box: { innerWidth: 56, innerDepth: 46 } }),
      fakeMeasure,
      // the plan as the search scores it: growth is the last step, and with it on the copy would
      // be given the 2 mm (a copy of a set grows with its set) and nothing would be left over
      { growth: false },
    );
    const plan = evaluate(ctx, {
      root: leaf([{ req: 0, variant: 0, part: 0, rotated: false }]),
      variants: [0],
    });
    expect(plan.air.length).toBeGreaterThan(0);
    const bare = scorePlan(ctx, { ...plan, air: [] });
    const empty = scorePlan(ctx, plan);
    expect(empty.terms.leftover).toBeGreaterThan(bare.terms.leftover);
    expect(empty.overflow).toBe(0);
    // and the tray can shift in it: 2 mm of play against the limit of 1.5, where the box's own
    // clearance alone is 1 mm
    expect(plan.playX).toBe(200);
    expect(plan.playY).toBe(200);
    expect(empty.terms.play).toBeGreaterThan(0);
  });

  it("counts the room every copy is made to take under a wider tray of another kind as walls swollen beyond need", () => {
    const cell = comp({ minW: 50, minD: 40, minH: 10 });
    const set = req("c", [variant("v", [part("c:p0:0", [cell]), part("c:p1:0", [cell])])]);
    const ctx = createCtx(makeInput([set, boxReq("o", 100, 60, 20)]), fakeMeasure);
    const copy = { req: 0, variant: 0, part: 0, rotated: false };
    const other = { ...copy, part: 1 };
    const under = scorePlan(
      ctx,
      evaluate(ctx, { root: cut("x", leaf([copy, item(1)]), leaf([other])), variants: [0, 0] }),
    );
    const beside = scorePlan(
      ctx,
      evaluate(ctx, { root: cut("x", leaf([copy, other]), leaf([item(1)])), variants: [0, 0] }),
    );
    // both are feasible, and copies are one size either way; the wider one costs
    expect(under.overflow).toBe(0);
    expect(beside.overflow).toBe(0);
    expect(under.terms.swollen).toBeGreaterThan(beside.terms.swollen);
    expect(under.total).toBeGreaterThan(beside.total);
  });
});
