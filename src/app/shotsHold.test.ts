// src/app/shotsHold.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { shotsHold } from "./shotsHold";

const settled = (p: Promise<void>): Promise<boolean> =>
  Promise.race([p.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 50))]);

afterEach(() => {
  vi.unstubAllEnvs();
  delete globalThis.__shotsHold;
});

describe("shotsHold", () => {
  it("resolves at once outside shots mode", async () => {
    globalThis.__shotsHold = { export: new Promise<void>(() => undefined) };
    expect(await settled(shotsHold("export"))).toBe(true);
  });

  it("waits on the named hold in shots mode", async () => {
    vi.stubEnv("MODE", "shots");
    let release: () => void = () => undefined;
    globalThis.__shotsHold = {
      export: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    const held = shotsHold("export");
    expect(await settled(held)).toBe(false);
    expect(await settled(shotsHold("search"))).toBe(true);
    release();
    expect(await settled(held)).toBe(true);
  });
});
