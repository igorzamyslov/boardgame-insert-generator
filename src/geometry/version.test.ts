import { describe, expect, it } from "vitest";
import { GEOMETRY_VERSION, isOlderGeometryLine } from "./version";

describe("isOlderGeometryLine", () => {
  it("pre-1.0, treats each 0.MINOR as a major line (spec §9)", () => {
    expect(GEOMETRY_VERSION).toBe("0.7.0");
    expect(isOlderGeometryLine("0.0.9")).toBe(true);
    expect(isOlderGeometryLine("0.1.1")).toBe(true); // finger pockets: refused now, reprint
    expect(isOlderGeometryLine("0.2.0")).toBe(true); // finger-cut minis and scoop walls: reprint
    expect(isOlderGeometryLine("0.3.0")).toBe(true); // slack as a filler, not thicker walls: reprint
    expect(isOlderGeometryLine("0.4.0")).toBe(true); // stacked trays kept at the footprint of what is under them: reprint
    expect(isOlderGeometryLine("0.5.2")).toBe(true); // bounded growth: outer sizes change, reprint
    expect(isOlderGeometryLine("0.6.0")).toBe(true); // divider slots in the floor: tray changes, reprint
    expect(isOlderGeometryLine("0.7.7")).toBe(false); // PATCH acts as minor: same line
    expect(isOlderGeometryLine("0.7.0")).toBe(false); // the same line
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
