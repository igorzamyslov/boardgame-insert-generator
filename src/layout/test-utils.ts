import { DEFAULT_SETTINGS } from "../model/settings";
import { CHANNEL_DEPTH, MIN_GRIP } from "../sizing/constants";
import type { Access, Box, Lock, Printer, Settings } from "../model/types";
import type { CompartmentReq, TrayPartReq, TrayRequirement, TrayVariant } from "../sizing/types";
import type { Measure } from "./context";
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
    settings: { ...DEFAULT_SETTINGS, ...o.settings },
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
