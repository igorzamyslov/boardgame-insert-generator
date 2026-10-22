// src/geometry/riser.small.test.ts
// A riser as low as the least-riser setting allows is still a part planTray builds: solid while its
// pocket would be under MIN_RISER_POCKET, an open walled box above it, never lower than what a part
// with the bottom chamfer can be (splitRisers). The tray it leaves keeps a normal floor.
import { describe, expect, it } from "vitest";
import { splitRisers } from "../layout/risers";
import { TEST_PRINTER, traySpec } from "../layout/test-utils";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import { settingsValid } from "../model/validate";
import { MIN_RISER_POCKET } from "../sizing/constants";
import { planTray } from "./plan";

/** A tray padded by `padding` mm above its 20 mm deep well. */
const padded = (padding: number): TraySpec =>
  traySpec({
    key: "a:p0:0",
    w: 100,
    d: 60,
    h: 21.2 + padding,
    compartments: [
      {
        x: 1.6,
        y: 1.6,
        w: 96.8,
        d: 56.8,
        floorZ: 1.2 + padding,
        kind: "well",
        contents: "a",
        features: [],
      },
    ],
  });

function printed(padding: number, settings: Settings): TraySpec[] {
  return splitRisers([padded(padding)], { settings, printer: TEST_PRINTER, locks: [] });
}

describe("a low riser is a part planTray builds", () => {
  const low: Settings = { ...DEFAULT_SETTINGS, minRiser: 1 };

  it.each([1.2, 2, 3, 4.8, 6, 6.2, 8, 12, 30])("at %s mm of padding", (padding) => {
    const parts = printed(padding, low);
    const riser = parts.find((t) => t.part === "riser");
    expect(riser?.h, "a riser is made").toBe(padding);
    for (const part of parts) {
      expect(() => planTray(part, low), part.key).not.toThrow();
    }
    // solid until its pocket (the height less the floor) is deep enough to be worth the walls
    expect(riser?.solid).toBe(padding < 1.2 + MIN_RISER_POCKET - 1e-9);
    // the tray keeps the floor of the well, not a block
    expect(parts.find((t) => t.part === "tray")?.compartments[0]?.floorZ).toBe(1.2);
  });

  it("never makes a riser lower than a part with the bottom chamfer can be", () => {
    const chamfered: Settings = { ...low, bottomChamfer: 1 };
    expect(settingsValid(chamfered)).toBe(true);
    // a 1 mm chamfer needs 1.8 mm of height: 1.6 mm of padding stays a raised floor
    expect(printed(1.6, chamfered).some((t) => t.part === "riser")).toBe(false);
    const parts = printed(2, chamfered);
    expect(parts.find((t) => t.part === "riser")?.h).toBe(2);
    for (const part of parts) {
      expect(() => planTray(part, chamfered), part.key).not.toThrow();
    }
  });
});
