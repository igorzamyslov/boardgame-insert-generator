// src/ui/settingsGroups.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { SETTING_RANGES } from "../model/validate";
import { EXACT_GROUPS, groupOfPath } from "./settingsGroups";
import { changedCount } from "./settingsFields";

describe("EXACT_GROUPS", () => {
  it("names the board's groups, in its order, and adds Spacers and space last", () => {
    expect(EXACT_GROUPS.map((g) => g.title)).toEqual([
      "Walls and floors",
      "Room around trays and pieces",
      "Cards",
      "Finger cuts",
      "Rim between layers",
      "Shape and printing",
      "Spacers and space",
    ]);
  });

  it("holds every exact number once, and nothing else", () => {
    const placed = EXACT_GROUPS.flatMap((g) => g.paths);
    expect([...placed].sort()).toEqual(SETTING_RANGES.map((r) => r.path).sort());
  });

  it("gives the board's counts: Cards 4, Finger cuts 4, Rim between layers 5", () => {
    const count = (title: string): number | undefined =>
      EXACT_GROUPS.find((g) => g.title === title)?.paths.length;
    expect(count("Walls and floors")).toBe(3);
    expect(count("Cards")).toBe(4);
    expect(count("Finger cuts")).toBe(4);
    expect(count("Rim between layers")).toBe(5);
  });

  it("puts Unused space and One thick wall under Spacers and space, beside the wall absorption", () => {
    const g = EXACT_GROUPS.find((x) => x.title === "Spacers and space");
    expect(g?.extras).toEqual(["leftover", "oneWall"]);
    expect(g?.paths).toEqual(["wallAbsorb"]);
  });

  it("finds the group of an error's path", () => {
    expect(groupOfPath("/settings/lip/play")?.title).toBe("Rim between layers");
    expect(groupOfPath("/settings/bottomChamfer")?.title).toBe("Shape and printing");
    expect(groupOfPath("/settings/nothing")).toBeUndefined();
    expect(groupOfPath("/box/innerWidth")).toBeUndefined();
  });
});

describe("changedCount", () => {
  it("counts every value that differs from its default, wherever it is drawn", () => {
    expect(changedCount(DEFAULT_SETTINGS)).toBe(0);
    expect(changedCount({ ...DEFAULT_SETTINGS, wall: 2, trayGap: 0.4 })).toBe(2);
    expect(
      changedCount({
        ...DEFAULT_SETTINGS,
        lip: { ...DEFAULT_SETTINGS.lip, enabled: true, play: 0.4 },
        leftover: "solid",
        engraveNames: false,
      }),
    ).toBe(4);
  });
});
