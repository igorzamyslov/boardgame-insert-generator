import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Lock } from "../model/types";
import type { TrayRequirement } from "../sizing/types";
import { fixtureInput, type FixtureName } from "./test-fixtures";
import { checkHardRules } from "./test-hard-rules";
import { optimize } from "./optimize";
import { comp, makeInput, part, req, variant } from "./test-utils";
import type { LayoutInput, LayoutResult } from "./types";

const compArb = fc.record({
  minW: fc.integer({ min: 20, max: 110 }),
  minD: fc.integer({ min: 20, max: 110 }),
  minH: fc.integer({ min: 5, max: 45 }),
  ew: fc.boolean(),
  ed: fc.boolean(),
  eh: fc.boolean(),
});

const reqArb = fc.record({
  comps: fc.array(compArb, { minLength: 1, maxLength: 3 }),
  rotatable: fc.boolean(),
  access: fc.constantFrom("often" as const, "sometimes" as const, "setup" as const),
  loose: fc.boolean(),
  split: fc.boolean(),
  // every compartment asks for a front wall cutout, so rule 8 and the cutout rules are exercised
  fingerCuts: fc.boolean(),
});

const inputArb = fc.record({
  reqs: fc.array(reqArb, { minLength: 1, maxLength: 6 }),
  w: fc.integer({ min: 120, max: 420 }),
  d: fc.integer({ min: 120, max: 420 }),
  h: fc.integer({ min: 25, max: 120 }),
  headroom: fc.integer({ min: 0, max: 10 }),
  partial: fc.boolean(),
  side: fc.boolean(),
  lip: fc.boolean(),
  fit: fc.constantFrom(0.7, 1, 1.4),
  solid: fc.boolean(),
  bed: fc.constantFrom(180, 220, 256),
});

type InputSpec = typeof inputArb extends fc.Arbitrary<infer T> ? T : never;

function build(spec: InputSpec): LayoutInput {
  const requirements: TrayRequirement[] = spec.reqs.map((r, i) => {
    const key = `r${i}`;
    const comps = r.comps.map((c, k) =>
      comp({
        minW: c.minW,
        minD: c.minD,
        minH: c.minH,
        elastic: { w: c.ew, d: c.ed, h: c.eh },
        contents: `${key}c${k}`,
        fingerCut: r.fingerCuts ? true : undefined,
      }),
    );
    const variants = [variant("one", [part(`${key}:p0:0`, comps, r.rotatable)])];
    if (r.split && comps.length > 1) {
      variants.push(
        variant(
          "split",
          comps.map((c, k) => part(`${key}:p0:${k}`, [c], r.rotatable)),
        ),
      );
    }
    return req(key, variants, { access: r.access, loose: r.loose });
  });
  return makeInput(requirements, {
    box: {
      innerWidth: spec.w,
      innerDepth: spec.d,
      innerHeight: spec.h,
      headroom: spec.headroom,
      headroomCoverage: spec.partial ? "partial" : "full",
      storedOnSide: spec.side,
    },
    printer: { bedX: spec.bed, bedY: spec.bed },
    settings: {
      fit: spec.fit,
      leftover: spec.solid ? "solid" : "spare",
      lip: { enabled: spec.lip, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 },
    },
  });
}

function expectValid(input: LayoutInput, r: LayoutResult): void {
  if (r.layout) {
    expect(checkHardRules(input, r.layout, r.notices)).toEqual([]);
    expect(r.bestAttempt).toBeNull();
  } else {
    expect(r.bestAttempt).not.toBeNull();
    expect(r.notices.some((n) => n.code === "layout.doesNotFit")).toBe(true);
  }
}

describe("hard rules (spec §3) on random inputs", () => {
  it("every result satisfies all hard rules, or reports doesNotFit", () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 0, max: 2 ** 31 - 1 }), (spec, seed) => {
        const input = build(spec);
        expectValid(input, optimize(input, seed, 300));
      }),
      { numRuns: 60 },
    );
  });

  it("locks taken from a result are respected or dropped with a notice", () => {
    fc.assert(
      fc.property(inputArb, fc.nat(), fc.nat(), (spec, pick, seed) => {
        const input = build(spec);
        const first = optimize(input, seed, 200);
        const trays = first.layout?.trays.filter((t) => t.part === "tray") ?? [];
        const t = trays[pick % Math.max(1, trays.length)];
        if (!first.layout || !t) {
          return;
        }
        const locks: Lock[] = [
          { kind: "position", trayKey: t.key, path: t.path, rotated: t.rotated },
          { kind: "size", trayKey: t.key, w: t.w, d: t.d, h: t.h },
          { kind: "position", trayKey: "ghost:p0:0", path: "1", rotated: false },
        ];
        const locked = { ...input, locks };
        const r = optimize(locked, seed, 200, { warmStart: first.layout });
        expectValid(locked, r);
        expect(
          r.notices.some((n) => n.code === "lock.dropped" && n.message.includes("ghost:p0:0")),
        ).toBe(true);
      }),
      { numRuns: 30 },
    );
  });

  it("same seed + iterations gives deep-equal results", () => {
    fc.assert(
      fc.property(inputArb, fc.nat(), (spec, seed) => {
        const input = build(spec);
        expect(optimize(input, seed, 200)).toEqual(optimize(input, seed, 200));
      }),
      { numRuns: 15 },
    );
  });
});

describe("hard rules on the synthetic fixtures", () => {
  const feasible: FixtureName[] = ["cards-heavy", "bits-heavy", "tiles-minis", "small-tiles"];
  for (const name of feasible) {
    it(`${name}: feasible and every hard rule holds`, () => {
      const input = fixtureInput(name);
      const r = optimize(input, 1, 4000);
      expect(r.layout).not.toBeNull();
      expectValid(input, r);
    });
  }

  it("tiny-box: no layout, a best attempt with a shortfall", () => {
    const input = fixtureInput("tiny-box");
    const r = optimize(input, 1, 2000);
    expect(r.layout).toBeNull();
    expectValid(input, r);
  });
});
