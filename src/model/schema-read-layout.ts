import type { Json } from "./json";
import { isRecord, shorten, summarize } from "./json";
import type { Ctx } from "./schema-reader";
import { absorbErrors, adopt, childCtx, Reader, SCHEMA_NOTICE_CODES } from "./schema-reader";
import type { CompartmentSpec, FeatureSpec, StoredLayout, TraySpec } from "./types";
import { UNKNOWN_APP_VERSION } from "./version";

const SIDES = ["front", "back", "left", "right"] as const;

/**
 * A copy of a stored tray or feature, exactly as the file has it, typed as if
 * it were known. It is not: a newer-minor file may carry a feature type or tray
 * part outside the FeatureSpec / TraySpec unions (and fields this app doesn't
 * know). readLayout reports such trays with the `layout.unsupportedTrays`
 * notice. Consumers must check stored trays against the KNOWN_* lists of plan 3
 * (geometry/types.ts) before switching exhaustively on `part` or `type`.
 */
function verbatim<T>(raw: Json): T {
  return structuredClone(raw) as unknown as T;
}

function readFeature(r: Reader): FeatureSpec {
  const type = r.tag("type", [
    "fingerPocket",
    "wallCutout",
    "spacerNotch",
    "scoop",
    "cornerRelief",
  ]);
  if (type === null) {
    // Newer file, unknown feature type: keep it verbatim (its fields are unknown too).
    // In other files the recorded error makes the whole layout unreadable.
    return verbatim<FeatureSpec>(r.raw);
  }
  switch (type) {
    case "fingerPocket":
      return r.finish({
        type,
        side: r.oneOf("side", SIDES),
        at: r.strictNum("at"),
        width: r.strictNum("width"),
        reach: r.strictNum("reach"),
        depth: r.strictNum("depth"),
      });
    case "wallCutout":
      return r.finish({
        type,
        side: r.oneOf("side", SIDES),
        at: r.strictNum("at"),
        width: r.strictNum("width"),
        depth: r.strictNum("depth"),
        floorNotch: r.strictNum("floorNotch"),
      });
    case "spacerNotch":
      return r.finish({
        type,
        axis: r.oneOf("axis", ["x", "y"]),
        at: r.strictNum("at"),
        width: r.strictNum("width"),
        depth: r.strictNum("depth"),
      });
    case "scoop":
      return r.finish({ type, side: r.oneOf("side", SIDES), r: r.strictNum("r") });
    case "cornerRelief":
      return r.finish({ type, d: r.strictNum("d") });
  }
}

function readCompartment(r: Reader): CompartmentSpec {
  return r.finish({
    x: r.strictNum("x"),
    y: r.strictNum("y"),
    w: r.strictNum("w"),
    d: r.strictNum("d"),
    floorZ: r.strictNum("floorZ"),
    kind: r.oneOf("kind", ["well", "scoop", "pocket", "spare"]),
    contents: r.str("contents", ""),
    features: r.objects("features", []).map(readFeature),
  });
}

function readTray(r: Reader): TraySpec {
  return r.finish({
    key: r.str("key"),
    part: r.oneOf("part", ["tray", "leftover", "spacer"]),
    path: r.str("path", ""),
    stack: r.strictNum("stack"),
    level: r.strictNum("level"),
    x: r.strictNum("x"),
    y: r.strictNum("y"),
    z: r.strictNum("z"),
    w: r.strictNum("w"),
    d: r.strictNum("d"),
    h: r.strictNum("h"),
    rotated: r.bool("rotated", false),
    wall: r.strictNum("wall"),
    floor: r.strictNum("floor"),
    lip: r.bool("lip"),
    solid: r.bool("solid", false),
    compartments: r.objects("compartments", []).map(readCompartment),
    ...(r.has("features") ? { features: r.objects("features").map(readFeature) } : {}),
  });
}

/**
 * A stored layout never makes a project unloadable: if it can't be read it is
 * dropped with a notice and the project is optimized again. In newer-minor
 * files a tray with values this app doesn't know is kept verbatim (shown, but
 * geometry refuses to export it).
 */
export function readLayout(raw: unknown, ctx: Ctx): StoredLayout | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const dropped = (reason: string): undefined => {
    ctx.notices.push({
      level: "warning",
      code: SCHEMA_NOTICE_CODES.layoutDropped,
      path: "/layout",
      message: `The saved layout couldn't be read (${reason}). The insert will be optimized again.`,
    });
    return undefined;
  };
  if (!isRecord(raw)) {
    return dropped("/layout: expected an object");
  }
  const sub = childCtx(ctx);
  const r = new Reader(raw, "/layout", sub);
  const unsupported: string[] = [];
  const trays = r.objects("trays").map((t) => {
    const traySub = childCtx(sub);
    const tray = readTray(new Reader(t.raw, t.path, traySub));
    if (traySub.unknownValues.length > 0) {
      // Kept as is even if it also lacks fields: its shape is a newer one.
      unsupported.push(tray.key || t.path);
      return verbatim<TraySpec>(t.raw);
    }
    absorbErrors(sub, traySub);
    adopt(sub, traySub);
    return tray;
  });
  const layout: StoredLayout = r.finish({
    createdWith: r.str("createdWith", UNKNOWN_APP_VERSION),
    geometryVersion: r.str("geometryVersion"),
    inputsHash: r.str("inputsHash"),
    seed: r.strictNum("seed"),
    iterations: r.strictNum("iterations"),
    capped: r.bool("capped", false),
    trays,
  });
  if (sub.errors.length > 0 || sub.unknownValues.length > 0) {
    const problems = [...sub.errors, ...sub.unknownValues.map((p) => `${p}: unknown value`)];
    return dropped(summarize(problems, sub.omitted));
  }
  adopt(ctx, sub);
  if (unsupported.length > 0) {
    ctx.notices.push({
      level: "warning",
      code: SCHEMA_NOTICE_CODES.layoutUnsupportedTrays,
      path: "/layout/trays",
      message: `Some trays use features this app version can't build (${summarize(unsupported.map(shorten))}). They are shown but can't be exported.`,
    });
  }
  return layout;
}
