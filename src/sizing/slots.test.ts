import { describe, expect, it } from "vitest";
import { thinnestWedge } from "../geometry/test-wedge";
import { traySpecFrom } from "../geometry/test-specs";
import { DEFAULT_SETTINGS } from "../model/settings";
import { minOuter } from "./outer";
import { realizeTray } from "./realize";
import { assertTrayInvariants, cards, partOf } from "./test-helpers";
import type { RealizeOptions } from "./types";

const ground: RealizeOptions = { lipped: false, level: 0 };

describe("finger slots of card strips", () => {
  // Two- and three-deck strips at the default settings (review round 2 search): a narrow deck
  // beside wide ones, in either order, at minOuter and a little wider. planTray accepts every
  // realized tray (assertTrayInvariants), and every piece of material at a well face its slots
  // meet within their overlap is ≥ 0.8 mm wide 0.8 mm below its top (thinnestWedge, measured
  // from the cut profile). realizeTray refuses only strips with a one- or two-card
  // deck: against the wall, a slot of at least 15 mm would cross such a deck's own well face too
  // far from its centre.
  it("plans every two- and three-deck strip", () => {
    let realized = 0;
    const refused: string[] = [];
    for (const sleeve of ["none", "standard"] as const) {
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
          const part = partOf(
            [cards({ sleeve, decks: counts.map((count, i) => ({ name: `D${i}`, count })) })],
            "upright-long|strip|split1",
          );
          const min = minOuter(part, DEFAULT_SETTINGS, ground);
          for (const slack of [0, 3, 7]) {
            const outer = { ...min, w: min.w + slack };
            let tray;
            try {
              tray = realizeTray(part, outer, DEFAULT_SETTINGS, ground);
            } catch (error) {
              expect(String(error)).toMatch(/cannot fit a finger slot of at least 15 mm/);
              refused.push(`${sleeve} ${counts.join("+")} +${slack}`);
              continue;
            }
            assertTrayInvariants(tray, outer, DEFAULT_SETTINGS, ground);
            const wedge = thinnestWedge(
              traySpecFrom(tray, outer, ground, DEFAULT_SETTINGS, part.trayKey),
              DEFAULT_SETTINGS,
            );
            expect(wedge.width, wedge.where).toBeGreaterThanOrEqual(0.8 - 0.01);
            realized += 1;
          }
        }
      }
    }
    expect(realized + refused.length).toBe(2 * 90 * 7 * 3);
    expect(refused.filter((r) => !/\b[12]\b/.test(r.split(" ")[1] ?? ""))).toEqual([]);
  });
});
