import { describe, expect, it } from "vitest";
import { planTray } from "./plan";
import { maxCornerRadius } from "./plan-corners";
import { MIN_FEATURE_MM } from "../model/settings";
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
