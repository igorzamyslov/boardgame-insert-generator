import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  FINGER_ROOM_MM,
  FIT_CHOICES,
  WALL_CHOICES,
  applyFingerRoom,
  applyFitChoice,
  applyWallChoice,
  chamferMinimums,
  effective,
  effectiveBottomChamfer,
  fingerRoomOf,
  fitChoiceOf,
  MIN_FEATURE_MM,
  cutRidgeWidth,
  maxBottomChamfer,
  maxChannelSpacing,
  maxWellFaceOffset,
  topPlane,
  wallChoiceOf,
} from "./settings";
import type { FitChoice, WallChoice } from "./settings";
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
      fingerPocket: { width: 25, reach: 12, floorNotch: 12.5, wallRoom: 0 },
      lip: { enabled: true, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 },
      topPressFit: 0,
      packingFactor: 0.5,
      leftover: "spare",
    });
  });

  it("is deeply frozen, including the nested lip and fingerPocket objects", () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.lip)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.fingerPocket)).toBe(true);
  });

  it("cannot be changed through a derived object's shared nested fields", () => {
    const derived = applyFitChoice(DEFAULT_SETTINGS, "tight");
    expect(() => {
      derived.lip.play = 9;
    }).toThrow(TypeError);
    expect(() => {
      derived.fingerPocket.width = 9;
    }).toThrow(TypeError);
    expect(DEFAULT_SETTINGS.lip.play).toBe(0.25);
    expect(DEFAULT_SETTINGS.fingerPocket.width).toBe(25);
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

  it.each(Object.keys(WALL_CHOICES) as WallChoice[])("round-trips wall choice %s", (c) => {
    expect(wallChoiceOf(applyWallChoice(DEFAULT_SETTINGS, c))).toBe(c);
  });

  it.each(Object.keys(FIT_CHOICES) as FitChoice[])("round-trips fit choice %s", (c) => {
    expect(fitChoiceOf(applyFitChoice(DEFAULT_SETTINGS, c))).toBe(c);
  });

  it("treats float noise as the same choice, and a real difference as custom", () => {
    expect(wallChoiceOf({ ...DEFAULT_SETTINGS, wall: 1.6 + 1e-12 })).toBe("normal");
    expect(wallChoiceOf({ ...DEFAULT_SETTINGS, wall: 1.6 + 1e-6 })).toBe("custom");
  });

  it("maps the finger room toggle to a 10 mm or no wall room", () => {
    expect(FINGER_ROOM_MM).toBe(10);
    const on = applyFingerRoom(DEFAULT_SETTINGS, true);
    expect(on.fingerPocket).toEqual({ ...DEFAULT_SETTINGS.fingerPocket, wallRoom: 10 });
    expect(applyFingerRoom(on, false).fingerPocket).toEqual(DEFAULT_SETTINGS.fingerPocket);
    expect(DEFAULT_SETTINGS.fingerPocket.wallRoom).toBe(0);
  });

  it("reads the finger room toggle back, or custom", () => {
    expect(fingerRoomOf(DEFAULT_SETTINGS)).toBe(false);
    expect(fingerRoomOf(applyFingerRoom(DEFAULT_SETTINGS, true))).toBe(true);
    const room = (wallRoom: number) => ({
      ...DEFAULT_SETTINGS,
      fingerPocket: { ...DEFAULT_SETTINGS.fingerPocket, wallRoom },
    });
    expect(fingerRoomOf(room(10 + 1e-12))).toBe(true);
    expect(fingerRoomOf(room(4))).toBe("custom");
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

  it("scales to clean values at fit 1.4 (loose)", () => {
    expect(effective(applyFitChoice(DEFAULT_SETTINGS, "loose"))).toEqual({
      cardClearance: 2.1,
      cardStackClearance: 1.4,
      pieceClearance: 1.4,
      boxClearance: 0.7,
      trayGap: 0.28,
      lipPlay: 0.35,
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

  it("rounds away float noise from decimal inputs", () => {
    const decimalBox: Box = { ...box, innerHeight: 70.1, headroom: 8.2 };
    expect(topPlane(decimalBox, { ...DEFAULT_SETTINGS, topPressFit: 0.3 })).toBe(62.2);
  });
});

describe("bottom chamfer rules", () => {
  it("uses bottomChamfer on level 0 and at least 0.5 above, never below 0", () => {
    const s = { ...DEFAULT_SETTINGS, bottomChamfer: 0.4 };
    expect(effectiveBottomChamfer(s, 0)).toBe(0.4);
    expect(effectiveBottomChamfer(s, 1)).toBe(0.5);
    expect(effectiveBottomChamfer({ ...s, bottomChamfer: 0.8 }, 2)).toBe(0.8);
    expect(effectiveBottomChamfer({ ...s, bottomChamfer: -1 }, 0)).toBe(0);
  });

  it("needs 2·(c + 0.8) across and c + 0.8 up", () => {
    const s = { ...DEFAULT_SETTINGS, bottomChamfer: 2.27 };
    expect(chamferMinimums(s, 0).side).toBeCloseTo(6.14, 9);
    expect(chamferMinimums(s, 0).h).toBeCloseTo(3.07, 9);
    expect(chamferMinimums({ ...s, bottomChamfer: 0.2 }, 1).h).toBeCloseTo(1.3, 9);
  });

  it("allows the chamfer the wall, floor and outer corner can take", () => {
    const at = (wall: number, floor: number) =>
      maxBottomChamfer({ ...DEFAULT_SETTINGS, wall, floor });
    // wall + (floor − 0.8 − 0.1)/√2: a sharp well corner keeps 0.8 mm plus the arc margin at the
    // floor (corner material floor − √2·(c − wall)), tighter than wall + floor − 0.8 for the
    // straight faces.
    expect(at(1.6, 1.2)).toBeCloseTo(1.6 + 0.3 / Math.SQRT2, 9);
    expect(at(1.2, 1.2)).toBeCloseTo(1.2 + 0.3 / Math.SQRT2, 9);
    expect(at(3, 3)).toBeCloseTo(3 + 2.1 / Math.SQRT2, 9);
    expect(at(0.9, 0.8)).toBeCloseTo(0.9 - 0.1 / Math.SQRT2, 9);
    // The thinnest valid wall, 0.9 mm: the outer corner limit is the wall itself.
    expect(at(0.9, 3)).toBeCloseTo(0.9, 9);
  });
});

describe("maxChannelSpacing", () => {
  // Width of the ridge two round slot bottoms (radius r, centres spacing apart) leave, MIN_FEATURE_MM
  // below its top.
  function ridge(r: number, spacing: number): number {
    const k = Math.sqrt(r * r - (spacing * spacing) / 4);
    return spacing - 2 * Math.sqrt(r * r - (k + MIN_FEATURE_MM) ** 2);
  }

  it("is 20.06 mm for 22 mm slots", () => {
    expect(maxChannelSpacing(11)).toBeCloseTo(20.06, 2);
  });

  it.each([2.5, 7.5, 11, 25, 50])("leaves a ridge exactly MIN_FEATURE_MM wide for r = %d", (r) => {
    const spacing = maxChannelSpacing(r);
    expect(ridge(r, spacing)).toBeCloseTo(MIN_FEATURE_MM, 9);
    expect(ridge(r, spacing - 0.1)).toBeGreaterThan(MIN_FEATURE_MM);
    expect(ridge(r, spacing + 0.1)).toBeLessThan(MIN_FEATURE_MM);
  });
});

describe("maxWellFaceOffset", () => {
  // Width, MIN_FEATURE_MM below its tip, of the wedge between a well face dx from the centre of a
  // round slot bottom (radius r) and that bottom.
  function wedge(r: number, dx: number): number {
    const k = Math.sqrt(r * r - dx * dx);
    return dx - Math.sqrt(r * r - (k + MIN_FEATURE_MM) ** 2);
  }

  it("is 8.17 mm for 22 mm slots", () => {
    expect(maxWellFaceOffset(11)).toBeCloseTo(8.17, 2);
  });

  it.each([2.5, 7.5, 11, 25, 50])("leaves a wedge exactly MIN_FEATURE_MM wide for r = %d", (r) => {
    const dx = maxWellFaceOffset(r);
    expect(wedge(r, dx)).toBeCloseTo(MIN_FEATURE_MM, 9);
    expect(wedge(r, dx - 0.1)).toBeGreaterThan(MIN_FEATURE_MM);
    expect(wedge(r, dx + 0.1)).toBeLessThan(MIN_FEATURE_MM);
  });
});

describe("cutRidgeWidth", () => {
  // Measures the piece a well face at u = 0 leaves on its solid side (u < 0) under two round
  // bottoms (radius r) centred at dContents (contents side) and −dSolid: its top is the lower
  // envelope of the arcs, and its width is taken MIN_FEATURE_MM below its highest point.
  function sampled(r: number, dContents: number, dSolid: number): number {
    const depth = (u: number): number =>
      Math.max(
        ...[dContents, -dSolid].map((c) =>
          Math.abs(u - c) < r ? Math.sqrt(r * r - (u - c) ** 2) : Number.NEGATIVE_INFINITY,
        ),
      );
    const step = 1e-4;
    let top = Number.POSITIVE_INFINITY; // smallest depth below the arc centres = highest material
    for (let u = 0; u > -dSolid; u -= step) {
      top = Math.min(top, depth(u));
    }
    // The face, or the near bottom if it lies beyond the face, to the far bottom.
    let first = 0;
    while (depth(first) > top + MIN_FEATURE_MM) {
      first -= step;
    }
    let last = first;
    while (depth(last - step) <= top + MIN_FEATURE_MM) {
      last -= step;
    }
    return first - last;
  }

  it.each([
    [11, 9.9, 10.1],
    [11, 9.99, 10.01],
    [11, 9.6, 10.4],
    [11, 5, 12],
    [7.5, 6, 7],
  ])("matches the sampled half ridge for r = %d, %d and %d mm from the centres", (r, dc, ds) => {
    expect(cutRidgeWidth(r, dc, ds)).toBeCloseTo(sampled(r, dc, ds), 3);
  });

  it("is 0.51 mm for 22 mm slots 20 mm apart, the face 0.1 mm from the peak", () => {
    expect(cutRidgeWidth(11, 9.9, 10.1)).toBeCloseTo(0.507, 3);
  });

  it("is unbounded once MIN_FEATURE_MM below the peak lies below the bottoms", () => {
    expect(cutRidgeWidth(11, 1, 2)).toBe(Number.POSITIVE_INFINITY);
  });
});
