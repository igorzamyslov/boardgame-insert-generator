import { DEFAULT_BOX, DEFAULT_PRINTER, DEFAULT_PROJECT_NAME } from "./defaults";
import { newId } from "./ids";
import type { Json } from "./json";
import {
  isRecord,
  jsonDepthExceeds,
  MAX_JSON_DEPTH,
  pointerKeys,
  summarize,
  valueAt,
} from "./json";
import { readComponents } from "./schema-read-components";
import { readLayout } from "./schema-read-layout";
import type { Ctx } from "./schema-reader";
import { addError, adopt, childCtx, newCtx, Reader } from "./schema-reader";
import { DEFAULT_SETTINGS } from "./settings";
import type { Box, ForeignData, Lock, ParseResult, Printer, Project, Settings } from "./types";

// Turns untrusted project JSON of a known schema line into a typed Project.
// Version dispatch (which line, newer or not, migrations) lives in schema.ts.

/** The error for input nested deeper than MAX_JSON_DEPTH (also used before migrations run). */
export const TOO_DEEP_ERROR = `This project file is damaged: nested too deeply (more than ${MAX_JSON_DEPTH} levels).`;

type ForeignValue = NonNullable<ForeignData["values"]>[number];

function readLock(r: Reader): Lock | null {
  const kind = r.tag("kind", ["position", "size", "stack"]);
  switch (kind) {
    case "position":
      return r.finish({
        kind,
        trayKey: r.str("trayKey"),
        path: r.str("path"),
        rotated: r.bool("rotated", false),
      });
    case "size":
      return r.finish({
        kind,
        trayKey: r.str("trayKey"),
        // Size locks are computed from a layout, so never NaN (unlike what the user types).
        w: r.strictNum("w"),
        d: r.strictNum("d"),
        h: r.strictNum("h"),
      });
    case "stack": {
      const trayKeys = r.list("trayKeys").map((k, i) => {
        if (typeof k !== "string") {
          addError(r.ctx, `${r.at("trayKeys")}/${i}: expected text`);
        }
        return String(k);
      });
      return r.finish({ kind, trayKeys });
    }
    case null:
      return null;
  }
}

/**
 * Locks are always droppable (spec §7.2): an unreadable lock is dropped with a
 * notice, never fatal. In newer-minor files a lock of an unknown kind is not
 * applied but kept verbatim in `kept` (its path indexes the surviving locks,
 * not the file), and written back at that index on save.
 */
function readLocks(list: unknown[], ctx: Ctx): { locks: Lock[]; kept: ForeignValue[] } {
  const locks: Lock[] = [];
  const kept: ForeignValue[] = [];
  list.forEach((raw, i) => {
    const path = `/locks/${i}`;
    const sub = childCtx(ctx);
    const lock = isRecord(raw) ? readLock(new Reader(raw, path, sub)) : null;
    if (lock && sub.errors.length === 0 && sub.unknownValues.length === 0) {
      locks.push(lock);
      adopt(ctx, sub);
    } else if (ctx.newer && sub.unknownValues.length > 0) {
      // The index among surviving locks: it is where the lock goes in the saved
      // array, which has no room for the dropped ones ahead of it in the file.
      kept.push({ path: `/locks/${locks.length + kept.length}`, raw: structuredClone(raw) });
      ctx.notices.push({
        level: "warning",
        code: "schema.unknownValue",
        path,
        message:
          "This lock is of a kind this app version doesn't know. It is kept and saved back, but not applied.",
      });
    } else {
      ctx.notices.push({
        level: "warning",
        code: "lock.dropped",
        path,
        message: "A saved lock couldn't be read and was dropped.",
      });
    }
  });
  return { locks, kept };
}

function readBox(r: Reader | null): Box {
  if (!r) {
    return {
      innerWidth: 0,
      innerDepth: 0,
      innerHeight: 0,
      headroom: 0,
      headroomCoverage: "full",
      storedOnSide: false,
    };
  }
  return r.finish({
    innerWidth: r.num("innerWidth"),
    innerDepth: r.num("innerDepth"),
    innerHeight: r.num("innerHeight"),
    headroom: r.num("headroom", DEFAULT_BOX.headroom),
    headroomCoverage: r.oneOf(
      "headroomCoverage",
      ["full", "partial"],
      DEFAULT_BOX.headroomCoverage,
    ),
    storedOnSide: r.bool("storedOnSide", DEFAULT_BOX.storedOnSide),
  });
}

function readPrinter(r: Reader | null): Printer {
  if (!r) {
    return { bedX: 0, bedY: 0, bedZ: 0, bedMargin: 0, layerHeight: 0 };
  }
  return r.finish({
    bedX: r.num("bedX"),
    bedY: r.num("bedY"),
    bedZ: r.num("bedZ"),
    bedMargin: r.num("bedMargin", DEFAULT_PRINTER.bedMargin),
    layerHeight: r.num("layerHeight", DEFAULT_PRINTER.layerHeight),
  });
}

