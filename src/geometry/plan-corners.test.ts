import { describe, expect, it } from "vitest";
import { planTray } from "./plan";
import {
  CORNER_MARGIN,
  MIN_FEATURE_MM,
  SPEC_TOLERANCE,
  maxBottomChamfer,
  maxCornerRadius,
} from "../model/settings";
import type { Settings } from "../model/types";
import { INNER_CORNER_RADIUS } from "./plan-types";
import { quarterSegments, roundedRectRing } from "./shapes";
import type { TrayPlan } from "./plan-types";
import { GEO, compartment, hexTiles, traySpec } from "./test-specs";

describe("corner reliefs", () => {
  it("passes each relief circle through its content corner", () => {
    const plan = planTray(hexTiles, GEO);
    const first = plan.compartments[0];
    expect(first?.reliefs).toHaveLength(4);
    for (const r of first?.reliefs ?? []) {
      const cornerX = r.cx < 20 ? 1.6 : 48.8;
      const cornerY = r.cy < 20 ? 1.6 : 42.6;
      expect(Math.hypot(r.cx - cornerX, r.cy - cornerY)).toBeCloseTo(r.r, 9);
    }
  });

  it("uses the full Ø3 toward outer walls and shrinks reliefs beside a 1.2 mm divider", () => {
    const radii = planTray(hexTiles, GEO).compartments[0]?.reliefs.map((r) =>
      Number(r.r.toFixed(3)),
    );
    // left corners face the 1.6 wall; right corners face the divider:
    // budget (1.2 − 0.8) / 2 = 0.2 mm → r = 0.2 / (1 − 1/√2) = 0.683
    expect(radii).toEqual([1.5, 0.683, 0.683, 1.5]);
  });

  it("drops reliefs when there is no material to spare", () => {
    const spec = traySpec({
      key: "thin",
      w: 1.6 + 20 + 0.9 + 20 + 1.6,
      d: 30,
      h: 20,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 20, d: 26.8, features: [{ type: "cornerRelief", d: 3 }] }),
        compartment({
          x: 22.5,
          y: 1.6,
          w: 20,
          d: 26.8,
          features: [{ type: "cornerRelief", d: 3 }],
        }),
      ],
    });
    const plan = planTray(spec, GEO);
    expect(plan.compartments[0]?.reliefs).toHaveLength(2);
  });
});

describe("outer corner radius", () => {
  it("matches the closed form for a sharp corner at the wall", () => {
    // a = b = wall, m = 0.8 + 0.1 margin: R = 2w − m + √2 (w − m)
    expect(maxCornerRadius(1.2, 1.2, 0)).toBeCloseTo(2 * 1.2 - 0.9 + Math.SQRT2 * 0.3, 9);
  });

  it("keeps a disc that hugs a straight face out of the arc zone", () => {
    expect(maxCornerRadius(0.85, 3, 0)).toBe(3);
    expect(maxCornerRadius(2.2, 2.5, 1.4)).toBe(2.5);
  });

  it("shrinks the radius for 1.2 mm walls so the corner stays ≥ 0.8 mm", () => {
    const thin = traySpec({
      key: "thin-wall",
      wall: 1.2,
      w: 50,
      d: 50,
      h: 20,
      compartments: [compartment({ x: 1.2, y: 1.2, w: 47.6, d: 47.6 })],
    });
    const plan = planTray(thin, GEO);
    expect(plan.cornerRadius).toBeCloseTo(1.924, 3);
    const r = plan.cornerRadius;
    expect(r - Math.hypot(r - 1.2, r - 1.2)).toBeGreaterThanOrEqual(MIN_FEATURE_MM - 1e-9);
  });

  it("never goes below the bottom chamfer", () => {
    const tiny = traySpec({ key: "r0", w: 30, d: 30, h: 10 });
    expect(planTray(tiny, { ...GEO, cornerRadius: 0 }).cornerRadius).toBe(0.4);
  });
});

// Material between a point of the cut and the outer surface at height z, measured on the
// polygon tray geometry builds: the rounded rectangle pulled in by e = chamfer − z below the
// chamfer top (arc radius R − e), its corners split into quarterSegments(R) segments. The ring is
// convex, so the material is the smallest distance to the lines of its edges.
function materialAt(plan: TrayPlan, x: number, y: number, z: number): number {
  const e = Math.max(0, plan.chamfer - z);
  const R = plan.cornerRadius;
  const ring = roundedRectRing(e, e, plan.w - e, plan.d - e, R - e, quarterSegments(R));
  let material = Number.POSITIVE_INFINITY;
  ring.forEach(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % ring.length] ?? [ax, ay];
    const length = Math.hypot(bx - ax, by - ay);
    if (length > 1e-9) {
      material = Math.min(material, ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / length);
    }
  });
  return material;
}

