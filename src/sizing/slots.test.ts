import { describe, expect, it } from "vitest";
import { thinnestWedge } from "../geometry/test-wedge";
import { traySpecFrom } from "../geometry/test-specs";
import { DEFAULT_SETTINGS } from "../model/settings";
import { stackWidth } from "./cards";
import { SlotFitError } from "./errors";
import { minOuter } from "./realize";
import { realizeTray } from "./realize";
import { assertTrayInvariants, minis, partOf } from "./test-helpers";
import type { RealizeOptions } from "./types";
import { ceilU, fromU } from "./units";

const ground: RealizeOptions = { lipped: false, level: 0 };

describe("finger slots of pocket strips", () => {
  // Two- and three-pocket strips at the default settings (review round 2 search, first run on
  // card decks before they got finger channels): minis pockets as wide as a deck of n cards,
  // unsleeved or sleeved, a narrow one beside wide ones, in either order, at minOuter and a little
  // wider. planTray accepts every realized tray (assertTrayInvariants), and every piece of material
  // at a well face its slots meet within their overlap is ≥ 0.8 mm wide 0.8 mm below its top
  // (thinnestWedge, measured from the cut profile). realizeTray refuses none of them: minOuter
  // widens a strip until its slots fit. Realizable at minOuter ⇔ realizable at every larger outer
  // tried.
  it("plans every two- and three-pocket strip", { timeout: 60_000 }, () => {
    let realized = 0;
    let faces = 0; // trays where a slot meets a well face within its overlap
    const refused: string[] = [];
    for (const [sleeve, t] of [
      ["none", 0.32],
      ["standard", 0.42],
    ] as const) {
      for (let n = 1; n <= 90; n += 1) {
        for (const counts of [
          [n, 120],
          [120, n],
          [n, 200],
          [200, n],
          [n, n + 7],
          [60, n, 60],
          [n, 30, n],
        ]) {
          // A pocket's width is its figure plus the 1 mm piece clearance: a deck's stack width.
          const figures = counts.map((count, i) => ({
            name: `D${i}`,
            w: fromU(ceilU(stackWidth(count, t, DEFAULT_SETTINGS)) - 100),
            d: 88.5,
            h: 64,
            count: 1,
          }));
          const part = partOf([minis({ figures })], "standing|strip|split1");
          const min = minOuter(part, DEFAULT_SETTINGS, ground);
          const name = `${sleeve} ${counts.join("+")}`;
          for (const slack of [0, 3, 7]) {
            const outer = { ...min, w: min.w + slack };
            // Realizable at minOuter ⇔ realizable wider: a strip refused at +0 is refused at every
            // slack, and one realized at +0 is realized at every slack.
            const refusedAtMin = refused.includes(`${name} +0`);
            let tray;
            try {
              tray = realizeTray(part, outer, DEFAULT_SETTINGS, ground);
            } catch (error) {
              expect(error).toBeInstanceOf(SlotFitError);
              expect(slack === 0 || refusedAtMin, `${name} +${slack}`).toBe(true);
              refused.push(`${name} +${slack}`);
              continue;
            }
            expect(refusedAtMin, `${name} +${slack}`).toBe(false);
            assertTrayInvariants(tray, outer, DEFAULT_SETTINGS, ground);
            const wedge = thinnestWedge(
              traySpecFrom(tray, outer, ground, DEFAULT_SETTINGS, part.trayKey),
              DEFAULT_SETTINGS,
            );
            expect(wedge.width, wedge.where).toBeGreaterThanOrEqual(0.8 - 0.01);
            faces += Number.isFinite(wedge.width) ? 1 : 0;
            realized += 1;
          }
        }
      }
    }
    expect(realized + refused.length).toBe(2 * 90 * 7 * 3);
    expect(refused).toEqual([]);
    expect(faces).toBeGreaterThan(realized / 2);
  });
});
