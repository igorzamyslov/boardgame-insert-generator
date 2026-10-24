// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { FeatureSpec, TraySpec } from "../model/types";
import {
  INSIDE_DEEP_MM,
  INSIDE_DEPTH_MM,
  UNDERSIDE_DEPTH_MM,
  hasEngraving,
  buildInside,
  planEngravings,
  planInside,
  planMergedInside,
  planUnderside,
} from "./engrave";
import { engravesName } from "./engraves";
import { layoutText } from "./glyphs";
import { Scope } from "./scope";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { notchFloorBox } from "./plan-cuts";
import { problemsOf } from "./test-build";
import { bounds } from "./test-mesh";
import {
  GEO,
  compartment,
  cutout,
  flatCutouts,
  hexTiles,
  openRiser,
  plainBox,
  scoopBulk,
  traySpec,
  uprightChannel,
} from "./test-specs";
import { buildTray } from "./tray";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

// A 100 × 60 × 30 tray with one well and the given floor.
const withFloor = (floor: number, features: FeatureSpec[] = []): TraySpec =>
  traySpec({
    key: `floor${floor}:p0:0`,
    w: 100,
    d: 60,
    h: 30,
    floor,
    compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8, floorZ: floor, features })],
  });

// The volume of `solid` inside a box.
function volumeIn(
  solid: Manifold,
  lo: [number, number, number],
  hi: [number, number, number],
): number {
  const box = m.Manifold.cube([hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], false).translate(lo);
  const part = solid.intersect(box);
  const v = part.volume();
  part.delete();
  box.delete();
  return v;
}

const overlap = (
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
  margin: number,
): boolean =>
  a.x0 < b.x1 + margin && a.x1 > b.x0 - margin && a.y0 < b.y1 + margin && a.y1 > b.y0 - margin;

describe("the name on the floor of a well", () => {
  it("is 8 mm capitals centred in the well, two layers deep, along its longer side", () => {
    const plan = planTray(plainBox, GEO);
    const inside = planInside(plan, "Cards");
    expect(inside).not.toBeNull();
    expect(inside?.cap).toBe(8);
    expect(inside?.depth).toBe(INSIDE_DEPTH_MM);
    expect(inside?.floorZ).toBe(1.2);
    expect(inside?.along).toBe("x");
    // the well's middle: 1.6 + 96.8 / 2 and 1.6 + 56.8 / 2
    expect(inside?.cx).toBeCloseTo(50, 6);
    expect(inside?.cy).toBeCloseTo(30, 6);
    const layout = layoutText("Cards", 8);
    expect((inside?.box.x1 ?? 0) - (inside?.box.x0 ?? 0)).toBeCloseTo(layout?.width ?? NaN, 6);
    expect((inside?.box.y1 ?? 0) - (inside?.box.y0 ?? 0)).toBeCloseTo(layout?.height ?? NaN, 6);
  });

  it("takes the largest of 8, 6, 5 and 4 mm that the floor holds", () => {
    const well = (w: number) =>
      traySpec({
        key: `well${w}:p0:0`,
        w: w + 3.2,
        d: 16,
        h: 30,
        compartments: [compartment({ x: 1.6, y: 1.6, w, d: 12.8 })],
      });
    // "Cards" is 37.0 / 27.7 / 23.1 / 18.5 mm wide at 8 / 6 / 5 / 4 mm; a well keeps 1 mm clear each
    // end, and a well 12.8 mm deep has no room to turn the name (8 mm capitals are 8.3 tall)
    for (const [w, cap] of [
      [40, 8],
      [30, 6],
      [26, 5],
      [21, 4],
    ] as const) {
      expect(planInside(planTray(well(w), GEO), "Cards")?.cap, `${w} mm well`).toBe(cap);
    }
    expect(planInside(planTray(well(19), GEO), "Cards")).toBeNull();
  });

  it("is cut into the floor only: a closed solid of the same size that keeps the thinnest feature", () => {
    const named = { ...plainBox, partName: "Cards" };
    const plain = buildTray(m, plainBox, GEO);
    const built = buildTray(m, named, GEO);
    expect(built.volumeMm3).toBeLessThan(plain.volumeMm3);
    expect(bounds(built.mesh)).toEqual(bounds(plain.mesh));
    expect(problemsOf(m, named, GEO)).toEqual([]);
    // the recess's floor lies at 1.2 − 0.4 = 0.8 mm, inside the text's box
    const inside = planInside(planTray(plainBox, GEO), "Cards");
    const p = built.mesh.positions;
    let low = 0;
    for (let i = 0; i < p.length; i += 3) {
      const [x, y, z] = [p[i] ?? 0, p[i + 1] ?? 0, p[i + 2] ?? 0];
      if (
        Math.abs(z - 0.8) < 1e-3 &&
        inside &&
        x > inside.box.x0 - 0.1 &&
        x < inside.box.x1 + 0.1 &&
        y > inside.box.y0 - 0.1 &&
        y < inside.box.y1 + 0.1
      ) {
        low += 1;
      }
    }
    expect(low).toBeGreaterThan(20);
  });

  it("is left off a floor that leaves less than two layers: the Thin preset's 1.0 mm", () => {
    expect(planInside(planTray(withFloor(1), GEO), "Cards")).toBeNull();
    expect(planInside(planTray(withFloor(1.19), GEO), "Cards")).toBeNull();
    expect(planInside(planTray(withFloor(1.2), GEO), "Cards")?.depth).toBe(INSIDE_DEPTH_MM);
    // the same tray, built, has no recess in its floor
    const plain = buildTray(m, withFloor(1), GEO);
    expect(buildTray(m, { ...withFloor(1), partName: "Cards" }, GEO).volumeMm3).toBeLessThan(
      plain.volumeMm3,
    ); // the walls still carry it
  });

  it("goes three layers deep on a floor of 2 mm or more", () => {
    expect(planInside(planTray(withFloor(2), GEO), "Cards")?.depth).toBe(INSIDE_DEEP_MM);
    expect(planInside(planTray(withFloor(1.9), GEO), "Cards")?.depth).toBe(INSIDE_DEPTH_MM);
    expect(problemsOf(m, { ...withFloor(2), partName: "Cards" }, GEO)).toEqual([]);
  });

  it("is left off a name the font lacks, an empty one, and a name too long for the floor", () => {
    const plan = planTray(plainBox, GEO);
    expect(planInside(plan, "")).toBeNull();
    expect(planInside(plan, "Dice!")).toBeNull();
    expect(planInside(plan, "A".repeat(40))).toBeNull();
  });

  it("goes along the longer side of a tall narrow floor, in the widest well", () => {
    const inside = planInside(planTray(uprightChannel, GEO), "Deck");
    // the 30 × 92.5 well, the middle one
    expect(inside?.along).toBe("y");
    expect(inside?.cx).toBeCloseTo(1.6 + 24 + 1.2 + 15, 6);
    const scope = new Scope();
    try {
      const box = buildInside(m, scope, inside as NonNullable<typeof inside>).boundingBox();
      // the text runs up the y axis: longer than it is wide
      expect(box.max[1] - box.min[1]).toBeGreaterThan(box.max[0] - box.min[0]);
    } finally {
      scope.dispose();
    }
  });

  it("reads upright from above, its front toward the viewer: its top is toward +y", () => {
    const inside = planInside(planTray(plainBox, GEO), "T") as NonNullable<
      ReturnType<typeof planInside>
    >;
    const scope = new Scope();
    try {
      const cutter = buildInside(m, scope, inside);
      const zs: [number, number] = [0, 5];
      // "T": a bar across the top and a stem under it: more of it lies above the middle
      const upper = volumeIn(cutter, [0, inside.cy, zs[0]], [100, 60, zs[1]]);
      const lower = volumeIn(cutter, [0, 0, zs[0]], [100, inside.cy, zs[1]]);
      expect(upper).toBeGreaterThan(lower);
    } finally {
      scope.dispose();
    }
  });
});