/** Every missing setting gets its spec §5 default (older-minor files, spec §9). */
function readSettings(r: Reader | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  if (!r) {
    return structuredClone(d);
  }
  const fp = r.optChild("fingerPocket");
  const lip = r.optChild("lip");
  return r.finish({
    wall: r.num("wall", d.wall),
    floor: r.num("floor", d.floor),
    divider: r.num("divider", d.divider),
    fit: r.num("fit", d.fit),
    cardClearance: r.num("cardClearance", d.cardClearance),
    cardStackClearance: r.num("cardStackClearance", d.cardStackClearance),
    cardStackClearancePct: r.num("cardStackClearancePct", d.cardStackClearancePct),
    cardThickness: r.num("cardThickness", d.cardThickness),
    pieceClearance: r.num("pieceClearance", d.pieceClearance),
    boxClearance: r.num("boxClearance", d.boxClearance),
    trayGap: r.num("trayGap", d.trayGap),
    bottomChamfer: r.num("bottomChamfer", d.bottomChamfer),
    cornerRadius: r.num("cornerRadius", d.cornerRadius),
    scoopRadius: r.num("scoopRadius", d.scoopRadius),
    fingerPocket: fp
      ? fp.finish({
          width: fp.num("width", d.fingerPocket.width),
          reach: fp.num("reach", d.fingerPocket.reach),
        })
      : { ...d.fingerPocket },
    lip: lip
      ? lip.finish({
          enabled: lip.bool("enabled", d.lip.enabled),
          height: lip.num("height", d.lip.height),
          thickness: lip.num("thickness", d.lip.thickness),
          ledge: lip.num("ledge", d.lip.ledge),
          play: lip.num("play", d.lip.play),
        })
      : { ...d.lip },
    topPressFit: r.num("topPressFit", d.topPressFit),
    packingFactor: r.num("packingFactor", d.packingFactor),
    leftover: r.oneOf("leftover", ["spare", "solid"], d.leftover),
  });
}

export interface ReadOptions {
  /** The file is from a newer MINOR of this app's line (spec §9). */
  newer: boolean;
  /** Written to project.schemaVersion. */
  schemaVersion: string;
}

/**
 * Reads project JSON whose schema line this app supports. Missing optional
 * fields get defaults. With `newer`, unknown fields are kept, unknown
 * components (or components with unknown values) become foreign, unknown
 * box/printer/settings values fall back to defaults with a warning and go to
 * `foreign.values` (with the raw value), and locks of an unknown kind go to
 * `foreign.values` unapplied. Without `newer`,
 * unknown fields are dropped with one info notice and unknown values are
 * errors. Unreadable locks and layouts are dropped with a notice. Input nested
 * deeper than MAX_JSON_DEPTH is an error. Does not validate bounds; see
 * validateProject().
 */
export function readProject(data: Json, opts: ReadOptions): ParseResult {
  // Before anything recursive (structuredClone of kept values, hashing, saving) sees the data.
  if (jsonDepthExceeds(data, MAX_JSON_DEPTH)) {
    return { ok: false, error: TOO_DEEP_ERROR };
  }
  const ctx = newCtx(opts.newer);
  const r = new Reader(data, "", ctx);
  r.take("schemaVersion");
  const createdWith = r.str("createdWith", "unknown");
  const id = r.optStr("id") ?? newId();
  const name = r.str("name", DEFAULT_PROJECT_NAME);
  const box = readBox(r.child("box"));
  const printer = readPrinter(r.child("printer"));
  const settings = readSettings(r.optChild("settings"));
  const { components, foreign } = readComponents(r.list("components", []), ctx);
  const { locks, kept } = readLocks(r.list("locks", []), ctx);
  const layout = readLayout(r.take("layout"), ctx);
  // finish() last: it treats every key not read so far as unknown.
  const project: Project = r.finish({
    schemaVersion: opts.schemaVersion,
    createdWith,
    id,
    name,
    box,
    printer,
    settings,
    components,
    locks,
  });
  if (layout) {
    project.layout = layout;
  }
  if (ctx.errors.length > 0) {
    return {
      ok: false,
      error: `This project file is damaged: ${summarize(ctx.errors, ctx.omitted)}.`,
    };
  }
  // Box, printer and settings values this app doesn't know: the project uses
  // the default, and serializeProject writes the original back (spec §9).
  const values: ForeignValue[] = ctx.unknownValues.map((path) => ({
    path,
    raw: structuredClone(valueAt(data, pointerKeys(path))),
  }));
  for (const path of ctx.unknownValues) {
    ctx.notices.push({
      level: "warning",
      code: "schema.unknownValue",
      path,
      message:
        "This setting uses a value this app version doesn't know. The default is used here; the original value is saved back unless you change this setting.",
    });
  }
  for (const value of kept) {
    values.push(value);
  }
  if (values.length > 0) {
    foreign.values = values;
  }
  if (ctx.dropped.length > 0) {
    ctx.notices.push({
      level: "info",
      code: "schema.unknownFields",
      message: `Ignored unknown fields: ${summarize(ctx.dropped)}.`,
    });
  }
  return { ok: true, project, foreign, notices: ctx.notices };
}
