import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { BulkComponent, Settings } from "../model/types";
import { size } from "./group";
import { partGrowthCapU } from "./growth";
import { minOuter, realizeTray } from "./realize";
import { at, bulk, cards, inGroup } from "./test-helpers";
import type { RealizeOptions, TrayPartReq } from "./types";

// Group Max fills its tray (group-tray-fill spec §2): a group member set to "as much as fits" takes
// the slack the group tray already has and never makes the tray bigger. "As much as fits" is one
// choice for the whole item now (room: "max"), not a growth per axis, and only bins offer it (a
// custom well has no room row), so the member under test is a bin and each axis has its own test.
const s = DEFAULT_SETTINGS;
const ground: RealizeOptions = { lipped: false, level: 0 };

// A big bin that sets the tray's size, and a small one beside it that is the member under test.
const big = (): BulkComponent =>
  bulk({ id: "x1", name: "Big", items: [{ name: "Beans", volumeMl: 600 }] });
const small = (room?: "max"): BulkComponent =>
  bulk({
    id: "x2",
    name: "Small",
    items: [{ name: "Peas", count: 5, w: 5, d: 5, h: 5 }],
    ...(room ? { room } : {}),
  });

/** The first part of the first variant of the group's requirement, or of the loose members'. */
function partOfSize(
  members: BulkComponent[],
  grouped: boolean,
  settings: Settings = s,
): TrayPartReq {
  const { requirements } = size(members, settings, grouped ? [inGroup(members)] : []);
  return at(at(at(requirements, 0).variants, 0).parts, 0);
}

function wells(part: TrayPartReq, outerGrow = { w: 0, d: 0, h: 0 }) {
  const min = minOuter(part, s, ground);
  const outer = { w: min.w + outerGrow.w, d: min.d + outerGrow.d, h: min.h + outerGrow.h };
  const tray = realizeTray(part, outer, s, ground);
  return { min, outer, bigWell: at(tray.compartments, 0), smallWell: at(tray.compartments, 1) };
}

describe("a group member's Max fills its tray", () => {
  it("draws a well on Max in length as deep as its row, from the row's top", () => {
    const off = wells(partOfSize([big(), small()], true));
    const max = wells(partOfSize([big(), small("max")], true));
    expect(max.smallWell.d).toBe(max.bigWell.d);
    expect(max.smallWell.y).toBe(max.bigWell.y);
    // None is centred at its minimum, shallower than the row.
    expect(off.smallWell.d).toBeLessThan(off.bigWell.d);
    expect(off.smallWell.y).toBeGreaterThan(off.bigWell.y);
  });

  it("gives a well on Max in width the slack the walls would take, and leaves a well with no room alone", () => {
    const grow = { w: 6, d: 0, h: 0 };
    const off = wells(partOfSize([big(), small()], true), grow);
    const max = wells(partOfSize([big(), small("max")], true), grow);
    expect(max.smallWell.w).toBeCloseTo(off.smallWell.w + 6 - (max.min.w - off.min.w), 5);
    expect(max.bigWell.w).toBe(off.bigWell.w);
    expect(max.smallWell.w).toBeGreaterThan(off.smallWell.w);
  });

  it("splits the width slack evenly among a row's filling wells", () => {
    const members = [big(), small("max"), { ...small("max"), id: "x3" }];
    const part = partOfSize(members, true);
    const min = minOuter(part, s, ground);
    const tray = realizeTray(part, { ...min, w: min.w + 8 }, s, ground);
    const base = realizeTray(part, min, s, ground);
    const gained = (i: number) => at(tray.compartments, i).w - at(base.compartments, i).w;
    expect(gained(1)).toBeCloseTo(4, 1);
    expect(gained(2)).toBeCloseTo(4, 1);
    expect(gained(0)).toBe(0);
  });

  it("takes a well on Max in height down to the tray's deepest floor", () => {
    // A bin is as deep as its tray lets it go (up to reach) with or without room, so the member
    // under test is a flat deck, whose height is what the room is.
    const deck = (room?: "max") =>
      cards({
        id: "x2",
        storage: "flat",
        sleeve: "none",
        decks: [{ name: "Deck", count: 10 }],
        ...(room ? { room } : {}),
      });
    const flat = (room?: "max") => {
      const members = [big(), deck(room)];
      const { requirements } = size(members, s, [inGroup(members)]);
      const part = at(at(at(requirements, 0).variants, 0).parts, 0);
      return wells(part);
    };
    const off = flat();
    const max = flat("max");
    expect(max.smallWell.floorZ).toBe(max.bigWell.floorZ);
    expect(off.smallWell.floorZ).toBeGreaterThan(off.bigWell.floorZ);
  });

  it("never goes shallower than the well has today", () => {
    // The other well is the shallow one: Max in height changes nothing for the deeper well.
    const members = [small("max"), big()];
    const { smallWell, bigWell } = wells(partOfSize(members, true));
    expect(bigWell.floorZ).toBeLessThan(smallWell.floorZ + 1e-9);
    expect(smallWell.floorZ).toBe(bigWell.floorZ);
  });

  it("leaves the tray's outer size as with no room, and the layout no room to grow", () => {
    const off = partOfSize([big(), small()], true);
    const max = partOfSize([big(), small("max")], true);
    expect(minOuter(max, s, ground)).toEqual(minOuter(off, s, ground));
    const rows = [max.compartments];
    expect(partGrowthCapU(rows, "w")).toBe(partGrowthCapU([off.compartments], "w"));
    expect(partGrowthCapU(rows, "d")).toBe(partGrowthCapU([off.compartments], "d"));
    expect(max.compartments.every((c) => !c.elastic.w && !c.elastic.d && !c.elastic.h)).toBe(true);
    expect(at(max.compartments, 1).fill).toEqual({ w: true, d: true, h: true });
    expect(at(max.compartments, 0).fill).toBeUndefined();
  });

  it("keeps Max as it was outside a group", () => {
    const part = partOfSize([small("max")], false);
    const c = at(part.compartments, 0);
    expect(c.fill).toBeUndefined();
    expect(c.elastic).toEqual({ w: true, d: true, h: true });
  });

  it("keeps a well that only follows bigger wells elastic in a group, as it was (Auto)", () => {
    const part = partOfSize([big(), small()], true, { ...s, biggerWells: true });
    const c = at(part.compartments, 1);
    expect(c.fill).toBeUndefined();
    expect(c.elastic.d).toBe(true);
  });
});
