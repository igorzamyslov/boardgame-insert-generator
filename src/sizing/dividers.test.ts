import { describe, expect, it } from "vitest";
import { dividersOf, dividersOffered, withDividers } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { FeatureSpec, Settings } from "../model/types";
import { cardOptions } from "./cards";
import {
  DIVIDER_GROOVE,
  DIVIDER_PLAY,
  DIVIDER_THICKNESS,
  MIN_SECTION,
  PLATED_RETENTION,
  UNPLATED_RETENTION,
} from "./constants";
import { dividedWidth, dividerSlotWidth, dividerThickness, slotCentres } from "./dividers";
import { stackGrowthMm } from "./growth";
import { minOuter, realizeTray } from "./realize";
import { rotateRealized } from "./rotate";
import {
  assertTrayInvariants,
  at,
  bulk,
  cards,
  custom,
  minis,
  partOf,
  tiles,
} from "./test-helpers";
import { tileOptions } from "./tiles";
import type { CompartmentReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const ground = { lipped: false, level: 0 };
const SLOT = dividerSlotWidth(s);

type Slot = Extract<FeatureSpec, { type: "dividerSlot" }>;
const slotsOf = (features: readonly FeatureSpec[]): Slot[] =>
  features.flatMap((f) => (f.type === "dividerSlot" ? [f] : []));

function deck(c = cards(), settings = s, option = 0): CompartmentReq {
  return at(at(at(cardOptions(c, settings, 0).options, option).blocks, 0), 0);
}

describe("the slot and its dividers", () => {
  it("is a divider's thickness and the play wider, at least what the bottom chamfer needs", () => {
    expect(dividerThickness(s)).toBe(DIVIDER_THICKNESS);
    expect(SLOT).toBeCloseTo(DIVIDER_THICKNESS + DIVIDER_PLAY, 9);
    // a 1 mm chamfer wants 2 × (1 + 0.8) = 3.6 mm of plate
    expect(dividerThickness({ ...s, bottomChamfer: 1 })).toBe(3.6);
  });

  it("spaces the slots so the sections between them are equal", () => {
    // 100 mm of well from 10 mm, two 3.4 mm slots: three sections of 31.0666 → 31.06
    const centres = slotCentres(1000, 10000, 2, 340);
    expect(centres).toEqual([1000 + 3106 + 170, 1000 + 2 * 3106 + 340 + 170]);
    const [a, b] = [at(centres, 0), at(centres, 1)];
    const gaps = [a - 170 - 1000, b - 170 - (a + 170)];
    expect(gaps).toEqual([3106, 3106]);
  });

  it("makes a well no narrower than the stack and its slots, and no section under MIN_SECTION", () => {
    // 20 mm of deck, two slots: stack plus slots
    expect(dividedWidth(20, 2, s)).toBeCloseTo(20 + 2 * SLOT, 9);
    // 1.6 mm of deck, three dividers: four sections of MIN_SECTION and the slots
    expect(dividedWidth(1.6, 3, s)).toBeCloseTo(4 * MIN_SECTION + 3 * SLOT, 9);
  });
});

describe("which components can have dividers", () => {
  it("offers them to a deck or stack of tiles that stands up and may grow", () => {
    expect(dividersOffered(cards({ storage: "upright-long" }))).toBe(true);
    expect(dividersOffered(cards({ storage: "upright-short" }))).toBe(true);
    expect(dividersOffered(cards({ storage: "auto" }))).toBe(true);
    expect(dividersOffered(tiles({ storage: "upright" }))).toBe(true);
    expect(dividersOffered(tiles({ storage: "auto" }))).toBe(true);
  });

  it("does not offer them to flat storage, or to a stack that may not grow", () => {
    expect(dividersOffered(cards({ storage: "flat" }))).toBe(false);
    expect(dividersOffered(tiles({ storage: "flat" }))).toBe(false);
    expect(dividersOffered(cards({ growth: { stack: "off" } }))).toBe(false);
    expect(dividersOffered(tiles({ growth: { stack: "off" } }))).toBe(false);
  });

  it("does not offer them to bins, minis or custom wells", () => {
    expect(dividersOffered(bulk())).toBe(false);
    expect(dividersOffered(minis())).toBe(false);
    expect(dividersOffered(minis({ storage: "bulk" }))).toBe(false);
    expect(dividersOffered(custom())).toBe(false);
  });

  it("reads a count set where they are not offered as none, and stores 0 as nothing", () => {
    const set = { ...bulk(), dividers: 3 };
    expect(dividersOf(set)).toBe(0);
    expect(dividersOf(cards({ dividers: 3 }))).toBe(3);
    expect(dividersOf(cards({ dividers: 3, growth: { stack: "off" } }))).toBe(0);
    expect("dividers" in withDividers(cards({ dividers: 3 }), 0)).toBe(false);
    expect(withDividers(cards(), 2).dividers).toBe(2);
  });

  it("asks sizing for slots only where they are offered", () => {
    expect(deck(cards({ dividers: 2 })).dividers).toBe(2);
    expect(deck(cards({ dividers: 2, growth: { stack: "off" } })).dividers).toBeUndefined();
    expect(deck(cards()).dividers).toBeUndefined();
    // flat storage of the same component: no dividers, no floor extra
    const flat = at(
      at(at(cardOptions(cards({ dividers: 2, storage: "auto" }), s, 0).options, 2).blocks, 0),
      0,
    );
    expect(flat.dividers).toBeUndefined();
    expect(flat.floorExtra).toBeUndefined();
    const stacks = at(tileOptions(tiles({ dividers: 2, storage: "upright" }), s).options, 0);
    expect(at(at(stacks.blocks, 0), 0).dividers).toBe(2);
    expect(
      at(at(at(tileOptions(tiles({ dividers: 2, storage: "flat" }), s).options, 0).blocks, 0), 0)
        .dividers,
    ).toBeUndefined();
  });
});

describe("a divided well, sized", () => {
  const plain = deck(cards());
  const divided = deck(cards({ dividers: 2 }));

  it("is wider by the room of its slots, has no spacer, and grows itself", () => {
    expect(divided.minW).toBeCloseTo(plain.minW + 2 * SLOT, 2);
    expect(divided.spacerAxis).toBeUndefined();
    expect(divided.elastic.w).toBe(true);
    expect(divided.floorExtra).toBe(DIVIDER_GROOVE);
    expect(plain.spacerAxis).toBe("w");
  });

  it("ignores spacer plates: dividers and plates are exclusive", () => {
    const both = deck(cards({ dividers: 2, separators: 4, growth: { stack: "max" } }));
    expect(both.separators).toBeUndefined();
    expect(both.spacerAxis).toBeUndefined();
    // and the plates' retention does not apply
    const stack = plain.minW;
    expect(both.growth?.w).toBeCloseTo(stack * UNPLATED_RETENTION * 3, 2);
  });

  it("makes the tray as much taller as the slots go deep", () => {
    const one = partOf([cards({ growth: { stack: "max" } })], "upright-long|strip|split1");
    const two = partOf(
      [cards({ growth: { stack: "max" }, dividers: 2 })],
      "upright-long|strip|split1",
    );
    expect(minOuter(two, s, ground).h).toBeCloseTo(minOuter(one, s, ground).h + DIVIDER_GROOVE, 2);
  });
});

describe("the retention cap with dividers", () => {
  it("rises with every section: a divided well may grow that many stack thicknesses", () => {
    expect(stackGrowthMm("max", 20, false)).toBe(20 * UNPLATED_RETENTION);
    expect(stackGrowthMm("max", 20, false, 1)).toBe(20 * UNPLATED_RETENTION * 2);
    expect(stackGrowthMm("max", 20, false, 3)).toBe(20 * UNPLATED_RETENTION * 4);
    // a number is cut back to it, `auto` is below it already
    expect(stackGrowthMm(500, 20, false, 2)).toBe(60);
    expect(stackGrowthMm(30, 20, false, 2)).toBe(30);
    expect(stackGrowthMm("auto", 20, false, 2)).toBe(stackGrowthMm("auto", 20, false));
    // plates keep their own limit
    expect(stackGrowthMm("max", 20, true)).toBe(20 * PLATED_RETENTION);
  });

  it("gives the divided deck component more room than the same deck without them", () => {
    const wide = (c = cards({ growth: { stack: "max" } })): number | undefined => deck(c).growth?.w;
    expect(wide(cards({ growth: { stack: "max" }, dividers: 2 }))).toBeCloseTo(
      (wide() ?? 0) * 3,
      1,
    );
  });
});

describe("realizing a divided well", () => {
  const part = (n: number) =>
    partOf([cards({ growth: { stack: "max" }, dividers: n })], "upright-long|strip|split1");

  it("cuts N slots, evenly spaced across the well, and no spacer", () => {
    for (const n of [1, 2, 3, 6]) {
      const p = part(n);
      const min = minOuter(p, s, ground);
      const outer = { w: min.w + 30, d: min.d, h: min.h };
      const r = realizeTray(p, outer, s, ground);
      assertTrayInvariants(r, outer, s, ground, p);
      expect(r.spacers).toEqual([]);
      const well = at(r.compartments, 0);
      const slots = slotsOf(well.features);
      expect(slots).toHaveLength(n);
      for (const f of slots) {
        expect(f).toMatchObject({ axis: "y", width: SLOT, depth: DIVIDER_GROOVE });
        expect(f.at - f.width / 2).toBeGreaterThanOrEqual(well.x);
        expect(f.at + f.width / 2).toBeLessThanOrEqual(well.x + well.w);
      }
      // the sections between the slots, and at the ends, are equal to within a hundredth each
      const edges = [
        well.x,
        ...slots.flatMap((f) => [f.at - f.width / 2, f.at + f.width / 2]),
        well.x + well.w,
      ];
      const sections = edges.flatMap((e, i) => (i % 2 === 0 ? [at(edges, i + 1) - e] : []));
      expect(sections).toHaveLength(n + 1);
      for (const section of sections.slice(0, -1)) {
        expect(section).toBeCloseTo(sections[0] ?? 0, 1);
        expect(section).toBeGreaterThanOrEqual(MIN_SECTION - 0.01);
      }
    }
  });

  it("takes the room the layout gives it, up to its cap, into the sections, not a spacer", () => {
    const p = part(2);
    const min = minOuter(p, s, ground);
    const r = realizeTray(p, { w: min.w + 15, d: min.d, h: min.h }, s, ground);
    expect(at(r.compartments, 0).w).toBeCloseTo(at(p.compartments, 0).minW + 15, 2);
    expect(r.spacers).toEqual([]);
  });

  it("takes more of a roomy leaf than the same deck without dividers, as far as retention allows", () => {
    const plain = partOf([cards({ growth: { stack: "max" } })], "upright-long|strip|split1");
    const p = part(2);
    const base = minOuter(plain, s, ground);
    const wide = { w: base.w + 200, d: base.d, h: base.h + DIVIDER_GROOVE };
    const stack = at(plain.compartments, 0).minW;
    // without: a spacer of one stack thickness, and the well holds twice the stack
    const spacer = realizeTray(plain, { ...wide, h: base.h }, s, ground);
    expect(at(spacer.compartments, 0).w).toBeCloseTo(stack * 2, 2);
    // with two dividers: the well itself takes three stacks (one per section) on top of its slots
    const divided = realizeTray(p, wide, s, ground);
    expect(at(divided.compartments, 0).w).toBeCloseTo(stack * 4 + 2 * SLOT, 2);
    assertTrayInvariants(divided, wide, s, ground, p);
  });

  it("permits width T + slots + (N + 1) × the undivided slack allowance: only the slack scales", () => {
    const stack = at(
      partOf([cards({ growth: { stack: "max" } })], "upright-long|strip|split1").compartments,
      0,
    ).minW;
    for (const n of [1, 3]) {
      const p = part(n);
      const base = minOuter(p, s, ground);
      const wide = { w: base.w + 400, d: base.d, h: base.h };
      const well = at(realizeTray(p, wide, s, ground).compartments, 0);
      // per-section slack equals the undivided allowance (one stack thickness), never more
      expect(well.w).toBeCloseTo(stack + n * SLOT + (n + 1) * stack * UNPLATED_RETENTION, 2);
      expect((well.w - n * SLOT - stack) / (n + 1)).toBeCloseTo(stack * UNPLATED_RETENTION, 2);
    }
  });

  it("keeps the floor under the slots thick enough, at the least height", () => {
    const p = part(2);
    const min = minOuter(p, s, ground);
    const r = realizeTray(p, { w: min.w, d: min.d, h: min.h }, s, ground);
    expect(at(r.compartments, 0).floorZ).toBeGreaterThanOrEqual(s.floor + DIVIDER_GROOVE - 0.01);
  });

  it("turns the slots with a turned tray", () => {
    const p = part(2);
    const min = minOuter(p, s, ground);
    const outer = { w: min.w + 10, d: min.d, h: min.h };
    const r = realizeTray(p, outer, s, ground);
    const turned = rotateRealized(r, outer);
    const before = slotsOf(at(r.compartments, 0).features);
    const after = slotsOf(at(turned.compartments, 0).features);
    expect(after.map((f) => f.axis)).toEqual(before.map(() => "x"));
    // a slot along y at x = at runs along x at the same centre, now across the turned well's depth
    expect(after.map((f) => f.at)).toEqual(before.map((f) => f.at));
    const well = at(turned.compartments, 0);
    // the turned well is as deep as the old one was wide, so the slots are in it
    for (const f of after) {
      expect(f.at - f.width / 2).toBeGreaterThanOrEqual(well.y);
      expect(f.at + f.width / 2).toBeLessThanOrEqual(well.y + well.d);
    }
  });
});
