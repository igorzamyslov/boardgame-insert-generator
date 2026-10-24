// src/layout/risers.lip.test.ts
// "Why do risers not follow the rim setting?" (owner, 2026-10-23). The rim between layers is the
// locating lip: a lower tray's rim carries it and the tray on it has a groove under its edge. A
// riser used to be a plain part with no lip, so the tray on it stood loose on a flat top, where a
// tray on a tray locks. With the lip on, a riser now carries the lip too and the bottom tray above
// it has the groove (`onRiser`), as any tray above a lipped one does.
import { describe, expect, it } from "vitest";
import owner5 from "../../test/fixtures/star-realms-owner-5.json";
import { planTray } from "../geometry/plan";
import { outerSizeText } from "../instructions/numbering";
import { inputsHash } from "../model/hash";
import { grooveWall, upperTrayMinH } from "../model/lip";
import { parseProject } from "../model/schema";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Printer, Project, Settings, TraySpec } from "../model/types";
import { size } from "../sizing";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { printableParts } from "./printable";
import { splitRisers, type RiserInputs } from "./risers";
import { TEST_PRINTER, traySpec } from "./test-utils";
import { toU } from "./units";

const LIP = DEFAULT_SETTINGS.lip;
/** The wall of a tray that carries the lip: the thicker of the wall and lip + ledge (2.9 mm). */
const LIPPED_WALL = Math.max(DEFAULT_SETTINGS.wall, LIP.thickness + LIP.ledge);

const base = (extra: Partial<RiserInputs> = {}): RiserInputs => ({
  settings: { ...DEFAULT_SETTINGS },
  printer: { ...TEST_PRINTER },
  locks: [],
  ...extra,
});

/**
 * A two-tray stack as the layout stores it: a lipped lower tray (wall 2.9, wells inset by it)
 * and the tray on it, flush, both padded: the upper one carries 28.8 mm of raised floor.
 */
function stack(
  over: { lower?: Partial<TraySpec>; upper?: Partial<TraySpec>; inset?: number } = {},
) {
  const inset = over.inset ?? LIPPED_WALL;
  const well = (floorZ: number) => ({
    x: inset,
    y: inset,
    w: 100 - 2 * inset,
    d: 60 - 2 * inset,
    floorZ,
    kind: "well" as const,
    contents: "a",
    features: [],
  });
  const lower = traySpec({
    key: "a:p0:0",
    stack: 1,
    level: 0,
    w: 100,
    d: 60,
    h: 12,
    lip: true,
    compartments: [well(1.2)],
    ...over.lower,
  });
  const upper = traySpec({
    key: "b:p0:0",
    stack: 1,
    level: 1,
    z: 12,
    w: 100,
    d: 60,
    h: 50,
    compartments: [well(30)],
    ...over.upper,
  });
  return [lower, upper];
}

