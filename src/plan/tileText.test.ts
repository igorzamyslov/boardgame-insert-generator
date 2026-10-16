import { describe, expect, it } from "vitest";
import { layoutTileText, sizeText } from "./tileText";

const rect = (w: number, h: number) => ({ x: 10, y: 20, w, h });

describe("layoutTileText", () => {
  it("centres the name pill on the tile and puts the size under it", () => {
    const t = layoutTileText(rect(80, 60), "Region deck", sizeText(80, 60));
    expect(t.name?.text).toBe("Region deck");
    expect(t.pill).not.toBeNull();
    const pill = t.pill as NonNullable<typeof t.pill>;
    expect(pill.x + pill.w / 2).toBeCloseTo(50);
    expect(pill.w).toBeLessThanOrEqual(80);
    expect(t.size?.text).toBe("80 × 60");
    expect((t.size?.y ?? 0) > pill.y + pill.h).toBe(true);
  });

  it("cuts a name that is too wide with an ellipsis", () => {
    const t = layoutTileText(rect(40, 60), "A very long component name", "40 × 60");
    expect(t.name?.text.endsWith("…")).toBe(true);
    expect((t.pill?.w ?? 99) <= 40).toBe(true);
  });

  it("drops the size first, then the name, as the tile gets short", () => {
    const short = layoutTileText(rect(80, 14), "Dice", "80 × 14");
    expect(short.name?.text).toBe("Dice");
    expect(short.size).toBeNull();
    const tiny = layoutTileText(rect(8, 8), "Dice", "8 × 8");
    expect(tiny.name).toBeNull();
    expect(tiny.pill).toBeNull();
  });
});
