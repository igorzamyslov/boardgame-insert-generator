// src/ui/theme.ts
// The colour scheme the page shows: this browser's choice (System, Light or Dark) and what it
// resolves to. The choice is kept in localStorage; `data-theme` on <html> carries the resolved
// scheme to tokens.css. index.html and kit.html run the same few lines before first paint
// (THEME_BOOT in theme.test.ts keeps them in step), so there is no flash of the other scheme.
import { signal } from "@preact/signals";
import { STORAGE_PREFIX, defaultStorage } from "../share/store";
import type { ColorScheme } from "./identity";

export type ThemeChoice = "system" | "light" | "dark";

export const DEFAULT_THEME: ThemeChoice = "system";

export const THEME_KEY = `${STORAGE_PREFIX}theme`;

/** The browser chrome's colour (`<meta name="theme-color">`) per scheme: `--page` in tokens.css. */
export const THEME_COLOR: Record<ColorScheme, string> = { light: "#F4F3EF", dark: "#1B1A17" };

/** The choice this browser last made, or System; storage that is blocked or damaged gives System. */
export function loadTheme(storage: Storage | null = defaultStorage()): ThemeChoice {
  try {
    const raw = storage?.getItem(THEME_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Keeps the choice for this browser; with no storage it holds for this visit only. */
export function saveTheme(choice: ThemeChoice, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(THEME_KEY, choice);
  } catch {
    // full or blocked: the choice holds until the page is closed
  }
}

function systemScheme(): ColorScheme {
  try {
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** What a choice shows now: System follows the system's setting. */
export function resolveTheme(
  choice: ThemeChoice,
  system: ColorScheme = systemScheme(),
): ColorScheme {
  return choice === "system" ? system : choice;
}

export const themePref = signal<ThemeChoice>(loadTheme());

/** The scheme the page shows now. A signal, so the 3D view follows a change at once. */
export const schemeNow = signal<ColorScheme>(resolveTheme(themePref.value));

function paint(scheme: ColorScheme): void {
  schemeNow.value = scheme;
  const root = globalThis.document?.documentElement;
  if (root) {
    root.dataset.theme = scheme;
    globalThis.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLOR[scheme]);
  }
}

/** Chooses the scheme for this browser: the page follows, and the choice is kept. */
export function chooseTheme(choice: ThemeChoice): void {
  themePref.value = choice;
  saveTheme(choice);
  paint(resolveTheme(choice));
}

/** Puts the stored choice on the page and follows the system's setting while the choice is System. */
export function startTheme(): void {
  paint(resolveTheme(themePref.value));
  try {
    globalThis.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (themePref.value === "system") {
        paint(resolveTheme("system"));
      }
    });
  } catch {
    // no matchMedia: the scheme stays as it was
  }
  // Paper is white: the packing guide prints (or saves as PDF) in the light scheme, then the
  // page goes back to the person's own.
  globalThis.addEventListener?.("beforeprint", () => {
    const root = globalThis.document.documentElement;
    root.dataset.theme = "light";
  });
  globalThis.addEventListener?.("afterprint", () => {
    paint(resolveTheme(themePref.value));
  });
}

/**
 * The lines index.html and kit.html run before the page paints (a plain script, so they can't
 * import this). The same rules as `loadTheme` and `resolveTheme`.
 */
export const THEME_BOOT = `(function(){var t="system";try{var s=localStorage.getItem("${THEME_KEY}");if(s==="light"||s==="dark")t=s}catch(e){}var d=t==="dark"||(t==="system"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";var m=document.querySelector('meta[name="theme-color"]');if(m&&d)m.setAttribute("content","${THEME_COLOR.dark}")})();`;
