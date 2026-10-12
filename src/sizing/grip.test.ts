import { describe, expect, it } from "vitest";
import type { CompartmentSpec } from "../model/types";
import { hasGrip, needsGrip } from "./grip";
import { bulk, cards, custom, partOf } from "./test-helpers";

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

describe("hasGrip", () => {
  it("accepts a compartment whose smaller side is at least 25 mm", () => {
    expect(hasGrip([base, { ...base, w: 25 }])).toBe(true);
  });

  it("accepts a wall cutout (a finger channel or a flat deck's cutout)", () => {
    expect(
      hasGrip([
        {
          ...base,
          features: [
            { type: "wallCutout", side: "left", at: 15, width: 22, depth: 10, floorNotch: 0 },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("accepts a curved floor", () => {
    expect(hasGrip([{ ...base, features: [{ type: "scoop", side: "front", r: 5 }] }])).toBe(true);
  });

  it("rejects small compartments without a cutout", () => {
    expect(hasGrip([base, { ...base, w: 24.99, d: 80 }])).toBe(false);
    expect(hasGrip([{ ...base, features: [{ type: "cornerRelief", d: 3 }] }])).toBe(false);
    expect(hasGrip([])).toBe(false);
  });
});

describe("needsGrip", () => {
  it("applies rule 8 unless every component has finger cuts and the curved floor off", () => {
    const plainBits = bulk({ groupId: "g", fingerCuts: false, curvedFloor: false });
    const plainDeck = cards({ groupId: "g", fingerCuts: false });
    const plainWell = custom({ groupId: "g", fingerCuts: false });
    expect(needsGrip(partOf([plainBits], "shallow|strip|split1"))).toBe(false);
    expect(needsGrip(partOf([plainDeck, plainWell], "upright-long+custom|strip|split1"))).toBe(
      false,
    );
    expect(needsGrip(partOf([bulk()], "shallow|strip|split1"))).toBe(true);
    expect(needsGrip(partOf([cards()], "upright-long|strip|split1"))).toBe(true);
    expect(
      needsGrip(partOf([plainDeck, custom({ groupId: "g" })], "upright-long+custom|strip|split1")),
    ).toBe(true);
  });
});
