// src/layout/thicker-walls.test.ts
// "When I set 3 I get weird results with positioning of the tray: the tray group is split with
// another tray, one of the trays in the group is turned 90 degrees and I cannot turn it" (owner,
// 2026-11-01, Star Realms, Starter deck trays with Thicker walls). Wall growth made a tray stacked
// the other way round cost nothing, because the walls it was allowed counted as room for contents
// and as free ground for the swell a stack forces on a tray: the plan kept the Counter tray between
// the Starter trays, one of them turned, all of them grown to one square footprint (so Turn said
// "This tray is square"). Thicker walls are now room for no contents: the swell is charged, and a
// stack stands one way.
import { describe, expect, it } from "vitest";
import owner from "../../test/fixtures/star-realms-wall-growth.json";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import type { Project, TraySpec } from "../model/types";
import { size } from "../sizing";
import type { LayoutInput } from "./types";
import { optimize } from "./optimize";
import { checkHardRules } from "./test-hard-rules";

function load(): Project {
  const parsed = parseProject(structuredClone(owner));
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

function inputOf(p: Project): LayoutInput {
  return {
    requirements: size(p.components, p.settings, p.groups).requirements,
    box: p.box,
    printer: p.printer,
    settings: p.settings,
    locks: p.locks,
    inputsHash: inputsHash(p),
    appVersion: "0.0.0-test",
  };
}

const STARTER = "70kgton0";

/** The trays of each stack, bottom to top. */
function stacks(trays: readonly TraySpec[]): TraySpec[][] {
  const by = new Map<string, TraySpec[]>();
  for (const t of trays) {
    if (t.part === "tray") {
      by.set(`${t.x},${t.y}`, [...(by.get(`${t.x},${t.y}`) ?? []), t]);
    }
  }
  return [...by.values()].map((s) => s.sort((a, b) => (a.z ?? 0) - (b.z ?? 0)));
}

function expectOneWay(p: Project, trays: readonly TraySpec[], why: string): void {
  const all = stacks(trays);
  // every stack stands one way: its trays share a turn
  for (const s of all) {
    expect(new Set(s.map((t) => t.rotated)).size, `${why}: a stack is turned both ways`).toBe(1);
  }
  // the group's trays stand together, with no other tray between them
  const home = all.filter((s) => s.some((t) => t.key.startsWith(`${STARTER}:`)));
  expect(home, `${why}: the Starter trays are split over stacks`).toHaveLength(1);
  const levels = (home[0] ?? []).map((t) => t.key.startsWith(`${STARTER}:`));
  const first = levels.indexOf(true);
  const last = levels.lastIndexOf(true);
  expect(levels.slice(first, last + 1).every(Boolean), `${why}: another tray stands between`).toBe(
    true,
  );
  // and no tray is square only because the stack made it so: Turn must be possible
  for (const t of trays.filter((x) => x.part === "tray" && x.key.startsWith(`${STARTER}:`))) {
    expect(Math.abs(t.w - t.d), `${why}: ${t.key} is square`).toBeGreaterThan(0.05);
  }
  expect(p.settings.thickerWalls).toBe(true);
}

describe(
  "Thicker walls (the owner's Star Realms project, wall growth 3 mm)",
  { timeout: 180_000 },
  () => {
    it("opens as Thicker walls, with the wall thickness gone", () => {
      const p = load();
      expect(p.settings.thickerWalls).toBe(true);
      expect("wallAbsorb" in p.settings).toBe(false);
    });

    it("keeps the Starter trays in one stack, one way round, with no spacer, from scratch", () => {
      const p = load();
      for (const seed of [1, 2, 3, 4]) {
        const input = inputOf(p);
        const result = optimize(input, seed, 100_000);
        expect(result.layout, `seed ${seed}`).not.toBeNull();
        const layout = result.layout;
        if (!layout) {
          continue;
        }
        expect(checkHardRules(input, layout, result.notices), `seed ${seed}`).toEqual([]);
        expectOneWay(p, layout.trays, `seed ${seed}`);
        expect(
          layout.trays.filter((t) => t.part === "leftover"),
          `seed ${seed}: no separate spacer`,
        ).toEqual([]);
      }
    });

    it("does the same when the plan is the one the owner had, searched on from it as the app does", () => {
      const p = load();
      const input = inputOf(p);
      // the stored plan is the one planned with wall growth 1 mm: a Counter tray between the Starter
      // trays and one of them turned; "Make a new plan" searches on from it, 50 000 steps
      expect(p.layout).toBeDefined();
      for (const seed of [1, 2, 3]) {
        const result = optimize(input, seed, 50_000, { warmStart: p.layout });
        expect(result.layout, `seed ${seed}`).not.toBeNull();
        if (result.layout) {
          expectOneWay(p, result.layout.trays, `warm seed ${seed}`);
        }
      }
    });
  },
);
