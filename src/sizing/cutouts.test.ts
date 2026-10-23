import { describe, expect, it } from "vitest";
import { planTray } from "../geometry/plan";
import { largestChamfer, loadFixture, traySpecFrom } from "../geometry/test-specs";
import smallTiles from "../../test/fixtures/small-tiles.json";
import { DEFAULT_SETTINGS, MIN_WALL_MM, applyFingerRoom } from "../model/settings";
import type { CompartmentSpec, FeatureSpec, Settings, TileShape } from "../model/types";
import { hasGrip } from "./grip";
import { size } from "./group";
import { minOuter, realizeTray } from "./realize";
import {
  assertTrayInvariants,
  at,
  bulk,
  cards,
  custom,
  minis,
  partOf,
  partOfGroup,
  tiles,
  withPlainCuts,
} from "./test-helpers";
import { MIN_REACH_OVERLAP } from "./constants";
import type { OuterSize, RealizeOptions, TrayPartReq } from "./types";

// These cover sizing with a locating lip available (the lipped wall, upper-tray
// minimums), so they turn it on; the app's own default is off.
const s: Settings = { ...DEFAULT_SETTINGS, lip: { ...DEFAULT_SETTINGS.lip, enabled: true } };
const ground: RealizeOptions = { lipped: false, level: 0 };
const roomy = applyFingerRoom(s, true);
const wallOnly: Settings = { ...s, fingerPocket: { ...s.fingerPocket, wallRoom: 10 } };

const decks = (...counts: number[]) => counts.map((count, i) => ({ name: `D${i + 1}`, count }));

function cutout(side: string, atMm: number, depth: number, floorNotch = 0, width = 25) {
  return { type: "wallCutout", side, at: atMm, width, depth, floorNotch };
}

/** Realizes `part` at `outer` (its minOuter by default) and checks every contract on the way. */
function realize(
  part: TrayPartReq,
  settings: Settings = s,
  opts: RealizeOptions = ground,
  outer: OuterSize = minOuter(part, settings, opts),
) {
  const r = realizeTray(part, outer, settings, opts);
  assertTrayInvariants(r, outer, settings, opts, part);
  return r;
}

function cutsOf(c: CompartmentSpec | undefined): FeatureSpec[] {
  return (c?.features ?? []).filter((f) => f.type === "wallCutout");
}

