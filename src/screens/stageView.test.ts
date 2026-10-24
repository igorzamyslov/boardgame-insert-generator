// src/screens/stageView.test.ts
// The view a project opens in (Settings, Display): per browser, in storage that may be missing or blocked.
import { describe, expect, it } from "vitest";
import { loadOpenView, openingView, openViewPref, saveOpenView } from "./stageView";

const store = (initial: Record<string, string> = {}): Storage => {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  } as unknown as Storage;
};
const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
} as unknown as Storage;

describe("the view a project opens in", () => {
  it("is Top until a person chooses 3D, and keeps the choice", () => {
    const s = store();
    expect(loadOpenView(s)).toBe("plan");
    saveOpenView("3d", s);
    expect(loadOpenView(s)).toBe("3d");
    saveOpenView("plan", s);
    expect(loadOpenView(s)).toBe("plan");
  });

  it("is Top for a value it does not know, and for storage that is missing or blocked", () => {
    expect(loadOpenView(store({ "insert-generator:view-open": "sideways" }))).toBe("plan");
    expect(loadOpenView(null)).toBe("plan");
    expect(loadOpenView(blocked)).toBe("plan");
    expect(() => saveOpenView("3d", blocked)).not.toThrow();
    expect(() => saveOpenView("3d", null)).not.toThrow();
  });

  it("opens on Top in a browser without WebGL, whatever was chosen", () => {
    openViewPref.value = "3d";
    expect(openingView(true)).toBe("3d");
    expect(openingView(false)).toBe("plan");
    openViewPref.value = "plan";
  });
});
