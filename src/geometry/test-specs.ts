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
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import smallTiles from "../../test/fixtures/small-tiles.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tinyBox from "../../test/fixtures/tiny-box.json";
import {
  DEFAULT_SETTINGS,
  MIN_FEATURE_MM,
  MIN_WALL_MM,
  UPPER_MIN_CHAMFER,
  applyFingerRoom,
  effective,
  maxBottomChamfer,
} from "../model/settings";
import { parseProject } from "../model/schema";
import { planTray } from "./plan";
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
  fingerPocket: { width: 22, floorNotch: 11, wallRoom: 0, dividerRoom: 0 },
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

export type WallCutout = Extract<FeatureSpec, { type: "wallCutout" }>;

export function cutout(
  side: Side,
  at: number,
  depth: number,
  floorNotch = 0,
  width = 22,
): WallCutout {
  return { type: "wallCutout", side, at, width, depth, floorNotch };
}

// Three sleeved Standard decks standing on their long edge (wells 92.5 long, 68 high) with one
// centred 22 mm channel, half the well deep, through both end walls and both dividers.
export const uprightChannel = traySpec({
  key: "upright:p0:0",
  w: 1.6 + 24 + 1.2 + 30 + 1.2 + 15 + 1.6,
  d: 1.6 + 92.5 + 1.6,
  h: 1.2 + 68,
  compartments: strip([24, 30, 15], 1.6, 92.5, 1.6, 1.2, (_x, _w, i) => ({
    contents: `Deck ${i + 1}`,
    features: [cutout("left", 1.6 + 92.5 / 2, 34), cutout("right", 1.6 + 92.5 / 2, 34)],
  })),
});

// The same tray carrying a lip (lipped wall 2.9): the channel interrupts the lip on the end walls.
export const uprightChannelLipped = traySpec({
  ...uprightChannel,
  key: "upright-lipped:p0:0",
  w: uprightChannel.w + 2 * 1.3,
  d: uprightChannel.d + 2 * 1.3,
  lip: true,
  compartments: uprightChannel.compartments.map((c) => ({
    ...c,
    x: c.x + 1.3,
    y: c.y + 1.3,
    features: c.features.map((f) => (f.type === "wallCutout" ? { ...f, at: f.at + 1.3 } : f)),
  })),
});

// Upright 15 mm square tiles in a lipped tray with 10 mm of finger room in its 12.9 mm end walls
// (sizing output, turned): the channel leaves through both, keeping 3 mm posts.
export const lippedThickWall = traySpec({
  key: "lipped-thick:p0:0",
  w: 21.8,
  d: 106.8,
  h: 17.2,
  lip: true,
  compartments: [
    compartment({
      x: 2.9,
      y: 12.9,
      w: 16,
      d: 81,
      features: [cutout("front", 10.9, 8, 0, 10), cutout("back", 10.9, 8, 0, 10)],
    }),
  ],
});

