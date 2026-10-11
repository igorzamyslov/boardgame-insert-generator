// TraySpec fixtures for geometry and export tests, one per tray type.
// Numbers follow spec §6/§7.1 with the geometry settings pinned in GEO.
import type {
  CompartmentSpec,
  Component,
  FeatureSpec,
  Settings,
  Side,
  TraySpec,
} from "../model/types";
import { DEFAULT_SETTINGS } from "../model/settings";
import { parseProject } from "../model/schema";
import type { OuterSize, RealizedTray, RealizeOptions } from "../sizing/types";
import { ceilU, fromU } from "../sizing/units";

export const GEO: Settings = {
  ...DEFAULT_SETTINGS,
  wall: 1.6,
  floor: 1.2,
  divider: 1.2,
  bottomChamfer: 0.4,
  cornerRadius: 3,
  scoopRadius: 12,
  fingerPocket: { width: 22, reach: 12 },
  lip: { enabled: true, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 },
};

export function traySpec(
  over: Partial<TraySpec> & Pick<TraySpec, "key" | "w" | "d" | "h">,
): TraySpec {
  return {
    part: "tray",
    path: "0",
    stack: 0,
    level: 0,
    x: 0,
    y: 0,
    z: 0,
    rotated: false,
    wall: 1.6,
    floor: 1.2,
    lip: false,
    solid: false,
    compartments: [],
    ...over,
  };
}

export function compartment(
  over: Partial<CompartmentSpec> & Pick<CompartmentSpec, "x" | "y" | "w" | "d">,
): CompartmentSpec {
  return { floorZ: 1.2, kind: "well", contents: "test", features: [], ...over };
}

// Compartments laid out left to right with `divider` between them.
export function strip(
  widths: number[],
  y: number,
  d: number,
  start: number,
  divider: number,
  make: (x: number, w: number, i: number) => Partial<CompartmentSpec>,
): CompartmentSpec[] {
  let x = start;
  return widths.map((w, i) => {
    const c = compartment({ x, y, w, d, ...make(x, w, i) });
    x += w + divider;
    return c;
  });
}

// 100 × 60 × 30 box with one 96.8 × 56.8 well, floor 1.2.
export const plainBox = traySpec({
  key: "plain:p0:0",
  w: 100,
  d: 60,
  h: 30,
  compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8 })],
});

export function pocket(side: Side, at: number, depth: number, width = 22, reach = 12): FeatureSpec {
  return { type: "fingerPocket", side, at, width, reach, depth };
}

// Three sleeved Standard decks standing on their long edge (well 68 high,
// 92.5 long + 2 × 12 reach), the last deck only 15 wide so its pockets
// cross the divider into the middle deck's pockets.
export const cardUpright = traySpec({
  key: "cards:p0:0",
  w: 1.6 + 24 + 1.2 + 30 + 1.2 + 15 + 1.6,
  d: 1.6 + 116.5 + 1.6,
  h: 1.2 + 68,
  compartments: strip([24, 30, 15], 1.6, 116.5, 1.6, 1.2, (x, w, i) => {
    const at = i === 2 ? 74.6 - 1.6 - 11 : x + w / 2;
    return {
      contents: `Deck ${i + 1}`,
      features: [pocket("front", at, 68 / 3), pocket("back", at, 68 / 3)],
    };
  }),
});

// Flat cards: one well, full-depth pockets on both short sides.
export const flatCards = traySpec({
  key: "flat:p0:0",
  w: 1.6 + 116.5 + 1.6,
  d: 1.6 + 68 + 1.6,
  h: 1.2 + 20,
  compartments: [
    compartment({
      x: 1.6,
      y: 1.6,
      w: 116.5,
      d: 68,
      features: [pocket("left", 1.6 + 34, 20), pocket("right", 1.6 + 34, 20)],
    }),
  ],
});

// Bulk: three scoop compartments with a front fillet r = 12.
export const scoopBulk = traySpec({
  key: "bulk:p0:0",
  w: 1.6 + 40 * 3 + 1.2 * 2 + 1.6,
  d: 60,
  h: 30,
  compartments: strip([40, 40, 40], 1.6, 56.8, 1.6, 1.2, () => ({
    kind: "scoop",
    features: [{ type: "scoop", side: "front", r: 12 }],
  })),
});

