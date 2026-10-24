// src/sizing/step.test.ts
// The stepped base (owner, 2026-10-23; model/lip.ts): the walls stay at the Wall setting on both
// sides of the joint, and a tray with another on it keeps the slab's room (slab + play) over its
// contents, so it is that much taller; a tray standing on one is as tall as it would be alone.
import { describe, expect, it } from "vitest";
import { socketOf } from "../model/lip";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { minOuter, realizeTray } from "./realize";
import { wallFor } from "./outer";
import { assertTrayInvariants, at, cards, partOf } from "./test-helpers";

const step: Settings = {
  ...DEFAULT_SETTINGS,
  lip: { ...DEFAULT_SETTINGS.lip, joint: "step" as const },
};
const rim: Settings = { ...step, lip: { ...step.lip, joint: "rim" as const } };
const deck = partOf(
  [cards({ storage: "flat", sleeve: "none", decks: [{ name: "Deck", count: 30 }] })],
  "flat|strip|split1",
);
const depth = socketOf(step, true)?.depth ?? NaN;

describe("sizing with the stepped base", () => {
  it("keeps every wall at the Wall setting, where the rim thickens them", () => {
    for (const [lipped, level] of [
      [false, 0],
      [true, 0],
      [false, 1],
      [true, 2],
    ] as const) {
      expect(wallFor(step, lipped, level), `${lipped} ${level}`).toBe(DEFAULT_SETTINGS.wall);
    }
    expect(wallFor(rim, true, 0)).toBeCloseTo(2.9, 9);
  });

  it("makes a tray with another on it the socket's depth taller, and no wider", () => {
    expect(depth).toBeCloseTo(1.75, 9);
    const alone = minOuter(deck, step, { lipped: false, level: 0 });
    const under = minOuter(deck, step, { lipped: true, level: 0 });
    expect(under.w).toBe(alone.w);
    expect(under.d).toBe(alone.d);
    expect(under.h).toBeCloseTo(alone.h + depth, 9);
    // the rim's lower tray is wider instead (its lipped walls) and no taller
    const rimmed = minOuter(deck, rim, { lipped: true, level: 0 });
    expect(rimmed.w).toBeGreaterThan(alone.w);
    expect(rimmed.h).toBe(minOuter(deck, rim, { lipped: false, level: 0 }).h);
  });

  it("makes a tray on another as tall as one alone: its slab hangs below it", () => {
    expect(minOuter(deck, step, { lipped: false, level: 1 })).toEqual(
      minOuter(deck, step, { lipped: false, level: 0 }),
    );
  });

  it("keeps the contents the socket's depth under the rim, and the cuts down to the floor", () => {
    const opts = { lipped: true, level: 1 };
    const min = minOuter(deck, step, opts);
    for (const extra of [0, 3.4]) {
      const outer = { ...min, h: min.h + extra };
      const r = realizeTray(deck, outer, step, { ...opts, padding: 0 });
      assertTrayInvariants(r, outer, step, opts);
      const c = at(r.compartments, 0);
      const need = at(deck.compartments, 0).minH;
      expect(c.floorZ, `+${extra}`).toBe(step.floor);
      expect(c.floorZ + need, `+${extra}`).toBeLessThanOrEqual(outer.h - depth + 1e-9);
      const cuts = c.features.flatMap((f) => (f.type === "wallCutout" ? [f] : []));
      expect(cuts.length).toBeGreaterThan(0);
      for (const cut of cuts) {
        expect(cut.depth, `+${extra}`).toBeCloseTo(outer.h - c.floorZ, 9);
      }
    }
  });
});
