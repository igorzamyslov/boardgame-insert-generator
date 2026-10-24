// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { printMesh } from "../app/exportBuild";
import { mergeParts } from "../layout/merge";
import { TEST_PRINTER } from "../layout/test-utils";
import { carriesName } from "../model/part-name";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import {
  ENGRAVE_DEPTH_MM,
  UNDERSIDE_DEPTH_MM,
  buildEngraving,
  buildUnderside,
  fitCap,
  planEngraving,
  planEngravings,
  planUnderside,
  planWallEngravings,
} from "./engrave";
import { engravesName } from "./engraves";
import { CAP_GOOD_MM, CAP_SIZES_MM, layoutText } from "./glyphs";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { checkPrintability } from "./printability";
import { Scope } from "./scope";
import {
  GEO,
  compartment,
  customBlock,
  cutout,
  flatCutouts,
  lippedLower,
  miniPockets,
  openRiser,
  plainBox,
  solidLeftover,
  solidRiser,
  spacer,
  spareLeftover,
  traySpec,
  uprightChannel,
  upperLevel1,
} from "./test-specs";
import { problemsOf } from "./test-build";
import { bounds, signedVolume, topology } from "./test-mesh";
import { buildTray } from "./tray";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

// The mesh vertices on a plane y = c (axis 1) or x = c (axis 0).
function onPlane(mesh: { positions: Float32Array }, axis: 0 | 1, c: number) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (Math.abs((mesh.positions[i + axis] ?? 0) - c) < 1e-3) {
      pts.push([mesh.positions[i] ?? 0, mesh.positions[i + 1] ?? 0, mesh.positions[i + 2] ?? 0]);
    }
  }
  return pts;
}

// The vertices `named` has that `plain` has not: the engravings' own corners.
function added(named: { positions: Float32Array }, plain: { positions: Float32Array }) {
  const key = (a: Float32Array, i: number) =>
    [0, 1, 2].map((k) => (a[i + k] ?? 0).toFixed(3)).join(",");
  const had = new Set<string>();
  for (let i = 0; i < plain.positions.length; i += 3) {
    had.add(key(plain.positions, i));
  }
  const out: [number, number, number][] = [];
  for (let i = 0; i < named.positions.length; i += 3) {
    if (!had.has(key(named.positions, i))) {
      out.push([named.positions[i] ?? 0, named.positions[i + 1] ?? 0, named.positions[i + 2] ?? 0]);
    }
  }
  return out;
}

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

