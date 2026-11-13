import { describe, expect, it } from "vitest";
import combinedLegacy from "../../test/fixtures/legacy/combined.json";
import groupedLegacy from "../../test/fixtures/legacy/grouped-space.json";
import hashes from "../../test/fixtures/legacy/hashes.json";
import perPlayerLegacy from "../../test/fixtures/legacy/per-player.json";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import type { Component, Group } from "../model/types";
import { size } from "../sizing";
import { bulk, inGroup } from "../sizing/test-helpers";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { createRun } from "./optimize";
import { scorePlan } from "./score";
import { fixtureInput } from "./test-fixtures";
import { comp, fakeMeasure, fakeRealize, makeInput, part, req, variant } from "./test-utils";
import { cut, leaf, type Tree } from "./tree";
import type { LayoutInput, LayoutResult } from "./types";

// Groups spec §6.3: a group stays in one tray per copy unless a whole tray cannot fit, and the
// trays of one copy that has to split keep to one stack. Both terms come from 0.5.3 and are keyed
// by the requirement and the copy, so a group (one requirement, copies p0..pC-1) inherits them.

const run = (input: LayoutInput, seed = 1): LayoutResult => {
  const r = createRun(input, seed, 20_000);
  while (!r.step()) {
    // to the end of the budget
  }
  return r.result();
};

/** The real sizing of `members` as one group of `copies`, laid out in the cards-heavy box. */
function grouped(
  members: Component[],
  copies: number,
  over: Partial<LayoutInput["printer"]> = {},
): LayoutInput {
  const base = fixtureInput("cards-heavy");
  const group: Group = inGroup(members, "g", { name: "Kit", copies });
  const { requirements } = size(members, base.settings, [group]);
  return { ...base, requirements, locks: [], printer: { ...base.printer, ...over } };
}

const tokens = (): Component[] => [
  bulk({ id: "b1", name: "Tokens", items: [{ name: "T", count: 40, w: 15, d: 15, h: 5 }] }),
  bulk({ id: "b2", name: "Coins", items: [{ name: "C", count: 40, w: 20, d: 20, h: 3 }] }),
];

const parts = (r: LayoutResult) => (r.layout?.trays ?? []).filter((t) => t.part === "tray");

describe("a group that fits whole is never split", () => {
  it("the tokens probe: two bulk members split2 used to separate sit in one tray per copy", () => {
    for (const copies of [1, 2]) {
      const input = grouped(tokens(), copies);
      const variantIds = input.requirements[0]?.variants.map((v) => v.id) ?? [];
      expect(variantIds.some((id) => id.endsWith("split2"))).toBe(true);
      expect(createCtx(input).wholeFits).toEqual([true]);
      const result = run(input);
      expect(result.layout).not.toBeNull();
      expect(
        parts(result)
          .map((t) => t.key)
          .sort(),
      ).toEqual(Array.from({ length: copies }, (_, c) => `g:p${c}:0`));
    }
  });

  // Two 40 × 60 wells per copy: one 84 × 64 tray, or two 44 × 64 trays (fakeMeasure), two copies
  // in a 92 × 140 × 45 box. On packing alone the halves win: four trays on the floor tile 88 × 128
  // where two whole trays tile 84 × 128, so less of the box is left over, even at the price of
  // each copy's two parts standing in two stacks. Only the split term (two extra parts in all,
  // 600 000) keeps them whole. Without it this test fails (checked by setting the weight to 0).
  const well = (c: string) => comp({ minW: 40, minD: 60, minH: 20, contents: c });
  const kit = req("g", [
    variant(
      "halves",
      [0, 1].flatMap((c) => [part(`g:p${c}:0`, [well("a")]), part(`g:p${c}:1`, [well("b")])]),
    ),
    variant(
      "whole",
      [0, 1].map((c) => part(`g:p${c}:0`, [well("a"), well("b")])),
    ),
  ]);
  const noLip = { lip: { ...makeInput([]).settings.lip, joint: "off" as const } };
  const box = { innerWidth: 92, innerDepth: 140, innerHeight: 45 };

  it("holds for copies: the whole variant, and the split term charges per copy", () => {
    const input = makeInput([kit], { box, settings: noLip });
    const ctx = createCtx(input, fakeMeasure);
    expect(ctx.wholeFits).toEqual([true]);
    expect(ctx.extraParts(0, 0)).toBe(2); // one extra part in each of two copies
    expect(ctx.extraParts(0, 1)).toBe(0);
    for (const seed of [1, 2, 3]) {
      const r = createRun(input, seed, 20_000, { measure: fakeMeasure, realize: fakeRealize });
      while (!r.step()) {
        // to the end of the budget
      }
      expect(
        parts(r.result())
          .map((t) => t.key)
          .sort(),
      ).toEqual(["g:p0:0", "g:p1:0"]);
    }
  });
});

