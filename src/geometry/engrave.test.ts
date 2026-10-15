// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { printMesh } from "../app/exportBuild";
import { mergeParts } from "../layout/merge";
import { TEST_PRINTER } from "../layout/test-utils";
import { carriesNumber } from "../model/part-number";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import {
  ENGRAVE_DEPTH_MM,
  ENGRAVE_STROKE_MAX_MM,
  ENGRAVE_STROKE_MIN_MM,
  engravingPieces,
  planEngraving,
} from "./engrave";
import { DIGIT_COLS, DIGIT_ROWS, digitRects, numberRects, numberWidth } from "./glyphs";
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

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

describe("digit glyphs", () => {
  it("has ten digits, each of strokes on the grid", () => {
    for (let d = 0; d <= 9; d += 1) {
      const rects = digitRects(d);
      expect(rects.length).toBeGreaterThan(1);
      for (const r of rects) {
        expect(r.x0).toBeGreaterThanOrEqual(0);
        expect(r.z0).toBeGreaterThanOrEqual(0);
        expect(r.x1).toBeLessThanOrEqual(DIGIT_COLS);
        expect(r.z1).toBeLessThanOrEqual(DIGIT_ROWS);
        expect(r.x1 - r.x0).toBeGreaterThanOrEqual(1);
        expect(r.z1 - r.z0).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("tells the ten digits apart", () => {
    const shapes = Array.from({ length: 10 }, (_, d) => JSON.stringify(digitRects(d)));
    expect(new Set(shapes).size).toBe(10);
  });

  it("leaves a stroke between any two separate strokes of a digit and more between digits", () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 88, 305]) {
      const rects = numberRects(n);
      for (const a of rects) {
        for (const b of rects) {
          if (a === b) {
            continue;
          }
          const gapX = Math.max(a.x0 - b.x1, b.x0 - a.x1);
          const gapZ = Math.max(a.z0 - b.z1, b.z0 - a.z1);
          // overlapping or touching in both axes is one stroke joined to another
          if (gapX < 0 && gapZ < 0) {
            continue;
          }
          if (gapX === 0 || gapZ === 0) {
            expect(Math.max(gapX, gapZ), `${n}`).toBeLessThanOrEqual(0);
            continue;
          }
          expect(Math.max(gapX, gapZ), `${n}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("lays digits side by side", () => {
    expect(numberWidth(7)).toBe(3);
    expect(numberWidth(12)).toBe(7.5);
    expect(Math.max(...numberRects(12).map((r) => r.x1))).toBe(7.5);
    expect(() => numberRects(-1)).toThrow(RangeError);
    expect(() => numberRects(1.5)).toThrow(RangeError);
  });
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

describe("an engraved part number", () => {
  it("is cut into the front wall of a plain tray: shallow, 8 mm digits, centred", () => {
    const plan = planTray(plainBox, GEO);
    const e = planEngraving(plan, 3);
    expect(e).not.toBeNull();
    expect(e?.face).toBe("front");
    expect(e?.stroke).toBe(ENGRAVE_STROKE_MAX_MM);
    expect(e?.depth).toBe(ENGRAVE_DEPTH_MM);
    // a quarter of the 1.6 mm wall, leaving two thin features behind it
    expect(1.6 - ENGRAVE_DEPTH_MM).toBeGreaterThanOrEqual(MIN_FEATURE_MM);

    const plain = buildTray(m, plainBox, GEO);
    const numbered = buildTray(m, { ...plainBox, partNumber: 3 }, GEO);
    expect(numbered.volumeMm3).toBeLessThan(plain.volumeMm3);
    // a 3 mm-wide, 8 mm-tall stroke figure 0.4 mm deep (less its roofs and the islands)
    const removed = plain.volumeMm3 - numbered.volumeMm3;
    expect(removed).toBeGreaterThan(5);
    expect(removed).toBeLessThan(8 * 4.8 * ENGRAVE_DEPTH_MM);
    // same outer size
    expect(bounds(numbered.mesh)).toEqual(bounds(plain.mesh));
    expect(problemsOf(m, { ...plainBox, partNumber: 3 }, GEO)).toEqual([]);

    // the floor of the engraving lies in the plane y = depth, within the digit's box
    const floor = onPlane(numbered.mesh, 1, ENGRAVE_DEPTH_MM).filter(
      ([x, , z]) => x > 5 && x < 95 && z > 2 && z < 28,
    );
    expect(floor.length).toBeGreaterThan(0);
    const xs = floor.map((p) => p[0]);
    const zs = floor.map((p) => p[2]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual((e?.from ?? 0) - 1e-3);
    expect(Math.max(...xs)).toBeLessThanOrEqual((e?.from ?? 0) + 3 * (e?.stroke ?? 0) + 1e-3);
    expect(Math.max(...zs)).toBeLessThanOrEqual((e?.z ?? 0) + 5 * (e?.stroke ?? 0) + 1e-3);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual((e?.z ?? 0) - 1e-3);
    // clear of the rim and the chamfer
    expect(Math.max(...zs)).toBeLessThan(plainBox.h - 1);
    expect(Math.min(...zs)).toBeGreaterThan(1);
  });

  it("changes nothing without a number, and for a plate", () => {
    const a = buildTray(m, plainBox, GEO);
    const b = buildTray(m, { ...plainBox, partNumber: undefined }, GEO);
    expect(b.volumeMm3).toBe(a.volumeMm3);
    for (const plate of [spacer, notchedSpacer]) {
      expect(carriesNumber(plate.part)).toBe(false);
      expect(buildTray(m, { ...plate, partNumber: 4 }, GEO).volumeMm3).toBe(
        buildTray(m, plate, GEO).volumeMm3,
      );
    }
    expect(carriesNumber("divider")).toBe(false);
    expect(["tray", "leftover", "riser"].every((p) => carriesNumber(p as TraySpec["part"]))).toBe(
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
    expect(planEngraving(planTray(spec, thin), 5)).toBeNull();
    expect(buildTray(m, { ...spec, partNumber: 5 }, thin).volumeMm3).toBe(
      buildTray(m, spec, thin).volumeMm3,
    );
    // a 1.2 mm wall takes a shallower cut that still leaves 0.8 mm
    const sturdier = {
      ...spec,
      wall: 1.2,
      compartments: [compartment({ x: 1.2, y: 1.2, w: 97.6, d: 57.6 })],
    };
    const e = planEngraving(planTray(sturdier, GEO), 5);
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
    const e = planEngraving(planTray(narrow, GEO), 12);
    expect(e).not.toBeNull();
    expect(e?.face).not.toBe("front");
    expect(problemsOf(m, { ...narrow, partNumber: 12 }, GEO)).toEqual([]);
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
    const e = planEngraving(planTray(wide, GEO), 8);
    expect(e?.face).toBe("front");
    // cut spans 19..41 (+ fillets and a margin): the digits are wholly to its right
    expect(e?.from ?? 0).toBeGreaterThan(41 + 3);
    expect(problemsOf(m, { ...wide, partNumber: 8 }, GEO)).toEqual([]);
  });

  it("shrinks the digits to the room, and is left off under the least stroke", () => {
    const low = traySpec({
      key: "l:p0:0",
      w: 80,
      d: 50,
      h: 9,
      solid: true,
    });
    const e = planEngraving(planTray(low, GEO), 7);
    expect(e?.stroke).toBeCloseTo((9 - 0.4 - 1 - 1.5) / 5, 6);
    expect(e?.stroke).toBeGreaterThanOrEqual(ENGRAVE_STROKE_MIN_MM);
    const flat = { ...low, h: 6, key: "f:p0:0" };
    expect(planEngraving(planTray(flat, GEO), 7)).toBeNull();
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
      for (const n of [1, 10, 247]) {
        expect(problemsOf(m, { ...spec, partNumber: n }, GEO), `${name} ${n}`).toEqual([]);
      }
    }
  });

  it("changes nothing but the engraving: nothing grows, the volume only falls", () => {
    for (const spec of [plainBox, solidLeftover, openRiser, lippedLower]) {
      const plain = buildTray(m, spec, GEO);
      const numbered = buildTray(m, { ...spec, partNumber: 88 }, GEO);
      expect(numbered.volumeMm3).toBeLessThan(plain.volumeMm3);
      const a = bounds(plain.mesh);
      const b = bounds(numbered.mesh);
      expect(b.min).toEqual(a.min);
      expect(b.max).toEqual(a.max);
      const topo = topology(numbered.mesh);
      expect(topo.closed).toBe(true);
      expect(topo.genus).toBe(topology(plain.mesh).genus);
      expect(signedVolume(numbered.mesh)).toBeCloseTo(numbered.volumeMm3, 0);
      expect(checkPrintability(numbered.mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
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

describe("the digits read left to right, upright, from outside whichever face they are on", () => {
  const plan = { number: 2, stroke: 1.6, depth: 0.4, from: 20, z: 5, flipped: false };
  const part = { w: 100, d: 60, h: 30 };
  // the 2 of glyphs.ts, one cell per stroke: top, upper right, middle, lower left, bottom
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
    const spec = { ...merged([a, b]), partNumber: 21 };
    const plain = buildTray(m, { ...spec, partNumber: undefined }, settings);
    const numbered = buildTray(m, spec, settings);
    expect(numbered.volumeMm3).toBeLessThan(plain.volumeMm3);
    expect(topology(numbered.mesh).closed).toBe(true);
    expect(bounds(numbered.mesh)).toEqual(bounds(plain.mesh));
    expect(checkPrintability(printMesh(spec, numbered.mesh))).toMatchObject({
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
    const spec = { ...merged([ground, ledge]), partNumber: 5 };
    expect(spec.merged?.flipped).toBe(true);
    const plain = buildTray(m, { ...spec, partNumber: undefined }, settings);
    const numbered = buildTray(m, spec, settings);
    expect(numbered.volumeMm3).toBeLessThan(plain.volumeMm3);
    expect(topology(numbered.mesh).closed).toBe(true);
    const printed = printMesh(spec, numbered.mesh);
    expect(checkPrintability(printed)).toMatchObject({ ok: true, overhangTriangles: 0 });
    // the engraving's floor, as it prints, is 0.4 mm into the printed front face (y = 0 there)
    expect(onPlane(printed, 1, ENGRAVE_DEPTH_MM).length).toBeGreaterThan(0);
  });
});
