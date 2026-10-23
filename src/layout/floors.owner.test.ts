// src/layout/floors.owner.test.ts
// The owner's Star Realms file (test/fixtures/star-realms-owner-5.json, 2026-10-23): "why is the
// floor thickness different on trays of the same deck?" Its Starter deck stands in one stack with
// the Counter under it, four lipped or grooved trays. The stored plan gave them floors of 1.26,
// 1.25, 2.35 and 11.95 mm for a Floor setting of 1.2: the Counter and Deck 1 only because their
// heights are rounded up to the 0.2 mm layer, Deck 2 because an upper tray is at least 5 mm high
// (lip 2 + 3) for 2.65 mm of cards, and Deck 3 because it carries the stack's padding. Printed, the
// Trade deck stood on 1.23 mm (6.43 mm of padding less the 6.4 mm riser). Now the height a tray has
// beyond its cards is air above them, and only the padding is a raised floor.
import { describe, expect, it } from "vitest";
import owner5 from "../../test/fixtures/star-realms-owner-5.json";
import { isOlderGeometryLine } from "../geometry/version";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import type { Project, TraySpec } from "../model/types";
import { size } from "../sizing";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { printableParts } from "./printable";

function owner(): Project {
  const parsed = parseProject(owner5);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

/** The stored plan the optimizer makes for the file today (seed 1, as auto-storage.test.ts). */
function stored(p: Project): TraySpec[] {
  const result = optimize(
    {
      requirements: size(p.components, p.settings).requirements,
      box: p.box,
      printer: p.printer,
      settings: p.settings,
      locks: p.locks,
      inputsHash: inputsHash(p),
      appVersion: "0.0.0-test",
    },
    1,
    DEFAULT_ITERATIONS,
  );
  if (!result.layout) {
    throw new Error("the owner's file no longer fits");
  }
  return result.layout.trays;
}

const inputsOf = (p: Project) => ({
  components: p.components,
  settings: p.settings,
  printer: p.printer,
  locks: p.locks,
});

const floors = (t: TraySpec): number[] => t.compartments.map((c) => c.floorZ);
const trays = (list: readonly TraySpec[]) => list.filter((t) => t.part === "tray");

describe("the owner's Star Realms file: one floor under every tray", { timeout: 60_000 }, () => {
  const p = owner();
  const plan = stored(p);

  it("is the file the owner described (the guard for everything below)", () => {
    expect(p.settings.floor).toBe(1.2);
    expect(p.settings.minRiser).toBe(3);
    expect(p.printer.layerHeight).toBe(0.2);
    const starter = trays(plan)
      .filter((t) => t.stack === 0)
      .sort((a, b) => a.level - b.level);
    expect(starter.map((t) => [t.h, t.lip])).toEqual([
      [8.2, true],
      [7.2, true],
      [5, true],
      [14.6, false],
    ]);
  });

  it("stores the Floor setting under every tray's cards, and only the padding above it", () => {
    const starter = trays(plan)
      .filter((t) => t.stack === 0)
      .sort((a, b) => a.level - b.level);
    // Counter (8.2 = 8.14 rounded up to a layer), Deck 1 (7.2 = 7.15), Deck 2 (5 for 2.65 mm of
    // cards): all on the normal floor. Deck 3 carries the stack's 9.6 mm of padding.
    expect(starter.map(floors)).toEqual([[1.2], [1.2], [1.2], [10.8]]);
    const trade = trays(plan).filter((t) => t.stack === 1);
    // 35 mm for 28.57 mm of contents: 6.4 mm of padding, the 0.03 mm over a layer is headroom
    expect(trade.map(floors)).toEqual([[7.6]]);
  });

  it("prints every tray on the Floor setting: the riser takes all the padding", () => {
    const printed = printableParts(plan, inputsOf(p));
    const all = trays(printed.trays);
    expect(all).toHaveLength(5);
    for (const t of all) {
      expect(floors(t), t.key).toEqual([p.settings.floor]);
    }
  });

  it("keeps the stacks' heights: nothing moves for the floors", () => {
    const printed = trays(printableParts(plan, inputsOf(p)).trays)
      .filter((t) => t.stack === 0)
      .sort((a, b) => a.level - b.level);
    // riser 9.6, then 8.2, 7.2, 5 and 5 = 35
    expect(printed.map((t) => [t.z, t.h])).toEqual([
      [9.6, 8.2],
      [17.8, 7.2],
      [25, 5],
      [30, 5],
    ]);
  });

  it("gives a tray with headroom a finger cut as deep as its well", () => {
    // Deck 2 stands 5 mm high on a 1.2 mm floor: 3.8 mm of well for 1.6 mm of cards
    const deck2 = trays(plan).find((t) => t.stack === 0 && t.level === 2);
    expect(deck2?.compartments[0]?.features.filter((f) => f.type === "wallCutout")).not.toEqual([]);
    for (const f of deck2?.compartments[0]?.features ?? []) {
      if (f.type === "wallCutout") {
        expect(f.depth).toBeCloseTo((deck2?.h ?? 0) - 1.2, 9);
      }
    }
  });

  it("still loads and prints the plan the file stored: old floors are kept as they were", () => {
    expect(p.layout).toBeDefined();
    // made with geometry 0.8.5: an older line now (the riser has the lip), so the app asks for a
    // reprint, but the plan reads and prints
    expect(p.layout?.geometryVersion).toBe("0.8.5");
    expect(isOlderGeometryLine(p.layout?.geometryVersion ?? "")).toBe(true);
    const oldPlan = p.layout?.trays ?? [];
    const deck2 = trays(oldPlan).find((t) => t.stack === 0 && t.level === 2);
    expect(floors(deck2 as TraySpec)).toEqual([2.35]);
    const printed = trays(printableParts(oldPlan, inputsOf(p)).trays).filter((t) => t.stack === 0);
    expect(printed.map((t) => t.z).sort((a, b) => a - b)).toEqual([9.6, 17.8, 25, 30]);
  });
});
