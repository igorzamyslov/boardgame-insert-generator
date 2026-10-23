import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { MIN_FEATURE_MM } from "../model/settings";
import { grooveOf, grooveWall } from "../model/lip";
import type { Settings, TraySpec } from "../model/types";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { checkPrintability } from "./printability";
import { buildTray } from "./tray";
import { problemsOf, thinSlices } from "./test-build";
import { bounds } from "./test-mesh";
import {
  GEO,
  compartment,
  customBlock,
  lippedLower,
  plainBox,
  spacer,
  traySpec,
  upperLevel1,
} from "./test-specs";
import type { Mesh } from "./types";

// The flush stacking interlock (spec §6.1 "Locating lip"): the groove under the outer bottom edge
// of a tray above level 0, which takes the lip of the tray below.

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

function solid(mesh: Mesh): Manifold {
  return new m.Manifold(
    new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }),
  );
}

const lipOff: Settings = { ...GEO, lip: { ...GEO.lip, enabled: false } };

describe("which trays get a groove", () => {
  it("only a tray above level 0, with the lip on: the one on a lipped tray", () => {
    expect(planTray(upperLevel1, GEO).groove).toEqual({
      inset: 1.45,
      foot: 0.5,
      zIn: 1.4,
      zTop: 2.85,
      reach: 1.95,
    });
    // on the box floor, or on a plain riser: nothing under it has a lip (a riser that carries one
    // gives its tray `onRiser`, riser.lip.test.ts)
    expect(planTray(plainBox, GEO).groove).toBeNull();
    // the lower tray carries the lip, not the groove
    expect(planTray(lippedLower, GEO).groove).toBeNull();
    // a spacer or a divider stands in a well, whatever its level
    expect(planTray({ ...spacer, level: 1 }, GEO).groove).toBeNull();
    expect(grooveOf(GEO, 0)).toBeNull();
    expect(grooveOf(GEO, 1)).not.toBeNull();
  });

  it("a filler in a stack level has one too, solid or open", () => {
    const filler = (solidFiller: boolean): TraySpec =>
      traySpec({
        key: "leftover:0",
        part: "leftover",
        level: 1,
        w: 40,
        d: 30,
        h: 20,
        solid: solidFiller,
        wall: 2.56,
        compartments: solidFiller
          ? []
          : [compartment({ x: 2.56, y: 2.56, w: 34.88, d: 24.88, kind: "spare" })],
      });
    expect(planTray(filler(true), GEO).groove).not.toBeNull();
    expect(planTray(filler(false), GEO).groove).not.toBeNull();
    // a filler beside the whole stack is on the box floor
    expect(planTray({ ...filler(true), level: 0 }, GEO).groove).toBeNull();
  });

  it("none with the lip off: the plain chamfer, a plain wall, exactly as before", () => {
    const upperPlain: TraySpec = {
      ...upperLevel1,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8 })],
    };
    const plan = planTray(upperPlain, lipOff);
    expect(plan.groove).toBeNull();
    expect(plan.chamfer).toBe(0.5);
    expect(plan.outerWall).toBe(1.6);
    // the same with the lip on is refused: the groove needs more wall than 1.6 mm
    expect(() => planTray(upperPlain, GEO)).toThrow(/outer wall/);
    // the mesh is the block with its 0.5 mm chamfer: 96.8 × 56.8 well, 18.8 deep
    const { volumeMm3 } = buildTray(m, upperPlain, lipOff);
    const perimeter = 2 * (100 + 60) - (8 - 2 * Math.PI) * 3;
    const block = (100 * 60 - (4 - Math.PI) * 9) * 20;
    const chamfer = (perimeter * 0.25) / 2 - (Math.PI * 0.125) / 3;
    const well = (96.8 * 56.8 - (4 - Math.PI) * 0.25) * 18.8;
    expect(Math.abs(volumeMm3 - (block - chamfer - well)) / volumeMm3).toBeLessThan(0.002);
  });
});

