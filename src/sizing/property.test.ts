import fc, { type Arbitrary } from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, maxBottomChamfer } from "../model/settings";
import type {
  Access,
  CardsComponent,
  Component,
  MinisComponent,
  Settings,
  TilesComponent,
} from "../model/types";
import { groupOf } from "../model/defaults";
import { validateComponent } from "../model/validate";
import { MIN_SPACER } from "./constants";
import { SlotFitError, hasGrip, minOuter, realizeTray, rotateRealized, size } from "./index";
import { assertTrayInvariants } from "./test-helpers";
import type { OuterSize, RealizedTray, RealizeOptions, TrayPartReq } from "./types";

const EPS = 0.011;
/** Fixed seed: the suite explores the same inputs on every run and in CI. */
const SEED = 20261011;

const mm = (lo: number, hi: number): Arbitrary<number> =>
  fc.integer({ min: Math.round(lo * 100), max: Math.round(hi * 100) }).map((v) => v / 100);
/** A setting value on a 0.001 mm grid, so it is deliberately not a whole 0.01 mm. */
const setting = (lo: number, hi: number): Arbitrary<number> =>
  fc.integer({ min: Math.round(lo * 1000), max: Math.round(hi * 1000) }).map((v) => v / 1000);
const count = (hi: number): Arbitrary<number> => fc.integer({ min: 1, max: hi });
const access = fc.constantFrom<Access>("often", "sometimes", "setup");

const cardsArb: Arbitrary<Component> = fc
  .record({
    access,
    short: mm(30, 80),
    extra: mm(0, 50),
    decks: fc.array(count(120), { minLength: 1, maxLength: 4 }),
    sleeve: fc.constantFrom<"none" | "standard" | "premium" | "custom">(
      "none",
      "standard",
      "premium",
      "custom",
    ),
    measured: fc.option(fc.record({ cards: count(100), stackMm: mm(1, 60) }), { nil: undefined }),
    storage: fc.constantFrom<CardsComponent["storage"]>(
      "upright-long",
      "upright-short",
      "flat",
      "auto",
    ),
    clearance: fc.option(mm(0, 3), { nil: undefined }),
  })
  .map((r): Component => ({
    id: "",
    name: "Cards",
    access: r.access,
    kind: "cards",
    shortSide: r.short,
    longSide: r.short + r.extra,
    decks: r.decks.map((n, i) => ({ name: `D${i}`, count: n })),
    sleeve:
      r.sleeve === "custom"
        ? { w: r.short + 3, h: r.short + r.extra + 3, thickness: 0.15 }
        : r.sleeve,
    thickness:
      r.measured === undefined
        ? { mode: "preset" }
        : { mode: "measured", cards: r.measured.cards, stackMm: r.measured.stackMm },
    storage: r.storage,
    ...(r.clearance === undefined ? {} : { clearance: r.clearance }),
  }));

const bulkArb: Arbitrary<Component> = fc
  .record({
    access,
    items: fc.array(
      fc.oneof(
        fc.record({
          name: fc.constant("Item"),
          count: count(200),
          w: mm(2, 40),
          d: mm(2, 40),
          h: mm(1, 30),
        }),
        fc.record({ name: fc.constant("Pile"), volumeMl: mm(1, 400) }),
      ),
      { minLength: 1, maxLength: 4 },
    ),
  })
  .map((r): Component => ({
    id: "",
    name: "Bits",
    access: r.access,
    kind: "bulk",
    items: r.items,
  }));

const tilesArb: Arbitrary<Component> = fc
  .record({
    access,
    shape: fc.oneof(
      fc.record({ type: fc.constant("rect" as const), w: mm(10, 80), d: mm(10, 80) }),
      fc.record({
        type: fc.constant("hex" as const),
        flatToFlat: mm(15, 70),
        orientation: fc.constantFrom<"flat" | "pointy">("flat", "pointy"),
      }),
    ),
    thickness: mm(1, 4),
    count: count(80),
    storage: fc.constantFrom<TilesComponent["storage"]>("flat", "upright", "auto"),
  })
  .map((r): Component => ({
    id: "",
    name: "Tiles",
    access: r.access,
    kind: "tiles",
    shape: r.shape,
    thickness: r.thickness,
    count: r.count,
    storage: r.storage,
  }));

