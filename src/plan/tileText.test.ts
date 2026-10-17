import { describe, expect, it } from "vitest";
import { DESKTOP_PILL, PHONE_PILL, pillName } from "./tileText";

const tile = (w: number, h: number) => ({ w, h });

describe("pillName", () => {
  it("keeps a name that fits the tile whole", () => {
    expect(pillName("Region deck", tile(190, 380), DESKTOP_PILL)).toBe("Region deck");
  });

  it("cuts a name that is too wide with an ellipsis", () => {
    const shown = pillName("A very long component name", tile(110, 200), DESKTOP_PILL) ?? "";
    expect(shown.endsWith("…")).toBe(true);
    expect(shown.length).toBeLessThan("A very long component name".length);
  });

  it("cuts a 40-character name on a wide tile too", () => {
    const name = "The one hundred and twenty miniatures ok";
    expect(name).toHaveLength(40);
    const shown = pillName(name, tile(190, 190), DESKTOP_PILL) ?? "";
    expect(shown.endsWith("…")).toBe(true);
    expect(shown.length).toBeLessThan(40);
  });

  it("leaves the name out when not even four characters fit, or the tile is too short", () => {
    expect(pillName("Dice", tile(40, 200), DESKTOP_PILL)).toBeNull();
    expect(pillName("Dice", tile(190, 20), DESKTOP_PILL)).toBeNull();
    expect(pillName("", tile(190, 190), DESKTOP_PILL)).toBeNull();
  });

  it("makes room for the kind icon: the same tile cuts earlier with it", () => {
    const plain = pillName("Resource tokens", tile(150, 150), DESKTOP_PILL) ?? "";
    const withIcon = pillName("Resource tokens", tile(150, 150), DESKTOP_PILL, true) ?? "";
    expect(withIcon.length).toBeLessThanOrEqual(plain.length);
    expect(withIcon.endsWith("…")).toBe(true);
  });

  it("uses the phone's smaller type", () => {
    const desktop = pillName("Starter decks", tile(100, 100), DESKTOP_PILL) ?? "";
    const phone = pillName("Starter decks", tile(100, 100), PHONE_PILL) ?? "";
    expect(phone.length).toBeGreaterThanOrEqual(desktop.length);
  });

  it("never splits an emoji or a letter with its accent when cutting", () => {
    const text = pillName("😀😀😀😀😀😀😀😀😀😀😀😀", tile(100, 100), DESKTOP_PILL) ?? "";
    expect(text.endsWith("…")).toBe(true);
    expect(Array.from(text.slice(0, -1)).every((c) => c === "😀")).toBe(true);
    // "é" written as e + combining acute stays whole: every accent follows its letter
    const accented = pillName("Café ".repeat(5), tile(100, 100), DESKTOP_PILL) ?? "";
    expect(accented.replace("…", "")).not.toMatch(/(^|[^e])́/u);
  });
});
