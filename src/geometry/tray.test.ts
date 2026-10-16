// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import type { TraySpec } from "../model/types";
import { grooveOf } from "../model/lip";
import type { Groove } from "../model/lip";
import { MIN_SEPARATOR } from "../sizing/constants";
import { minOuter, realizeTray, rotateRealized, size } from "../sizing";
import type { RealizeOptions } from "../sizing/types";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { buildTray } from "./tray";
import { checkPrintability } from "./printability";
import { TraySpecError, UnsupportedFeatureError } from "./errors";
import { bounds, heightAt, signedVolume, topology } from "./test-mesh";
import {
  GEO,
  compartment,
  customBlock,
  cutout,
  flatCutouts,
  floorHoles,
  hexTiles,
  lippedLower,
  loadFixture,
  miniPockets,
  notchedSpacer,
  plainBox,
  scoopBulk,
  openRiser,
  solidLeftover,
  solidRiser,
  spacer,
  spareLeftover,
  traySpec,
  traySpecFrom,
  upperLevel1,
  lippedThickWall,
  uprightChannel,
  uprightChannelLipped,
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
  expect(topo.genus).toBe(floorHoles(spec, GEO));
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

  it("upright cards: one channel, half the wells deep, through both end walls and every divider", () => {
    const { mesh, volumeMm3 } = expectWellFormed(uprightChannel);
    const { w, d, h } = uprightChannel;
    const wells = [24, 30, 15].reduce((sum, x) => sum + wellVolume(x, 92.5, 68), 0);
    // The U (22 wide, its round bottom 34 below the rim) through 5.6 mm of walls and dividers.
    const u = 22 * (34 - 11) + (Math.PI * 11 * 11) / 2;
    const expected = blockVolume(w, d, h, 3, 0.4) - wells - 5.6 * u;
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.003);
    // Centred on the card length (y 47.85), the channel's bottom is 35.2 mm up.
    for (const x of [0.8, 26.2, 57.4, 73.8]) {
      expect(heightAt(mesh, x, 47.85), `x ${x}`).toBeCloseTo(h - 34, 3);
      expect(heightAt(mesh, x, 30), `x ${x}`).toBeCloseTo(h, 3);
    }
    // Front and back walls stay whole.
    expect(heightAt(mesh, 40, 0.8)).toBeCloseTo(h, 3);
    // The U's top corners are rounded with 3 mm across the whole wall (the opening is 28 mm wide
    // at the rim), its vertical edges are not: 0.1 mm beside the side the top stands 2.23 mm below
    // the rim on the outer face and on the well's face alike, 3 mm beside it at the rim.
    const side = 47.85 - 11;
    const dip = 3 - Math.sqrt(3 * 3 - 2.9 * 2.9);
    for (const x of [0.05, 0.8, 1.55]) {
      expect(heightAt(mesh, x, side - 0.1), `x ${x}`).toBeCloseTo(h - dip, 1);
      expect(heightAt(mesh, x, side - 3.05), `x ${x}`).toBeCloseTo(h, 3);
    }
    // Below the fillet the side is straight down to the round bottom.
    expect(heightAt(mesh, 0.8, side + 0.05)).toBeLessThan(h - 3);
  });

  it("a channel through a lipped tray interrupts the lip where it leaves the tray", () => {
    const spec = uprightChannelLipped;
    const { mesh } = expectWellFormed(spec, spec.h + GEO.lip.height);
    const at = 1.3 + 47.85;
    expect(heightAt(mesh, 0.3, at)).toBeCloseTo(spec.h - 34, 3);
    // The lip's top corners are rounded with its 2 mm height; past them it keeps its full height,
    // on the end walls and everywhere else. The ledge beside the lip stays square at the rim.
    expect(heightAt(mesh, 0.3, at - 11 - 0.1)).toBeLessThan(spec.h + 1);
    expect(heightAt(mesh, 0.3, at - 11 - 2.05)).toBeCloseTo(spec.h + 2, 3);
    expect(heightAt(mesh, 0.3, at + 11 + 2.05)).toBeCloseTo(spec.h + 2, 3);
    expect(heightAt(mesh, 2, at - 11 - 0.1)).toBeCloseTo(spec.h, 3);
    expect(heightAt(mesh, 40, 0.3)).toBeCloseTo(spec.h + 2, 3);
  });

  it("flat cards: half-round cutouts that go on down through the floor at their full width", () => {
    const { mesh } = expectWellFormed(flatCutouts);
    const at = 1.6 + 92.5 / 2;
    // Through the wall the whole 22 mm of the cut is open down to the bed…
    for (const y of [at, at - 10.5, at + 10.5]) {
      expect(heightAt(mesh, 0.8, y), `y ${y}`).toBe(Number.NEGATIVE_INFINITY);
      expect(heightAt(mesh, 71.2 - 0.8, y), `y ${y}`).toBe(Number.NEGATIVE_INFINITY);
    }
    expect(heightAt(mesh, 0.8, at + 14.05)).toBeCloseTo(flatCutouts.h, 3);
    // …and it notches the floor with a half-disc of its width, 11 mm into the floor.
    for (const [x, y] of [
      [1.6 + 5, at - 9],
      [1.6 + 5, at + 9],
      [71.2 - 1.6 - 5, at - 9],
      [71.2 - 1.6 - 5, at + 9],
      [1.6 + 10.5, at],
    ] as const) {
      expect(heightAt(mesh, x, y), `${x}, ${y}`).toBe(Number.NEGATIVE_INFINITY);
    }
    expect(heightAt(mesh, 1.6 + 6, at + 10)).toBeCloseTo(1.2, 3);
    expect(heightAt(mesh, 1.6 + 11.5, at)).toBeCloseTo(1.2, 3);
  });

  it("a floor notch reaching past half the cut's width: straight sides, then the half-round", () => {
    const at = 1.6 + 92.5 / 2;
    const long = {
      ...flatCutouts,
      compartments: flatCutouts.compartments.map((c) => ({
        ...c,
        features: [cutout("left", at, 20, 15), cutout("right", at, 20, 15)],
      })),
    };
    const { mesh } = expectWellFormed(long);
    for (const [x, y] of [
      [1.6 + 2, at + 10.5],
      [1.6 + 14, at],
      [1.6 + 4 + 7, at - 7],
    ] as const) {
      expect(heightAt(mesh, x, y), `${x}, ${y}`).toBe(Number.NEGATIVE_INFINITY);
    }
    expect(heightAt(mesh, 1.6 + 4 + 8, at + 8)).toBeCloseTo(1.2, 3);
    expect(heightAt(mesh, 1.6 + 15.5, at)).toBeCloseTo(1.2, 3);
  });

  it("flat tiles cut through the front and back: the same notch, turned", () => {
    const turned = traySpec({
      key: "flat-front-back:p0:0",
      w: flatCutouts.d,
      d: flatCutouts.w,
      h: flatCutouts.h,
      compartments: [
        compartment({
          x: 1.6,
          y: 1.6,
          w: 92.5,
          d: 68,
          features: [cutout("front", 47.85, 20, 11), cutout("back", 47.85, 20, 11)],
        }),
      ],
    });
    const { mesh } = expectWellFormed(turned);
    for (const [x, y] of [
      [47.85 + 10.5, 0.8],
      [47.85 - 9, 1.6 + 5],
      [47.85 + 9, 1.6 + 5],
      [47.85 - 9, 71.2 - 1.6 - 5],
      [47.85, 71.2 - 1.6 - 10.5],
    ] as const) {
      expect(heightAt(mesh, x, y), `${x}, ${y}`).toBe(Number.NEGATIVE_INFINITY);
    }
    expect(heightAt(mesh, 47.85 + 10, 1.6 + 6)).toBeCloseTo(1.2, 3);
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

  it("minis pockets: raised floors stay solid, each pocket cut through the front wall", () => {
    const { volumeMm3 } = expectWellFormed(miniPockets);
    const noRaise =
      blockVolume(miniPockets.w, miniPockets.d, miniPockets.h, 3, 0.4) - 3 * wellVolume(30, 30, 40);
    // Raised floors add 10 and 20 mm of solid under two pockets; the cuts take a little of the
    // front wall.
    expect(volumeMm3 - noRaise).toBeGreaterThan(30 * 30 * 30 * 0.9);
    expect(volumeMm3 - noRaise).toBeLessThan(30 * 30 * 30);
  });

  it("custom block: reliefs plus a cut through the front wall", () => {
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

  it("risers: an open walled box and a solid block, both with the level 0 chamfer", () => {
    const open = expectWellFormed(openRiser);
    const expected = blockVolume(100, 80, 20, 3, 0.4) - wellVolume(96.8, 76.8, 18.8);
    expect(Math.abs(open.volumeMm3 - expected) / expected).toBeLessThan(0.002);
    const solid = expectWellFormed(solidRiser);
    expect(
      Math.abs(solid.volumeMm3 - blockVolume(100, 80, 20, 3, 0.4)) / solid.volumeMm3,
    ).toBeLessThan(0.002);
  });

  it("notched spacer: the channel runs on through it", () => {
    const { mesh, volumeMm3 } = expectWellFormed(notchedSpacer);
    const u = 22 * (29 - 11) + (Math.PI * 11 * 11) / 2;
    const expected = blockVolume(30, 92.5, 63, 3, 0.4) - 30 * u;
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.003);
    expect(heightAt(mesh, 15, 46.25)).toBeCloseTo(63 - 29, 3);
    expect(heightAt(mesh, 15, 20)).toBeCloseTo(63, 3);
  });

  it("a spacer plate as thin as MIN_SEPARATOR builds, notch and all", () => {
    const plate: TraySpec = { ...notchedSpacer, key: "cards:p0:0:spacer:1", w: MIN_SEPARATOR };
    const { mesh, volumeMm3 } = expectWellFormed(plate);
    const u = 22 * (29 - 11) + (Math.PI * 11 * 11) / 2;
    const expected = blockVolume(MIN_SEPARATOR, 92.5, 63, 3, 0.4) - MIN_SEPARATOR * u;
    // The plate is thinner than the plain 3 mm corner radius, which sizing shrinks to fit, so it
    // holds a little more than the ideal block: a couple of percent, never less.
    expect(volumeMm3 / expected).toBeGreaterThan(0.999);
    expect(volumeMm3 / expected).toBeLessThan(1.03);
    expect(heightAt(mesh, MIN_SEPARATOR / 2, 46.25)).toBeCloseTo(63 - 29, 3);
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

  it("level-1 upper tray: flush, with the groove for the lip under its outer edge", () => {
    const { volumeMm3 } = expectWellFormed(upperLevel1);
    // The groove (in from the outer face u: 1.95 − z up the 0.5 foot chamfer, 1.45 up the inner
    // wall to 1.4, 2.85 − z up the roof) removes ∫ (P·u − π·u²) dz from the block.
    const g = grooveOf(GEO, 1);
    expect(g).toEqual({ inset: 1.45, foot: 0.5, zIn: 1.4, zTop: 2.85, reach: 1.95 });
    const { inset, foot, zIn, reach } = g as Groove;
    const perimeter = 2 * (100 + 60) - (8 - 2 * Math.PI) * 3;
    const removed =
      perimeter * (reach * foot - (foot * foot) / 2) -
      (Math.PI * (reach ** 3 - inset ** 3)) / 3 +
      (perimeter * inset - Math.PI * inset * inset) * (zIn - foot) +
      (perimeter * inset ** 2) / 2 -
      (Math.PI * inset ** 3) / 3;
    const expected = blockVolume(100, 60, 20, 3, 0) - removed - wellVolume(94.88, 54.88, 18.8);
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.002);
  });
});

describe("finger cuts keep their posts clear of a well's rounded inner corners", () => {
  // A 22 mm cut through both end walls of a well 22 + 2·post mm long. With posts under 3 mm its
  // sides came within the 0.5 mm rounded inner corners and left slivers of them (review 1, C1;
  // review 2, C1′ with a floor notch): planTray refuses them, and from 3 mm on nothing is left.
  const spec = (post: number, notch: number) => {
    const length = 22 + 2 * post;
    return traySpec({
      key: "corner:p0:0",
      w: 1.6 + 30 + 1.6,
      d: 1.6 + length + 1.6,
      h: 1.2 + 20,
      compartments: [
        compartment({
          x: 1.6,
          y: 1.6,
          w: 30,
          d: length,
          features: [
            cutout("left", 1.6 + length / 2, 20, notch),
            cutout("right", 1.6 + length / 2, 20, notch),
          ],
        }),
      ],
    });
  };
  it.each([0, 0.25, 0.5, 2.9])("refuses a %d mm post", (post) => {
    expect(() => planTray(spec(post, 0), GEO)).toThrow(/less than a 3 mm post/);
  });
  it.each([
    [3, 0],
    [3, 11],
    [3.5, 11],
  ])("builds a %d mm post cleanly (floor notch %d)", (post, notch) => {
    expectWellFormed(spec(post, notch));
  });
});

describe("a channel leaving a lipped tray through a thick wall", () => {
  it("rounds the lip's top corners beside the cut, keeping it printable", () => {
    // Its sides lie 5.9 mm from the outer faces, past the 3 mm posts.
    expectWellFormed(lippedThickWall, lippedThickWall.h + GEO.lip.height);
  });
});

describe("a floor-notched cut into a compartment with a lower floor", () => {
  it("leaves no sliver of that compartment's rounded corners", () => {
    // A raised well (floor 30.8) cut on its right through the divider into a spare (floor 0.8):
    // when the cut was as long as both, slivers of the spare's corners stayed under the well's
    // floor (0.018 mm); its 3 mm posts keep them whole.
    const spec = traySpec({
      key: "raised:p0:0",
      wall: 0.9,
      floor: 0.8,
      w: 47.8,
      d: 19.6,
      h: 60,
      compartments: [
        compartment({
          x: 1.8,
          y: 1.8,
          w: 16,
          d: 16,
          floorZ: 30.8,
          features: [cutout("right", 9.8, 29.2, 7.6, 10)],
        }),
        compartment({ x: 18.6, y: 1.8, w: 27.4, d: 16, floorZ: 0.8, kind: "spare" }),
      ],
    });
    expectWellFormed(spec);
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

  it("refuses a 0.3 mm divider instead of building it", () => {
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
    expect(() => buildTray(m, spec, GEO)).toThrow(TraySpecError);
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
});

describe("finger slot clearance regression (plan 3)", () => {
  // cards-heavy, part fxcrd003:p0:0: "Goals ×45" beside the slack of its row. Sizing used to put
  // a spare compartment 0.03 mm inside the deck's 22 mm slot, leaving a 0.04 mm feather. The decks
  // have finger channels now.
  const { components, settings } = loadFixture(cardsHeavy);
  const part = (variantId: string) => {
    const found = size(components, settings)
      .requirements.flatMap((req) => req.variants)
      .filter((v) => v.id === variantId)
      .flatMap((v) => v.parts)
      .find((p) => p.trayKey === "fxcrd003:p0:0");
    if (found === undefined) {
      throw new Error(`no part fxcrd003:p0:0 in ${variantId}`);
    }
    return found;
  };
  const cases: [string, RealizeOptions][] = [
    "upright-long|rows2|split1",
    "upright-short|rows2|split1",
  ].flatMap((id) => [
    [id, { lipped: true, level: 0 }],
    [id, { lipped: true, level: 1 }],
  ]);

  it.each(cases)("%s %o at minOuter + 10 builds printable, plain and rotated", (id, opts) => {
    const p = part(id);
    const min = minOuter(p, settings, opts);
    const outer = { w: min.w + 10, d: min.d + 10, h: min.h + 10 };
    const realized = realizeTray(p, outer, settings, opts);
    const turned = rotateRealized(realized, outer);
    for (const spec of [
      traySpecFrom(realized, outer, opts, settings, p.trayKey),
      traySpecFrom(turned, { w: outer.d, d: outer.w, h: outer.h }, opts, settings, p.trayKey),
    ]) {
      const report = checkPrintability(buildTray(m, spec, settings).mesh);
      expect(report.problems).toEqual([]);
      expect(report.minFeatureMm).toBeGreaterThanOrEqual(0.8 - 1e-3);
    }
  });

  it("cuts one channel per row of that tray", () => {
    const opts: RealizeOptions = { lipped: true, level: 0 };
    const p = part("upright-long|rows2|split1");
    const min = minOuter(p, settings, opts);
    const outer = { w: min.w + 10, d: min.d + 10, h: min.h + 10 };
    const spec = traySpecFrom(
      realizeTray(p, outer, settings, opts),
      outer,
      opts,
      settings,
      p.trayKey,
    );
    const decks = spec.compartments.filter((c) => c.kind === "well");
    expect(decks.map((c) => c.features.map((f) => f.type))).toEqual([
      ["wallCutout", "wallCutout"],
      ["wallCutout", "wallCutout"],
    ]);
    expectWellFormed(spec, spec.h + GEO.lip.height);
  });
});

describe("WASM handles", () => {
  interface Handle {
    isDeleted(): boolean;
  }

  function isHandle(value: unknown): value is Handle {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { isDeleted?: unknown }).isDeleted === "function"
    );
  }

  // Runs `run` with every Manifold static and instance method wrapped, so each handle the kernel
  // returns is recorded; returns them. The wrappers are removed again even if `run` throws.
  function recordHandles(run: () => void): Set<Handle> {
    const statics = m.Manifold as unknown as Record<string, unknown>;
    const probe = m.Manifold.cube([1, 1, 1]);
    const methods = Object.getPrototypeOf(probe) as Record<string, unknown>;
    probe.delete();
    const handles = new Set<Handle>();
    const restore: (() => void)[] = [];
    const wrap = (target: Record<string, unknown>, name: string): void => {
      const original = target[name];
      if (name === "constructor" || name === "prototype" || typeof original !== "function") {
        return;
      }
      target[name] = function (this: unknown, ...args: unknown[]): unknown {
        const result: unknown = Reflect.apply(original, this, args);
        if (isHandle(result)) {
          handles.add(result);
        }
        return result;
      };
      restore.push(() => {
        target[name] = original;
      });
    };
    try {
      Object.getOwnPropertyNames(statics).forEach((name) => {
        wrap(statics, name);
      });
      Object.getOwnPropertyNames(methods).forEach((name) => {
        wrap(methods, name);
      });
      run();
    } finally {
      restore.forEach((undo) => {
        undo();
      });
    }
    return handles;
  }

  function live(handles: Set<Handle>): number {
    return [...handles].filter((h) => !h.isDeleted()).length;
  }

  it("records handles created outside a build as live", () => {
    let outside: { delete(): void } | undefined;
    const handles = recordHandles(() => {
      outside = m.Manifold.cube([1, 1, 1]);
    });
    expect(live(handles)).toBe(1);
    outside?.delete();
    expect(live(handles)).toBe(0);
  });

  it("deletes every handle of a build", () => {
    for (const spec of [
      hexTiles,
      uprightChannel,
      flatCutouts,
      scoopBulk,
      lippedLower,
      miniPockets,
    ]) {
      const handles = recordHandles(() => {
        buildTray(m, spec, GEO);
      });
      expect(handles.size, spec.key).toBeGreaterThan(3);
      expect(live(handles), spec.key).toBe(0);
    }
  });

  it("deletes every handle when a kernel call throws mid-build", () => {
    const statics = m.Manifold as unknown as { union: (...args: unknown[]) => unknown };
    const handles = recordHandles(() => {
      const union = statics.union;
      let calls = 0;
      statics.union = function (this: unknown, ...args: unknown[]): unknown {
        calls += 1;
        if (calls === 3) {
          throw new Error("kernel failure");
        }
        return Reflect.apply(union, this, args);
      };
      try {
        expect(() => buildTray(m, hexTiles, GEO)).toThrow("kernel failure");
      } finally {
        statics.union = union;
      }
    });
    expect(handles.size).toBeGreaterThan(3);
    expect(live(handles)).toBe(0);
  });

  it("deletes every handle when the result is not a valid manifold", () => {
    const probe = m.Manifold.cube([1, 1, 1]);
    const methods = Object.getPrototypeOf(probe) as { status: () => string };
    probe.delete();
    const handles = recordHandles(() => {
      const status = methods.status;
      methods.status = () => "NotManifold";
      try {
        expect(() => buildTray(m, plainBox, GEO)).toThrow(
          "Tray plain:p0:0: geometry kernel failed (NotManifold)",
        );
      } finally {
        methods.status = status;
      }
    });
    expect(handles.size).toBeGreaterThan(3);
    expect(live(handles)).toBe(0);
  });
});
