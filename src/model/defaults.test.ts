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
  stretchOn,
  togglesOf,
} from "./defaults";
import { BAMBU_256_BED, STANDARD_CARD } from "./presets";
import { DEFAULT_SETTINGS } from "./settings";
import type { Component, ComponentKind } from "./types";
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

describe("stretch", () => {
  it.each(KINDS)("is off for a new %s component", (kind) => {
    expect(stretchOn(newComponent(kind))).toBe(false);
  });

  it("takes a set value over the default", () => {
    expect(stretchOn({ ...newComponent("cards"), stretch: true })).toBe(true);
    expect(togglesOf({ ...newComponent("tiles"), stretch: true }).stretch).toBe(true);
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
