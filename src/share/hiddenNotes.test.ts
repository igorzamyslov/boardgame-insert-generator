import { describe, expect, it } from "vitest";
import type { Notice } from "../model/types";
import { MemoryStorage } from "../test-support/memory-storage";
import { createHiddenNotesStore, isHidden, noteKey } from "./hiddenNotes";

const note = (message: string, path?: string): Notice => ({
  level: "warning",
  code: "size.short",
  message,
  path,
});

describe("hidden notes", () => {
  it("hides per project and survives a reload", () => {
    const storage = new MemoryStorage();
    createHiddenNotesStore(storage).hide("p1", note("Cut by 2 mm."));
    const again = createHiddenNotesStore(storage);
    expect(isHidden(again.of("p1"), note("Cut by 2 mm."))).toBe(true);
    expect(isHidden(again.of("p2"), note("Cut by 2 mm."))).toBe(false);
  });

  it("tells one tray's note from another's by its path", () => {
    const hidden = { [noteKey(note("x", "/components/0"))]: ["x"] };
    expect(isHidden(hidden, note("x", "/components/0"))).toBe(true);
    expect(isHidden(hidden, note("x", "/components/1"))).toBe(false);
  });

  it("shows a note again when its words change", () => {
    const store = createHiddenNotesStore(new MemoryStorage());
    store.hide("p", note("Cut by 2 mm."));
    expect(isHidden(store.of("p"), note("Cut by 3 mm."))).toBe(false);
  });

  it("keeps every note hidden that shares one key, in either order", () => {
    const a = note("The top Gold tray has no rim.");
    const b = note("The top Ships tray has no rim.");
    for (const order of [
      [a, b],
      [b, a],
    ] as const) {
      const store = createHiddenNotesStore(new MemoryStorage());
      for (const n of order) {
        store.hide("p", n, [a, b]);
      }
      expect(isHidden(store.of("p"), a)).toBe(true);
      expect(isHidden(store.of("p"), b)).toBe(true);
    }
  });

  it("drops words no note says any more, so an old value does not come back hidden", () => {
    const store = createHiddenNotesStore(new MemoryStorage());
    store.hide("p", note("Cut by 2 mm."), [note("Cut by 2 mm.")]);
    store.hide("p", note("Cut by 3 mm."), [note("Cut by 3 mm.")]);
    expect(isHidden(store.of("p"), note("Cut by 2 mm."))).toBe(false);
    expect(isHidden(store.of("p"), note("Cut by 3 mm."))).toBe(true);
  });

  it("reads what 0.21.0 stored: one string for a key", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "insert-generator:hidden-notes:p",
      JSON.stringify({ [noteKey(note("x", "/components/0"))]: "Cut by 2 mm." }),
    );
    const store = createHiddenNotesStore(storage);
    expect(isHidden(store.of("p"), note("Cut by 2 mm.", "/components/0"))).toBe(true);
    store.hide("p", note("More.", "/components/0"));
    expect(isHidden(createHiddenNotesStore(storage).of("p"), note("More.", "/components/0"))).toBe(
      true,
    );
  });

  it("brings notes back, and forgets a deleted project", () => {
    const storage = new MemoryStorage();
    const store = createHiddenNotesStore(storage);
    store.hide("p", note("a"));
    store.showAll("p");
    expect(store.of("p")).toEqual({});
    store.hide("q", note("b"));
    store.forget("q");
    expect(createHiddenNotesStore(storage).of("q")).toEqual({});
    expect(storage.length).toBe(0);
  });

  it("holds for this visit when storage is missing, blocked, full or damaged", () => {
    const blocked = new MemoryStorage();
    blocked.getItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    const full = new MemoryStorage();
    full.failOn = () => true;
    for (const storage of [null, blocked, full]) {
      const store = createHiddenNotesStore(storage);
      expect(() => store.hide("p", note("a"))).not.toThrow();
      expect(isHidden(store.of("p"), note("a"))).toBe(true);
    }
    const damaged = new MemoryStorage();
    damaged.setItem("insert-generator:hidden-notes:p", "{not json");
    expect(createHiddenNotesStore(damaged).of("p")).toEqual({});
  });
});
