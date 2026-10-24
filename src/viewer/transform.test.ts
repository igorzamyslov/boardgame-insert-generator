// src/viewer/transform.test.ts
import { describe, expect, it } from "vitest";
import tokens from "../styles/tokens.css?raw";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import {
  EDITED_EMISSIVE,
  EDITED_FADE,
  EDITED_OPACITY,
  EXPLODE_MM,
  FADE_BLEND,
  LIT_EMISSIVE,
  PAGE_HEX,
  SELECTED_EMISSIVE,
  boxOutline,
  emissiveOf,
  fadeOf,
  isVisible,
  opacityOf,
  reservedSlabs,
  trayPosition,
} from "./transform";

describe("viewer transforms", () => {
  it("lifts upper levels when exploded", () => {
    const upper = makeTray({ x: 3, y: 4, z: 40, level: 1 });
    expect(trayPosition(upper, 0)).toEqual([3, 4, 40]);
    expect(trayPosition(upper, 1)).toEqual([3, 4, 40 + EXPLODE_MM]);
    expect(trayPosition(makeTray({ level: 0 }), 1)).toEqual([0, 0, 0]);
  });

  it("spreads a single layer apart from the box centre when exploded", () => {
    const left = makeTray({ x: 0, y: 40, w: 40, d: 20, level: 0 });
    const right = makeTray({ x: 160, y: 40, w: 40, d: 20, level: 0 });
    const c: [number, number] = [100, 50];
    expect(trayPosition(left, 0, c)).toEqual([0, 40, 0]);
    const l = trayPosition(left, 1, c);
    const r = trayPosition(right, 1, c);
    expect(l[0]).toBeLessThan(0);
    expect(r[0]).toBeGreaterThan(160);
    expect(r[0] - l[0]).toBeGreaterThan(160);
    expect(l[1]).toBe(40);
    // A tray at the very centre has no spread to move by; it drops instead (next test).
    const mid = trayPosition(makeTray({ x: 80, y: 40, w: 40, d: 20 }), 1, c);
    expect([mid[0], mid[1]]).toEqual([80, 40]);
  });

  // A merged filler wrapping the trays has its bounding box centred on the box, so the spread
  // gave it no sideways move, and at level 0 no lift: it alone stayed put.
  it("drops a part centred on the box, which spreading and lifting leave in place", () => {
    const c: [number, number] = [100, 50];
    const wrap = makeTray({ x: 2, y: 2, w: 196, d: 96, h: 30, level: 0 });
    expect(trayPosition(wrap, 0, c)).toEqual([2, 2, 0]);
    const full = trayPosition(wrap, 1, c);
    expect(full[0]).toBeCloseTo(2);
    expect(full[1]).toBeCloseTo(2);
    expect(full[2]).toBeCloseTo(-EXPLODE_MM);
    // It drops gradually with the slider, and never moves sideways.
    expect(trayPosition(wrap, 0.5, c)[2]).toBeCloseTo(-EXPLODE_MM / 2);
    // Without a centre only the lift applies, as before.
    expect(trayPosition(wrap, 1)).toEqual([2, 2, 0]);
  });

  it("leaves a part that spreads visibly exactly where it was, and an upper part to lift", () => {
    const c: [number, number] = [100, 50];
    // 20 mm off centre in x: a 10 mm spread, at the edge of the drop's range.
    const off = makeTray({ x: 100, y: 40, w: 40, d: 20 });
    expect(trayPosition(off, 1, c)).toEqual([100 + 20 * 0.5, 40, 0]);
    const far = makeTray({ x: 160, y: 40, w: 40, d: 20 });
    expect(trayPosition(far, 1, c)[2]).toBe(0);
    // A centred part on an upper level lifts, not drops.
    const up = makeTray({ x: 80, y: 40, w: 40, d: 20, level: 1, z: 40 });
    expect(trayPosition(up, 1, c)[2]).toBe(40 + EXPLODE_MM);
  });

  // A spacer sits inside its tray's well. Spread moves a part in proportion to its own
  // distance from the centre, so measuring the spacer from itself slid it through the tray's
  // wall; it has to travel with the tray and rise clear instead.
  it("keeps a card spacer in station with its tray and lifts it clear", () => {
    const tray = makeTray({ key: "a:p0:0", x: 160, y: 40, w: 40, d: 20 });
    const spacer = makeTray({
      key: "a:p0:0:spacer",
      part: "spacer",
      x: 190,
      y: 42,
      w: 8,
      d: 16,
    });
    const c: [number, number] = [100, 50];

    const t = trayPosition(tray, 1, c);
    const s = trayPosition(spacer, 1, c, tray);
    // Same sideways move as the tray, so it stays the same distance inside the well.
    expect(s[0] - spacer.x).toBeCloseTo(t[0] - tray.x);
    expect(s[1] - spacer.y).toBeCloseTo(t[1] - tray.y);
    // And it rises out of the tray, so it still reads as a part of its own.
    expect(s[2]).toBeGreaterThan(t[2]);
    // Nothing moves when the trays are together.
    expect(trayPosition(spacer, 0, c, tray)).toEqual([190, 42, 0]);
  });

  it("keeps a divider in station with its tray and lifts it clear, like a spacer", () => {
    const tray = makeTray({ key: "a:p0:0", x: 160, y: 40, w: 40, d: 20 });
    const divider = makeTray({
      key: "a:p0:0:divider:1",
      part: "divider",
      x: 180,
      y: 42,
      w: 3,
      d: 16,
    });
    const c: [number, number] = [100, 50];
    const t = trayPosition(tray, 1, c);
    const d = trayPosition(divider, 1, c, tray);
    expect(d[0] - divider.x).toBeCloseTo(t[0] - tray.x);
    expect(d[1] - divider.y).toBeCloseTo(t[1] - tray.y);
    expect(d[2]).toBeGreaterThan(t[2]);
    expect(trayPosition(divider, 0, c, tray)).toEqual([180, 42, 0]);
  });

  it("filters layers", () => {
    expect(isVisible(makeTray({ level: 2 }), null)).toBe(true);
    expect(isVisible(makeTray({ level: 2 }), 1)).toBe(false);
  });

  it("outlines the inner box around the clearance origin", () => {
    expect(
      boxOutline(
        { ...DEFAULT_BOX, innerWidth: 200, innerDepth: 100, innerHeight: 50 },
        DEFAULT_SETTINGS,
      ),
    ).toEqual({
      min: [-0.5, -0.5, 0],
      size: [200, 100, 50],
    });
  });

  describe("emissiveOf", () => {
    const lit = new Set(["a", "b"]);

    it("glows the selected tray, softly tints the lit ones, and leaves the rest alone", () => {
      expect(emissiveOf("a", "c", lit)).toBe(LIT_EMISSIVE);
      expect(emissiveOf("c", "c", lit)).toBe(SELECTED_EMISSIVE);
      expect(emissiveOf("d", "c", lit)).toBe(0);
      expect(emissiveOf("d", null, new Set())).toBe(0);
    });

    it("keeps the selected tray's own glow while it is lit, and the lit glow quieter", () => {
      expect(emissiveOf("a", "a", lit)).toBe(SELECTED_EMISSIVE);
      expect(LIT_EMISSIVE).toBeGreaterThan(0);
      expect(LIT_EMISSIVE).toBeLessThan(SELECTED_EMISSIVE);
    });
  });

  describe("fadeOf", () => {
    const lit = new Set(["a", "b"]);
    const none = new Set<string>();

    it("fades nothing while nothing is selected or lit", () => {
      expect(fadeOf("a", null, none)).toBe(0);
      expect(fadeOf("z", null, none)).toBe(0);
    });

    it("keeps the selected tray at full colour and fades every other", () => {
      expect(fadeOf("c", "c", none)).toBe(0);
      expect(fadeOf("a", "c", none)).toBe(FADE_BLEND);
      expect(fadeOf("z", "c", none)).toBe(FADE_BLEND);
    });

    it("keeps the lit trays at full colour and fades the rest, while nothing is selected", () => {
      expect(fadeOf("a", null, lit)).toBe(0);
      expect(fadeOf("b", null, lit)).toBe(0);
      expect(fadeOf("z", null, lit)).toBe(FADE_BLEND);
    });

    it("keeps both the selected tray and the lit ones at full colour", () => {
      expect(fadeOf("c", "c", lit)).toBe(0);
      expect(fadeOf("a", "c", lit)).toBe(0);
      expect(fadeOf("z", "c", lit)).toBe(FADE_BLEND);
    });

    it("blends as far as the plan's dimmed tile lets the page show through (opacity 0.6)", () => {
      expect(FADE_BLEND).toBeCloseTo(1 - 0.6);
    });
  });

  it("fades toward the page's own colour", () => {
    expect(tokens).toContain(`--page: ${PAGE_HEX};`);
  });
  describe("while an item is edited (the editor's 3D view)", () => {
    const lit = new Set(["a", "b"]);
    const none = new Set<string>();
    /** How far a colour is from the page's, as a share of the way from its own colour (0 to 1). */
    const shownBlend = (fade: number, opacity: number): number => fade + (1 - fade) * (1 - opacity);

    it("glows the edited trays more than a rail row's hover does, and still less than white", () => {
      expect(emissiveOf("a", null, lit, true)).toBe(EDITED_EMISSIVE);
      expect(EDITED_EMISSIVE).toBeGreaterThan(LIT_EMISSIVE);
      expect(emissiveOf("z", null, lit, true)).toBe(0);
      expect(emissiveOf("a", null, lit)).toBe(LIT_EMISSIVE);
    });

    it("fades the others more than the plan dims a tile, and lets the edited ones show through them", () => {
      expect(fadeOf("z", null, lit, true)).toBe(EDITED_FADE);
      expect(fadeOf("a", null, lit, true)).toBe(0);
      expect(opacityOf("z", null, lit, true)).toBe(EDITED_OPACITY);
      expect(opacityOf("a", null, lit, true)).toBe(1);
      // a tray that is not faded is opaque, edited or not
      expect(opacityOf("z", null, none, true)).toBe(1);
      expect(opacityOf("z", null, lit)).toBe(1);
      // the plan's dimmed tile shows the page through by 0.4; the editor's faded tray, well over half
      expect(shownBlend(EDITED_FADE, EDITED_OPACITY)).toBeGreaterThanOrEqual(FADE_BLEND * 1.75);
      expect(EDITED_OPACITY).toBeLessThan(0.7);
    });
  });

  describe("reservedSlabs", () => {
    const area = { area: 0, name: "Rulebook", x: 5, y: 7, w: 100, d: 80, z: 30 };

    it("lays each kept-free area as a slab from its z up by the box's headroom, in the trays' frame", () => {
      const box = { ...DEFAULT_BOX, headroom: 4 };
      expect(reservedSlabs([area], box)).toEqual([{ min: [5, 7, 30], size: [100, 80, 4] }]);
    });

    it("takes x and y as they are: trays sit at their spec x, y in the scene, the box clearance is only the outline's offset", () => {
      const box = { ...DEFAULT_BOX, headroom: 4 };
      const [slab] = reservedSlabs([{ ...area, x: 0, y: 0 }], box);
      const outline = boxOutline(box, DEFAULT_SETTINGS);
      expect(slab?.min.slice(0, 2)).toEqual([0, 0]);
      // the slab stays inside the box outline, which starts at -boxClearance
      expect(slab?.min[0]).toBeGreaterThanOrEqual(outline.min[0]);
    });

    it("gives one slab per area, in order, and none for none", () => {
      const box = { ...DEFAULT_BOX, headroom: 2 };
      expect(reservedSlabs([area, { ...area, area: 1, x: 50 }], box).map((s) => s.min[0])).toEqual([
        5, 50,
      ]);
      expect(reservedSlabs([], box)).toEqual([]);
      expect(reservedSlabs(undefined, box)).toEqual([]);
    });
  });
});