describe("upright cards and tiles: one finger channel", () => {
  // Three sleeved Standard decks: wells 18.31, 26.96 and 13.98 wide, 92.5 long, 68 deep.
  const strip = partOf([cards({ decks: decks(40, 60, 30) })], "upright-long|strip|split1");

  it("runs one centred channel, half the wells deep, through both end walls and every divider", () => {
    expect(minOuter(strip, s, ground)).toEqual({ w: 64.85, d: 95.7, h: 69.2 });
    const r = realize(strip);
    expect(r.compartments.map((c) => [c.x, c.y, c.w, c.d])).toEqual([
      [1.6, 1.6, 18.31, 92.5],
      [21.11, 1.6, 26.96, 92.5],
      [49.27, 1.6, 13.98, 92.5],
    ]);
    for (const c of r.compartments) {
      expect(c.features).toEqual([cutout("left", 47.85, 34), cutout("right", 47.85, 34)]);
    }
    // The geometry runs it out through both end walls and across both dividers.
    const plan = planTray(traySpecFrom(r, minOuter(strip, s, ground), ground, s, "t"), s);
    expect(plan.compartments.map((c) => c.cuts.map((cut) => cut.into))).toEqual([
      [null, 1],
      [0, 2],
      [1, null],
    ]);
  });

  it("is a grip", () => {
    const r = realize(strip);
    expect(
      hasGrip(
        r.compartments.map((c) => ({ ...c, w: 10, d: 10 })),
        minOuter(strip, s, ground).h,
      ),
    ).toBe(true);
  });

  it("gives each row of rows2 its own channel, centred on its wells and clear of the other row", () => {
    // Upright 15 mm square tiles: rows of 16 mm long wells, narrower than the 22 mm setting.
    const part = partOf(
      [
        tiles({
          shape: { type: "rect", w: 15, d: 15 },
          thickness: 2,
          count: 40,
          storage: "upright",
        }),
      ],
      "upright-c2|rows2|split1",
    );
    const r = realize(part);
    const [row0, row1] = r.compartments;
    expect([row0?.y, row0?.d, row1?.y, row1?.d]).toEqual([1.6, 16, 18.8, 16]);
    // Each channel takes 10 mm of its row's 16 mm, leaving 3 mm posts to the wells' faces.
    expect(cutsOf(row0)).toEqual([cutout("left", 9.6, 8, 0, 10), cutout("right", 9.6, 8, 0, 10)]);
    expect(cutsOf(row1)).toEqual([cutout("left", 26.8, 8, 0, 10), cutout("right", 26.8, 8, 0, 10)]);
  });

  it("keeps the two rows' channels apart through a shared end wall when the rows have room to widen", () => {
    // Upright 13.7 mm hexes: rows of different lengths, 3 mm slack across the rows.
    const part = partOf(
      [
        tiles({
          shape: { type: "hex", flatToFlat: 13.7, orientation: "flat" },
          thickness: 2.8,
          count: 19,
          storage: "upright",
        }),
      ],
      "upright-c2|rows2|split1",
    );
    // The walls may take the slack (wallAbsorb), which widens both rows into the shared end wall.
    const grow: Settings = { ...s, wallAbsorb: 1.6 };
    const min = minOuter(part, grow, ground);
    const r = realize(part, grow, ground, { ...min, d: min.d + 3 });
    const [row0, row1] = r.compartments;
    expect([row0?.y, row0?.d, row1?.y, row1?.d]).toEqual([2.6, 16.82, 21.62, 16.82]);
    // Row 0's channel spans y 5.6–16.42 and row 1's 24.62–35.44: each keeps 3 mm posts to its
    // wells' faces (review 1, C2: both widened into the end wall they share, 0.5 mm apart).
    expect(cutsOf(row0)).toEqual([
      cutout("left", 11.01, 7.35, 0, 10.82),
      cutout("right", 11.01, 7.35, 0, 10.82),
    ]);
    expect(cutsOf(row1)).toEqual([
      cutout("left", 30.03, 7.35, 0, 10.82),
      cutout("right", 30.03, 7.35, 0, 10.82),
    ]);
  });

  it("opens no channel into bits: a deck beside a bulk compartment is cut on its other side only", () => {
    const part = partOfGroup(
      [cards({ decks: decks(30) }), bulk({})],
      "upright-long+shallow|strip|split1",
    );
    const r = realize(part);
    expect(at(r.compartments, 0).features.map((f) => [f.type, "side" in f && f.side])).toEqual([
      ["wallCutout", "left"],
    ]);
    expect(at(r.compartments, 1).features.filter((f) => f.type === "wallCutout")).toEqual([]);
  });

  it("gives a deck that leads its group its channel at the row's end", () => {
    const pile = (id: string) => bulk({ id, items: [{ name: "Pile", volumeMl: 40 }] });
    const deck = cards({ shortSide: 63, longSide: 88, decks: decks(30) });
    const part = partOfGroup(
      [deck, pile("b1"), pile("b2")],
      "upright-long+shallow+shallow|strip|split1",
    );
    // The deck stands first (member order): its channel goes out through the left wall (review 1,
    // I2: between the two bulk compartments it got none).
    expect(part.compartments.map((c) => c.componentId)).toEqual(["c1", "b1", "b2"]);
    const r = realize(part);
    expect(cutsOf(at(r.compartments, 0)).map((f) => f.type === "wallCutout" && f.side)).toEqual([
      "left",
    ]);
  });

  it("cuts a deck with no free wall along its row through the walls across it instead", () => {
    const pile = (id: string) => bulk({ id, items: [{ name: "Pile", volumeMl: 40 }] });
    const deck = cards({ shortSide: 63, longSide: 88, decks: decks(80) });
    const sorted = partOfGroup(
      [pile("b1"), deck, pile("b2")],
      "shallow+upright-long+shallow|strip|split1",
    );
    // Member order puts the deck between the bulk compartments: centred on the deck's well, out
    // through the front and back walls.
    const part = sorted;
    const r = realize(part);
    const well = at(r.compartments, 1);
    const cuts = cutsOf(well);
    const centre = Math.round((well.x + well.w / 2) * 100) / 100;
    expect(cuts.map((f) => f.type === "wallCutout" && [f.side, f.at])).toEqual([
      ["front", centre],
      ["back", centre],
    ]);
  });

  // Reachability (minimal-trays spec §5.3): a deck with no free end wall is reached by a cut across
  // the row, centred on its well. With nothing pinning the deck it may stand at either end of a
  // grown well, so growth stops where the cut still covers MIN_REACH_OVERLAP of it there.
  it("keeps a deck at either end of its grown well under the cut across the row", () => {
    const narrow: Settings = { ...s, fingerPocket: { ...s.fingerPocket, width: 14 } };
    const pile = (id: string) => bulk({ id, items: [{ name: "Pile", volumeMl: 40 }] });
    const deck = cards({
      growth: { stack: "max" },
      shortSide: 63,
      longSide: 88,
      decks: decks(80),
    });
    const sorted = partOfGroup(
      [pile("b1"), deck, pile("b2")],
      "shallow+upright-long+shallow|strip|split1",
      narrow,
    );
    const part = sorted;
    const stack = at(part.compartments, 1).minW; // the deck's own thickness in its well
    // a lot of room along the row: the deck takes what it may, the bins what they may
    const min = minOuter(part, narrow, ground);
    const r = realize(part, narrow, ground, { ...min, w: min.w + 200 });
    const well = at(r.compartments, 1);
    const cuts = cutsOf(well).flatMap((f) => (f.type === "wallCutout" ? [f] : []));
    expect(cuts.map((f) => f.side).sort()).toEqual(["back", "front"]);
    for (const f of cuts) {
      expect(f.width).toBe(14);
      // centred on the well, as the cut is placed
      expect(f.at).toBeCloseTo(well.x + well.w / 2, 2);
      const cutFrom = f.at - f.width / 2;
      const cutTo = f.at + f.width / 2;
      // the stack against the left end, then against the right
      const ends: [number, number][] = [
        [well.x, well.x + stack],
        [well.x + well.w - stack, well.x + well.w],
      ];
      for (const [from, to] of ends) {
        const overlap = Math.min(to, cutTo) - Math.max(from, cutFrom);
        expect(overlap).toBeGreaterThanOrEqual(MIN_REACH_OVERLAP - 0.011);
      }
    }
    // it is the bound that stopped the growth, not the retention: the room is less than a stack
    expect(well.w - stack).toBeLessThan(stack);
    expect(well.w - stack).toBeCloseTo(14 + stack - 2 * MIN_REACH_OVERLAP, 1);
    // with the retention's whole stack of room the deck at an end would not reach the cut by M
    expect(stack - (2 * stack - 14) / 2).toBeLessThan(MIN_REACH_OVERLAP);
  });

  it("keeps such a cut clear of the deck's spacer", () => {
    const dial = (id: string) => custom({ id, count: 1 });
    const deck = cards({
      growth: { stack: "max" },
      separators: 1,
      shortSide: 63,
      longSide: 88,
      decks: decks(80),
    });
    const sorted = partOfGroup(
      [dial("x1"), deck, dial("x2")],
      "custom+upright-long+custom|strip|split1",
    );
    const part = sorted;
    const min = minOuter(part, s, ground);
    // 30 mm of slack along the row become a spacer at the end of the deck's well.
    const r = realize(part, s, ground, { ...min, w: min.w + 30 });
    const spacer = at(r.spacers, 0);
    expect(spacer.w).toBe(30);
    const well = at(r.compartments, 1);
    for (const f of cutsOf(well)) {
      expect(f.type === "wallCutout" && f.side).toMatch(/front|back/);
      if (f.type === "wallCutout") {
        expect(f.at - f.width / 2).toBeGreaterThanOrEqual(well.x);
        expect(f.at + f.width / 2).toBeLessThanOrEqual(spacer.x - 0.8 + 1e-9);
      }
    }
  });

  it("notches a spacer standing in a channelled well to match the channel", () => {
    const one = partOf(
      [cards({ growth: { stack: "max" }, separators: 1 })],
      "upright-long|strip|split1",
    );
    const min = minOuter(one, s, ground);
    const r = realize(one, s, ground, { ...min, w: min.w + 10 });
    expect(r.spacers).toHaveLength(1);
    // Spacer frame: the well's 92.5 mm along Y from y 1.6, its top 5 mm below the rim.
    expect(at(r.spacers, 0)).toMatchObject({ y: 1.6, w: 10, d: 92.5, h: 63 });
    expect(at(r.spacers, 0).features).toEqual([
      { type: "spacerNotch", axis: "x", at: 46.25, width: 25, depth: 29 },
    ]);
  });

  it("ends a spacer whose widened notch takes its whole top where the U meets its faces", () => {
    // At a 3 mm chamfer a notch side 3 mm from the spacer's face would leave less than the chamfer
    // plus 0.8 mm beside it: the notch widens to the spacer's 26.5 mm and takes its whole top, so
    // the 76.5 mm spacer ends where the U (bottom 40.75 mm up, radius 13.25) meets its faces.
    const steep = largestChamfer({ ...s, wall: 3, floor: 3 });
    const deck = cards({
      growth: { stack: "max" },
      separators: 1,
      shortSide: 25,
      longSide: 80,
      sleeve: "none",
      storage: "upright-short",
    });
    const part = partOf([deck], "upright-short|strip|split1", steep);
    const min = minOuter(part, steep, ground);
    const r = realize(part, steep, ground, { ...min, w: min.w + 10 });
    expect(at(r.spacers, 0)).toMatchObject({ w: 10, d: 26.5, h: 54 });
    expect(at(r.spacers, 0).features).toEqual([
      { type: "spacerNotch", axis: "x", at: 13.25, width: 26.5, depth: 13.25 },
    ]);
  });

  it("keeps a lipped tray's channel out of the lipped wall", () => {
    const lipped: RealizeOptions = { lipped: true, level: 0 };
    const r = realize(strip, s, lipped);
    expect(r.compartments.every((c) => c.y === 2.9)).toBe(true);
    expect(cutsOf(at(r.compartments, 0))).toEqual([
      cutout("left", 49.15, 34),
      cutout("right", 49.15, 34),
    ]);
  });
});

