import { describe, expect, it } from "vitest";
import { GEOMETRY_VERSION, isOlderGeometryLine } from "./version";
import source from "./version.ts?raw";

describe("isOlderGeometryLine", () => {
  it("pre-1.0, treats each 0.MINOR as a major line (spec §9)", () => {
    expect(GEOMETRY_VERSION).toBe("0.9.7");
    expect(isOlderGeometryLine("0.0.9")).toBe(true);
    expect(isOlderGeometryLine("0.1.1")).toBe(true); // finger pockets: refused now, reprint
    expect(isOlderGeometryLine("0.2.0")).toBe(true); // finger-cut minis and scoop walls: reprint
    expect(isOlderGeometryLine("0.3.0")).toBe(true); // slack as a filler, not thicker walls: reprint
    expect(isOlderGeometryLine("0.4.0")).toBe(true); // stacked trays kept at the footprint of what is under them: reprint
    expect(isOlderGeometryLine("0.5.2")).toBe(true); // bounded growth: outer sizes change, reprint
    expect(isOlderGeometryLine("0.6.0")).toBe(true); // divider slots in the floor: tray changes, reprint
    expect(isOlderGeometryLine("0.7.2")).toBe(true); // lip inset in place of a flush stack: reprint
    expect(isOlderGeometryLine("0.8.7")).toBe(true); // a riser with the lip: a riser and a tray of 0.8 do not mate with 0.9
    expect(isOlderGeometryLine("0.8.0")).toBe(true); // flush stacking, before the riser's lip: reprint
    expect(isOlderGeometryLine("0.8.5")).toBe(true); // risers from 3 mm, no lip on them: reprint
    expect(isOlderGeometryLine("0.9.0")).toBe(false); // a PATCH behind is the same line
    expect(isOlderGeometryLine("0.9.1")).toBe(false); // the slit, a PATCH of this line
    expect(isOlderGeometryLine("0.9.2")).toBe(false); // the stepped base, a PATCH of this line
    expect(isOlderGeometryLine("0.9.3")).toBe(false); // the notched cut, a PATCH of this line
    expect(isOlderGeometryLine("0.9.4")).toBe(false); // the finger dip (0.9.7 swaps it for a chamfer), a PATCH of this line
    expect(isOlderGeometryLine("0.9.5")).toBe(false); // upright reach, a PATCH of this line
    expect(isOlderGeometryLine("0.9.6")).toBe(false); // one shape for a lipped fold
    expect(isOlderGeometryLine("0.9.7")).toBe(false); // the current version: the top chamfer, a PATCH of this line
    expect(isOlderGeometryLine("0.9.8")).toBe(false); // a PATCH ahead is the same line
    expect(isOlderGeometryLine("1.0.0")).toBe(false);
    expect(isOlderGeometryLine("0.4.1", "0.5.0")).toBe(true);
  });

  it("from 1.0 on, compares MAJOR only; every 0.x line is older", () => {
    expect(isOlderGeometryLine("1.4.2", "2.0.0")).toBe(true);
    expect(isOlderGeometryLine("2.0.0", "2.3.1")).toBe(false);
    expect(isOlderGeometryLine("2.9.9", "2.0.0")).toBe(false);
    expect(isOlderGeometryLine("0.9.0", "1.0.0")).toBe(true);
    expect(isOlderGeometryLine("3.0.0", "2.0.0")).toBe(false);
  });

  it("is false for a version it cannot read", () => {
    for (const stored of ["", "1.0", "v0.1.0", "0.1.0-beta", "unknown"]) {
      expect(isOlderGeometryLine(stored)).toBe(false);
    }
  });
});

describe("the version history", () => {
  const at = (heading: string) => source.indexOf(` * ${heading} `);

  it("reads in order: 0.8.0 flush stacking, then 0.8.1 name engraving, then 0.8.2 one rounding of a merged part, then 0.8.3 group Max filling its tray, then 0.8.4 columns, then 0.8.5 risers from 3 mm, then 0.9.0 the lip on a riser and one floor under every tray, then 0.9.1 no slit in a merged part, then 0.9.2 the stepped base, then 0.9.3 the notched cut of flat custom items and short minis, then 0.9.4 the finger dip, then 0.9.5 no upright storage for small chits, then 0.9.6 one shape for a folded part with a lipped riser, then 0.9.7 the top chamfer in place of the finger dip; no version that never shipped", () => {
    expect(at("0.8.0")).toBeGreaterThan(at("0.7.2"));
    expect(at("0.8.1")).toBeGreaterThan(at("0.8.0"));
    expect(at("0.8.2")).toBeGreaterThan(at("0.8.1"));
    expect(at("0.8.3")).toBeGreaterThan(at("0.8.2"));
    expect(at("0.8.4")).toBeGreaterThan(at("0.8.3"));
    expect(at("0.8.5")).toBeGreaterThan(at("0.8.4"));
    expect(at("0.9.0")).toBeGreaterThan(at("0.8.5"));
    expect(at("0.9.1")).toBeGreaterThan(at("0.9.0"));
    expect(at("0.9.2")).toBeGreaterThan(at("0.9.1"));
    expect(at("0.9.3")).toBeGreaterThan(at("0.9.2"));
    expect(at("0.9.4")).toBeGreaterThan(at("0.9.3"));
    expect(at("0.9.5")).toBeGreaterThan(at("0.9.4"));
    expect(at("0.9.6")).toBeGreaterThan(at("0.9.5"));
    expect(at("0.9.7")).toBeGreaterThan(at("0.9.6"));
    expect(source).not.toContain(" * 0.7.3 ");
  });
});