describe("splitRisers: the riser follows the lip setting", () => {
  it("carries the lip, and the tray on it has the groove, with the lip on", () => {
    const parts = splitRisers(stack(), base());
    const riser = parts.find((t) => t.part === "riser");
    const bottom = parts.find((t) => t.key === "a:p0:0");
    expect(riser).toMatchObject({ lip: true, level: 0, z: 0, w: 100, d: 60 });
    expect(bottom?.onRiser).toBe(true);
    // only the bottom tray stands on the riser
    expect(parts.find((t) => t.key === "b:p0:0")?.onRiser).toBeUndefined();
  });

  it("keeps the heights: the lip is not part of the riser's height, as it is not a tray's", () => {
    const parts = splitRisers(stack(), base());
    const riser = parts.find((t) => t.part === "riser") as TraySpec;
    const bottom = parts.find((t) => t.key === "a:p0:0") as TraySpec;
    // 28.8 mm padding in the upper tray (50 - 21.2 = 28.8, to a 5 mm minimum: 45 would do)
    expect(toU(riser.h + bottom.h + (parts.find((t) => t.key === "b:p0:0")?.h ?? 0))).toBe(toU(62));
    expect(bottom.z).toBe(riser.h);
  });

  it("has no lip and no groove with the lip off", () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, lip: { ...LIP, enabled: false } };
    const parts = splitRisers(stack(), base({ settings }));
    expect(parts.find((t) => t.part === "riser")?.lip).toBe(false);
    expect(parts.some((t) => t.onRiser)).toBe(false);
  });

  it("is open inside the lipped wall: the pocket starts where a lipped tray's wells do", () => {
    const riser = splitRisers(stack(), base()).find((t) => t.part === "riser") as TraySpec;
    expect(riser.solid).toBe(false);
    expect(riser.compartments).toMatchObject([
      { kind: "spare", x: LIPPED_WALL, y: LIPPED_WALL, w: 100 - 2 * LIPPED_WALL },
    ]);
    expect(() => planTray(riser, DEFAULT_SETTINGS)).not.toThrow();
  });

  it("is built by planTray with its tray, whatever the leftover style", () => {
    for (const leftover of ["spare", "solid"] as const) {
      const settings: Settings = { ...DEFAULT_SETTINGS, leftover };
      for (const part of splitRisers(stack(), base({ settings }))) {
        expect(() => planTray(part, settings), `${leftover} ${part.key}`).not.toThrow();
      }
    }
  });

  it("gives the tray the groove's own wall: its wells are inside what planTray needs", () => {
    expect(LIPPED_WALL).toBeGreaterThanOrEqual(grooveWall(DEFAULT_SETTINGS, 1));
  });

  it("stays plain under a tray alone in its stack: its 1.6 mm wall has no room for a groove", () => {
    const alone = traySpec({
      key: "a:p0:0",
      stack: 1,
      w: 100,
      d: 60,
      h: 60,
      compartments: [
        { x: 1.6, y: 1.6, w: 96.8, d: 56.8, floorZ: 40, kind: "well", contents: "a", features: [] },
      ],
    });
    const parts = splitRisers([alone], base());
    expect(parts.find((t) => t.part === "riser")).toMatchObject({ lip: false, h: 38.8 });
    expect(parts.find((t) => t.key === "a:p0:0")?.onRiser).toBeUndefined();
    for (const part of parts) {
      expect(() => planTray(part, DEFAULT_SETTINGS), part.key).not.toThrow();
    }
  });

  it("stays plain under a bottom tray too low for a groove (what the groove needs, as any upper tray)", () => {
    // a lower tray 3.6 mm high cannot give height, and cannot be a grooved upper tray either: the
    // groove is 2.85 mm high and 0.8 mm of wall must stand above it (3.65)
    const parts = splitRisers(stack({ lower: { h: 3.6 }, upper: { z: 3.6 } }), base());
    const riser = parts.find((t) => t.part === "riser");
    expect(riser?.lip).toBe(false);
    expect(parts.find((t) => t.key === "a:p0:0")?.onRiser).toBeUndefined();
  });

  it("takes a groove under a bottom tray of exactly what the groove needs", () => {
    const parts = splitRisers(stack({ lower: { h: 3.65 }, upper: { z: 3.65 } }), base());
    expect(parts.find((t) => t.part === "riser")?.lip).toBe(true);
    const bottom = parts.find((t) => t.key === "a:p0:0") as TraySpec;
    expect(bottom.onRiser).toBe(true);
    expect(bottom.h).toBeCloseTo(upperTrayMinH(DEFAULT_SETTINGS), 9);
    expect(() => planTray(bottom, DEFAULT_SETTINGS)).not.toThrow();
  });

  it("never prints a riser, with its lip, taller than the bed", () => {
    // 28.8 mm of padding would give a 28.8 mm riser; the bed is 30 mm high and the lip adds 2
    const printer: Printer = { ...TEST_PRINTER, bedZ: 30 };
    const riser = splitRisers(stack(), base({ printer })).find((t) => t.part === "riser");
    expect(riser?.lip).toBe(true);
    expect((riser?.h ?? 0) + LIP.height).toBeLessThanOrEqual(30);
    const tall: Printer = { ...TEST_PRINTER, bedZ: 25 };
    const taller = splitRisers(stack(), base({ printer: tall })).find((t) => t.part === "riser");
    expect((taller?.h ?? 0) + (taller?.lip ? LIP.height : 0)).toBeLessThanOrEqual(25);
  });

  it("falls back to a plain riser where the bed leaves the lipped riser too little", () => {
    // the grooved plan needs a riser of the minimum riser setting plus a lip within the bed
    const printer: Printer = { ...TEST_PRINTER, bedZ: 4 };
    const riser = splitRisers(stack(), base({ printer })).find((t) => t.part === "riser");
    if (riser) {
      expect(riser.h + (riser.lip ? LIP.height : 0)).toBeLessThanOrEqual(4);
    }
  });

  it("is derived: the stored trays are not touched", () => {
    const stored = stack();
    const copy = structuredClone(stored);
    splitRisers(stored, base());
    expect(stored).toEqual(copy);
  });

  it("follows a fillers' move: an in-level filler still stands on the upper tray's lip", () => {
    const filler = traySpec({
      key: "leftover:0",
      part: "leftover",
      stack: 1,
      level: 1,
      x: 0,
      z: 12,
      w: 20,
      d: 60,
      h: 50,
      solid: true,
    });
    const parts = splitRisers([...stack(), filler], base());
    const upper = parts.find((t) => t.key === "b:p0:0") as TraySpec;
    expect(parts.find((t) => t.part === "leftover")?.z).toBe(upper.z);
  });
});

