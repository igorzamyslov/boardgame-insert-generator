// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { printMesh } from "../app/exportBuild";
import { mergeParts } from "../layout/merge";
import { TEST_PRINTER } from "../layout/test-utils";
import { carriesName } from "../model/part-name";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import {
  ENGRAVE_DEPTH_MM,
  ENGRAVE_STROKE_MAX_MM,
  ENGRAVE_STROKE_MIN_MM,
  UNDERSIDE_DEPTH_MAX_MM,
  UNDERSIDE_SLOPE,
  engravingPieces,
  planEngraving,
  planEngravings,
  planUnderside,
  planWallEngravings,
  undersidePieces,
} from "./engrave";
import { GLYPH_ROWS, glyphRects, textWidth } from "./glyphs";
import { engravesName } from "./engraves";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { checkPrintability } from "./printability";
import {
  GEO,
  compartment,
  customBlock,
  cutout,
  flatCutouts,
  lippedLower,
  miniPockets,
  notchedSpacer,
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

// How many strokes a character's cutter has: its pieces in `undersidePieces`.
const glyphRectCount = (ch: string): number => glyphRects(ch).length;

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

// The mesh vertices on a plane y = c.
function onPlane(mesh: { positions: Float32Array }, axis: 0 | 1, c: number) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (Math.abs((mesh.positions[i + axis] ?? 0) - c) < 1e-3) {
      pts.push([mesh.positions[i] ?? 0, mesh.positions[i + 1] ?? 0, mesh.positions[i + 2] ?? 0]);
    }
  }
  return pts;
}

