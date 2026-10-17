// src/ui/noFit.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX, newComponent } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Box, Component, TraySpec } from "../model/types";
import type { LockConflict } from "../layout/types";
import { misfitOf, namedConflicts } from "./noFit";

const box: Box = { ...DEFAULT_BOX, innerWidth: 200, innerDepth: 150, innerHeight: 60, headroom: 0 };

function component(name: string): Component {
  return { ...newComponent("cards"), name };
}

/** A tray holding the components `cs` (each compartment names one by id). */
function holding(cs: Component[], over: Partial<TraySpec>): TraySpec {
  const base = makeTray(over);
  const first = base.compartments[0];
  if (first === undefined) {
    throw new Error("no compartment");
  }
  return {
    ...base,
    compartments: cs.map((c) => ({ ...first, componentId: c.id, contents: c.name })),
  };
}

describe("misfitOf", () => {
  const settings = DEFAULT_SETTINGS;
  const boards = component("Boards");
  const deck = component("Deck");
  const all = [deck, boards];

  it("names the component whose tray sticks furthest out of the box", () => {
    const attempt = {
      trays: [
        holding([deck], { key: "d", x: 0, y: 0, w: 100, d: 80 }),
        holding([boards], { key: "b", x: 100, y: 0, w: 120, d: 80 }),
      ],
    };
    expect(misfitOf(attempt, box, settings, all)).toEqual({
      componentId: boards.id,
      trayKey: "b",
      name: "Boards",
      reason: "box",
    });
  });

  it("puts a tray beyond the print bed before one that overhangs the box", () => {
    const attempt = {
      trays: [
        // overhangs the box a lot, but would print
        holding([deck], { key: "d", x: 150, y: 0, w: 100, d: 80 }),
        // inside the box, but no bed orientation holds it
        holding([boards], { key: "b", x: 0, y: 0, w: 100, d: 80 }),
      ],
      overBedKeys: ["b"],
    };
    expect(misfitOf(attempt, box, settings, all)).toEqual({
      componentId: boards.id,
      trayKey: "b",
      name: "Boards",
      reason: "bed",
    });
  });

  it("takes the biggest of several trays beyond the bed", () => {
    const attempt = {
      trays: [
        holding([deck], { key: "d", x: 0, y: 0, w: 100, d: 80 }),
        holding([boards], { key: "b", x: 100, y: 0, w: 90, d: 140 }),
      ],
      overBedKeys: ["d", "b"],
    };
    expect(misfitOf(attempt, box, settings, all)?.name).toBe("Boards");
  });

  it("names a grouped tray by what it holds, and opens the first component", () => {
    const attempt = {
      trays: [holding([deck, boards], { key: "g", x: 100, y: 0, w: 120, d: 80 })],
    };
    expect(misfitOf(attempt, box, settings, all)).toEqual({
      componentId: deck.id,
      trayKey: "g",
      name: "Deck + Boards",
      reason: "box",
    });
  });

  it("is null when nothing stands out, or there is no attempt", () => {
    const attempt = { trays: [holding([deck], { key: "d", x: 0, y: 0, w: 100, d: 80 })] };
    expect(misfitOf(attempt, box, settings, all)).toBeNull();
    expect(misfitOf(null, box, settings, all)).toBeNull();
  });

  it("ignores spacers and spare pieces", () => {
    const spare = makeTray({ key: "s", part: "leftover", x: 0, y: 0, w: 300, d: 80 });
    expect(misfitOf({ trays: [spare], overBedKeys: ["s"] }, box, settings, all)).toBeNull();
  });
});

describe("namedConflicts", () => {
  const deck = component("Deck");
  const boards = component("Boards");
  const plan = [
    holding([deck], { key: "d:p0:0", x: 0, y: 0, w: 100, d: 80 }),
    holding([boards], { key: "b:p0:0", x: 100, y: 0, w: 90, d: 80 }),
  ];
  const all = [deck, boards];

  it("calls a pin by the name the plan gives its tray, not the engine's", () => {
    const conflicts: LockConflict[] = [
      { trayKey: "d:p0:0", kind: "position", name: "Deck ×80", reason: "r" },
    ];
    expect(namedConflicts(conflicts, plan, all, [])[0]?.name).toBe("Deck");
  });

  it("calls a stack by its trays' names, joined with and", () => {
    const locks = [{ kind: "stack" as const, trayKeys: ["d:p0:0", "b:p0:0"] }];
    const conflicts: LockConflict[] = [
      { trayKey: "d:p0:0", kind: "stack", name: "Deck ×80, Boards ×12", reason: "r" },
    ];
    expect(namedConflicts(conflicts, plan, all, locks)[0]?.name).toBe("Deck and Boards");
  });

  it("keeps the engine's name where the plan cannot give one: no plan, an old key, a tray that holds nothing", () => {
    const conflict: LockConflict = {
      trayKey: "gone",
      kind: "position",
      name: "Old ×2",
      reason: "r",
    };
    expect(namedConflicts([conflict], undefined, all, [])[0]).toBe(conflict);
    expect(namedConflicts([conflict], plan, all, [])[0]).toBe(conflict);
    const empty = makeTray({ key: "e:p0:0", compartments: [] });
    const other: LockConflict = {
      trayKey: "e:p0:0",
      kind: "position",
      name: "Spare ×1",
      reason: "r",
    };
    expect(namedConflicts([other], [empty], all, [])[0]?.name).toBe("Spare ×1");
  });

  it("leaves the reason, the key and the kind as the engine wrote them", () => {
    const c: LockConflict = { trayKey: "d:p0:0", kind: "size", name: "x", reason: "no room" };
    expect(namedConflicts([c], plan, all, [])[0]).toEqual({ ...c, name: "Deck" });
  });
});
