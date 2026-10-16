// src/ui/identity.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { newComponent } from "../model/defaults";
import type { Component, CompartmentSpec, ComponentKind } from "../model/types";
import tokens from "../styles/tokens.css?raw";
import { contrast, hexToHsl, hexToRgb } from "./color";
import {
  BOX_COLOR,
  SHADE_COUNT,
  componentIndexOfTray,
  shadeHex,
  shadeOf,
  tintOfTray,
  trayNumbersByComponent,
} from "./identity";

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

const KINDS: readonly ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];
const SCHEMES = ["light", "dark"] as const;
const TOKEN_KIND: Record<ComponentKind, string> = {
  cards: "cards",
  bulk: "bits",
  tiles: "tiles",
  minis: "minis",
  custom: "custom",
};

describe("component shades", () => {
  it("gives two card components two shades of blue", () => {
    const first = shadeOf("cards", 0);
    const second = shadeOf("cards", 1);
    expect(second.fill).not.toBe(first.fill);
    for (const scheme of SCHEMES) {
      const a = shadeHex("cards", 0, scheme);
      const b = shadeHex("cards", 1, scheme);
      expect(b.fill).not.toBe(a.fill);
      expect(Math.abs(hexToHsl(b.fill).h - hexToHsl(a.fill).h)).toBeLessThan(10);
      expect(hexToHsl(a.fill).h).toBeGreaterThan(200);
      expect(hexToHsl(a.fill).h).toBeLessThan(240);
    }
  });

  it("starts every kind on its own hue from the tokens, in both schemes", () => {
    const at = tokens.indexOf("@media");
    const blocks = { light: tokens.slice(0, at), dark: tokens.slice(at) };
    for (const scheme of SCHEMES) {
      const found = new Map(
        [...blocks[scheme].matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
      );
      for (const kind of KINDS) {
        const base = shadeHex(kind, 0, scheme);
        const name = TOKEN_KIND[kind];
        expect(base.fill.toLowerCase(), `${kind} fill`).toBe(found.get(`--${name}-fill`));
        expect(base.line.toLowerCase(), `${kind} line`).toBe(found.get(`--${name}-line`));
        expect(base.ink.toLowerCase(), `${kind} ink`).toBe(found.get(`--${name}-ink`));
      }
      expect(BOX_COLOR[scheme].toLowerCase()).toBe(found.get("--box"));
    }
    expect(new Set(KINDS.map((k) => shadeHex(k, 0, "light").fill)).size).toBe(KINDS.length);
  });

  it("keeps every shade's line at 3:1 on the box and on its own fill, and its ink at 4.5:1 on the fill", () => {
    for (const scheme of SCHEMES) {
      for (const kind of KINDS) {
        for (let index = 0; index < 2 * SHADE_COUNT; index++) {
          const { fill, line, ink } = shadeHex(kind, index, scheme);
          const at = `${kind} ${index} ${scheme}`;
          expect(contrast(line, BOX_COLOR[scheme]), `${at} line on box`).toBeGreaterThanOrEqual(3);
          expect(contrast(line, fill), `${at} line on fill`).toBeGreaterThanOrEqual(3);
          expect(contrast(ink, fill), `${at} ink on fill`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps light fills pastel (the vivid #5C8FF6 or #FFBA40 are out)", () => {
    // HSV saturation: pastels sit low (the bases 0.1 to 0.2), the vivid ones high (0.6 and up).
    const chroma = (hex: string): number => {
      const [r, g, b] = hexToRgb(hex);
      return (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
    };
    for (const kind of KINDS) {
      for (let index = 0; index < SHADE_COUNT; index++) {
        const { fill } = shadeHex(kind, index, "light");
        expect(chroma(fill), `${kind} ${index} ${fill}`).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("tells the first shades of a kind apart and then starts over", () => {
    for (const scheme of SCHEMES) {
      for (const kind of KINDS) {
        const fills = Array.from({ length: SHADE_COUNT }, (_, i) => shadeHex(kind, i, scheme).fill);
        for (let a = 0; a < fills.length; a++) {
          for (let b = a + 1; b < fills.length; b++) {
            const [r1, g1, b1] = hexToRgb(fills[a] ?? "#000000");
            const [r2, g2, b2] = hexToRgb(fills[b] ?? "#000000");
            expect(
              Math.hypot(r1 - r2, g1 - g2, b1 - b2),
              `${kind} ${a}/${b} ${scheme}`,
            ).toBeGreaterThanOrEqual(12);
          }
        }
        expect(shadeHex(kind, SHADE_COUNT, scheme)).toEqual(shadeHex(kind, 0, scheme));
      }
    }
  });

  it("hands CSS a colour per scheme, so a dark page needs no second lookup", () => {
    const { fill, line, ink } = shadeOf("tiles", 2);
    for (const value of [fill, line, ink]) {
      expect(value).toMatch(/^light-dark\(#[0-9A-F]{6}, #[0-9A-F]{6}\)$/);
    }
    const light = shadeHex("tiles", 2, "light");
    const dark = shadeHex("tiles", 2, "dark");
    expect(fill).toBe(`light-dark(${light.fill}, ${dark.fill})`);
  });

  it("copes with indices below zero and past the end", () => {
    expect(shadeOf("cards", -1)).toEqual(shadeOf("cards", SHADE_COUNT - 1));
    expect(shadeOf("custom", 3 * SHADE_COUNT + 2)).toEqual(shadeOf("custom", 2));
  });
});
