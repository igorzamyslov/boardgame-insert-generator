import { describe, expect, it } from "vitest";
import { newComponent } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type {
  BulkComponent,
  CardsComponent,
  Component,
  Group,
  Settings,
  TilesComponent,
} from "../model/types";
import { cardOptions, stackWidth } from "./cards";
import { bulkOptions } from "./bulk";
import { customOptions } from "./custom";
import { minisOptions } from "./minis";
import { size } from "./group";
import { tileOptions } from "./tiles";
import { fromU, ceilU } from "./units";
import type { CompartmentReq } from "./types";

// Owner, 2026-10-23: a tray never grows on its own. An item's "Room for more" is none (the
// default), some (part of its planned size) or as much as fits (what the layout leaves its well).

const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...o });

const deck = (o: Partial<CardsComponent> = {}): CardsComponent => ({
  ...(newComponent("cards") as CardsComponent),
  storage: "upright-long",
  decks: [{ name: "", count: 50 }],
  ...o,
});
const tiles = (o: Partial<TilesComponent> = {}): TilesComponent => ({
  ...(newComponent("tiles") as TilesComponent),
  storage: "upright",
  count: 20,
  thickness: 2,
  ...o,
});
const bin = (o: Partial<BulkComponent> = {}): BulkComponent => ({
  ...(newComponent("bulk") as BulkComponent),
  ...o,
});

const first = (r: { options: { blocks: CompartmentReq[][] }[] }): CompartmentReq => {
  const c = r.options[0]?.blocks[0]?.[0];
  if (!c) {
    throw new Error("no compartment");
  }
  return c;
};

const stack = (n: number, s = DEFAULT_SETTINGS): number => {
  const c = deck();
  // per-card thickness of the preset: the card plus the sleeve's, as cardDims has it
  return fromU(ceilU(stackWidth(n, s.cardThickness + 0 * c.decks.length, s)));
};

describe("cards: room for more cards", () => {
  it("none: the well is the deck's own width and nothing about it may grow", () => {
    const req = first(cardOptions(deck(), settings(), 0));
    expect(req.minW).toBe(stack(50));
    expect(req.elastic).toEqual({ w: false, d: false, h: false });
    expect(req.growth).toBeUndefined();
    expect(req.spacerAxis).toBeUndefined();
  });

  it("some: the well holds that many more cards, planned in, and nothing grows after", () => {
    const req = first(cardOptions(deck({ room: 20 }), settings(), 0));
    expect(req.minW).toBe(stack(70));
    expect(req.elastic).toEqual({ w: false, d: false, h: false });
    expect(req.growth).toBeUndefined();
  });

  it("some: every deck of the item gets that many more", () => {
    const c = deck({
      room: 10,
      decks: [
        { name: "a", count: 10 },
        { name: "b", count: 40 },
      ],
    });
    const widths = cardOptions(c, settings(), 0).options[0]?.blocks.map((b) => b[0]?.minW);
    expect(widths).toEqual([stack(20), stack(50)]);
  });

  it("as much as fits: the well may take room along the stack, held by retention", () => {
    const req = first(cardOptions(deck({ room: "max" }), settings(), 0));
    expect(req.minW).toBe(stack(50));
    expect(req.elastic.w).toBe(true);
    // unplated, retention holds it to one stack's thickness (and the cut's reach)
    expect(req.growth?.w).toBeGreaterThan(0);
    expect(req.growth?.w).toBeLessThanOrEqual(stack(50));
  });

  it("as much as fits, lying flat: the well may be deeper, with no limit of its own", () => {
    const req = first(cardOptions(deck({ storage: "flat", room: "max" }), settings(), 0));
    expect(req.elastic.h).toBe(true);
    expect(req.growth?.h).toBeUndefined();
    expect(req.elastic.w).toBe(false);
  });

  it("some with spacer plates: the room is a spacer inside the well, as wide as the room", () => {
    const req = first(cardOptions(deck({ room: 20, separators: 3 }), settings(), 0));
    expect(req.spacerAxis).toBe("w");
    expect(req.separators).toBe(3);
    expect(req.spacerRoom).toBeCloseTo(stack(70) - stack(50), 2);
    expect(req.elastic.w).toBe(false);
  });

  it("some with dividers: the well is divided into sections wide enough for the added cards", () => {
    const plain = first(cardOptions(deck({ room: 20, dividers: 0 }), settings(), 0));
    const divided = first(cardOptions(deck({ room: 20, dividers: 2 }), settings(), 0));
    expect(divided.dividers).toBe(2);
    expect(divided.minW).toBeGreaterThan(plain.minW);
  });

  it("fill with bigger wells: an upright deck that asked for nothing may take an auto share, flat none", () => {
    const wells = settings({ biggerWells: true });
    const up = first(cardOptions(deck(), wells, 0));
    expect(up.elastic.w).toBe(true);
    expect(up.growth?.w).toBeGreaterThan(0);
    const flat = first(cardOptions(deck({ storage: "flat" }), wells, 0));
    expect(flat.elastic.h).toBe(false);
  });
});

