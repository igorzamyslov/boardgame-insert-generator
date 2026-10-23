import type { MinisComponent, Settings } from "../model/types";
import { growthOf, togglesOf } from "../model/defaults";
import { binOptions } from "./bulk";
import {
  compartment,
  featuresOf,
  itemLabel,
  mainClearance,
  type OptionsResult,
  type StorageOption,
  pieceCutout,
} from "./common";
import { growthMm } from "./growth";
import type { CompartmentReq } from "./types";

type Figure = MinisComponent["figures"][number];

interface Dims {
  w: number;
  d: number;
  h: number;
}

/** Taller than wide: only such a figure is laid down (spec §7.1). */
function isTall(f: Dims): boolean {
  return f.h > Math.max(f.w, f.d);
}

/** Lying: h swapped with the larger of w, d — only when the figure is taller than wide (spec §7.1). */
export function lyingDims(f: Dims): Dims {
  if (!isTall(f)) {
    return { w: f.w, d: f.d, h: f.h };
  }
  return f.w >= f.d ? { w: f.h, d: f.d, h: f.w } : { w: f.w, d: f.h, h: f.d };
}

function pockets(c: MinisComponent, f: Figure, dims: Dims, clearance: number): CompartmentReq[] {
  const name = itemLabel(c, f.name);
  return Array.from({ length: f.count }, (_, i) =>
    compartment({
      componentId: c.id,
      contents: f.count > 1 ? `${name} ${i + 1}/${f.count}` : name,
      kind: "pocket",
      w: dims.w + clearance,
      d: dims.d + clearance,
      h: dims.h + clearance,
      // A looser pocket, only when asked: a figure's own height is fixed, so no growth in depth.
      grow: {
        w: growthMm(growthOf(c, "w"), dims.w),
        d: growthMm(growthOf(c, "d"), dims.d),
      },
      // A centred cut through the front and back walls (spec §6.1): half the pocket deep, but down
      // to the floor with a floor notch for a short figure (in this variant's orientation).
      features: featuresOf(togglesOf(c), [
        pieceCutout("front", dims.h),
        pieceCutout("back", dims.h),
      ]),
    }),
  );
}

/** Storage options for a minis component. Precondition: it passes validateComponent. */
export function minisOptions(c: MinisComponent, s: Settings): OptionsResult {
  const clearance = mainClearance(c, s);
  if (c.storage === "bulk") {
    const modes = { w: growthOf(c, "w"), d: growthOf(c, "d"), h: growthOf(c, "h") };
    return { options: binOptions(c, c.figures, togglesOf(c), modes, s), notices: [] };
  }
  const options: StorageOption[] = [
    { id: "standing", blocks: c.figures.map((f) => pockets(c, f, f, clearance)) },
  ];
  if (c.figures.some(isTall)) {
    options.push({
      id: "lying",
      blocks: c.figures.map((f) => pockets(c, f, lyingDims(f), clearance)),
    });
  }
  return { options, notices: [] };
}
