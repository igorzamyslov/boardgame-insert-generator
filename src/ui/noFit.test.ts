// src/ui/noFit.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX, DEFAULT_PRINTER, newComponent } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Box, Component, TraySpec } from "../model/types";
import { misfitOf } from "./noFit";

const box: Box = { ...DEFAULT_BOX, innerWidth: 200, innerDepth: 150, innerHeight: 60, headroom: 0 };

function component(name: string): Component {
  return { ...newComponent("cards"), name };
}

/** A tray holding `c` (its compartment names the component by id). */
function holding(c: Component, over: Partial<TraySpec>): TraySpec {
  const base = makeTray(over);
  return {
    ...base,
    compartments: base.compartments.map((k) => ({ ...k, componentId: c.id, contents: c.name })),
  };
}

describe("misfitOf", () => {
  const settings = DEFAULT_SETTINGS;
  const boards = component("Boards");
  const deck = component("Deck");

  it("names the component whose tray sticks furthest out of the box", () => {
    const attempt = {
      trays: [
        holding(deck, { key: "d", x: 0, y: 0, w: 100, d: 80 }),
        holding(boards, { key: "b", x: 100, y: 0, w: 120, d: 80 }),
      ],
    };
    expect(misfitOf(attempt, box, settings, DEFAULT_PRINTER, [deck, boards])).toEqual({
      componentId: boards.id,
      name: "Boards",
    });
  });

  it("falls back to the print bed when every tray is inside the box", () => {
    const printer = { ...DEFAULT_PRINTER, bedX: 100, bedY: 100, bedMargin: 5 };
    const attempt = {
      trays: [
        holding(deck, { key: "d", x: 0, y: 0, w: 80, d: 80 }),
        holding(boards, { key: "b", x: 80, y: 0, w: 110, d: 80 }),
      ],
    };
    expect(misfitOf(attempt, box, settings, printer, [deck, boards])?.name).toBe("Boards");
  });

  it("is null when nothing stands out, or there is no attempt", () => {
    const attempt = { trays: [holding(deck, { key: "d", x: 0, y: 0, w: 100, d: 80 })] };
    expect(misfitOf(attempt, box, settings, DEFAULT_PRINTER, [deck])).toBeNull();
    expect(misfitOf(null, box, settings, DEFAULT_PRINTER, [deck])).toBeNull();
  });

  it("ignores spacers and spare pieces", () => {
    const spare = makeTray({ key: "s", part: "leftover", x: 0, y: 0, w: 300, d: 80 });
    expect(misfitOf({ trays: [spare] }, box, settings, DEFAULT_PRINTER, [deck])).toBeNull();
  });
});