describe("tiles: room for more tiles", () => {
  it("none: as many as there are; some: that many more, split over the stacks", () => {
    const none = first(tileOptions(tiles(), settings()));
    const some = first(tileOptions(tiles({ room: 10 }), settings()));
    expect(some.minW).toBeCloseTo(none.minW + 10 * 2.1, 2);
    expect(some.elastic.w).toBe(false);
  });

  it("as much as fits: elastic along the stack", () => {
    expect(first(tileOptions(tiles({ room: "max" }), settings())).elastic.w).toBe(true);
    expect(first(tileOptions(tiles({ room: "max", storage: "flat" }), settings())).elastic.h).toBe(
      true,
    );
  });
});

describe("pieces: room for more pieces", () => {
  it("none: elastic on no axis", () => {
    const req = first(bulkOptions(bin(), settings()));
    expect(req.elastic).toEqual({ w: false, d: false, h: false });
  });

  it("some: the bin's volume is that percent more", () => {
    const none = first(bulkOptions(bin(), settings()));
    const some = first(bulkOptions(bin({ room: 25 }), settings()));
    expect(some.minVolume).toBeCloseTo((none.minVolume ?? 0) * 1.25, 3);
    expect(some.elastic).toEqual({ w: false, d: false, h: false });
  });

  it("as much as fits: elastic on every axis, uncapped", () => {
    const req = first(bulkOptions(bin({ room: "max" }), settings()));
    expect(req.elastic).toEqual({ w: true, d: true, h: true });
    expect(req.growth).toBeUndefined();
  });

  it("fill with bigger wells: an auto share on every axis for an item that asked for none", () => {
    const req = first(bulkOptions(bin(), settings({ biggerWells: true })));
    expect(req.elastic).toEqual({ w: true, d: true, h: true });
    expect(req.growth?.w).toBeGreaterThan(0);
  });
});

describe("minis and custom items: no row", () => {
  const minis = newComponent("minis") as Component;
  const custom = newComponent("custom") as Component;
  it("never grow by themselves", () => {
    expect(first(minisOptions({ ...minis, room: "max" } as never, settings())).elastic).toEqual({
      w: false,
      d: false,
      h: false,
    });
    expect(first(customOptions({ ...custom, room: "max" } as never, settings())).elastic).toEqual({
      w: false,
      d: false,
      h: false,
    });
  });
});

describe("a member of a group that asks for as much as fits", () => {
  it("takes only its tray's own leftover room: it fills, and the layout sees no growth", () => {
    const a = deck({ id: "a", room: "max" });
    const b = bin({ id: "b" });
    const group: Group = { id: "g", name: "G", access: "often", memberIds: ["a", "b"] };
    const { requirements } = size([a, b], settings(), [group]);
    const comps = requirements[0]?.variants[0]?.parts.flatMap((p) => p.compartments) ?? [];
    const member = comps.find((c) => c.componentId === "a");
    expect(member?.elastic).toEqual({ w: false, d: false, h: false });
    expect(member?.fill?.w).toBe(true);
    expect(comps.find((c) => c.componentId === "b")?.fill).toBeUndefined();
  });
});
