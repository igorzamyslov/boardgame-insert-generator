// src/ui/identity.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { newComponent } from "../model/defaults";
import type { Component, CompartmentSpec } from "../model/types";
import { componentIndexOfTray, tintOfTray, trayNumbersByComponent } from "./identity";

function cards(id: string, name: string): Component {
  return { ...newComponent("cards"), id, name };
}

function well(over: Partial<CompartmentSpec> = {}): CompartmentSpec {
  return {
    x: 2,
    y: 2,
    w: 50,
    d: 50,
    floorZ: 1.2,
    kind: "well",
    contents: "Deck ×50",
    features: [],
    ...over,
  };
}

describe("tray identity", () => {
  it("still finds the component of a layout whose text carries its name before the deck's", () => {
    const components = [cards("c1", "Other"), cards("c2", "Starter deck")];
    const tray = makeTray({ compartments: [well({ contents: "Starter deck — Deck 1 ×15" })] });
    expect(componentIndexOfTray(tray, components)).toBe(1);
  });

  // Several unnamed components of one kind all carry the same name, so matching the contents
  // text put every one of their trays on the first component: the list showed eight colours
  // and the plan and the 3D view showed one.
  it("keeps same-named components apart by their id", () => {
    const components = [cards("c1", "Cards"), cards("c2", "Cards")];
    const first = makeTray({ compartments: [well({ componentId: "c1" })] });
    const second = makeTray({ compartments: [well({ componentId: "c2" })] });

    expect(componentIndexOfTray(first, components)).toBe(0);
    expect(componentIndexOfTray(second, components)).toBe(1);
    expect(tintOfTray(first, components)).not.toBe(tintOfTray(second, components));
  });

  it("lists each component's own trays when the names collide", () => {
    const components = [cards("c1", "Cards"), cards("c2", "Cards")];
    const parts = [
      { number: 1, spec: makeTray({ compartments: [well({ componentId: "c1" })] }) },
      { number: 2, spec: makeTray({ compartments: [well({ componentId: "c2" })] }) },
      { number: 3, spec: makeTray({ compartments: [well({ componentId: "c2" })] }) },
    ];
    expect([...trayNumbersByComponent(parts, components)]).toEqual([
      [0, [1]],
      [1, [2, 3]],
    ]);
  });

  // Layouts stored before schema 0.1.2 have no componentId, so they keep the old behaviour.
  it("falls back to the contents text when the compartment names no component", () => {
    const components = [cards("c1", "Tableau"), cards("c2", "Market")];
    const tray = makeTray({ compartments: [well({ contents: "Market ×30" })] });
    expect(componentIndexOfTray(tray, components)).toBe(1);
  });

  // A component the layout was made with can be gone by the time the layout is drawn.
  it("falls back when the id names a component that is no longer there", () => {
    const components = [cards("c1", "Tableau")];
    const tray = makeTray({
      compartments: [well({ componentId: "gone", contents: "Tableau ×1" })],
    });
    expect(componentIndexOfTray(tray, components)).toBe(0);
  });

  it("gives a part holding nothing no identity", () => {
    const components = [cards("c1", "Cards")];
    const spacer = makeTray({ part: "spacer", compartments: [] });
    expect(componentIndexOfTray(spacer, components)).toBeNull();
    expect(tintOfTray(spacer, components)).toBeNull();
    // A riser is the neutral filler too: SPARE_COLOR in the 3D view, which is what null means.
    const riser = makeTray({ part: "riser", compartments: [] });
    expect(componentIndexOfTray(riser, components)).toBeNull();
    expect(tintOfTray(riser, components)).toBeNull();
  });
});
