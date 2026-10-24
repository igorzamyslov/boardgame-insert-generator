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

/**
 * The figure with `h` swapped for the footprint side that holds the `rank`th smallest of its three
 * measures (0 = lowest: flat on its largest face; 2 = highest: stood on end); as it is when it
 * already has that height.
 */
function withHeightRank(f: Dims, rank: 0 | 1 | 2): Dims {
  const target = [f.w, f.d, f.h].sort((x, y) => x - y)[rank] ?? f.h;
  if (f.h === target) {
    return { w: f.w, d: f.d, h: f.h };
  }
  return f.w === target ? { w: f.h, d: f.d, h: f.w } : { w: f.w, d: f.h, h: f.d };
}

/**
 * How a figure may rest, as given first, then on its side (h the middle measure), flat (h the
 * least) and on end (h the most): one entry per distinct orientation, none but the first for a
 * figure kept upright. A turn in plan is the pocket's own (turned).
 */
export function orientations(f: Dims, keepUpright: boolean): Dims[] {
  const given = { w: f.w, d: f.d, h: f.h };
  if (keepUpright) {
    return [given];
  }
  const out = [given];
  for (const [, rank] of ORIENTATIONS) {
    const next = withHeightRank(f, rank);
    if (!out.some((o) => o.w === next.w && o.d === next.d && o.h === next.h)) {
      out.push(next);
    }
  }
  return out;
}

/** Option ids after "standing" (the figures as given), with the height rank each one asks for. */
const ORIENTATIONS: readonly [string, 0 | 1 | 2][] = [
  ["lying", 1],
  ["flat", 0],
  ["tall", 2],
];

function pockets(
  c: MinisComponent,
  f: Figure,
  dims: Dims,
  clearance: number,
  s: Settings,
): CompartmentReq[] {
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
        w: growthMm(growthOf(c, "w", false, s.biggerWells), dims.w),
        d: growthMm(growthOf(c, "d", false, s.biggerWells), dims.d),
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
    const wells = s.biggerWells;
    const modes = {
      w: growthOf(c, "w", false, wells),
      d: growthOf(c, "d", false, wells),
      h: growthOf(c, "h", false, wells),
    };
    return { options: binOptions(c, c.figures, togglesOf(c), modes, s), notices: [] };
  }
  // One option per way of resting every figure (an option puts all of them the same way, a figure
  // kept upright excepted), each as it is and with every footprint turned a quarter in plan: at
  // most 3 × 2 + 2, and two ways that give the same pockets are one. Standing, the way the figures
  // were measured, comes first and wins ties.
  const options: StorageOption[] = [];
  const seen = new Set<string>();
  const offer = (id: string, rank: 0 | 1 | 2 | null, turned: boolean): void => {
    const dims: Dims[] = c.figures.map((f) => {
      const o = rank === null || f.keepUpright === true ? f : withHeightRank(f, rank);
      return turned ? { w: o.d, d: o.w, h: o.h } : { w: o.w, d: o.d, h: o.h };
    });
    const signature = JSON.stringify(dims);
    if (seen.has(signature)) {
      return;
    }
    seen.add(signature);
    options.push({
      id: turned ? `${id}-turned` : id,
      blocks: c.figures.map((f, i) => pockets(c, f, dims[i] ?? f, clearance, s)),
    });
  };
  for (const [id, rank] of [["standing", null], ...ORIENTATIONS] as const) {
    offer(id, rank, false);
    offer(id, rank, true);
  }
  return { options, notices: [] };
}
