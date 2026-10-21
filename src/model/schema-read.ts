import { DEFAULT_BOX, DEFAULT_PRINTER, DEFAULT_PROJECT_NAME } from "./defaults";
import { newId } from "./ids";
import type { Json } from "./json";
import { isRecord, MAX_JSON_DEPTH, pointerKeys, quote, summarize, valueAt } from "./json";
import { readComponents } from "./schema-read-components";
import { readGroups } from "./schema-read-groups";
import { readLayout } from "./schema-read-layout";
import type { Ctx } from "./schema-reader";
import { addError, adopt, childCtx, newCtx, Reader, SCHEMA_NOTICE_CODES } from "./schema-reader";
import { DEFAULT_SETTINGS } from "./settings";
import type { Box, ForeignData, Lock, ParseResult, Printer, Project, Settings } from "./types";
import { UNKNOWN_APP_VERSION } from "./version";

// Turns untrusted project JSON of a known schema line into a typed Project.
// Version dispatch (which line, newer or not, migrations) lives in schema.ts.

/** The error for input nested deeper than MAX_JSON_DEPTH (parseProjectWith checks before migrations run). */
export const TOO_DEEP_ERROR = `This project file is damaged: nested too deeply (more than ${MAX_JSON_DEPTH} levels).`;

/** One unknown value kept from a newer-minor file (spec §9), written back on save. */
export type ForeignValue = NonNullable<ForeignData["values"]>[number];

