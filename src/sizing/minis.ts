import type { MinisComponent, Settings } from "../model/types";
import { BULK_SHAPES, bulkCompartment, bulkLine } from "./bulk";
import {
  compartment,
  displayName,
  label,
  mainClearance,
  type OptionsResult,
  type StorageOption,
  wallCutout,
} from "./common";
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
  const name = label(f.name, displayName(c));
  return Array.from({ length: f.count }, (_, i) =>
    compartment({
      componentId: c.id,
      contents: f.count > 1 ? `${name} ${i + 1}/${f.count}` : name,
      kind: "pocket",
      w: dims.w + clearance,
      d: dims.d + clearance,
      h: dims.h + clearance,
      // A centred cut through the front wall, half the pocket deep (spec §6.1).
      features: [wallCutout("front", 0.5, false)],
    }),
  );
}

/** Storage options for a minis component. Precondition: it passes validateComponent. */
export function minisOptions(c: MinisComponent, s: Settings): OptionsResult {
  const clearance = mainClearance(c, s);
  if (c.storage === "bulk") {
    return {
      options: BULK_SHAPES.map((shape): StorageOption => ({
        id: `bulk-${shape}`,
        blocks: c.figures.map((f) => [
          bulkCompartment(
            c.id,
            `${label(f.name, displayName(c))} ×${f.count}`,
            bulkLine(f, clearance, s.packingFactor),
            shape,
          ),
        ]),
      })),
      notices: [],
    };
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
