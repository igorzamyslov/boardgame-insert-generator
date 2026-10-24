import { describe, expect, it } from "vitest";
import { withJoint } from "../model/lip";
import type { Joint } from "../model/types";
import { createRun, optimize } from "./optimize";
import { checkHardRules } from "./test-hard-rules";
import { fixtureInput, type FixtureName } from "./test-fixtures";
import type { LayoutInput } from "./types";

// Auto (settings.lip.joint "auto"): both joints are probed, the better is searched in full.

const autoOf = (name: FixtureName): LayoutInput => {
  const input = fixtureInput(name);
  return { ...input, settings: withJoint(input.settings, "auto") };
};
const as = (input: LayoutInput, joint: Joint): LayoutInput => ({
  ...input,
  settings: withJoint(input.settings, joint),
});

describe("an Auto run", () => {
  it("is the plan its joint alone would make, and says which joint that is", () => {
    for (const name of ["tiles-minis", "small-tiles"] as const) {
      const input = autoOf(name);
      const auto = optimize(input, 3, 4000);
      const joint = auto.layout?.joint;
      expect(joint === "rim" || joint === "step", name).toBe(true);
      const alone = optimize(as(input, joint ?? "rim"), 3, 4000);
      expect(auto.layout?.trays, name).toEqual(alone.layout?.trays);
      expect(auto.layout?.iterations, name).toBe(alone.layout?.iterations);
    }
  });

  it("is deterministic for a seed", () => {
    const input = autoOf("small-tiles");
    expect(optimize(input, 5, 3000)).toEqual(optimize(input, 5, 3000));
  });

  it("puts no joint in a layout planned with a joint of its own", () => {
    for (const joint of ["off", "rim", "step"] as const) {
      const r = optimize(as(autoOf("small-tiles"), joint), 1, 2000);
      expect(r.layout, joint).not.toBeNull();
      expect(r.layout?.joint, joint).toBeUndefined();
    }
  });

  it("satisfies the hard rules with the joint it chose", () => {
    for (const name of ["cards-heavy", "bits-heavy", "tiles-minis"] as const) {
      const input = autoOf(name);
      const r = optimize(input, 2, 4000);
      if (r.layout) {
        expect(checkHardRules(input, r.layout, r.notices, r.lockConflicts), name).toEqual([]);
      }
    }
  });

  it("fits when either joint fits, trying the other in full when the better probe finds nothing", () => {
    // a box that only the stepped base's thin walls fit: tiny-box does not fit either way, so the
    // run ends with both searched and reports the closer attempt, with its joint
    const r = optimize(autoOf("tiny-box"), 1, 2000);
    expect(r.layout).toBeNull();
    expect(["rim", "step"]).toContain(r.bestAttempt?.joint);
  });

  it("goes on with the joint of a plan it is asked to improve, as one search", () => {
    const input = autoOf("small-tiles");
    const first = optimize(input, 1, 3000);
    const joint = first.layout?.joint;
    expect(joint).toBeDefined();
    const run = createRun(input, 1, 3000, { warmStart: first.layout ?? undefined });
    expect(run.total).toBe(3000);
    while (!run.step()) {
      // runs to the end
    }
    expect(run.result().layout?.joint).toBe(joint);
  });

  it("reports progress that never goes backwards, and its total only shrinks", () => {
    const run = createRun(autoOf("small-tiles"), 1, 4000);
    let done = 0;
    let total = Number.POSITIVE_INFINITY;
    for (;;) {
      const finished = run.step();
      expect(run.done).toBeGreaterThanOrEqual(done);
      expect(run.total).toBeLessThanOrEqual(total);
      expect(run.done).toBeLessThanOrEqual(run.total);
      done = run.done;
      total = run.total;
      if (finished) {
        break;
      }
    }
  });
});
