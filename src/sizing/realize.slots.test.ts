import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { minOuter } from "./outer";
import { realizeTray } from "./realize";
import * as slots from "./slots";
import { assertTrayInvariants, at, cards, partOf } from "./test-helpers";
import type { RealizeOptions } from "./types";

// realizeTray's answer to a run of finger slots that cannot keep min(MIN_SLOT_WIDTH, setting):
// drop the slots of compartments that are a grip by themselves, else refuse the tray.
vi.mock("./slots", async (importOriginal) => {
  const original = await importOriginal<typeof slots>();
  return { ...original, placeSlots: vi.fn(original.placeSlots) };
});

const ground: RealizeOptions = { lipped: false, level: 0 };
const s = DEFAULT_SETTINGS;
const decks = (counts: number[]) =>
  partOf(
    [
      cards({
        sleeve: "none",
        decks: counts.map((count, i) => ({ name: `D${i}`, count })),
      }),
    ],
    "upright-long|strip|split1",
  );

describe("realizeTray when finger slots do not fit", () => {
  it("drops the slots of a compartment that is a grip without them", () => {
    // The first placement reports every slot stuck; then the real one runs.
    vi.mocked(slots.placeSlots).mockImplementationOnce((requests) => ({
      stuck: requests.map((_, i) => i),
    }));
    const part = decks([60, 120]);
    const outer = minOuter(part, s, ground);
    const r = realizeTray(part, outer, s, ground);
    expect(vi.mocked(slots.placeSlots)).toHaveBeenCalledTimes(2);
    // "D1 ×120" (40.56 × 116.5 mm) is a grip: it loses its pockets, and its reach bands become
    // part of its well. "D0 ×60" (20.78 mm wide) keeps them.
    const [small, big] = [at(r.compartments, 0), at(r.compartments, 1)];
    expect(small.features.map((f) => f.type)).toEqual(["fingerPocket", "fingerPocket"]);
    expect(big.features).toEqual([]);
    expect(big.w).toBeGreaterThanOrEqual(25);
    assertTrayInvariants(r, outer, s, ground);
  });

  it("refuses the tray when no compartment of the run is a grip by itself", () => {
    // A one-card deck against the wall: a slot of at least 15 mm would cross its own well face
    // too far from the slot's centre (roadmap §4.6), and the deck is no grip.
    const part = decks([1, 120]);
    expect(() => realizeTray(part, minOuter(part, s, ground), s, ground)).toThrow(
      /Tray c1:p0:0: cannot fit a finger slot of at least 15 mm for D0 ×1/,
    );
  });
});