describe("flat cards and tiles: cutouts through the long walls", () => {
  it("cuts both long walls of a flat deck down to its floor and notches the floor a half-disc", () => {
    const part = partOf([cards({ storage: "flat" })], "flat|strip|split1");
    expect(minOuter(part, s, ground)).toEqual({ w: 71.2, d: 95.7, h: 24.7 });
    const r = realize(part);
    expect(r.compartments).toEqual([
      {
        x: 1.6,
        y: 1.6,
        w: 68,
        d: 92.5,
        floorZ: 1.2,
        kind: "well",
        contents: "Cards — Main ×52",
        componentId: "c1",
        features: [cutout("left", 47.85, 23.5, 12.5), cutout("right", 47.85, 23.5, 12.5)],
      },
    ]);
  });

  it("cuts the walls along a tile's longer side", () => {
    const sides = (shape: TileShape) => {
      const part = partOf([tiles({ shape, count: 10, storage: "flat" })], "flat-c1|strip|split1");
      return cutsOf(at(realize(part).compartments, 0)).map((f) => ("side" in f ? f.side : ""));
    };
    expect(sides({ type: "hex", flatToFlat: 40, orientation: "flat" })).toEqual(["front", "back"]);
    expect(sides({ type: "hex", flatToFlat: 40, orientation: "pointy" })).toEqual([
      "left",
      "right",
    ]);
    expect(sides({ type: "rect", w: 30, d: 50 })).toEqual(["left", "right"]);
    expect(sides({ type: "rect", w: 50, d: 30 })).toEqual(["front", "back"]);
    expect(sides({ type: "rect", w: 40, d: 40 })).toEqual(["left", "right"]);
  });

  it("keeps a cutout's lowest point at the outer face 0.8 mm above the bottom chamfer", () => {
    // 0.9 mm walls, a 0.8 mm floor and the largest chamfer they allow (0.83 mm), no floor notch:
    // the cutout stops 0.8 mm above the chamfer instead of at the floor.
    const steep: Settings = {
      ...s,
      wall: 0.9,
      floor: 0.8,
      bottomChamfer: 0.82,
      fingerPocket: { ...s.fingerPocket, floorNotch: 0 },
    };
    const part = partOf([cards({ storage: "flat" })], "flat|strip|split1", steep);
    const r = realize(part, steep);
    const outer = minOuter(part, steep, ground);
    expect(cutsOf(at(r.compartments, 0)).map((f) => "depth" in f && f.depth)).toEqual([
      outer.h - 1.62,
      outer.h - 1.62,
    ]);
  });

  it("runs the last cutout out through the end wall of a wider tray, not into a pocket", () => {
    const part = partOf([cards({ storage: "flat", decks: decks(30, 30) })], "flat|strip|split1");
    const min = minOuter(part, s, ground);
    const r = realize(part, s, ground, { ...min, w: min.w + 30 });
    expect(r.compartments.map((c) => c.kind)).toEqual(["well", "well"]);
    expect(cutsOf(at(r.compartments, 1)).map((f) => ("side" in f ? f.side : ""))).toEqual([
      "left",
      "right",
    ]);
    const plan = planTray(traySpecFrom(r, { ...min, w: min.w + 30 }, ground, s, "t"), s);
    // The left cut runs into the first well (its twin); the right one leaves through the end wall.
    expect(plan.compartments[1]?.cuts.map((cut) => cut.into)).toEqual([0, null]);
  });
});

