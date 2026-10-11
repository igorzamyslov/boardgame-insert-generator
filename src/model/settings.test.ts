import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  applyFitChoice,
  applyWallChoice,
  effective,
  fitChoiceOf,
  topPlane,
  wallChoiceOf,
} from "./settings";
import type { Box } from "./types";

describe("DEFAULT_SETTINGS", () => {
  it("matches the spec §5 table", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      wall: 1.6,
      floor: 1.2,
      divider: 1.2,
      fit: 1,
      cardClearance: 1.5,
      cardStackClearance: 1,
      cardStackClearancePct: 0.03,
      cardThickness: 0.32,
      pieceClearance: 1,
      boxClearance: 0.5,
      trayGap: 0.2,
      bottomChamfer: 0.4,
      cornerRadius: 3,
      scoopRadius: 12,
      fingerPocket: { width: 22, reach: 12 },
      lip: { enabled: true, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 },
      topPressFit: 0,
      packingFactor: 0.5,
      leftover: "spare",
    });
  });
});

describe("simple-mode choices", () => {
  it("maps wall thin/normal/sturdy to 1.2/1.6/2.0", () => {
    expect(applyWallChoice(DEFAULT_SETTINGS, "thin").wall).toBe(1.2);
    expect(applyWallChoice(DEFAULT_SETTINGS, "normal").wall).toBe(1.6);
    expect(applyWallChoice(DEFAULT_SETTINGS, "sturdy").wall).toBe(2);
  });

  it("maps fit tight/normal/loose to 0.7/1/1.4", () => {
    expect(applyFitChoice(DEFAULT_SETTINGS, "tight").fit).toBe(0.7);
    expect(applyFitChoice(DEFAULT_SETTINGS, "normal").fit).toBe(1);
    expect(applyFitChoice(DEFAULT_SETTINGS, "loose").fit).toBe(1.4);
  });

  it("does not mutate its input", () => {
    const before = structuredClone(DEFAULT_SETTINGS);
    applyWallChoice(DEFAULT_SETTINGS, "sturdy");
    applyFitChoice(DEFAULT_SETTINGS, "loose");
    expect(DEFAULT_SETTINGS).toEqual(before);
  });

  it("reads the choice back, or custom", () => {
    expect(wallChoiceOf(DEFAULT_SETTINGS)).toBe("normal");
    expect(fitChoiceOf(applyFitChoice(DEFAULT_SETTINGS, "tight"))).toBe("tight");
    expect(wallChoiceOf({ ...DEFAULT_SETTINGS, wall: 1.8 })).toBe("custom");
    expect(fitChoiceOf({ ...DEFAULT_SETTINGS, fit: 1.2 })).toBe("custom");
  });
});

describe("effective", () => {
  it("is the base value at fit 1", () => {
    expect(effective(DEFAULT_SETTINGS)).toEqual({
      cardClearance: 1.5,
      cardStackClearance: 1,
      pieceClearance: 1,
      boxClearance: 0.5,
      trayGap: 0.2,
      lipPlay: 0.25,
    });
  });

  it("scales every ×Fit clearance without float noise", () => {
    expect(effective(applyFitChoice(DEFAULT_SETTINGS, "tight"))).toEqual({
      cardClearance: 1.05,
      cardStackClearance: 0.7,
      pieceClearance: 0.7,
      boxClearance: 0.35,
      trayGap: 0.14,
      lipPlay: 0.175,
    });
  });
});

describe("topPlane", () => {
  const box: Box = {
    innerWidth: 290,
    innerDepth: 290,
    innerHeight: 70,
    headroom: 8,
    headroomCoverage: "full",
    storedOnSide: false,
  };

  it("is innerHeight − headroom + topPressFit", () => {
    expect(topPlane(box, DEFAULT_SETTINGS)).toBe(62);
    expect(topPlane(box, { ...DEFAULT_SETTINGS, topPressFit: 0.3 })).toBe(62.3);
    expect(topPlane({ ...box, headroom: 0 }, { ...DEFAULT_SETTINGS, topPressFit: -2 })).toBe(68);
  });
});
