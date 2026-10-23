// src/geometry/buildable.test.ts
import { describe, expect, it } from "vitest";
import { splitRisers } from "../layout/risers";
import { TEST_PRINTER, traySpec } from "../layout/test-utils";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { TraySpec } from "../model/types";
import { buildable } from "./buildable";

const well = (x: number, floorZ: number, features: unknown[] = []) => ({
  x,
  y: x,
  w: 100 - 2 * x,
  d: 60 - 2 * x,
  floorZ,
  kind: "well" as const,
  contents: "a",
  features: features as TraySpec["compartments"][number]["features"],
});

describe("buildable: whether planTray accepts a part", () => {
  const ok = traySpec({ w: 100, d: 60, h: 20, compartments: [well(1.6, 1.2)] });

  it("says yes for a part it builds, and for none that it does not", () => {
    expect(buildable([ok], DEFAULT_SETTINGS)).toBe(true);
    expect(buildable([], DEFAULT_SETTINGS)).toBe(true);
    // a well inside the wall a lipped tray needs
    expect(buildable([{ ...ok, lip: true }], DEFAULT_SETTINGS)).toBe(false);
    expect(buildable([ok, { ...ok, w: -1 }], DEFAULT_SETTINGS)).toBe(false);
  });

  it("says no, and does not throw, for a part of a newer version", () => {
    const newer = traySpec({
      w: 100,
      d: 60,
      h: 20,
      compartments: [well(1.6, 1.2, [{ type: "magnet" }])],
    });
    expect(buildable([newer], DEFAULT_SETTINGS)).toBe(false);
  });

  it("lets the layout print a file with such a part: its riser stays plain, nothing throws", () => {
    const stored = traySpec({
      key: "a:p0:0",
      w: 100,
      d: 60,
      h: 60,
      lip: true,
      compartments: [well(2.9, 40, [{ type: "magnet" }])],
    });
    const printed = splitRisers([stored], {
      settings: DEFAULT_SETTINGS,
      printer: TEST_PRINTER,
      locks: [],
    });
    expect(printed.find((t) => t.part === "riser")?.lip).toBe(false);
    expect(printed.some((t) => t.onRiser === true)).toBe(false);
  });
});