describe("cut sides beside a rounded outer corner", () => {
  it.each(["flat-c1|strip|split1", "flat-c2|rows2|split1", "upright-c1|strip|split1"])(
    "keep 0.8 mm past the arc at a 0.9 mm wall and chamfer (%s)",
    (variant) => {
      // The 0.9 mm chamfer forces an outer corner radius of at least 0.9 mm; a cut side 0.9 mm from
      // the face it runs along met the exit face where the arc ended (review 1, I1). Its sides keep
      // 1.7 mm, so the wall beside them stays 0.8 mm thick past the arc.
      const thin = largestChamfer({ ...s, wall: MIN_WALL_MM, floor: MIN_WALL_MM });
      expect(thin.bottomChamfer).toBe(0.9);
      const part = partOf(
        [
          tiles({
            shape: { type: "rect", w: 15, d: 15 },
            thickness: 2,
            count: 40,
            storage: "auto",
          }),
        ],
        variant,
      );
      const r = realize(part, thin);
      const outer = minOuter(part, thin, ground);
      for (const c of r.compartments) {
        for (const f of cutsOf(c)) {
          if (f.type === "wallCutout") {
            const span = f.side === "left" || f.side === "right" ? outer.d : outer.w;
            expect(Math.min(f.at - f.width / 2, span - f.at - f.width / 2)).toBeGreaterThanOrEqual(
              1,
            );
          }
        }
      }
    },
  );
});

