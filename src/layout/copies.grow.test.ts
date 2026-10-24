// src/layout/copies.grow.test.ts
// Copies stay alike (hard rule 9) when their item asks for "as much as fits" (owner, 2026-10-23):
// if one copy's well grows, every copy's does, by the same amount.
import { describe, expect, it } from "vitest";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import { builtLevel } from "../model/lip";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import type { Project, TraySpec } from "../model/types";
import { size } from "../sizing";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { splitRisers } from "./risers";
import { checkHardRules } from "./test-hard-rules";
import type { LayoutInput } from "./types";

type Raw = Record<string, unknown>;

function projectOf(box: Partial<Project["box"]>, components: Raw[]): Project {
  const base = bitsHeavy as unknown as Raw;
  const parsed = parseProject({
    ...base,
    box: { ...(base.box as Raw), headroom: 0, ...box },
    components,
    groups: [],
    layout: undefined,
  });
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

const inputOf = (p: Project): LayoutInput => ({
  requirements: size(p.components, p.settings, p.groups).requirements,
  box: p.box,
  printer: p.printer,
  settings: p.settings,
  locks: p.locks,
  inputsHash: inputsHash(p),
  appVersion: "0.0.0-test",
});

const bits = (copies: number, over: Raw = {}): Raw => ({
  id: "b",
  name: "Bits",
  access: "sometimes",
  kind: "bulk",
  copies,
  items: [{ name: "", count: 15, w: 15, d: 15, h: 3 }],
  ...over,
});

const shape = (t: TraySpec): string =>
  JSON.stringify([
    t.rotated ? [t.d, t.w] : [t.w, t.d],
    t.h,
    t.lip,
    builtLevel(t) > 0,
    t.compartments.map((c) => [...(t.rotated ? [c.d, c.w] : [c.w, c.d]), c.floorZ, c.kind]).sort(),
  ]);

function planned(p: Project, seed: number) {
  const input = inputOf(p);
  const result = optimize(input, seed, DEFAULT_ITERATIONS);
  if (!result.layout) {
    throw new Error("no layout");
  }
  const printed = splitRisers(result.layout.trays, {
    settings: p.settings,
    printer: p.printer,
    locks: p.locks,
  });
  return { input, result, printed, trays: result.layout.trays };
}

const copiesOf = (list: readonly TraySpec[]): TraySpec[] =>
  list.filter((t) => t.part === "tray" && t.key.startsWith("b:"));
const area = (t: TraySpec): number => t.w * t.d;
const box = { innerWidth: 280, innerDepth: 200, innerHeight: 40 };

describe("copies that ask for as much as fits", { timeout: 180_000 }, () => {
  it("grow together: eight copies are one size and one set of wells, bigger than the plain ones", () => {
    // Whether the copies can grow depends on the plan the search found: every place of the set has
    // to have room beside its tray (about 5 seeds in 8 do); seed 4 is one that does and tiles.
    const plain = planned(projectOf(box, [bits(8)]), 4);
    const grown = planned(projectOf(box, [bits(8, { room: "max" })]), 4);
    const copies = copiesOf(grown.printed);
    expect(copies).toHaveLength(8);
    expect(new Set(copies.map(shape)).size).toBe(1);
    expect(Math.max(...copiesOf(grown.trays).map(area))).toBeGreaterThan(
      Math.max(...copiesOf(plain.trays).map(area)),
    );
    expect(grown.result.layout && checkHardRules(grown.input, grown.result.layout, [])).toEqual([]);
  });

  it("leave the copies of an item that asked for none at their natural size, with spacers between", () => {
    const plain = planned(projectOf(box, [bits(8)]), 1);
    expect(Math.max(...copiesOf(plain.trays).map((t) => Math.max(t.w, t.d)))).toBeLessThan(60);
    expect(plain.trays.some((t) => t.part === "leftover")).toBe(true);
  });
});
