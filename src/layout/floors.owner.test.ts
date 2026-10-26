// src/layout/floors.owner.test.ts
// The owner's Star Realms file (test/fixtures/star-realms-owner-5.json, 2026-10-23): "why is the
// floor thickness different on trays of the same deck?" Its Starter deck stands in one stack with
// the Counter under it, four lipped or grooved trays. The stored plan gave them floors of 1.26,
// 1.25, 2.35 and 11.95 mm for a Floor setting of 1.2: the Counter and Deck 1 only because their
// heights are rounded up to the 0.2 mm layer, Deck 2 because an upper tray was at least 5 mm high
// (lip 2 + 3) for 2.65 mm of cards, and Deck 3 because it carries the stack's padding. Printed, the
// Trade deck stood on 1.23 mm (6.43 mm of padding less the 6.4 mm riser). Now the height a tray has
// beyond its cards is air above them, and only the padding is a raised floor.
//
// Then "trays higher than they need to be; the height should all go into the riser" (same day): an
// upper tray is now only as high as its groove needs (3.65 mm), so the 5-card decks stand 4 mm
// high (3.85 mm of floor and cards, to a layer) and the riser under the stack grows from 9.6 to
// 11.6 mm.
import { describe, expect, it } from "vitest";
import owner5 from "../../test/fixtures/star-realms-owner-5.json";
import { planTray } from "../geometry/plan";
import { isOlderGeometryLine } from "../geometry/version";
import { lipAbove, upperTrayMinH } from "../model/lip";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import type { Project, TraySpec } from "../model/types";
import { size } from "../sizing";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { printableParts } from "./printable";

// The file was made with the old Standard card clearances (1.5 and 1 mm); the defaults are now 3 and
// 2 mm (schema 0.4.0 migrates them). This test is about the joints, not card sizing, so it keeps the
// old numbers in its own copy of the settings.
const OLD_CLEARANCES = { cardClearance: 1.5, cardStackClearance: 1 };

function owner(): Project {
  const parsed = parseProject(owner5);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return { ...parsed.project, settings: { ...parsed.project.settings, ...OLD_CLEARANCES } };
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
    // Counter, a 5-card deck (4 mm: 1.2 mm of floor, 2.65 mm of well, to a 0.2 mm layer), Deck 1,
    // the other 5-card deck with the stack's padding. The optimizer stacks them in this order (the
    // stack's order is the search's, not a rule). All three decks carry the rim, the top one too
    // (0.21.0: the split parts of one item stack in any order), so the top deck stands 2 mm lower.
    expect(starter.map((t) => [t.h, t.lip])).toEqual([
      [8.2, true],
      [4, true],
      [7.2, true],
      [13.6, true],
    ]);
  });

  it("stores the Floor setting under every tray's cards, and only the padding above it", () => {
    const starter = trays(plan)
      .filter((t) => t.stack === 0)
      .sort((a, b) => a.level - b.level);
    // Counter (8.2 = 8.14 rounded up to a layer), Deck 1 (7.2 = 7.15), a 5-card deck (4 = 3.85
    // rounded up): all on the normal floor. The other 5-card deck carries the stack's 9.6 mm of
    // padding (the top deck's rim takes 2 mm of the 11.6 there was).
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
    // riser 9.6, then 8.2, 4, 7.2 and 4 = 33, and the top deck's 2 mm rim to 35
    expect(printed.map((t) => [t.z, t.h])).toEqual([
      [9.6, 8.2],
      [17.8, 4],
      [21.8, 7.2],
      [29, 4],
    ]);
  });

  it("makes the 5-card decks only as high as they need, and the riser takes the rest", () => {
    const printed = printableParts(plan, inputsOf(p));
    const least = upperTrayMinH(p.settings);
    expect(least).toBeCloseTo(3.65, 9);
    const stack0 = trays(printed.trays)
      .filter((t) => t.stack === 0)
      .sort((a, b) => a.z - b.z);
    const riser = printed.trays.find((t) => t.part === "riser" || t.merged);
    expect(riser).toBeDefined();
    // the two 5-card decks (Deck 2 and Deck 3) are 4 mm: 1.2 mm of floor and 2.65 mm of cards,
    // up to the 0.2 mm layer, and no lower than their groove allows; they were 5 mm
    const decks = stack0.filter((t) => t.h < 5);
    expect(decks.map((t) => t.h)).toEqual([4, 4]);
    for (const t of decks) {
      expect(t.h).toBeGreaterThanOrEqual(least);
      expect(() => planTray(t, p.settings), t.key).not.toThrow();
    }
    // 2 mm of height that was air in two trays is 2 mm more riser, less the 2 mm of the top deck's rim
    expect(stack0[0]?.z).toBe(9.6);
    // every printed part is one the builder accepts, and the stack still reaches the box's top
    for (const t of printed.trays) {
      expect(() => planTray(t, p.settings), t.key).not.toThrow();
    }
    const top = Math.max(...stack0.map((t) => t.z + t.h));
    expect(top + lipAbove(p.settings, true)).toBeCloseTo(35, 9);
  });

  it("gives a tray with headroom a finger cut as deep as its well", () => {
    // a 5-card deck stands 4 mm high on a 1.2 mm floor: 2.8 mm of well for 1.6 mm of cards
    const deck2 = trays(plan).find((t) => t.stack === 0 && t.h === 4);
    expect(deck2).toBeDefined();
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
    // the riser is derived at print time, so the old plan gets the lower upper-tray minimum too
    expect(printed.map((t) => t.z).sort((a, b) => a - b)).toEqual([11.6, 19.8, 27, 31]);
  });
});
