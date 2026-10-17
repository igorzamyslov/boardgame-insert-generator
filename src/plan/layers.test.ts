// src/plan/layers.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import {
  footprintsAt,
  hitTest,
  largestOf,
  layerHeights,
  labelFontSize,
  levelsOf,
  planFrame,
  planViewBox,
  spacersAt,
  toSvgRect,
  traysAt,
} from "./layers";

describe("plan geometry", () => {
  const box = { ...DEFAULT_BOX, innerWidth: 200, innerDepth: 100 };
  const f = planFrame(box, DEFAULT_SETTINGS);

  it("derives the usable floor from the effective box clearance", () => {
    expect(f).toEqual({ bc: 0.5, usableW: 199, usableD: 99, innerW: 200, innerD: 100 });
  });

  it("flips Y so the box front is at the bottom", () => {
    expect(toSvgRect({ x: 10, y: 0, w: 50, d: 30 }, f)).toEqual({ x: 10, y: 69, w: 50, h: 30 });
  });

  it("frames the box with room for the FRONT label", () => {
    const vb = planViewBox(f);
    expect(vb.x).toBeLessThan(-f.bc);
    expect(vb.y + vb.h).toBeGreaterThan(f.usableD + f.bc + 8);
  });

  it("hit-tests rectangles, last drawn wins", () => {
    const rects = [
      { key: "a", rect: { x: 0, y: 0, w: 50, h: 50 } },
      { key: "b", rect: { x: 40, y: 0, w: 50, h: 50 } },
    ];
    expect(hitTest(rects, { x: 10, y: 10 })).toBe("a");
    expect(hitTest(rects, { x: 45, y: 10 })).toBe("b");
    expect(hitTest(rects, { x: 200, y: 10 })).toBeNull();
  });

  it("lists levels and trays per level", () => {
    const trays = [
      makeTray({ key: "a", level: 0 }),
      makeTray({ key: "b", level: 1 }),
      makeTray({ key: "a:spacer", part: "spacer", level: 0 }),
    ];
    expect(levelsOf(trays)).toEqual([0, 1]);
    expect(traysAt(trays, 0).map((t) => t.key)).toEqual(["a"]);
    expect(spacersAt(trays, 0).map((t) => t.key)).toEqual(["a:spacer"]);
  });

  it("leaves a riser out of the plan: it lies under its tray", () => {
    const trays = [
      makeTray({ key: "a", level: 0 }),
      makeTray({ key: "a:riser", part: "riser", level: 0 }),
    ];
    expect(levelsOf(trays)).toEqual([0]);
    expect(traysAt(trays, 0).map((t) => t.key)).toEqual(["a"]);
    expect(spacersAt(trays, 0)).toEqual([]);
  });

  describe("a merged filler (mergeParts)", () => {
    // A ground strip and a filler on the tray below it (level 1), printed as one part.
    const ground = makeTray({
      key: "leftover:0",
      part: "leftover",
      x: 0,
      y: 50,
      w: 90,
      d: 8,
      level: 0,
      compartments: [],
    });
    const ledge = makeTray({
      key: "leftover:1",
      part: "leftover",
      x: 0,
      y: 40,
      w: 90,
      d: 10,
      z: 28,
      level: 1,
      compartments: [],
    });
    const riser = makeTray({ key: "a:riser", part: "riser", x: 0, y: 0, w: 90, d: 40, level: 0 });
    const merged = makeTray({
      key: "merged:0",
      part: "leftover",
      x: 0,
      y: 0,
      w: 90,
      d: 58,
      level: 0,
      compartments: [],
      merged: { members: [riser, ground, ledge], bridges: [], flipped: true },
    });

    it("stands on every layer its members stand on", () => {
      const trays = [makeTray({ key: "t", level: 0 }), makeTray({ key: "u", level: 1 }), merged];
      expect(traysAt(trays, 0).map((t) => t.key)).toEqual(["t", "merged:0"]);
      expect(traysAt(trays, 1).map((t) => t.key)).toEqual(["u", "merged:0"]);
      expect(levelsOf(trays)).toEqual([0, 1]);
    });

    it("is drawn as its members of the layer, not its bounding box, and not the riser under a tray", () => {
      expect(footprintsAt(merged, 0).map((f) => f.y)).toEqual([50]);
      expect(footprintsAt(merged, 1).map((f) => f.y)).toEqual([40]);
      expect(footprintsAt(makeTray({ x: 3, y: 4, w: 5, d: 6 }), 0)).toEqual([
        expect.objectContaining({ x: 3, y: 4, w: 5, d: 6 }),
      ]);
    });

    it("writes its number on the largest box, the first on a tie", () => {
      const rects = [
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: 0, w: 20, h: 10 },
        { x: 50, y: 0, w: 10, h: 20 },
      ];
      expect(largestOf(rects)).toBe(rects[1]);
      expect(largestOf([])).toBeUndefined();
    });
  });

  it("clamps label sizes", () => {
    expect(labelFontSize({ x: 0, y: 0, w: 10, h: 10 })).toBe(6);
    expect(labelFontSize({ x: 0, y: 0, w: 300, h: 300 })).toBe(20);
  });
});

describe("layerHeights", () => {
  it("is the stretch from a layer's lower edge to the next one's, the top layer ending at the highest point", () => {
    const trays = [
      makeTray({ key: "a", level: 0, z: 0, h: 20 }),
      makeTray({ key: "b", level: 0, z: 0, h: 45 }),
      makeTray({ key: "c", level: 1, z: 20, h: 40 }),
    ];
    // the heights telescope to the plan's: 20 + 40 = 60
    expect(layerHeights(trays)).toEqual([20, 40]);
  });

  it("leaves out the parts that are not drawn as trays, and is empty without any", () => {
    const trays = [makeTray({ key: "r", part: "riser", level: 1, z: 5, h: 90 })];
    expect(layerHeights(trays)).toEqual([]);
    expect(layerHeights([])).toEqual([]);
  });
});
