import { describe, expect, it } from "vitest";
import { planTray } from "../geometry/plan";
import type { StoredLayout, TraySpec } from "../model/types";
import { optimize } from "./optimize";
import { printableParts } from "./printable";
import { checkHardRules } from "./test-hard-rules";
import { fixtureInput } from "./test-fixtures";
import type { LayoutInput } from "./types";

// Flush stacking (spec §6.1 "Locating lip"): with the lip on, a stack does not narrow as it rises.
// bits-heavy in a box a fraction of its size and three times as tall has to stack its bins.

function squeezed(lipOn: boolean): LayoutInput {
  const input = fixtureInput("bits-heavy");
  return {
    ...input,
    box: {
      ...input.box,
      innerWidth: Math.round(input.box.innerWidth * 0.6),
      innerDepth: Math.round(input.box.innerDepth * 0.6),
      innerHeight: input.box.innerHeight * 3,
    },
    settings: {
      ...input.settings,
      lip: { ...input.settings.lip, joint: lipOn ? ("rim" as const) : ("off" as const) },
    },
  };
}

function stacked(input: LayoutInput): { layout: StoredLayout; notices: LayoutInputNotices } {
  for (let seed = 1; seed <= 6; seed += 1) {
    const r = optimize(input, seed, 20_000);
    if (r.layout?.trays.some((t) => t.level > 0 && t.part === "tray")) {
      return { layout: r.layout, notices: r.notices };
    }
  }
  throw new Error("no seed stacked a tray");
}
type LayoutInputNotices = ReturnType<typeof optimize>["notices"];

describe("a stack with the lip on is as wide at the top as at the bottom", () => {
  const input = squeezed(true);
  const { layout, notices } = stacked(input);
  const byStack = new Map<string, TraySpec[]>();
  for (const t of layout.trays.filter((x) => x.part !== "spacer")) {
    byStack.set(`${t.path}|${t.stack}`, [...(byStack.get(`${t.path}|${t.stack}`) ?? []), t]);
  }

  it("keeps every hard rule", () => {
    expect(checkHardRules(input, layout, notices)).toEqual([]);
  });

  it("stands each upper tray, and the fillers of its level, flush in the footprint below", () => {
    let checked = 0;
    for (const list of byStack.values()) {
      for (const t of list.filter((x) => x.level > 0)) {
        const below = list.find((x) => x.part === "tray" && x.level === t.level - 1);
        expect(below, `${t.key} has a tray under it`).toBeDefined();
        if (!below) {
          continue;
        }
        // inside the tray below, and touching its outer face at one end of each axis: no inset
        expect(t.x).toBeGreaterThanOrEqual(below.x);
        expect(t.y).toBeGreaterThanOrEqual(below.y);
        expect(t.x + t.w).toBeLessThanOrEqual(below.x + below.w + 1e-9);
        expect(t.y + t.d).toBeLessThanOrEqual(below.y + below.d + 1e-9);
        const flushX =
          Math.abs(t.x - below.x) < 1e-9 || Math.abs(t.x + t.w - below.x - below.w) < 1e-9;
        const flushY =
          Math.abs(t.y - below.y) < 1e-9 || Math.abs(t.y + t.d - below.y - below.d) < 1e-9;
        expect(flushX && flushY, `${t.key} is flush with ${below.key}`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("gives every part above level 0, and the tray on a riser with the lip, a groove, and no other", () => {
    const parts = printableParts(layout.trays, {
      components: [],
      settings: input.settings,
      printer: input.printer,
      locks: input.locks,
    }).trays;
    let grooved = 0;
    for (const part of parts) {
      for (const spec of part.merged?.members ?? [part]) {
        const plan = planTray(spec, input.settings);
        const expected =
          (spec.level > 0 || spec.onRiser === true) &&
          spec.part !== "spacer" &&
          spec.part !== "divider";
        expect(plan.groove !== null, `${spec.key} at level ${spec.level}`).toBe(expected);
        grooved += plan.groove === null ? 0 : 1;
      }
    }
    expect(grooved).toBeGreaterThan(0);
  });
});

describe("with the lip off nothing changes", () => {
  it("no part has a groove, and no tray has more wall than its own", () => {
    const input = squeezed(false);
    const { layout } = stacked(input);
    for (const t of layout.trays) {
      expect(planTray(t, input.settings).groove, t.key).toBeNull();
      expect(t.lip).toBe(false);
    }
  });
});
