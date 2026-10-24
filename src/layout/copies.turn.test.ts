// src/layout/copies.turn.test.ts
// "We add additional spacer instead of making the existing one thicker" (owner, 2026-10-24, the
// Scythe project's Faction group: one of six copies stood turned a quarter turn, which left a thin
// sliver of room beside it as a spacer of its own, while the room at the row's end was a second
// one). The copies of an item or a group are a set of alike trays; they face the same way where
// everything still fits, so the room beside them gathers in the one spacer at the end of the row.
import { describe, expect, it } from "vitest";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import scythe from "../../test/fixtures/turned-copies/scythe-faction.insert.json";
import { buildLayoutInput } from "../app/runner";
import { parseProject } from "../model/schema";
import type { Project, StoredLayout, TraySpec } from "../model/types";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { createRng } from "./prng";
import { checkHardRules } from "./test-hard-rules";
import { rotateItem, setsOf, turnSet, type MoveEnv } from "./moves";
import { optimize } from "./optimize";
import { printableParts } from "./printable";
import { scorePlan } from "./score";
import { boxReq, comp, fakeMeasure, makeInput, part, req, variant } from "./test-utils";
import { leaf, leaves, type StackItem, type Tree } from "./tree";

type Raw = Record<string, unknown>;

function projectOf(raw: Raw): Project {
  const parsed = parseProject(raw);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

/** Spacers as they are printed: fillers beside each other are one part. */
function printedSpacers(p: Project, trays: readonly TraySpec[]): TraySpec[] {
  return printableParts(trays, {
    components: p.components,
    settings: p.settings,
    printer: p.printer,
    locks: p.locks,
  }).trays.filter((t) => t.part === "spacer" || t.part === "leftover");
}

describe("turning a set of alike trays", () => {
  // Three copies of one tray that is not square, and one single tray
  const copies = req("k", [
    variant(
      "three",
      [0, 1, 2].map((c) => part(`k:p${c}:0`, [comp({ minW: 40, minD: 70, minH: 10 })])),
    ),
  ]);
  const ctx = createCtx(makeInput([copies, boxReq("s", 30, 30, 10)]), fakeMeasure);
  const at = (r: number, p: number, rotated: boolean): StackItem => ({
    req: r,
    variant: 0,
    part: p,
    rotated,
  });
  const env = (fixed: number[] = [], turns = new Map<number, boolean>()): MoveEnv => ({
    ctx,
    lockedPaths: [],
    variantPinned: [false, false],
    rotationFixed: new Set(fixed.map((p) => ctx.partId(at(0, p, false)))),
    turns,
  });
  const tree = (rotated: boolean[]): Tree => ({
    root: {
      kind: "cut",
      axis: "x",
      share: 0,
      a: leaf([at(0, 0, rotated[0] ?? false)]),
      b: {
        kind: "cut",
        axis: "x",
        share: 0,
        a: leaf([at(0, 1, rotated[1] ?? false)]),
        b: {
          kind: "cut",
          axis: "x",
          share: 0,
          a: leaf([at(0, 2, rotated[2] ?? false)]),
          b: leaf([at(1, 0, false)]),
        },
      },
    },
    variants: [0, 0],
  });
  const turnedOf = (t: Tree, r = 0): boolean[] =>
    leaves(t.root)
      .flatMap((l) => l.leaf.stack)
      .filter((i) => i.req === r)
      .sort((a, b) => a.part - b.part)
      .map((i) => i.rotated);

  it("knows the copies as one set, and the single tray as none", () => {
    expect(setsOf(tree([false, false, false]).root, ctx)).toHaveLength(1);
  });

  it("turns every copy the same way at once, and sets a mixed set straight", () => {
    const set = ctx.alikeOf(at(0, 0, false));
    expect(turnedOf(turnSet(tree([false, false, false]), env(), set, false) as Tree)).toEqual([
      true,
      true,
      true,
    ]);
    // one copy turned alone: the others are turned like it, or it like them, never left mixed
    const mixed = tree([true, false, false]);
    expect(turnedOf(turnSet(mixed, env(), set, true, false) as Tree)).toEqual([
      false,
      false,
      false,
    ]);
    expect(turnedOf(turnSet(mixed, env(), set, false, true) as Tree)).toEqual([true, true, true]);
  });

  it("follows a copy that a pin or a turn lock holds, and leaves the single tray alone", () => {
    const set = ctx.alikeOf(at(0, 0, false));
    const held = tree([true, false, false]);
    // copy 0 is held turned: the rest turn to match it, whatever the target asked for
    const next = turnSet(held, env([0]), set, false, false) as Tree;
    expect(turnedOf(next)).toEqual([true, true, true]);
    expect(turnedOf(next, 1)).toEqual([false]);
    // nothing to do when they already match the held one
    expect(turnSet(next, env([0]), set, true)).toBeNull();
  });

  it("does not move a set whose held copies disagree", () => {
    const set = ctx.alikeOf(at(0, 0, false));
    expect(turnSet(tree([true, false, false]), env([0, 1]), set, false)).toBeNull();
  });

  it("is what turning one of the copies does, most of the time", () => {
    let whole = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const t = rotateItem(tree([false, false, false]), env(), createRng(seed));
      const turned = t === null ? [] : turnedOf(t);
      if (turned.length === 3 && turned.every(Boolean)) {
        whole++;
      }
    }
    expect(whole).toBeGreaterThan(20);
  });

  it("scores copies facing different ways worse than copies alike", () => {
    const score = (rotated: boolean[]): number =>
      scorePlan(ctx, evaluate(ctx, tree(rotated))).terms.unturned;
    expect(score([false, false, false])).toBe(0);
    expect(score([true, true, true])).toBe(0);
    expect(score([true, false, false])).toBe(1);
  });
});