// Thinnest outer material at the floor of the compartment, over its rounded corners (the real cut,
// inner radius) and the relief circles; with `sharp` also over the sharp corners, which is what
// planCornerRadius assumes.
function thinnestAtFloor(plan: TrayPlan, sharp: boolean): number {
  let thinnest = Number.POSITIVE_INFINITY;
  const sample = (x: number, y: number, z: number): void => {
    thinnest = Math.min(thinnest, materialAt(plan, x, y, z));
  };
  for (const c of plan.compartments) {
    const { x0, y0, x1, y1 } = c.rect;
    for (const [x, y, sx, sy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x1, y1, -1, -1],
      [x0, y1, 1, -1],
    ] as const) {
      if (sharp) {
        sample(x, y, c.floorZ);
      }
      const ri = INNER_CORNER_RADIUS;
      for (let i = 0; i <= 16; i++) {
        const t = (i / 16) * (Math.PI / 2);
        sample(x + sx * ri - sx * ri * Math.cos(t), y + sy * ri - sy * ri * Math.sin(t), c.floorZ);
      }
    }
    for (const r of c.reliefs) {
      for (let i = 0; i < 72; i++) {
        const t = (i / 72) * 2 * Math.PI;
        sample(r.cx + r.r * Math.cos(t), r.cy + r.r * Math.sin(t), c.floorZ);
      }
    }
  }
  return thinnest;
}

describe("corner material under the bottom chamfer", () => {
  it("relies on a well corner radius of at least 0.5 mm for walls under 0.9 mm", () => {
    // maxCornerRadius gives walls < 0.8 + CORNER_MARGIN no arc margin; their ≥ 0.8 mm of corner
    // material comes from the rounded inner corner (the measuring tests below).
    expect(INNER_CORNER_RADIUS).toBeGreaterThanOrEqual(0.5);
  });

  const profiles: [number, number][] = [
    [0.8, 0.8],
    [0.8, 1.2],
    [0.8, 3],
    [1.2, 0.8],
    [1.2, 1.2],
    [1.6, 1.2],
    [2, 3],
    [3, 3],
  ];

  it.each(profiles)(
    "keeps 0.8 mm at the well floor at the largest chamfer (wall %d, floor %d)",
    (wall, floor) => {
      const base: Settings = { ...GEO, wall, floor };
      const settings: Settings = { ...base, bottomChamfer: Math.min(3, maxBottomChamfer(base)) };
      const side = 60;
      const spec = traySpec({
        key: "corner-material",
        wall,
        floor,
        w: side,
        d: side,
        h: 20,
        compartments: [
          compartment({
            x: wall,
            y: wall,
            w: side - 2 * wall,
            d: side - 2 * wall,
            floorZ: floor,
            features: [{ type: "cornerRelief", d: 3 }],
          }),
        ],
      });
      const plan = planTray(spec, settings);
      expect(plan.chamfer).toBeCloseTo(settings.bottomChamfer, 9);
      const limit = MIN_FEATURE_MM - SPEC_TOLERANCE;
      expect(thinnestAtFloor(plan, false)).toBeGreaterThanOrEqual(limit);
      // Walls thinner than 0.8 + CORNER_MARGIN keep the disc on the arc's tangent line instead of
      // a margin (maxCornerRadius), so the sharp-corner assumption only holds from there on.
      if (wall >= MIN_FEATURE_MM + CORNER_MARGIN) {
        expect(thinnestAtFloor(plan, true)).toBeGreaterThanOrEqual(limit);
      }
    },
  );

  it("shrinks the outer corner radius for the extra e = chamfer − floor", () => {
    const base = { ...GEO, wall: 1.6, floor: 1.2 };
    const spec = (floorZ: number) =>
      traySpec({
        key: "e",
        w: 60,
        d: 60,
        h: 20,
        compartments: [compartment({ x: 1.6, y: 1.6, w: 56.8, d: 56.8, floorZ })],
      });
    const flat = planTray(spec(1.2), { ...base, bottomChamfer: 0.4 });
    const steep = planTray(spec(1.2), { ...base, bottomChamfer: 1.6 });
    // Same corner and floor: only the chamfer's e = 0.4 differs, and R follows maxCornerRadius.
    expect(flat.cornerRadius).toBe(3);
    expect(steep.cornerRadius).toBeCloseTo(Math.max(1.6, maxCornerRadius(1.6, 1.6, 0.4)), 9);
  });
});
