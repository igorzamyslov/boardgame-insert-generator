import type { Json } from "./json";
import { escapePointerKey, isRecord, quote, shorten } from "./json";
import type { Notice } from "./types";

// The read machinery behind schema-read.ts: a per-scope context and a Reader
// that pulls typed fields out of one JSON object.

/** Collected problems per scope; summarize() shows three, so keeping more only costs memory. */
const MAX_ERRORS = 100;

/** Shared state of one read. Child scopes (a component, a lock, a tray) get their own errors. */
export interface Ctx {
  /** File is from a newer MINOR of the same line: keep unknown fields, don't fail on unknown values. */
  newer: boolean;
  /** Structural problems (at most MAX_ERRORS); any left at the end of a scope make that scope unreadable. */
  errors: string[];
  /** Structural problems beyond MAX_ERRORS, counted but not kept. */
  omitted: number;
  /** Newer files only: paths of enum values this app doesn't know. */
  unknownValues: string[];
  /** Same-or-older files only: paths of unknown fields that were dropped. */
  dropped: string[];
  notices: Notice[];
}

export function newCtx(newer: boolean): Ctx {
  return { newer, errors: [], omitted: 0, unknownValues: [], dropped: [], notices: [] };
}

export function childCtx(ctx: Ctx): Ctx {
  return newCtx(ctx.newer);
}

/** Records a structural problem, keeping only the first MAX_ERRORS of them. */
export function addError(ctx: Ctx, message: string): void {
  if (ctx.errors.length < MAX_ERRORS) {
    ctx.errors.push(message);
  } else {
    ctx.omitted += 1;
  }
}

/** Passes a failed child scope's problems on to its parent. */
export function absorbErrors(parent: Ctx, child: Ctx): void {
  for (const message of child.errors) {
    addError(parent, message);
  }
  parent.omitted += child.omitted;
}

/** Where a kept item was in the file and where it is in the loaded project. */
export interface Rebase {
  from: string; // e.g. "/components/3"
  to: string; // e.g. "/components/1"
}

/** `path` moved from `rebase.from` to `rebase.to`, if it is inside it. */
function rebased(path: string, rebase: Rebase): string {
  return path === rebase.from || path.startsWith(`${rebase.from}/`)
    ? `${rebase.to}${path.slice(rebase.from.length)}`
    : path;
}

/**
 * Keeps a child scope's dropped-field paths and notices once the scope itself
 * is kept. With `rebase`, notice paths are moved from the item's place in the
 * file to its place in the project, so they point at the loaded data. Dropped
 * fields keep their file paths: they aren't in the project.
 */
export function adopt(parent: Ctx, child: Ctx, rebase?: Rebase): void {
  for (const path of child.dropped) {
    parent.dropped.push(path);
  }
  for (const notice of child.notices) {
    parent.notices.push(
      rebase && notice.path !== undefined
        ? { ...notice, path: rebased(notice.path, rebase) }
        : notice,
    );
  }
}

/** Reads one of `allowed`. An unknown value is an error, or in newer files a recorded unknown value. */
export function readEnum<T extends string>(
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
  } else if (value === undefined) {
    addError(ctx, `${path}: missing`);
  } else {
    addError(
      ctx,
      `${path}: ${typeof value === "string" ? `unknown value ${quote(value)}` : "expected text"}`,
    );
  }
  return fallback ?? allowed[0];
}

/** Reads typed fields from one JSON object and remembers which keys it used. */
export class Reader {
  readonly raw: Json;
  readonly path: string;
  readonly ctx: Ctx;
  private readonly used = new Set<string>();

  constructor(raw: Json, path: string, ctx: Ctx) {
    this.raw = raw;
    this.path = path;
    this.ctx = ctx;
  }

  /** JSON pointer of a key of this object. */
  at(key: string): string {
    return `${this.path}/${escapePointerKey(key)}`;
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
    addError(this.ctx, `${this.at(key)}: ${message}`);
  }

  /**
   * A number the user types (box, settings, components). JSON has no NaN:
   * JSON.stringify writes a NaN (a half-edited field) as null, so null reads
   * back as NaN and validateProject() reports the field instead of the file
   * becoming unloadable.
   */
  num(key: string, fallback?: number): number {
    if (this.raw[key] === null) {
      this.used.add(key);
      return Number.NaN;
    }
    return this.strictNum(key, fallback);
  }

  /** A finite number; null is damage. For computed data (a stored layout) that must never hold NaN. */
  strictNum(key: string, fallback?: number): number {
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

  /**
   * Like oneOf, for the field that decides which other fields exist (a kind or
   * type). Null when the value is missing or unknown (the problem is recorded),
   * so the caller can stop instead of reading fields of a shape that isn't there.
   */
  tag<T extends string>(key: string, allowed: readonly [T, ...T[]]): T | null {
    const v = this.take(key);
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) {
      return v as T;
    }
    readEnum(v, allowed, this.at(key), this.ctx);
    return null;
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
        addError(this.ctx, `${this.at(key)}/${i}: expected an object`);
      }
    });
    return out;
  }

  /**
   * Call after reading every known key. Newer files: unknown keys are kept
   * (spec §9: preserved verbatim on save), as copies, so the result never
   * shares objects with the input. Otherwise they are dropped and reported once.
   */
  finish<T extends object>(value: T): T {
    const unknown = Object.keys(this.raw).filter((k) => !this.used.has(k));
    if (unknown.length === 0) {
      return value;
    }
    if (!this.ctx.newer) {
      for (const k of unknown) {
        this.ctx.dropped.push(this.at(shorten(k)));
      }
      return value;
    }
    const rest: Json = {};
    for (const k of unknown) {
      // defineProperty, not assignment: a "__proto__" field must stay an own property.
      Object.defineProperty(rest, k, {
        value: structuredClone(this.raw[k]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return { ...rest, ...value };
  }
}
