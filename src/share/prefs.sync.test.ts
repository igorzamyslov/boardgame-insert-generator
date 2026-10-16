// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PRINTER } from "../model/defaults";
import type { Printer } from "../model/types";
import { createPrefsStore } from "./prefs";

const MINE: Printer = { bedX: 180, bedY: 180, bedZ: 180, bedMargin: 3, layerHeight: 0.16 };
const KEY = "insert-generator:prefs";

/** What another tab's write looks like in this one: the storage changed, then the event. */
function otherTabWrites(key: string | null, value: string | null): void {
  if (key === null) {
    localStorage.clear();
  } else if (value === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
  }
  window.dispatchEvent(
    new StorageEvent("storage", { key, newValue: value, storageArea: localStorage }),
  );
}

afterEach(() => localStorage.clear());

describe("prefs store across tabs", () => {
  it("follows the printer another tab saved", () => {
    const prefs = createPrefsStore(localStorage);
    otherTabWrites(KEY, JSON.stringify({ printer: MINE }));
    expect(prefs.printer.value).toEqual(MINE);
  });

  it("goes back to the defaults when another tab clears the storage or the entry", () => {
    const prefs = createPrefsStore(localStorage);
    prefs.setPrinter(MINE);
    otherTabWrites(null, null);
    expect(prefs.printer.value).toEqual(DEFAULT_PRINTER);
    prefs.setPrinter(MINE);
    otherTabWrites(KEY, null);
    expect(prefs.printer.value).toEqual(DEFAULT_PRINTER);
  });

  it("reads a damaged entry as the defaults, as at start", () => {
    const prefs = createPrefsStore(localStorage);
    prefs.setPrinter(MINE);
    otherTabWrites(KEY, "{nope");
    expect(prefs.printer.value).toEqual(DEFAULT_PRINTER);
  });

  it("ignores another key and another storage", () => {
    const prefs = createPrefsStore(localStorage);
    prefs.setPrinter(MINE);
    otherTabWrites("insert-generator:other", "x");
    expect(prefs.printer.value).toEqual(MINE);
    window.dispatchEvent(
      new StorageEvent("storage", { key: KEY, newValue: "{}", storageArea: sessionStorage }),
    );
    expect(prefs.printer.value).toEqual(MINE);
  });

  it("leaves the signal untouched when the saved printer is the one it has", () => {
    const prefs = createPrefsStore(localStorage);
    prefs.setPrinter(MINE);
    const before = prefs.printer.value;
    otherTabWrites(KEY, JSON.stringify({ printer: MINE }));
    expect(prefs.printer.value).toBe(before);
  });
});
