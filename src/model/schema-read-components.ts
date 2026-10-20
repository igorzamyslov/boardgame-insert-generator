import { COMPONENT_DEFAULTS, KIND_NAMES } from "./defaults";
import { newId } from "./ids";
import { isRecord, quote } from "./json";
import type { Ctx } from "./schema-reader";
import {
  absorbErrors,
  addError,
  adopt,
  childCtx,
  Reader,
  readEnum,
  SCHEMA_NOTICE_CODES,
} from "./schema-reader";
import type {
  BulkItem,
  CardsComponent,
  Component,
  ComponentBase,
  ComponentKind,
  ForeignData,
  Growth,
  GrowthAxis,
  GrowthMode,
  Sleeve,
  TileShape,
} from "./types";

const COMPONENT_KINDS = ["cards", "bulk", "tiles", "minis", "custom"] as const;
const SLEEVE_NAMES = ["none", "standard", "premium"] as const;

const GROWTH_AXES: readonly GrowthAxis[] = ["w", "d", "h", "stack"];
const GROWTH_WORDS = ["off", "auto", "max"] as const;

/** A growth mode: a word, or a number of mm (null is a half-edited number, left for validation). */
export function readGrowthMode(g: Reader, axis: GrowthAxis): GrowthMode | undefined {
  const v = g.take(axis);
  if (v === undefined) {
    return undefined;
  }
  if (v === null) {
    return Number.NaN;
  }
  if (typeof v === "number") {
    return v;
  }
  return readEnum(v, GROWTH_WORDS, g.at(axis), g.ctx);
}

/**
 * The component's `growth`. A file from before schema 0.1.12 says `stretch` instead: a deck or stack
 * of tiles that stretched now grows by `auto`, which upright storage does by default, so
 * `stretch: true` is simply the default (a flat deck, which never stretched, stays off); and
 * `stretch: false`, which was the default then, switches growth off on the stack, as it was. It
 * never becomes `max` (the old stretch took the whole leaf; `auto` is the bounded form). The old
 * key is read but never written back, and `growth` wins when a file has both.
 */
function readGrowth(r: Reader, kind: ComponentKind): Growth | undefined {
  const legacy = r.optBool("stretch");
  const g = r.optChild("growth");
  const growth: Growth = {};
  if (g) {
    for (const axis of GROWTH_AXES) {
      const mode = readGrowthMode(g, axis);
      if (mode !== undefined) {
        growth[axis] = mode;
      }
    }
    g.finish({});
  }
  if (legacy === false && (kind === "cards" || kind === "tiles") && growth.stack === undefined) {
    growth.stack = "off";
  }
  return Object.keys(growth).length > 0 ? growth : undefined;
}

function readBase(r: Reader, kind: ComponentKind): ComponentBase {
  const base: ComponentBase = {
    id: r.optStr("id") ?? newId(),
    name: r.str("name", KIND_NAMES[kind]),
    access: r.oneOf("access", ["often", "sometimes", "setup"], COMPONENT_DEFAULTS.access),
  };
  const copies = r.optNum("copies");
  if (copies !== undefined) {
    base.copies = copies;
  }
  const clearance = r.optNum("clearance");
  if (clearance !== undefined) {
    base.clearance = clearance;
  }
  const fingerCuts = r.optBool("fingerCuts");
  if (fingerCuts !== undefined) {
    base.fingerCuts = fingerCuts;
  }
  const curvedFloor = r.optBool("curvedFloor");
  if (curvedFloor !== undefined) {
    base.curvedFloor = curvedFloor;
  }
  const cornerReliefs = r.optBool("cornerReliefs");
  if (cornerReliefs !== undefined) {
    base.cornerReliefs = cornerReliefs;
  }
  const growth = readGrowth(r, kind);
  if (growth !== undefined) {
    base.growth = growth;
  }
  const separators = r.optNum("separators");
  if (separators !== undefined) {
    base.separators = separators;
  }
  const dividers = r.optNum("dividers");
  if (dividers !== undefined) {
    base.dividers = dividers;
  }
  return base;
}

function readSleeve(r: Reader): Sleeve {
  const v = r.take("sleeve");
  if (isRecord(v)) {
    const s = new Reader(v, r.at("sleeve"), r.ctx);
    return s.finish({ w: s.num("w"), h: s.num("h"), thickness: s.num("thickness") });
  }
  return readEnum(v, SLEEVE_NAMES, r.at("sleeve"), r.ctx, COMPONENT_DEFAULTS.cards.sleeve);
}

/** `{ scale }` for a stored correction, nothing for none (a preset without one stays `{ mode }`). */
function optionalScale(scale: number | undefined): { scale?: number } {
  return scale === undefined ? {} : { scale };
}

