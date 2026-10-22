import { describe, expect, it } from "vitest";
import { GEOMETRY_VERSION, isOlderGeometryLine } from "./version";
import source from "./version.ts?raw";

describe("isOlderGeometryLine", () => {
  it("pre-1.0, treats each 0.MINOR as a major line (spec §9)", () => {
    expect(GEOMETRY_VERSION).toBe("0.8.5");
    expect(isOlderGeometryLine("0.0.9")).toBe(true);
    expect(isOlderGeometryLine("0.1.1")).toBe(true); // finger pockets: refused now, reprint
    expect(isOlderGeometryLine("0.2.0")).toBe(true); // finger-cut minis and scoop walls: reprint
    expect(isOlderGeometryLine("0.3.0")).toBe(true); // slack as a filler, not thicker walls: reprint
    expect(isOlderGeometryLine("0.4.0")).toBe(true); // stacked trays kept at the footprint of what is under them: reprint
    expect(isOlderGeometryLine("0.5.2")).toBe(true); // bounded growth: outer sizes change, reprint
    expect(isOlderGeometryLine("0.6.0")).toBe(true); // divider slots in the floor: tray changes, reprint
    expect(isOlderGeometryLine("0.7.2")).toBe(true); // lip inset in place of a flush stack: reprint
    expect(isOlderGeometryLine("0.8.7")).toBe(false); // PATCH acts as minor: same line
    expect(isOlderGeometryLine("0.8.0")).toBe(false); // flush stacking: the same line as 0.8.1
    expect(isOlderGeometryLine("0.8.1")).toBe(false); // a PATCH behind: the same line
    expect(isOlderGeometryLine("0.8.2")).toBe(false); // a PATCH behind: the same line
    expect(isOlderGeometryLine("0.8.3")).toBe(false); // a PATCH behind: the same line
    expect(isOlderGeometryLine("0.8.5")).toBe(false); // the current version
    expect(isOlderGeometryLine("0.8.4")).toBe(false); // a PATCH behind is the same line
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

  it("reads in order: 0.8.0 flush stacking, then 0.8.1 name engraving, then 0.8.2 one rounding of a merged part, then 0.8.3 group Max filling its tray, then 0.8.4 columns, then 0.8.5 risers from 3 mm; no version that never shipped", () => {
    expect(at("0.8.0")).toBeGreaterThan(at("0.7.2"));
    expect(at("0.8.1")).toBeGreaterThan(at("0.8.0"));
    expect(at("0.8.2")).toBeGreaterThan(at("0.8.1"));
    expect(at("0.8.3")).toBeGreaterThan(at("0.8.2"));
    expect(at("0.8.4")).toBeGreaterThan(at("0.8.3"));
    expect(at("0.8.5")).toBeGreaterThan(at("0.8.4"));
    expect(source).not.toContain(" * 0.7.3 ");
  });
});
