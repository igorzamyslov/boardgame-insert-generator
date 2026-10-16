// src/ui/historyKeys.ts
// The keyboard shortcuts of Undo and Redo: what a key event asks for, where it is left to the
// browser, and how the buttons name them. Pure, so a test can drive it with plain events.

export type HistoryKey = "undo" | "redo";

/** Whether the person uses a Mac: the shortcut is Cmd there, and a title says so. */
export function isMacPlatform(nav: { platform?: string; userAgent?: string } | undefined): boolean {
  const text = nav?.platform || nav?.userAgent || "";
  return /Mac|iPhone|iPad|iPod/.test(text);
}

/**
 * What a key press asks for: Ctrl+Z or Cmd+Z undoes; Shift+Ctrl+Z, Shift+Cmd+Z and Ctrl+Y redo.
 * Alt, a repeat while the key is held, and an input method's composition are not a request. The
 * key is read by its letter, and by its place on the keyboard when the layout has no Latin letter
 * there (a Cyrillic layout gives "я" for Z), so the shortcut works on any layout.
 */
export function historyKeyOf(
  e: Pick<
    KeyboardEvent,
    "key" | "code" | "repeat" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "isComposing"
  >,
): HistoryKey | null {
  if (e.altKey || e.isComposing || e.repeat) {
    return null;
  }
  const letter = e.key.toLowerCase();
  const key = /^[a-z]$/.test(letter)
    ? letter
    : e.code === "KeyZ"
      ? "z"
      : e.code === "KeyY"
        ? "y"
        : letter;
  if (key === "z" && (e.ctrlKey || e.metaKey)) {
    return e.shiftKey ? "redo" : "undo";
  }
  // Ctrl+Y is the Windows and Linux redo; Cmd+Y is the browser's history on a Mac, so it is left.
  return key === "y" && e.ctrlKey && !e.metaKey && !e.shiftKey ? "redo" : null;
}

const NO_NATIVE_UNDO = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/**
 * Whether the focus is somewhere that has its own undo: a text field, a text area, a select or
 * anything editable. Ctrl+Z there belongs to the field, not to the insert.
 */
export function hasNativeUndo(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target instanceof HTMLInputElement) {
    return !NO_NATIVE_UNDO.has(target.type);
  }
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

/** Whether a modal dialog is open (a native `dialog` that was opened with `showModal`). */
export function modalIsOpen(doc: Pick<Document, "querySelector">): boolean {
  return doc.querySelector("dialog[open]") !== null;
}

/** The shortcut as the button's title shows it: "Ctrl+Z", or "⌘Z" on a Mac. */
export function shortcutText(which: HistoryKey, mac: boolean): string {
  if (which === "undo") {
    return mac ? "⌘Z" : "Ctrl+Z";
  }
  return mac ? "⇧⌘Z" : "Ctrl+Y";
}

/** The title of an Undo or Redo button: "Undo (Ctrl+Z)". */
export function historyTitle(which: HistoryKey, mac: boolean): string {
  return `${which === "undo" ? "Undo" : "Redo"} (${shortcutText(which, mac)})`;
}
