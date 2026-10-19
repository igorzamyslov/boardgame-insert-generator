import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Component } from "../model/types";
import { togglesOf } from "../model/defaults";
import { componentOptions } from "./component";
import { bulkFallback } from "./fallback";
import { size } from "./group";
import { minOuter, realizeTray } from "./realize";
import {
  assertTrayInvariants,
  at,
  bulk,
  cards,
  custom,
  minis,
  partOf,
  partOfGroup,
  tiles,
} from "./test-helpers";

// The per-component "Finger cuts" and "Curved floor" toggles (spec §5, §6.1): absent, each takes
// the kind's default (as before the toggles); a cut and a scoop on one compartment share no side.
const s = DEFAULT_SETTINGS;
const ground = { lipped: false, level: 0 };

/** The kind and features of the first compartment of the first storage option. */
function first(c: Component): [string, string[]] {
  const req = at(at(at(componentOptions(c, s, 0).options, 0).blocks, 0), 0);
  return [req.kind, req.features.map((f) => (f.side ? `${f.type} ${f.side}` : f.type))];
}

const pockets = minis();
const piled = minis({ storage: "bulk" });
const flatTiles = tiles({ shape: { type: "rect", w: 30, d: 20 }, storage: "flat" });

describe("finger cuts and curved floor toggles", () => {
  it.each<[string, Component, [string, string[]]]>([
    ["cards", cards(), ["well", ["wallCutout left", "wallCutout right"]]],
    ["cards, cuts off", cards({ fingerCuts: false }), ["well", []]],
    ["tiles", flatTiles, ["well", ["wallCutout front", "wallCutout back", "cornerRelief"]]],
    ["tiles, cuts off", { ...flatTiles, fingerCuts: false }, ["well", ["cornerRelief"]]],
    ["minis pockets", pockets, ["pocket", ["wallCutout front", "wallCutout back"]]],
    ["minis pockets, cuts off", { ...pockets, fingerCuts: false }, ["pocket", []]],
    [
      "minis pockets, curved floor on",
      { ...pockets, curvedFloor: true },
      ["pocket", ["wallCutout front", "wallCutout back", "scoop"]],
    ],
    [
      "minis pockets, only the curved floor",
      { ...pockets, fingerCuts: false, curvedFloor: true },
      ["pocket", ["scoop"]],
    ],
    ["minis as bulk", piled, ["scoop", ["scoop"]]],
    [
      "minis as bulk, cuts on",
      { ...piled, fingerCuts: true },
      ["scoop", ["wallCutout front", "scoop"]],
    ],
    ["minis as bulk, curved floor off", { ...piled, curvedFloor: false }, ["well", []]],
    ["custom", custom(), ["well", ["wallCutout front", "cornerRelief"]]],
    [
      "custom, curved floor on",
      custom({ curvedFloor: true }),
      ["well", ["wallCutout front", "scoop", "cornerRelief"]],
    ],
    ["custom, cuts off", custom({ fingerCuts: false }), ["well", ["cornerRelief"]]],
    ["bulk", bulk(), ["scoop", ["scoop"]]],
    ["bulk, cuts on", bulk({ fingerCuts: true }), ["scoop", ["wallCutout front", "scoop"]]],
    ["bulk, both off", bulk({ curvedFloor: false }), ["well", []]],
  ])("%s", (_name, component, expected) => {
    expect(first(component)).toEqual(expected);
  });

  it("cuts a bulk compartment through its front wall, half its depth, its scoop at the back", () => {
    const part = partOf([bulk({ fingerCuts: true })], "shallow|strip|split1");
    const outer = minOuter(part, s, ground);
    const r = realizeTray(part, outer, s, ground);
    assertTrayInvariants(r, outer, s, ground, part);
    const c = at(r.compartments, 0);
    expect(c.features.map((f) => [f.type, "side" in f && f.side])).toEqual([
      ["wallCutout", "front"],
      ["scoop", "back"],
    ]);
    const cut = at(c.features, 0);
    expect(cut.type === "wallCutout" && cut.depth).toBeCloseTo((outer.h - c.floorZ) / 2, 2);
  });

  it("puts the scoop on the sides the cuts leave: pockets cut front and back are scooped left and right", () => {
    // Two rows of curved-floor pockets: the facing cuts twin across the divider, so the ramp takes
    // a free side wall; a second one would not leave 15 mm of flat floor in the 26 mm pocket.
    const scooped = minis({
      curvedFloor: true,
      figures: [{ name: "Hero", w: 25, d: 25, h: 40, count: 2 }],
    });
    const part = partOf([scooped], "standing|rows2|split1");
    const outer = minOuter(part, s, ground);
    const r = realizeTray(part, outer, s, ground);
    assertTrayInvariants(r, outer, s, ground, part);
    const sides = r.compartments.map((c) =>
      c.features.map((f) => `${f.type} ${"side" in f ? f.side : ""}`),
    );
    expect(sides).toEqual([
      ["wallCutout front", "wallCutout back", "scoop left"],
      ["wallCutout front", "wallCutout back", "scoop left"],
    ]);
  });

  it("never opens a deck's channel into a well with its finger cuts off", () => {
    const part = partOfGroup(
      [cards(), custom({ count: 1, fingerCuts: false })],
      "upright-long+custom|strip|split1",
    );
    const outer = minOuter(part, s, ground);
    const r = realizeTray(part, outer, s, ground);
    assertTrayInvariants(r, outer, s, ground, part);
    expect(at(r.compartments, 0).features.map((f) => "side" in f && f.side)).toEqual(["left"]);
    expect(at(r.compartments, 1).features.map((f) => f.type)).toEqual(["cornerRelief"]);
  });

  it("notches a deck's spacer only when the deck has its channel", () => {
    for (const [fingerCuts, notched] of [
      [true, 1],
      [false, 0],
    ] as const) {
      const part = partOf([cards({ fingerCuts, separators: 1 })], "upright-long|strip|split1");
      const min = minOuter(part, s, ground);
      const outer = { ...min, w: min.w + 10 };
      const r = realizeTray(part, outer, s, ground);
      assertTrayInvariants(r, outer, s, ground, part);
      expect(r.spacers).toHaveLength(1);
      expect(r.spacers.map((spacer) => spacer.features?.length ?? 0)).toEqual([notched]);
    }
  });

  it("settles the finger room where it moves the cuts back and forth", () => {
    // Property-test counterexample: four copies' curved-floor pockets with 12.6 mm of divider
    // room, whose cuts move as the room moves the layout and never agree with it. After ROOM_ROUNDS
    // rounds every wall or divider any of those layouts cut keeps its room.
    const m = minis({
      curvedFloor: true,
      copies: 4,
      figures: [{ name: "Fig", w: 10.32, d: 10.32, h: 10, count: 1 }],
    });
    const settings = {
      ...s,
      wall: 0.9,
      floor: 0.8,
      divider: 0.8,
      fit: 0.7,
      bottomChamfer: 0,
      fingerPocket: { width: 5.002, floorNotch: 0, wallRoom: 0.891, dividerRoom: 12.611 },
      lip: { enabled: false, height: 1, thickness: 0.9, ledge: 0.5, play: 0.25 },
    };
    const parts = size([m], settings).requirements.flatMap((req) =>
      req.variants.flatMap((v) => v.parts),
    );
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      for (const opts of [ground, { lipped: false, level: 1 }]) {
        const outer = minOuter(part, settings, opts);
        const r = realizeTray(part, outer, settings, opts);
        assertTrayInvariants(r, outer, settings, opts, part);
      }
    }
  });
});

