import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import * as sizing from "./index";
import { bulk, cards, custom, inGroup, minis, tiles } from "./test-helpers";

describe("sizing public API", () => {
  it("exports the contract functions and helpers", () => {
    for (const fn of [
      sizing.size,
      sizing.minOuter,
      sizing.realizeTray,
      sizing.rotateRealized,
      sizing.hasGrip,
      sizing.wallFor,
    ]) {
      expect(typeof fn).toBe("function");
    }
  });

  it("sizes, measures and realizes a mixed project, every tray with a grip", () => {
    const components = [
      cards({
        storage: "auto",
        decks: [
          { name: "A", count: 60 },
          { name: "B", count: 20 },
        ],
      }),
      bulk(),
      tiles({ storage: "auto" }),
      minis(),
      custom(),
      cards({ id: "c2" }),
    ];
    const grouped = components.slice(-2);
    const { requirements, notices } = sizing.size(components, DEFAULT_SETTINGS, [inGroup(grouped)]);
    expect(notices).toEqual([]);
    expect(requirements.map((r) => r.key)).toEqual(["c1", "b1", "t1", "m1", "g"]);
    for (const opts of [
      { lipped: false, level: 0 },
      { lipped: true, level: 1 },
    ]) {
      for (const req of requirements) {
        for (const variant of req.variants) {
          for (const part of variant.parts) {
            const outer = sizing.minOuter(part, DEFAULT_SETTINGS, opts);
            const tray = sizing.realizeTray(part, outer, DEFAULT_SETTINGS, opts);
            expect(sizing.hasGrip(tray.compartments, outer.h)).toBe(true);
            expect(sizing.hasGrip(sizing.rotateRealized(tray, outer).compartments, outer.h)).toBe(
              true,
            );
          }
        }
      }
    }
  });
});
