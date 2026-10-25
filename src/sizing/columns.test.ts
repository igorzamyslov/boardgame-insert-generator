import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, FINGER_ROOM_MM, applyFingerRoom } from "../model/settings";
import type { CompartmentSpec, Component, Settings } from "../model/types";
import { harbourKingsKit } from "../test-support/harbourKings";
import { wallCutout } from "./common";
import { size } from "./group";
import { columnWidthCapU, columnsGrowthCapU, partGrowthCapOf, UNBOUNDED_U } from "./growth";
import { minOuter, outerCutSides, realizeTray } from "./realize";
import { at } from "./test-helpers";
import type { CompartmentReq, RealizeOptions, TrayPartReq } from "./types";
import { toU } from "./units";

// The columns arrangement (group-tray-fill spec §3 (b)): columns side by side from the left, each
// stacking its wells front to back under the deepest well's depth.
const ground: RealizeOptions = { lipped: false, level: 0 };

function well(contents: string, minW: number, minD: number, over: Partial<CompartmentReq> = {}) {
  const c: CompartmentReq = {
    componentId: contents,
    contents,
    kind: "well",
    minW,
    minD,
    minH: 10,
    elastic: { w: false, d: false, h: false },
    features: [],
    ...over,
  };
  return c;
}

function columnsPart(compartments: CompartmentReq[], columnBreaks: number[]): TrayPartReq {
  return { trayKey: "t:p0:0", arrangement: "columns", compartments, columnBreaks, rotatable: true };
}

const byName = (wells: readonly CompartmentSpec[], name: string): CompartmentSpec => {
  const found = wells.find((c) => c.contents.includes(name));
  if (found === undefined) {
    throw new Error(`no well ${name}`);
  }
  return found;
};

describe("the Player kit in columns", () => {
  const project = harbourKingsKit();
  const s: Settings = project.settings;
  // The fixture still sets the old per-axis Max growth on Resources (src/test-support is not
  // updated here); the item's room is "as much as fits" now, which is what its fill needs.
  const components = project.components.map((c) =>
    c.id === "kitres01" ? ({ ...c, room: "max" } as Component) : c,
  );
  const req = at(size(components, s, project.groups ?? []).requirements, 0);
  const variant = req.variants.find((v) => v.id.endsWith("|columns|split1"));
  const part = at(variant?.parts ?? [], 0);

  it("stacks [Starter deck] [Wood | Stone] [Grain | Hero]", () => {
    expect(req.key).toBe("plrkit01");
    expect(part.arrangement).toBe("columns");
    expect(part.columnBreaks).toEqual([1, 3]);
    expect(part.compartments.map((c) => c.contents)).toEqual([
      "Starter deck ×12",
      "Resources — Wood ×10",
      "Resources — Stone ×10",
      "Resources — Grain ×10",
      "Hero",
    ]);
  });

  it("is 109.6 mm wide instead of 162, as deep as the deck", () => {
    // Inner width 47 + 1.2 + 25 + 1.2 + 32 = 106.4 (the Hero's pocket is 30 + 2), and 2 × 1.6 of wall.
    const min = minOuter(part, s, ground);
    expect(min.w).toBeCloseTo(109.6, 5);
    expect(min.d).toBeCloseTo(71.2, 5);
    const strip = at(req.variants.find((v) => v.id.endsWith("|strip|split1"))?.parts ?? [], 0);
    expect(minOuter(strip, s, ground).w).toBeCloseTo(162, 5);
  });

  it("fills the bins to their column's depth and the Grain bin to its column's width", () => {
    const min = minOuter(part, s, ground);
    const tray = realizeTray(part, { ...min, h: 70 }, s, ground);
    const [deck, wood, stone, grain, hero] = ["Starter", "Wood", "Stone", "Grain", "Hero"].map(
      (name) => byName(tray.compartments, name),
    ) as [CompartmentSpec, CompartmentSpec, CompartmentSpec, CompartmentSpec, CompartmentSpec];
    expect([deck.x, deck.y, deck.w, deck.d]).toEqual([1.6, 1.6, 47, 68]);
    // Wood and Stone share the 16.8 mm their column has spare.
    expect(wood.x).toBeCloseTo(49.8, 5);
    expect(stone.x).toBeCloseTo(49.8, 5);
    expect(wood.w).toBeCloseTo(25, 5);
    expect(wood.d + stone.d).toBeCloseTo(68 - 1.2, 5);
    expect(wood.y).toBeCloseTo(1.6, 5);
    expect(stone.y + stone.d).toBeCloseTo(69.6, 5);
    // Grain takes the Hero's column width and the column's spare depth; the Hero stays 32 × 32.
    expect(grain.x).toBeCloseTo(76, 5);
    expect(grain.w).toBeCloseTo(32, 5);
    expect(grain.d).toBeCloseTo(68 - 1.2 - 32, 5);
    expect([hero.x, hero.w, hero.d]).toEqual([76, 32, 32]);
    expect(hero.y + hero.d).toBeCloseTo(69.6, 5);
    // The Hero's front faces the Grain bin, which has no cut: only its back cut goes through.
    const heroCuts = hero.features.flatMap((f) => (f.type === "wallCutout" ? [f.side] : []));
    expect(heroCuts).toEqual(["back"]);
    // The deck keeps its cut through the left wall, the outer wall of the first column.
    const deckCuts = deck.features.flatMap((f) => (f.type === "wallCutout" ? [f.side] : []));
    expect(deckCuts).toEqual(["left"]);
    expect(outerCutSides(part, s, ground)).toEqual({
      left: true,
      right: false,
      front: false,
      back: true,
    });
  });

  it("gives the layout no room to grow the tray: the bins fill, they do not stretch it", () => {
    expect(partGrowthCapOf(part, "w")).toBe(0);
    expect(partGrowthCapOf(part, "d")).toBe(0);
  });
});