describe("corner reliefs toggle", () => {
  // The advanced "Corner reliefs" toggle (spec §5, §6.1): absent, on for tiles and custom wells.
  it.each<[string, Component, string[]]>([
    ["cards", cards(), ["wallCutout left", "wallCutout right"]],
    [
      "cards, reliefs on",
      cards({ cornerReliefs: true }),
      ["wallCutout left", "wallCutout right", "cornerRelief"],
    ],
    ["tiles", flatTiles, ["wallCutout front", "wallCutout back", "cornerRelief"]],
    [
      "tiles, reliefs off",
      { ...flatTiles, cornerReliefs: false },
      ["wallCutout front", "wallCutout back"],
    ],
    ["bulk", bulk(), ["scoop"]],
    ["bulk, reliefs on", bulk({ cornerReliefs: true }), ["scoop", "cornerRelief"]],
    ["minis pockets", pockets, ["wallCutout front", "wallCutout back"]],
    ["minis as bulk", piled, ["scoop"]],
    ["custom", custom(), ["wallCutout front", "cornerRelief"]],
    ["custom, reliefs off", custom({ cornerReliefs: false }), ["wallCutout front"]],
  ])("%s", (_name, component, expected) => {
    expect(first(component)[1]).toEqual(expected);
  });
});

describe("a toggle set to its kind's default is the same as an absent one (review 3, I1)", () => {
  const kinds: [string, Component][] = [
    ["cards", cards()],
    ["bulk", bulk()],
    ["tiles", flatTiles],
    ["minis pockets", pockets],
    ["minis as bulk", piled],
    ["custom", custom()],
  ];
  const names = ["fingerCuts", "curvedFloor", "cornerReliefs"] as const;
  const cases = kinds.flatMap(([kind, c]) => names.map((t) => [kind, t, c] as const));
  const explicit = (c: Component, t: (typeof names)[number]): Component => ({
    ...c,
    [t]: togglesOf(c)[t],
  });

  it.each(cases)("%s, %s: the same storage options", (_kind, t, c) => {
    expect(componentOptions(explicit(c, t), s, 0)).toEqual(componentOptions(c, s, 0));
  });

  it.each(cases)("%s, %s: the same bulk fallback", (_kind, t, c) => {
    expect(bulkFallback(explicit(c, t), s)).toEqual(bulkFallback(c, s));
  });
});
