import { describe, expect, it } from "vitest";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tinyBox from "../../test/fixtures/tiny-box.json";
import { planTray } from "./plan";
import { thinCorner } from "./plan-corners";
import {
  MIN_FEATURE_MM,
  SPEC_TOLERANCE,
  maxBottomChamfer,
  maxCornerRadius,
} from "../model/settings";
import type { Settings } from "../model/types";
import { SETTING_RANGES, settingsValid } from "../model/validate";
import { minOuter, realizeTray, rotateRealized, size } from "../sizing";
import type { RealizeOptions } from "../sizing/types";
import { quarterSegments, roundedRectRing } from "./shapes";
import type { CompartmentPlan, Rect, TrayPlan } from "./plan-types";
import { GEO, compartment, hexTiles, loadFixture, traySpec, traySpecFrom } from "./test-specs";

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

  it("budgets against a neighbour's finger slot, not only its compartment", () => {
    // A deck 1.6…21.6 whose 22 mm slot reaches 23.6, 0.8 mm before the tile well at 24.4: the
    // well's left reliefs may not cut into the 0.8 mm between them.
    const spec = traySpec({
      key: "relief-slot",
      w: 70,
      d: 60,
      h: 30,
      compartments: [
        compartment({
          x: 1.6,
          y: 1.6,
          w: 20,
          d: 56.8,
          features: [
            { type: "fingerPocket", side: "front", at: 12.6, width: 22, reach: 12, depth: 10 },
          ],
        }),
        compartment({
          x: 24.4,
          y: 1.6,
          w: 44,
          d: 56.8,
          features: [{ type: "cornerRelief", d: 3 }],
        }),
      ],
    });
    const reliefs = planTray(spec, GEO).compartments[1]?.reliefs ?? [];
    // Only the corners on the right (toward the outer wall) keep a relief.
    expect(reliefs.map((r) => r.cx > 40)).toEqual([true, true]);
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
// add material), the sharp footprint corners of each finger slot at its bottomZ, and the relief
// circles at the compartment floor. `slots` is the thinnest over slot corners alone.
function thinnestCut(plan: TrayPlan): { all: number; slots: number; slotCorners: number } {
  const result = { all: Number.POSITIVE_INFINITY, slots: Number.POSITIVE_INFINITY, slotCorners: 0 };
  const sample = (x: number, y: number, z: number, rho = 0): number => {
    const material = materialAt(plan, x, y, z, rho);
    result.all = Math.min(result.all, material);
    return material;
  };
  for (const c of plan.compartments) {
    cornersOf(c.rect).forEach(([x, y]) => sample(x, y, c.floorZ));
    for (const slot of c.slots) {
      for (const [x, y] of cornersOf(slot)) {
        result.slots = Math.min(result.slots, sample(x, y, slot.bottomZ));
        result.slotCorners++;
      }
    }
    c.reliefs.forEach((r) => sample(r.cx, r.cy, c.floorZ, r.r));
  }
  return result;
}

// The smallest valid wall (SETTING_RANGES).
const WALL_MIN = SETTING_RANGES.find((r) => r.path === "wall")?.min ?? Number.NaN;
const LIMIT = MIN_FEATURE_MM - SPEC_TOLERANCE;

// Wall and floor pairs from the smallest valid wall up, each also at its largest chamfer.
const WALL_FLOOR: [number, number][] = [
  [WALL_MIN, 0.8],
  [WALL_MIN, 1.2],
  [WALL_MIN, 3],
  [1.2, 0.8],
  [1.2, 1.2],
  [1.6, 1.2],
  [2, 3],
  [3, 3],
];

function withLargestChamfer(base: Settings, wall: number, floor: number): Settings {
  const walled: Settings = { ...base, wall, floor };
  return { ...walled, bottomChamfer: Math.min(3, maxBottomChamfer(walled)) };
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

const OPTIONS: RealizeOptions[] = [
  { lipped: false, level: 0 },
  { lipped: true, level: 0 },
  { lipped: false, level: 1 },
  { lipped: true, level: 1 },
];

const SLACKS: [number, number, number][] = [
  [0, 0, 0],
  [5, 0, 0],
  [0, 5, 0],
  [0.01, 0.01, 0.01],
];

describe("corner material of sizing output", () => {
  // Name, project, and whether its trays have finger slots.
  const fixtures: [string, unknown, boolean][] = [
    ["cards-heavy", cardsHeavy, true],
    ["bits-heavy", bitsHeavy, false],
    ["tiles-minis", tilesMinis, true],
    ["tiny-box", tinyBox, true],
  ];

  it.each(fixtures)(
    "keeps 0.8 mm at every well, slot and relief corner of %s",
    (_name, raw, hasSlots) => {
      const { components, settings: base } = loadFixture(raw);
      const failures: string[] = [];
      let slotCorners = 0;
      for (const [wall, floor] of WALL_FLOOR) {
        for (const settings of [{ ...base, wall, floor }, withLargestChamfer(base, wall, floor)]) {
          expect(settingsValid(settings), `wall ${wall}, floor ${floor} is valid`).toBe(true);
          const variants = size(components, settings).requirements.flatMap((r) => r.variants);
          for (const variant of variants) {
            for (const part of variant.parts) {
              for (const opts of OPTIONS) {
                const min = minOuter(part, settings, opts);
                for (const [dw, dd, dh] of SLACKS) {
                  const outer = { w: min.w + dw, d: min.d + dd, h: min.h + dh };
                  const realized = realizeTray(part, outer, settings, opts);
                  const turned = rotateRealized(realized, outer);
                  const turnedOuter = { w: outer.d, d: outer.w, h: outer.h };
                  for (const spec of [
                    traySpecFrom(realized, outer, opts, settings, part.trayKey),
                    traySpecFrom(turned, turnedOuter, opts, settings, part.trayKey),
                  ]) {
                    const thinnest = thinnestCut(planTray(spec, settings));
                    slotCorners += thinnest.slotCorners;
                    if (thinnest.all < LIMIT) {
                      failures.push(
                        `wall ${wall}, floor ${floor}, chamfer ${settings.bottomChamfer}, ${part.trayKey} ${JSON.stringify(opts)}: ${thinnest.all.toFixed(3)} mm (slots ${thinnest.slots.toFixed(3)})`,
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
      if (hasSlots) {
        expect(slotCorners).toBeGreaterThan(0);
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
    content: rect,
    floorZ: 2,
    slots: [],
    scoops: [],
    reliefs: [],
  };
  const tray = { w: 50, d: 50 };

  it("accepts a corner keeping 0.8 mm plus the corner margin on the true arc", () => {
    // maxCornerRadius(1.2, 1.2, 0) leaves exactly 0.8 + CORNER_MARGIN.
    expect(thinCorner(tray, maxCornerRadius(1.2, 1.2, 0), 0.4, [well])).toBeNull();
  });

  it("rejects a corner under 0.8 mm plus the corner margin, which the arc polygon thins", () => {
    // R = 2.1: 2.1 − √2·0.9 = 0.83 mm on the true arc, up to 0.08 mm less on the polygon.
    expect(thinCorner(tray, 2.1, 0.4, [well])).toEqual(
      expect.stringMatching(/keeps only 0\.83 mm/),
    );
  });
});
