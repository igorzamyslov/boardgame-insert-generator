// src/ui/derived.ts
import type { Component, Settings } from "../model/types";
import { cardDims } from "../sizing/cards";
import { itemLabel, type StorageOption } from "../sizing/common";
import { componentOptions } from "../sizing/component";
import type { CompartmentReq } from "../sizing/types";

/** mm to the 0.01 grid, no trailing zeros: 65, 89.5, 17.45. */
const mm = (v: number): string => String(Math.round(v * 100) / 100);

/** mm to the nearest tenth, for a stack or a volume nobody measures finer. */
const mm1 = (v: number): string => String(Math.round(v * 10) / 10);

const box = (r: CompartmentReq): string => `${mm(r.minW)} × ${mm(r.minD)} × ${mm(r.minH)} mm`;

/** The first compartment of block `j` of an option (the one a derived line is about). */
function compartmentOf(option: StorageOption | undefined, j: number): CompartmentReq | undefined {
  return option?.blocks[j]?.[0];
}

/**
 * The sizes sizing derives from a component's presets, one plain sentence per deck, item, figure or
 * tile stack, for the editor to show beside the fields that produce them. They are read from
 * `componentOptions` (the same CompartmentReqs the optimizer packs), never recomputed; only the
 * stack thickness, which the wells include clearance in, is the plain product of the count and
 * the per-card or per-tile thickness. A component with an error has no options, so no lines.
 *
 * A component can have several storage options (orientations, bin shapes, column counts) and the
 * optimizer picks one from the whole project, so a line says which it shows:
 * - cards: the wells' face footprint, which is the same whichever way a deck stands, and the
 *   stack thickness, which is what to hold a ruler to;
 * - tiles: the first option (all tiles in one column, flat or upright as the storage says);
 * - minis: the first option (standing, or both bin shapes when stored as bulk);
 * - bulk: both bin shapes, since neither is the plain answer.
 */
export function derivedSizes(c: Component, s: Settings, index: number): string[] {
  switch (c.kind) {
    case "cards": {
      // The flat option exists for every storage and is the only one whose width and depth are the
      // card's face, so it is the one to read the well from.
      const { options } = componentOptions({ ...c, storage: "flat" }, s, index);
      const { dims } = cardDims(c, s, index);
      return c.decks.flatMap((deck, j) => {
        const well = compartmentOf(options[0], j);
        if (well === undefined) {
          return [];
        }
        return [
          `${itemLabel(c, deck.name)}: ${deck.count} cards ≈ ${mm1(deck.count * dims.t)} mm thick (${mm(dims.t)} mm per card), in a ${mm(well.minW)} × ${mm(well.minD)} mm well.`,
        ];
      });
    }
    case "tiles": {
      const well = compartmentOf(componentOptions(c, s, index).options[0], 0);
      if (well === undefined) {
        return [];
      }
      return [
        `${c.count} tiles stack to ${mm1(c.count * c.thickness)} mm, in a ${box(well)} well (all in one column; a taller stack may be split).`,
      ];
    }
    case "minis": {
      const options = componentOptions(c, s, index).options;
      if (c.storage === "pockets") {
        return c.figures.flatMap((f, j) => {
          const pocket = compartmentOf(options[0], j);
          return pocket === undefined ? [] : [`${itemLabel(c, f.name)}: a ${box(pocket)} pocket.`];
        });
      }
      return binLines(
        c,
        options,
        c.figures.map((f) => f.name),
      );
    }
    case "bulk":
      return binLines(
        c,
        componentOptions(c, s, index).options,
        c.items.map((i) => i.name),
      );
    case "custom":
      return [];
  }
}

/** Bin lines: the volume the pile needs (packing included) and the size of each bin shape. */
function binLines(c: Component, options: StorageOption[], names: string[]): string[] {
  return names.flatMap((name, j) => {
    const bins = options.flatMap((o) => {
      const bin = compartmentOf(o, j);
      return bin === undefined ? [] : [{ id: o.id.replace(/^bulk-/, ""), bin }];
    });
    const first = bins[0];
    if (first === undefined) {
      return [];
    }
    const sizes = bins.map(({ id, bin }) => `${box(bin)} (${id})`).join(" or ");
    const volume =
      first.bin.minVolume === undefined ? "" : ` for ${mm1(first.bin.minVolume / 1000)} ml`;
    return [`${itemLabel(c, name)}: a tray of ${sizes}${volume}.`];
  });
}