describe("an engraved tray name", () => {
  it("is cut into the front wall of a plain tray: shallow, 8 mm capitals, centred", () => {
    const plan = planTray(plainBox, GEO);
    const e = planEngraving(plan, "Cards");
    expect(e).not.toBeNull();
    expect(e?.face).toBe("front");
    expect(e?.cap).toBe(8);
    expect(e?.depth).toBe(ENGRAVE_DEPTH_MM);
    // a quarter of the 1.6 mm wall, leaving two thin features behind it
    expect(1.6 - ENGRAVE_DEPTH_MM).toBeGreaterThanOrEqual(MIN_FEATURE_MM);
    const layout = layoutText("Cards", 8);
    expect((e?.from ?? 0) + (layout?.width ?? 0) / 2).toBeCloseTo(50, 6);

    const plain = buildTray(m, plainBox, GEO);
    const named = buildTray(m, { ...plainBox, partName: "Cards" }, GEO);
    expect(named.volumeMm3).toBeLessThan(plain.volumeMm3);
    expect(bounds(named.mesh)).toEqual(bounds(plain.mesh));
    expect(problemsOf(m, { ...plainBox, partName: "Cards" }, GEO)).toEqual([]);

    // the floor of the engraving lies in the plane y = depth, within the name's box
    const floor = onPlane(named.mesh, 1, ENGRAVE_DEPTH_MM).filter(
      ([x, , z]) => x > 5 && x < 95 && z > 2 && z < 28,
    );
    expect(floor.length).toBeGreaterThan(0);
    const xs = floor.map((p) => p[0]);
    const zs = floor.map((p) => p[2]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual((e?.from ?? 0) - 0.05);
    expect(Math.max(...xs)).toBeLessThanOrEqual((e?.from ?? 0) + (layout?.width ?? 0) + 0.05);
    expect(Math.max(...zs)).toBeLessThanOrEqual((e?.z ?? 0) + (layout?.height ?? 0) + 0.05);
    // the recess is carried down as it goes in: its floor lies up to depth * the slope lower
    expect(Math.min(...zs)).toBeGreaterThanOrEqual((e?.z ?? 0) - 0.5 - 0.05);
    // clear of the rim and the chamfer
    expect(Math.max(...zs)).toBeLessThan(plainBox.h - 1);
    expect(Math.min(...zs)).toBeGreaterThan(1);
  });

  it("is set at the largest of 8, 6, 5 and 4 mm that the room allows", () => {
    expect(CAP_SIZES_MM).toEqual([8, 6, 5, 4]);
    const tray = (w: number, h = 30) =>
      traySpec({
        key: `w${w}:p0:0`,
        w,
        d: 28,
        h,
        compartments: [compartment({ x: 1.6, y: 1.6, w: w - 3.2, d: 24.8 })],
      });
    // "Cards" is 37.0 mm wide at 8 mm, 27.7 at 6, 23.1 at 5 and 18.5 at 4; the face is 4.5 mm in
    // from each end (corner arc and margin): it needs 46, 37, 32 and 27.5 mm
    for (const [w, cap] of [
      [50, 8],
      [40, 6],
      [34, 5],
      [30, 4],
    ] as const) {
      expect(planEngraving(planTray(tray(w), GEO), "Cards")?.cap, `${w} mm wide`).toBe(cap);
    }
    // 4 mm is the least: a face with no room for it is left plain
    const square = traySpec({
      key: "sq:p0:0",
      w: 26,
      d: 26,
      h: 30,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 22.8, d: 22.8 })],
    });
    expect(planEngraving(planTray(square, GEO), "Cards")).toBeNull();
    // a low wall takes a smaller size: 9 mm gives a 6.1 mm band between the margins, and 6 mm
    // capitals are 6.2 mm tall with their overshoot: 5 mm
    expect(planEngraving(planTray(tray(60, 9), GEO), "Cards")?.cap).toBe(5);
    expect(fitCap("Cards", 40, 4.2)?.cap).toBe(4);
    expect(fitCap("Cards", 40, 4.0)).toBeNull();
  });

  it("prefers a face that gives a good size to the first face that gives only a small one", () => {
    // a 22 mm cut in the middle of the front wall leaves 11 mm each side: "Dice" fits there only
    // at 4 mm. The back wall is whole and gives 8 mm: it wins over the front
    const spec = traySpec({
      key: "pref:p0:0",
      w: 40,
      d: 70,
      h: 30,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 36.8, d: 66.8, features: [cutout("front", 20, 12)] }),
      ],
    });
    const e = planEngraving(planTray(spec, GEO), "Dice");
    expect(e?.face).toBe("back");
    expect(e?.cap ?? 0).toBeGreaterThanOrEqual(CAP_GOOD_MM);
  });

  it("engraves the short name and skips it when it does not fit", () => {
    const small = traySpec({
      key: "s:p0:0",
      w: 30,
      d: 30,
      h: 30,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 26.8, d: 26.8 })],
    });
    const short = planEngraving(planTray(small, GEO), "Dice");
    expect(short).not.toBeNull();
    expect(short?.text).toBe("Dice");
    const plain = buildTray(m, small, GEO);
    expect(buildTray(m, { ...small, partName: "Dice" }, GEO).volumeMm3).toBeLessThan(
      plain.volumeMm3,
    );
    // ten characters are 37.5 mm wide at 4 mm: no face of 30 mm has room, so nothing is engraved,
    // not a number or a shorter name in its place
    expect(planEngraving(planTray(small, GEO), "Wooden Mee")).toBeNull();
    expect(buildTray(m, { ...small, partName: "Wooden Mee" }, GEO).volumeMm3).toBe(plain.volumeMm3);
    // a name with a character the font lacks is left off, too
    expect(planEngraving(planTray(small, GEO), "Dice!")).toBeNull();
    expect(planEngraving(planTray(small, GEO), "")).toBeNull();
  });

  it("changes nothing without a name, and for a plate", () => {
    const a = buildTray(m, plainBox, GEO);
    const b = buildTray(m, { ...plainBox, partName: undefined }, GEO);
    expect(b.volumeMm3).toBe(a.volumeMm3);
    for (const plate of [spacer]) {
      expect(carriesName(plate.part)).toBe(false);
      expect(buildTray(m, { ...plate, partName: "Plate" }, GEO).volumeMm3).toBe(
        buildTray(m, plate, GEO).volumeMm3,
      );
    }
    expect(carriesName("divider")).toBe(false);
    expect(["tray", "leftover", "riser"].every((p) => carriesName(p as TraySpec["part"]))).toBe(
      true,
    );
  });

  it("is left off a wall too thin to keep the thinnest feature behind it", () => {
    const thin: Settings = { ...GEO, wall: 0.9 };
    const spec = {
      ...plainBox,
      wall: 0.9,
      compartments: [compartment({ x: 0.9, y: 0.9, w: 98.2, d: 58.2 })],
    };
    expect(planEngraving(planTray(spec, thin), "Dice")).toBeNull();
    expect(planWallEngravings(planTray(spec, thin), "Dice")).toEqual([]);
    // the walls are left plain
    const named = buildTray(m, { ...spec, partName: "Dice" }, thin);
    expect(onPlane(named.mesh, 1, ENGRAVE_DEPTH_MM).filter(([, , z]) => z > 1.5)).toEqual([]);
    expect(onPlane(named.mesh, 1, 60 - ENGRAVE_DEPTH_MM).filter(([, , z]) => z > 1.5)).toEqual([]);
    // a 1.2 mm wall takes a shallower cut that still leaves 0.8 mm
    const sturdier = {
      ...spec,
      wall: 1.2,
      compartments: [compartment({ x: 1.2, y: 1.2, w: 97.6, d: 57.6 })],
    };
    const e = planEngraving(planTray(sturdier, GEO), "Dice");
    expect(e).not.toBeNull();
    expect(1.2 - (e?.depth ?? 0)).toBeGreaterThanOrEqual(MIN_FEATURE_MM);
  });

  it("keeps clear of a wall cutout, moving to the next face when the front has no room", () => {
    // a 22 mm cut at the middle of the front wall of a 40 mm-wide tray
    const narrow = traySpec({
      key: "n:p0:0",
      w: 40,
      d: 70,
      h: 30,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 36.8, d: 66.8, features: [cutout("front", 20, 12)] }),
      ],
    });
    const e = planEngraving(planTray(narrow, GEO), "Dice 12");
    expect(e).not.toBeNull();
    expect(e?.face).not.toBe("front");
    expect(problemsOf(m, { ...narrow, partName: "Dice 12" }, GEO)).toEqual([]);
  });

  it("sits beside a cutout when there is room, never over it", () => {
    const wide = traySpec({
      key: "w:p0:0",
      w: 150,
      d: 60,
      h: 30,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 146.8, d: 56.8, features: [cutout("front", 30, 12)] }),
      ],
    });
    const e = planEngraving(planTray(wide, GEO), "Tokens");
    expect(e?.face).toBe("front");
    // cut spans 19..41 (+ fillets and a margin): the name is wholly to its right
    expect(e?.from ?? 0).toBeGreaterThan(41 + 3);
    expect(problemsOf(m, { ...wide, partName: "Tokens" }, GEO)).toEqual([]);
  });

  it("tries a tighter band on a low part before leaving it plain", () => {
    const low = (h: number) => traySpec({ key: `l${h}:p0:0`, w: 80, d: 50, h, solid: true });
    // 7 mm tall: no room between the usual margins (1 mm above the chamfer, 1.5 mm below the rim)
    const seven = planTray(low(7), GEO);
    const e = planEngraving(seven, "Dice");
    expect(e).not.toBeNull();
    // the text stays on the wall, within the tight band: 0.5 mm above the chamfer, 0.8 below the rim
    const height = layoutText("Dice", e?.cap ?? 4)?.height ?? 0;
    expect(e?.z ?? 0).toBeGreaterThanOrEqual(seven.chamfer + 0.5 - 1e-9);
    expect((e?.z ?? 0) + height).toBeLessThanOrEqual(7 - 0.8 + 1e-9);
    const plain = buildTray(m, low(7), GEO);
    const named = buildTray(m, { ...low(7), partName: "Dice" }, GEO);
    expect(named.volumeMm3).toBeLessThan(plain.volumeMm3);
    expect(problemsOf(m, { ...low(7), partName: "Dice" }, GEO)).toEqual([]);
    // too low even for the tight band: plain
    expect(planEngraving(planTray(low(5), GEO), "Dice")).toBeNull();
  });

  describe("on an upper tray with the lip on (the groove under its outer bottom edge)", () => {
    it("starts above the groove's roof: the recess's lowest point is not under the groove's top", () => {
      const tray = { ...upperLevel1, h: 13 };
      const named = { ...tray, partName: "Cards" };
      const plan = planTray(tray, GEO);
      const zTop = plan.groove?.zTop ?? NaN;
      expect(zTop).toBeCloseTo(2.85, 6);
      const e = planEngraving(plan, "Cards");
      expect(e).not.toBeNull();
      expect(e?.z ?? 0).toBeGreaterThanOrEqual(zTop + 0.5 - 1e-9);
      // the thicker wall (2.56 mm) behind it takes the usual depth, with the features kept behind
      expect(e?.depth).toBe(ENGRAVE_DEPTH_MM);
      expect(2.56 - (e?.depth ?? 0)).toBeGreaterThanOrEqual(MIN_FEATURE_MM);

      const plain = buildTray(m, tray, GEO);
      const cut = buildTray(m, named, GEO);
      expect(cut.volumeMm3).toBeLessThan(plain.volumeMm3);
      // every vertex the wall engravings add lies on or above the groove's top (the others are the
      // underside's and the floor's, further in)
      const fresh = added(cut.mesh, plain.mesh).filter(
        ([x, y]) => Math.min(x, tray.w - x, y, tray.d - y) < 1,
      );
      expect(fresh.length).toBeGreaterThan(0);
      expect(Math.min(...fresh.map((p) => p[2]))).toBeGreaterThanOrEqual(zTop);
      expect(problemsOf(m, named, GEO)).toEqual([]);
    });
  });

  it("says without building whether a name fits (engravesName), as the build does", () => {
    expect(engravesName(plainBox, GEO, "Cards")).toBe(true);
    expect(buildTray(m, { ...plainBox, partName: "Cards" }, GEO).volumeMm3).toBeLessThan(
      buildTray(m, plainBox, GEO).volumeMm3,
    );
    const tiny = traySpec({ key: "t:p0:0", w: 12, d: 12, h: 20, solid: true });
    expect(engravesName(tiny, GEO, "Cards")).toBe(false);
    expect(buildTray(m, { ...tiny, partName: "Cards" }, GEO).volumeMm3).toBe(
      buildTray(m, tiny, GEO).volumeMm3,
    );
    // a plate carries no name; a spec that cannot be planned says nothing
    expect(engravesName(spacer, GEO, "Cards")).toBe(false);
    expect(engravesName({ ...plainBox, w: -1 }, GEO, "Cards")).toBeNull();
  });

  it("builds a closed printable solid of the same size on every kind of part", () => {
    const parts: [string, TraySpec][] = [
      ["plain", plainBox],
      ["custom block", customBlock],
      ["upright with channel", uprightChannel],
      ["cutouts and notches", flatCutouts],
      ["minis", miniPockets],
      ["spare leftover", spareLeftover],
      ["solid leftover", solidLeftover],
      ["open riser", openRiser],
      ["solid riser", solidRiser],
      ["lipped lower", lippedLower],
      ["upper level", upperLevel1],
    ];
    for (const [name, spec] of parts) {
      for (const n of ["A", "Dice 12", "M-W K Z S"]) {
        expect(problemsOf(m, { ...spec, partName: n }, GEO), `${name} ${n}`).toEqual([]);
      }
    }
  }, 120_000);

  it("changes nothing but the engraving: nothing grows, the volume only falls", () => {
    for (const spec of [plainBox, solidLeftover, openRiser, lippedLower]) {
      const plain = buildTray(m, spec, GEO);
      const named = buildTray(m, { ...spec, partName: "Spac Dice" }, GEO);
      expect(named.volumeMm3).toBeLessThan(plain.volumeMm3);
      const a = bounds(plain.mesh);
      const b = bounds(named.mesh);
      expect(b.min).toEqual(a.min);
      expect(b.max).toEqual(a.max);
      const topo = topology(named.mesh);
      expect(topo.closed).toBe(true);
      expect(topo.genus).toBe(topology(plain.mesh).genus);
      expect(signedVolume(named.mesh)).toBeCloseTo(named.volumeMm3, 0);
      expect(checkPrintability(named.mesh, 0)).toMatchObject({ ok: true, overhangTriangles: 0 });
    }
  }, 60_000);
});