describe("the groove as built", () => {
  it("stands flush: the outer footprint is the lower tray's, from the groove's roof up", () => {
    const { mesh } = buildTray(m, upperLevel1, GEO);
    const b = bounds(mesh);
    expect(b.min).toEqual([0, 0, 0]);
    expect(b.max[0]).toBeCloseTo(100, 4);
    expect(b.max[1]).toBeCloseTo(60, 4);
    // at the bed the bottom face is 1.95 mm in from the outer face on every side
    let atBed = [Infinity, -Infinity];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if ((mesh.positions[i + 2] ?? 1) < 1e-6) {
        const x = mesh.positions[i] ?? 0;
        atBed = [Math.min(atBed[0] ?? 0, x), Math.max(atBed[1] ?? 0, x)];
      }
    }
    expect(atBed[0]).toBeCloseTo(1.95, 3);
    expect(atBed[1]).toBeCloseTo(100 - 1.95, 3);
  });

  it("prints without support: no face overhangs more than the 45° of a chamfer", () => {
    const { mesh } = buildTray(m, upperLevel1, GEO);
    const report = checkPrintability(mesh);
    expect(report).toMatchObject({ ok: true, overhangTriangles: 0 });
    // the roof is there: faces tilted 45° down, and none steeper
    let roof = 0;
    let steepest = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => (mesh.indices[t + k] ?? 0) * 3);
      const p = (i: number | undefined, k: number): number => mesh.positions[(i ?? 0) + k] ?? 0;
      const u = [0, 1, 2].map((k) => p(b, k) - p(a, k));
      const v = [0, 1, 2].map((k) => p(c, k) - p(a, k));
      const n = [
        (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
        (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
        (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
      ];
      const len = Math.hypot(...n);
      const maxZ = Math.max(p(a, 2), p(b, 2), p(c, 2));
      if (len > 1e-6 && maxZ > 1e-3) {
        const nz = (n[2] ?? 0) / len;
        if (nz < -0.69 && nz > -0.72) {
          roof += 1;
        }
        steepest = Math.min(steepest, nz);
      }
    }
    expect(roof).toBeGreaterThan(8);
    expect(steepest).toBeGreaterThan(-0.7072);
  });

  it("is a closed solid with the walls, floor and groove at least 0.8 mm apart", () => {
    expect(problemsOf(m, upperLevel1, GEO)).toEqual([]);
    const { mesh } = buildTray(m, upperLevel1, GEO);
    // every height through the groove, its foot chamfer and the floor
    const zs = Array.from({ length: 40 }, (_, k) => 0.05 + k * 0.1);
    expect(thinSlices(m, mesh, zs)).toEqual([]);
  });
});

describe("what is left of the floor under a well", () => {
  const settingsAt = (floor: number, chamfer: number, cornerRadius = 3): Settings => ({
    ...GEO,
    floor,
    bottomChamfer: chamfer,
    cornerRadius,
  });

  it("is at least MIN_FEATURE_MM of wall at the well's bottom edge, at any floor and chamfer", () => {
    for (const [floor, chamfer] of [
      [1.2, 0.4],
      [0.8, 0.4],
      [0.8, 1.4],
      [2, 0.4],
      [1.2, 1.4],
    ] as const) {
      const s = settingsAt(floor, chamfer);
      const g = grooveOf(s, 1);
      if (g === null) {
        throw new Error("no groove");
      }
      const wall = grooveWall(s, 1);
      // the horizontal material from the well's bottom edge to the groove's wall or roof
      const at = Math.min(g.zTop, g.inset + Math.max(g.foot, floor));
      expect(wall + floor - at, `floor ${floor}, chamfer ${chamfer}`).toBeGreaterThanOrEqual(
        MIN_FEATURE_MM,
      );
      // built at exactly that wall, it is a closed printable solid with no thin section
      const spec = traySpec({
        key: "u:p0:0",
        level: 1,
        w: 60,
        d: 40,
        h: 12,
        floor,
        compartments: [
          compartment({
            x: Math.ceil(wall * 100) / 100,
            y: Math.ceil(wall * 100) / 100,
            w: 60 - (2 * Math.ceil(wall * 100)) / 100,
            d: 40 - (2 * Math.ceil(wall * 100)) / 100,
            floorZ: floor,
          }),
        ],
      });
      expect(problemsOf(m, spec, s), `floor ${floor}, chamfer ${chamfer}`).toEqual([]);
      const { mesh } = buildTray(m, spec, s);
      const zs = Array.from({ length: 36 }, (_, k) => 0.05 + k * 0.1);
      expect(thinSlices(m, mesh, zs), `floor ${floor}, chamfer ${chamfer}`).toEqual([]);
    }
  });

  it("takes the whole thickness under the wells: the groove runs under the wall, not the floor", () => {
    const g = grooveOf(GEO, 1);
    const wall = grooveWall(GEO, 1);
    // the groove's widest reach at the bed is inside the wall, and its wall is under the rim
    expect(g?.reach).toBeLessThan(wall);
    expect(wall - (g?.inset ?? 0)).toBeGreaterThanOrEqual(MIN_FEATURE_MM);
  });
});