const minisArb: Arbitrary<Component> = fc
  .record({
    access,
    figures: fc.array(
      fc.record({
        name: fc.constant("Fig"),
        w: mm(10, 50),
        d: mm(10, 50),
        h: mm(10, 80),
        count: count(4),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    storage: fc.constantFrom<MinisComponent["storage"]>("pockets", "bulk"),
  })
  .map((r): Component => ({
    id: "",
    name: "Minis",
    access: r.access,
    kind: "minis",
    figures: r.figures,
    storage: r.storage,
  }));

const customArb: Arbitrary<Component> = fc
  .record({ access, w: mm(5, 80), d: mm(5, 80), h: mm(1, 60), count: count(4) })
  .map((r): Component => ({ id: "", name: "Thing", kind: "custom", ...r }));

/** 1–3 components, all in one group or not; the first is per player only when ungrouped (plan 1 rule). */
const componentsArb: Arbitrary<Component[]> = fc
  .record({
    list: fc.array(fc.oneof(cardsArb, bulkArb, tilesArb, minisArb, customArb), {
      minLength: 1,
      maxLength: 3,
    }),
    grouped: fc.boolean(),
    players: fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
  })
  .map(({ list, grouped, players }) =>
    list.map((c, i): Component => {
      const withId: Component = { ...c, id: `c${i}` };
      if (grouped) {
        return { ...withId, groupId: "g" };
      }
      return i === 0 && players !== undefined ? { ...withId, perPlayer: { players } } : withId;
    }),
  );

/**
 * Wall, divider, floor, bottom chamfer, lip and finger pocket values on a 0.001 mm grid, inside
 * SETTING_RANGES and settingsValid.
 */
const settingsArb: Arbitrary<Settings> = fc
  .record({
    wall: setting(0.9, 3),
    divider: setting(0.8, 3),
    floor: setting(0.8, 3),
    bottomChamfer: setting(0, 3),
    fit: fc.constantFrom(0.7, 1, 1.4),
    lip: fc.record({
      enabled: fc.boolean(),
      thickness: setting(0.9, 2),
      ledge: setting(0.5, 3),
      height: setting(1, 5),
    }),
    pocketUnits: fc.integer({ min: 500, max: 4000 }),
    reach: setting(5, 20),
  })
  .map((r): Settings => {
    const walls = { ...DEFAULT_SETTINGS, wall: r.wall, floor: r.floor };
    // With the lip on, upper trays (chamfer ≥ 0.5) rest on ledge − 2 × play × fit (field.lipBearing):
    // the ledge leaves room for that, and the chamfer stays below it, on the 0.001 mm grid.
    const play = 2 * DEFAULT_SETTINGS.lip.play * r.fit;
    const ledge = r.lip.enabled ? Math.max(r.lip.ledge, 0.502 + play) : r.lip.ledge;
    const bearing = r.lip.enabled ? Math.floor((ledge - play) * 1000) / 1000 - 0.001 : 3;
    return {
      ...walls,
      divider: r.divider,
      // At most what the wall and floor allow (settingsValid), on the 0.001 mm grid.
      bottomChamfer: Math.min(
        r.bottomChamfer,
        Math.floor(maxBottomChamfer(walls) * 1000) / 1000,
        bearing,
      ),
      fit: r.fit,
      lip: { ...DEFAULT_SETTINGS.lip, ...r.lip, ledge },
      // Odd and even unit counts of 0.01 mm alike, with a third decimal on top.
      fingerPocket: { width: r.pocketUnits / 100 + (r.pocketUnits % 3) / 1000, reach: r.reach },
    };
  });

const OPTS: RealizeOptions[] = [
  { lipped: false, level: 0 },
  { lipped: true, level: 0 },
  { lipped: false, level: 1 },
];

function spacersInsideCompartments(r: RealizedTray): void {
  for (const sp of r.spacers) {
    const inside = r.compartments.some(
      (c) =>
        sp.x >= c.x - EPS &&
        sp.x + sp.w <= c.x + c.w + EPS &&
        sp.y >= c.y - EPS &&
        sp.y + sp.d <= c.y + c.d + EPS,
    );
    expect(inside).toBe(true);
  }
}

/** Everything assertTrayInvariants does not cover: the contract with the requested part. */
function checkAgainstPart(part: TrayPartReq, outer: OuterSize, r: RealizedTray): void {
  expect(r.compartments.length).toBeGreaterThanOrEqual(part.compartments.length);
  r.compartments.forEach((c, i) => {
    const depth = outer.h - c.floorZ;
    for (const f of c.features) {
      if (f.type === "fingerPocket") {
        expect(f.depth).toBeLessThanOrEqual(depth + EPS);
      }
    }
    const req = part.compartments[i];
    if (req === undefined) {
      expect(c.kind).toBe("spare");
      return;
    }
    expect(c.contents).toBe(req.contents);
    expect(c.w).toBeGreaterThanOrEqual(req.minW - EPS);
    expect(c.d).toBeGreaterThanOrEqual(req.minD - EPS);
    expect(depth).toBeGreaterThanOrEqual(req.minH - EPS);
    if (req.minVolume !== undefined) {
      expect(c.w * c.d * depth).toBeGreaterThanOrEqual(req.minVolume * (1 - 1e-6));
    }
    if (req.maxHRatio !== undefined) {
      expect(depth).toBeLessThanOrEqual(req.maxHRatio * Math.min(c.w, c.d) + EPS);
    }
  });
  expect(r.spacers.length).toBeLessThanOrEqual(1);
  for (const sp of r.spacers) {
    expect(sp.key).toBe(`${part.trayKey}:spacer`);
    expect(sp.w).toBeGreaterThanOrEqual(MIN_SPACER - EPS);
    expect(sp.h).toBeGreaterThanOrEqual(MIN_SPACER - EPS);
  }
  spacersInsideCompartments(r);
  expect(hasGrip(r.compartments)).toBe(true);
}

/**
 * Realizes `part` in `outer`, checks it, then checks the same tray rotated by 90°. Returns false
 * (without checking anything) when realizeTray refuses the tray because its finger slots cannot
 * keep the minimum width, which layout treats as an infeasible variant (roadmap §4.7).
 */
function checkTray(
  part: TrayPartReq,
  outer: OuterSize,
  s: Settings,
  opts: RealizeOptions,
): boolean {
  let realized: RealizedTray;
  try {
    realized = realizeTray(part, outer, s, opts);
  } catch (error) {
    if (error instanceof SlotFitError) {
      return false;
    }
    throw error;
  }
  assertTrayInvariants(realized, outer, s, opts);
  checkAgainstPart(part, outer, realized);
  expect(realizeTray(part, outer, s, opts)).toEqual(realized);

  const turnedOuter = { w: outer.d, d: outer.w, h: outer.h };
  const turned = rotateRealized(realized, outer);
  assertTrayInvariants(turned, turnedOuter, s, opts);
  spacersInsideCompartments(turned);
  expect(hasGrip(turned.compartments)).toBe(true);
  expect(turned.compartments).toHaveLength(realized.compartments.length);
  return true;
}

/** Whether realizeTray realizes `part` in `outer`, false when it throws SlotFitError. */
function realizes(part: TrayPartReq, outer: OuterSize, s: Settings, opts: RealizeOptions): boolean {
  try {
    realizeTray(part, outer, s, opts);
    return true;
  } catch (error) {
    if (error instanceof SlotFitError) {
      return false;
    }
    throw error;
  }
}

/**
 * size() of valid components: asserts the property is not vacuous. Every component is sized,
 * except a component or group size() leaves out with a sizing.noFingerSlot warning naming one of
 * its members.
 */
function sized(components: Component[], s: Settings): ReturnType<typeof size> {
  components.forEach((c, i) => {
    expect(validateComponent(c, i).filter((n) => n.level === "error")).toEqual([]);
  });
  const result = size(components, s);
  const ids = result.requirements.flatMap((req) => req.componentIds);
  expect(new Set(ids).size).toBe(ids.length);
  const keyOf = (c: Component): string => groupOf(c) ?? c.id;
  const warned = new Set(
    components.flatMap((c, i) =>
      result.notices.some((n) => n.code === "sizing.noFingerSlot" && n.path === `/components/${i}`)
        ? [keyOf(c)]
        : [],
    ),
  );
  for (const c of components) {
    expect(ids.includes(c.id) !== warned.has(keyOf(c)), c.id).toBe(true);
  }
  return result;
}

function allParts(components: Component[], s: Settings): TrayPartReq[] {
  return sized(components, s).requirements.flatMap((req) => req.variants.flatMap((v) => v.parts));
}

describe("sizing properties", () => {
  it("returns 1–8 uniquely named variants with non-empty parts", { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(componentsArb, settingsArb, (components, s) => {
        for (const req of sized(components, s).requirements) {
          expect(req.variants.length).toBeGreaterThanOrEqual(1);
          expect(req.variants.length).toBeLessThanOrEqual(8);
          expect(new Set(req.variants.map((v) => v.id)).size).toBe(req.variants.length);
          for (const v of req.variants) {
            expect(v.parts.length).toBeGreaterThan(0);
            for (const part of v.parts) {
              expect(part.compartments.length).toBeGreaterThan(0);
            }
          }
        }
      }),
      { numRuns: 200, seed: SEED },
    );
  });

  it("realizes every variant part at its minOuter", { timeout: 120_000 }, () => {
    // size() keeps only variants whose parts realize unlipped at level 0; a lipped or upper
    // tray's thicker wall or chamfer may still leave a slot no room (SlotFitError), which layout
    // treats as infeasible (roadmap §4.7).
    let realized = 0;
    fc.assert(
      fc.property(componentsArb, settingsArb, (components, s) => {
        for (const part of allParts(components, s)) {
          for (const opts of OPTS) {
            const ok = checkTray(part, minOuter(part, s, opts), s, opts);
            if (!opts.lipped && opts.level === 0) {
              expect(ok, part.trayKey).toBe(true);
            }
            realized += ok ? 1 : 0;
          }
        }
      }),
      { numRuns: 100, seed: SEED },
    );
    expect(realized).toBeGreaterThan(0);
  });

  it(
    "realizes a part at a larger outer exactly when it realizes at minOuter",
    { timeout: 120_000 },
    () => {
      let larger = 0;
      fc.assert(
        fc.property(
          componentsArb,
          settingsArb,
          fc.record({ w: mm(0, 80), d: mm(0, 80), h: mm(0, 40) }),
          fc.constantFrom(...OPTS),
          (components, s, extra, opts) => {
            for (const part of allParts(components, s)) {
              const m = minOuter(part, s, opts);
              const outer = { w: m.w + extra.w, d: m.d + extra.d, h: m.h + extra.h };
              if (!realizes(part, m, s, opts)) {
                expect(realizes(part, outer, s, opts), part.trayKey).toBe(false);
                continue;
              }
              expect(
                checkTray(part, outer, s, opts),
                `${part.trayKey} at +${JSON.stringify(extra)}`,
              ).toBe(true);
              larger += 1;
            }
          },
        ),
        { numRuns: 100, seed: SEED },
      );
      expect(larger).toBeGreaterThan(0);
    },
  );

  it("is deterministic", { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(componentsArb, settingsArb, (components, s) => {
        expect(sized(components, s)).toEqual(size(components, s));
      }),
      { numRuns: 50, seed: SEED },
    );
  });
});
