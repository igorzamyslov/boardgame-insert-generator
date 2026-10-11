import { describe, expect, it } from "vitest";
import { newComponent, newProject } from "./defaults";
import { DEFAULT_SETTINGS } from "./settings";
import type { ComponentKind } from "./types";
import { APP_VERSION, SCHEMA_VERSION } from "./version";

const KINDS: ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];

describe("newProject", () => {
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
    expect(DEFAULT_SETTINGS.fingerPocket.width).toBe(22);
  });

  it("gives every project a new id", () => {
    expect(newProject().id).not.toBe(newProject().id);
  });
});

describe("newComponent", () => {
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

  it("defaults cards to Standard size, unsleeved, preset thickness", () => {
    const c = newComponent("cards");
    expect(c).toMatchObject({
      shortSide: 63.5,
      longSide: 88,
      sleeve: "none",
      thickness: { mode: "preset" },
    });
  });
});
