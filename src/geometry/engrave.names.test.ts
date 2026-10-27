// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import type { TraySpec } from "../model/types";
import {
  nameChoices,
  planEngravings,
  planNamed,
  planNamedEngravings,
  planNamedMerged,
  planWellNames,
} from "./engrave";
import { engravedName } from "./engraves";
import { CAP_WORTH_MM } from "./glyphs";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { problemsOf } from "./test-build";
import { GEO, compartment, traySpec } from "./test-specs";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

// A Scythe-like resources tray: four 30 × 30 wells in a row on a 1.6 mm floor.
const resources = (floor = 1.6, h = 24): TraySpec =>
  traySpec({
    key: "res:p0:0",
    w: 130,
    d: 40,
    h,
    floor,
    compartments: [0, 1, 2, 3].map((i) =>
      compartment({ x: 1.6 + i * 31.6, y: 1.6, w: 30, d: 36.8, floorZ: floor }),
    ),
  });
const KINDS = ["Oil", "Metal", "Wood", "Food"];

describe("which version of a name is set (planNamed)", () => {
  // each version fits at the size in the table, or not at all
  const caps = (table: Record<string, number>) => (name: string) =>
    table[name] === undefined ? null : name;
  const pick = (names: string[], table: Record<string, number>) =>
    planNamed(names, caps(table), (name) => table[name] ?? 0)?.name ?? null;

  it("takes the full name at 5 or 6 mm over a shortened one at 8", () => {
    expect(
      pick(["Faction miniatures", "Faction min", "Faction"], {
        "Faction miniatures": 5,
        Faction: 8,
      }),
    ).toBe("Faction miniatures");
    expect(pick(["Full name", "Short"], { "Full name": 6, Short: 8 })).toBe("Full name");
  });

  it("falls to a shorter name when the full one fits only at 4 mm", () => {
    expect(pick(["Full name", "Shorter", "Short"], { "Full name": 4, Shorter: 5, Short: 8 })).toBe(
      "Shorter",
    );
    expect(CAP_WORTH_MM).toBe(5);
  });

  it("keeps the longest name that fits at all when none reaches 5 mm", () => {
    expect(pick(["Full name", "Short"], { "Full name": 4, Short: 4 })).toBe("Full name");
    expect(pick(["Full name", "Short"], { Short: 4 })).toBe("Short");
  });

  it("leaves the name off when no version fits", () => {
    expect(pick(["Full name", "Short"], {})).toBeNull();
  });
});

describe("a long name on a real part", () => {
  const names = ["Structure bonus tiles", "Structure bonus", "Structure", "Struc"];
  // a 110 × 40 tray: wide enough for the full name only at a small size
  const tray = traySpec({
    key: "t:p0:0",
    w: 110,
    d: 40,
    h: 30,
    compartments: [compartment({ x: 1.6, y: 1.6, w: 106.8, d: 36.8 })],
  });

  it("sets the full name at the smaller size instead of the short one at the larger", () => {
    const plan = planTray(tray, GEO);
    const chosen = planNamedEngravings(plan, names);
    expect(chosen).not.toBeNull();
    const cap = (name: string) => {
      const e = planEngravings(plan, name);
      return Math.max(0, ...e.walls.map((w) => w.cap), e.underside?.cap ?? 0, e.inside?.cap ?? 0);
    };
    // the choice is the first version that reaches the size worth printing ...
    const first = names.find((n) => cap(n) >= CAP_WORTH_MM);
    expect(chosen?.name).toBe(first);
    // ... which is longer than the name the geometry used to be given, at a smaller size
    expect(chosen?.name.length).toBeGreaterThan(10);
    expect(cap(chosen?.name ?? "")).toBeLessThan(cap("Struc"));
  });

  it("is what the packing guide reports, and what the build engraves", () => {
    const named = { ...tray, partName: "Struc", partNames: names };
    expect(nameChoices(named)).toEqual(names);
    expect(engravedName(named, GEO, names)).toBe(
      planNamedEngravings(planTray(tray, GEO), names)?.name,
    );
    expect(problemsOf(m, named, GEO)).toEqual([]);
  });

  it("is left off a part with no room for any version", () => {
    const tiny = traySpec({ key: "x:p0:0", w: 4, d: 4, h: 30, compartments: [] });
    expect(engravedName(tiny, GEO, names)).toBe("");
  });
});

describe("a kind's name in each well", () => {
  it("is engraved on the floor of every well that has room, at the largest size it takes", () => {
    const plan = planTray(resources(), GEO);
    const wells = planWellNames(plan, KINDS);
    expect(wells.map((w) => w.text)).toEqual(KINDS);
    for (const [i, w] of wells.entries()) {
      const c = plan.compartments[i]?.rect as { x0: number; x1: number; y0: number; y1: number };
      // inside its own well, clear of its walls
      expect(w.box.x0).toBeGreaterThan(c.x0);
      expect(w.box.x1).toBeLessThan(c.x1);
      expect(w.box.y0).toBeGreaterThan(c.y0);
      expect(w.box.y1).toBeLessThan(c.y1);
      expect(w.floorZ).toBe(1.6);
      expect(w.depth).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("skips a well whose name fits at no size, and a well with no kind", () => {
    const plan = planTray(resources(), GEO);
    const wells = planWellNames(plan, ["Oil", "", "Wooden storage boxes", "Food"]);
    expect(wells.map((w) => w.text)).toEqual(["Oil", "Food"]);
  });

  it("takes the part's own name off the floors and puts it on the walls and underside", () => {
    const plan = planTray(resources(1.2), GEO);
    const e = planEngravings(plan, "Resources", KINDS);
    expect(e.inside).toBeNull();
    expect(e.wells).toHaveLength(4);
    expect(e.walls.length).toBeGreaterThan(0);
    // none of the floors' names lies over the underside's
    for (const w of e.wells) {
      const u = e.underside?.box;
      if (u !== undefined) {
        expect(w.box.x0 < u.x1 && w.box.x1 > u.x0 && w.box.y0 < u.y1 && w.box.y1 > u.y0).toBe(
          false,
        );
      }
    }
    // a tray without kinds is as before: its own name on a floor
    expect(planEngravings(plan, "Resources").inside).not.toBeNull();
  });

  it("is engraved even when the part's own name fits nowhere", () => {
    const plan = planTray(resources(), GEO);
    const chosen = planNamedEngravings(plan, ["Resources of the whole world and more"], KINDS);
    expect(chosen?.name).toBe("");
    expect(chosen?.engravings.wells).toHaveLength(4);
  });

  it("builds a closed printable part: no overhang, a whole manifold", () => {
    for (const floor of [1.2, 1.6, 2.4]) {
      const spec = { ...resources(floor), partName: "Resources", wellNames: KINDS };
      expect(problemsOf(m, spec, GEO)).toEqual([]);
    }
  });

  it("is left plain on a part built upside down and on a merged part", () => {
    const plan = planTray(resources(), GEO);
    expect(planWellNames(plan, KINDS, true)).toEqual([]);
    expect(planNamedMerged).toBeTypeOf("function");
  });
});
