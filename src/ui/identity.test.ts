// src/ui/identity.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { newComponent } from "../model/defaults";
import type {
  BulkComponent,
  CardsComponent,
  Component,
  CompartmentSpec,
  ComponentKind,
  Group,
  MinisComponent,
} from "../model/types";
import tokens from "../styles/tokens.css?raw";
import { contrast, hexToHsl, hexToRgb, rgbToHex } from "./color";
import {
  BOX_COLOR,
  GROUP_BASES,
  groupShadeIndexOf,
  groupShadeIndexOfTray,
  SPACER_SHADE,
  SHADE_COUNT,
  compartmentWords,
  componentIdsOfTray,
  componentIndexOfTray,
  componentIndexesOfTray,
  componentSummary,
  groupOfTray,
  isGroupTray,
  kindIndexOf,
  layerLabel,
  layerWords,
  shadeHex,
  shadeIndexOf,
  shadeOf,
  sharingTrayWith,
  traysOfGroup,
  wellName,
  wellNamesOfTray,
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
    // A riser is the neutral too: SPACER_SHADE in the 3D view, which is what null means.
    const riser = makeTray({ part: "riser", compartments: [] });
    expect(componentIndexOfTray(riser, components)).toBeNull();
  });
});

// A group puts several components in one tray: the tray belongs to every one of them, and takes its
// colour from the first (the one `shadeIndexOf` is asked about).
describe("a tray that holds several components", () => {
  const components = [cards("c1", "Tableau"), cards("c2", "Market"), cards("c3", "Goals")];
  const shared = makeTray({
    key: "g:p0:0",
    compartments: [
      well({ componentId: "c2", contents: "Market ×30" }),
      well({ componentId: "c3", contents: "Goals ×10" }),
      well({ kind: "spare", contents: "" }),
    ],
  });

  it("names every component in it, in compartment order, by its id", () => {
    expect(componentIndexesOfTray(shared, components)).toEqual([1, 2]);
    expect(componentIdsOfTray(shared, components)).toEqual(["c2", "c3"]);
  });

  it("names a component once though it has several compartments", () => {
    const twice = makeTray({
      compartments: [
        well({ componentId: "c1", contents: "Tableau — Deck 1 ×15" }),
        well({ componentId: "c1", contents: "Tableau — Deck 2 ×15" }),
        well({ componentId: "c2", contents: "Market ×30" }),
      ],
    });
    expect(componentIndexesOfTray(twice, components)).toEqual([0, 1]);
  });

  it("finds a component by its words in the contents when the compartment names none", () => {
    const old = makeTray({
      compartments: [well({ contents: "Market ×30" }), well({ contents: "Goals ×10" })],
    });
    expect(componentIndexesOfTray(old, components)).toEqual([1, 2]);
  });

  it("leaves out a compartment of nothing, and a part that holds nothing has none", () => {
    expect(
      componentIndexesOfTray(makeTray({ part: "spacer", compartments: [] }), components),
    ).toEqual([]);
    expect(
      componentIdsOfTray(
        makeTray({ compartments: [well({ kind: "spare", contents: "" })] }),
        components,
      ),
    ).toEqual([]);
  });

  it("keeps the colour with the first component: componentIndexOfTray and the shade are unchanged", () => {
    expect(componentIndexOfTray(shared, components)).toBe(1);
    // one source for the shade: the first member's index through shadeIndexOf, as the plan and 3D take it
    expect(shadeIndexOf(components, componentIndexOfTray(shared, components) ?? -1)).toBe(1);
    expect(componentIndexOfTray(shared, components)).toBe(
      componentIndexesOfTray(shared, components)[0],
    );
  });

  it("lights together the components that share a tray: its own and the others in it", () => {
    const own = makeTray({ key: "a:p0:0", compartments: [well({ componentId: "c1" })] });
    const trays = [own, shared];
    expect([...sharingTrayWith("c2", trays, components)].sort()).toEqual(["c2", "c3"]);
    expect([...sharingTrayWith("c3", trays, components)].sort()).toEqual(["c2", "c3"]);
    // a component alone in its tray is just itself
    expect([...sharingTrayWith("c1", trays, components)]).toEqual(["c1"]);
    // and one the plan has no tray for
    expect([...sharingTrayWith("zz", trays, components)]).toEqual(["zz"]);
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

  it("starts every kind on its own hue from the tokens", () => {
    // tokens.css is light only until the opt-in dark theme (UI rebuild Task 16) restores its set
    for (const scheme of ["light"] as const) {
      const found = new Map(
        [...tokens.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
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

  it("mirrors the spacer tokens", () => {
    // tokens.css is light only until the opt-in dark theme (UI rebuild Task 16) restores its set
    for (const scheme of ["light"] as const) {
      const found = new Map(
        [...tokens.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
      );
      expect(SPACER_SHADE[scheme].fill, `${scheme} fill`).toBe(found.get("--spacer-fill"));
      expect(SPACER_SHADE[scheme].hatch, `${scheme} hatch`).toBe(found.get("--spacer-hatch"));
      expect(SPACER_SHADE[scheme].dash, `${scheme} dash`).toBe(found.get("--spacer-dash"));
    }
  });

  it("gives each group a hue of its own: three hues, then their lightness steps, light and dark", () => {
    const hues = GROUP_BASES.length;
    for (const scheme of SCHEMES) {
      for (let i = 0; i < hues; i++) {
        expect(shadeHex("group", i, scheme)).toEqual(GROUP_BASES[i]?.[scheme]);
      }
      // the next group of a hue steps inside it, as a component's second shade does
      const first = hexToHsl(shadeHex("group", 0, scheme).fill);
      const again = hexToHsl(shadeHex("group", hues, scheme).fill);
      expect(Math.abs(first.h - again.h)).toBeLessThan(2);
      expect(shadeHex("group", hues, scheme).fill).not.toBe(shadeHex("group", 0, scheme).fill);
    }
  });

  it("keeps a group's line at 3:1 on the box and the fill and its ink at 4.5:1, for any group", () => {
    for (const scheme of SCHEMES) {
      for (let i = 0; i < GROUP_BASES.length * SHADE_COUNT; i++) {
        const { fill, line, ink } = shadeHex("group", i, scheme);
        expect(
          contrast(line, BOX_COLOR[scheme]),
          `${scheme} ${i} line on box`,
        ).toBeGreaterThanOrEqual(3);
        expect(contrast(line, fill), `${scheme} ${i} line on fill`).toBeGreaterThanOrEqual(3);
        expect(contrast(ink, fill), `${scheme} ${i} ink on fill`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps groups apart from components and spacers: no group fill is a kind's, a spacer's or another group's", () => {
    for (const scheme of SCHEMES) {
      const groups = Array.from({ length: GROUP_BASES.length * SHADE_COUNT }, (_, i) =>
        shadeHex("group", i, scheme).fill.toLowerCase(),
      );
      expect(new Set(groups).size).toBe(groups.length);
      const others = [
        SPACER_SHADE[scheme].fill,
        ...KINDS.flatMap((k) =>
          Array.from({ length: SHADE_COUNT }, (_, i) => shadeHex(k, i, scheme).fill),
        ),
      ].map((x) => x.toLowerCase());
      for (const g of groups) {
        expect(others).not.toContain(g);
      }
      // the base of each group hue is a mid tone where a kind's base is a pastel
      for (const k of KINDS) {
        for (let i = 0; i < GROUP_BASES.length; i++) {
          const kind = hexToHsl(shadeHex(k, 0, scheme).fill);
          const group = hexToHsl(shadeHex("group", i, scheme).fill);
          const apart = Math.min(Math.abs(kind.h - group.h), 360 - Math.abs(kind.h - group.h));
          expect(apart > 25 || Math.abs(kind.l - group.l) > 8, `${scheme} ${k} vs group ${i}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("numbers a group by its place among the project's groups, the same for every tray of it", () => {
    const g = (id: string): Group => ({ id, name: id, copies: 1, access: "often", memberIds: [] });
    const groups = [g("a"), g("b"), g("c")];
    expect(groupShadeIndexOf(groups, "a")).toBe(0);
    expect(groupShadeIndexOf(groups, "c")).toBe(2);
    expect(groupShadeIndexOf(groups, "gone")).toBe(0);
    expect(groupShadeIndexOf(undefined, "a")).toBe(0);
    const tray = (key: string) => makeTray({ key, compartments: [] });
    const p = { components: [], groups };
    expect(groupShadeIndexOfTray(tray("b:p0:0"), p)).toBe(1);
    expect(groupShadeIndexOfTray(tray("b:p3:2"), p)).toBe(1);
    expect(groupShadeIndexOfTray(tray("loose:p0:0"), p)).toBe(0);
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

  it("keeps light fills soft (the vivid #5C8FF6 or #FFBA40 are out)", () => {
    // HSV saturation: the bases sit low (0.2 to 0.33), the deepest shades of amber 0.55, the
    // vivid ones high (0.6 and up).
    const chroma = (hex: string): number => {
      const [r, g, b] = hexToRgb(hex);
      return (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
    };
    for (const kind of KINDS) {
      for (let index = 0; index < SHADE_COUNT; index++) {
        const { fill } = shadeHex(kind, index, "light");
        expect(chroma(fill), `${kind} ${index} ${fill}`).toBeLessThanOrEqual(0.58);
      }
    }
  });

  it("keeps every shade's ink at 4.5:1 on the name pill (92% white) laid over its fill", () => {
    const alpha = Number(/--pill-fill:\s*rgb\(255 255 255 \/ (\d+)%\)/.exec(tokens)?.[1]) / 100;
    expect(alpha).toBeGreaterThan(0.5);
    for (let index = 0; index < 2 * SHADE_COUNT; index++) {
      for (const kind of KINDS) {
        const { fill, ink } = shadeHex(kind, index, "light");
        const [r, g, b] = hexToRgb(fill);
        const over = (v: number): number => alpha * 255 + (1 - alpha) * v;
        const pill = rgbToHex(over(r), over(g), over(b));
        expect(contrast(ink, pill), `${kind} ${index} ink on pill`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("makes a tile's compartment cells lighter than its fill but no more than 40% white", () => {
    const alpha = Number(/--cell-fill:\s*rgb\(255 255 255 \/ (\d+)%\)/.exec(tokens)?.[1]) / 100;
    expect(alpha).toBeGreaterThan(0.2);
    expect(alpha).toBeLessThanOrEqual(0.4);
  });

  // Owner feedback: "colors in the box look a bit pale". The cause was the base fills (HSL
  // lightness 89 to 92, as the board draws them) under a white cell that covered most of the
  // tile, and a later shade that stepped toward white (lightness 96) or toward grey (saturation
  // down by a quarter). Fills sit a notch deeper, and a later shade goes darker or a little
  // lighter, but keeps its colour.
  it("keeps every light fill at lightness 90 or less, and the base fills a notch deeper than the board's", () => {
    for (const kind of KINDS) {
      expect(hexToHsl(shadeHex(kind, 0, "light").fill).l, `${kind} base`).toBeLessThanOrEqual(87);
      for (let index = 0; index < SHADE_COUNT; index++) {
        const { fill } = shadeHex(kind, index, "light");
        expect(hexToHsl(fill).l, `${kind} ${index} ${fill}`).toBeLessThanOrEqual(90);
      }
    }
  });

  it("keeps a later shade's colour: its saturation stays within 80% of the base fill's", () => {
    for (const kind of KINDS) {
      const base = hexToHsl(shadeHex(kind, 0, "light").fill);
      for (let index = 1; index < SHADE_COUNT; index++) {
        const { fill } = shadeHex(kind, index, "light");
        expect(hexToHsl(fill).s, `${kind} ${index} ${fill}`).toBeGreaterThanOrEqual(base.s * 0.8);
      }
    }
  });

  it("steps lightness both ways from the base, not only toward white", () => {
    for (const kind of KINDS) {
      const base = hexToHsl(shadeHex(kind, 0, "light").fill).l;
      const later = Array.from(
        { length: SHADE_COUNT - 1 },
        (_, i) => hexToHsl(shadeHex(kind, i + 1, "light").fill).l,
      );
      expect(Math.min(...later), `${kind} has a darker shade`).toBeLessThan(base - 5);
      expect(Math.max(...later), `${kind} has a lighter shade`).toBeGreaterThan(base);
      // lighter by a few points only
      expect(Math.max(...later), `${kind} lighter shade`).toBeLessThanOrEqual(base + 5);
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

describe("kindIndexOf", () => {
  it("counts the components of the same kind before it", () => {
    const list = [newComponent("cards"), newComponent("bulk"), newComponent("cards")];
    expect([0, 1, 2].map((i) => kindIndexOf(list, i))).toEqual([0, 0, 1]);
  });
});

describe("layerWords", () => {
  it("writes the layers as Main does", () => {
    expect([0, 1, 2].map((l) => layerWords(l, 3))).toEqual([
      "bottom layer",
      "layer 2",
      "top layer",
    ]);
    expect([0, 1].map((l) => layerWords(l, 2))).toEqual(["bottom layer", "top layer"]);
    expect(layerWords(0, 1)).toBe("");
  });
});

describe("layerLabel", () => {
  it("names the bottom and top layer, and the ones between", () => {
    expect([0, 1, 2].map((l) => layerLabel(l, 3))).toEqual([
      "Layer 1 (bottom)",
      "Layer 2",
      "Layer 3 (top)",
    ]);
    expect([0, 1].map((l) => layerLabel(l, 2))).toEqual(["Layer 1 (bottom)", "Layer 2 (top)"]);
    expect(layerLabel(0, 1)).toBe("Layer 1");
  });
});

describe("componentSummary", () => {
  it("says how many cards there are, and that they are sleeved", () => {
    const c = { ...(newComponent("cards") as CardsComponent), sleeve: "standard" as const };
    expect(componentSummary(c)).toBe("50 cards, sleeved");
    expect(componentSummary({ ...c, sleeve: { w: 66, h: 91, thickness: 0.1 } })).toBe(
      "50 cards, sleeved",
    );
    expect(componentSummary({ ...c, sleeve: "none" })).toBe("50 cards");
  });

  it("says how the cards are split into decks", () => {
    const c = newComponent("cards") as CardsComponent;
    const decks = (counts: number[]): CardsComponent["decks"] =>
      counts.map((count, i) => ({ name: `Deck ${i + 1}`, count }));
    expect(componentSummary({ ...c, decks: decks([12, 12, 12, 12]) })).toBe("4 decks of 12");
    expect(componentSummary({ ...c, decks: decks([12, 30]) })).toBe("42 cards in 2 decks");
  });

  it("calls tokens and dice kinds and pieces, not bits", () => {
    const c = newComponent("bulk") as BulkComponent;
    const item = { name: "Coins", count: 40, w: 20, d: 20, h: 2 };
    expect(componentSummary({ ...c, items: [item] })).toBe("40 pieces");
    expect(componentSummary({ ...c, items: [item, { ...item, count: 24 }] })).toBe(
      "2 kinds, 64 pieces",
    );
    // a kind given by volume has no count to add up
    expect(componentSummary({ ...c, items: [item, { name: "Beads", volumeMl: 50 }] })).toBe(
      "2 kinds",
    );
    expect(componentSummary({ ...c, items: [{ name: "Beads", volumeMl: 50 }] })).toBe("1 kind");
  });

  it("counts tiles, figures and custom pieces", () => {
    expect(componentSummary({ ...newComponent("tiles"), count: 24 } as Component)).toBe("24 tiles");
    const minis = newComponent("minis") as MinisComponent;
    expect(
      componentSummary({
        ...minis,
        figures: [
          { ...(minis.figures[0] as MinisComponent["figures"][number]), count: 4 },
          { ...(minis.figures[0] as MinisComponent["figures"][number]), count: 2 },
        ],
      }),
    ).toBe("6 figures");
    // one figure is "1 figure", as GroupRail's Hero row says
    expect(
      componentSummary({
        ...minis,
        figures: [{ ...(minis.figures[0] as MinisComponent["figures"][number]), count: 1 }],
      }),
    ).toBe("1 figure");
    expect(
      componentSummary({ ...newComponent("custom"), count: 2, w: 30, d: 20, h: 10 } as Component),
    ).toBe("2 × 30 × 20 × 10 mm");
  });
});

describe("compartmentWords", () => {
  const compartment = (kind: "well" | "scoop" | "pocket" | "spare") => ({
    x: 0,
    y: 0,
    w: 10,
    d: 10,
    floorZ: 1,
    kind,
    contents: kind === "spare" ? "" : "x",
    features: [],
  });
  const trayOf = (...kinds: ("well" | "scoop" | "pocket" | "spare")[]) =>
    makeTray({ compartments: kinds.map(compartment) });

  it("names a well by what it holds, and counts them", () => {
    expect(compartmentWords(trayOf("well"), newComponent("cards") as Component)).toBe(
      "1 card well",
    );
    expect(
      compartmentWords(trayOf("well", "well", "well", "well"), newComponent("cards") as Component),
    ).toBe("4 card wells");
    expect(compartmentWords(trayOf("well"), newComponent("tiles") as Component)).toBe(
      "1 tile stack",
    );
    expect(compartmentWords(trayOf("well"), newComponent("bulk") as Component)).toBe(
      "1 compartment",
    );
    expect(compartmentWords(trayOf("well"), undefined)).toBe("1 compartment");
  });

  it("says scooped compartments and figure pockets by the compartment's own kind", () => {
    expect(compartmentWords(trayOf("scoop", "scoop"), newComponent("bulk") as Component)).toBe(
      "2 scooped compartments",
    );
    expect(
      compartmentWords(trayOf(...Array(6).fill("pocket")), newComponent("minis") as Component),
    ).toBe("6 figure pockets");
  });

  it("says nothing for a tray with no compartments, and leaves spares out of the count", () => {
    expect(compartmentWords(trayOf(), undefined)).toBeNull();
    expect(compartmentWords(trayOf("spare"), undefined)).toBeNull();
    expect(compartmentWords(trayOf("well", "spare"), newComponent("cards") as Component)).toBe(
      "1 card well",
    );
  });
});

describe("group identity", () => {
  const components = [cards("c1", "Hero"), cards("c2", "Board"), cards("c3", "Dice")];
  const kit: Group = {
    id: "kit",
    name: "Player kit",
    copies: 2,
    access: "often",
    memberIds: ["c1", "c2"],
  };
  const project = { components, groups: [kit] };
  const trayOf = (key: string, over: Partial<ReturnType<typeof makeTray>> = {}) =>
    makeTray({
      key,
      compartments: [well({ componentId: "c1" }), well({ componentId: "c2" })],
      ...over,
    });

  it("finds a tray's group by the stem of its key", () => {
    expect(groupOfTray(trayOf("kit:p0:0"), project)).toBe(kit);
    expect(groupOfTray(trayOf("kit:p1:2"), project)).toBe(kit);
    // a spacer, riser or divider under it is its too
    expect(
      groupOfTray(makeTray({ key: "kit:p1:0:spacer", part: "spacer", compartments: [] }), project),
    ).toBe(kit);
    expect(
      groupOfTray(
        makeTray({ key: "kit:p0:0:divider:1", part: "divider", compartments: [] }),
        project,
      ),
    ).toBe(kit);
  });

  it("reads the key's stem alone: an item's own keys in a stored plan are not the group's", () => {
    // a stored plan of an item that has since joined a group still has the item's keys; the names
    // (`trayNames`) read the stem alone, so the look and the lift must too
    expect(groupOfTray(trayOf("c1:p0:0"), project)).toBeUndefined();
    expect(isGroupTray(trayOf("c1:p0:0"), project)).toBe(false);
    expect(isGroupTray(trayOf("kit:p0:0"), project)).toBe(true);
  });

  it("has no group for an ungrouped item's tray, a part that holds nothing, or a project without groups", () => {
    const dice = makeTray({ key: "c3:p0:0", compartments: [well({ componentId: "c3" })] });
    expect(groupOfTray(dice, project)).toBeUndefined();
    expect(
      groupOfTray(makeTray({ key: "leftover:0", part: "leftover", compartments: [] }), project),
    ).toBeUndefined();
    expect(groupOfTray(trayOf("kit:p0:0"), { components })).toBeUndefined();
    // a key that merely starts with the id is not its stem
    expect(groupOfTray(makeTray({ key: "kit2:p0:0", compartments: [] }), project)).toBeUndefined();
  });

  it("lists every copy's trays of a group, in the plan's order, and no other group's", () => {
    const trays = [
      trayOf("kit:p0:0"),
      makeTray({ key: "c3:p0:0", compartments: [well({ componentId: "c3" })] }),
      trayOf("kit:p1:0"),
      trayOf("kit:p1:1"),
      makeTray({ key: "kit:p1:0:spacer", part: "spacer", compartments: [] }),
    ];
    const listed = traysOfGroup({ ...project, layout: { trays } as never }, "kit");
    expect(listed.map((t) => t.key)).toEqual(["kit:p0:0", "kit:p1:0", "kit:p1:1"]);
    expect(traysOfGroup({ ...project, layout: { trays } as never }, "nope")).toEqual([]);
    expect(traysOfGroup(project, "kit")).toEqual([]);
    // the app's printed trays can be handed in, as the editor's stage does
    expect(traysOfGroup(project, "kit", trays).map((t) => t.key)).toEqual([
      "kit:p0:0",
      "kit:p1:0",
      "kit:p1:1",
    ]);
  });
});

describe("wellName", () => {
  const bulk = (name: string): Component => ({ ...newComponent("bulk"), id: "b", name });

  it("takes the item's name out of what the sizing wrote", () => {
    expect(wellName("Resources — Wood ×20", bulk("Resources"))).toBe("Wood");
    expect(wellName("Resources — Oil 150 ml", bulk("Resources"))).toBe("Oil");
    expect(wellName("Faction miniatures — Mech 2/4", bulk("Faction miniatures"))).toBe("Mech");
  });

  it("has no name for the one item a component is called after", () => {
    expect(wellName("Coins ×40", bulk("Coins"))).toBe("");
    expect(wellName("Power dials 1/2", bulk("Power dials"))).toBe("");
  });

  it("names every deck of a shared well", () => {
    expect(wellName("Encounters — Deck 1 ×30 + Deck 2 ×30", bulk("Encounters"))).toBe(
      "Deck 1 + Deck 2",
    );
  });

  it("keeps an item's own name when the component has none", () => {
    expect(wellName("Wood ×20", bulk(""))).toBe("Wood");
  });
});

describe("wellNamesOfTray", () => {
  const comp = { ...newComponent("bulk"), id: "b", name: "Resources" } as Component;
  const wells = (...contents: string[]) =>
    makeTray({
      compartments: contents.map((c) => well({ contents: c, componentId: "b" })),
    });

  it("names each well of a tray of several kinds", () => {
    expect(wellNamesOfTray(wells("Resources — Oil ×20", "Resources — Wood ×20"), [comp])).toEqual([
      "Oil",
      "Wood",
    ]);
  });

  it("names nothing for a tray of one kind", () => {
    expect(wellNamesOfTray(wells("Resources — Oil ×20"), [comp])).toEqual([""]);
  });

  it("says a figure's name once for the run of its pockets", () => {
    expect(
      wellNamesOfTray(
        wells(
          "Resources — Leader",
          "Resources — Mech 1/2",
          "Resources — Mech 2/2",
          "Resources — Hero",
        ),
        [comp],
      ),
    ).toEqual(["Leader", "Mech", "", "Hero"]);
  });
});
