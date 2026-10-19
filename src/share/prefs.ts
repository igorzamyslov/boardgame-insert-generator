import { signal } from "@preact/signals";
import type { Signal } from "@preact/signals";
import { DEFAULT_PRINTER, newProject } from "../model/defaults";
import { isRecord } from "../model/json";
import type { Printer } from "../model/types";
import { validateProject } from "../model/validate";
import { STORAGE_PREFIX, defaultStorage } from "./store";

const PREFS_KEY = `${STORAGE_PREFIX}prefs`;
const PRINTER_FIELDS = [
  "bedX",
  "bedY",
  "bedZ",
  "bedMargin",
  "layerHeight",
] as const satisfies readonly (keyof Printer)[];

// Adding a field to Printer fails to compile here until PRINTER_FIELDS lists it, so a stored
// entry is never read without it (or silently stripped of it).
type UnlistedPrinterField = Exclude<keyof Printer, (typeof PRINTER_FIELDS)[number]>;
const ALL_PRINTER_FIELDS_LISTED: [UnlistedPrinterField] extends [never] ? true : never = true;
void ALL_PRINTER_FIELDS_LISTED;

/** The rail's width in px: the person sets it between the two with the rail's handle (DESIGN §2, Layout). */
export const RAIL_WIDTH = { min: 300, max: 480, default: 300 } as const;

/** The width as a whole number of px inside the range; a value that is not a number is null. */
export function clampRailWidth(px: unknown): number | null {
  if (typeof px !== "number" || !Number.isFinite(px)) {
    return null;
  }
  return Math.min(RAIL_WIDTH.max, Math.max(RAIL_WIDTH.min, Math.round(px)));
}

export interface PrefsStore {
  /** The printer new inserts start with; the defaults until one is set (or when none can be read). */
  printer: Signal<Printer>;
  /**
   * Remembers this printer for new inserts. A printer that would not validate is ignored. When
   * storage is missing, blocked or full it still holds for this visit.
   */
  setPrinter(p: Printer): void;
  /** The rail's width in px on a desktop; 300 until one is chosen (or when none can be read). */
  railWidth: Signal<number>;
  /**
   * Remembers the rail's width, clamped to 300 to 480 px. A value that is not a number is ignored.
   * Holds for this visit when storage is missing, blocked or full.
   */
  setRailWidth(px: number): void;
}

/**
 * The printer when every field it carries is a finite number and the project validator finds
 * nothing wrong with it. A field it lacks (an entry from before the field existed) takes its
 * default; a field that is there but not a number is a damaged entry.
 */
function validPrinter(x: unknown): Printer | null {
  if (!isRecord(x)) {
    return null;
  }
  const printer: Printer = { ...DEFAULT_PRINTER };
  for (const field of PRINTER_FIELDS) {
    const v = x[field];
    if (v === undefined) {
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return null;
    }
    printer[field] = v;
  }
  return printerProblems(printer).length > 0 ? null : printer;
}

/** What the project validator says is wrong with this printer (nothing for a printer it accepts). */
export function printerProblems(printer: Printer): string[] {
  return validateProject({ ...newProject(), printer })
    .filter((n) => n.level === "error" && n.path?.startsWith("/printer") === true)
    .map((n) => n.message);
}

function samePrinter(a: Printer, b: Printer): boolean {
  return PRINTER_FIELDS.every((f) => a[f] === b[f]);
}

/** The stored entry as a record; null when there is none, it is damaged, or storage is blocked. */
function readEntry(storage: Storage | null): Record<string, unknown> | null {
  if (storage) {
    try {
      const text = storage.getItem(PREFS_KEY);
      if (text !== null) {
        const parsed = JSON.parse(text) as unknown;
        return isRecord(parsed) ? parsed : null;
      }
    } catch {
      // Blocked storage or a damaged entry: the defaults.
    }
  }
  return null;
}

function readPrinter(storage: Storage | null): Printer {
  const entry = readEntry(storage);
  return (entry ? validPrinter(entry.printer) : null) ?? { ...DEFAULT_PRINTER };
}

/** The stored rail width; a value that is not a number (or none) is the default. */
function readRailWidth(storage: Storage | null): number {
  const entry = readEntry(storage);
  return (entry ? clampRailWidth(entry.railWidth) : null) ?? RAIL_WIDTH.default;
}

/**
 * Preferences kept in this browser, under one key. Never throws: anything unreadable gives the
 * defaults, and a failed write leaves the preference in effect until the page closes.
 * `null` storage keeps it in memory only.
 */
export function createPrefsStore(storage: Storage | null = defaultStorage()): PrefsStore {
  const printer = signal(readPrinter(storage));
  const railWidth = signal(readRailWidth(storage));
  /** Writes one field into the entry, keeping the others (and any this version does not know). */
  const save = (patch: Record<string, unknown>): void => {
    if (!storage) {
      return;
    }
    try {
      storage.setItem(PREFS_KEY, JSON.stringify({ ...readEntry(storage), ...patch }));
    } catch {
      // Storage full or blocked: kept for this visit only.
    }
  };
  if (storage && typeof window !== "undefined") {
    // Another tab saved (or cleared) the preference: follow it, so this tab never writes over it
    // with a printer it has since been told to forget.
    window.addEventListener("storage", (e) => {
      if (e.storageArea !== storage || (e.key !== null && e.key !== PREFS_KEY)) {
        return;
      }
      const next = readPrinter(storage);
      if (!samePrinter(next, printer.peek())) {
        printer.value = next;
      }
      const width = readRailWidth(storage);
      if (width !== railWidth.peek()) {
        railWidth.value = width;
      }
    });
  }
  return {
    printer,
    setPrinter(p) {
      const valid = validPrinter(p);
      if (!valid) {
        return;
      }
      printer.value = valid;
      save({ printer: valid });
    },
    railWidth,
    setRailWidth(px) {
      const width = clampRailWidth(px);
      if (width === null || width === railWidth.peek()) {
        return;
      }
      railWidth.value = width;
      save({ railWidth: width });
    },
  };
}
