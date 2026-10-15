import { DEFAULT_BOX, DEFAULT_PRINTER } from "./defaults";
import { deepFreeze } from "./freeze";
import type { Json } from "./json";
import {
  isArrayIndex,
  isRecord,
  jsonDepthExceeds,
  MAX_JSON_DEPTH,
  pointerKeys,
  summarize,
  valueAt,
} from "./json";
import type { ForeignValue } from "./schema-read";
import { readProject, TOO_DEEP_ERROR } from "./schema-read";
import { spareCompartment } from "./schema-read-layout";
import { SCHEMA_NOTICE_CODES } from "./schema-reader";
import { DEFAULT_SETTINGS } from "./settings";
import type { ForeignData, Notice, ParseResult, Project } from "./types";
import { isBlocking, validateProject } from "./validate";
import type { Semver } from "./version";
import { APP_VERSION, SCHEMA_VERSION, UNKNOWN_APP_VERSION, parseSemver } from "./version";

export { SCHEMA_NOTICE_CODES } from "./schema-reader";

/**
 * A compatibility line groups versions that read each other's files (spec §9).
 * From 1.0 on it is the MAJOR ("1", "2") and MINOR is the additive part.
 * While MAJOR is 0 the spec promises nothing, so each 0.MINOR is its own line
 * ("0.1", "0.2") and PATCH plays the additive part: app 0.1.0 reads 0.1.x
 * (newer patches with a warning), refuses 0.2.0, and needs a migration for
 * 0.0.x. From 1.0 on, every 0.x file is refused outright.
 */
interface Compat {
  line: string;
  rank: [number, number];
  sub: number;
}

function compat(v: Semver): Compat {
  return v.major === 0
    ? { line: `0.${v.minor}`, rank: [0, v.minor], sub: v.patch }
    : { line: String(v.major), rank: [v.major, 0], sub: v.minor };
}