// The owner's file: the Starter stack (four trays) can have a lipped riser and a grooved Counter;
// the Trade deck stands alone, with a 1.6 mm wall.
function owner(): Project {
  const parsed = parseProject(owner5);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

function stored(p: Project): TraySpec[] {
  const result = optimize(
    {
      requirements: size(p.components, p.settings).requirements,
      box: p.box,
      printer: p.printer,
      settings: p.settings,
      locks: p.locks,
      inputsHash: inputsHash(p),
      appVersion: "0.0.0-test",
    },
    1,
    DEFAULT_ITERATIONS,
  );
  if (!result.layout) {
    throw new Error("the owner's file no longer fits");
  }
  return result.layout.trays;
}

describe("the owner's Star Realms file: risers follow the rim setting", { timeout: 60_000 }, () => {
  const p = owner();
  const plan = stored(p);
  const inputs = { settings: p.settings, printer: p.printer, locks: p.locks };
  const risersOf = (parts: readonly TraySpec[]) => parts.filter((t) => t.part === "riser");

  it("has the lip on (the setting the owner means by the rim between layers)", () => {
    expect(p.settings.lip.enabled).toBe(true);
  });

  it("gives the Starter stack's riser the lip and its Counter the groove", () => {
    const parts = splitRisers(plan, inputs);
    const riser = risersOf(parts).find((r) => r.stack === 0);
    // 9.6 mm: the stack's padding, now that its two 5-card trays may be as low as their groove needs,
    // less the 2 mm of the rim the top Starter tray carries (the split parts stack in any order)
    expect(riser).toMatchObject({ lip: true, z: 0, h: 9.6 });
    const counter = parts.find((t) => t.key === "epeanzhc:p0:0");
    expect(counter).toMatchObject({ onRiser: true, z: 9.6, level: 0 });
    // the trays above it are as before
    expect(parts.filter((t) => t.onRiser).map((t) => t.key)).toEqual(["epeanzhc:p0:0"]);
  });

  it("reads in the size line of the packing guide: the lipped riser says so, the plain one does not", () => {
    const parts = risersOf(splitRisers(plan, inputs));
    const lipped = parts.find((r) => r.stack === 0) as TraySpec;
    const plain = parts.find((r) => r.stack === 1) as TraySpec;
    // 9.6 mm and the 2 mm lip it prints
    expect(outerSizeText(lipped, p.settings)).toMatch(/× 11\.6 mm with its lip$/);
    expect(outerSizeText(plain, p.settings)).toBe("92.7 × 88.2 × 6.4 mm");
  });

  it("keeps the Trade deck's riser plain: the tray has no wall to spare for a groove", () => {
    const parts = splitRisers(plan, inputs);
    const riser = risersOf(parts).find((r) => r.stack === 1);
    expect(riser).toMatchObject({ lip: false, h: 6.4 });
    expect(parts.find((t) => t.key === "ctzfqraw:p0:0")?.onRiser).toBeUndefined();
  });

  it.each([false, true])(
    "prints parts planTray accepts, with the risers folded into the joined spacers: %s",
    (mergeRisers) => {
      const settings = { ...p.settings, mergeRisers };
      const printed = printableParts(plan, {
        ...inputs,
        settings,
        components: p.components,
      });
      expect(printed.trays.length).toBeGreaterThan(0);
      for (const t of printed.trays) {
        expect(() => planTray(t, settings), t.key).not.toThrow();
      }
    },
  );

  it("folds the lipped riser into the joined spacer, which keeps the riser's lip", () => {
    const printed = printableParts(plan, { ...inputs, components: p.components });
    const merged = printed.trays.filter((t) => t.merged?.members.some((m) => m.part === "riser"));
    const withLip = merged.filter((t) =>
      t.merged?.members.some((m) => m.part === "riser" && m.lip),
    );
    expect(withLip).toHaveLength(1);
  });

  it("prints no lip and no groove with the lip off", () => {
    const settings: Settings = { ...p.settings, lip: { ...p.settings.lip, enabled: false } };
    const parts = splitRisers(plan, { ...inputs, settings });
    expect(risersOf(parts).every((r) => !r.lip)).toBe(true);
    expect(parts.some((t) => t.onRiser)).toBe(false);
  });
});
