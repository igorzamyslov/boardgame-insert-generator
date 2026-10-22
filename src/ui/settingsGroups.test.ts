// src/ui/settingsGroups.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, applyFingerRoom } from "../model/settings";
import { SETTING_RANGES } from "../model/validate";
import { EXACT_GROUPS, FIRST_SCREEN_PATHS, groupOfPath } from "./settingsGroups";
import { changedByTab, changedCount } from "./settingsFields";

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

  it("holds every exact number once, and nothing else, but the ones the first screen draws", () => {
    const placed = EXACT_GROUPS.flatMap((g) => g.paths);
    const elsewhere = SETTING_RANGES.map((r) => r.path).filter(
      (path) => !FIRST_SCREEN_PATHS.includes(path),
    );
    expect([...placed].sort()).toEqual(elsewhere.sort());
    // and the first screen's numbers are real ones, in no group
    expect(FIRST_SCREEN_PATHS.every((p) => SETTING_RANGES.some((r) => r.path === p))).toBe(true);
    expect(FIRST_SCREEN_PATHS.some((p) => placed.includes(p))).toBe(false);
  });

  it("gives the board's counts: Cards 4, Finger cuts 4, Rim between layers 5", () => {
    const count = (title: string): number | undefined =>
      EXACT_GROUPS.find((g) => g.title === title)?.paths.length;
    expect(count("Walls and floors")).toBe(3);
    expect(count("Cards")).toBe(4);
    expect(count("Finger cuts")).toBe(4);
    expect(count("Rim between layers")).toBe(5);
  });

  it("puts Unused space and Fill small gaps with under Spacers and space, which draws the wall thickness", () => {
    const g = EXACT_GROUPS.find((x) => x.title === "Spacers and space");
    expect(g?.extras).toEqual(["leftover", "spareRoom"]);
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
        lip: { ...DEFAULT_SETTINGS.lip, enabled: false, play: 0.4 },
        leftover: "solid",
        engraveNames: false,
      }),
    ).toBe(4);
  });
});

describe("changedCount: what the header says is what the sheet shows", () => {
  it("counts Room for fingers once, though the switch writes two numbers", () => {
    const on = applyFingerRoom(DEFAULT_SETTINGS, true);
    expect(on.fingerPocket.wallRoom).not.toBe(DEFAULT_SETTINGS.fingerPocket.wallRoom);
    expect(on.fingerPocket.dividerRoom).not.toBe(DEFAULT_SETTINGS.fingerPocket.dividerRoom);
    expect(changedCount(on)).toBe(1);
    // with another value changed, it is one of two
    expect(changedCount({ ...on, wall: 2 })).toBe(2);
  });

  it("counts the finger room once when only one of its two numbers was set by hand", () => {
    const one = {
      ...DEFAULT_SETTINGS,
      fingerPocket: { ...DEFAULT_SETTINGS.fingerPocket, dividerRoom: 3 },
    };
    expect(changedCount(one)).toBe(1);
    // the other finger numbers (width, notch) are plain numbers, each its own
    expect(
      changedCount({ ...one, fingerPocket: { ...one.fingerPocket, width: 30, floorNotch: 10 } }),
    ).toBe(3);
  });

  it("counts Fill small gaps with once, though it writes two settings", () => {
    expect(changedCount({ ...DEFAULT_SETTINGS, wallAbsorb: 2 })).toBe(1);
    expect(changedCount({ ...DEFAULT_SETTINGS, oneWall: true })).toBe(1);
    expect(changedCount({ ...DEFAULT_SETTINGS, oneWall: true, wallAbsorb: 2 })).toBe(1);
    expect(changedByTab({ ...DEFAULT_SETTINGS, oneWall: true, wallAbsorb: 2 })).toEqual({
      insert: 1,
      printer: 0,
    });
  });

  it("counts every switch once", () => {
    expect(
      changedCount({
        ...DEFAULT_SETTINGS,
        lip: { ...DEFAULT_SETTINGS.lip, enabled: !DEFAULT_SETTINGS.lip.enabled },
        fillToTop: !DEFAULT_SETTINGS.fillToTop,
        oneWall: !DEFAULT_SETTINGS.oneWall,
        engraveNames: !DEFAULT_SETTINGS.engraveNames,
        mergeFillers: !DEFAULT_SETTINGS.mergeFillers,
        mergeRisers: !DEFAULT_SETTINGS.mergeRisers,
      }),
    ).toBe(6);
  });
});

describe("changedByTab", () => {
  it("is nothing for the defaults", () => {
    expect(changedByTab(DEFAULT_SETTINGS)).toEqual({ insert: 0, printer: 0 });
  });

  it("puts the printing options on My printer, the rest (the riser rows too) on This insert", () => {
    expect(
      changedByTab({
        ...DEFAULT_SETTINGS,
        engraveNames: false,
        mergeFillers: false,
        mergeRisers: false,
        minRiser: 10,
      }),
    ).toEqual({ insert: 2, printer: 2 });
    expect(
      changedByTab({
        ...applyFingerRoom(DEFAULT_SETTINGS, true),
        wall: 2,
        fillToTop: false,
        engraveNames: false,
      }),
    ).toEqual({ insert: 3, printer: 1 });
  });

  it("adds up to the count", () => {
    const s = {
      ...applyFingerRoom(DEFAULT_SETTINGS, true),
      leftover: "solid" as const,
      mergeRisers: true,
      infill: 20,
    };
    const by = changedByTab(s);
    expect(by.insert + by.printer).toBe(changedCount(s));
  });
});
