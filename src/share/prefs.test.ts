import { describe, expect, it } from "vitest";
import { DEFAULT_PRINTER } from "../model/defaults";
import type { Printer } from "../model/types";
import { MemoryStorage } from "../test-support/memory-storage";
import { createPrefsStore } from "./prefs";

const MINE: Printer = { bedX: 180, bedY: 180, bedZ: 180, bedMargin: 3, layerHeight: 0.16 };
const KEY = "insert-generator:prefs";

describe("prefs store", () => {
  it("starts with the default printer", () => {
    expect(createPrefsStore(new MemoryStorage()).printer.value).toEqual(DEFAULT_PRINTER);
  });

  it("remembers my printer across reloads", () => {
    const storage = new MemoryStorage();
    createPrefsStore(storage).setPrinter(MINE);
    expect(createPrefsStore(storage).printer.value).toEqual(MINE);
  });

  it("keeps a copy, so editing what it was given changes nothing", () => {
    const prefs = createPrefsStore(new MemoryStorage());
    const given = { ...MINE };
    prefs.setPrinter(given);
    given.bedX = 1;
    expect(prefs.printer.value).toEqual(MINE);
  });

  it("falls back to defaults when storage is unavailable", () => {
    const throwing = new MemoryStorage();
    throwing.getItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    for (const storage of [null, throwing]) {
      const prefs = createPrefsStore(storage);
      expect(prefs.printer.value).toEqual(DEFAULT_PRINTER);
      expect(() => prefs.setPrinter(MINE)).not.toThrow();
      // still remembered for this visit
      expect(prefs.printer.value).toEqual(MINE);
    }
  });

  it("still works when storage is full", () => {
    const storage = new MemoryStorage();
    storage.failOn = (key) => key === KEY;
    const prefs = createPrefsStore(storage);
    expect(() => prefs.setPrinter(MINE)).not.toThrow();
    expect(prefs.printer.value).toEqual(MINE);
  });

  it.each([
    ["not JSON", "{nope"],
    ["not an object", "42"],
    ["null", "null"],
    ["no printer", "{}"],
    ["a string bed", JSON.stringify({ printer: { ...MINE, bedX: "256" } })],
    ["a missing field", JSON.stringify({ printer: { bedX: 200, bedY: 200, bedZ: 200 } })],
    ["a negative bed", JSON.stringify({ printer: { ...MINE, bedX: -5 } })],
    ["a margin that eats the bed", JSON.stringify({ printer: { ...MINE, bedMargin: 90 } })],
    ["a layer height out of range", JSON.stringify({ printer: { ...MINE, layerHeight: 5 } })],
    [
      "NaN-like numbers",
      '{"printer":{"bedX":1e999,"bedY":1,"bedZ":1,"bedMargin":0,"layerHeight":0.2}}',
    ],
  ])("falls back to defaults on %s", (_name, text) => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, text);
    expect(createPrefsStore(storage).printer.value).toEqual(DEFAULT_PRINTER);
  });

  it("ignores an invalid printer instead of storing it", () => {
    const storage = new MemoryStorage();
    const prefs = createPrefsStore(storage);
    prefs.setPrinter(MINE);
    prefs.setPrinter({ ...MINE, bedX: 0 });
    expect(prefs.printer.value).toEqual(MINE);
    expect(createPrefsStore(storage).printer.value).toEqual(MINE);
  });

  it("ignores extra stored fields", () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ printer: { ...MINE, nozzle: 0.4 }, future: true }));
    expect(createPrefsStore(storage).printer.value).toEqual(MINE);
  });
});