// Hex tiles (flatToFlat 40 → corner-to-corner 46.19 + 1 clearance), two
// columns with Ø3 corner reliefs, 15 tiles × 2 mm high.
export const hexTiles = traySpec({
  key: "tiles:p0:0",
  w: 1.6 + 47.2 * 2 + 1.2 + 1.6,
  d: 1.6 + 41 + 1.6,
  h: 1.2 + 31,
  compartments: strip([47.2, 47.2], 1.6, 41, 1.6, 1.2, () => ({
    features: [{ type: "cornerRelief", d: 3 }],
  })),
});

// Minis pockets: figure depths differ, so two pockets have raised solid floors.
export const miniPockets = traySpec({
  key: "minis:p0:0",
  w: 1.6 + 30 * 3 + 1.2 * 2 + 1.6,
  d: 1.6 + 30 + 1.6,
  h: 1.2 + 40,
  compartments: strip([30, 30, 30], 1.6, 30, 1.6, 1.2, (x, w, i) => ({
    kind: "pocket",
    floorZ: [1.2, 11.2, 21.2][i] ?? 1.2,
    features: [pocket("front", x + w / 2, 40 / 3, 20, 6)],
  })),
});

// Custom block: a plain well with corner reliefs and one full-depth pocket.
export const customBlock = traySpec({
  key: "custom:p0:0",
  w: 1.6 + 50 + 1.6,
  d: 1.6 + 40 + 12 + 1.6,
  h: 1.2 + 15,
  compartments: [
    compartment({
      x: 1.6,
      y: 1.6,
      w: 50,
      d: 52,
      features: [{ type: "cornerRelief", d: 3 }, pocket("back", 1.6 + 25, 15)],
    }),
  ],
});

export const spareLeftover = traySpec({
  key: "leftover:0",
  part: "leftover",
  w: 40,
  d: 70,
  h: 30,
  compartments: [
    compartment({ x: 1.6, y: 1.6, w: 36.8, d: 66.8, kind: "spare", contents: "spare" }),
  ],
});

export const solidLeftover = traySpec({
  key: "leftover:1",
  part: "leftover",
  solid: true,
  w: 20,
  d: 70,
  h: 30,
});

export const spacer = traySpec({
  key: "cards:p0:0:spacer",
  part: "spacer",
  path: "",
  solid: true,
  w: 92.5,
  d: 8,
  h: 63,
});

// Bottom tray of a two-stack: lipped wall max(1.6, 1.2 + 1.7) = 2.9.
export const lippedLower = traySpec({
  key: "lower:p0:0",
  w: 100,
  d: 60,
  h: 25,
  lip: true,
  compartments: [compartment({ x: 2.9, y: 2.9, w: 94.2, d: 54.2 })],
});

// Upper tray on it: inset 1.45 per side, h ≥ lip height + 3, chamfer ≥ 0.5.
export const upperLevel1 = traySpec({
  key: "upper:p0:0",
  level: 1,
  w: 100 - 2 * 1.45,
  d: 60 - 2 * 1.45,
  h: 20,
  compartments: [compartment({ x: 1.6, y: 1.6, w: 100 - 2.9 - 3.2, d: 60 - 2.9 - 3.2 })],
});

// The components and settings of a test/fixtures project.
export function loadFixture(raw: unknown): { components: Component[]; settings: Settings } {
  const parsed = parseProject(raw);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

// A tray as the layout builds it from a realized tray placed at `outer`.
export function traySpecFrom(
  realized: RealizedTray,
  outer: OuterSize,
  opts: RealizeOptions,
  settings: Settings,
  key: string,
): TraySpec {
  return {
    key,
    part: "tray",
    path: "0",
    stack: 0,
    level: opts.level,
    x: 0,
    y: 0,
    z: 0,
    w: outer.w,
    d: outer.d,
    h: outer.h,
    rotated: false,
    wall: realized.wall,
    floor: fromU(ceilU(settings.floor)),
    lip: opts.lipped,
    solid: false,
    compartments: realized.compartments,
  };
}