describe("finger room where the cuts actually go", () => {
  // A deck between two bulk compartments (member order): no cut along its row, so it is
  // cut through the front and back walls instead (placeCutouts' second try).
  const pile = (id: string) => bulk({ id, items: [{ name: "Pile", volumeMl: 40 }] });
  const deck = cards({ shortSide: 63, longSide: 88, decks: decks(80) });
  const sorted = partOfGroup(
    [pile("b1"), deck, pile("b2")],
    "shallow+upright-long+shallow|strip|split1",
  );
  const between = sorted;

  it("thickens the front and back walls a cut on the other axis leaves through", () => {
    const plain = minOuter(between, s, ground);
    // 10 mm on each of the two walls: 20 mm deeper, no wider.
    expect(minOuter(between, roomy, ground)).toEqual({ ...plain, d: plain.d + 20 });
    const r = realize(between, roomy);
    const well = at(r.compartments, 1);
    expect(well.y).toBe(at(realize(between).compartments, 1).y + 10);
    expect(cutsOf(well).map((f) => f.type === "wallCutout" && f.side)).toEqual(["front", "back"]);
  });

  it("leaves the sides it asked for but got no cut on thin", () => {
    // The dividers beside the deck carry no cut: 1.2 mm, as without finger room.
    const r = realize(between, roomy);
    const b1 = at(r.compartments, 0);
    const well = at(r.compartments, 1);
    const b2 = at(r.compartments, 2);
    expect(Math.round((well.x - b1.x - b1.w) * 100) / 100).toBe(1.2);
    expect(Math.round((b2.x - well.x - well.w) * 100) / 100).toBe(1.2);
    // Nor does the left wall, which no cut leaves through.
    expect(b1.x).toBe(1.6);
  });

  it("thickens the divider between rows that twin cuts cross", () => {
    // Two rows of 30 × 15 mm tiles laid flat, cut through the front and back: row 0's back cut and
    // row 1's front cut are twins through the divider between the rows.
    const part = partOf(
      [tiles({ shape: { type: "rect", w: 30, d: 15 }, thickness: 2, count: 40, storage: "flat" })],
      "flat-c2|rows2|split1",
    );
    const dividersOnly = { ...s, fingerPocket: { ...s.fingerPocket, dividerRoom: 5 } };
    expect(minOuter(part, dividersOnly, ground).d).toBeCloseTo(minOuter(part, s, ground).d + 5, 9);
    const r = realize(part, dividersOnly);
    const row0 = at(r.compartments, 0);
    const row1 = at(r.compartments, 1);
    expect(Math.round((row1.y - row0.y - row0.d) * 100) / 100).toBe(6.2);
  });
});

describe("minis pockets and custom wells: a centred cut through the front and back walls", () => {
  const heroes = minis({ figures: [{ name: "Hero", w: 25, d: 25, h: 40, count: 4 }] });

  it("cuts each pocket of a strip through the front and back walls, half its depth", () => {
    const r = realize(partOf([heroes], "standing|strip|split1"));
    expect(
      r.compartments.map((c) => cutsOf(c).map((f) => f.type === "wallCutout" && f.side)),
    ).toEqual(Array(4).fill(["front", "back"]));
  });

  it("cuts both rows of rows2 front and back: the facing cuts meet across the divider", () => {
    const part = partOf([heroes], "standing|rows2|split1");
    const r = realize(part);
    // Every pocket asks for both walls, so row 0's back and row 1's front twin through the divider.
    expect(
      r.compartments.map((c) => cutsOf(c).map((f) => f.type === "wallCutout" && f.side)),
    ).toEqual(Array(4).fill(["front", "back"]));
    const plain = minOuter(part, s, ground);
    expect(minOuter(part, wallOnly, ground)).toEqual({ ...plain, d: plain.d + 20 });
  });

  it("cuts a custom well through the front wall, half its depth", () => {
    const r = realize(partOf([custom({ h: 30, count: 1 })], "custom|strip|split1"));
    expect(cutsOf(at(r.compartments, 0))).toEqual([cutout("front", 22.1, 15.5, 0, 25)]);
  });
});

