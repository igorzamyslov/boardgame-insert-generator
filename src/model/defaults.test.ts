import { describe, expect, it } from "vitest";
import {
  COMPONENT_DEFAULTS,
  DEFAULT_BOX,
  DEFAULT_PRINTER,
  cornerReliefsOn,
  curvedFloorOn,
  fingerCutsOn,
  groupOf,
  newComponent,
  newProject,
  binGrowthOf,
  growthAxesOf,
  growthOf,
  separatorsOf,
  withGrowth,
  withSeparators,
} from "./defaults";
import { BAMBU_256_BED, STANDARD_CARD } from "./presets";
import { DEFAULT_SETTINGS } from "./settings";
import type {
  CardsComponent,
  Component,
  ComponentKind,
  MinisComponent,
  TilesComponent,
} from "./types";
import { APP_VERSION, SCHEMA_VERSION } from "./version";

const KINDS: ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];

describe("newProject", () => {
  it("freezes the shared DEFAULT_BOX and DEFAULT_PRINTER", () => {
    expect(Object.isFrozen(DEFAULT_BOX)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PRINTER)).toBe(true);
  });

  it("starts empty at the current versions with default settings and printer", () => {
    const p = newProject();
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.createdWith).toBe(APP_VERSION);
    expect(p.id).toMatch(/^[0-9a-z]{8}$/);
    expect(p.components).toEqual([]);
    expect(p.locks).toEqual([]);
    expect(p.layout).toBeUndefined();
    expect(p.settings).toEqual(DEFAULT_SETTINGS);
    expect(p.printer).toEqual({ bedX: 256, bedY: 256, bedZ: 256, bedMargin: 5, layerHeight: 0.2 });
    expect(p.box.headroom).toBe(0);
  });

  it("never shares nested objects with DEFAULT_SETTINGS", () => {
    const p = newProject();
    expect(p.settings.lip).not.toBe(DEFAULT_SETTINGS.lip);
    expect(p.settings.fingerPocket).not.toBe(DEFAULT_SETTINGS.fingerPocket);
  });

  it("lets a project change nested settings without touching DEFAULT_SETTINGS", () => {
    const p = newProject();
    expect(() => {
      p.settings.lip.height = 3;
      p.settings.fingerPocket.width = 30;
    }).not.toThrow();
    expect(p.settings.lip.height).toBe(3);
    expect(p.settings.fingerPocket.width).toBe(30);
    expect(DEFAULT_SETTINGS.lip.height).toBe(2);
    expect(DEFAULT_SETTINGS.fingerPocket.width).toBe(25);
  });

  it("lets a project change its box and printer without touching the defaults", () => {
    const p = newProject();
    expect(() => {
      p.box.innerHeight = 90;
      p.printer.bedZ = 180;
    }).not.toThrow();
    expect(p.box.innerHeight).toBe(90);
    expect(p.printer.bedZ).toBe(180);
    expect(DEFAULT_BOX.innerHeight).toBe(70);
    expect(DEFAULT_PRINTER.bedZ).toBe(256);
  });

  it("uses the Bambu 256 bed preset for the default printer", () => {
    expect(DEFAULT_PRINTER).toMatchObject({
      bedX: BAMBU_256_BED.bedX,
      bedY: BAMBU_256_BED.bedY,
      bedZ: BAMBU_256_BED.bedZ,
    });
  });

  it("gives every project a new id", () => {
    expect(newProject().id).not.toBe(newProject().id);
  });
});

describe("groupOf", () => {
  it("is the group id, with an empty one meaning no group", () => {
    const c = newComponent("custom");
    expect(groupOf(c)).toBeUndefined();
    expect(groupOf({ ...c, groupId: "" })).toBeUndefined();
    expect(groupOf({ ...c, groupId: "g1" })).toBe("g1");
  });
});

