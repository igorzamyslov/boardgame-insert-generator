import { describe, expect, it } from "vitest";
import { planTray } from "../geometry/plan";
import { traySpecFrom } from "../geometry/test-specs";
import { DEFAULT_SETTINGS, applyFingerRoom } from "../model/settings";
import type { CompartmentSpec, FeatureSpec, Settings, TileShape } from "../model/types";
import { hasGrip } from "./grip";
import { minOuter, realizeTray } from "./realize";
import { assertTrayInvariants, at, bulk, cards, partOf, tiles } from "./test-helpers";
import type { OuterSize, RealizeOptions, TrayPartReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;
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
  assertTrayInvariants(r, outer, settings, opts);
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
    expect(hasGrip(realize(strip).compartments.map((c) => ({ ...c, w: 10, d: 10 })))).toBe(true);
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
    // Each channel spans its row's 16 mm and leaves the 1.2 mm divider between the rows whole.
    expect(cutsOf(row0)).toEqual([cutout("left", 9.6, 8, 0, 16), cutout("right", 9.6, 8, 0, 16)]);
    expect(cutsOf(row1)).toEqual([cutout("left", 26.8, 8, 0, 16), cutout("right", 26.8, 8, 0, 16)]);
  });

  it("opens no channel into bits: a deck beside a bulk compartment is cut on its other side only", () => {
    const part = partOf(
      [cards({ groupId: "g", decks: decks(30) }), bulk({ groupId: "g" })],
      "upright-long+shallow|strip|split1",
    );
    const r = realize(part);
    expect(at(r.compartments, 0).features.map((f) => [f.type, "side" in f && f.side])).toEqual([
      ["wallCutout", "left"],
    ]);
    expect(at(r.compartments, 1).features.filter((f) => f.type === "wallCutout")).toEqual([]);
  });

  it("notches a spacer standing in a channelled well to match the channel", () => {
    const one = partOf([cards()], "upright-long|strip|split1");
    const min = minOuter(one, s, ground);
    const r = realize(one, s, ground, { ...min, w: min.w + 30 });
    expect(r.spacers).toHaveLength(1);
    // Spacer frame: the well's 92.5 mm along Y from y 1.6, its top 5 mm below the rim.
    expect(at(r.spacers, 0)).toMatchObject({ y: 1.6, w: 30, d: 92.5, h: 63 });
    expect(at(r.spacers, 0).features).toEqual([
      { type: "spacerNotch", axis: "x", at: 46.25, width: 25, depth: 29 },
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
        contents: "Main ×52",
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

  it("runs a cutout into a spare compartment at the row end", () => {
    const part = partOf([cards({ storage: "flat", decks: decks(30, 30) })], "flat|strip|split1");
    const min = minOuter(part, s, ground);
    const r = realize(part, s, ground, { ...min, w: min.w + 30 });
    expect(r.compartments.map((c) => c.kind)).toEqual(["well", "well", "spare"]);
    expect(cutsOf(at(r.compartments, 1)).map((f) => ("side" in f ? f.side : ""))).toEqual([
      "left",
      "right",
    ]);
    const plan = planTray(traySpecFrom(r, { ...min, w: min.w + 30 }, ground, s, "t"), s);
    expect(plan.compartments[1]?.cuts.map((cut) => cut.into)).toEqual([0, 2]);
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

  it("gives the room to a spare at the row end, which the cutout runs into", () => {
    const part = partOf([cards({ storage: "flat", decks: decks(30, 30) })], "flat|strip|split1");
    const min = minOuter(part, wallOnly, ground);
    const r = realize(part, wallOnly, ground, { ...min, w: min.w + 30 });
    const spare = at(r.compartments, 2);
    expect(spare.kind).toBe("spare");
    // The spare reaches the grown wall: it took the 10 mm of finger room.
    expect(Math.round((min.w + 30 - spare.x - spare.w) * 100) / 100).toBe(3.2);
  });

  it("reproduces the trays without finger room at 0", () => {
    const zero = { ...s, fingerPocket: { ...s.fingerPocket, wallRoom: 0, dividerRoom: 0 } };
    expect(realize(strip, zero)).toEqual(realize(strip, s));
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
    const part = partOf(
      [cards({ groupId: "g", decks: decks(30, 30) }), bulk({ groupId: "g" })],
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
    const zero = { ...s, fingerPocket: { ...s.fingerPocket, dividerRoom: 0 } };
    expect(realize(strip, zero)).toEqual(realize(strip, s));
  });
});
