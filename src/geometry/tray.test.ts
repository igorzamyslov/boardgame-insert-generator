// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { TraySpec } from "../model/types";
import { minOuter, realizeTray, rotateRealized, size } from "../sizing";
import { cards, partOf } from "../sizing/test-helpers";
import type { RealizeOptions } from "../sizing/types";
import { loadManifold } from "./load";
import { buildTray } from "./tray";
import { checkPrintability } from "./printability";
import { UnsupportedFeatureError } from "./errors";
import { bounds, signedVolume, topology } from "./test-mesh";
import { thinnestWedge } from "./test-wedge";
import {
  GEO,
  cardUpright,
  compartment,
  customBlock,
  flatCards,
  hexTiles,
  lippedLower,
  loadFixture,
  miniPockets,
  plainBox,
  scoopBulk,
  slotBesideSlack,
  solidLeftover,
  spacer,
  spareLeftover,
  traySpec,
  traySpecFrom,
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

  it("upright cards: three decks, the two narrow ones sharing one finger channel", () => {
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
});

describe("finger slot clearance regression (plan 3)", () => {
  // cards-heavy, part fxcrd003:p0:0: "Goals ×45" beside the slack of its row. Sizing used to put
  // a spare compartment 0.03 mm inside the deck's 22 mm slot, leaving a 0.04 mm feather.
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

  it("sizing emits the hand-written tray, which builds printable", () => {
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
    expect(spec).toEqual(slotBesideSlack);
    expectWellFormed(slotBesideSlack, slotBesideSlack.h + GEO.lip.height);
  });
});

describe("well face regression (review rounds 2 and 4)", () => {
  // Decks, sleeve "none", in one strip: a 22 mm slot used to end just past another deck's well
  // face, or a face to cut the ridge of two merged slots just past its peak, leaving a feather
  // inside the 0.5 mm overlap. thinnestWedge measures it; checkPrintability does not see it.
  const settings = DEFAULT_SETTINGS;
  const ground: RealizeOptions = { lipped: false, level: 0 };
  const cases: [string, number[], number][] = [
    ["60 then 120 cards at minOuter", [60, 120], 0],
    ["120 then 56 cards, 7 mm wider", [120, 56], 7],
    // Review round 4: a well face just past the ridge peak of two merged slots.
    ["60, 35 and 60 cards, 3 mm wider", [60, 35, 60], 3],
  ];

  it.each(cases)("%s builds printable", (_label, counts, slack) => {
    const part = partOf(
      [
        cards({
          sleeve: "none",
          decks: counts.map((count, i) => ({ name: `D${i}`, count })),
        }),
      ],
      "upright-long|strip|split1",
    );
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
    for (const spec of [hexTiles, cardUpright, scoopBulk, lippedLower, miniPockets]) {
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