describe("finger cuts, curved floor and corner relief defaults", () => {
  const piled: Component = { ...newComponent("minis"), storage: "bulk" } as Component;
  it.each<[string, Component, [boolean, boolean, boolean]]>([
    ["cards", newComponent("cards"), [true, false, false]],
    ["bulk", newComponent("bulk"), [false, true, false]],
    ["tiles", newComponent("tiles"), [true, false, true]],
    ["minis pockets", newComponent("minis"), [true, false, false]],
    ["minis as bulk", piled, [false, true, false]],
    ["custom", newComponent("custom"), [true, false, true]],
  ])("%s: finger cuts, curved floor and corner reliefs as before the toggles", (_n, c, on) => {
    expect([fingerCutsOn(c), curvedFloorOn(c), cornerReliefsOn(c)]).toEqual(on);
  });

  it("takes a set toggle over the default, but never a curved floor on cards or tiles", () => {
    const set = { fingerCuts: false, curvedFloor: true, cornerReliefs: true };
    const flip = (kind: ComponentKind): boolean[] => {
      const c = { ...newComponent(kind), ...set };
      return [fingerCutsOn(c), curvedFloorOn(c), cornerReliefsOn(c)];
    };
    expect(KINDS.map(flip)).toEqual([
      [false, false, true],
      [false, true, true],
      [false, false, true],
      [false, true, true],
      [false, true, true],
    ]);
  });
});

describe("growth defaults (minimal-trays spec §5)", () => {
  const upright = (kind: "cards" | "tiles"): Component =>
    kind === "cards"
      ? { ...(newComponent("cards") as CardsComponent), storage: "upright-long" }
      : { ...(newComponent("tiles") as TilesComponent), storage: "upright" };
  const flat = (kind: "cards" | "tiles"): Component =>
    kind === "cards"
      ? { ...(newComponent("cards") as CardsComponent), storage: "flat" }
      : { ...(newComponent("tiles") as TilesComponent), storage: "flat" };
  const modes = (c: Component, lying = false) =>
    (["w", "d", "h", "stack"] as const).map((axis) => growthOf(c, axis, lying));

  it("is auto on all three axes for bulk", () => {
    expect(modes(newComponent("bulk"))).toEqual(["auto", "auto", "auto", "off"]);
  });

  it("is auto on all three for minis stored as bulk, and off for minis in pockets", () => {
    const loose: Component = { ...(newComponent("minis") as MinisComponent), storage: "bulk" };
    expect(modes(loose)).toEqual(["auto", "auto", "auto", "off"]);
    expect(modes(newComponent("minis"))).toEqual(["off", "off", "off", "off"]);
  });

  it("is auto along the stack of an upright deck or stack of tiles", () => {
    expect(modes(upright("cards"))).toEqual(["off", "off", "off", "auto"]);
    expect(modes(upright("tiles"))).toEqual(["off", "off", "off", "auto"]);
  });

  it("is off for the height of a flat deck or stack of tiles: a riser takes the spare height", () => {
    expect(modes(flat("cards"), true)).toEqual(["off", "off", "off", "off"]);
    expect(modes(flat("tiles"), true)).toEqual(["off", "off", "off", "off"]);
  });

  it("is off for a custom well", () => {
    expect(modes(newComponent("custom"))).toEqual(["off", "off", "off", "off"]);
  });

  it("takes a set value over the default, on a flat deck too", () => {
    const c: Component = { ...flat("cards"), growth: { stack: 12 } };
    expect(growthOf(c, "stack", true)).toBe(12);
    expect(growthOf({ ...newComponent("bulk"), growth: { d: "max", h: "off" } }, "d")).toBe("max");
    expect(growthOf({ ...newComponent("bulk"), growth: { d: "max", h: "off" } }, "h")).toBe("off");
    expect(growthOf({ ...newComponent("custom"), growth: { w: "auto" } }, "w")).toBe("auto");
  });

  it("offers only the axes where more room holds more or loosens a fit", () => {
    expect(growthAxesOf(newComponent("bulk"))).toEqual(["w", "d", "h"]);
    expect(growthAxesOf(newComponent("custom"))).toEqual(["w", "d", "h"]);
    // a card well's width and length (cards slide), a tile's footprint: only the stack
    expect(growthAxesOf(newComponent("cards"))).toEqual(["stack"]);
    expect(growthAxesOf(newComponent("tiles"))).toEqual(["stack"]);
    // a pocket's depth (a figure's height is fixed): width and length only
    expect(growthAxesOf(newComponent("minis"))).toEqual(["w", "d"]);
    expect(growthAxesOf({ ...(newComponent("minis") as MinisComponent), storage: "bulk" })).toEqual(
      ["w", "d", "h"],
    );
  });

  it("is always off on an axis a kind does not offer, whatever a file says", () => {
    const c: Component = { ...newComponent("cards"), growth: { w: "max", d: 40, h: "auto" } };
    expect(modes(c)).toEqual(["off", "off", "off", "auto"]);
    const pockets: Component = { ...newComponent("minis"), growth: { h: "max", w: 3 } };
    expect(modes(pockets)).toEqual([3, "off", "off", "off"]);
  });

  it("gives a bin fallback bulk's auto unless the component set the axis", () => {
    const tiles = newComponent("tiles");
    expect(binGrowthOf(tiles, "w")).toBe("auto");
    expect(binGrowthOf({ ...newComponent("custom"), growth: { h: "off" } }, "h")).toBe("off");
  });

  it("sets and clears an axis, dropping an emptied growth", () => {
    const c = newComponent("bulk");
    const set = withGrowth(c, "w", 5);
    expect(set.growth).toEqual({ w: 5 });
    expect(withGrowth(set, "d", "off").growth).toEqual({ w: 5, d: "off" });
    expect("growth" in withGrowth(set, "w", undefined)).toBe(false);
    expect(withGrowth(c, "w", undefined)).toEqual(c);
  });
});

