import { isRecord } from "./json";
import type { Ctx } from "./schema-reader";
import { adopt, childCtx, Reader } from "./schema-reader";
import type { CompartmentSpec, FeatureSpec, StoredLayout, TraySpec } from "./types";

const SIDES = ["front", "back", "left", "right"] as const;

function readFeature(r: Reader): FeatureSpec {
  const known = r.ctx.unknownValues.length;
  const type = r.oneOf("type", ["fingerPocket", "scoop", "cornerRelief"]);
  if (r.ctx.unknownValues.length > known) {
    // Newer file, unknown feature type: keep it verbatim (its fields are unknown too).
    return r.raw as unknown as FeatureSpec;
  }
  switch (type) {
    case "fingerPocket":
      return r.finish({
        type,
        side: r.oneOf("side", SIDES),
        at: r.num("at"),
        width: r.num("width"),
        reach: r.num("reach"),
        depth: r.num("depth"),
      });
    case "scoop":
      return r.finish({ type, side: r.oneOf("side", SIDES), r: r.num("r") });
    case "cornerRelief":
      return r.finish({ type, d: r.num("d") });
  }
}

function readCompartment(r: Reader): CompartmentSpec {
  return r.finish({
    x: r.num("x"),
    y: r.num("y"),
    w: r.num("w"),
    d: r.num("d"),
    floorZ: r.num("floorZ"),
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
    stack: r.num("stack"),
    level: r.num("level"),
    x: r.num("x"),
    y: r.num("y"),
    z: r.num("z"),
    w: r.num("w"),
    d: r.num("d"),
    h: r.num("h"),
    rotated: r.bool("rotated", false),
    wall: r.num("wall"),
    floor: r.num("floor"),
    lip: r.bool("lip"),
    solid: r.bool("solid", false),
    compartments: r.objects("compartments", []).map(readCompartment),
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
  const dropped = (): undefined => {
    ctx.notices.push({
      level: "warning",
      code: "layout.dropped",
      path: "/layout",
      message: "The saved layout couldn't be read. The insert will be optimized again.",
    });
    return undefined;
  };
  if (!isRecord(raw)) {
    return dropped();
  }
  const sub = childCtx(ctx);
  const r = new Reader(raw, "/layout", sub);
  const unsupported: string[] = [];
  const trays = r.objects("trays").map((t) => {
    const traySub = childCtx(sub);
    const tray = readTray(new Reader(t.raw, t.path, traySub));
    sub.errors.push(...traySub.errors);
    if (traySub.unknownValues.length > 0) {
      unsupported.push(tray.key);
      return t.raw as unknown as TraySpec;
    }
    adopt(sub, traySub);
    return tray;
  });
  const layout: StoredLayout = r.finish({
    createdWith: r.str("createdWith", "unknown"),
    geometryVersion: r.str("geometryVersion"),
    inputsHash: r.str("inputsHash"),
    seed: r.num("seed"),
    iterations: r.num("iterations"),
    capped: r.bool("capped", false),
    trays,
  });
  if (sub.errors.length > 0 || sub.unknownValues.length > 0) {
    return dropped();
  }
  adopt(ctx, sub);
  if (unsupported.length > 0) {
    ctx.notices.push({
      level: "warning",
      code: "layout.unsupportedTrays",
      path: "/layout/trays",
      message: `Some trays use features this app version can't build (${unsupported.join(", ")}). They are shown but can't be exported.`,
    });
  }
  return layout;
}