describe("the name on the underside", () => {
  it("is a flat recess two layers deep, not a V, centred when nothing is in the way", () => {
    // a 2 mm floor and a part with no well to name: the inside name is not in its way
    const solid = traySpec({ key: "u:p0:0", w: 100, d: 60, h: 20, solid: true });
    const u = planUnderside(planTray(solid, GEO), "Cards");
    expect(u).not.toBeNull();
    expect(u?.cap).toBe(8);
    expect(u?.depth).toBe(UNDERSIDE_DEPTH_MM);
    expect(u?.cx).toBe(50);
    expect(u?.cy).toBe(30);
    expect(u?.along).toBe("x");
    const plain = buildTray(m, solid, GEO);
    const named = buildTray(m, { ...solid, partName: "Cards" }, GEO);
    expect(problemsOf(m, { ...solid, partName: "Cards" }, GEO)).toEqual([]);
    expect(bounds(named.mesh)).toEqual(bounds(plain.mesh));
    // the recess's ceiling is a flat face 0.4 mm above the bed, in the bed face's middle
    const ceiling = onPlane(named.mesh, 1, 30).filter(([, , z]) => Math.abs(z - 0.4) < 1e-3);
    expect(ceiling.length).toBeGreaterThan(0);
    // the walls carry the name too: more than the underside's own volume comes out
    expect(plain.volumeMm3 - named.volumeMm3).toBeGreaterThan(30);
    // and the printability check lets exactly that ceiling through, nothing steeper
    expect(checkPrintability(named.mesh, 0)).toMatchObject({ ok: true, overhangTriangles: 0 });
  });

  it("is mirrored: it reads upright from below, right is -x and up is +y", () => {
    const solid = traySpec({ key: "u:p0:0", w: 100, d: 60, h: 20, solid: true });
    const u = planUnderside(planTray(solid, GEO), "L");
    expect(u).not.toBeNull();
    const scope = new Scope();
    try {
      const cutter = buildUnderside(m, scope, u as NonNullable<typeof u>, 0);
      const { cx, cy } = u as NonNullable<typeof u>;
      // an L is a stem on the reader's left and a foot at the bottom: its mass lies to the
      // reader's lower left, that is to +x (right is -x) and -y of the centre
      const lowerLeft = volumeIn(cutter, [cx, 0, 0], [100, cy, 1]);
      const upperRight = volumeIn(cutter, [0, cy, 0], [cx, 60, 1]);
      expect(lowerLeft).toBeGreaterThan(upperRight * 2);
    } finally {
      scope.dispose();
    }
  });

  it("runs along the longer side of a part that is longer than wide, turned a quarter", () => {
    const tall = traySpec({ key: "t:p0:0", w: 60, d: 100, h: 20, solid: true });
    const u = planUnderside(planTray(tall, GEO), "Cards");
    expect(u?.along).toBe("y");
    expect(u?.cap).toBe(8);
  });

  it("keeps clear of the stacking groove on an upper tray, and the walls stay above it", () => {
    const tray = { ...upperLevel1, h: 13 };
    const plan = planTray(tray, GEO);
    const reach = plan.groove?.reach ?? NaN;
    const e = planEngravings(plan, "Cards");
    expect(e.walls.length).toBe(2);
    expect(e.underside).not.toBeNull();
    const plain = buildTray(m, tray, GEO);
    const named = buildTray(m, { ...tray, partName: "Cards" }, GEO);
    const under = added(named.mesh, plain.mesh).filter(([, , z]) => z < 1);
    expect(under.length).toBeGreaterThan(0);
    // every vertex of the underside engraving is further in than the groove's reach (the foot
    // chamfer's edge) plus the clearance, so it cannot touch the groove
    const distance = ([x, y]: [number, number, number]) => Math.min(x, tray.w - x, y, tray.d - y);
    expect(Math.min(...under.map(distance))).toBeGreaterThanOrEqual(reach + 1.5 - 1e-3);
  });

  it("keeps 0.8 mm of floor over it: the recess needs a floor of 1.2 mm", () => {
    const over = (floorZ: number) =>
      planTray(
        traySpec({
          key: `f${floorZ}:p0:0`,
          w: 100,
          d: 60,
          h: 30,
          compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8, floorZ })],
        }),
        GEO,
      );
    expect(planUnderside(over(1.2), "Dice")?.depth).toBe(UNDERSIDE_DEPTH_MM);
    expect(1.2 - UNDERSIDE_DEPTH_MM).toBeGreaterThanOrEqual(MIN_FEATURE_MM - 1e-9);
    expect(planUnderside(over(1.19), "Dice")).toBeNull();
    expect(planUnderside(over(1.05), "Dice")).toBeNull();
    // the walls have room all the same
    expect(planWallEngravings(over(1.05), "Dice").length).toBe(2);
  });

  it("is left off alone when the name does not fit it, or a floor notch is in its way", () => {
    // 30 mm square: 25 mm of bed face is no room for ten characters at 4 mm: off every face
    const small = traySpec({
      key: "s:p0:0",
      w: 30,
      d: 30,
      h: 30,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 26.8, d: 26.8 })],
    });
    const plan = planTray(small, GEO);
    const none = planEngravings(plan, "Wooden Mee");
    expect(none.walls).toEqual([]);
    expect(none.underside).toBeNull();
    expect(none.inside).toBeNull();
    // "Dice" fits all three faces
    const dice = planEngravings(plan, "Dice");
    expect(dice.walls.length).toBe(2);
    expect(dice.inside).not.toBeNull();
    // a floor notch under the middle of the bed face: the underside is off, the walls stay
    const notched = traySpec({
      key: "x:p0:0",
      w: 50,
      d: 50,
      h: 30,
      solid: true,
      compartments: [
        compartment({
          x: 1.6,
          y: 1.6,
          w: 46.8,
          d: 46.8,
          features: [cutout("left", 25, 20, 24, 22)],
        }),
      ],
    });
    const n = planEngravings(planTray(notched, GEO), "Dice");
    expect(n.walls.length).toBeGreaterThan(0);
    expect(problemsOf(m, { ...notched, partName: "Dice" }, GEO)).toEqual([]);
  });

  it("is the only engraving on a part too low for its walls to carry the name", () => {
    // 5 mm high and solid: the walls have no band (4 mm capitals are 4.1 mm tall, the band 3.5 mm),
    // the bed face has all the room it needs
    const flat = traySpec({ key: "f:p0:0", w: 80, d: 50, h: 5, solid: true });
    const e = planEngravings(planTray(flat, GEO), "Dice");
    expect(e.walls).toEqual([]);
    expect(e.underside).not.toBeNull();
    const plain = buildTray(m, flat, GEO);
    const named = buildTray(m, { ...flat, partName: "Dice" }, GEO);
    expect(named.volumeMm3).toBeLessThan(plain.volumeMm3);
    expect(problemsOf(m, { ...flat, partName: "Dice" }, GEO)).toEqual([]);
    expect(engravesName(flat, GEO, "Dice")).toBe(true);
  });
});

