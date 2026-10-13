import { DEFAULT_SETTINGS } from "../model/settings";
import { CHANNEL_DEPTH, MIN_GRIP } from "../sizing/constants";
import type {
  Access,
  Box,
  CompartmentSpec,
  Lock,
  Printer,
  Settings,
  TraySpec,
} from "../model/types";
import type { CompartmentReq, TrayPartReq, TrayRequirement, TrayVariant } from "../sizing/types";
import type { Measure } from "./context";
import type { Realize } from "./materialize";
import type { StackItem } from "./tree";
import type { LayoutInput } from "./types";

export const TEST_BOX: Box = {
  innerWidth: 300,
  innerDepth: 200,
  innerHeight: 60,
  headroom: 0,
  headroomCoverage: "full",
  storedOnSide: false,
};

export const TEST_PRINTER: Printer = {
  bedX: 256,
  bedY: 256,
  bedZ: 256,
  bedMargin: 5,
  layerHeight: 0.2,
};

export interface CompOpts {
  minW: number;
  minD: number;
  minH: number;
  elastic?: Partial<CompartmentReq["elastic"]>;
  kind?: CompartmentReq["kind"];
  contents?: string;
  /** Forces (true) or suppresses (false) the front wall cutout. */
  fingerCut?: boolean;
}

/**
 * A compartment. It asks for a front wall cutout when `fingerCut` says so or, by default, when
 * a side is under the MIN_GRIP size.
 */
export function comp(o: CompOpts): CompartmentReq {
  const needsCut = o.fingerCut ?? Math.min(o.minW, o.minD) < MIN_GRIP;
  return {
    componentId: "c",
    contents: o.contents ?? `${o.minW}x${o.minD}x${o.minH}`,
    kind: o.kind ?? "well",
    minW: o.minW,
    minD: o.minD,
    minH: o.minH,
    elastic: { w: false, d: false, h: false, ...o.elastic },
    features: needsCut
      ? [{ type: "wallCutout", side: "front", depthFraction: CHANNEL_DEPTH, floorNotch: false }]
      : [],
  };
}

export function part(
  trayKey: string,
  compartments: CompartmentReq[],
  rotatable = true,
): TrayPartReq {
  return { trayKey, arrangement: "strip", compartments, rotatable };
}

export function variant(id: string, parts: TrayPartReq[]): TrayVariant {
  return { id, parts };
}

export function req(
  key: string,
  variants: TrayVariant[],
  o: { access?: Access; loose?: boolean } = {},
): TrayRequirement {
  return {
    key,
    componentIds: [key],
    access: o.access ?? "sometimes",
    loose: o.loose ?? false,
    variants,
  };
}

/** One requirement, one variant, one part, one compartment of the given inner minimum. */
export function boxReq(
  key: string,
  minW: number,
  minD: number,
  minH: number,
  o: {
    access?: Access;
    loose?: boolean;
    rotatable?: boolean;
    elastic?: Partial<CompartmentReq["elastic"]>;
  } = {},
): TrayRequirement {
  return req(
    key,
    [
      variant("only", [
        part(
          `${key}:p0:0`,
          [comp({ minW, minD, minH, elastic: o.elastic, contents: key })],
          o.rotatable ?? true,
        ),
      ]),
    ],
    o,
  );
}

export function makeInput(
  requirements: TrayRequirement[],
  o: {
    box?: Partial<Box>;
    printer?: Partial<Printer>;
    settings?: Partial<Settings>;
    locks?: Lock[];
  } = {},
): LayoutInput {
  return {
    requirements,
    box: { ...TEST_BOX, ...o.box },
    printer: { ...TEST_PRINTER, ...o.printer },
    // The lip is off by default in the app, but most of these tests are about stacking with
    // one (insets, bed height including the lip, bearing), so they ask for it outright rather
    // than riding on the product default. A test of flush stacking passes `lip` itself.
    settings: {
      ...DEFAULT_SETTINGS,
      lip: { ...DEFAULT_SETTINGS.lip, enabled: true },
      ...o.settings,
    },
    locks: o.locks ?? [],
    inputsHash: "test-hash",
    appVersion: "0.0.0-test",
  };
}

/**
 * Fixed-size measure for unit tests: outer = inner minimum + 2 × 2 mm walls
 * (+1 mm per side when lipped), h = minH + 1.2 floor. Independent of sizing internals.
 */
export const fakeMeasure: Measure = (p, _settings, opts) => {
  const wall = opts.lipped ? 3 : 2;
  const w = p.compartments.reduce((s, c) => s + c.minW, 0) + 2 * wall;
  const d = Math.max(...p.compartments.map((c) => c.minD)) + 2 * wall;
  const h = Math.max(...p.compartments.map((c) => c.minH)) + 1.2;
  return { w, d, h };
};

/** A stack item for part 0 of variant 0 of requirement `req`. */
export function item(req: number, rotated = false): StackItem {
  return { req, variant: 0, part: 0, rotated };
}

/** A printed tray spec: a plain 100 × 50 × 20 tray at path "0", with `o` laid over it. */
export function traySpec(o: Partial<TraySpec> = {}): TraySpec {
  return {
    key: "k",
    part: "tray",
    path: "0",
    stack: 0,
    level: 0,
    x: 0,
    y: 0,
    z: 0,
    w: 100,
    d: 50,
    h: 20,
    rotated: false,
    wall: 1.6,
    floor: 1.2,
    lip: false,
    solid: false,
    compartments: [],
    ...o,
  };
}

/**
 * Simple realize for unit tests: compartments side by side along X filling the inner
 * area, a wall cutout on the left side of each, one 5 mm spacer in the first well with a
 * notch (its own feature, which materialize must keep).
 */
export const fakeRealize: Realize = (p, outer, settings) => {
  const wall = settings.wall;
  const n = p.compartments.length;
  const innerW = outer.w - 2 * wall - (n - 1) * settings.divider;
  const each = innerW / n;
  const compartments: CompartmentSpec[] = p.compartments.map((c, i) => ({
    x: wall + i * (each + settings.divider),
    y: wall,
    w: each,
    d: outer.d - 2 * wall,
    floorZ: settings.floor,
    kind: c.kind,
    contents: c.contents,
    features: [
      { type: "wallCutout", side: "left", at: outer.d / 2, width: 22, depth: 5, floorNotch: 0 },
    ],
  }));
  const spacer: TraySpec = {
    key: "s",
    part: "spacer",
    path: "",
    stack: 0,
    level: 0,
    x: wall,
    y: wall,
    z: settings.floor,
    w: 5,
    d: outer.d - 2 * wall,
    h: Math.max(1, outer.h - 5),
    rotated: false,
    wall,
    floor: settings.floor,
    lip: false,
    solid: true,
    compartments: [],
    features: [{ type: "spacerNotch", axis: "y", at: 2.5, width: 10, depth: 3 }],
  };
  return { wall, compartments, spacers: [spacer] };
};