describe("the owner's Scythe project", { timeout: 120_000 }, () => {
  const project = projectOf(scythe as unknown as Raw);
  const stored = project.layout as StoredLayout;
  const factions = (trays: readonly TraySpec[]): TraySpec[] =>
    trays.filter((t) => t.part === "tray" && /^faction1:p\d+:0$/.test(t.key));

  /** The spacers beside the Faction row thinner than a finger: the room the odd copy leaves. */
  const slivers = (layout: StoredLayout): TraySpec[] => {
    const row = factions(layout.trays).filter((t) => t.level === 0);
    const top = Math.min(...row.map((t) => t.y));
    const bottom = Math.max(...row.map((t) => t.y + t.d));
    return layout.trays.filter(
      (s) =>
        (s.part === "leftover" || s.part === "spacer") &&
        s.y < bottom &&
        s.y + s.d > top &&
        Math.min(s.w, s.d) < 10,
    );
  };

  it("was stored with Faction turned two ways and a sliver spacer beside the odd copy", () => {
    expect(new Set(factions(stored.trays).map((t) => t.rotated)).size).toBe(2);
    expect(slivers(stored)).toHaveLength(1);
  });

  it("has all six Faction trays facing one way, and fewer spacers, once it runs again", () => {
    const input = buildLayoutInput(project);
    const result = optimize(input, 1, 3000, { warmStart: stored });
    const layout = result.layout as StoredLayout;
    expect(layout).not.toBeNull();
    const faction = factions(layout.trays);
    expect(faction).toHaveLength(6);
    expect(new Set(faction.map((t) => t.rotated)).size).toBe(1);
    expect(new Set(faction.map((t) => `${t.w}x${t.d}`)).size).toBe(1);
    expect(slivers(layout)).toEqual([]);
    expect(printedSpacers(project, layout.trays).length).toBeLessThan(
      printedSpacers(project, stored.trays).length,
    );
    expect(checkHardRules(input, layout, result.notices)).toEqual([]);
  });

  it("has them facing one way whichever joint Auto picks", () => {
    const raw = scythe as unknown as Raw;
    const settings = raw.settings as Raw;
    const auto = projectOf({
      ...raw,
      settings: { ...settings, lip: { ...(settings.lip as Raw), joint: "auto" } },
    });
    const result = optimize(buildLayoutInput(auto), 1, 6000, { warmStart: stored });
    const layout = result.layout as StoredLayout;
    expect(layout).not.toBeNull();
    expect(layout.joint === "rim" || layout.joint === "step").toBe(true);
    const faction = factions(layout.trays);
    expect(faction).toHaveLength(6);
    expect(new Set(faction.map((t) => t.rotated)).size).toBe(1);
  });

  it("is set straight by the last pass alone, with no search left to do it", () => {
    const result = optimize(buildLayoutInput(project), 1, 0, { warmStart: stored });
    const layout = result.layout as StoredLayout;
    expect(new Set(factions(layout.trays).map((t) => t.rotated)).size).toBe(1);
    expect(slivers(layout)).toEqual([]);
  });
});