describe("the lip fits the groove", () => {
  // A lipped lower tray and the tray on it, flush, as the layout builds them.
  const lower = lippedLower;
  const upper = upperLevel1;
  const interference = (dx: number, dy: number): number => {
    const a = solid(buildTray(m, lower, GEO).mesh);
    const b = solid(buildTray(m, upper, GEO).mesh).translate([dx, dy, lower.h]);
    return a.intersect(b).volume();
  };

  it("have the same outer corner radius, so the two rings are offsets of one another", () => {
    expect(planTray(upper, GEO).cornerRadius).toBe(planTray(lower, GEO).cornerRadius);
  });

  it("touch only on the rim: nothing of the lip is inside the upper tray", () => {
    expect(interference(0, 0)).toBeLessThan(1e-3);
  });

  it("leave lip.play to each side, and no more", () => {
    const play = GEO.lip.play;
    for (const [dx, dy] of [
      [play - 0.01, 0],
      [-(play - 0.01), 0],
      [0, play - 0.01],
      [0, -(play - 0.01)],
    ] as const) {
      expect(interference(dx, dy), `shift ${dx}, ${dy}`).toBeLessThan(1e-3);
    }
    for (const [dx, dy] of [
      [play + 0.05, 0],
      [-(play + 0.05), 0],
      [0, play + 0.05],
      [0, -(play + 0.05)],
    ] as const) {
      expect(interference(dx, dy), `shift ${dx}, ${dy}`).toBeGreaterThan(0.01);
    }
  });

  it("follow lip.play, scaled by Fit", () => {
    const loose = { ...GEO, fit: 1.4 };
    const a = solid(buildTray(m, lower, loose).mesh);
    // the play is 0.35 mm now; the groove (and its wall) is wider, and the tray is built to it
    const g = grooveOf(loose, 1);
    expect(g?.inset).toBeCloseTo(1.55, 9);
    const wall = Math.ceil(grooveWall(loose, 1) * 100) / 100;
    const wide = {
      ...upper,
      compartments: [compartment({ x: wall, y: wall, w: 100 - 2 * wall, d: 60 - 2 * wall })],
    };
    const b = solid(buildTray(m, wide, loose).mesh);
    for (const [dx, expected] of [
      [0.34, false],
      [0.4, true],
    ] as const) {
      const volume = a.intersect(b.translate([dx, 0, lower.h])).volume();
      expect(volume > 0.01, `shift ${dx}`).toBe(expected);
    }
  });
});

describe("a tray with the lip and the groove both, in the middle of a stack", () => {
  it("is a closed printable solid", () => {
    // its lipped wall (2.9) is thicker than its groove needs (2.56)
    const middle: TraySpec = {
      ...upperLevel1,
      key: "mid:p0:0",
      lip: true,
      compartments: [compartment({ x: 2.9, y: 2.9, w: 94.2, d: 54.2 })],
    };
    expect(problemsOf(m, middle, GEO)).toEqual([]);
    const plan = planTray(middle, GEO);
    expect(plan.outerWall).toBeCloseTo(2.9, 9);
    expect(plan.groove).not.toBeNull();
    expect(plan.lip).not.toBeNull();
  });

  it("builds a solid block with a groove too: a filler on the lip below", () => {
    const filler = { ...customBlock, level: 1, part: "leftover", solid: true } as TraySpec;
    expect(problemsOf(m, { ...filler, compartments: [] }, GEO)).toEqual([]);
  });
});