describe("the name on the floor keeps clear of what is cut there", () => {
  it("stays on the flat of a floor with a scoop fillet", () => {
    const plan = planTray(scoopBulk, GEO);
    const inside = planInside(plan, "Bulk");
    expect(inside).not.toBeNull();
    for (const c of plan.compartments) {
      for (const s of c.scoops) {
        if (s.side === "front" && inside && inside.cx > c.rect.x0 && inside.cx < c.rect.x1) {
          expect(inside.box.y0).toBeGreaterThanOrEqual(c.rect.y0 + s.r - 1e-6);
        }
      }
    }
  });

  it("moves off a floor notch that the centre of the floor lies in", () => {
    // a well 24 mm deep with a notch reaching 11 mm in from the front: centred, "Ab" would sit on it
    const spec = traySpec({
      key: "notch:p0:0",
      w: 40,
      d: 27.2,
      h: 30,
      compartments: [
        compartment({
          x: 1.6,
          y: 1.6,
          w: 36.8,
          d: 24,
          features: [cutout("front", 20, 20, 11)],
        }),
      ],
    });
    const plan = planTray(spec, GEO);
    const inside = planInside(plan, "Ab");
    expect(inside).not.toBeNull();
    const cut = plan.compartments[0]?.cuts.find((k) => k.notch > 0);
    expect(cut).toBeDefined();
    expect(overlap(inside?.box as never, notchFloorBox(cut as never), 1.5 - 1e-6)).toBe(false);
    expect(inside?.cy).toBeGreaterThan(13);
  });

  it("keeps 1.5 mm from a floor notch's cut and its box", () => {
    const plan = planTray(flatCutouts, GEO);
    const inside = planInside(plan, "Flat");
    expect(inside).not.toBeNull();
    for (const c of plan.compartments) {
      for (const cut of c.cuts.filter((k) => k.notch > 0)) {
        expect(overlap(inside?.box as never, cut, 1.5 - 1e-6)).toBe(false);
        expect(overlap(inside?.box as never, notchFloorBox(cut), 1.5 - 1e-6)).toBe(false);
      }
    }
  });

  it("keeps 1.5 mm from a divider's slot, on one strip of the floor", () => {
    const spec = withFloor(4, [
      { type: "dividerSlot", axis: "y", at: 34, width: 3.4, depth: 2 },
      { type: "dividerSlot", axis: "y", at: 67, width: 3.4, depth: 2 },
    ]);
    const plan = planTray(spec, GEO);
    const inside = planInside(plan, "Dice");
    expect(inside).not.toBeNull();
    for (const s of plan.compartments[0]?.slots ?? []) {
      expect(overlap(inside?.box as never, s, 1.5 - 1e-6)).toBe(false);
    }
    expect(problemsOf(m, { ...spec, partName: "Dice" }, GEO)).toEqual([]);
  });

  it("keeps clear of a corner relief", () => {
    const plan = planTray(hexTiles, GEO);
    expect(plan.compartments.some((c) => c.reliefs.length > 0)).toBe(true);
    for (const c of plan.compartments) {
      const inside = planInside({ ...plan, compartments: [c] }, "Ab");
      for (const r of c.reliefs) {
        const sq = { x0: r.cx - r.r, y0: r.cy - r.r, x1: r.cx + r.r, y1: r.cy + r.r };
        expect(inside === null || !overlap(inside.box, sq, 1.5 - 1e-6)).toBe(true);
      }
    }
  });

  it("is not planned where a socket takes the floor away", () => {
    const plan = planTray(plainBox, GEO);
    const socketed = { ...plan, socket: { wall: 2, depth: plan.h, radius: 1 } };
    expect(planInside(socketed, "Cards")).toBeNull();
  });

  it("is left off a part built upside down that has wells; a merged riser's pocket carries it", () => {
    const plan = planTray(plainBox, GEO);
    expect(planInside(plan, "Cards", true)).toBeNull();
    const riser = planTray(openRiser, GEO);
    const merged = { members: [openRiser], bridges: [] } as never;
    const found = planMergedInside(merged, [riser], "Cards");
    expect(found?.member).toBe(0);
    expect(
      planMergedInside({ ...(merged as object), flipped: true } as never, [riser], "Cards"),
    ).toBeNull();
  });
});