describe("flat custom items and short minis: the full-depth cut with a floor notch", () => {
  // The two cases of the investigation "getting contents out" (2026-10-23): a half-deep cut on a
  // flat item leaves it below the cut, and a short figure's half is under a fingertip.
  const wellOf = (part: TrayPartReq, settings: Settings = s, opts: RealizeOptions = ground) =>
    at(realize(part, settings, opts).compartments, 0);
  const frontCut = (c: CompartmentSpec) =>
    cutsOf(c).find((f) => f.type === "wallCutout" && f.side === "front");

  it("cuts a 2 mm board down to its floor and notches the floor, not 1.5 mm of its side", () => {
    // two 2 mm boards stacked in a 3 mm well (h: 2 each; the well is its clearance over one)
    const part = partOf(
      [custom({ w: 60, d: 40, h: 2, count: 1, clearance: 1 })],
      "custom|strip|split1",
    );
    const well = wellOf(part);
    const outer = minOuter(part, s, ground);
    const cut = frontCut(well);
    expect(cut).toMatchObject({ type: "wallCutout", width: 25, floorNotch: 12.5 });
    // down to the well's own floor: the tray's height less the floor
    expect(cut && "depth" in cut ? cut.depth : 0).toBeCloseTo(outer.h - well.floorZ, 9);
    // and the geometry accepts it, with the notch running into the floor under the board
    const plan = planTray(traySpecFrom(realize(part), outer, ground, s, "t"), s);
    expect(plan.compartments[0]?.cuts.map((c) => c.notch)).toEqual([12.5]);
  });

  it("cuts a 12 mm figure's pocket down to its floor at the front and the back, notched", () => {
    const part = partOf(
      [minis({ figures: [{ name: "Pawn", w: 20, d: 20, h: 12, count: 1 }] })],
      "standing|strip|split1",
    );
    const well = wellOf(part);
    const outer = minOuter(part, s, ground);
    const cuts = cutsOf(well).flatMap((f) => (f.type === "wallCutout" ? [f] : []));
    expect(cuts.map((f) => f.side)).toEqual(["front", "back"]);
    for (const f of cuts) {
      expect(f.depth).toBeCloseTo(outer.h - well.floorZ, 9);
      expect(f.floorNotch).toBeGreaterThan(0);
      expect(f.floorNotch).toBeLessThanOrEqual(s.fingerPocket.floorNotch);
    }
  });

  it("leaves a tall custom item and a tall figure on the half-deep cut with no notch", () => {
    const tall = wellOf(partOf([custom({ h: 40, count: 1 })], "custom|strip|split1"));
    expect(frontCut(tall)).toMatchObject({ depth: 20.5, floorNotch: 0 });
    const hero = wellOf(partOf([minis()], "standing|strip|split1"));
    for (const f of cutsOf(hero)) {
      expect(f).toMatchObject({ depth: 20.5, floorNotch: 0 });
    }
  });

  describe("on a low upper tray (the rim between layers on, level 1)", () => {
    const upper: RealizeOptions = { lipped: false, level: 1 };
    // 3.65 mm at the defaults: the groove's 2.85 mm and the 0.8 mm of wall above it
    const least = 3.65;

    it("is no taller than the groove needs: it was 4.45 mm for a plain cut", () => {
      const part = partOf([custom({ h: 1, count: 1 })], "custom|strip|split1");
      expect(minOuter(part, s, upper).h).toBe(least);
    });

    it("keeps the wall above the groove for a plain cut, which sizing now asks of tall pieces only", () => {
      // a hand-built request: a plain cut on this low tray still gets the 0.8 mm of wall above the
      // groove's roof and 0.8 mm of depth of its own (withCutRoom)
      const plain = withPlainCuts(partOf([custom({ h: 1, count: 1 })], "custom|strip|split1"));
      expect(minOuter(plain, s, upper).h).toBe(4.45);
      expect(frontCut(wellOf(plain, s, upper))).toMatchObject({ depth: 0.8, floorNotch: 0 });
    });

    it("gets a notched cut as deep as the well, where a plain one was capped at 0.8 mm", () => {
      const part = partOf([custom({ h: 1, count: 1 })], "custom|strip|split1");
      const well = wellOf(part, s, upper);
      const outer = minOuter(part, s, upper);
      const cut = frontCut(well);
      expect(cut).toMatchObject({ floorNotch: 12.5 });
      expect(cut && "depth" in cut ? cut.depth : 0).toBeCloseTo(least - well.floorZ, 9);
      expect(cut && "depth" in cut ? cut.depth : 0).toBeGreaterThan(0.8);
      // planTray (with the groove) builds it, and the cut leaves through the wall with its notch
      const spec = traySpecFrom(realize(part, s, upper), outer, upper, s, "t");
      const plan = planTray(spec, s);
      expect(plan.groove).not.toBeNull();
      expect(plan.compartments[0]?.cuts.map((c) => c.notch)).toEqual([12.5]);
    });

    it("gets a short figure's pocket a notched cut at the front and the back too", () => {
      const part = partOf(
        [minis({ figures: [{ name: "Pawn", w: 20, d: 20, h: 1, count: 1 }] })],
        "standing|strip|split1",
      );
      expect(minOuter(part, s, upper).h).toBe(least);
      const cuts = cutsOf(wellOf(part, s, upper)).flatMap((f) =>
        f.type === "wallCutout" ? [f] : [],
      );
      expect(cuts.map((f) => f.side)).toEqual(["front", "back"]);
      expect(cuts.every((f) => f.floorNotch > 0)).toBe(true);
    });
  });

  it("is still a grip, and keeps a scoop bin only where no cut fits", () => {
    const flat = partOf([custom({ h: 2, count: 1 })], "custom|strip|split1");
    const r = realize(flat);
    expect(hasGrip(r.compartments, minOuter(flat, s, ground).h)).toBe(true);
    // a 9 mm wide item has no room for a 10 mm cut between its posts: still the scoop bin
    const narrow = size([custom({ w: 9, d: 9, h: 2, count: 1 })], s);
    const ids = narrow.requirements.flatMap((req) => req.variants.map((v) => v.id));
    expect(ids).toEqual(["bulk-shallow|strip|split1"]);
  });
});

