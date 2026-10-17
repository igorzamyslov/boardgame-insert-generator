import { describe, expect, it } from "vitest";
import { DESKTOP_PILL, PHONE_PILL, hasPillRoom } from "./tileText";

const tile = (w: number, h: number) => ({ w, h });

describe("hasPillRoom", () => {
  it("is there for a tile with room for a line and a few characters", () => {
    expect(hasPillRoom("Region deck", tile(190, 380), DESKTOP_PILL)).toBe(true);
    // a long name does not need its whole width: the pill's CSS cuts it
    expect(
      hasPillRoom("The very long name of a card deck here 40", tile(110, 200), DESKTOP_PILL),
    ).toBe(true);
  });

  it("is not there when not even four characters fit, or the tile is too short", () => {
    expect(hasPillRoom("Dice", tile(40, 200), DESKTOP_PILL)).toBe(false);
    expect(hasPillRoom("Dice", tile(190, 20), DESKTOP_PILL)).toBe(false);
    expect(hasPillRoom("", tile(190, 190), DESKTOP_PILL)).toBe(false);
  });

  it("asks less of a name shorter than four characters", () => {
    expect(hasPillRoom("A", tile(70, 100), DESKTOP_PILL)).toBe(true);
  });

  it("makes room for the kind icon: a tile just wide enough without it is not with it", () => {
    expect(hasPillRoom("Resource tokens", tile(78, 150), DESKTOP_PILL)).toBe(true);
    expect(hasPillRoom("Resource tokens", tile(78, 150), DESKTOP_PILL, true)).toBe(false);
  });

  it("uses the phone's smaller type and padding", () => {
    expect(hasPillRoom("Starter decks", tile(50, 100), DESKTOP_PILL)).toBe(false);
    expect(hasPillRoom("Starter decks", tile(50, 100), PHONE_PILL)).toBe(true);
  });

  it("counts a letter with its accent, or an emoji, as one character", () => {
    expect(hasPillRoom("\u0065\u0301\u0065\u0301", tile(70, 100), DESKTOP_PILL)).toBe(true);
  });
});