describe("the underside gives way to the name on the floor", () => {
  it("keeps the thinnest feature between the two when both fit: a 1.6 mm floor", () => {
    const plan = planTray(withFloor(1.6), GEO);
    const e = planEngravings(plan, "Cards");
    expect(e.inside?.depth).toBe(INSIDE_DEPTH_MM);
    expect(e.underside).not.toBeNull();
    // floor 1.6 − 0.4 above − 0.4 under = 0.8 left between them, on a centred underside too
    expect(1.6 - INSIDE_DEPTH_MM - (e.underside?.depth ?? 9)).toBeGreaterThanOrEqual(0.8 - 1e-6);
    expect(problemsOf(m, { ...withFloor(1.6), partName: "Cards" }, GEO)).toEqual([]);
  });

  it("moves aside on a 1.2 mm floor, where both would leave 0.4 mm", () => {
    const plan = planTray(plainBox, GEO);
    const inside = planInside(plan, "Cards");
    // alone it is centred, over the inside name
    expect(planUnderside(plan, "Cards")?.cx).toBe(50);
    const moved = planUnderside(plan, "Cards", inside);
    expect(moved).not.toBeNull();
    const a = inside?.box as NonNullable<typeof inside>["box"];
    const b = moved?.box as NonNullable<typeof moved>["box"];
    expect(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0).toBe(false);
    const e = planEngravings(plan, "Cards");
    expect(e.walls.length).toBeGreaterThan(0);
    expect(hasEngraving(e)).toBe(true);
  });

  it("is as before on a floor thick enough for both at full depth", () => {
    const plan = planTray(withFloor(2), GEO);
    const e = planEngravings(plan, "Cards");
    expect(e.inside?.depth).toBe(INSIDE_DEEP_MM);
    expect(e.underside?.depth).toBe(UNDERSIDE_DEPTH_MM);
    expect(e.underside?.cx).toBe(50);
  });
});

describe("whether a part carries its name", () => {
  it("counts the floor alone: a tray whose walls and underside have no room", () => {
    // a 6 mm tall tray: the walls have no band, and the bed face is taken by the floor's name
    const spec = traySpec({
      key: "tiny:p0:0",
      w: 24,
      d: 24,
      h: 6,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 20.8, d: 20.8 })],
    });
    const plan = planTray(spec, GEO);
    const e = planEngravings(plan, "Ab");
    expect(engravesName(spec, GEO, "Ab")).toBe(hasEngraving(e));
    expect(e.inside).not.toBeNull();
  });
});