describe("an engraved tray name", () => {
  it("is cut into the front wall of a plain tray: shallow, 8 mm capitals, centred", () => {
    const plan = planTray(plainBox, GEO);
    const e = planEngraving(plan, "Cards");
    expect(e).not.toBeNull();
    expect(e?.face).toBe("front");
    expect(e?.stroke).toBe(ENGRAVE_STROKE_MAX_MM);
    expect(e?.depth).toBe(ENGRAVE_DEPTH_MM);
    // a quarter of the 1.6 mm wall, leaving two thin features behind it
    expect(1.6 - ENGRAVE_DEPTH_MM).toBeGreaterThanOrEqual(MIN_FEATURE_MM);

    const plain = buildTray(m, plainBox, GEO);
    const named = buildTray(m, { ...plainBox, partName: "Cards" }, GEO);
    expect(named.volumeMm3).toBeLessThan(plain.volumeMm3);
    // five capitals, 8 mm tall and 4.8 mm wide, 0.4 mm deep (less their roofs and the islands), on
    // the front wall and on the back wall, and a shallower V under the tray
    const removed = plain.volumeMm3 - named.volumeMm3;
    expect(removed).toBeGreaterThan(40);
    const oneWall = 8 * textWidth("Cards") * ENGRAVE_STROKE_MAX_MM * ENGRAVE_DEPTH_MM;
    expect(removed).toBeLessThan(2 * oneWall + 20);
    // same outer size
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
    expect(Math.max(...xs)).toBeLessThanOrEqual(
      (e?.from ?? 0) + textWidth("Cards") * (e?.stroke ?? 0) + 0.05,
    );
    expect(Math.max(...zs)).toBeLessThanOrEqual((e?.z ?? 0) + GLYPH_ROWS * (e?.stroke ?? 0) + 0.05);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual((e?.z ?? 0) - 0.05);
    // clear of the rim and the chamfer
    expect(Math.max(...zs)).toBeLessThan(plainBox.h - 1);
    expect(Math.min(...zs)).toBeGreaterThan(1);
  });

  it("engraves the short name and skips it when it does not fit", () => {
    const small = traySpec({
      key: "s:p0:0",
      w: 30,
      d: 30,
      h: 30,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 26.8, d: 26.8 })],
    });
    // "Dice" is 15 strokes wide: 1.3 mm strokes or so fit between the corners of a 30 mm face
    const short = planEngraving(planTray(small, GEO), "Dice");
    expect(short).not.toBeNull();
    expect(short?.text).toBe("Dice");
    expect(short?.stroke).toBeGreaterThanOrEqual(ENGRAVE_STROKE_MIN_MM);
    const plain = buildTray(m, small, GEO);
    expect(buildTray(m, { ...small, partName: "Dice" }, GEO).volumeMm3).toBeLessThan(
      plain.volumeMm3,
    );
    // ten characters are 43.5 strokes: no face of 30 mm has room at the least stroke, so nothing is
    // engraved, not a number or a shorter name in its place
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
    for (const plate of [spacer, notchedSpacer]) {
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
    // the walls are left plain (the underside is planned on its own, over the 1.2 mm floor)
    const named = buildTray(m, { ...spec, partName: "Dice" }, thin);
    const plain = buildTray(m, spec, thin);
    const front = onPlane(named.mesh, 1, ENGRAVE_DEPTH_MM).filter(([, , z]) => z > 1.5);
    expect(front).toEqual([]);
    expect(onPlane(named.mesh, 1, 60 - ENGRAVE_DEPTH_MM).filter(([, , z]) => z > 1.5)).toEqual([]);
    expect(named.volumeMm3).toBeLessThanOrEqual(plain.volumeMm3);
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
        compartment({
          x: 1.6,
          y: 1.6,
          w: 36.8,
          d: 66.8,
          features: [cutout("front", 20, 12)],
        }),
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
        compartment({
          x: 1.6,
          y: 1.6,
          w: 146.8,
          d: 56.8,
          features: [cutout("front", 30, 12)],
        }),
      ],
    });
    const e = planEngraving(planTray(wide, GEO), "Tokens");
    expect(e?.face).toBe("front");
    // cut spans 19..41 (+ fillets and a margin): the name is wholly to its right
    expect(e?.from ?? 0).toBeGreaterThan(41 + 3);
    expect(problemsOf(m, { ...wide, partName: "Tokens" }, GEO)).toEqual([]);
  });

  it("shrinks the letters to the room, and is left off under the least stroke", () => {
    const low = traySpec({
      key: "l:p0:0",
      w: 80,
      d: 50,
      h: 9,
      solid: true,
    });
    const e = planEngraving(planTray(low, GEO), "Dice");
    expect(e?.stroke).toBeCloseTo((9 - 0.4 - 1 - 1.5) / 5, 6);
    expect(e?.stroke).toBeGreaterThanOrEqual(ENGRAVE_STROKE_MIN_MM);
    const flat = { ...low, h: 6, key: "f:p0:0" };
    expect(planEngraving(planTray(flat, GEO), "Dice")).toBeNull();
  });

  it("tries a tighter band on a low part before leaving it plain", () => {
    const low = (h: number) => traySpec({ key: `l${h}:p0:0`, w: 80, d: 50, h, solid: true });
    // 7 mm tall: no room between the usual margins (1 mm above the chamfer, 1.5 mm below the rim)
    const seven = planTray(low(7), GEO);
    const e = planEngraving(seven, "Dice");
    expect(e).not.toBeNull();
    expect(e?.stroke).toBeGreaterThanOrEqual(ENGRAVE_STROKE_MIN_MM);
    // the text stays on the wall, within the tight band: 0.5 mm above the chamfer, 0.8 below the rim
    expect(e?.z ?? 0).toBeGreaterThanOrEqual(seven.chamfer + 0.5 - 1e-9);
    expect((e?.z ?? 0) + GLYPH_ROWS * (e?.stroke ?? 0)).toBeLessThanOrEqual(7 - 0.8 + 1e-9);
    expect(["front", "back", "left", "right"]).toContain(e?.face);
    const plain = buildTray(m, low(7), GEO);
    const named = buildTray(m, { ...low(7), partName: "Dice" }, GEO);
    expect(named.volumeMm3).toBeLessThan(plain.volumeMm3);
    expect(problemsOf(m, { ...low(7), partName: "Dice" }, GEO)).toEqual([]);
    // too low even for the tight band: plain, as before
    expect(planEngraving(planTray(low(6.5), GEO), "Dice")).toBeNull();
  });

  it("engraves a part the usual band fits exactly as before the tighter band existed", () => {
    // 9 mm tall: the usual band gives (9 - 0.4 - 1 - 1.5) / 5 = 1.22 mm strokes, not the tight band's
    const e = planEngraving(
      planTray(traySpec({ key: "n:p0:0", w: 80, d: 50, h: 9, solid: true }), GEO),
      "Dice",
    );
    expect(e?.stroke).toBeCloseTo((9 - 0.4 - 1 - 1.5) / 5, 6);
  });

  describe("on an upper tray with the lip on (the groove under its outer bottom edge)", () => {
    // The mesh vertices of `named` that `plain` does not have: the engraving's own corners.
    const added = (named: { positions: Float32Array }, plain: { positions: Float32Array }) => {
      const key = (a: Float32Array, i: number) =>
        [0, 1, 2].map((k) => (a[i + k] ?? 0).toFixed(3)).join(",");
      const had = new Set<string>();
      for (let i = 0; i < plain.positions.length; i += 3) {
        had.add(key(plain.positions, i));
      }
      const out: [number, number, number][] = [];
      for (let i = 0; i < named.positions.length; i += 3) {
        if (!had.has(key(named.positions, i))) {
          out.push([
            named.positions[i] ?? 0,
            named.positions[i + 1] ?? 0,
            named.positions[i + 2] ?? 0,
          ]);
        }
      }
      return out;
    };

    // The vertices of `fresh` on the walls: within a millimetre of an outer face (the underside's
    // are further in than the groove's reach).
    const wallVertices = (
      fresh: [number, number, number][],
      part: { w: number; d: number },
    ): [number, number, number][] =>
      fresh.filter(([x, y]) => Math.min(x, part.w - x, y, part.d - y) < 1);

    it("starts above the groove's roof: the recess's lowest point is not under the groove's top", () => {
      // 13 mm high: the usual band (1 mm above the groove, 1.5 below the rim) is just what the letters fill
      const tray = { ...upperLevel1, h: 13 };
      const named = { ...tray, partName: "Cards" };
      const plan = planTray(tray, GEO);
      const zTop = plan.groove?.zTop ?? NaN;
      expect(zTop).toBeCloseTo(2.85, 6);
      const e = planEngraving(plan, "Cards");
      expect(e).not.toBeNull();
      // the usual band: 1 mm above the groove (not above the plain chamfer)
      expect(e?.z ?? 0).toBeGreaterThanOrEqual(zTop + 1 - 1e-9);
      // the thicker wall (2.56 mm) behind it takes the usual depth, with the features kept behind
      expect(e?.depth).toBe(ENGRAVE_DEPTH_MM);
      expect(2.56 - (e?.depth ?? 0)).toBeGreaterThanOrEqual(MIN_FEATURE_MM);

      const plain = buildTray(m, tray, GEO);
      const cut = buildTray(m, named, GEO);
      expect(cut.volumeMm3).toBeLessThan(plain.volumeMm3);
      // every vertex the wall engravings add, their floors and roofs, lies on or above the groove's
      // top (the underside engraving's are the ones near the bed: see "on three faces")
      const fresh = wallVertices(added(cut.mesh, plain.mesh), tray);
      expect(fresh.length).toBeGreaterThan(0);
      expect(Math.min(...fresh.map((p) => p[2]))).toBeGreaterThanOrEqual(zTop);
      // and it is still one closed, printable solid
      expect(problemsOf(m, named, GEO)).toEqual([]);
    });

    it("tries the tighter band on a low upper tray, still clear of the groove", () => {
      const low = (h: number) => ({ ...upperLevel1, key: `u${h}:p0:0`, h });
      const plan = planTray(low(10), GEO);
      const zTop = plan.groove?.zTop ?? NaN;
      // 10 mm: no room in the usual band (1 mm above the groove, 1.5 below the rim), room in the tight one
      const e = planEngraving(plan, "Dice");
      expect(e).not.toBeNull();
      expect(e?.z ?? 0).toBeGreaterThanOrEqual(zTop + 0.5 - 1e-9);
      expect(e?.z ?? 0).toBeLessThan(zTop + 1);
      expect(e?.stroke).toBeGreaterThanOrEqual(ENGRAVE_STROKE_MIN_MM);
      const named = { ...low(10), partName: "Dice" };
      const plain = buildTray(m, low(10), GEO);
      const cut = buildTray(m, named, GEO);
      expect(cut.volumeMm3).toBeLessThan(plain.volumeMm3);
      expect(
        Math.min(...wallVertices(added(cut.mesh, plain.mesh), low(10)).map((p) => p[2])),
      ).toBeGreaterThanOrEqual(zTop);
      expect(problemsOf(m, named, GEO)).toEqual([]);
      // too low even for that: plain
      expect(planEngraving(planTray(low(9), GEO), "Dice")).toBeNull();
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
      for (const n of ["A", "Dice 12", "Wooden Mee", "M-W K Z S"]) {
        expect(problemsOf(m, { ...spec, partName: n }, GEO), `${name} ${n}`).toEqual([]);
      }
    }
  });

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
      expect(checkPrintability(named.mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
    }
  });
});

