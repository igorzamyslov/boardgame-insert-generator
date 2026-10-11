// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import type { TraySpec } from "../model/types";
import { loadManifold } from "./load";
import { buildTray } from "./tray";
import { checkPrintability } from "./printability";
import { UnsupportedFeatureError } from "./errors";
import { bounds, signedVolume, topology } from "./test-mesh";
import {
  GEO,
  cardUpright,
  compartment,
  customBlock,
  flatCards,
  hexTiles,
  lippedLower,
  miniPockets,
  plainBox,
  scoopBulk,
  solidLeftover,
  spacer,
  spareLeftover,
  traySpec,
  upperLevel1,
} from "./test-specs";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

// Rounded-rectangle prism with a 45° bottom chamfer c (true circles):
// area A = w·d − (4 − π)R², perimeter P = 2(w + d) − (8 − 2π)R,
// chamfer removes P·c²/2 − π·c³/3.
function blockVolume(w: number, d: number, h: number, r: number, c: number): number {
  const area = w * d - (4 - Math.PI) * r * r;
  const perimeter = 2 * (w + d) - (8 - 2 * Math.PI) * r;
  return area * h - ((perimeter * c * c) / 2 - (Math.PI * c * c * c) / 3);
}

function wellVolume(w: number, d: number, depth: number): number {
  return (w * d - (4 - Math.PI) * 0.25) * depth;
}

function expectWellFormed(spec: TraySpec, topZ = spec.h) {
  const { mesh, volumeMm3 } = buildTray(m, spec, GEO);
  const topo = topology(mesh);
  expect(topo.closed).toBe(true);
  expect(topo.genus).toBe(0);
  const b = bounds(mesh);
  expect(b.min[0]).toBeCloseTo(0, 4);
  expect(b.min[1]).toBeCloseTo(0, 4);
  expect(b.min[2]).toBeCloseTo(0, 4);
  expect(b.max[0]).toBeCloseTo(spec.w, 3);
  expect(b.max[1]).toBeCloseTo(spec.d, 3);
  expect(b.max[2]).toBeCloseTo(topZ, 3);
  expect(signedVolume(mesh)).toBeCloseTo(volumeMm3, 0);
  const report = checkPrintability(mesh);
  expect(report.problems).toEqual([]);
  expect(report.ok).toBe(true);
  expect(report.overhangTriangles).toBe(0);
  expect(report.minFeatureMm).toBeGreaterThanOrEqual(0.8 - 1e-3);
  return { mesh, volumeMm3, report };
}