function readLock(r: Reader): Lock | null {
  const kind = r.tag("kind", ["position", "size", "stack", "turn"]);
  switch (kind) {
    case "position":
      return r.finish({
        kind,
        trayKey: r.str("trayKey"),
        path: r.str("path"),
        rotated: r.bool("rotated", false),
      });
    case "turn":
      return r.finish({
        kind,
        trayKey: r.str("trayKey"),
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
 * A lock as far as the file says what it is, for notices about locks that
 * aren't in the project: `"size" lock for tray "a:p0:0" (lock 4 in the file)`.
 */
function describeLock(raw: unknown, index: number): string {
  const fields = isRecord(raw) ? raw : {};
  const kind = typeof fields.kind === "string" ? `${quote(fields.kind)} rule` : "rule";
  const tray = typeof fields.trayKey === "string" ? ` for tray ${quote(fields.trayKey)}` : "";
  return `${kind}${tray} (rule ${index + 1} in the file)`;
}

/**
 * Locks are always droppable (spec §7.2): an unreadable lock is dropped with a
 * notice that names it and says why, never fatal. In newer-minor files a lock
 * of an unknown kind is not applied but kept verbatim in `kept` (its path
 * indexes the surviving locks, not the file), and written back at that index
 * on save. Notices about dropped or kept locks point into the file, as those
 * locks aren't in project.locks.
 */
function readLocks(list: unknown[], ctx: Ctx): { locks: Lock[]; kept: ForeignValue[] } {
  const locks: Lock[] = [];
  const kept: ForeignValue[] = [];
  list.forEach((raw, i) => {
    const path = `/locks/${i}`;
    const sub = childCtx(ctx);
    let lock: Lock | null = null;
    if (isRecord(raw)) {
      lock = readLock(new Reader(raw, path, sub));
    } else {
      addError(sub, `${path}: expected an object`);
    }
    if (lock && sub.errors.length === 0 && sub.unknownValues.length === 0) {
      adopt(ctx, sub, { from: path, to: `/locks/${locks.length}` });
      locks.push(lock);
    } else if (ctx.newer && sub.unknownValues.length > 0) {
      // The index among surviving locks: it is where the lock goes in the saved
      // array, which has no room for the dropped ones ahead of it in the file.
      kept.push({ path: `/locks/${locks.length + kept.length}`, raw: structuredClone(raw) });
      ctx.notices.push({
        level: "warning",
        code: SCHEMA_NOTICE_CODES.unknownValue,
        path,
        message: `The ${describeLock(raw, i)} is of a kind this app version doesn't know. It is saved back unchanged, but not applied.`,
      });
    } else {
      ctx.notices.push({
        level: "warning",
        code: SCHEMA_NOTICE_CODES.lockDropped,
        path,
        message: `Couldn't read the ${describeLock(raw, i)}, so it was dropped: ${summarize(sub.errors, sub.omitted)}.`,
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
/**
 * What a file with no `lip` (or no `lip.enabled`) means: the rim between layers is off. New inserts
 * start with it on (DEFAULT_SETTINGS), but older and hand-written files were made when the default
 * was off and keep that meaning. Saved projects carry the value, so this only reaches such files.
 */
export const LIP_ENABLED_WHEN_ABSENT = false;

/**
 * What a file with no `mergeRisers` means: risers stay parts of their own. New inserts start with
 * them folded into the joined spacers (DEFAULT_SETTINGS, 0.10.0), but a project saved before then
 * left the switch out at its default of off, so a file that says nothing keeps that meaning. A
 * project written now carries the value unless it is off (toSerializable), so this only reaches
 * such files.
 */
export const MERGE_RISERS_WHEN_ABSENT = false;

function readSettings(r: Reader | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  if (!r) {
    const whole = structuredClone(d);
    whole.lip.enabled = LIP_ENABLED_WHEN_ABSENT;
    whole.mergeRisers = MERGE_RISERS_WHEN_ABSENT;
    return whole;
  }
  const fp = r.optChild("fingerPocket");
  const lip = r.optChild("lip");
  // `wallAbsorb` was called `wallGrowth` up to schema 0.1.7: a file that only has the old key keeps
  // its value (read either way, so the old key is never reported as an unknown field).
  const legacyWallAbsorb = r.num("wallGrowth", d.wallAbsorb);
  // `engraveNames` was called `engraveNumbers` up to schema 0.1.15 (it engraved the part's number):
  // a file that only has the old key keeps its value.
  const legacyEngrave = r.bool("engraveNumbers", d.engraveNames);
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
          floorNotch: fp.num("floorNotch", d.fingerPocket.floorNotch),
          wallRoom: fp.num("wallRoom", d.fingerPocket.wallRoom),
          dividerRoom: fp.num("dividerRoom", d.fingerPocket.dividerRoom),
        })
      : { ...d.fingerPocket },
    lip: lip
      ? lip.finish({
          enabled: lip.bool("enabled", LIP_ENABLED_WHEN_ABSENT),
          height: lip.num("height", d.lip.height),
          thickness: lip.num("thickness", d.lip.thickness),
          ledge: lip.num("ledge", d.lip.ledge),
          play: lip.num("play", d.lip.play),
        })
      : { ...d.lip, enabled: LIP_ENABLED_WHEN_ABSENT },
    topPressFit: r.num("topPressFit", d.topPressFit),
    packingFactor: r.num("packingFactor", d.packingFactor),
    leftover: r.oneOf("leftover", ["spare", "solid"], d.leftover),
    fillToTop: r.bool("fillToTop", d.fillToTop),
    minRiser: r.num("minRiser", d.minRiser),
    wallAbsorb: r.num("wallAbsorb", legacyWallAbsorb),
    oneWall: r.bool("oneWall", d.oneWall),
    mergeFillers: r.bool("mergeFillers", d.mergeFillers),
    mergeRisers: r.bool("mergeRisers", MERGE_RISERS_WHEN_ABSENT),
    infill: r.num("infill", d.infill),
    playLimit: r.num("playLimit", d.playLimit),
    engraveNames: r.bool("engraveNames", legacyEngrave),
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
 * errors. Unreadable locks and layouts are dropped with a notice. Does not
 * validate bounds; see validateProject().
 *
 * Precondition: callers must reject input deeper than MAX_JSON_DEPTH first
 * (parseProjectWith does), because reading recurses and structuredClones kept
 * values. Use parseProject or parseProjectWith rather than calling this directly.
 */
export function readProject(data: Json, opts: ReadOptions): ParseResult {
  const ctx = newCtx(opts.newer);
  const r = new Reader(data, "", ctx);
  r.take("schemaVersion");
  const createdWith = r.str("createdWith", UNKNOWN_APP_VERSION);
  const id = r.optStr("id") ?? newId();
  const name = r.str("name", DEFAULT_PROJECT_NAME);
  const box = readBox(r.child("box"));
  const printer = readPrinter(r.child("printer"));
  const settings = readSettings(r.optChild("settings"));
  const { components, foreign } = readComponents(r.list("components", []), ctx);
  const groups = readGroups(r.list("groups", []), ctx);
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
    ...(groups.length > 0 ? { groups } : {}),
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
      code: SCHEMA_NOTICE_CODES.unknownValue,
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
      code: SCHEMA_NOTICE_CODES.unknownFields,
      message: `Ignored unknown fields in the file: ${summarize(ctx.dropped)}.`,
    });
  }
  return { ok: true, project, foreign, notices: ctx.notices };
}
