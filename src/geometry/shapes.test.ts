// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { loadManifold } from "./load";
import { withScope } from "./scope";
import {
  box,
  circleRing,
  horizontalCylinder,
  loft,
  prism,
  quarterSegments,
  roundedRectRing,
} from "./shapes";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

describe("loadManifold", () => {
  it("returns the same initialised module on every call", async () => {
    expect(await loadManifold()).toBe(m);
    expect(typeof m.Manifold.hull).toBe("function");
  });
});

describe("rings", () => {
  it("uses 2…16 segments per quarter", () => {
    expect([0, 0.5, 3, 12, 100].map(quarterSegments)).toEqual([2, 2, 6, 16, 16]);
  });

  it("puts corner arcs on fixed angles so inset rings line up", () => {
    const outer = roundedRectRing(0, 0, 20, 10, 3, 6);
    const inner = roundedRectRing(0.4, 0.4, 19.6, 9.6, 2.6, 6);
    expect(outer).toHaveLength(28);
    expect(inner).toHaveLength(28);
    outer.forEach(([x, y], i) => {
      const [ix = 0, iy = 0] = inner[i] ?? [];
      // every inner vertex is its outer vertex moved 0.4 toward the arc centre
      expect(Math.hypot(x - ix, y - iy)).toBeCloseTo(0.4, 9);
    });
  });

  it("returns a plain rectangle for radius 0", () => {
    expect(roundedRectRing(1, 2, 3, 4, 0, 6)).toEqual([
      [1, 2],
      [3, 2],
      [3, 4],
      [1, 4],
    ]);
  });

  it("starts circles at angle 0 with a vertex on every axis", () => {
    const ring = circleRing(0, 0, 2, 8);
    expect(ring[0]).toEqual([2, 0]);
    expect(ring[2]?.[0]).toBeCloseTo(0, 12);
    expect(ring[2]?.[1]).toBeCloseTo(2, 12);
  });
});

describe("solids", () => {
  it("box and prism have exact volumes", () => {
    withScope((scope) => {
      expect(box(m, scope, [0, 0, 0], [2, 3, 4]).volume()).toBeCloseTo(24, 9);
      const square = roundedRectRing(0, 0, 10, 10, 0, 1);
      expect(prism(m, scope, square, 1, 3).volume()).toBeCloseTo(200, 9);
    });
  });

  it("a loft of a ring and its 1 mm inset over 1 mm is a 45° frustum", () => {
    withScope((scope) => {
      const solid = loft(m, scope, [
        { ring: roundedRectRing(1, 1, 9, 9, 0, 1), z: 0 },
        { ring: roundedRectRing(0, 0, 10, 10, 0, 1), z: 1 },
      ]);
      // square frustum: h/3 · (A1 + A2 + √(A1·A2)) = (64 + 100 + 80) / 3
      expect(solid.volume()).toBeCloseTo(244 / 3, 9);
    });
  });

  it("horizontal cylinders run along the requested axis", () => {
    withScope((scope) => {
      const alongX = horizontalCylinder(m, scope, "x", 0, 10, 5, 5, 2).boundingBox();
      expect(alongX.min[0]).toBeCloseTo(0, 9);
      expect(alongX.max[0]).toBeCloseTo(10, 9);
      expect(alongX.min[1]).toBeCloseTo(3, 9);
      expect(alongX.max[2]).toBeCloseTo(7, 9);
      const alongY = horizontalCylinder(m, scope, "y", 0, 10, 5, 5, 2).boundingBox();
      expect(alongY.max[1]).toBeCloseTo(10, 9);
      expect(alongY.min[0]).toBeCloseTo(3, 9);
    });
  });
});