describe("a name on three faces: two opposite walls and the underside", () => {
  // The vertices `named` has that `plain` has not: the engravings' own corners.
  const added = (named: { positions: Float32Array }, plain: { positions: Float32Array }) => {
    const key = (a: Float32Array, i: number) =>
      [0, 1, 2].map((k) => (a[i + k] ?? 0).toFixed(3)).join(",");
    const had = new Set<string>();
    for (let i = 0; i < plain.positions.length; i += 3) {
      had.add(key(plain.positions, i));
    }
    const out: [number, number, number][] = [];
    for (let i = 0; i < named.positions.length; i += 3) {
      if (!had.has(key(named.positions, i))) {
        out.push([
          named.positions[i] ?? 0,
          named.positions[i + 1] ?? 0,
          named.positions[i + 2] ?? 0,
        ]);
      }
    }
    return out;
  };
  // The underside's vertices are the new ones within the groove-free bed: below the walls' band.
  const underside = (fresh: [number, number, number][]) => fresh.filter(([, , z]) => z < 1);
  const wallsOf = (fresh: [number, number, number][]) => fresh.filter(([, , z]) => z >= 1);

  it("engraves the long walls and the underside of a plain tray, each with its own room", () => {
    const plan = planTray(plainBox, GEO);
    const e = planEngravings(plan, "Cards");
    // the face today's rule prefers (the front, the first with a good stroke) and the one across
    expect(e.walls.map((w) => w.face)).toEqual(["front", "back"]);
    expect(e.walls.every((w) => w.stroke === ENGRAVE_STROKE_MAX_MM)).toBe(true);
    const u = e.underside;
    expect(u).not.toBeNull();
    // centred, along the longer side, at the largest stroke
    expect(u?.cx).toBe(50);
    expect(u?.cy).toBe(30);
    expect(u?.along).toBe("x");
    expect(u?.stroke).toBe(ENGRAVE_STROKE_MAX_MM);

    const plain = buildTray(m, plainBox, GEO);
    const named = buildTray(m, { ...plainBox, partName: "Cards" }, GEO);
    expect(problemsOf(m, { ...plainBox, partName: "Cards" }, GEO)).toEqual([]);
    expect(bounds(named.mesh)).toEqual(bounds(plain.mesh));
    const fresh = added(named.mesh, plain.mesh);
    // both walls: recess floors in the planes y = depth and y = d - depth
    expect(onPlane(named.mesh, 1, ENGRAVE_DEPTH_MM).length).toBeGreaterThan(0);
    expect(onPlane(named.mesh, 1, 60 - ENGRAVE_DEPTH_MM).length).toBeGreaterThan(0);
    expect(wallsOf(fresh).length).toBeGreaterThan(0);
    // the underside: grooves in the bed face, none deeper than the cap
    const under = underside(fresh);
    expect(under.length).toBeGreaterThan(0);
    expect(Math.max(...under.map((p) => p[2]))).toBeLessThanOrEqual(UNDERSIDE_DEPTH_MAX_MM + 1e-6);
    expect(Math.max(...under.map((p) => p[2]))).toBeCloseTo(u?.depth ?? NaN, 3);
  });

  it("puts a wall's name on the pair across from the face it prefers, each wall on its own room", () => {
    // 22 mm cut at the middle of the front wall of a 40 mm wide tray: no room in front, so the back
    // is the face the rule prefers, and the front, across from it, is left off alone
    const narrow = traySpec({
      key: "n:p0:0",
      w: 40,
      d: 70,
      h: 30,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 36.8, d: 66.8, features: [cutout("front", 20, 12)] }),
      ],
    });
    const walls = planWallEngravings(planTray(narrow, GEO), "Dice");
    expect(walls.map((w) => w.face)).toEqual(["back"]);
    // a part that is longer than wide with no cuts: front and back, not left and right
    const long = traySpec({
      key: "l:p0:0",
      w: 40,
      d: 70,
      h: 30,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 36.8, d: 66.8 })],
    });
    expect(planWallEngravings(planTray(long, GEO), "Dice").map((w) => w.face)).toEqual([
      "front",
      "back",
    ]);
    // a face too narrow takes the pair that fits: 12 mm wide, 80 mm long
    const slim = traySpec({ key: "s:p0:0", w: 12, d: 80, h: 30, solid: true });
    expect(planWallEngravings(planTray(slim, GEO), "Dice").map((w) => w.face)).toEqual([
      "left",
      "right",
    ]);
  });

  it("keeps the thinnest feature between two recesses on a thin solid part", () => {
    // 1.7 mm thick: two 0.4 mm recesses would leave 0.9; a third face thinner is left plain
    const plate = traySpec({ key: "t:p0:0", w: 60, d: 30, h: 20, solid: true });
    const walls = planWallEngravings(planTray(plate, GEO), "Dice");
    expect(walls).toHaveLength(2);
    expect(30 - walls.reduce((sum, w) => sum + w.depth, 0)).toBeGreaterThanOrEqual(MIN_FEATURE_MM);
  });

  describe("the underside", () => {
    it("is mirrored: it reads upright from below, so from above it runs toward -x", () => {
      const u = planUnderside(planTray(plainBox, GEO), "AB");
      expect(u).not.toBeNull();
      if (u === null) {
        return;
      }
      // the stroke footprints on the bed face, one per piece, in the part's frame
      const feet = undersidePieces(u).map((points) => {
        const bed = points.filter((p) => p[2] === 0);
        const xs = bed.map((p) => p[0]);
        const ys = bed.map((p) => p[1]);
        return {
          x0: Math.min(...xs),
          x1: Math.max(...xs),
          y0: Math.min(...ys),
          y1: Math.max(...ys),
        };
      });
      // A is the first letter and B the second: A lies at larger x, since the text reads toward -x
      const aCells = glyphRectCount("A");
      const a = feet.slice(0, aCells);
      const b = feet.slice(aCells);
      expect(Math.min(...a.map((f) => f.x0))).toBeGreaterThan(Math.max(...b.map((f) => f.x1)));
      // the same on a part that is longer than wide, turned: the first letter lies at lower y
      const t = planUnderside(
        planTray(
          traySpec({
            key: "t:p0:0",
            w: 60,
            d: 100,
            h: 30,
            compartments: [compartment({ x: 1.6, y: 1.6, w: 56.8, d: 96.8 })],
          }),
          GEO,
        ),
        "AB",
      );
      expect(t?.along).toBe("y");
      const tf = undersidePieces(t as NonNullable<typeof t>).map((points) =>
        points.filter((p) => p[2] === 0).map((p) => p[1]),
      );
      expect(Math.max(...tf.slice(0, aCells).flat())).toBeLessThan(
        Math.min(...tf.slice(aCells).flat()),
      );
    });

    it("draws the letters as a viewer below the part sees them: right is -x, up is +y", () => {
      const u = planUnderside(planTray(plainBox, GEO), "2");
      expect(u).not.toBeNull();
      if (u === null) {
        return;
      }
      const feet = undersidePieces(u).map((points) => {
        const bed = points.filter((p) => p[2] === 0);
        const rights = bed.map((p) => -p[0]);
        const ups = bed.map((p) => p[1]);
        return {
          r0: Math.min(...rights),
          r1: Math.max(...rights),
          u0: Math.min(...ups),
          u1: Math.max(...ups),
        };
      });
      const inset = (u.stroke - u.line) / 2;
      const r0 = Math.min(...feet.map((f) => f.r0)) - inset;
      const u0 = Math.min(...feet.map((f) => f.u0)) - inset;
      const rows: string[] = [];
      for (let row = 4; row >= 0; row -= 1) {
        let line = "";
        for (let col = 0; col < 3; col += 1) {
          const r = r0 + (col + 0.5) * u.stroke;
          const up = u0 + (row + 0.5) * u.stroke;
          line += feet.some((f) => r > f.r0 && r < f.r1 && up > f.u0 && up < f.u1) ? "#" : ".";
        }
        rows.push(line);
      }
      // the 2 of glyphs.ts, upright and not reversed
      expect(rows).toEqual(["###", "..#", "###", "#..", "###"]);
    });

    it("keeps clear of the stacking groove on an upper tray, and the walls stay above it", () => {
      const tray = { ...upperLevel1, h: 13 };
      const plan = planTray(tray, GEO);
      const groove = plan.groove;
      expect(groove).not.toBeNull();
      const reach = groove?.reach ?? NaN;
      const zTop = groove?.zTop ?? NaN;
      const e = planEngravings(plan, "Cards");
      expect(e.walls.length).toBe(2);
      expect(e.underside).not.toBeNull();
      const plain = buildTray(m, tray, GEO);
      const named = buildTray(m, { ...tray, partName: "Cards" }, GEO);
      expect(problemsOf(m, { ...tray, partName: "Cards" }, GEO)).toEqual([]);
      const fresh = added(named.mesh, plain.mesh);
      const under = underside(fresh);
      expect(under.length).toBeGreaterThan(0);
      // every vertex of the underside engraving is further in than the groove's reach (the foot
      // chamfer's edge) plus the clearance, so it cannot touch the groove, and sits in the floor
      const distance = ([x, y]: [number, number, number]) => Math.min(x, tray.w - x, y, tray.d - y);
      expect(Math.min(...under.map(distance))).toBeGreaterThanOrEqual(reach + 1.5 - 1e-3);
      expect(Math.max(...under.map((p) => p[2]))).toBeLessThan(1.2);
      // the walls' engravings start above the groove's roof, on both walls
      const walls = wallsOf(fresh);
      expect(Math.min(...walls.map((p) => p[2]))).toBeGreaterThanOrEqual(zTop);
      expect(walls.some((p) => p[1] < 1)).toBe(true);
      expect(walls.some((p) => p[1] > tray.d - 1)).toBe(true);
    });

    it("is cut as V grooves: every face slopes up at more than 45°, and no face of it faces down", () => {
      const u = planUnderside(planTray(plainBox, GEO), "Cards");
      expect(u).not.toBeNull();
      expect(u?.depth).toBeCloseTo(((u?.line ?? 0) * UNDERSIDE_SLOPE) / 2, 9);
      expect(UNDERSIDE_SLOPE).toBeGreaterThan(1);
      // the printed mesh has no downward face steeper than 45° above the bed (problemsOf checks it)
      expect(problemsOf(m, { ...plainBox, partName: "Cards" }, GEO)).toEqual([]);
      const named = buildTray(m, { ...plainBox, partName: "Cards" }, GEO);
      expect(checkPrintability(named.mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
    });

    it("leaves the floor its thinnest feature: the depth follows the floor, up to the cap", () => {
      const over = (floorZ: number, h = 30) =>
        planTray(
          traySpec({
            key: `f${floorZ}:p0:0`,
            w: 100,
            d: 60,
            h,
            compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8, floorZ })],
          }),
          GEO,
        );
      // the default 1.2 mm floor: 1.2 - 0.81 = 0.39 mm deep, 0.81 mm of floor above the ridge
      const standard = planUnderside(over(1.2), "Dice");
      expect(standard?.depth).toBeCloseTo(1.2 - MIN_FEATURE_MM - 0.01, 6);
      expect(1.2 - (standard?.depth ?? 0)).toBeGreaterThanOrEqual(MIN_FEATURE_MM);
      // a thicker floor takes more, never over the cap
      const thick = planUnderside(over(3), "Dice");
      expect(thick?.depth).toBeLessThanOrEqual(UNDERSIDE_DEPTH_MAX_MM + 1e-9);
      expect(thick?.depth).toBeGreaterThan(standard?.depth ?? 0);
      // a floor too thin to keep 0.8 mm over a groove 0.3 mm deep has none
      expect(planUnderside(over(1.05), "Dice")).toBeNull();
      // the walls have room all the same
      expect(planWallEngravings(over(1.05), "Dice").length).toBe(2);
    });

    it("is left off alone when the name does not fit it, or a floor notch is in its way", () => {
      // 30 mm square: 26 mm of bed face is 0.6 mm a stroke for ten characters: off every face
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
      // "Dice" fits both: the walls, and the underside
      const dice = planEngravings(plan, "Dice");
      expect(dice.walls.length).toBe(2);
      expect(dice.underside).not.toBeNull();
      // ten characters on a 90 mm bed face still fit the underside (and the long walls) at 1.0
      const wide = traySpec({
        key: "w:p0:0",
        w: 90,
        d: 40,
        h: 30,
        compartments: [compartment({ x: 1.6, y: 1.6, w: 86.8, d: 36.8 })],
      });
      expect(planEngravings(planTray(wide, GEO), "Wooden Mee").underside).not.toBeNull();
      // a floor notch under the middle of the bed face: the underside is off, the walls stay
      const notched = traySpec({
        key: "x:p0:0",
        w: 50,
        d: 50,
        h: 30,
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
      expect(n.underside).toBeNull();
      expect(n.walls.length).toBeGreaterThan(0);
      expect(problemsOf(m, { ...notched, partName: "Dice" }, GEO)).toEqual([]);
    });

    it("is the only engraving on a part too low for its walls to carry the name", () => {
      // 6 mm high and solid: the walls have no band, the bed face has all the room it needs
      const flat = traySpec({ key: "f:p0:0", w: 80, d: 50, h: 6, solid: true });
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

  it("leaves a tray too small for every face plain, with the same mesh", () => {
    const tiny = traySpec({ key: "t:p0:0", w: 12, d: 12, h: 20, solid: true });
    const e = planEngravings(planTray(tiny, GEO), "Dice");
    expect(e.walls).toEqual([]);
    expect(e.underside).toBeNull();
    const plain = buildTray(m, tiny, GEO);
    const named = buildTray(m, { ...tiny, partName: "Dice" }, GEO);
    expect(named.volumeMm3).toBe(plain.volumeMm3);
    expect(named.mesh.positions).toEqual(plain.mesh.positions);
    expect(engravesName(tiny, GEO, "Dice")).toBe(false);
  });

  it("builds a valid manifold of the same size from every kind of part, on every face that fits", () => {
    const parts: [string, TraySpec][] = [
      ["plain", plainBox],
      ["upper level", { ...upperLevel1, h: 13 }],
      ["lipped lower", lippedLower],
      ["solid leftover", solidLeftover],
      ["open riser", openRiser],
      ["flat cutouts", flatCutouts],
    ];
    for (const [name, spec] of parts) {
      const plain = buildTray(m, spec, GEO);
      const named = buildTray(m, { ...spec, partName: "Dice 12" }, GEO);
      const topo = topology(named.mesh);
      expect(topo.closed, name).toBe(true);
      expect(topo.genus, name).toBe(topology(plain.mesh).genus);
      expect(bounds(named.mesh), name).toEqual(bounds(plain.mesh));
      expect(named.volumeMm3, name).toBeLessThan(plain.volumeMm3);
      expect(signedVolume(named.mesh), name).toBeCloseTo(named.volumeMm3, 0);
      expect(checkPrintability(named.mesh), name).toMatchObject({ ok: true, overhangTriangles: 0 });
    }
  });
});

// What a viewer standing outside a face sees of the pieces: columns across (to the viewer's right),
// rows down, one cell per `cell` mm, "#" where a piece covers it.
function seen(
  face: "front" | "back" | "left" | "right",
  pieces: [number, number, number][][],
  cell: number,
): string[] {
  const right = (p: [number, number, number]): number =>
    ({ front: p[0], back: -p[0], left: -p[1], right: p[1] })[face];
  const spans = pieces.map((pts) => {
    const r = pts.map(right);
    const z = pts.map((p) => p[2]);
    return { r0: Math.min(...r), r1: Math.max(...r), z0: Math.min(...z), z1: Math.max(...z) };
  });
  const r0 = Math.min(...spans.map((s) => s.r0));
  const r1 = Math.max(...spans.map((s) => s.r1));
  const z0 = Math.min(...spans.map((s) => s.z0));
  const z1 = Math.max(...spans.map((s) => s.z1));
  const rows: string[] = [];
  for (let z = z1 - cell / 2; z > z0; z -= cell) {
    let row = "";
    for (let r = r0 + cell / 2; r < r1; r += cell) {
      row += spans.some((s) => r > s.r0 && r < s.r1 && z > s.z0 && z < s.z1) ? "#" : ".";
    }
    rows.push(row);
  }
  return rows;
}

describe("the name reads left to right, upright, from outside whichever face they are on", () => {
  const plan = { text: "2", stroke: 1.6, depth: 0.4, from: 20, z: 5, flipped: false };
  const part = { w: 100, d: 60, h: 30 };
  // the 2 of the font in glyphs.ts, one cell per stroke: top, upper right, middle, lower left, bottom
  const two = ["###", "..#", "###", "#..", "###"];
  for (const face of ["front", "back", "left", "right"] as const) {
    it(`on the ${face} face`, () => {
      const pieces = engravingPieces({ ...plan, face }, part);
      const rows = seen(face, pieces, 0.8);
      // cells of 0.8 mm are half a stroke: collapse pairs back into strokes
      const strokes: string[] = [];
      for (let i = 0; i < rows.length; i += 2) {
        strokes.push(
          (rows[i] ?? "")
            .split("")
            .filter((_, k) => k % 2 === 0)
            .join(""),
        );
      }
      expect(strokes).toEqual(two);
    });
  }

  it("and from the printed side of a part that prints upside down", () => {
    const pieces = engravingPieces({ ...plan, face: "front", flipped: true }, part);
    // the part is turned about X to print: do the same to the points, and read the front face
    const turned = pieces.map((pts) =>
      pts.map(([x, y, z]): [number, number, number] => [x, part.d - y, part.h - z]),
    );
    const flat = engravingPieces({ ...plan, face: "front" }, part);
    expect(turned.map((pts) => pts.map((p) => p.map((v) => Number(v.toFixed(6)))))).toEqual(
      flat.map((pts) => pts.map((p) => p.map((v) => Number(v.toFixed(6))))),
    );
  });
});

describe("an engraved merged part", () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, mergeRisers: true };
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
    expect(checkPrintability(printMesh(spec, named.mesh))).toMatchObject({
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
    expect(checkPrintability(printed)).toMatchObject({ ok: true, overhangTriangles: 0 });
    // the engraving's floor, as it prints, is 0.4 mm into the printed front face (y = 0 there)
    expect(onPlane(printed, 1, ENGRAVE_DEPTH_MM).length).toBeGreaterThan(0);
  });
});
