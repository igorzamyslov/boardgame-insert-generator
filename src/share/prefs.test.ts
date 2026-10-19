import { describe, expect, it } from "vitest";
import { DEFAULT_PRINTER } from "../model/defaults";
import type { Printer } from "../model/types";
import { MemoryStorage } from "../test-support/memory-storage";
import { RAIL_WIDTH, createPrefsStore } from "./prefs";

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
    ["a null field", JSON.stringify({ printer: { ...MINE, bedMargin: null } })],
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

  it("takes the default for a field the stored printer lacks, so an older entry still loads", () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ printer: { bedX: 200, bedY: 190, bedZ: 180 } }));
    expect(createPrefsStore(storage).printer.value).toEqual({
      ...DEFAULT_PRINTER,
      bedX: 200,
      bedY: 190,
      bedZ: 180,
    });
  });

  it("still rejects a field that is present but wrong", () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ printer: { bedX: "200" } }));
    expect(createPrefsStore(storage).printer.value).toEqual(DEFAULT_PRINTER);
  });
});

describe("prefs store: the rail's width", () => {
  it("starts at 300 px", () => {
    expect(createPrefsStore(new MemoryStorage()).railWidth.value).toBe(300);
    expect(RAIL_WIDTH).toEqual({ min: 300, max: 480, default: 300 });
  });

  it("remembers the width across reloads", () => {
    const storage = new MemoryStorage();
    createPrefsStore(storage).setRailWidth(420);
    expect(createPrefsStore(storage).railWidth.value).toBe(420);
  });

  it("clamps what is set to 300 to 480 px, in whole px", () => {
    const prefs = createPrefsStore(new MemoryStorage());
    prefs.setRailWidth(100);
    expect(prefs.railWidth.value).toBe(300);
    prefs.setRailWidth(9000);
    expect(prefs.railWidth.value).toBe(480);
    prefs.setRailWidth(333.6);
    expect(prefs.railWidth.value).toBe(334);
  });

  it("ignores a value that is not a number", () => {
    const storage = new MemoryStorage();
    const prefs = createPrefsStore(storage);
    prefs.setRailWidth(400);
    prefs.setRailWidth(Number.NaN);
    prefs.setRailWidth(Number.POSITIVE_INFINITY);
    expect(prefs.railWidth.value).toBe(400);
    expect(createPrefsStore(storage).railWidth.value).toBe(400);
  });

  it.each([
    ["not JSON", "{nope"],
    ["no entry fields", "{}"],
    ["a string", JSON.stringify({ railWidth: "400" })],
    ["null", JSON.stringify({ railWidth: null })],
    ["not finite", '{"railWidth":1e999}'],
  ])("takes 300 for a stored width that is %s", (_name, text) => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, text);
    expect(createPrefsStore(storage).railWidth.value).toBe(300);
  });

  it("clamps a stored number that is out of range", () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ railWidth: 2000 }));
    expect(createPrefsStore(storage).railWidth.value).toBe(480);
    storage.setItem(KEY, JSON.stringify({ railWidth: 10 }));
    expect(createPrefsStore(storage).railWidth.value).toBe(300);
  });

  it("keeps the printer when the width is saved, and the width when the printer is", () => {
    const storage = new MemoryStorage();
    const prefs = createPrefsStore(storage);
    prefs.setPrinter(MINE);
    prefs.setRailWidth(380);
    expect(createPrefsStore(storage).printer.value).toEqual(MINE);
    prefs.setPrinter({ ...MINE, bedX: 200 });
    const again = createPrefsStore(storage);
    expect(again.railWidth.value).toBe(380);
    expect(again.printer.value.bedX).toBe(200);
  });

  it("saves only the width when only the width was chosen, so a later default printer is not frozen", () => {
    const storage = new MemoryStorage();
    createPrefsStore(storage).setRailWidth(400);
    expect(JSON.parse(storage.getItem(KEY) ?? "{}")).toEqual({ railWidth: 400 });
  });

  it("still holds for this visit when storage is unavailable or full", () => {
    const full = new MemoryStorage();
    full.failOn = (key) => key === KEY;
    for (const storage of [null, full]) {
      const prefs = createPrefsStore(storage);
      expect(() => prefs.setRailWidth(440)).not.toThrow();
      expect(prefs.railWidth.value).toBe(440);
    }
  });
});
