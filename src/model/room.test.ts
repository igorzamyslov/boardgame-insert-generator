import { describe, expect, it } from "vitest";
import { binGrowthOf, growthOf, newComponent } from "./defaults";
import { roomKindOf, roomOf, roomWords, withRoom } from "./room";
import type { Component } from "./types";

const cards = (extra: Record<string, unknown> = {}): Component =>
  ({ ...newComponent("cards"), ...extra }) as Component;

describe("what kind of room an item offers", () => {
  it("is cards, tiles or pieces, and nothing for minis and custom items", () => {
    expect(roomKindOf(newComponent("cards"))).toBe("cards");
    expect(roomKindOf(newComponent("tiles"))).toBe("tiles");
    expect(roomKindOf(newComponent("bulk"))).toBe("pieces");
    expect(roomKindOf(newComponent("minis"))).toBeNull();
    expect(roomKindOf(newComponent("custom"))).toBeNull();
  });

  it("is worded in the contents' terms", () => {
    expect(roomWords("cards")).toBe("Room for more cards");
    expect(roomWords("tiles")).toBe("Room for more tiles");
    expect(roomWords("pieces")).toBe("Room for more pieces");
  });
});

describe("the room an item is given", () => {
  it("is none until set: a tray never grows on its own", () => {
    expect(roomOf(cards())).toEqual({ mode: "none" });
    expect(roomOf(newComponent("bulk"))).toEqual({ mode: "none" });
  });

  it("is some for a number and as much as fits for max", () => {
    expect(roomOf(cards({ room: 20 }))).toEqual({ mode: "some", amount: 20 });
    expect(roomOf(cards({ room: "max" }))).toEqual({ mode: "max" });
  });

  it("is none for an item with no room row, whatever a file says", () => {
    expect(roomOf({ ...newComponent("minis"), room: "max" } as Component)).toEqual({
      mode: "none",
    });
    expect(roomOf({ ...newComponent("custom"), room: 5 } as Component)).toEqual({ mode: "none" });
  });

  it("is stored only when set: withRoom clears it for undefined", () => {
    const set = withRoom(cards(), 12);
    expect(set.room).toBe(12);
    expect("room" in withRoom(set, undefined)).toBe(false);
    expect(withRoom(cards(), "max").room).toBe("max");
  });
});

describe("growth the engine gives a well (growthOf)", () => {
  it("is off for every item set to none, in both fill settings' absence", () => {
    expect(growthOf(cards(), "stack")).toBe("off");
    expect(growthOf(newComponent("bulk"), "w")).toBe("off");
  });

  it("is max for an item set to as much as fits, on the axes it grows on", () => {
    expect(growthOf(cards({ room: "max" }), "stack")).toBe("max");
    const bulk = { ...newComponent("bulk"), room: "max" } as Component;
    expect(growthOf(bulk, "w")).toBe("max");
    expect(growthOf(bulk, "h")).toBe("max");
  });

  it("is off for some: the room is part of the size, nothing grows after the layout", () => {
    expect(growthOf(cards({ room: 20 }), "stack")).toBe("off");
  });

  it("follows the kind's usual room under bigger wells, for items set to none or some", () => {
    expect(growthOf(cards(), "stack", false, true)).toBe("auto");
    expect(growthOf(cards(), "stack", true, true)).toBe("off");
    expect(growthOf(newComponent("bulk"), "w", false, true)).toBe("auto");
    expect(growthOf(cards({ room: "max" }), "stack", false, true)).toBe("max");
  });

  it("gives a bin in the bulk fallback max only when its item asks for it", () => {
    expect(binGrowthOf(cards(), "w")).toBe("off");
    expect(binGrowthOf(cards({ room: "max" }), "w")).toBe("max");
    expect(binGrowthOf(cards(), "w", true)).toBe("auto");
  });
});
