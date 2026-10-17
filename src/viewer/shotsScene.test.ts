// src/viewer/shotsScene.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { exposeShotsScene } from "./shotsScene";

afterEach(() => {
  vi.unstubAllEnvs();
  delete globalThis.__shotsScene;
});

describe("exposeShotsScene", () => {
  it("offers nothing outside shots mode, as a production build has", () => {
    const off = exposeShotsScene(() => ({ a: 1 }));
    expect(globalThis.__shotsScene).toBeUndefined();
    off();
    expect(globalThis.__shotsScene).toBeUndefined();
  });

  it("offers what the scene glows with in shots mode, and takes it back", () => {
    vi.stubEnv("MODE", "shots");
    const off = exposeShotsScene(() => ({ a: 0x383838 }));
    expect(globalThis.__shotsScene?.emissive()).toEqual({ a: 0x383838 });
    off();
    expect(globalThis.__shotsScene).toBeUndefined();
  });

  it("does not take back a newer scene's offer", () => {
    vi.stubEnv("MODE", "shots");
    const first = exposeShotsScene(() => ({ a: 1 }));
    exposeShotsScene(() => ({ b: 2 }));
    first();
    expect(globalThis.__shotsScene?.emissive()).toEqual({ b: 2 });
  });
});
