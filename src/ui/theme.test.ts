// src/ui/theme.test.ts
import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import kitHtml from "../../kit.html?raw";
import { THEME_BOOT, THEME_KEY, loadTheme, resolveTheme, saveTheme } from "./theme";

function storageOf(init: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(init));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as unknown as Storage;
}

describe("theme choice", () => {
  it("is System until a person chooses, and for stored junk", () => {
    expect(loadTheme(storageOf())).toBe("system");
    expect(loadTheme(storageOf({ [THEME_KEY]: "purple" }))).toBe("system");
    expect(loadTheme(null)).toBe("system");
  });

  it("keeps a choice and survives storage that throws", () => {
    const s = storageOf();
    saveTheme("dark", s);
    expect(loadTheme(s)).toBe("dark");
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(() => saveTheme("light", broken)).not.toThrow();
    expect(loadTheme(broken)).toBe("system");
  });

  it("resolves System from the device and the others as chosen", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  it("runs the same lines before first paint in the app and in the gallery", () => {
    expect(indexHtml).toContain(THEME_BOOT);
    expect(kitHtml).toContain(THEME_BOOT);
  });
});
