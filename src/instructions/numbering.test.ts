// src/instructions/numbering.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { StoredLayout, TraySpec } from "../model/types";
import { whatGoesWhere } from "./render";
import {
  buildSpecOf,
  numberParts,
  outerSizeText,
  parentKey,
  partLabel,
  partsByKey,
  printedHeight,
} from "./numbering";

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

describe("buildSpecOf", () => {
  it("carries the part's number to engrave on trays, fillers and risers, not on plates", () => {
    const list = [
      makeTray({ key: "a:p0:0:riser", part: "riser", path: "", stack: 0 }),
      makeTray({ key: "a:p0:0", stack: 0 }),
      makeTray({ key: "a:p0:0:spacer", part: "spacer", path: "", solid: true }),
      makeTray({ key: "a:p0:0:divider:1", part: "divider", path: "", solid: true }),
      makeTray({ key: "leftover:0", part: "leftover", solid: true, stack: 9 }),
    ];
    const parts = numberParts(list);
    const numbered = parts.map((p) => [p.spec.part, buildSpecOf(p, true).partNumber]);
    expect(numbered).toEqual([
      ["riser", 1],
      ["tray", 2],
      ["spacer", undefined],
      ["divider", undefined],
      ["leftover", 5],
    ]);
    // switched off, or on a part that has none: the very same spec
    for (const p of parts) {
      expect(buildSpecOf(p, false)).toBe(p.spec);
    }
    // the engraved number is the number the instructions give the part
    const rows = whatGoesWhere({ trays: list } as StoredLayout, DEFAULT_SETTINGS);
    for (const p of parts) {
      const n = buildSpecOf(p, true).partNumber;
      if (n !== undefined) {
        expect(rows.find((r) => r.number === n)?.label).toBe(p.label);
      }
    }
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

  describe("a merged filler (mergeParts)", () => {
    const member = (key: string, o: Partial<TraySpec> = {}): TraySpec =>
      makeTray({ key, part: "leftover", path: "0", solid: true, compartments: [], ...o });
    /** A merged part of `members`, its box the bounding box of the members. */
    const mergedOf = (key: string, members: TraySpec[], flipped = false): TraySpec => {
      const x0 = Math.min(...members.map((m) => m.x));
      const y0 = Math.min(...members.map((m) => m.y));
      const z0 = Math.min(...members.map((m) => m.z));
      return makeTray({
        key,
        part: "leftover",
        solid: true,
        compartments: [],
        x: x0,
        y: y0,
        z: z0,
        w: Math.max(...members.map((m) => m.x + m.w)) - x0,
        d: Math.max(...members.map((m) => m.y + m.d)) - y0,
        h: Math.max(...members.map((m) => m.z + m.h)) - z0,
        merged: { members, bridges: [], flipped },
      });
    };

    it("is named as one, and goes in before the trays that stand beside or on it", () => {
      const a = makeTray({ key: "a:p0:0", stack: 0, x: 0, y: 0, w: 90, d: 60 });
      const b = makeTray({ key: "b:p0:0", stack: 1, x: 0, y: 60.2, w: 90, d: 60 });
      const strip = mergedOf("merged:0", [
        member("leftover:0", { x: 90.2, y: 0, w: 10, d: 60, h: 35 }),
        member("leftover:1", { x: 90.2, y: 60.2, w: 10, d: 60, h: 35 }),
      ]);
      const parts = numberParts([a, b, strip]);
      expect(parts.map((p) => [p.number, p.spec.key])).toEqual([
        [1, "merged:0"],
        [2, "a:p0:0"],
        [3, "b:p0:0"],
      ]);
      expect(parts[0]?.label).toBe("Merged filler block");
      expect(parts[0]?.parentNumber).toBeNull();
      expect(partLabel({ ...strip, solid: false })).toBe("Merged spare tray");
    });

    it("carries a folded-in riser's tray, so it goes in before that tray", () => {
      const tray = makeTray({ key: "a:p0:0", stack: 0, z: 16.4, w: 90, d: 60, h: 8 });
      const riser = makeTray({
        key: "a:p0:0:riser",
        part: "riser",
        path: "",
        stack: 0,
        w: 90,
        d: 60,
        h: 16.4,
      });
      const wall = member("leftover:0", { x: 90.2, y: 0, w: 10, d: 60, h: 35 });
      const parts = numberParts([tray, mergedOf("merged:0", [riser, wall])]);
      expect(parts.map((p) => p.spec.key)).toEqual(["merged:0", "a:p0:0"]);
    });

    it("follows the tray it rests on: a filler in a stack level stands on the tray below", () => {
      // tray 0 is 28.4 high; the ledge filler stands on it from 28.4 to the top plane, and a
      // ground filler beside the stack joins it upside down
      const t0 = makeTray({ key: "a:p0:0", stack: 0, level: 0, w: 90, d: 90, h: 28.4 });
      const t1 = makeTray({ key: "b:p0:0", stack: 0, level: 1, z: 28.4, w: 90, d: 80, h: 6.6 });
      const other = makeTray({ key: "c:p0:0", stack: 1, x: 0, y: 100, w: 90, d: 90 });
      const ledge = member("leftover:1", { x: 0, y: 80, w: 90, d: 10, z: 28.4, h: 6.6, level: 1 });
      const ground = member("leftover:0", { x: 0, y: 90.2, w: 90, d: 8, h: 35 });
      const parts = numberParts([other, t1, mergedOf("merged:0", [ground, ledge], true), t0]);
      // not first: it cannot go in before the tray its ledge rests on
      expect(parts.map((p) => p.spec.key)).toEqual(["a:p0:0", "merged:0", "b:p0:0", "c:p0:0"]);
    });

    it("keeps several merged parts in key order, whatever order they came in", () => {
      const m0 = mergedOf("merged:0", [member("leftover:0", { x: 90 })]);
      const m1 = mergedOf("merged:1", [member("leftover:1", { x: 190 })]);
      const t = makeTray({ key: "a:p0:0" });
      expect(numberParts([m1, t, m0]).map((p) => p.spec.key)).toEqual([
        "merged:0",
        "merged:1",
        "a:p0:0",
      ]);
    });
  });

  it("numbers the plates of a split spacer after their tray, and names them", () => {
    const tray = makeTray({ key: "a:p0:0", stack: 0, level: 0 });
    const plate = (n: number) =>
      makeTray({ key: `a:p0:0:spacer:${n}`, part: "spacer", path: "", stack: 0, level: 0 });
    const parts = numberParts([plate(2), tray, plate(1), plate(3)]);
    expect(parts.map((p) => [p.number, p.spec.key, p.parentNumber, p.label])).toEqual([
      [1, "a:p0:0", null, partLabel(tray)],
      [2, "a:p0:0:spacer:1", 1, "Spacer plate 1"],
      [3, "a:p0:0:spacer:2", 1, "Spacer plate 2"],
      [4, "a:p0:0:spacer:3", 1, "Spacer plate 3"],
    ]);
    expect(partLabel(plate(1))).toBe("Spacer plate 1");
    expect(parentKey(plate(12))).toBe("a:p0:0");
  });

  it("numbers the dividers of a tray after its spacer plates, in order, and names them", () => {
    const tray = makeTray({ key: "a:p0:0", stack: 0, level: 0 });
    const divider = (n: number) =>
      makeTray({ key: `a:p0:0:divider:${n}`, part: "divider", path: "", stack: 0, level: 0 });
    const parts = numberParts([divider(2), tray, divider(10), divider(1)]);
    expect(parts.map((p) => [p.number, p.spec.key, p.parentNumber, p.label])).toEqual([
      [1, "a:p0:0", null, partLabel(tray)],
      [2, "a:p0:0:divider:1", 1, "Divider 1"],
      [3, "a:p0:0:divider:2", 1, "Divider 2"],
      [4, "a:p0:0:divider:10", 1, "Divider 10"],
    ]);
    expect(parentKey(divider(12))).toBe("a:p0:0");
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