describe("no wall left for a cutout", () => {
  it("cuts no well too small for a 10 mm cut with 3 mm posts: its tile goes in a scoop bin", () => {
    // A 1 mm tile at a 0.9 mm wall and chamfer (review 2, M-a: it got a 0.4–0.54 mm cut).
    const thin = largestChamfer({ ...s, wall: MIN_WALL_MM, floor: MIN_WALL_MM });
    const pip = tiles({
      name: "Pip",
      shape: { type: "rect", w: 1, d: 1 },
      thickness: 1,
      count: 1,
      storage: "flat",
      clearance: 0,
    });
    const result = size([pip], thin);
    const ids = result.requirements.flatMap((req) => req.variants.map((v) => v.id));
    expect(ids).toEqual(["bulk-shallow|strip|split1"]);
    expect(result.notices).toEqual([
      expect.objectContaining({
        level: "info",
        code: "sizing.noFingerSlot",
        message: expect.stringMatching(
          /^Pip: no tray arrangement leaves room for a finger cutout of at least 10 mm by Pip ×1 with 3 mm of wall beside it, so it is stored loose in a tray with a curved floor instead\.$/,
        ),
        path: "/components/0",
      }),
    ]);
  });
});

describe("posts: a cut never removes a whole wall (spec §6.1)", () => {
  it("cuts 15 mm square tiles laid flat 10 mm wide, leaving 3 mm posts in their 16 mm wells", () => {
    // Sample 25 (flat-c4): the cut took the whole 16 mm, down through the floor, and the end walls
    // and dividers were gone.
    const squares = tiles({ shape: { type: "rect", w: 15, d: 15 }, thickness: 2, count: 40 });
    const r = realize(partOf([squares], "flat-c4|strip|split1"));
    for (const c of r.compartments) {
      expect(cutsOf(c).map((f) => f.type === "wallCutout" && [f.width, f.floorNotch])).toEqual([
        [10, 7.6],
        [10, 7.6],
      ]);
    }
  });

  it("gives every small-tiles component a tray at default settings, all keeping their posts", () => {
    const { components } = loadFixture(smallTiles);
    const result = size(components, s);
    expect(result.requirements.flatMap((req) => req.componentIds).sort()).toEqual(
      components.map((c) => c.id).sort(),
    );
    for (const req of result.requirements) {
      for (const v of req.variants) {
        for (const part of v.parts) {
          realize(part);
        }
      }
    }
  });

  it("drops the flat variants of tiles too small for a cut, keeping the upright ones or a bin", () => {
    const hexes = (storage: "flat" | "auto") =>
      tiles({
        shape: { type: "hex", flatToFlat: 8.5, orientation: "flat" },
        thickness: 1.5,
        count: 19,
        storage,
      });
    const auto = size([hexes("auto")], s);
    const ids = auto.requirements.flatMap((req) => req.variants.map((v) => v.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith("upright"))).toBe(true);
    // Flat only: no flat variant is left, so the tiles go in a scoop bin, and a notice says so.
    const flat = size([hexes("flat")], s);
    const binIds = flat.requirements.flatMap((req) => req.variants.map((v) => v.id));
    expect(binIds.every((id) => id.startsWith("bulk-"))).toBe(true);
    expect(flat.notices.map((n) => [n.level, n.code])).toEqual([["info", "sizing.noFingerSlot"]]);
  });
});