describe("the underside gives way to the name on the floor of a well", () => {
  it("moves aside on a 1.2 mm floor, where both would leave 0.4 mm", () => {
    const plan = planTray(plainBox, GEO);
    const e = planEngravings(plan, "Cards");
    expect(e.inside).not.toBeNull();
    expect(e.underside).not.toBeNull();
    const a = e.inside?.box;
    const b = e.underside?.box;
    // the two do not overlap in plan
    expect(a && b && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0).toBe(false);
    expect(problemsOf(m, { ...plainBox, partName: "Cards" }, GEO)).toEqual([]);
  });

  it("is left off when there is no room beside the inside name", () => {
    // 40 x 30 bed face: the inside name fills the middle, the rest is too small for it at 4 mm
    const spec = traySpec({
      key: "tight:p0:0",
      w: 40,
      d: 30,
      h: 20,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 36.8, d: 26.8 })],
    });
    const plan = planTray(spec, GEO);
    const e = planEngravings(plan, "Dice");
    expect(e.inside).not.toBeNull();
    const alone = planUnderside(plan, "Dice");
    expect(alone).not.toBeNull();
    if (e.underside !== null) {
      const a = e.inside?.box as NonNullable<typeof e.inside>["box"];
      const b = e.underside.box;
      expect(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0).toBe(false);
    }
  });

  it("stays centred when the floor holds both: 1.6 mm and thicker", () => {
    const spec = traySpec({
      key: "f16:p0:0",
      w: 100,
      d: 60,
      h: 30,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8, floorZ: 1.6 })],
    });
    const e = planEngravings(planTray(spec, GEO), "Cards");
    expect(e.inside?.depth).toBe(0.4);
    expect(e.underside?.cx).toBe(50);
    expect(e.underside?.cy).toBe(30);
    expect(1.6 - 0.4 - (e.underside?.depth ?? 0)).toBeGreaterThanOrEqual(MIN_FEATURE_MM - 1e-9);
    expect(problemsOf(m, { ...spec, partName: "Cards" }, GEO)).toEqual([]);
  });
});

