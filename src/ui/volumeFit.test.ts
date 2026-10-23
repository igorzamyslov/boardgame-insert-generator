// src/ui/volumeFit.test.ts
import { describe, expect, it } from "vitest";
import { OVER_RATIO, TIGHT_RATIO, volumeNote } from "./volumeFit";
import type { VolumeBudget } from "../layout/volume";

const L = 1_000_000;
const item = (label: string, litres: number) => ({
  key: label,
  componentIds: [label],
  label,
  mm3: litres * L,
});
const budget = (need: number, box: number, items = [item("Faction ×7", 2.3)]): VolumeBudget => ({
  needMm3: need * L,
  boxMm3: box * L,
  items,
});

describe("volumeNote", () => {
  it("states the figures plainly, in litres to one decimal", () => {
    const n = volumeNote(budget(5.9, 6.8), true);
    expect(n.line).toBe(
      "Your items need at least 5.9 L as trays. The box has 6.8 L under the headroom.",
    );
  });

  it("drops 'under the headroom' when the box has none", () => {
    expect(volumeNote(budget(5.9, 6.8), false).line).toBe(
      "Your items need at least 5.9 L as trays. The box has 6.8 L.",
    );
  });

  it("calls it hopeless above the box's volume", () => {
    const n = volumeNote(budget(7.2, 6.8), true);
    expect(n.verdict).toBe("over");
    expect(n.judgement).toBe("This can't fit: take something out or reserve less space on top.");
    expect(volumeNote(budget(7.2, 6.8), false).judgement).toBe(
      "This can't fit: take something out.",
    );
  });

  it("calls it very tight between the thresholds and says nothing below", () => {
    expect(volumeNote(budget(TIGHT_RATIO * 10 + 0.1, 10), true).judgement).toBe(
      "Very tight: expect to change settings.",
    );
    expect(volumeNote(budget(TIGHT_RATIO * 10 + 0.1, 10), true).verdict).toBe("tight");
    const roomy = volumeNote(budget(TIGHT_RATIO * 10 - 0.1, 10), true);
    expect(roomy.verdict).toBe("roomy");
    expect(roomy.judgement).toBeNull();
    expect(OVER_RATIO).toBe(1);
  });

  it("names the three biggest items when it is over or tight, and none when roomy", () => {
    const items = [
      item("Faction ×7", 2.3),
      item("Decks", 1.5),
      item("Tiles", 1.1),
      item("Dice", 0.2),
    ];
    expect(volumeNote(budget(5.1, 5, items), true).biggest).toEqual([
      "Faction ×7 takes 2.3 L",
      "Decks takes 1.5 L",
      "Tiles takes 1.1 L",
    ]);
    expect(volumeNote(budget(2, 5, items), true).biggest).toEqual([]);
  });

  it("says which single item, left out, would bring it under the box", () => {
    const items = [item("Faction ×7", 2.3), item("Decks", 1.5), item("Dice", 0.2)];
    // 4.0 needed, box 3.0: leaving out Faction brings it to 1.7; Decks alone only to 2.5 (also enough)
    const n = volumeNote(budget(4, 3, items), true);
    expect(n.leaveOut).toBe("Leaving out Decks would bring it under the box's 3.0 L.");
    // nothing alone is enough
    expect(volumeNote(budget(9, 3, items), true).leaveOut).toBeNull();
    // not when it is not over
    expect(volumeNote(budget(2.9, 3, items), true).leaveOut).toBeNull();
  });

  it("has no note for an empty plan", () => {
    expect(volumeNote(budget(0, 6.8, []), true).verdict).toBe("roomy");
  });
});
