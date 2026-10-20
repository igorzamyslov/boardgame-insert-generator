import { describe, expect, it } from "vitest";
import type { CompartmentSpec } from "../model/types";
import { hasGrip, needsGrip } from "./grip";
import { bulk, cards, custom, partOf, partOfGroup } from "./test-helpers";

const base: CompartmentSpec = {
  x: 0,
  y: 0,
  w: 20,
  d: 30,
  floorZ: 1.2,
  kind: "well",
  contents: "x",
  features: [],
};

/** A tray just deep enough that a scoop in a floor-level compartment is still in reach. */
const SHALLOW_TRAY = 20;

describe("hasGrip", () => {
  it("accepts a compartment whose smaller side is at least 25 mm", () => {
    expect(hasGrip([base, { ...base, w: 25 }], SHALLOW_TRAY)).toBe(true);
  });

  it("accepts a wall cutout (a finger channel or a flat deck's cutout)", () => {
    expect(
      hasGrip(
        [
          {
            ...base,
            features: [
              { type: "wallCutout", side: "left", at: 15, width: 22, depth: 10, floorNotch: 0 },
            ],
          },
        ],
        // Deep enough that a scoop would be out of reach: a cutout still grips.
        120,
      ),
    ).toBe(true);
  });

  it("accepts a curved floor you can reach", () => {
    const scoop = { type: "scoop" as const, side: "front" as const, r: 5 };
    const bin = { ...base, kind: "scoop" as const, features: [scoop] };
    expect(hasGrip([bin], SHALLOW_TRAY)).toBe(true);
    // A bin is sized by the generator, so it has to stay within reach: 36.2 mm of well (floor
    // 1.2) is the limit, and past it the ramp sits at the bottom of a pit and grips nothing.
    expect(hasGrip([bin], 36.2)).toBe(true);
    expect(hasGrip([bin], 36.3)).toBe(false);
    // A well or pocket is as deep as its contents make it, so its ramp is the best grip going.
    expect(hasGrip([{ ...base, features: [scoop] }], 120)).toBe(true);
  });

  it("rejects small compartments without a cutout", () => {
    expect(hasGrip([base, { ...base, w: 24.99, d: 80 }], SHALLOW_TRAY)).toBe(false);
    expect(hasGrip([{ ...base, features: [{ type: "cornerRelief", d: 3 }] }], SHALLOW_TRAY)).toBe(
      false,
    );
    expect(hasGrip([], SHALLOW_TRAY)).toBe(false);
  });
});

describe("needsGrip", () => {
  it("applies rule 8 unless every component has finger cuts and the curved floor off", () => {
    const plainBits = bulk({ fingerCuts: false, curvedFloor: false });
    const plainDeck = cards({ fingerCuts: false });
    const plainWell = custom({ fingerCuts: false });
    expect(needsGrip(partOf([plainBits], "shallow|strip|split1"))).toBe(false);
    expect(needsGrip(partOfGroup([plainDeck, plainWell], "upright-long+custom|strip|split1"))).toBe(
      false,
    );
    expect(needsGrip(partOf([bulk()], "shallow|strip|split1"))).toBe(true);
    expect(needsGrip(partOf([cards()], "upright-long|strip|split1"))).toBe(true);
    expect(needsGrip(partOfGroup([plainDeck, custom()], "upright-long+custom|strip|split1"))).toBe(
      true,
    );
  });
});