describe("separators", () => {
  it.each(KINDS)("is no spacer at all for a new %s component", (kind) => {
    expect(separatorsOf(newComponent(kind))).toBe(0);
  });

  it("takes a set value over the default", () => {
    expect(separatorsOf({ ...newComponent("cards"), separators: 4 })).toBe(4);
  });

  it("stores nothing for 0, keeps 1 (one block) as asked, and removes a stored count", () => {
    const c = newComponent("cards");
    expect(withSeparators(c, 3).separators).toBe(3);
    expect(withSeparators(c, 1).separators).toBe(1);
    expect("separators" in withSeparators(withSeparators(c, 3), 0)).toBe(false);
    expect(withSeparators(c, 0)).toEqual(c);
  });
});

describe("newComponent", () => {
  it.each(["cards", "bulk", "minis"] as const)(
    "seeds the inner line of a %s component with a blank name",
    (kind) => {
      const c = newComponent(kind);
      const line =
        c.kind === "cards"
          ? c.decks
          : c.kind === "bulk"
            ? c.items
            : c.kind === "minis"
              ? c.figures
              : [];
      expect(line.map((l) => l.name)).toEqual([""]);
    },
  );

  it.each(KINDS)("creates a %s component with access 'sometimes'", (kind) => {
    const c = newComponent(kind);
    expect(c.kind).toBe(kind);
    expect(c.access).toBe("sometimes");
    expect(c.id).toMatch(/^[0-9a-z]{8}$/);
    expect(c.groupId).toBeUndefined();
    expect(c.perPlayer).toBeUndefined();
  });

  it("uses storage 'auto' for cards and tiles and 'pockets' for minis", () => {
    const cards = newComponent("cards");
    const tiles = newComponent("tiles");
    const minis = newComponent("minis");
    expect(cards.kind === "cards" && cards.storage).toBe("auto");
    expect(tiles.kind === "tiles" && tiles.storage).toBe("auto");
    expect(minis.kind === "minis" && minis.storage).toBe("pockets");
  });

  it("takes access, storage, sleeve and thickness from COMPONENT_DEFAULTS", () => {
    const d = COMPONENT_DEFAULTS;
    expect(d).toEqual({
      access: "sometimes",
      cards: { sleeve: "none", thickness: { mode: "preset" }, storage: "auto" },
      tiles: { storage: "auto", hexOrientation: "flat" },
      minis: { storage: "pockets" },
    });
    expect(Object.isFrozen(d.cards.thickness)).toBe(true);
    const cards = newComponent("cards");
    expect(cards).toMatchObject({ access: d.access, ...d.cards });
    expect(cards.kind === "cards" && cards.thickness).not.toBe(d.cards.thickness);
    expect(newComponent("tiles")).toMatchObject({ storage: d.tiles.storage });
    expect(newComponent("minis")).toMatchObject({ storage: d.minis.storage });
  });

  it("defaults cards to Standard size, unsleeved, preset thickness", () => {
    const c = newComponent("cards");
    expect(c).toMatchObject({
      shortSide: STANDARD_CARD.shortSide,
      longSide: STANDARD_CARD.longSide,
      sleeve: "none",
      thickness: { mode: "preset" },
    });
  });
});