describe("finger room in the cut walls (fingerPocket.wallRoom)", () => {
  const strip = partOf([cards({ decks: decks(40, 60, 30) })], "upright-long|strip|split1");

  it("makes the cut end walls 10 mm thicker and the tray 20 mm longer", () => {
    expect(minOuter(strip, wallOnly, ground)).toEqual({ w: 84.85, d: 95.7, h: 69.2 });
    const r = realize(strip, wallOnly);
    expect(r.compartments.map((c) => c.x)).toEqual([11.6, 31.11, 59.27]);
    expect(cutsOf(at(r.compartments, 0))).toEqual([
      cutout("left", 47.85, 34),
      cutout("right", 47.85, 34),
    ]);
  });

  it("thickens the front and back walls of flat tiles cut through them", () => {
    const part = partOf(
      [tiles({ shape: { type: "hex", flatToFlat: 40, orientation: "flat" }, count: 10 })],
      "flat-c1|strip|split1",
    );
    const plain = minOuter(part, s, ground);
    expect(minOuter(part, wallOnly, ground)).toEqual({ ...plain, d: plain.d + 20 });
    expect(at(realize(part, wallOnly).compartments, 0).y).toBe(11.6);
  });

  it("leaves the walls of trays without cutouts alone", () => {
    const part = partOf([bulk()], "shallow|strip|split1");
    expect(minOuter(part, roomy, ground)).toEqual(minOuter(part, s, ground));
  });

  it("keeps the finger room of the end wall in a wider tray, with no pocket beside it", () => {
    const part = partOf([cards({ storage: "flat", decks: decks(30, 30) })], "flat|strip|split1");
    const min = minOuter(part, wallOnly, ground);
    const r = realize(part, wallOnly, ground, { ...min, w: min.w + 30 });
    expect(r.compartments.map((c) => c.kind)).toEqual(["well", "well"]);
    // The last well still stands 10 mm of finger room (and a wall) in from the end it cuts through.
    const last = at(r.compartments, 1);
    expect(min.w + 30 - (last.x + last.w)).toBeGreaterThanOrEqual(10 + 1.6);
  });

  it("reproduces the trays without finger room at 0", () => {
    // The trays from before finger room: the room-10 tray's end walls 10 mm thinner.
    const zero = { ...s, fingerPocket: { ...s.fingerPocket, wallRoom: 0, dividerRoom: 0 } };
    expect(minOuter(strip, zero, ground)).toEqual({ w: 64.85, d: 95.7, h: 69.2 });
    const r = realize(strip, zero);
    expect(r.compartments.map((c) => c.x)).toEqual([1.6, 21.11, 49.27]);
    expect(cutsOf(at(r.compartments, 0))).toEqual([
      cutout("left", 47.85, 34),
      cutout("right", 47.85, 34),
    ]);
  });
});

describe("finger room in the cut dividers (fingerPocket.dividerRoom)", () => {
  const strip = partOf([cards({ decks: decks(40, 60, 30) })], "upright-long|strip|split1");
  const dividersOnly: Settings = { ...s, fingerPocket: { ...s.fingerPocket, dividerRoom: 5 } };
  const gaps = (r: { compartments: CompartmentSpec[] }) =>
    r.compartments
      .slice(1)
      .map(
        (c, i) =>
          Math.round((c.x - (r.compartments[i]?.x ?? 0) - (r.compartments[i]?.w ?? 0)) * 100) / 100,
      );

  it("makes each divider the channel crosses 5 mm thicker and the tray 10 mm longer", () => {
    expect(minOuter(strip, dividersOnly, ground)).toEqual({ w: 74.85, d: 95.7, h: 69.2 });
    expect(gaps(realize(strip, dividersOnly))).toEqual([6.2, 6.2]);
    // The simple-mode switch: 10 mm on the end walls, 5 mm on the dividers.
    expect(minOuter(strip, roomy, ground)).toEqual({ w: 94.85, d: 95.7, h: 69.2 });
    expect(realize(strip, roomy).compartments.map((c) => c.x)).toEqual([11.6, 36.11, 69.27]);
  });

  it("leaves a divider no cut crosses alone", () => {
    const part = partOfGroup(
      [cards({ decks: decks(30, 30) }), bulk({})],
      "upright-long+shallow|strip|split1",
    );
    const plain = realize(part);
    const thick = realize(part, dividersOnly);
    expect(gaps(plain)).toEqual([1.2, 1.2]);
    expect(gaps(thick)).toEqual([6.2, 1.2]);
    expect(minOuter(part, dividersOnly, ground).w).toBeCloseTo(minOuter(part, s, ground).w + 5, 9);
  });

  it("thickens the dividers between flat decks with long-wall cutouts", () => {
    const part = partOf(
      [cards({ storage: "flat", decks: decks(30, 30, 30) })],
      "flat|strip|split1",
    );
    expect(gaps(realize(part, dividersOnly))).toEqual([6.2, 6.2]);
    expect(minOuter(part, dividersOnly, ground).w).toBeCloseTo(minOuter(part, s, ground).w + 10, 9);
  });

  it("reproduces the trays without divider room at 0", () => {
    // The trays from before divider room: the dividers at the 1.2 mm setting.
    const zero = { ...s, fingerPocket: { ...s.fingerPocket, wallRoom: 10, dividerRoom: 0 } };
    expect(minOuter(strip, zero, ground)).toEqual({ w: 84.85, d: 95.7, h: 69.2 });
    expect(gaps(realize(strip, zero))).toEqual([1.2, 1.2]);
  });
});