describe("split is free when no whole variant fits", () => {
  // A 120 × 120 mm bed (110 usable) holds no tray of the tokens group whole (about 70 × 140 mm
  // in every variant), but each member's tray on its own.

  it("splits each copy and the split term charges nothing", () => {
    const input = { ...grouped(tokens(), 2, { bedX: 120, bedY: 120 }) };
    const ctx = createCtx(input);
    expect(ctx.wholeFits).toEqual([false]);
    const split = input.requirements[0]?.variants.findIndex((v) => v.parts.length > 2) ?? -1;
    expect(split).toBeGreaterThan(-1);
    expect(ctx.extraParts(0, split)).toBeGreaterThan(0);
    const keyed = (c: number) =>
      (input.requirements[0]?.variants[split]?.parts ?? []).filter((p) =>
        p.trayKey.startsWith(`g:p${c}:`),
      );
    const all: Tree = {
      root: leaf(
        (input.requirements[0]?.variants[split]?.parts ?? []).map((_, p) => ({
          req: 0,
          variant: split,
          part: p,
          rotated: false,
        })),
      ),
      variants: [split],
    };
    expect(keyed(0).length).toBeGreaterThan(1);
    expect(scorePlan(ctx, evaluate(ctx, all)).terms.split).toBe(0);
    const result = run(input);
    expect(result.layout).not.toBeNull();
    for (const c of [0, 1]) {
      expect(parts(result).filter((t) => t.key.startsWith(`g:p${c}:`)).length).toBeGreaterThan(1);
    }
  });
});

describe("a copy's parts share one stack when possible", () => {
  it("keeps each copy's two parts in one stack when the box has three places for three copies", () => {
    // 230 × 80 mm holds three trays side by side and no more; a stack is one copy's two parts
    const base = grouped(tokens(), 3, { bedX: 120, bedY: 120 });
    const input = { ...base, box: { ...base.box, innerWidth: 230, innerDepth: 80 } };
    expect(createCtx(input).wholeFits).toEqual([false]);
    for (const seed of [1, 2, 3]) {
      const result = run(input, seed);
      expect(result.layout).not.toBeNull();
      for (const c of [0, 1, 2]) {
        const mine = parts(result).filter((t) => t.key.startsWith(`g:p${c}:`));
        expect(mine).toHaveLength(2);
        expect(new Set(mine.map((t) => t.stack)).size).toBe(1);
      }
      expect(new Set(parts(result).map((t) => t.stack)).size).toBe(3);
    }
  });

  // Copies of a split group in their own stacks are no penalty: `apart` counts one copy's trays.
  const g = req(
    "g",
    [
      variant(
        "split2",
        [0, 1, 2, 3].flatMap((c) => [
          part(`g:p${c}:0`, [comp({ minW: 40, minD: 40, minH: 10, contents: "a" })]),
          part(`g:p${c}:1`, [comp({ minW: 40, minD: 40, minH: 10, contents: "b" })]),
        ]),
      ),
      variant(
        "split1",
        [0, 1, 2, 3].map((c) =>
          part(`g:p${c}:0`, [
            comp({ minW: 40, minD: 40, minH: 10, contents: "a" }),
            comp({ minW: 40, minD: 40, minH: 10, contents: "b" }),
          ]),
        ),
      ),
    ],
    { access: "often" },
  );
  const ctx = createCtx(makeInput([g]), fakeMeasure);
  const piece = (p: number) => ({ req: 0, variant: 0, part: p, rotated: false });
  const stacks = (...s: number[][]): Tree["root"] => {
    let root: Tree["root"] = leaf((s[s.length - 1] ?? []).map(piece));
    for (let i = s.length - 2; i >= 0; i--) {
      root = cut("x", leaf((s[i] ?? []).map(piece)), root);
    }
    return root;
  };
  const score = (...s: number[][]) =>
    scorePlan(ctx, evaluate(ctx, { root: stacks(...s), variants: [0] })).terms;
  // parts: copy 0 = 0,1; copy 1 = 2,3; copy 2 = 4,5; copy 3 = 6,7

  it("counts nothing for four copies in four stacks, each copy's parts together", () => {
    expect(score([0, 1], [2, 3], [4, 5], [6, 7]).apart).toBe(0);
    expect(score([0, 1, 2, 3, 4, 5, 6, 7]).apart).toBe(0);
  });

  it("counts one per extra stack of one copy, and not for sharing a stack with another copy", () => {
    expect(score([0, 2], [1, 3], [4, 5], [6, 7]).apart).toBe(2);
    expect(score([0, 1, 2], [3, 4, 5, 6, 7]).apart).toBe(1);
    expect(score([0], [1], [2, 3], [4, 5], [6, 7]).apart).toBe(1);
  });

  it("charges the split once per copy: parts per copy minus one, summed over the copies", () => {
    expect(ctx.wholeFits).toEqual([true]);
    expect(ctx.extraParts(0, 0)).toBe(4);
    expect(score([0, 1], [2, 3], [4, 5], [6, 7]).split).toBe(4);
  });
});

describe("stored 0.6 plans", () => {
  const open = (raw: unknown) => {
    const r = parseProject(structuredClone(raw));
    if (!r.ok) {
      throw new Error(r.error);
    }
    return r.project;
  };

  it("a per-player plan opens stale, once: its stored hash is the old one, the migrated project's is new", () => {
    // It used to open current (stored hash = the migrated project's). Schema 0.3.0 put the planning
    // model (growth as the last step) into every hash, so every stored plan is stale once, by
    // design; the stored hash is still the one it was made with, and the migrated project's
    // is the one pinned here (changes only with what the hash covers, as in hash.test.ts).
    const p = open(perPlayerLegacy);
    expect(p.layout).toBeDefined();
    expect(p.layout?.inputsHash).toBe(hashes["per-player"]);
    expect(inputsHash(p)).not.toBe(hashes["per-player"]);
    expect(inputsHash(p)).toBe("1ce59432cfce96");
    expect(p.layout?.inputsHash).not.toBe(inputsHash(p));
  });

  it("grouped-space and combined plans open stale", () => {
    for (const raw of [groupedLegacy, combinedLegacy]) {
      const p = open(raw);
      expect(p.layout).toBeDefined();
      expect(p.layout?.inputsHash).not.toBe(inputsHash(p));
    }
  });
});
