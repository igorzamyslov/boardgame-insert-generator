import { signal } from "@preact/signals";
import type { Signal } from "@preact/signals";
import { DEFAULT_PRINTER, newProject } from "../model/defaults";
import { isRecord } from "../model/json";
import type { Printer } from "../model/types";
import { validateProject } from "../model/validate";
import { STORAGE_PREFIX, defaultStorage } from "./store";

const PREFS_KEY = `${STORAGE_PREFIX}prefs`;
const PRINTER_FIELDS = ["bedX", "bedY", "bedZ", "bedMargin", "layerHeight"] as const;

export interface PrefsStore {
  /** The printer new inserts start with; the defaults until one is set (or when none can be read). */
  printer: Signal<Printer>;
  /**
   * Remembers this printer for new inserts. A printer that would not validate is ignored. When
   * storage is missing, blocked or full it still holds for this visit.
   */
  setPrinter(p: Printer): void;
}

/** The printer when every field is a finite number and the project validator finds nothing wrong with it. */
function validPrinter(x: unknown): Printer | null {
  if (!isRecord(x)) {
    return null;
  }
  const printer = {} as Printer;
  for (const field of PRINTER_FIELDS) {
    const v = x[field];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return null;
    }
    printer[field] = v;
  }
  const bad = validateProject({ ...newProject(), printer }).some(
    (n) => n.level === "error" && n.path?.startsWith("/printer") === true,
  );
  return bad ? null : printer;
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
