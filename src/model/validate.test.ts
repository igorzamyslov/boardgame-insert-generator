import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { newComponent, newProject } from "./defaults";
import type {
  BulkComponent,
  CardsComponent,
  Component,
  ComponentKind,
  CustomComponent,
  MinisComponent,
  Notice,
  Project,
  TilesComponent,
} from "./types";
import { BOUNDS, isBlocking, validateProject } from "./validate";

const KINDS: ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];

function withComponents(...components: Component[]): Project {
  return { ...newProject(), components };
}

function cards(patch: Partial<CardsComponent> = {}): CardsComponent {
  return { ...(newComponent("cards") as CardsComponent), ...patch };
}

/** [code, path] pairs, which is what the UI uses to place a message. */
function codes(notices: Notice[]): [string, string | undefined][] {
  return notices.map((n) => [n.code, n.path]);
}

describe("validateProject", () => {
  it("accepts a new project with no components", () => {
    expect(validateProject(newProject())).toEqual([]);
  });

  it.each(KINDS)("accepts a default %s component", (kind) => {
    expect(validateProject(withComponents(newComponent(kind)))).toEqual([]);
  });

  it("enforces the component limit as blocking", () => {
    const many = Array.from({ length: BOUNDS.maxComponents + 1 }, () => newComponent("custom"));
    const notices = validateProject(withComponents(...many));
    expect(codes(notices)).toEqual([["limit.components", "/components"]]);
    expect(notices.every(isBlocking)).toBe(true);
    expect(validateProject(withComponents(...many.slice(1)))).toEqual([]);
  });

  it("rejects counts below 1 or fractional (field) and above 2000 (blocking)", () => {
    const p = withComponents(
      cards({
        decks: [
          { name: "a", count: 0 },
          { name: "b", count: 2.5 },
          { name: "c", count: 2001 },
          { name: "d", count: 2000 },
        ],
      }),
    );
    const notices = validateProject(p);
    expect(codes(notices)).toEqual([
      ["field.count", "/components/0/decks/0/count"],
      ["field.count", "/components/0/decks/1/count"],
      ["limit.count", "/components/0/decks/2/count"],
    ]);
    expect(notices.map(isBlocking)).toEqual([false, false, true]);
  });

  it("checks count bounds for any integer", () => {
    fc.assert(
      fc.property(fc.integer({ min: -10, max: 5000 }), (count) => {
        const custom: CustomComponent = { ...(newComponent("custom") as CustomComponent), count };
        const found = codes(validateProject(withComponents(custom))).map(([code]) => code);
        if (count < 1) {
          expect(found).toEqual(["field.count"]);
        } else if (count > BOUNDS.maxCount) {
          expect(found).toEqual(["limit.count"]);
        } else {
          expect(found).toEqual([]);
        }
      }),
    );
  });

  it("rejects lengths ≤ 0, NaN (field) and > 1000 mm (blocking)", () => {
    const p = newProject();
    p.box = { ...p.box, innerWidth: 0, innerDepth: Number.NaN, innerHeight: 1000.5 };
    expect(codes(validateProject(p))).toEqual([
      ["field.length", "/box/innerWidth"],
      ["field.length", "/box/innerDepth"],
      ["limit.length", "/box/innerHeight"],
    ]);
  });

  it("checks every length inside every component kind", () => {
    const bulk: BulkComponent = {
      ...(newComponent("bulk") as BulkComponent),
      items: [
        { name: "cube", count: 10, w: 8, d: -1, h: 8 },
        { name: "pile", volumeMl: 0 },
      ],
    };
    const tiles: TilesComponent = {
      ...(newComponent("tiles") as TilesComponent),
      shape: { type: "hex", flatToFlat: 1200, orientation: "flat" },
      thickness: 0,
    };
    const minis: MinisComponent = {
      ...(newComponent("minis") as MinisComponent),
      figures: [{ name: "hero", w: 25, d: 25, h: 0, count: 1 }],
    };
    expect(codes(validateProject(withComponents(bulk, tiles, minis)))).toEqual([
      ["field.length", "/components/0/items/0/d"],
      ["field.volume", "/components/0/items/1/volumeMl"],
      ["limit.length", "/components/1/shape/flatToFlat"],
      ["field.length", "/components/1/thickness"],
      ["field.length", "/components/2/figures/0/h"],
    ]);
  });

  it("requires at least one deck, item and figure", () => {
    const p = withComponents(
      cards({ decks: [] }),
      { ...(newComponent("bulk") as BulkComponent), items: [] },
      { ...(newComponent("minis") as MinisComponent), figures: [] },
    );
    expect(codes(validateProject(p))).toEqual([
      ["field.empty", "/components/0/decks"],
      ["field.empty", "/components/1/items"],
      ["field.empty", "/components/2/figures"],
    ]);
  });

  it("forbids perPlayer inside a group", () => {
    const p = withComponents(cards({ groupId: "g1", perPlayer: { players: 4 } }));
    expect(codes(validateProject(p))).toEqual([
      ["field.perPlayerInGroup", "/components/0/perPlayer"],
    ]);
  });

  it("bounds players to 1…10", () => {
    const p = withComponents(
      cards({ perPlayer: { players: 0 } }),
      cards({ perPlayer: { players: 11 } }),
    );
    expect(codes(validateProject(p))).toEqual([
      ["field.players", "/components/0/perPlayer/players"],
      ["limit.players", "/components/1/perPlayer/players"],
    ]);
  });

  it("warns (does not error) when card sides are entered the wrong way round", () => {
    const notices = validateProject(withComponents(cards({ shortSide: 88, longSide: 63.5 })));
    expect(notices).toEqual([
      expect.objectContaining({
        level: "warning",
        code: "field.cardSides",
        path: "/components/0/shortSide",
      }),
    ]);
  });

  it("checks custom sleeves and measured thickness", () => {
    const p = withComponents(
      cards({
        sleeve: { w: 66.5, h: 0, thickness: -0.1 },
        thickness: { mode: "measured", cards: 0, stackMm: 20 },
      }),
    );
    expect(codes(validateProject(p))).toEqual([
      ["field.length", "/components/0/sleeve/h"],
      ["field.length", "/components/0/sleeve/thickness"],
      ["field.count", "/components/0/thickness/cards"],
    ]);
  });

  it("allows a clearance override of 0 but not below", () => {
    expect(validateProject(withComponents(cards({ clearance: 0 })))).toEqual([]);
    expect(codes(validateProject(withComponents(cards({ clearance: -1 }))))).toEqual([
      ["field.length", "/components/0/clearance"],
    ]);
  });

  it("requires headroom below the box height and a usable bed", () => {
    const p = newProject();
    p.box = { ...p.box, innerHeight: 40, headroom: 40 };
    p.printer = { ...p.printer, bedX: 200, bedY: 200, bedMargin: 100, layerHeight: 0 };
    expect(codes(validateProject(p))).toEqual([
      ["field.headroom", "/box/headroom"],
      ["field.bedMargin", "/printer/bedMargin"],
      ["field.layerHeight", "/printer/layerHeight"],
    ]);
  });

  it("checks settings ranges, including nested ones", () => {
    const p = newProject();
    p.settings = {
      ...p.settings,
      wall: 0.5,
      topPressFit: 1.5,
      lip: { ...p.settings.lip, thickness: 0.4 },
    };
    expect(codes(validateProject(p))).toEqual([
      ["field.setting", "/settings/wall"],
      ["field.setting", "/settings/lip/thickness"],
      ["field.setting", "/settings/topPressFit"],
    ]);
  });

  it("treats duplicate component ids as blocking", () => {
    const a = newComponent("custom");
    const notices = validateProject(withComponents(a, { ...a }));
    expect(codes(notices)).toEqual([["invalid.duplicateId", "/components/1/id"]]);
    expect(notices.every(isBlocking)).toBe(true);
  });

  it("checks lock paths and sizes", () => {
    const p = newProject();
    p.locks = [
      { kind: "position", trayKey: "a:p0:0", path: "01x", rotated: false },
      { kind: "size", trayKey: "a:p0:0", w: 2000, d: 50, h: 30 },
      { kind: "stack", trayKeys: [] },
    ];
    expect(codes(validateProject(p))).toEqual([
      ["field.lockPath", "/locks/0/path"],
      ["limit.length", "/locks/1/w"],
      ["field.lockStack", "/locks/2/trayKeys"],
    ]);
  });
});
