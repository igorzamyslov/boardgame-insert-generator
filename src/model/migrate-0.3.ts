import type { Json } from "./json";
import { isRecord } from "./json";
import { MAX_ROOM } from "./room";
import { SLEEVES } from "./presets";
import { DEFAULT_SETTINGS } from "./settings";

// The migration of schema 0.3.0 (owner, 2026-10-23), compatibility line "0.2" → "0.3.0": per-axis
// `growth` and the older `stretch` become one `room` per item, in the contents' terms. A pure
// function on raw JSON: it never throws for a JSON object, never mutates its input and gives the
// same output for the same input. The reader checks what comes out; this only moves things.
//
//   off, auto  → none      (growth is off by default: the owner wants no growth unless asked)
//   a number   → some      (mm → whole cards or tiles by the thickness of one; bins: percent)
//   max        → as much as fits
//
// The stored plan is left as it is: the inputs hash changes (hash.ts, PLANNING_MODEL), so every
// saved plan is stale once, as planning on natural sizes makes different trays.

/** The per-axis words of the old `growth`. */
function modesOf(c: Json): unknown[] {
  return isRecord(c.growth) ? Object.values(c.growth) : [];
}

/** What a percent of pieces is for a set amount of mm: 2 % a mm of the largest axis, 1 to 500. */
export const roomFromGrowth = {
  piecesPercent(mm: number): number {
    return Math.min(MAX_ROOM.pieces, Math.max(1, Math.round(mm * 2)));
  },
};

/** The thickness of one card as the old growth saw it: preset (sleeve included, scaled) or measured. */
function cardThickness(c: Json, settings: Json): number | undefined {
  const t = isRecord(c.thickness) ? c.thickness : {};
  if (t.mode === "measured") {
    const { cards, stackMm } = t;
    return typeof cards === "number" && typeof stackMm === "number" && cards > 0
      ? stackMm / cards
      : undefined;
  }
  const base =
    typeof settings.cardThickness === "number"
      ? settings.cardThickness
      : DEFAULT_SETTINGS.cardThickness;
  let add = 0;
  if (typeof c.sleeve === "string" && c.sleeve in SLEEVES) {
    add = SLEEVES[c.sleeve as keyof typeof SLEEVES].addThickness;
  } else if (isRecord(c.sleeve) && typeof c.sleeve.thickness === "number") {
    add = c.sleeve.thickness;
  }
  const scale = typeof t.scale === "number" ? t.scale : 1;
  return (base + add) * scale;
}

function wholeCount(mm: number, each: number | undefined, kind: "cards" | "tiles"): number {
  const n = each !== undefined && each > 0 ? Math.round(mm / each) : 1;
  return Math.min(MAX_ROOM[kind], Math.max(1, n));
}

/** The `room` an old item's growth says, undefined for none. */
function roomOf(c: Json, settings: Json): "max" | number | undefined {
  const modes = modesOf(c);
  switch (c.kind) {
    case "cards":
    case "tiles": {
      const stack = isRecord(c.growth) ? c.growth.stack : undefined;
      if (stack === "max") {
        return "max";
      }
      if (typeof stack === "number" && stack > 0) {
        return c.kind === "cards"
          ? wholeCount(stack, cardThickness(c, settings), "cards")
          : wholeCount(stack, typeof c.thickness === "number" ? c.thickness : undefined, "tiles");
      }
      return undefined;
    }
    case "bulk": {
      if (modes.includes("max")) {
        return "max";
      }
      const amounts = modes.filter((m): m is number => typeof m === "number" && m > 0);
      return amounts.length > 0 ? roomFromGrowth.piecesPercent(Math.max(...amounts)) : undefined;
    }
    default:
      // minis and custom items have no row: what they grew is now an insert-wide choice
      return undefined;
  }
}

/**
 * Schema line "0.2" → "0.3.0":
 * 1. each item's `growth` becomes `room` (above), and `growth` and `stretch` are deleted;
 * 2. a group's `growth`, which sizing never read, is deleted.
 */
export function migrateTo030(raw: Json): Json {
  const out = structuredClone(raw);
  const settings = isRecord(out.settings) ? out.settings : {};
  const components = Array.isArray(out.components) ? out.components : [];
  for (const c of components) {
    if (!isRecord(c)) {
      continue;
    }
    const room = roomOf(c, settings);
    delete c.growth;
    delete c.stretch;
    if (room !== undefined && c.room === undefined) {
      c.room = room;
    }
  }
  if (Array.isArray(out.groups)) {
    for (const g of out.groups) {
      if (isRecord(g)) {
        delete g.growth;
      }
    }
  }
  return out;
}