describe("columns placement", () => {
  const s = DEFAULT_SETTINGS;
  const deep = well("deep", 30, 60);
  const front = well("front", 20, 25);
  const back = well("back", 20, 25);

  it("centres a narrower well in its column and a shallower column's wells at their size", () => {
    const part = columnsPart([deep, well("narrow", 10, 20), well("wide", 20, 20)], [1]);
    const min = minOuter(part, s, ground);
    const tray = realizeTray(part, min, s, ground);
    const narrow = byName(tray.compartments, "narrow");
    const wide = byName(tray.compartments, "wide");
    expect(narrow.x + narrow.w / 2).toBeCloseTo(wide.x + wide.w / 2, 1);
    expect(narrow.w).toBe(10);
    expect(narrow.d).toBe(20);
    expect(narrow.y + narrow.d).toBeLessThan(wide.y);
  });

  it("gives width slack to an elastic column, up to its growth, and the rest to the walls", () => {
    const grows = well("grows", 20, 25, {
      elastic: { w: true, d: false, h: false },
      growth: { w: 4 },
    });
    const part = columnsPart([deep, grows, back], [1]);
    const min = minOuter(part, s, ground);
    const tray = realizeTray(part, { ...min, w: min.w + 10 }, s, ground);
    // The elastic well takes 4 mm and the column with it; the other well is centred in it.
    expect(byName(tray.compartments, "grows").w).toBeCloseTo(24, 5);
    expect(byName(tray.compartments, "back").w).toBe(20);
    expect(byName(tray.compartments, "deep").w).toBe(30);
    expect(columnWidthCapU([grows, back])).toBe(toU(4));
  });

  it("gives depth slack to a column's elastic wells and a well filling in depth", () => {
    const grows = well("grows", 20, 25, { elastic: { w: false, d: true, h: false } });
    const fills = well("fills", 20, 25, { fill: { d: true } });
    const part = columnsPart([deep, grows, back, fills, front], [1, 3]);
    const tray = realizeTray(part, minOuter(part, s, ground), s, ground);
    const inner = 60;
    expect(byName(tray.compartments, "grows").d).toBeCloseTo(inner - s.divider - 25, 5);
    expect(byName(tray.compartments, "fills").d).toBeCloseTo(inner - s.divider - 25, 5);
    expect(byName(tray.compartments, "back").d).toBe(25);
    expect(byName(tray.compartments, "front").d).toBe(25);
  });

  it("caps the tray's depth growth by the least tolerant column, and adds width growth", () => {
    const loose = { elastic: { w: true, d: true, h: false } } as const;
    const a = well("a", 20, 25, { ...loose, growth: { w: 3, d: 8 } });
    const b = well("b", 20, 25, { ...loose, growth: { w: 5, d: 2 } });
    const tall = well("tall", 30, 60, { ...loose, growth: { w: 7, d: 4 } });
    // Columns [tall] [a | b]: depth, the tall column takes 4; [a | b] has 60 − 50 = 10 spare of
    // the 8 + 2 it can take, so nothing more. Width adds: 7 + min(3, 5).
    expect(columnsGrowthCapU([[tall], [a, b]], "d")).toBe(0);
    expect(columnsGrowthCapU([[tall], [a, b]], "w")).toBe(toU(7 + 3));
    const roomy = well("roomy", 20, 25, { ...loose, growth: { d: 20 } });
    // Now [roomy | b] can take 22, less its 10 spare: 12; the tall column 4. The tray: 4.
    expect(columnsGrowthCapU([[tall], [roomy, b]], "d")).toBe(toU(4));
    expect(columnsGrowthCapU([[tall], [well("fixed", 20, 25)]], "w")).toBe(toU(7));
    expect(columnsGrowthCapU([[well("max", 20, 25, loose)]], "w")).toBe(UNBOUNDED_U);
  });

  it("realizes what the layout's growth cap says the tray can take", () => {
    const loose = { elastic: { w: true, d: true, h: false } } as const;
    const tall = well("tall", 30, 60, { ...loose, growth: { w: 7, d: 4 } });
    const roomy = well("roomy", 20, 25, { ...loose, growth: { w: 3, d: 20 } });
    const b = well("b", 20, 25, { ...loose, growth: { w: 5, d: 2 } });
    const part = columnsPart([tall, roomy, b], [1]);
    const min = minOuter(part, s, ground);
    const tray = realizeTray(part, { ...min, w: min.w + 10, d: min.d + 4 }, s, ground);
    expect(byName(tray.compartments, "tall").d).toBeCloseTo(64, 5);
    expect(byName(tray.compartments, "tall").w).toBeCloseTo(37, 5);
    expect(byName(tray.compartments, "roomy").w).toBeCloseTo(23, 5);
    const column = byName(tray.compartments, "roomy").d + byName(tray.compartments, "b").d;
    expect(column).toBeCloseTo(64 - s.divider, 5);
  });

  it("puts finger room on the front wall of the one column cut through it", () => {
    const cut = (name: string) => well(name, 30, 25, { features: [wallCutout("front", 1, false)] });
    const part = columnsPart([deep, cut("cut"), back], [1]);
    const off = minOuter(part, s, ground);
    const room = minOuter(part, applyFingerRoom(s, true), ground);
    // The cut column is 25 + 1.2 + 25 deep; its room (10) takes it past the deep column (60).
    expect(room.d).toBeCloseTo(off.d + 51.2 + FINGER_ROOM_MM - 60, 2);
    const tray = realizeTray(part, room, applyFingerRoom(s, true), ground);
    const cutWell = byName(tray.compartments, "cut");
    expect(cutWell.y).toBeGreaterThanOrEqual(FINGER_ROOM_MM - 1e-9);
    expect(byName(tray.compartments, "deep").y).toBeLessThan(cutWell.y);
  });
});
