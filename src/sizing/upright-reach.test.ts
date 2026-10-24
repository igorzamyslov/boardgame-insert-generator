import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, MIN_CUT_MM, MIN_FINGER_CUT_MM, POST_MM } from "../model/settings";
import type { Settings, TileShape } from "../model/types";
import { minOuter, realizeTray } from "./realize";
import { assertTrayInvariants, at, partOf, tiles } from "./test-helpers";
import { tileOptions } from "./tiles";

const s: Settings = DEFAULT_SETTINGS;
const ground = { lipped: false, level: 0 } as const;
const CLEARANCE = DEFAULT_SETTINGS.pieceClearance;
const ids = (shape: TileShape, over = {}, settings: Settings = s) =>
  tileOptions(tiles({ shape, thickness: 2, count: 40, ...over }), settings).options.map(
    (o) => o.id,
  );

describe("upright tiles a finger can reach", () => {
  it("takes a fingertip as 15 mm, wider than the 10 mm of any other cut", () => {
    expect(MIN_FINGER_CUT_MM).toBe(15);
    expect(MIN_CUT_MM).toBe(10);
  });

  it("stores a 15 mm square chit flat: its slot leaves a 10 mm cut between the posts", () => {
    const options = ids({ type: "rect", w: 15, d: 15 }, { storage: "auto" });
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((id) => id.startsWith("flat-"))).toBe(true);
  });

  it("stores a hex marker too small for a fingertip flat", () => {
    const options = ids(
      { type: "hex", flatToFlat: 13.7, orientation: "flat" },
      { storage: "auto" },
    );
    expect(options.some((id) => id.startsWith("upright-"))).toBe(false);
  });

  it("still offers upright where the slot leaves a cut of 15 mm", () => {
    // 20 mm long + clearance, less a post at each end, is exactly the fingertip's width.
    const edge = MIN_FINGER_CUT_MM + 2 * POST_MM - CLEARANCE;
    expect(ids({ type: "rect", w: edge, d: edge }, { storage: "auto" })).toContain("upright-c1");
    expect(ids({ type: "rect", w: edge - 0.5, d: edge - 0.5 }, { storage: "auto" })).not.toContain(
      "upright-c1",
    );
    // A 30 × 15 chit stands on its 30 mm edge: 25 mm of cut.
    expect(ids({ type: "rect", w: 30, d: 15 }, { storage: "auto" })).toContain("upright-c1");
  });

  it("honours an explicit upright with a warning that it is hard to reach", () => {
    const small = tiles({
      shape: { type: "rect", w: 15, d: 15 },
      thickness: 2,
      count: 40,
      storage: "upright",
    });
    const { options, notices } = tileOptions(small, s, 3);
    expect(options.every((o) => o.id.startsWith("upright-"))).toBe(true);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      level: "warning",
      code: "sizing.uprightHardToReach",
      path: "/components/3",
    });
    expect(notices[0]?.message).toContain("Hexes");
    expect(notices[0]?.message).toContain("15 mm");
  });

  it("says nothing when the slot is wide enough, the storage is flat, or finger cuts are off", () => {
    const wide = { type: "rect", w: 30, d: 15 } as const;
    const narrow = { type: "rect", w: 15, d: 15 } as const;
    for (const c of [
      tiles({ shape: wide, storage: "upright" }),
      tiles({ shape: narrow, storage: "flat" }),
      tiles({ shape: narrow, storage: "upright", fingerCuts: false }),
    ]) {
      expect(tileOptions(c, s).notices).toEqual([]);
    }
    expect(ids(narrow, { storage: "auto", fingerCuts: false })).toContain("upright-c1");
  });

  it("asks no more than the width setting gives", () => {
    const narrowCut: Settings = {
      ...s,
      fingerPocket: { ...s.fingerPocket, width: MIN_CUT_MM },
    };
    expect(ids({ type: "rect", w: 15, d: 15 }, { storage: "auto" }, narrowCut)).toContain(
      "upright-c1",
    );
  });

  it("builds the cut an upright stack gets at the smallest slot it is offered", () => {
    const edge = MIN_FINGER_CUT_MM + 2 * POST_MM - CLEARANCE;
    const component = tiles({
      shape: { type: "rect", w: edge, d: edge },
      thickness: 2,
      count: 40,
      storage: "upright",
    });
    const part = partOf([component], "upright-c1|strip|split1");
    const outer = minOuter(part, s, ground);
    const realized = realizeTray(part, outer, s, ground);
    // assertTrayInvariants has planTray accept the tray, with the posts and depths as sizing placed.
    assertTrayInvariants(realized, outer, s, ground, part);
    const cuts = at(realized.compartments, 0).features.filter((f) => f.type === "wallCutout");
    expect(cuts.length).toBeGreaterThan(0);
    for (const cut of cuts) {
      expect(cut.width).toBeGreaterThanOrEqual(MIN_FINGER_CUT_MM - 1e-9);
    }
  });
});
