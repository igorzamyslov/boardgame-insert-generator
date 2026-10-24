// src/ui/components/optionNotes.test.ts
import { describe, expect, it } from "vitest";
import { withSeparators } from "../../model/defaults";
import { withRoom } from "../../model/room";
import { newComponent } from "../../model/defaults";
import type { CardsComponent, Component, MinisComponent, TilesComponent } from "../../model/types";
import { OPTION_NOTE_TEXTS, describeOptionChange } from "./optionNotes";

const cards = (): CardsComponent => ({ ...(newComponent("cards") as CardsComponent), id: "c" });

describe("describeOptionChange", () => {
  it("says a deck that grows stands in a wider well", () => {
    const prev = cards();
    expect(describeOptionChange(prev, withRoom(prev, "max"))).toBe(
      "Leaves room to grow. The deck stands in a wider well.",
    );
    expect(describeOptionChange(prev, withRoom(prev, 8))).toBe(
      "Leaves room to grow. The deck stands in a wider well.",
    );
  });

  it("names a stack of tiles, and a bin, for room to grow", () => {
    const tiles = newComponent("tiles") as TilesComponent;
    expect(describeOptionChange(tiles, withRoom(tiles, "max"))).toBe(
      "Leaves room to grow. The tiles stand in a wider well.",
    );
    const bulk = newComponent("bulk");
    expect(describeOptionChange(bulk, withRoom(bulk, 25))).toBe("Leaves room to grow.");
  });

  it("says when room to grow is turned off", () => {
    const prev = withRoom(cards(), 20);
    expect(describeOptionChange(prev, withRoom(prev, undefined))).toBe("No room is kept to grow.");
  });

  it("says nothing when the room only changes amount", () => {
    const a = withRoom(cards(), 5);
    expect(describeOptionChange(a, withRoom(a, 9))).toBeNull();
    expect(describeOptionChange(a, withRoom(a, "max"))).toBeNull();
  });

  it("explains a removable spacer when separators go from 0 to 1", () => {
    expect(describeOptionChange(cards(), withSeparators(cards(), 1))).toBe(
      "A removable spacer fills the gap.",
    );
  });

  it("explains several plates, and no spacer", () => {
    const one = withSeparators(cards(), 1);
    expect(describeOptionChange(one, withSeparators(one, 3))).toBe(
      "The spacer is printed as 3 thin plates.",
    );
    expect(describeOptionChange(one, withSeparators(one, 0))).toBe("No spacer is printed.");
  });

  it("explains dividers", () => {
    expect(
      describeOptionChange(withRoom(cards(), 20), { ...withRoom(cards(), 20), dividers: 2 }),
    ).toBe("2 removable dividers split the well into 3 sections.");
    expect(
      describeOptionChange({ ...withRoom(cards(), 20), dividers: 1 }, withRoom(cards(), 20)),
    ).toBe("No dividers in the well.");
  });

  it("explains how often you reach for it", () => {
    const c: Component = { ...withRoom(cards(), 20), access: "sometimes" };
    expect(describeOptionChange(c, { ...c, access: "often" })).toBe(
      "Kept where it is easy to reach.",
    );
    expect(describeOptionChange({ ...c, access: "often" }, { ...c, access: "setup" })).toBe(
      "May go under other trays.",
    );
    expect(describeOptionChange({ ...c, access: "often" }, c)).toBe("No preference where it goes.");
  });

  it("explains the switches and per-player piles", () => {
    const c: Component = newComponent("bulk");
    expect(describeOptionChange(c, { ...c, fingerCuts: true })).toBe("Finger cuts added.");
    expect(describeOptionChange({ ...c, fingerCuts: true }, { ...c, fingerCuts: false })).toBe(
      "Finger cuts removed.",
    );
    expect(describeOptionChange(c, { ...c, cornerReliefs: true })).toBe("Corner holes added.");
    expect(describeOptionChange(c, { ...c, curvedFloor: false })).toBe("Curved floor removed.");
    // Copies are not an option: the stage's sentence counts the trays, and no note says "players"
    expect(describeOptionChange(c, { ...c, copies: 4 })).toBeNull();
  });

  it("explains how the cards stand", () => {
    const c = cards();
    expect(describeOptionChange(c, { ...c, storage: "flat" })).toBe("The decks lie flat.");
    const minis = newComponent("minis") as MinisComponent;
    expect(describeOptionChange(minis, { ...minis, storage: "bulk" })).toBe(
      "The figures sit loose in a scoop tray.",
    );
  });

  it("says nothing about names, counts or sizes", () => {
    const c = cards();
    expect(describeOptionChange(c, { ...c, name: "Other" })).toBeNull();
    expect(describeOptionChange(c, { ...c, decks: [{ name: "", count: 12 }] })).toBeNull();
    expect(describeOptionChange(c, c)).toBeNull();
  });
});

describe("sleeves", () => {
  const withSleeve = (c: CardsComponent, sleeve: CardsComponent["sleeve"]): CardsComponent => ({
    ...c,
    sleeve,
  });

  it("says which sleeves the deck has now", () => {
    expect(describeOptionChange(cards(), withSleeve(cards(), "standard"))).toBe(
      "Standard sleeves. The tray leaves room for them.",
    );
    expect(
      describeOptionChange(withSleeve(cards(), "standard"), withSleeve(cards(), "premium")),
    ).toBe("Premium sleeves. The tray leaves room for thicker ones.");
    expect(describeOptionChange(withSleeve(cards(), "standard"), cards())).toBe(
      "No sleeves. The tray fits the bare cards.",
    );
  });

  it("says a sleeve of its own once, and nothing while its numbers are typed", () => {
    const own = withSleeve(cards(), { w: 66.5, h: 91, thickness: 0.1 });
    expect(describeOptionChange(cards(), own)).toBe(
      "Your own sleeve size. The tray leaves room for it.",
    );
    expect(
      describeOptionChange(own, withSleeve(cards(), { w: 67, h: 91, thickness: 0.1 })),
    ).toBeNull();
  });

  it("lists every sentence, so the copy test can rule them", () => {
    expect(OPTION_NOTE_TEXTS).toContain("Premium sleeves. The tray leaves room for thicker ones.");
    expect(OPTION_NOTE_TEXTS).toContain("Finger cuts added.");
  });
});
