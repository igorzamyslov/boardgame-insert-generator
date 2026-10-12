// src/plan/layers.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import {
  clientToSvg,
  hitTest,
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

  it("maps client pixels to SVG units with letterboxing", () => {
    const vb = { x: 0, y: 0, w: 200, h: 100 };
    expect(clientToSvg({ left: 10, top: 20, width: 400, height: 200 }, vb, 210, 120)).toEqual({
      x: 100,
      y: 50,
    });
    expect(clientToSvg({ left: 0, top: 0, width: 400, height: 400 }, vb, 200, 200)).toEqual({
      x: 100,
      y: 50,
    });
    expect(clientToSvg({ left: 0, top: 0, width: 0, height: 0 }, vb, 1, 1)).toBeNull();
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

  it("clamps label sizes", () => {
    expect(labelFontSize({ x: 0, y: 0, w: 10, h: 10 })).toBe(6);
    expect(labelFontSize({ x: 0, y: 0, w: 300, h: 300 })).toBe(20);
  });
});
