// src/instructions/numbering.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_SETTINGS } from "../model/settings";
import { numberParts, outerSizeText, partLabel, partsByKey, printedHeight } from "./numbering";

describe("partLabel", () => {
  it("joins unique contents and names special parts", () => {
    const t = makeTray({
      compartments: [
        { x: 2, y: 2, w: 10, d: 10, floorZ: 1.2, kind: "well", contents: "A ×10", features: [] },
        { x: 14, y: 2, w: 10, d: 10, floorZ: 1.2, kind: "well", contents: "B ×5", features: [] },
        { x: 26, y: 2, w: 10, d: 10, floorZ: 1.2, kind: "spare", contents: "", features: [] },
        { x: 38, y: 2, w: 10, d: 10, floorZ: 1.2, kind: "well", contents: "A ×10", features: [] },
      ],
    });
    expect(partLabel(t)).toBe("A ×10 + B ×5");
    expect(partLabel(makeTray({ part: "spacer", key: "a:p0:0:spacer" }))).toBe("Card spacer");
    expect(partLabel(makeTray({ part: "riser", key: "a:p0:0:riser", path: "" }))).toBe("Riser");
    expect(partLabel(makeTray({ part: "leftover", key: "leftover:0", solid: true }))).toBe(
      "Filler block",
    );
    expect(partLabel(makeTray({ part: "leftover", key: "leftover:1", solid: false }))).toBe(
      "Spare tray",
    );
    expect(partLabel(makeTray({ key: "k:p0:0", compartments: [] }))).toBe("k:p0:0");
  });
});

describe("printedHeight", () => {
  it("adds the lip height to a lipped tray only", () => {
    const lip = DEFAULT_SETTINGS.lip.height;
    expect(printedHeight(makeTray({ h: 40, lip: false }), DEFAULT_SETTINGS)).toBe(40);
    expect(printedHeight(makeTray({ h: 40, lip: true }), DEFAULT_SETTINGS)).toBe(40 + lip);
    const thin = { ...DEFAULT_SETTINGS, lip: { ...DEFAULT_SETTINGS.lip, height: 1.5 } };
    expect(printedHeight(makeTray({ h: 12.4, lip: true }), thin)).toBe(13.9);
  });

  it("words the outer size with the printed height", () => {
    const t = makeTray({ w: 120, d: 90, h: 30 });
    expect(outerSizeText(t, DEFAULT_SETTINGS)).toBe("120.0 × 90.0 × 30.0 mm");
    expect(outerSizeText({ ...t, lip: true }, DEFAULT_SETTINGS)).toBe(
      `120.0 × 90.0 × ${(30 + DEFAULT_SETTINGS.lip.height).toFixed(1)} mm with its lip`,
    );
  });
});

describe("numberParts", () => {
  it("numbers by stack and level and puts spacers after their tray", () => {
    const top = makeTray({ key: "b:p0:0", stack: 0, level: 1 });
    const bottom = makeTray({ key: "a:p0:0", stack: 0, level: 0 });
    const other = makeTray({ key: "c:p0:0", stack: 1, level: 0 });
    const spacer = makeTray({ key: "a:p0:0:spacer", part: "spacer", path: "", stack: 0, level: 0 });
    const orphan = makeTray({
      key: "zz:p0:0:spacer",
      part: "spacer",
      path: "",
      stack: 9,
      level: 0,
    });
    const parts = numberParts([other, spacer, top, orphan, bottom]);
    expect(parts.map((p) => [p.number, p.spec.key, p.parentNumber])).toEqual([
      [1, "a:p0:0", null],
      [2, "a:p0:0:spacer", 1],
      [3, "b:p0:0", null],
      [4, "c:p0:0", null],
      [5, "zz:p0:0:spacer", null],
    ]);
    expect(partsByKey(parts).get("c:p0:0")?.number).toBe(4);
  });

  it("puts a riser before the tray it carries, then that tray's spacers", () => {
    const tray = makeTray({ key: "a:p0:0", stack: 0, level: 0, z: 12 });
    const riser = makeTray({ key: "a:p0:0:riser", part: "riser", path: "", stack: 0, level: 0 });
    const spacer = makeTray({ key: "a:p0:0:spacer", part: "spacer", path: "", stack: 0, level: 0 });
    const parts = numberParts([spacer, tray, riser]);
    expect(parts.map((p) => [p.number, p.spec.key, p.parentNumber])).toEqual([
      [1, "a:p0:0:riser", 2],
      [2, "a:p0:0", null],
      [3, "a:p0:0:spacer", 2],
    ]);
  });

  it("orders by code unit, not by locale, so the numbers are the same everywhere", () => {
    const upper = makeTray({ key: "B:p0:0", stack: 0, level: 0 });
    const lower = makeTray({ key: "a:p0:0", stack: 0, level: 0 });
    const accent = makeTray({ key: "ä:p0:0", stack: 0, level: 0 });
    expect(numberParts([accent, lower, upper]).map((p) => p.spec.key)).toEqual([
      "B:p0:0",
      "a:p0:0",
      "ä:p0:0",
    ]);
  });

  it("sorts orphan spacers by key whatever order they came in", () => {
    const orphan = (key: string) => makeTray({ key, part: "spacer", path: "", stack: 9, level: 0 });
    const parts = numberParts([
      orphan("zz:p0:0:spacer"),
      orphan("mm:p0:0:spacer"),
      orphan("aa:p0:0:spacer"),
    ]);
    expect(parts.map((p) => p.spec.key)).toEqual([
      "aa:p0:0:spacer",
      "mm:p0:0:spacer",
      "zz:p0:0:spacer",
    ]);
    const shuffled = numberParts([
      orphan("mm:p0:0:spacer"),
      orphan("aa:p0:0:spacer"),
      orphan("zz:p0:0:spacer"),
    ]);
    expect(shuffled.map((p) => p.spec.key)).toEqual(parts.map((p) => p.spec.key));
  });
});
