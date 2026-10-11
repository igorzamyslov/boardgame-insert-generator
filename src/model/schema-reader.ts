import type { Json } from "./json";
import { isRecord } from "./json";
import type { Notice } from "./types";

// The read machinery behind schema-read.ts: a per-scope context and a Reader
// that pulls typed fields out of one JSON object.

export /** Shared state of one read. Child scopes (a component, a lock, a tray) get their own errors. */
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

export function childCtx(ctx: Ctx): Ctx {
  return { newer: ctx.newer, errors: [], unknownValues: [], dropped: [], notices: [] };
}

/** Keeps a child scope's dropped-field paths and notices once the scope itself is kept. */
export function adopt(parent: Ctx, child: Ctx): void {
  parent.dropped.push(...child.dropped);
  parent.notices.push(...child.notices);
}

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
  } else {
    ctx.errors.push(
      `${path}: ${value === undefined ? "missing" : `unknown value ${JSON.stringify(value)}`}`,
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
