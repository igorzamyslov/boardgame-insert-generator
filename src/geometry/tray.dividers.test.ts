// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { splitDividers } from "../layout/dividers";
import type { CompartmentSpec, FeatureSpec, TraySpec } from "../model/types";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { TraySpecError } from "./errors";
import { problemsOf } from "./test-build";
import { GEO, compartment, traySpec } from "./test-specs";
import { buildTray } from "./tray";

// A divided well: slots in its floor that a divider stands in (FeatureSpec "dividerSlot").
let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

const slot = (at: number, over: Partial<Extract<FeatureSpec, { type: "dividerSlot" }>> = {}) =>
  ({ type: "dividerSlot", axis: "y", at, width: 3.4, depth: 2, ...over }) as const;

// A 100 × 60 × 40 tray with one well 96.8 × 56.8, its floor 4 mm thick, and the given slots.
const divided = (features: FeatureSpec[], over: Partial<CompartmentSpec> = {}): TraySpec =>
  traySpec({
    key: "d:p0:0",
    w: 100,
    d: 60,
    h: 40,
    compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8, floorZ: 4, features, ...over })],
  });

const twoSlots = [slot(34), slot(67)];

describe("planTray and divider slots", () => {
  it("plans each slot across the whole well, from the bottom of the slot to the floor", () => {
    const plan = planTray(divided(twoSlots), GEO);
    const slots = plan.compartments[0]?.slots ?? [];
    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({ x0: 32.3, x1: 35.7, y0: 1.6, y1: 58.4, bottomZ: 2 });
  });

  it("plans a slot along x across the width of the well", () => {
    const plan = planTray(divided([slot(30, { axis: "x" })]), GEO);
    const box = plan.compartments[0]?.slots[0];
    expect(box?.x0).toBeCloseTo(1.6, 9);
    expect(box?.x1).toBeCloseTo(98.4, 9);
    expect(box?.y0).toBeCloseTo(28.3, 9);
    expect(box?.y1).toBeCloseTo(31.7, 9);
  });

  it.each([
    ["outside the well", [slot(0.5)]],
    ["past the far wall", [slot(99)]],
    ["overlapping another", [slot(34), slot(35)]],
    ["with no width", [slot(34, { width: 0 })]],
    ["with no depth", [slot(34, { depth: 0 })]],
    ["with no position", [slot(Number.NaN)]],
    ["along an unknown axis", [{ ...slot(34), axis: "z" } as unknown as FeatureSpec]],
    ["so deep it cuts through the floor", [slot(34, { depth: 3.5 })]],
  ])("refuses a slot %s", (_what, features) => {
    expect(() => planTray(divided(features), GEO)).toThrow(TraySpecError);
  });

  it("keeps the floor under the slot over the bottom chamfer where the slot is by an outer face", () => {
    // 1 mm chamfer, a slot reaching the 1.6 mm wall: the floor must clear MIN_FEATURE_MM above it
    const spec = divided([slot(34, { depth: 3.1 })], { floorZ: 4 });
    expect(() => planTray(spec, { ...GEO, bottomChamfer: 1 })).not.toThrow();
    expect(() => planTray(divided([slot(34, { depth: 3.3 })]), GEO)).toThrow(/floor under it/);
  });
});

describe("buildTray cuts the slots", () => {
  it("builds a closed, printable solid of the tray's size, with and without slots", () => {
    expect(problemsOf(m, divided(twoSlots), GEO)).toEqual([]);
    expect(problemsOf(m, divided([slot(30, { axis: "x" }), slot(50, { axis: "x" })]), GEO)).toEqual(
      [],
    );
    expect(problemsOf(m, divided([]), GEO)).toEqual([]);
  });

  it("takes exactly the slots' volume out of the floor", () => {
    const plain = buildTray(m, divided([]), GEO).volumeMm3;
    const cut = buildTray(m, divided(twoSlots), GEO).volumeMm3;
    // two slots 3.4 wide, 2 deep, across the 56.8 mm well
    expect(plain - cut).toBeCloseTo(2 * 3.4 * 56.8 * 2, 1);
  });

  it("builds a divided tray at the thinnest and the largest chamfer too", () => {
    for (const bottomChamfer of [0, 0.4, 1]) {
      expect(problemsOf(m, divided(twoSlots), { ...GEO, bottomChamfer })).toEqual([]);
    }
  });
});

describe("a divider, as printed", () => {
  const tray = divided(twoSlots);
  const plates = splitDividers([tray]).slice(1);

  it("is a solid plate that fits its slot and stands from the bottom of the slot", () => {
    expect(plates).toHaveLength(2);
    const [first] = plates;
    expect(first).toMatchObject({ part: "divider", solid: true, w: 3, d: 56.4, z: 2 });
    // from the bottom of the slot to 5 mm under the rim: 2 + (40 - 4) - 5
    expect(first?.h).toBe(33);
    for (const plate of plates) {
      expect(problemsOf(m, plate, GEO)).toEqual([]);
    }
  });

  it("is built as a level 0 part whatever level its tray is on", () => {
    const upper = splitDividers([{ ...tray, level: 2 }])[1] as TraySpec;
    expect(upper.level).toBe(2);
    expect(problemsOf(m, upper, GEO)).toEqual([]);
  });
});