function readCards(r: Reader, base: ComponentBase): Component {
  let shortSide = r.num("shortSide");
  let longSide = r.num("longSide");
  if (shortSide > longSide) {
    [shortSide, longSide] = [longSide, shortSide];
    r.ctx.notices.push({
      level: "info",
      code: SCHEMA_NOTICE_CODES.cardSidesSwapped,
      path: r.at("shortSide"),
      message: `Card sides of ${quote(base.name)} were the wrong way round and have been swapped.`,
    });
  }
  const decks = r
    .objects("decks")
    .map((d) => d.finish({ name: d.str("name", ""), count: d.num("count") }));
  const sleeve = readSleeve(r);
  const t = r.optChild("thickness");
  let thickness: CardsComponent["thickness"] = { ...COMPONENT_DEFAULTS.cards.thickness };
  if (t) {
    const mode = t.oneOf("mode", ["preset", "measured"]);
    thickness = t.finish(
      mode === "measured"
        ? { mode, cards: t.num("cards"), stackMm: t.num("stackMm") }
        : { mode: "preset" as const, ...optionalScale(t.optNum("scale")) },
    );
  }
  const storage = r.oneOf(
    "storage",
    ["upright-long", "upright-short", "flat", "auto"],
    COMPONENT_DEFAULTS.cards.storage,
  );
  const flatDecks = r.has("flatDecks") ? r.oneOf("flatDecks", ["walls", "dividers"]) : undefined;
  return r.finish({
    ...base,
    kind: "cards",
    shortSide,
    longSide,
    decks,
    sleeve,
    thickness,
    storage,
    ...(flatDecks === undefined ? {} : { flatDecks }),
  });
}

function readBulkItem(r: Reader): BulkItem {
  if (r.has("volumeMl")) {
    return r.finish({ name: r.str("name", ""), volumeMl: r.num("volumeMl") });
  }
  return r.finish({
    name: r.str("name", ""),
    count: r.num("count"),
    w: r.num("w"),
    d: r.num("d"),
    h: r.num("h"),
  });
}

function readTileShape(r: Reader): TileShape {
  const s = r.child("shape");
  if (!s) {
    return { type: "rect", w: 0, d: 0 };
  }
  const type = s.tag("type", ["rect", "hex"]);
  if (type === null) {
    return { type: "rect", w: 0, d: 0 };
  }
  if (type === "hex") {
    return s.finish({
      type,
      flatToFlat: s.num("flatToFlat"),
      orientation: s.oneOf(
        "orientation",
        ["flat", "pointy"],
        COMPONENT_DEFAULTS.tiles.hexOrientation,
      ),
    });
  }
  return s.finish({ type, w: s.num("w"), d: s.num("d") });
}

function readKnownComponent(r: Reader, kind: ComponentKind): Component {
  const base = readBase(r, kind);
  switch (kind) {
    case "cards":
      return readCards(r, base);
    case "bulk":
      return r.finish({ ...base, kind, items: r.objects("items").map(readBulkItem) });
    case "tiles":
      return r.finish({
        ...base,
        kind,
        shape: readTileShape(r),
        thickness: r.num("thickness"),
        count: r.num("count"),
        storage: r.oneOf("storage", ["flat", "upright", "auto"], COMPONENT_DEFAULTS.tiles.storage),
      });
    case "minis":
      return r.finish({
        ...base,
        kind,
        figures: r.objects("figures").map((f) =>
          f.finish({
            name: f.str("name", ""),
            w: f.num("w"),
            d: f.num("d"),
            h: f.num("h"),
            count: f.num("count"),
          }),
        ),
        storage: r.oneOf("storage", ["pockets", "bulk"], COMPONENT_DEFAULTS.minis.storage),
      });
    case "custom":
      return r.finish({
        ...base,
        kind,
        w: r.num("w"),
        d: r.num("d"),
        h: r.num("h"),
        count: r.num("count"),
      });
  }
}

/**
 * Newer-minor files: a component of an unknown kind, or with a value or shape
 * this app can't read, becomes foreign: kept verbatim, not laid out, and
 * re-inserted at its original index on save. Other files: it is an error. A
 * list entry that isn't an object is damaged data in every file, never foreign.
 */
export function readComponents(
  list: unknown[],
  ctx: Ctx,
): { components: Component[]; foreign: ForeignData } {
  const components: Component[] = [];
  const foreign: ForeignData = { components: [] };
  list.forEach((raw, index) => {
    const path = `/components/${index}`;
    const sub = childCtx(ctx);
    if (!isRecord(raw)) {
      // Not a component of any version: damaged, never foreign.
      addError(ctx, `${path}: expected an object`);
      return;
    }
    const r = new Reader(raw, path, sub);
    const kind = r.tag("kind", COMPONENT_KINDS);
    const component = kind ? readKnownComponent(r, kind) : null;
    const unreadable = sub.errors.length > 0 || sub.unknownValues.length > 0;
    if (unreadable && ctx.newer) {
      foreign.components.push({ index, raw: structuredClone(raw) });
      // Not in project.components, so the notice points into the file.
      const which =
        typeof raw.name === "string"
          ? `${quote(raw.name)} (item ${index + 1} in the file)`
          : `${index + 1} in the file`;
      ctx.notices.push({
        level: "warning",
        code: SCHEMA_NOTICE_CODES.foreignComponent,
        path,
        message: `Item ${which} uses features this app version doesn't know. It is saved back unchanged, but not laid out.`,
      });
    } else if (unreadable) {
      absorbErrors(ctx, sub);
    } else if (component) {
      adopt(ctx, sub, { from: path, to: `/components/${components.length}` });
      components.push(component);
    }
  });
  return { components, foreign };
}