describe("the name reads left to right, upright, from outside whichever face it is on", () => {
  const part = { w: 100, d: 60, h: 30 };
  // the viewer's right in the plan, for a viewer standing outside each face
  const right = (face: "front" | "back" | "left" | "right", p: [number, number]): number =>
    ({ front: p[0], back: -p[0], left: -p[1], right: p[1] })[face];
  for (const face of ["front", "back", "left", "right"] as const) {
    it(`on the ${face} face`, () => {
      const plan = { face, text: "L", cap: 8, depth: 0.4, from: 20, z: 5, flipped: false };
      const scope = new Scope();
      try {
        const cutter = buildEngraving(m, scope, plan, part);
        const box = cutter.boundingBox();
        // the recess is carried down 0.5 mm as it goes 0.4 mm in
        expect(box.min[2]).toBeCloseTo(5 - 0.5, 2);
        expect(box.max[2]).toBeCloseTo(13, 2);
        // an L: the stem is on the reader's left, the foot at the bottom. Its mass lies lower left
        const mesh = cutter.getMesh();
        let sumRight = 0;
        let sumUp = 0;
        let n = 0;
        let rights: number[] = [];
        for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
          const r = right(face, [mesh.vertProperties[i] ?? 0, mesh.vertProperties[i + 1] ?? 0]);
          rights.push(r);
          sumRight += r;
          sumUp += mesh.vertProperties[i + 2] ?? 0;
          n += 1;
        }
        const midRight = (Math.min(...rights) + Math.max(...rights)) / 2;
        expect(sumRight / n).toBeLessThan(midRight);
        expect(sumUp / n).toBeLessThan((5 + 13) / 2);
        // the text spans its width along the face, from its left end
        const width = layoutText("L", 8)?.width ?? 0;
        expect(Math.max(...rights) - Math.min(...rights)).toBeCloseTo(width, 1);
        rights = [];
      } finally {
        scope.dispose();
      }
    });
  }

  it("and from the printed side of a part that prints upside down", () => {
    const base = { face: "front" as const, text: "L", cap: 8, depth: 0.4, from: 20, z: 5 };
    const scope = new Scope();
    try {
      const flat = buildEngraving(m, scope, { ...base, flipped: false }, part).boundingBox();
      const turned = buildEngraving(m, scope, { ...base, flipped: true }, part).boundingBox();
      // the part is turned half a turn about X to print: y and z are turned about it
      expect(turned.min[0]).toBeCloseTo(flat.min[0], 3);
      expect(turned.max[0]).toBeCloseTo(flat.max[0], 3);
      expect(turned.min[1]).toBeCloseTo(part.d - flat.max[1], 3);
      expect(turned.max[1]).toBeCloseTo(part.d - flat.min[1], 3);
      expect(turned.min[2]).toBeCloseTo(part.h - flat.max[2], 3);
      expect(turned.max[2]).toBeCloseTo(part.h - flat.min[2], 3);
    } finally {
      scope.dispose();
    }
  });
});