function compareRank(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

/** Upgrades raw project JSON from one compatibility line to a later one. */
export interface Migration {
  from: string; // compatibility line it reads, e.g. "1" or "0.1"
  to: string; // schema version its output conforms to, e.g. "2.0.0"
  migrate: (raw: Json) => Json;
}

/**
 * Registered migrations. Empty before 1.0 (0.x promises no compatibility).
 * From 1.0 on, every schema MAJOR bump adds one migration from the previous
 * line, and a saved file of the old MAJOR to test/fixtures/schema/. Frozen.
 */
export const MIGRATIONS: Migration[] = deepFreeze([]);

export interface ParseOptions {
  appSchemaVersion: string;
  migrations: readonly Migration[];
  /**
   * Refuse input over the spec §5 upper bounds (`limit.*` notices). Default
   * true, for links and files. ProjectStore.load passes false so the user's
   * own autosave always opens; validateProject() still reports the limits.
   * Corrupt structure (`invalid.*`) is refused either way.
   */
  enforceBounds?: boolean;
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}

function parseWith(raw: unknown, opts: ParseOptions, app: Semver): ParseResult {
  // Before anything recursive (structuredClone for migrations, the reader) sees the input.
  if (jsonDepthExceeds(raw, MAX_JSON_DEPTH)) {
    return fail(TOO_DEEP_ERROR);
  }
  if (!isRecord(raw)) {
    return fail("This is not an insert generator project (expected a JSON object).");
  }
  const fileVersion = raw.schemaVersion;
  if (typeof fileVersion !== "string") {
    return fail("This is not an insert generator project (it has no schemaVersion).");
  }
  const file = parseSemver(fileVersion);
  if (!file) {
    return fail(`This project has an unreadable schema version "${fileVersion}".`);
  }
  const createdWith = typeof raw.createdWith === "string" ? raw.createdWith : UNKNOWN_APP_VERSION;
  const appCompat = compat(app);

  if (app.major >= 1 && file.major === 0) {
    return fail(
      `This project was made with a preview version of the app (${createdWith}, schema ${fileVersion}). Preview projects can't be opened by app ${APP_VERSION}.`,
    );
  }

  const notices: Notice[] = [];
  let data: Json = raw;
  let version = file;
  let versionText = fileVersion;
  while (compareRank(compat(version).rank, appCompat.rank) < 0) {
    const from = compat(version);
    const step = opts.migrations.find((m) => m.from === from.line);
    const to = step ? parseSemver(step.to) : null;
    // A step must move to a later line; anything else would loop forever.
    if (!step || !to || compareRank(compat(to).rank, from.rank) <= 0) {
      return fail(
        `This project uses schema ${fileVersion}, which app ${APP_VERSION} (schema ${opts.appSchemaVersion}) can no longer read: no migration from schema line ${from.line}.`,
      );
    }
    data = { ...step.migrate(structuredClone(data)), schemaVersion: step.to };
    version = to;
    versionText = step.to;
  }
  if (version !== file) {
    notices.push({
      level: "info",
      code: SCHEMA_NOTICE_CODES.migrated,
      message: `Upgraded from schema ${fileVersion} to ${opts.appSchemaVersion}.`,
    });
  }

  const fileCompat = compat(version);
  if (compareRank(fileCompat.rank, appCompat.rank) > 0) {
    return fail(
      `This project was made with app ${createdWith} (schema ${fileVersion}); this is app ${APP_VERSION} (schema ${opts.appSchemaVersion}). Update the app to open it.`,
    );
  }
  const newer = fileCompat.sub > appCompat.sub;
  if (newer) {
    notices.push({
      level: "warning",
      code: SCHEMA_NOTICE_CODES.newerMinor,
      message: `Made with app ${createdWith} (schema ${versionText}), which is newer than this app (${APP_VERSION}, schema ${opts.appSchemaVersion}). Parts this app doesn't know are kept but not laid out. Re-optimizing needs confirmation.`,
    });
  }

  // The file now conforms to this app's schema, unless it came from a newer
  // minor: then it keeps its version, so its preserved extras stay meaningful.
  const result = readProject(data, {
    newer,
    schemaVersion: newer
      ? `${version.major}.${version.minor}.${version.patch}`
      : opts.appSchemaVersion,
  });
  if (!result.ok) {
    return result;
  }
  const enforceBounds = opts.enforceBounds ?? true;
  const blocking = validateProject(result.project).filter(
    (n) => isBlocking(n) && (enforceBounds || !n.code.startsWith("limit.")),
  );
  if (blocking.length > 0) {
    const items = blocking.map((n) => {
      const message = n.message.replace(/\.$/, "");
      return n.path === undefined ? message : `${n.path}: ${message}`;
    });
    return fail(`This project can't be opened: ${summarize(items)}.`);
  }
  return { ...result, notices: [...notices, ...result.notices] };
}

/**
 * parseProject with an injectable migration registry (tests use a fake one).
 * Never throws for any `raw`: an unexpected failure in reading, migrating or
 * validating becomes an error result (and is logged). An invalid
 * `appSchemaVersion` is a programming error and does throw.
 */
export function parseProjectWith(raw: unknown, opts: ParseOptions): ParseResult {
  const app = parseSemver(opts.appSchemaVersion);
  if (!app) {
    throw new Error(`Invalid app schema version "${opts.appSchemaVersion}"`);
  }
  try {
    return parseWith(raw, opts, app);
  } catch (error) {
    console.error("Reading a project failed unexpectedly", error);
    return fail("This project file could not be read.");
  }
}

/**
 * Reads untrusted project JSON (link, file, localStorage) per spec §9: fills
 * defaults, keeps newer-minor extras, migrates older lines, refuses newer
 * lines and (from 1.0 on) 0.x files, and refuses input over the spec §5 upper
 * bounds. Field-level problems don't block loading; call validateProject().
 * Never throws for any `raw`; throws only for an invalid `appSchemaVersion`
 * argument (a programming error).
 */
export function parseProject(raw: unknown, appSchemaVersion = SCHEMA_VERSION): ParseResult {
  return parseProjectWith(raw, { appSchemaVersion, migrations: MIGRATIONS });
}

/**
 * parseProject for the user's own local autosave (ProjectStore.load): the same
 * schema version and migrations, but input over the spec §5 upper bounds still
 * opens, so an autosave never locks the user out. validateProject() reports the
 * limits; corrupt structure (`invalid.*`) is still refused. Never throws.
 */
export function parseStoredProject(raw: unknown): ParseResult {
  return parseProjectWith(raw, {
    appSchemaVersion: SCHEMA_VERSION,
    migrations: MIGRATIONS,
    enforceBounds: false,
  });
}

/** No foreign components (new projects, and projects from this app version). */
export function noForeign(): ForeignData {
  return { components: [] };
}

/** The defaults readProject substitutes for unknown box/printer/settings values. */
const SUBSTITUTED_DEFAULTS = {
  box: DEFAULT_BOX,
  printer: DEFAULT_PRINTER,
  settings: DEFAULT_SETTINGS,
};

/** Index of an array-element pointer such as "/locks/3", or null for an object field. */
function arrayIndex(out: Json, keys: string[]): number | null {
  const parent = valueAt(out, keys.slice(0, -1));
  const last = keys.at(-1) ?? "";
  return Array.isArray(parent) && isArrayIndex(last) ? Number(last) : null;
}

/**
 * Writes foreign values back (spec §9: unknown values are preserved on save).
 * - Array element (an unknown lock, "/locks/3"): re-inserted at its index,
 *   ascending, like foreign components.
 * - Object field ("/settings/leftover"): the project holds the default that
 *   readProject substituted. The raw value is written back only while the
 *   field still equals that default; any other value means the user changed
 *   the field, and their choice wins. (Re-selecting the default itself can't be
 *   told apart from "unchanged", so the original value is kept in that case.)
 */
function restoreValues(out: Json, values: readonly ForeignValue[]): void {
  const inserts: { keys: string[]; index: number; raw: unknown }[] = [];
  for (const v of values) {
    const keys = pointerKeys(v.path);
    const index = arrayIndex(out, keys);
    if (index !== null) {
      inserts.push({ keys, index, raw: structuredClone(v.raw) });
      continue;
    }
    const parent = valueAt(out, keys.slice(0, -1));
    const last = keys.at(-1);
    const substituted = valueAt(SUBSTITUTED_DEFAULTS, keys);
    if (
      isRecord(parent) &&
      last !== undefined &&
      substituted !== undefined &&
      parent[last] === substituted
    ) {
      // defineProperty, not assignment: a "__proto__" key must stay an own data property.
      Object.defineProperty(parent, last, {
        value: structuredClone(v.raw),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  for (const ins of inserts.sort((a, b) => a.index - b.index)) {
    const parent = valueAt(out, ins.keys.slice(0, -1));
    if (Array.isArray(parent)) {
      parent.splice(Math.min(ins.index, parent.length), 0, ins.raw);
    }
  }
}

/**
 * The object written to links, files and storage: the project with
 * createdWith set to this app (spec §5: "app version that last saved it"),
 * foreign components re-inserted at their original indices, and foreign
 * values written back (see restoreValues). Never modifies `p`, and the result
 * is a deep copy, so callers may change it freely.
 */
export function toSerializable(p: Project, foreign: ForeignData): Json {
  const components: unknown[] = [...p.components];
  for (const f of [...foreign.components].sort((a, b) => a.index - b.index)) {
    components.splice(Math.min(f.index, components.length), 0, f.raw);
  }
  // Always a deep copy: the result shares nothing with `p` or `foreign`.
  const out = structuredClone({ ...p, createdWith: APP_VERSION, components }) as Json;
  restoreValues(out, foreign.values ?? []);
  compactLayout(out);
  compactSettings(out);
  return out;
}

/**
 * The two print-time merge switches at their defaults are left out: reading puts them back, so a
 * share link (2 000 characters) does not pay for two settings nearly every project leaves alone.
 */
function compactSettings(out: Json): void {
  const settings = out.settings;
  if (!isRecord(settings)) {
    return;
  }
  if (settings.mergeFillers === DEFAULT_SETTINGS.mergeFillers) {
    delete settings.mergeFillers;
  }
  if (settings.mergeRisers === DEFAULT_SETTINGS.mergeRisers) {
    delete settings.mergeRisers;
  }
}

/**
 * What a stored layout leaves out because reading puts it back, so a share link (which has to fit
 * a chat message, 2 000 characters) does not pay for it:
 * - a card spacer's fields that are the same on every spacer (a plain solid block: no compartments,
 *   wall or lip);
 * - the one compartment of an open leftover or in-level filler, which is always the spare pocket
 *   spareCompartment describes.
 * Only values equal to what reading restores are dropped, so nothing is lost.
 */
function compactLayout(out: Json): void {
  const layout = out.layout;
  const trays = isRecord(layout) ? layout.trays : undefined;
  if (!Array.isArray(trays)) {
    return;
  }
  for (const tray of trays) {
    if (!isRecord(tray)) {
      continue;
    }
    if (tray.part === "spacer") {
      // every spacer is a plain solid block: no path, turn, wall, floor, lip or compartments
      if (tray.path === "") {
        delete tray.path;
      }
      if (tray.rotated === false) {
        delete tray.rotated;
      }
      if (tray.wall === 0) {
        delete tray.wall;
      }
      if (tray.floor === 0) {
        delete tray.floor;
      }
      if (tray.lip === false) {
        delete tray.lip;
      }
      if (tray.solid === true) {
        delete tray.solid;
      }
      if (Array.isArray(tray.compartments) && tray.compartments.length === 0) {
        delete tray.compartments;
      }
    } else if (tray.part === "leftover" && tray.solid === false) {
      const { w, d, wall, floor } = tray;
      if (
        typeof w === "number" &&
        typeof d === "number" &&
        typeof wall === "number" &&
        typeof floor === "number" &&
        JSON.stringify(tray.compartments) === JSON.stringify([spareCompartment(w, d, wall, floor)])
      ) {
        delete tray.compartments;
      }
    }
  }
}

/** Compact JSON for links and storage. */
export function serializeProject(p: Project, foreign: ForeignData): string {
  return JSON.stringify(toSerializable(p, foreign));
}
