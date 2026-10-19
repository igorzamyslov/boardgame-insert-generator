// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { printMesh } from "../app/exportBuild";
import { mergeParts } from "../layout/merge";
import { TEST_PRINTER, traySpec } from "../layout/test-utils";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import { loadManifold } from "./load";
import { checkPrintability } from "./printability";
import { bounds, signedVolume, topology } from "./test-mesh";
import { buildTray } from "./tray";

// A merged part (mergeParts) is built from its members and the bridges that fill the tray gaps
// between them: one closed solid of the bounding box's size, printable as it stands (or, when its
// members stand on different floors, turned upside down) without a single overhang.
let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

const WALL = 1.6;
const FLOOR = 1.2;
const GAP = DEFAULT_SETTINGS.trayGap;
// Rim off: a filler in a stack level has a groove with it on, and is not merged.
const settings: Settings = {
  ...DEFAULT_SETTINGS,
  lip: { ...DEFAULT_SETTINGS.lip, enabled: false },
  mergeRisers: true,
};

const filler = (o: Partial<TraySpec> = {}): TraySpec =>
  traySpec({
    key: "leftover:0",
    part: "leftover",
    path: "0",
    stack: 5,
    h: 35,
    wall: WALL,
    floor: FLOOR,
    solid: true,
    ...o,
  });

const open = (o: Partial<TraySpec> = {}): TraySpec => {
  const f = filler({ solid: false, ...o });
  return {
    ...f,
    compartments: [
      {
        x: WALL,
        y: WALL,
        w: f.w - 2 * WALL,
        d: f.d - 2 * WALL,
        floorZ: FLOOR,
        kind: "spare",
        contents: "",
        features: [],
      },
    ],
  };
};

const riser = (o: Partial<TraySpec> = {}): TraySpec =>
  open({ key: "a:p0:0:riser", part: "riser", path: "", stack: 0, w: 90, d: 60, h: 16.4, ...o });

/** The one merged part of `parts`, built; the mesh as it prints. */
function built(parts: TraySpec[]) {
  const out = mergeParts(parts, { settings, printer: TEST_PRINTER });
  const spec = out.find((p) => p.merged) as TraySpec;
  expect(spec).toBeDefined();
  const { mesh, volumeMm3 } = buildTray(m, spec, settings);
  return { spec, mesh, volumeMm3, printed: printMesh(spec, mesh) };
}

function expectsBuilt(spec: TraySpec, mesh: ReturnType<typeof buildTray>["mesh"]): void {
  const topo = topology(mesh);
  expect(topo.closed).toBe(true);
  const b = bounds(mesh);
  const size = [spec.w, spec.d, spec.h];
  b.max.forEach((v, k) => expect(v).toBeCloseTo(size[k] ?? 0, 2));
  b.min.forEach((v) => expect(v).toBeCloseTo(0, 3));
}

describe("a merged part builds", () => {
  it("two solid strips across the tray gap: one closed solid that prints as it stands", () => {
    const a = filler({ key: "leftover:0", x: 90.2, y: 0, w: 10, d: 100 });
    const b = filler({ key: "leftover:1", x: 90.2, y: 100 + GAP, w: 10, d: 80, stack: 6 });
    const { spec, mesh, volumeMm3, printed } = built([a, b]);
    expectsBuilt(spec, mesh);
    expect(signedVolume(mesh)).toBeCloseTo(volumeMm3, 0);
    // the strips and the gap between them (rounded corners take a little off each end)
    expect(volumeMm3).toBeGreaterThan(10 * 180.2 * 35 * 0.97);
    expect(volumeMm3).toBeLessThanOrEqual(10 * 180.2 * 35);
    expect(spec.merged?.flipped).toBe(false);
    expect(checkPrintability(printed)).toMatchObject({ ok: true, overhangTriangles: 0 });
  });

  it("two open spare trays: the pockets stay, and nothing hangs", () => {
    const a = open({ key: "leftover:0", x: 0, y: 0, w: 60, d: 40 });
    const b = open({ key: "leftover:1", x: 60 + GAP, y: 0, w: 50, d: 40, stack: 6 });
    const { spec, mesh, volumeMm3, printed } = built([a, b]);
    expectsBuilt(spec, mesh);
    // far lighter than the solid block of the same size
    expect(volumeMm3).toBeLessThan(0.3 * 110.2 * 40 * 35);
    expect(checkPrintability(printed).ok).toBe(true);
  });

  it("a riser and a full-height filler: an L in elevation that stands and self-supports", () => {
    const f = filler({ key: "leftover:0", x: 90 + GAP, y: 0, w: 10, d: 60 });
    const { spec, mesh, printed } = built([riser(), f]);
    expectsBuilt(spec, mesh);
    expect(spec.merged?.members.map((p) => p.part)).toEqual(["riser", "leftover"]);
    expect(spec.merged?.flipped).toBe(false);
    // the wall stands the whole height; over the riser the part is 16.4 mm high
    const top = (from: number, to: number): number => {
      let z = 0;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i] ?? 0;
        if (x >= from && x <= to) {
          z = Math.max(z, mesh.positions[i + 2] ?? 0);
        }
      }
      return z;
    };
    expect(top(91, 101)).toBeCloseTo(35, 3);
    expect(top(0, 89)).toBeCloseTo(16.4, 3);
    expect(checkPrintability(printed)).toMatchObject({ ok: true, overhangTriangles: 0 });
  });

  it("a ledge filler in a stack level joins a ground one: printed upside down it self-supports", () => {
    const ground = filler({ key: "leftover:0", x: 0, y: 8.4 + GAP, w: 90, d: 8 });
    const ledge = filler({
      key: "leftover:1",
      x: 0,
      y: 0,
      w: 90,
      d: 8.4,
      z: 28.4,
      h: 6.6,
      level: 1,
      stack: 0,
    });
    const { spec, mesh, printed } = built([ground, ledge]);
    expectsBuilt(spec, mesh);
    expect(spec.merged?.flipped).toBe(true);
    // upside down, its top face (z = 35) is on the bed, and nothing overhangs
    const flipped = bounds(printed);
    expect(flipped.min[2]).toBeCloseTo(0, 3);
    expect(flipped.max[2]).toBeCloseTo(35, 3);
    expect(checkPrintability(printed)).toMatchObject({ ok: true, overhangTriangles: 0 });
    // as it stands, the ledge does hang: that is why it prints the other way up
    expect(checkPrintability(mesh).overhangTriangles).toBeGreaterThan(0);
  });

  it("a comb whose members have rounded corners leaves no fin in the notch between them", () => {
    // Four strips round a corner: the bridges must reach into the members, or each end of a
    // bridge would stand free in the notch between two rounded corners, 0.2 mm thick.
    const a = filler({ key: "leftover:0", x: 91.59, y: 0, w: 8.71, d: 100.12 });
    const b = filler({ key: "leftover:1", x: 0, y: 91.59, w: 91.45, d: 8.53, stack: 6 });
    const c = filler({ key: "leftover:2", x: 91.59, y: 100.26, w: 8.71, d: 94.04, stack: 7 });
    const { spec, mesh, printed } = built([a, b, c]);
    expect(spec.merged?.members).toHaveLength(3);
    expectsBuilt(spec, mesh);
    const report = checkPrintability(printed);
    expect(report.problems).toEqual([]);
    expect(report.minFeatureMm).toBeGreaterThan(2);
  });
});
