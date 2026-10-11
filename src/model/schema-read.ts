import { DEFAULT_BOX, DEFAULT_PRINTER, DEFAULT_PROJECT_NAME, KIND_NAMES } from "./defaults";
import { newId } from "./ids";
import { DEFAULT_SETTINGS } from "./settings";
import type {
  Box,
  BulkItem,
  CompartmentSpec,
  Component,
  ComponentBase,
  ComponentKind,
  FeatureSpec,
  ForeignData,
  Lock,
  Notice,
  ParseResult,
  Printer,
  Project,
  Settings,
  Sleeve,
  StoredLayout,
  TileShape,
  TraySpec,
} from "./types";

// Turns untrusted project JSON of a known schema line into a typed Project.
// Version dispatch (which line, newer or not, migrations) lives in schema.ts.

export type Json = Record<string, unknown>;

export function isRecord(x: unknown): x is Json {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** RFC 6901 JSON pointer → keys: "/settings/lip/play" → ["settings", "lip", "play"]. */
export function pointerKeys(path: string): string[] {
  return path
    .split("/")
    .slice(1)
    .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** The value at `keys` inside plain JSON data, or undefined. */
export function valueAt(root: unknown, keys: string[]): unknown {
  let node = root;
  for (const k of keys) {
    if (Array.isArray(node)) {
      node = node[Number(k)];
    } else if (isRecord(node)) {
      node = node[k];
    } else {
      return undefined;
    }
  }
  return node;
}

type ForeignValue = NonNullable<ForeignData["values"]>[number];

/** Shared state of one read. Child scopes (a component, a lock, a tray) get their own errors. */
interface Ctx {
  /** File is from a newer MINOR of the same line: keep unknown fields, don't fail on unknown values. */
  newer: boolean;
  /** Structural problems; any left at the end of a scope make that scope unreadable. */
  errors: string[];
  /** Newer files only: paths of enum values this app doesn't know. */
  unknownValues: string[];
  /** Same-or-older files only: paths of unknown fields that were dropped. */
  dropped: string[];
  notices: Notice[];
}

function childCtx(ctx: Ctx): Ctx {
  return { newer: ctx.newer, errors: [], unknownValues: [], dropped: [], notices: [] };
}

/** Keeps a child scope's dropped-field paths and notices once the scope itself is kept. */
function adopt(parent: Ctx, child: Ctx): void {
  parent.dropped.push(...child.dropped);
  parent.notices.push(...child.notices);
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly [T, ...T[]],
  path: string,
  ctx: Ctx,
  fallback?: T,
): T {
  if (value === undefined && fallback !== undefined) {
    return fallback;
  }
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  if (typeof value === "string" && ctx.newer) {
    ctx.unknownValues.push(path);
  } else {
    ctx.errors.push(
      `${path}: ${value === undefined ? "missing" : `unknown value ${JSON.stringify(value)}`}`,
    );
  }
  return fallback ?? allowed[0];
}

/** Reads typed fields from one JSON object and remembers which keys it used. */
class Reader {
  readonly raw: Json;
  readonly path: string;
  readonly ctx: Ctx;
  private readonly used = new Set<string>();

  constructor(raw: Json, path: string, ctx: Ctx) {
    this.raw = raw;
    this.path = path;
    this.ctx = ctx;
  }

  at(key: string): string {
    return `${this.path}/${key}`;
  }

  has(key: string): boolean {
    return this.raw[key] !== undefined;
  }

  /** The raw value, marked as read. */
  take(key: string): unknown {
    this.used.add(key);
    return this.raw[key];
  }

  private problem(key: string, message: string): void {
    this.ctx.errors.push(`${this.at(key)}: ${message}`);
  }

  num(key: string, fallback?: number): number {
    const v = this.take(key);
    if (v === undefined && fallback !== undefined) {
      return fallback;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      return v;
    }
    this.problem(key, v === undefined ? "missing" : "expected a number");
    return 0;
  }

  optNum(key: string): number | undefined {
    if (!this.has(key)) {
      this.used.add(key);
      return undefined;
    }
    return this.num(key);
  }

  str(key: string, fallback?: string): string {
    const v = this.take(key);
    if (v === undefined && fallback !== undefined) {
      return fallback;
    }
    if (typeof v === "string") {
      return v;
    }
    this.problem(key, v === undefined ? "missing" : "expected text");
    return "";
  }

  optStr(key: string): string | undefined {
    if (!this.has(key)) {
      this.used.add(key);
      return undefined;
    }
    return this.str(key);
  }

  bool(key: string, fallback?: boolean): boolean {
    const v = this.take(key);
    if (v === undefined && fallback !== undefined) {
      return fallback;
    }
    if (typeof v === "boolean") {
      return v;
    }
    this.problem(key, v === undefined ? "missing" : "expected true or false");
    return false;
  }

  oneOf<T extends string>(key: string, allowed: readonly [T, ...T[]], fallback?: T): T {
    return readEnum(this.take(key), allowed, this.at(key), this.ctx, fallback);
  }

  /** A nested object; null (and an error) when missing or not an object. */
  child(key: string): Reader | null {
    const v = this.take(key);
    if (isRecord(v)) {
      return new Reader(v, this.at(key), this.ctx);
    }
    this.problem(key, v === undefined ? "missing" : "expected an object");
    return null;
  }

  /** A nested object that may be absent. */
  optChild(key: string): Reader | undefined {
    if (!this.has(key)) {
      this.used.add(key);
      return undefined;
    }
    return this.child(key) ?? undefined;
  }

  list(key: string, fallback?: unknown[]): unknown[] {
    const v = this.take(key);
    if (v === undefined && fallback !== undefined) {
      return fallback;
    }
    if (Array.isArray(v)) {
      return v;
    }
    this.problem(key, v === undefined ? "missing" : "expected a list");
    return [];
  }

  /** A list whose entries must all be objects. */
  objects(key: string, fallback?: unknown[]): Reader[] {
    const out: Reader[] = [];
    this.list(key, fallback).forEach((v, i) => {
      if (isRecord(v)) {
        out.push(new Reader(v, `${this.at(key)}/${i}`, this.ctx));
      } else {
        this.ctx.errors.push(`${this.at(key)}/${i}: expected an object`);
      }
    });
    return out;
  }

  /**
   * Call after reading every known key. Newer files: unknown keys are kept
   * (spec §9: preserved verbatim on save). Otherwise they are dropped and
   * reported once.
   */
  finish<T extends object>(value: T): T {
    const rest: Json = {};
    for (const [k, v] of Object.entries(this.raw)) {
      if (!this.used.has(k)) {
        rest[k] = v;
      }
    }
    const keys = Object.keys(rest);
    if (keys.length === 0) {
      return value;
    }
    if (this.ctx.newer) {
      return { ...rest, ...value };
    }
    for (const k of keys) {
      this.ctx.dropped.push(this.at(k));
    }
    return value;
  }
}

const COMPONENT_KINDS = ["cards", "bulk", "tiles", "minis", "custom"] as const;
const SIDES = ["front", "back", "left", "right"] as const;
const SLEEVE_NAMES = ["none", "standard", "premium"] as const;

function readBase(r: Reader, kind: ComponentKind): ComponentBase {
  const base: ComponentBase = {
    id: r.str("id", newId()),
    name: r.str("name", KIND_NAMES[kind]),
    access: r.oneOf("access", ["often", "sometimes", "setup"], "sometimes"),
  };
  const groupId = r.optStr("groupId");
  if (groupId !== undefined) {
    base.groupId = groupId;
  }
  const perPlayer = r.optChild("perPlayer");
  if (perPlayer) {
    base.perPlayer = perPlayer.finish({ players: perPlayer.num("players") });
  }
  const clearance = r.optNum("clearance");
  if (clearance !== undefined) {
    base.clearance = clearance;
  }
  return base;
}

function readSleeve(r: Reader): Sleeve {
  const v = r.take("sleeve");
  if (isRecord(v)) {
    const s = new Reader(v, r.at("sleeve"), r.ctx);
    return s.finish({ w: s.num("w"), h: s.num("h"), thickness: s.num("thickness") });
  }
  return readEnum(v, SLEEVE_NAMES, r.at("sleeve"), r.ctx, "none");
}

function readCards(r: Reader, base: ComponentBase): Component {
  let shortSide = r.num("shortSide");
  let longSide = r.num("longSide");
  if (shortSide > longSide) {
    [shortSide, longSide] = [longSide, shortSide];
    r.ctx.notices.push({
      level: "info",
      code: "schema.cardSidesSwapped",
      path: r.at("shortSide"),
      message: `Card sides of "${base.name}" were the wrong way round and have been swapped.`,
    });
  }
  const decks = r
    .objects("decks")
    .map((d) => d.finish({ name: d.str("name", ""), count: d.num("count") }));
  const sleeve = readSleeve(r);
  const t = r.optChild("thickness");
  let thickness: { mode: "preset" } | { mode: "measured"; cards: number; stackMm: number } = {
    mode: "preset",
  };
  if (t) {
    const mode = t.oneOf("mode", ["preset", "measured"]);
    thickness = t.finish(
      mode === "measured"
        ? { mode, cards: t.num("cards"), stackMm: t.num("stackMm") }
        : { mode: "preset" as const },
    );
  }
  const storage = r.oneOf("storage", ["upright-long", "upright-short", "flat", "auto"], "auto");
  return r.finish({
    ...base,
    kind: "cards",
    shortSide,
    longSide,
    decks,
    sleeve,
    thickness,
    storage,
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
  const type = s.oneOf("type", ["rect", "hex"]);
  if (type === "hex") {
    return s.finish({
      type,
      flatToFlat: s.num("flatToFlat"),
      orientation: s.oneOf("orientation", ["flat", "pointy"], "flat"),
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
        storage: r.oneOf("storage", ["flat", "upright", "auto"], "auto"),
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
        storage: r.oneOf("storage", ["pockets", "bulk"], "pockets"),
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
 * re-inserted at its original index on save. Other files: it is an error.
 */
function readComponents(
  list: unknown[],
  ctx: Ctx,
): { components: Component[]; foreign: ForeignData } {
  const components: Component[] = [];
  const foreign: ForeignData = { components: [] };
  list.forEach((raw, index) => {
    const path = `/components/${index}`;
    const sub = childCtx(ctx);
    let component: Component | null = null;
    if (!isRecord(raw)) {
      sub.errors.push(`${path}: expected an object`);
    } else {
      const r = new Reader(raw, path, sub);
      const kind = r.oneOf("kind", COMPONENT_KINDS);
      if (sub.errors.length === 0 && sub.unknownValues.length === 0) {
        component = readKnownComponent(r, kind);
      }
    }
    const unreadable = sub.errors.length > 0 || sub.unknownValues.length > 0;
    if (unreadable && ctx.newer) {
      foreign.components.push({ index, raw });
      const name =
        isRecord(raw) && typeof raw.name === "string" ? `"${raw.name}"` : `#${index + 1}`;
      ctx.notices.push({
        level: "warning",
        code: "schema.foreignComponent",
        path,
        message: `Component ${name} uses features this app version doesn't know. It is kept but not laid out.`,
      });
    } else if (unreadable) {
      ctx.errors.push(...sub.errors);
    } else if (component) {
      components.push(component);
      adopt(ctx, sub);
    }
  });
  return { components, foreign };
}

function readLock(r: Reader): Lock {
  const kind = r.oneOf("kind", ["position", "size", "stack"]);
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
        w: r.num("w"),
        d: r.num("d"),
        h: r.num("h"),
      });
    case "stack": {
      const trayKeys = r.list("trayKeys").map((k, i) => {
        if (typeof k !== "string") {
          r.ctx.errors.push(`${r.at("trayKeys")}/${i}: expected text`);
        }
        return String(k);
      });
      return r.finish({ kind, trayKeys });
    }
  }
}

/**
 * Locks are always droppable (spec §7.2): an unreadable lock is dropped with a
 * notice, never fatal. In newer-minor files a lock of an unknown kind is not
 * applied but kept verbatim in `kept`, and written back at its index on save.
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
      kept.push({ path, raw });
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
function readLayout(raw: unknown, ctx: Ctx): StoredLayout | undefined {
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

/** "a; b; c; and 2 more" */
export function summarize(problems: string[]): string {
  const shown = problems.slice(0, 3).join("; ");
  return problems.length > 3 ? `${shown}; and ${problems.length - 3} more` : shown;
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
 */
export function readProject(data: Json, opts: ReadOptions): ParseResult {
  const ctx: Ctx = { newer: opts.newer, errors: [], unknownValues: [], dropped: [], notices: [] };
  const r = new Reader(data, "", ctx);
  r.take("schemaVersion");
  const createdWith = r.str("createdWith", "unknown");
  const id = r.str("id", newId());
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
    return { ok: false, error: `This project file is damaged: ${summarize(ctx.errors)}.` };
  }
  // Box, printer and settings values this app doesn't know: the project uses
  // the default, and serializeProject writes the original back (spec §9).
  const values: ForeignValue[] = ctx.unknownValues.map((path) => ({
    path,
    raw: valueAt(data, pointerKeys(path)),
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
  values.push(...kept);
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
