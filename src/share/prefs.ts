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

export interface PrefsStore {
  /** The printer new inserts start with; the defaults until one is set (or when none can be read). */
  printer: Signal<Printer>;
  /**
   * Remembers this printer for new inserts. A printer that would not validate is ignored. When
   * storage is missing, blocked or full it still holds for this visit.
   */
  setPrinter(p: Printer): void;
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

function readPrinter(storage: Storage | null): Printer {
  if (storage) {
    try {
      const text = storage.getItem(PREFS_KEY);
      if (text !== null) {
        const parsed = JSON.parse(text) as unknown;
        const printer = isRecord(parsed) ? validPrinter(parsed.printer) : null;
        if (printer) {
          return printer;
        }
      }
    } catch {
      // Blocked storage or a damaged entry: the defaults.
    }
  }
  return { ...DEFAULT_PRINTER };
}

/**
 * Preferences kept in this browser, under one key. Never throws: anything unreadable gives the
 * defaults, and a failed write leaves the preference in effect until the page closes.
 * `null` storage keeps it in memory only.
 */
export function createPrefsStore(storage: Storage | null = defaultStorage()): PrefsStore {
  const printer = signal(readPrinter(storage));
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
      if (!storage) {
        return;
      }
      try {
        storage.setItem(PREFS_KEY, JSON.stringify({ printer: valid }));
      } catch {
        // Storage full or blocked: kept for this visit only.
      }
    },
  };
}