describe("an engraved merged part", () => {
  // Rim off: a filler in a stack level has a groove with it on, and is not merged.
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    lip: { ...DEFAULT_SETTINGS.lip, enabled: false },
    mergeRisers: true,
  };
  const filler = (o: Partial<TraySpec> & Pick<TraySpec, "w" | "d">): TraySpec =>
    traySpec({
      key: "leftover:0",
      part: "leftover",
      stack: 5,
      h: 35,
      solid: true,
      ...o,
    });
  const GAP = DEFAULT_SETTINGS.trayGap;

  function merged(parts: TraySpec[]): TraySpec {
    const spec = mergeParts(parts, { settings, printer: TEST_PRINTER }).find((p) => p.merged);
    if (!spec) {
      throw new Error("not merged");
    }
    return spec;
  }

  it("goes on a member's face on the part's outside, as it prints", () => {
    const a = filler({ key: "leftover:0", x: 90.2, y: 0, w: 30, d: 100 });
    const b = filler({ key: "leftover:1", x: 90.2, y: 100 + GAP, w: 30, d: 80, stack: 6 });
    const spec = { ...merged([a, b]), partName: "Filler 21" };
    const plain = buildTray(m, { ...spec, partName: undefined }, settings);
    const named = buildTray(m, spec, settings);
    expect(named.volumeMm3).toBeLessThan(plain.volumeMm3);
    expect(topology(named.mesh).closed).toBe(true);
    expect(bounds(named.mesh)).toEqual(bounds(plain.mesh));
    expect(checkPrintability(printMesh(spec, named.mesh), 0)).toMatchObject({
      ok: true,
      overhangTriangles: 0,
    });
  });

  it("is cut so that it prints without overhang when the part prints upside down", () => {
    const ground = filler({ key: "leftover:0", x: 0, y: 12.4 + GAP, w: 90, d: 12 });
    const ledge = filler({
      key: "leftover:1",
      x: 0,
      y: 0,
      w: 90,
      d: 12.4,
      z: 28.4,
      h: 6.6,
      level: 1,
      stack: 0,
    });
    const spec = { ...merged([ground, ledge]), partName: "Ledge" };
    expect(spec.merged?.flipped).toBe(true);
    const plain = buildTray(m, { ...spec, partName: undefined }, settings);
    const named = buildTray(m, spec, settings);
    expect(named.volumeMm3).toBeLessThan(plain.volumeMm3);
    expect(topology(named.mesh).closed).toBe(true);
    const printed = printMesh(spec, named.mesh);
    expect(checkPrintability(printed, 0)).toMatchObject({ ok: true, overhangTriangles: 0 });
    // the engraving's floor, as it prints, is 0.4 mm into the printed front face (y = 0 there)
    expect(onPlane(printed, 1, ENGRAVE_DEPTH_MM).length).toBeGreaterThan(0);
  });
});
