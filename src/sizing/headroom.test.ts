// src/sizing/headroom.test.ts
// "Why is the floor thicker on one tray of a deck?" A tray is often taller than its contents need:
// an upper tray is at least as high as its groove needs (3.65 mm), and every tray below the top is rounded up to
// the layer height. realizeTray used to put all of that height under the contents as a raised
// floor (a flat 5-card deck in a 5 mm upper tray stood on a 2.35 mm floor, its neighbour on 1.25
// mm). With `padding` it puts that height above them instead, and only the padding (what the
// stack needs to reach the top plane, which a riser takes at print time) stays a raised floor.
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { minOuter, realizeTray } from "./realize";
import { assertTrayInvariants, at, bulk, cards, partOf } from "./test-helpers";
import type { RealizeOptions } from "./types";

const s: Settings = {
  ...DEFAULT_SETTINGS,
  lip: { ...DEFAULT_SETTINGS.lip, joint: "rim" as const },
};
const upper: RealizeOptions = { lipped: true, level: 2 };
const flat = (count: number, room?: "max") =>
  partOf(
    [
      cards({
        storage: "flat",
        sleeve: "none",
        decks: [{ name: "Deck", count }],
        ...(room ? { room } : {}),
      }),
    ],
    "flat|strip|split1",
  );

describe("realizeTray with padding: the height a tray must have beyond its contents is headroom", () => {
  // a single card: its well is shallower than the tray's minimum, which is what is being tested
  const part = flat(1);
  const min = minOuter(part, s, upper);
  const need = at(part.compartments, 0).minH;

  it("has the contents less than the tray's minimum (so the minimum is what is being tested)", () => {
    // a card in an upper tray: the groove (2.85 mm high, 0.8 mm of wall above it) sets the
    // height, not the card
    expect(min.h).toBe(3.65);
    expect(s.floor + need).toBeLessThan(min.h - 0.5);
  });

  it("keeps the floor at the Floor setting at the tray's minimum height", () => {
    const r = realizeTray(part, min, s, { ...upper, padding: 0 });
    expect(at(r.compartments, 0).floorZ).toBe(s.floor);
    // the well is as deep as the tray allows: the extra height is air above the cards
    expect(min.h - at(r.compartments, 0).floorZ).toBeCloseTo(min.h - s.floor, 9);
    assertTrayInvariants(r, min, s, upper);
  });

  it("without padding it is a raised floor as before (the option is opt-in)", () => {
    const r = realizeTray(part, min, s, upper);
    expect(min.h - at(r.compartments, 0).floorZ).toBeCloseTo(need, 9);
  });

  it("raises the floor only by the padding, whatever the tray's height", () => {
    for (const padding of [0.2, 3, 9.6, 30]) {
      const outer = { ...min, h: min.h + padding };
      const r = realizeTray(part, outer, s, { ...upper, padding });
      expect(at(r.compartments, 0).floorZ, `padding ${padding}`).toBeCloseTo(s.floor + padding, 9);
      assertTrayInvariants(r, outer, s, upper);
    }
  });

  it("gives the same well at every padding: only the floor moves", () => {
    const depth = (padding: number) => {
      const outer = { ...min, h: min.h + padding };
      const r = realizeTray(part, outer, s, { ...upper, padding });
      return outer.h - at(r.compartments, 0).floorZ;
    };
    expect(depth(9.6)).toBeCloseTo(depth(0), 9);
  });

  it("takes layer rounding as headroom too: 0.06 mm over the cards is not a 1.26 mm floor", () => {
    const ground: RealizeOptions = { lipped: true, level: 0 };
    const deck = flat(18);
    const m = minOuter(deck, s, ground);
    // the tray is built a layer-rounded 0.2 mm taller than its minimum (the optimizer's stack
    // heights); padding 0 says none of that is padding
    const outer = { ...m, h: Math.ceil(m.h * 5 - 1e-9) / 5 };
    expect(outer.h).toBeGreaterThan(m.h);
    const r = realizeTray(deck, outer, s, { ...ground, padding: 0 });
    expect(at(r.compartments, 0).floorZ).toBe(s.floor);
  });

  it("never lifts the contents above the tray's own floor when the padding is more than the slack", () => {
    const outer = { ...min, h: min.h + 2 };
    const r = realizeTray(part, outer, s, { ...upper, padding: 50 });
    expect(at(r.compartments, 0).floorZ).toBeCloseTo(outer.h - need, 9);
  });

  it("leaves a well that may grow deeper alone: it takes the height as before", () => {
    const grow = flat(5, "max");
    const m = minOuter(grow, s, upper);
    const outer = { ...m, h: m.h + 10 };
    const without = realizeTray(grow, outer, s, upper);
    const given = realizeTray(grow, outer, s, { ...upper, padding: 0 });
    expect(at(given.compartments, 0).floorZ).toBe(at(without.compartments, 0).floorZ);
  });
});

describe("realizeTray with fixedDepth: an alike tray's wells do not depend on how much padding it has", () => {
  // Bits in a bin that may grow in height (as much as fits) take a deeper well from the room a tray has; the
  // trays of one set stand in stacks with different padding, so they must not (owner, 2026-10-23).
  const bin = partOf(
    [bulk({ items: [{ name: "Bits", count: 20, w: 10, d: 10, h: 4 }], room: "max" })],
    "deep|strip|split1",
  );
  const base = minOuter(bin, s, upper);
  const depth = (padding: number, fixedDepth: boolean): number => {
    const r = realizeTray(bin, { ...base, h: base.h + padding }, s, {
      ...upper,
      padding,
      fixedDepth,
    });
    return base.h + padding - at(r.compartments, 0).floorZ;
  };

  it("deepens the well with the room it has, as before, unless it is fixed", () => {
    expect(depth(6, false)).toBeGreaterThan(depth(0, false) + 1);
    // the same well from the rim down, however much of the tray's height is raised floor
    expect(depth(6, true)).toBeCloseTo(depth(0, true), 9);
  });

  it("gives every padding the same well: only the raised floor moves", () => {
    const wells = [0, 0.2, 3, 9.6, 30].map((padding) => {
      const outer = { ...base, h: base.h + padding };
      const r = realizeTray(bin, outer, s, { ...upper, padding, fixedDepth: true });
      const c = at(r.compartments, 0);
      return [c.w, c.d, outer.h - c.floorZ];
    });
    for (const w of wells) {
      expect(w[0]).toBe(at(wells, 0)[0]);
      expect(w[1]).toBe(at(wells, 0)[1]);
      expect(w[2]).toBeCloseTo(at(wells, 0)[2] ?? 0, 9);
    }
  });
});