// One deck of sleeved Standard cards lying flat (68 × 92.5, 20 high): full-depth half-round
// cutouts through both long walls; each goes on down through the floor at its full 22 mm and
// notches it with a half-disc reaching 11 mm in.
export const flatCutouts = traySpec({
  key: "flat:p0:0",
  w: 1.6 + 68 + 1.6,
  d: 1.6 + 92.5 + 1.6,
  h: 1.2 + 20,
  compartments: [
    compartment({
      x: 1.6,
      y: 1.6,
      w: 68,
      d: 92.5,
      contents: "Flat deck",
      features: [cutout("left", 1.6 + 92.5 / 2, 20, 11), cutout("right", 1.6 + 92.5 / 2, 20, 11)],
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

// Minis pockets: figure depths differ, so two pockets have raised solid floors; each is cut
// through the front wall, half its depth.
export const miniPockets = traySpec({
  key: "minis:p0:0",
  w: 1.6 + 30 * 3 + 1.2 * 2 + 1.6,
  d: 1.6 + 30 + 1.6,
  h: 1.2 + 40,
  compartments: strip([30, 30, 30], 1.6, 30, 1.6, 1.2, (x, w, i) => ({
    kind: "pocket",
    floorZ: [1.2, 11.2, 21.2][i] ?? 1.2,
    features: [cutout("front", x + w / 2, [20, 15, 10][i] ?? 20)],
  })),
});

// Custom block: a plain well with corner reliefs, cut through the front wall half its depth.
export const customBlock = traySpec({
  key: "custom:p0:0",
  w: 1.6 + 50 + 1.6,
  d: 1.6 + 40 + 1.6,
  h: 1.2 + 15,
  compartments: [
    compartment({
      x: 1.6,
      y: 1.6,
      w: 50,
      d: 40,
      features: [{ type: "cornerRelief", d: 3 }, cutout("front", 1.6 + 25, 7.5)],
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

// The riser under a stack (spec §3 rule 2): an open walled box or a solid block, on the floor.
export const openRiser = traySpec({
  key: "cards:p0:0:riser",
  part: "riser",
  path: "",
  w: 100,
  d: 80,
  h: 20,
  compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 76.8, kind: "spare", contents: "" })],
});

export const solidRiser = traySpec({
  key: "cards:p0:0:riser",
  part: "riser",
  path: "",
  solid: true,
  w: 100,
  d: 80,
  h: 20,
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

// A card spacer standing in a well that a finger channel crosses (spacer frame: 30 mm of spare
// stack along X, the 92.5 mm well along Y, 63 high): the channel's U (22 wide, 34 below the
// tray's rim, so 29 below the spacer's top) runs on through it along X.
export const notchedSpacer = traySpec({
  key: "cards:p0:0:spacer",
  part: "spacer",
  path: "",
  solid: true,
  w: 30,
  d: 92.5,
  h: 63,
  features: [{ type: "spacerNotch", axis: "x", at: 46.25, width: 22, depth: 29 }],
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
    // RealizeOptions.lipped takes effect only with lips enabled (roadmap §4.7).
    lip: opts.lipped && settings.lip.enabled,
    solid: false,
    compartments: realized.compartments,
  };
}

// Shared scaffolding of the sizing sweeps (plan.sizing, tray.sizing and plan-corners tests): real
// sizing output of the fixture projects, under fixture and edge-of-range settings, at every lip
// and level option and a few outer sizes.

// The fixtures take every kind's default growth (spec minimal-trays §5: auto on bulk and upright
// stacks); the "growth off" and "growth max" variants set every axis of every component to one
// extreme, so the sweeps cover content-tight trays and ones that take all the slack too.
const withGrowth = (raw: unknown, mode: "off" | "max"): unknown => {
  const { components, ...rest } = raw as { components: Record<string, unknown>[] };
  return {
    ...rest,
    components: components.map((component) => ({
      ...component,
      growth: { w: mode, d: mode, h: mode, stack: mode },
    })),
  };
};

// Every deck and stack of tiles stands up, may grow as far as retention lets it, and has two
// dividers: wells with slots in their floors, in trays of every size the sweeps build.
const withDividers = (raw: unknown): unknown => {
  const { components, ...rest } = raw as { components: Record<string, unknown>[] };
  return {
    ...rest,
    components: components.map((component) =>
      component.kind === "cards" || component.kind === "tiles"
        ? {
            ...component,
            storage: component.kind === "cards" ? "upright-long" : "upright",
            growth: { stack: "max" },
            dividers: 2,
          }
        : component,
    ),
  };
};

// Every deck and stack of tiles stands up, may grow as far as the plates let it, and asks for a
// spacer (`separators`): a spacer is only ever built when asked for, and the sweeps must still
// cover spacers, plain and open, notched for a finger channel, in trays of every size.
const withSpacers = (raw: unknown): unknown => {
  const { components, ...rest } = raw as { components: Record<string, unknown>[] };
  return {
    ...rest,
    components: components.map((component) =>
      component.kind === "cards" || component.kind === "tiles"
        ? {
            ...component,
            storage: component.kind === "cards" ? "upright-long" : "upright",
            growth: { stack: "max" },
            separators: 1,
          }
        : component,
    ),
  };
};

export const SWEEP_FIXTURES: readonly [string, unknown][] = [
  ["cards-heavy", cardsHeavy],
  ["cards-heavy, growth off", withGrowth(cardsHeavy, "off")],
  ["cards-heavy, growth max", withGrowth(cardsHeavy, "max")],
  ["cards-heavy, dividers", withDividers(cardsHeavy)],
  ["cards-heavy, spacers", withSpacers(cardsHeavy)],
  ["bits-heavy", bitsHeavy],
  ["bits-heavy, growth off", withGrowth(bitsHeavy, "off")],
  ["tiles-minis", tilesMinis],
  ["small-tiles", smallTiles],
  ["small-tiles, growth off", withGrowth(smallTiles, "off")],
  ["small-tiles, growth max", withGrowth(smallTiles, "max")],
  ["small-tiles, dividers", withDividers(smallTiles)],
  ["small-tiles, spacers", withSpacers(smallTiles)],
  ["tiny-box", tinyBox],
];

export const SWEEP_OPTIONS: readonly RealizeOptions[] = [
  { lipped: false, level: 0 },
  { lipped: true, level: 0 },
  { lipped: false, level: 1 },
  { lipped: true, level: 1 },
];

// Extra mm over minOuter per axis: uniform, one axis at a time, and a hair.
export const SWEEP_SLACKS: readonly [number, number, number][] = [
  [0, 0, 0],
  [10, 10, 10],
  [5, 0, 0],
  [0, 5, 0],
  [0, 0, 5],
  [0.01, 0.01, 0.01],
];

export type Profile = (base: Settings) => Settings;

/**
 * `s` at the largest bottom chamfer its wall and floor allow (maxBottomChamfer, at most 3:
 * SETTING_RANGES), the lip ledge raised where needed so upper trays still rest on it
 * (field.lipBearing): the settings stay valid.
 */
export function largestChamfer(s: Settings): Settings {
  const bottomChamfer = Math.min(3, maxBottomChamfer(s));
  const bearing = Math.max(bottomChamfer, UPPER_MIN_CHAMFER) + 2 * effective(s).lipPlay + 0.01;
  const ledge = Math.max(s.lip.ledge, Math.ceil(bearing * 100) / 100);
  return { ...s, bottomChamfer, lip: { ...s.lip, ledge } };
}

/** The fixture's own settings. */
export const FIXTURE_SETTINGS: Profile = (s) => s;

/** The thinnest wall, floor and divider, with the fixture's chamfer. */
export const THIN_WALLS: Profile = (s) => ({
  ...s,
  wall: MIN_WALL_MM,
  floor: MIN_FEATURE_MM,
  divider: MIN_FEATURE_MM,
});

/** A 1 mm bottom chamfer on the fixture's walls. */
export const CHAMFER_1: Profile = (s) => ({ ...s, bottomChamfer: 1 });

/** The thinnest wall, floor, divider and lip, the lowest lip and the largest chamfer. */
export const THINNEST: Profile = (s) =>
  largestChamfer({
    ...s,
    wall: MIN_WALL_MM,
    floor: MIN_FEATURE_MM,
    divider: MIN_FEATURE_MM,
    lip: { ...s.lip, enabled: true, thickness: MIN_WALL_MM, height: 1 },
  });

// Settings at the SETTING_RANGES extremes; each is valid (settingsValid), so the chamfer profiles
// sit exactly on maxBottomChamfer.
export const PROFILES: readonly [string, Profile][] = [
  ["fixture settings", FIXTURE_SETTINGS],
  ["thinnest wall, floor and divider", THIN_WALLS],
  ["thinnest wall, floor, lip and the largest chamfer", THINNEST],
  ["no chamfer", (s) => ({ ...s, bottomChamfer: 0 })],
  ["largest chamfer", largestChamfer],
  [
    "largest chamfer, default wall and floor",
    (s) => largestChamfer({ ...s, wall: DEFAULT_SETTINGS.wall, floor: DEFAULT_SETTINGS.floor }),
  ],
  [
    "largest chamfer, wall and floor 0.9",
    (s) => largestChamfer({ ...s, wall: MIN_WALL_MM, floor: MIN_WALL_MM }),
  ],
  [
    "largest chamfer, thin wall and floor",
    (s) => largestChamfer({ ...s, wall: MIN_WALL_MM, floor: MIN_FEATURE_MM }),
  ],
  ["largest chamfer, wall and floor 1.2", (s) => largestChamfer({ ...s, wall: 1.2, floor: 1.2 })],
  ["largest chamfer, thick wall and floor", (s) => largestChamfer({ ...s, wall: 3, floor: 3 })],
  ["lip height 1", (s) => ({ ...s, lip: { ...s.lip, enabled: true, height: 1 } })],
  [
    "lip thickness 0.9",
    (s) => ({ ...s, lip: { ...s.lip, enabled: true, thickness: MIN_WALL_MM } }),
  ],
  ["finger room in the cut walls (simple mode)", (s) => applyFingerRoom(s, true)],
  [
    "the widest finger room and floor notch, thinnest walls and largest chamfer",
    (s) => {
      const thin = THINNEST(s);
      const fingerPocket = { ...thin.fingerPocket, floorNotch: 50, wallRoom: 20, dividerRoom: 20 };
      return { ...thin, fingerPocket };
    },
  ],
  [
    "three decimals",
    (s) => ({
      ...s,
      wall: 1.234,
      floor: 1.001,
      divider: 0.999,
      bottomChamfer: 0.333,
      fingerPocket: {
        width: 22.001,
        floorNotch: 7.999,
        wallRoom: 3.333,
        dividerRoom: 1.111,
      },
      lip: { ...s.lip, enabled: true, height: 2.001, thickness: 1.003, ledge: 1.707 },
    }),
  ],
];

/**
 * How many holes go through the floor of `spec` (the genus its mesh must have): one per floor
 * notch under a divider, shared by the cutouts on both sides of it. A notch in an outer wall opens
 * to the outside and makes no hole.
 */
export function floorHoles(spec: TraySpec, settings: Settings): number {
  const holes = new Set<string>();
  for (const c of planTray(spec, settings).compartments) {
    for (const cut of c.cuts) {
      if (cut.notch > 0 && cut.into !== null) {
        holes.add([cut.x0, cut.y0, cut.x1, cut.y1].map((v) => v.toFixed(2)).join(","));
      }
    }
  }
  return holes.size;
}
