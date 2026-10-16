// src/ui/historyKeys.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  hasNativeUndo,
  historyKeyOf,
  historyTitle,
  isMacPlatform,
  modalIsOpen,
  shortcutText,
} from "./historyKeys";

const press = (init: Partial<Parameters<typeof historyKeyOf>[0]>) =>
  historyKeyOf({
    key: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    ...init,
  });

afterEach(() => {
  document.body.replaceChildren();
});

describe("historyKeyOf", () => {
  it("reads Ctrl+Z and Cmd+Z as undo, with Shift as redo, and Ctrl+Y as redo", () => {
    expect(press({ key: "z", ctrlKey: true })).toBe("undo");
    expect(press({ key: "z", metaKey: true })).toBe("undo");
    expect(press({ key: "Z", ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(press({ key: "Z", metaKey: true, shiftKey: true })).toBe("redo");
    expect(press({ key: "y", ctrlKey: true })).toBe("redo");
    expect(press({ key: "Y", ctrlKey: true })).toBe("redo");
  });

  it("reads nothing else", () => {
    expect(press({ key: "z" })).toBeNull();
    expect(press({ key: "y" })).toBeNull();
    expect(press({ key: "y", metaKey: true })).toBeNull();
    expect(press({ key: "y", ctrlKey: true, shiftKey: true })).toBeNull();
    expect(press({ key: "z", ctrlKey: true, altKey: true })).toBeNull();
    expect(press({ key: "z", ctrlKey: true, isComposing: true })).toBeNull();
    expect(press({ key: "a", ctrlKey: true })).toBeNull();
  });
});

describe("hasNativeUndo", () => {
  const make = (html: string): Element => {
    document.body.innerHTML = html;
    const el = document.body.firstElementChild;
    if (el === null) {
      throw new Error("no element");
    }
    return el;
  };

  it("is true in a text field, a text area, a select and anything editable", () => {
    for (const html of [
      '<input type="text">',
      "<input>",
      '<input type="number">',
      '<input type="search">',
      "<textarea></textarea>",
      "<select><option>a</option></select>",
      '<div contenteditable="true"><span id="in">x</span></div>',
      '<div contenteditable=""></div>',
    ]) {
      const el = make(html);
      expect(hasNativeUndo(el.querySelector("#in") ?? el), html).toBe(true);
    }
  });

  it("is false on buttons, checkboxes, the page and what cannot be edited", () => {
    for (const html of [
      '<input type="checkbox">',
      '<input type="radio">',
      '<input type="range">',
      "<button>Go</button>",
      "<div>text</div>",
      '<div contenteditable="false"></div>',
    ]) {
      expect(hasNativeUndo(make(html)), html).toBe(false);
    }
    expect(hasNativeUndo(document.body)).toBe(false);
    expect(hasNativeUndo(null)).toBe(false);
    expect(hasNativeUndo(document)).toBe(false);
  });
});

describe("modalIsOpen", () => {
  it("is true while a dialog is open", () => {
    expect(modalIsOpen(document)).toBe(false);
    document.body.innerHTML = "<dialog>closed</dialog>";
    expect(modalIsOpen(document)).toBe(false);
    document.body.innerHTML = "<dialog open>open</dialog>";
    expect(modalIsOpen(document)).toBe(true);
  });
});

describe("the shortcut as shown", () => {
  it("names Ctrl, and the Command sign on a Mac", () => {
    expect(historyTitle("undo", false)).toBe("Undo (Ctrl+Z)");
    expect(historyTitle("redo", false)).toBe("Redo (Ctrl+Y)");
    expect(historyTitle("undo", true)).toBe("Undo (⌘Z)");
    expect(historyTitle("redo", true)).toBe("Redo (⇧⌘Z)");
    expect(shortcutText("undo", true)).toBe("⌘Z");
  });

  it("finds a Mac from the platform, or the user agent when the platform is empty", () => {
    expect(isMacPlatform({ platform: "MacIntel" })).toBe(true);
    expect(isMacPlatform({ platform: "iPhone" })).toBe(true);
    expect(
      isMacPlatform({ platform: "", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" }),
    ).toBe(true);
    expect(isMacPlatform({ platform: "Win32" })).toBe(false);
    expect(isMacPlatform({ platform: "Linux x86_64" })).toBe(false);
    expect(isMacPlatform(undefined)).toBe(false);
  });
});
