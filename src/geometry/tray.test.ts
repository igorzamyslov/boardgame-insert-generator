// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { TraySpec } from "../model/types";
import { minOuter, realizeTray, rotateRealized, size } from "../sizing";
import { minis, partOf } from "../sizing/test-helpers";
import type { RealizeOptions } from "../sizing/types";
import { loadManifold } from "./load";
import { buildTray } from "./tray";
import { checkPrintability } from "./printability";
import { TraySpecError, UnsupportedFeatureError } from "./errors";
import { bounds, heightAt, signedVolume, topology } from "./test-mesh";
import { thinnestWedge } from "./test-wedge";
import {
  GEO,
  slotStrip,
  compartment,
  customBlock,
  cutout,
  sidePockets,
  flatCutouts,
  floorHoles,
  hexTiles,
  lippedLower,
  loadFixture,
  miniPockets,
  notchedSpacer,
  plainBox,
  scoopBulk,
  slotBesideSlack,
  solidLeftover,
  spacer,
  spareLeftover,
  traySpec,
  traySpecFrom,
  upperLevel1,
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

  it("pocket strip: three wells, the two narrow ones' finger slots merged into one channel", () => {
    const { volumeMm3 } = expectWellFormed(slotStrip);
    const solidBlock = blockVolume(slotStrip.w, slotStrip.d, slotStrip.h, 3, 0.4);
    const wells = [24, 30, 15].reduce((sum, w) => sum + wellVolume(w, 92.5, 68), 0);
    // the reach bands are solid except for the slots, so the tray is heavier than block − wells·full
    expect(volumeMm3).toBeLessThan(solidBlock - wells);
    expect(volumeMm3).toBeGreaterThan(solidBlock - wells - 6 * 22 * 12 * (68 / 3));
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
  });

  it("a channel through a lipped tray interrupts the lip where it leaves the tray", () => {
    const spec = uprightChannelLipped;
    const { mesh } = expectWellFormed(spec, spec.h + GEO.lip.height);
    const at = 1.3 + 47.85;
    expect(heightAt(mesh, 0.3, at)).toBeCloseTo(spec.h - 34, 3);
    // The lip keeps its full height beside the channel, on the end walls and everywhere else.
    expect(heightAt(mesh, 0.3, at - 11 - 0.5)).toBeCloseTo(spec.h + 2, 3);
    expect(heightAt(mesh, 0.3, at + 11 + 0.5)).toBeCloseTo(spec.h + 2, 3);
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
    expect(heightAt(mesh, 0.8, at + 12)).toBeCloseTo(flatCutouts.h, 3);
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

  it("side pockets: full-depth slots on the left and right", () => {
    expectWellFormed(sidePockets);
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

  it("notched spacer: the channel runs on through it", () => {
    const { mesh, volumeMm3 } = expectWellFormed(notchedSpacer);
    const u = 22 * (29 - 11) + (Math.PI * 11 * 11) / 2;
    const expected = blockVolume(30, 92.5, 63, 3, 0.4) - 30 * u;
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.003);
    expect(heightAt(mesh, 15, 46.25)).toBeCloseTo(63 - 29, 3);
    expect(heightAt(mesh, 15, 20)).toBeCloseTo(63, 3);
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
  // have finger channels now; the pocket trays of that time stay as hand-written specs.
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

  it("cuts one channel per row of that tray, and the pocket tray of the time still builds", () => {
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
    expectWellFormed(slotBesideSlack, slotBesideSlack.h + GEO.lip.height);
  });
});

describe("well face regression (review rounds 2 and 4)", () => {
  // Pocket strips: a 22 mm slot used to end just past another well face, or a face to cut the
  // ridge of two merged slots just past its peak, leaving a feather inside the 0.5 mm overlap.
  // thinnestWedge measures it; checkPrintability does not see it. First found on unsleeved card
  // decks (before they got finger channels): the minis pockets here are as wide as those decks.
  const settings = DEFAULT_SETTINGS;
  const ground: RealizeOptions = { lipped: false, level: 0 };
  // Pocket widths of decks of 60, 120, 56 and 35 unsleeved cards.
  const width: Record<number, number> = { 60: 20.78, 120: 40.56, 56: 19.46, 35: 12.54 };
  const cases: [string, number[], number][] = [
    ["60 then 120 cards at minOuter", [60, 120], 0],
    ["120 then 56 cards, 7 mm wider", [120, 56], 7],
    // Review round 4: a well face just past the ridge peak of two merged slots.
    ["60, 35 and 60 cards, 3 mm wider", [60, 35, 60], 3],
  ];

  it.each(cases)("pockets as wide as decks of %s build printable", (_label, counts, slack) => {
    const figures = counts.map((count, i) => ({
      name: `D${i}`,
      w: (width[count] ?? 0) - 1,
      d: 88.5,
      h: 64,
      count: 1,
    }));
    const part = partOf([minis({ figures })], "standing|strip|split1");
    const min = minOuter(part, settings, ground);
    const outer = { ...min, w: min.w + slack };
    const spec = traySpecFrom(
      realizeTray(part, outer, settings, ground),
      outer,
      ground,
      settings,
      part.trayKey,
    );
    const report = checkPrintability(buildTray(m, spec, settings).mesh);
    expect(report.problems).toEqual([]);
    const wedge = thinnestWedge(spec, settings);
    expect(wedge.width, wedge.where).toBeGreaterThanOrEqual(0.8 - 0.01);
    expect(Number.isFinite(wedge.width)).toBe(true);
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
    for (const spec of [hexTiles, slotStrip, flatCutouts, scoopBulk, lippedLower, miniPockets]) {
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