describe("three copies of a two-member group", { timeout: 120_000 }, () => {
  const bulk = (id: string, name: string, n: number, w: number, d: number, h: number): Raw => ({
    id,
    name,
    access: "sometimes",
    kind: "bulk",
    items: [{ name: "", count: n, w, d, h }],
  });
  const kit = (w: number, d: number, h: number): Project => {
    const base = bitsHeavy as unknown as Raw;
    return projectOf({
      ...base,
      box: { ...(base.box as Raw), headroom: 0, innerWidth: w, innerDepth: d, innerHeight: h },
      components: [bulk("m1", "Wood", 20, 12, 12, 8), bulk("m2", "Stone", 12, 20, 10, 8)],
      groups: [{ id: "kit", name: "Kit", copies: 3, access: "sometimes", memberIds: ["m1", "m2"] }],
      layout: undefined,
      locks: [],
    });
  };

  for (const [w, d, h] of [
    [160, 100, 60],
    [200, 120, 40],
  ] as const) {
    it(`face the same way, hold the same wells and leave no sliver between them (${w} × ${d})`, () => {
      const p = kit(w, d, h);
      for (const seed of [1, 2, 3]) {
        const input = buildLayoutInput(p);
        const result = optimize(input, seed, 20_000);
        const layout = result.layout as StoredLayout;
        expect(layout, `seed ${seed}`).not.toBeNull();
        const trays = layout.trays.filter((t) => t.part === "tray");
        expect(trays).toHaveLength(3);
        // one rotation, and one arrangement of wells in the tray's own frame
        expect(new Set(trays.map((t) => t.rotated)).size, `seed ${seed}`).toBe(1);
        const wells = (t: TraySpec): string =>
          JSON.stringify(t.compartments.map((c) => [c.x, c.y, c.w, c.d, c.contents]).sort());
        expect(new Set(trays.map(wells)).size, `seed ${seed}`).toBe(1);
        // the room beside them: no sliver under 3 mm, between or beside the copies
        const spacers = printedSpacers(p, layout.trays);
        expect(spacers.filter((s) => Math.min(s.w, s.d) < 3)).toEqual([]);
        expect(checkHardRules(input, layout, result.notices)).toEqual([]);
      }
    });
  }

  it("is caught by the hard-rule check when a copy holds its wells in another arrangement", () => {
    const p = kit(160, 100, 60);
    const input = buildLayoutInput(p);
    const result = optimize(input, 2, 20_000);
    const layout = result.layout as StoredLayout;
    expect(checkHardRules(input, layout, result.notices)).toEqual([]);
    // the same two wells, side by side in one copy and swapped in another: same sizes, same total
    const swapped: StoredLayout = {
      ...layout,
      trays: layout.trays.map((t, i, all) => {
        const first = all.findIndex((o) => o.part === "tray");
        const [a, b] = t.compartments;
        if (i === first || t.part !== "tray" || !a || !b) {
          return t;
        }
        return {
          ...t,
          compartments: [
            { ...a, x: b.x, y: b.y },
            { ...b, x: a.x, y: a.y },
            ...t.compartments.slice(2),
          ],
        };
      }),
    };
    expect(checkHardRules(input, swapped, result.notices).join("\n")).toMatch(/alike trays/);
  });
});
