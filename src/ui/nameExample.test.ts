// src/ui/nameExample.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import type { Component, TraySpec } from "../model/types";
import { nameExampleOf } from "./settingsFields";

const cards = (id: string, name: string): Component => ({
  id,
  name,
  access: "sometimes",
  kind: "cards",
  shortSide: 63.5,
  longSide: 88,
  decks: [{ name: "Deck", count: 10 }],
  sleeve: "none",
  thickness: { mode: "preset" },
  storage: "auto",
});

const trayFor = (key: string, componentId: string): TraySpec =>
  makeTray({
    key,
    compartments: [
      {
        x: 1.6,
        y: 1.6,
        w: 50,
        d: 50,
        floorZ: 1.2,
        kind: "well",
        contents: "Whatever ×3",
        componentId,
        features: [],
      },
    ],
  });

describe("nameExampleOf", () => {
  it("gives a tray whose engraved name is shorter than its full one", () => {
    const trays = [trayFor("a:p0:0", "c1")];
    expect(nameExampleOf(trays, [cards("c1", "Market deck")])).toEqual({
      full: "Market deck",
      short: "Market",
    });
  });

  it("gives nothing when every name is engraved whole, or there are no trays", () => {
    expect(nameExampleOf([trayFor("a:p0:0", "c1")], [cards("c1", "Market")])).toBeUndefined();
    expect(nameExampleOf([], [])).toBeUndefined();
  });
});
