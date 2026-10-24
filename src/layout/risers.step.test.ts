// src/layout/risers.step.test.ts
// The owner's Star Realms file with the stepped base (2026-10-23): the walls stay at 1.6 mm, every
// stack still reaches the top plane exactly, a tray with one on top is the socket's depth taller
// than its contents ask, and every riser carries the socket, the Trade deck's (a tray alone in its
// stack, which the rim cannot lock) included. The geometry of the same parts:
// geometry/tray.step.test.ts.
import { describe, expect, it } from "vitest";
import owner5 from "../../test/fixtures/star-realms-owner-5.json";
import { inputsHash } from "../model/hash";
import { socketOf } from "../model/lip";
import { parseProject } from "../model/schema";
import type { Project, TraySpec } from "../model/types";
import { size } from "../sizing";
import { createCtx } from "./context";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { printableParts } from "./printable";
import { splitRisers } from "./risers";
import { toU } from "./units";

function owner(kind: "rim" | "step"): Project {
  const parsed = parseProject(owner5);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const p = parsed.project;
  return { ...p, settings: { ...p.settings, lip: { ...p.settings.lip, joint: kind } } };
}

function stored(p: Project): TraySpec[] {
  const input = {
    requirements: size(p.components, p.settings).requirements,
    box: p.box,
    printer: p.printer,
    settings: p.settings,
    locks: p.locks,
    inputsHash: inputsHash(p),
    appVersion: "0.0.0-test",
  };
  const result = optimize(input, 1, DEFAULT_ITERATIONS);
  if (!result.layout) {
    throw new Error("the owner's file no longer fits");
  }
  return result.layout.trays;
}

const inputsOf = (p: Project) => ({ settings: p.settings, printer: p.printer, locks: p.locks });

describe("the owner's Star Realms file with the stepped base", { timeout: 60_000 }, () => {
  const p = owner("step");
  const trays = stored(p);
  const real = trays.filter((t) => t.part === "tray");
  const stacks = [...new Set(real.map((t) => t.stack))];
  const depth = socketOf(p.settings, true)?.depth ?? NaN;

  it("keeps every tray's wall at the Wall setting", () => {
    for (const t of real) {
      expect(t.wall, t.key).toBe(p.settings.wall);
    }
  });

  it("stacks every tray flush and adds the heights up to the top plane", () => {
    const top = createCtx({
      requirements: [],
      box: p.box,
      printer: p.printer,
      settings: p.settings,
      locks: [],
      inputsHash: "",
      appVersion: "t",
    }).topPlane;
    for (const stack of stacks) {
      const list = real.filter((t) => t.stack === stack).sort((a, b) => a.level - b.level);
      expect(toU(list.reduce((s, t) => s + t.h, 0)), `stack ${stack}`).toBe(top);
      list.forEach((t, k) => {
        expect(t.lip, t.key).toBe(k < list.length - 1);
        if (k > 0) {
          const below = list[k - 1] as TraySpec;
          expect(t.z, t.key).toBeCloseTo(below.z + below.h, 6);
        }
      });
    }
  });

  it("keeps the socket's depth over the contents of a tray with one on top", () => {
    const parts = size(p.components, p.settings).requirements.flatMap((r) =>
      r.variants.flatMap((v) => v.parts),
    );
    for (const t of real.filter((x) => x.lip)) {
      // the variant the tray was made from: the one whose contents fit it at all
      const tops = parts
        .filter((x) => x.trayKey === t.key && x.compartments.length === t.compartments.length)
        .map((x) =>
          Math.max(...t.compartments.map((c, i) => c.floorZ + (x.compartments[i]?.minH ?? 0))),
        )
        .filter((top) => top <= t.h + 1e-6);
      expect(tops.length, t.key).toBeGreaterThan(0);
      expect(Math.min(...tops), t.key).toBeLessThanOrEqual(t.h - depth + 1e-6);
    }
  });

  it("gives every stack a riser with the socket, and its bottom tray the slab", () => {
    const printed = splitRisers(trays, inputsOf(p));
    const risers = printed.filter((t) => t.part === "riser");
    expect(risers.map((r) => r.stack).sort()).toEqual([...stacks].sort());
    for (const r of risers) {
      expect(r.lip, r.key).toBe(true);
      expect(r.wall, r.key).toBe(p.settings.wall);
    }
    for (const t of printed.filter((x) => x.part === "tray" && x.level === 0)) {
      expect(t.onRiser, t.key).toBe(true);
    }
    const trade = printed.find(
      (t) => t.part === "tray" && t.compartments.some((c) => c.contents.includes("Trade")),
    );
    expect(trade?.onRiser).toBe(true);
    expect(printed.filter((t) => t.part === "tray" && t.stack === trade?.stack)).toHaveLength(1);
  });

  it("where the rim leaves the Trade deck's riser plain", () => {
    const rim = owner("rim");
    const printed = splitRisers(stored(rim), inputsOf(rim));
    const trade = printed.find(
      (t) => t.part === "tray" && t.compartments.some((c) => c.contents.includes("Trade")),
    );
    expect(trade?.onRiser).toBeUndefined();
  });

  it("folds the risers into their spacers as it stands, never upside down", () => {
    const printed = printableParts(trays, { ...inputsOf(p), components: p.components });
    const folded = printed.trays.filter(
      (t) => t.merged?.members.some((m) => m.part === "riser") === true,
    );
    expect(folded.length).toBeGreaterThan(0);
    for (const f of folded) {
      expect(f.merged?.flipped, f.key).toBe(false);
    }
  });
});
