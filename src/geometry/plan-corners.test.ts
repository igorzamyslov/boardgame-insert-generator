import { describe, expect, it } from "vitest";
import { planTray } from "./plan";
import { planCornerRadius, thinCorner } from "./plan-corners";
import { notchFloorBox } from "./plan-cuts";
import { MIN_FEATURE_MM, MIN_WALL_MM, SPEC_TOLERANCE, maxCornerRadius } from "../model/settings";
import type { Settings } from "../model/types";
import { settingsValid } from "../model/validate";
import { minOuter, realizeTray, rotateRealized, size } from "../sizing";
import { quarterSegments, roundedRectRing } from "./shapes";
import type { CompartmentPlan, Rect, TrayPlan } from "./plan-types";
import {
  GEO,
  SWEEP_FIXTURES,
  SWEEP_OPTIONS,
  SWEEP_SLACKS,
  compartment,
  hexTiles,
  largestChamfer,
  loadFixture,
  traySpec,
  traySpecFrom,
} from "./test-specs";

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

  it("keeps a relief beside a rounded outer corner 0.8 mm from its polygon", () => {
    // A well 2.04 mm from the left face and 1.2 mm from the front one. Budgeted to 0.8 mm from the
    // straight front face, its front-left relief (r 1.37, centre 3.01 from the left face, just past
    // the 3 mm corner's arc) came 0.78 mm close to the polygon of that arc; it keeps the outer
    // wall's 0.9 mm (MIN_WALL_MM) to outer faces instead.
    const spec = traySpec({
      key: "relief-beside-arc",
      wall: 1.2,
      w: 60,
      d: 60,
      h: 20,
      compartments: [
        compartment({
          x: 2.04,
          y: 1.2,
          w: 55,
          d: 57.6,
          features: [{ type: "cornerRelief", d: 3 }],
        }),
      ],
    });
    const plan = planTray(spec, GEO);
    const reliefs = plan.compartments[0]?.reliefs ?? [];
    expect(reliefs).toHaveLength(4);
    for (const r of reliefs) {
      expect(materialAt(plan, r.cx, r.cy, 1.2, r.r)).toBeGreaterThanOrEqual(MIN_FEATURE_MM - 1e-9);
    }
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

// Material between a disc of the cut (radius rho; 0 for a point) and the outer surface at height z,
// measured on the polygon tray geometry builds: the rounded rectangle pulled in by e = chamfer − z
// below the chamfer top (arc radius R − e), its corners split into quarterSegments(R) segments.
// The ring is convex, so the material is the smallest distance from the centre to the lines of
// its edges, minus rho.
function materialAt(plan: TrayPlan, x: number, y: number, z: number, rho = 0): number {
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
  return material - rho;
}

// Where a wall cutout leaves the tray, the material beside it is the wall between its side and
// the outer face it runs along: `along` thick, pulled in by the chamfer at height z, and thinnest at
// the exit face, where the outer corner's arc (at least the chamfer) ends: along − R there (review 1,
// I1: with R = along the arc thinned it to a wedge, 0.784 mm on the mesh).
function exitSide(plan: TrayPlan, along: number, z: number): number {
  return along - Math.max(plan.cornerRadius, plan.chamfer - z);
}

function cornersOf(r: Rect): [number, number][] {
  return [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x1, r.y1],
    [r.x0, r.y1],
  ];
}

// Thinnest outer material over every cut, each at its lowest height: the compartment corners at
// the compartment floor (sharp, as planCornerRadius assumes; the wells' rounded inner corners only
// add material), wall cutouts at their bottomZ and their floor notches at the bed, and the relief circles at the compartment
// floor. A cutout that leaves the tray is judged by the wall beside its sides (exitSide); one
// inside it, and the box around a notch's half-disc in the floor (its corners away from the face),
// by their corners. `cuts` is the thinnest over cutout samples alone.
function thinnestCut(plan: TrayPlan): { all: number; cuts: number; cutCorners: number } {
  const result = { all: Number.POSITIVE_INFINITY, cuts: Number.POSITIVE_INFINITY, cutCorners: 0 };
  const record = (material: number, cut: boolean): void => {
    result.all = Math.min(result.all, material);
    if (cut) {
      result.cuts = Math.min(result.cuts, material);
      result.cutCorners++;
    }
  };
  const corners = (rect: Rect, z: number): void => {
    cornersOf(rect).forEach(([x, y]) => {
      record(materialAt(plan, x, y, z), true);
    });
  };
  for (const c of plan.compartments) {
    cornersOf(c.rect).forEach(([x, y]) => {
      record(materialAt(plan, x, y, c.floorZ), false);
    });
    for (const cut of c.cuts) {
      const alongX = cut.side === "front" || cut.side === "back";
      const span = alongX ? plan.w : plan.d;
      // With a floor notch the cut goes down to the bed; the box of its part in the floor is
      // judged by its corners away from the face (those at it are the cut's own).
      const footprints: [Rect, number][] = [[cut, cut.notch > 0 ? 0 : cut.bottomZ]];
      if (cut.notch > 0) {
        const floor = notchFloorBox(cut);
        const far = { front: floor.y1, back: floor.y0, left: floor.x1, right: floor.x0 }[cut.side];
        cornersOf(floor)
          .filter(([x, y]) => (alongX ? y : x) === far)
          .forEach(([x, y]) => {
            record(materialAt(plan, x, y, 0), true);
          });
      }
      for (const [rect, z] of footprints) {
        if (cut.into === null) {
          const [u0, u1] = alongX ? [rect.x0, rect.x1] : [rect.y0, rect.y1];
          record(exitSide(plan, u0, z), true);
          record(exitSide(plan, span - u1, z), true);
        } else {
          corners(rect, z);
        }
      }
    }
    c.reliefs.forEach((r) => {
      record(materialAt(plan, r.cx, r.cy, c.floorZ, r.r), false);
    });
  }
  return result;
}

const LIMIT = MIN_FEATURE_MM - SPEC_TOLERANCE;

// Wall and floor pairs from the smallest valid wall up, each also at its largest chamfer.
const WALL_FLOOR: [number, number][] = [
  [MIN_WALL_MM, 0.8],
  [MIN_WALL_MM, 1.2],
  [MIN_WALL_MM, 3],
  [1.2, 0.8],
  [1.2, 1.2],
  [1.6, 1.2],
  [2, 3],
  [3, 3],
];

function withLargestChamfer(base: Settings, wall: number, floor: number): Settings {
  return largestChamfer({ ...base, wall, floor });
}

describe("corner material under the bottom chamfer", () => {
  it.each(WALL_FLOOR)(
    "keeps 0.8 mm at the well floor at the largest chamfer (wall %d, floor %d)",
    (wall, floor) => {
      const settings = withLargestChamfer(GEO, wall, floor);
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
      expect(thinnestCut(plan).all).toBeGreaterThanOrEqual(LIMIT);
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

describe("corner material of sizing output", () => {
  // Every fixture but bits-heavy (bulk only) has trays with wall cutouts.
  it.each(SWEEP_FIXTURES)(
    "keeps 0.8 mm at every well, cutout and relief corner of %s",
    { timeout: 60_000 },
    (name, raw) => {
      const hasCuts = !name.startsWith("bits-heavy");
      const { components, settings: base } = loadFixture(raw);
      const failures: string[] = [];
      let cutCorners = 0;
      for (const [wall, floor] of WALL_FLOOR) {
        for (const settings of [{ ...base, wall, floor }, withLargestChamfer(base, wall, floor)]) {
          expect(settingsValid(settings), `wall ${wall}, floor ${floor} is valid`).toBe(true);
          const variants = size(components, settings).requirements.flatMap((r) => r.variants);
          for (const variant of variants) {
            for (const part of variant.parts) {
              for (const opts of SWEEP_OPTIONS) {
                const min = minOuter(part, settings, opts);
                for (const [dw, dd, dh] of SWEEP_SLACKS) {
                  const outer = { w: min.w + dw, d: min.d + dd, h: min.h + dh };
                  const realized = realizeTray(part, outer, settings, opts);
                  const turned = rotateRealized(realized, outer);
                  const turnedOuter = { w: outer.d, d: outer.w, h: outer.h };
                  for (const spec of [
                    traySpecFrom(realized, outer, opts, settings, part.trayKey),
                    traySpecFrom(turned, turnedOuter, opts, settings, part.trayKey),
                  ]) {
                    const thinnest = thinnestCut(planTray(spec, settings));
                    cutCorners += thinnest.cutCorners;
                    if (thinnest.all < LIMIT) {
                      failures.push(
                        `wall ${wall}, floor ${floor}, chamfer ${settings.bottomChamfer}, ${part.trayKey} ${JSON.stringify(opts)}: ${thinnest.all.toFixed(3)} mm (cuts ${thinnest.cuts.toFixed(3)})`,
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }
      expect(failures.slice(0, 3)).toEqual([]);
      if (hasCuts) {
        expect(cutCorners).toBeGreaterThan(0);
      }
    },
  );
});

describe("thin outer corners", () => {
  // One well 1.2 mm from the faces, its floor above the chamfer (e = 0): its sharp corner keeps
  // R − √2·(R − 1.2) on the true arc.
  const rect: Rect = { x0: 1.2, y0: 1.2, x1: 48.8, y1: 48.8 };
  const well: CompartmentPlan = {
    index: 0,
    rect,
    floorZ: 2,
    cuts: [],
    scoops: [],
    reliefs: [],
    slots: [],
  };
  const tray = { w: 50, d: 50 };

  it("accepts a corner keeping 0.8 mm plus the corner margin on the true arc", () => {
    // maxCornerRadius(1.2, 1.2, 0) leaves exactly 0.8 + CORNER_MARGIN.
    expect(thinCorner(tray, maxCornerRadius(1.2, 1.2, 0), 0.4, [well])).toBeNull();
  });

  // An exit cut's side meets the outer face 1.6 mm from the corner (a point on the face).
  const exit = [{ x: 0, y: 1.6 }];

  it("ends the arc 0.8 mm before a cut side meets the outer face", () => {
    expect(planCornerRadius(tray, 3, 0.4, [well], exit)).toBeCloseTo(0.8, 9);
    expect(thinCorner(tray, 0.8, 0.4, [well], exit)).toBeNull();
  });

  it("rejects a cut side meeting the outer face less than 0.8 mm past the arc", () => {
    // A 0.9 mm chamfer forces R = 0.9: 0.7 mm of wall beside the side at the exit face.
    expect(planCornerRadius(tray, 3, 0.9, [well], exit)).toBe(0.9);
    expect(thinCorner(tray, 0.9, 0.9, [well], exit)).toEqual(
      expect.stringMatching(/1\.60 mm from an outer corner, leaving 0\.70 mm of wall/),
    );
  });

  it("rejects a corner under 0.8 mm plus the corner margin, which the arc polygon thins", () => {
    // R = 2.1: 2.1 − √2·0.9 = 0.83 mm on the true arc, up to 0.08 mm less on the polygon.
    expect(thinCorner(tray, 2.1, 0.4, [well])).toEqual(
      expect.stringMatching(/keeps only 0\.83 mm/),
    );
  });
});