describe("buildTray per tray type", () => {
  it("plain box: volume = block − well", () => {
    const { volumeMm3 } = expectWellFormed(plainBox);
    const expected = blockVolume(100, 60, 30, 3, 0.4) - wellVolume(96.8, 56.8, 28.8);
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.002);
  });

  it("upright cards: three decks, finger slots crossing into the neighbour deck", () => {
    const { volumeMm3 } = expectWellFormed(cardUpright);
    const solidBlock = blockVolume(cardUpright.w, cardUpright.d, cardUpright.h, 3, 0.4);
    const wells = [24, 30, 15].reduce((sum, w) => sum + wellVolume(w, 92.5, 68), 0);
    // the reach bands are solid except for the slots, so the tray is heavier than block − wells·full
    expect(volumeMm3).toBeLessThan(solidBlock - wells);
    expect(volumeMm3).toBeGreaterThan(solidBlock - wells - 6 * 22 * 12 * (68 / 3));
  });

  it("flat cards: full-depth slots on both short sides", () => {
    expectWellFormed(flatCards);
  });

  it("scoop bulk: fillets add r²(1 − π/4) per mm of wall", () => {
    const { volumeMm3 } = expectWellFormed(scoopBulk);
    const fillets = 3 * 144 * (1 - Math.PI / 4) * 40;
    const expected =
      blockVolume(scoopBulk.w, 60, 30, 3, 0.4) - 3 * wellVolume(40, 56.8, 28.8) + fillets;
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.003);
  });

  it("hex tiles: corner reliefs keep every wall and divider ≥ 0.8 mm", () => {
    const { volumeMm3 } = expectWellFormed(hexTiles);
    const plain =
      blockVolume(hexTiles.w, hexTiles.d, hexTiles.h, 3, 0.4) - 2 * wellVolume(47.2, 41, 31);
    expect(volumeMm3).toBeLessThan(plain);
  });

  it("minis pockets: raised floors stay solid", () => {
    const { volumeMm3 } = expectWellFormed(miniPockets);
    const noRaise =
      blockVolume(miniPockets.w, miniPockets.d, miniPockets.h, 3, 0.4) - 3 * wellVolume(30, 30, 40);
    // raised floors add 10 and 20 mm of solid under two pockets
    expect(volumeMm3 - noRaise).toBeGreaterThan(30 * 30 * 30 * 0.95);
  });

  it("custom block: reliefs plus one full-depth pocket", () => {
    expectWellFormed(customBlock);
  });

  it("spare leftover: one open compartment", () => {
    const { volumeMm3 } = expectWellFormed(spareLeftover);
    const expected = blockVolume(40, 70, 30, 3, 0.4) - wellVolume(36.8, 66.8, 28.8);
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.002);
  });

  it("solid leftover and spacer: closed blocks", () => {
    const solid = expectWellFormed(solidLeftover);
    expect(
      Math.abs(solid.volumeMm3 - blockVolume(20, 70, 30, 3, 0.4)) / solid.volumeMm3,
    ).toBeLessThan(0.002);
    const sp = expectWellFormed(spacer);
    expect(Math.abs(sp.volumeMm3 - blockVolume(92.5, 8, 63, 3, 0.4)) / sp.volumeMm3).toBeLessThan(
      0.002,
    );
  });

  it("lipped lower tray: lip adds height and a chamfered ring", () => {
    const { volumeMm3 } = expectWellFormed(lippedLower, 27);
    const t = 1.2;
    const ch = 0.6;
    const perimeter = 2 * (100 + 60) - (8 - 2 * Math.PI) * 3;
    const ringArea = perimeter * t - Math.PI * t * t;
    const chamfer = ((ch * ch) / 2) * (perimeter - 2 * Math.PI * (t - ch / 3));
    const expected =
      blockVolume(100, 60, 25, 3, 0.4) - wellVolume(94.2, 54.2, 23.8) + ringArea * 2 - chamfer;
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.002);
  });

  it("level-1 upper tray: 0.5 mm bottom chamfer", () => {
    const { volumeMm3 } = expectWellFormed(upperLevel1);
    const expected = blockVolume(97.1, 57.1, 20, 3, 0.5) - wellVolume(93.9, 53.9, 18.8);
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.002);
  });
});

describe("buildTray review focus", () => {
  it("thin walls (1.2 mm) still keep ≥ 0.8 mm at the rounded corners", () => {
    const thin = traySpec({
      key: "thin-wall",
      wall: 1.2,
      w: 60,
      d: 40,
      h: 20,
      compartments: [
        compartment({
          x: 1.2,
          y: 1.2,
          w: 57.6,
          d: 37.6,
          features: [{ type: "cornerRelief", d: 3 }],
        }),
      ],
    });
    expectWellFormed(thin);
  });

  it("a 0.3 mm divider builds but is reported as too thin", () => {
    const spec = traySpec({
      key: "thin-divider",
      w: 1.6 + 40 + 0.3 + 40 + 1.6,
      d: 40,
      h: 20,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 40, d: 36.8 }),
        compartment({ x: 41.9, y: 1.6, w: 40, d: 36.8 }),
      ],
    });
    const { mesh } = buildTray(m, spec, GEO);
    expect(topology(mesh).closed).toBe(true);
    const report = checkPrintability(mesh);
    expect(report.ok).toBe(false);
    expect(report.minFeatureMm).toBeCloseTo(0.3, 2);
    expect(report.problems.join(" ")).toMatch(/0\.300 mm/);
  });

  it("a shallow scoop tray keeps its height (radius clamped to the depth)", () => {
    expectWellFormed({ ...scoopBulk, h: 8 });
  });

  it("unknown features from a newer app throw UnsupportedFeatureError", () => {
    const spec = {
      ...plainBox,
      compartments: [
        { ...compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8 }), features: [{ type: "magnet" }] },
      ],
    } as unknown as TraySpec;
    expect(() => buildTray(m, spec, GEO)).toThrow(UnsupportedFeatureError);
  });

  it("does not leak WASM memory across many builds", () => {
    for (let i = 0; i < 30; i += 1) {
      buildTray(m, hexTiles, GEO);
    }
    expect(() => buildTray(m, scoopBulk, GEO)).not.toThrow();
  });
});
