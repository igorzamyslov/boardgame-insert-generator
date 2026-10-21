// src/viewer/shotsScene.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { exposeShotsScene } from "./shotsScene";
import type { ShotsScene } from "./shotsScene";

/** A scene window whose glow table is `emissive` and whose tints are one tray's. */
const window = (emissive: Record<string, number>): ShotsScene => ({
  emissive: () => emissive,
  tints: () => ({
    page: "#f4f3ef",
    trays: { a: { color: "#101010", base: "#202020", opacity: 1 } },
  }),
  framing: () => ({ overflow: 0.5 }),
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete globalThis.__shotsScene;
});

describe("exposeShotsScene", () => {
  it("offers nothing outside shots mode, as a production build has", () => {
    const off = exposeShotsScene(window({ a: 1 }));
    expect(globalThis.__shotsScene).toBeUndefined();
    off();
    expect(globalThis.__shotsScene).toBeUndefined();
  });

  it("offers what the scene glows with in shots mode, and takes it back", () => {
    vi.stubEnv("MODE", "shots");
    const off = exposeShotsScene(window({ a: 0x383838 }));
    expect(globalThis.__shotsScene?.emissive()).toEqual({ a: 0x383838 });
    expect(globalThis.__shotsScene?.tints().trays.a).toEqual({
      color: "#101010",
      base: "#202020",
      opacity: 1,
    });
    off();
    expect(globalThis.__shotsScene).toBeUndefined();
  });

  it("does not take back a newer scene's offer", () => {
    vi.stubEnv("MODE", "shots");
    const first = exposeShotsScene(window({ a: 1 }));
    exposeShotsScene(window({ b: 2 }));
    first();
    expect(globalThis.__shotsScene?.emissive()).toEqual({ b: 2 });
  });
});
