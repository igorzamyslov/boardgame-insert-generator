// src/layout/risers.owner.test.ts
// The owner's Star Realms file (test/fixtures/star-realms-owner-4.json): "don't see the reason to
// not make the risers, maybe make min 3 mm + setting" (2026-10-21, 0.10.0). Its Starter stack can
// give about 9.5 mm of padding and its Trade deck about 6.4 mm, both under the old 10 mm minimum,
// so both kept a raised floor (the top Starter tray's well floor at about 12 mm).
import { describe, expect, it } from "vitest";
import starRealmsOwner4 from "../../test/fixtures/star-realms-owner-4.json";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import type { Project, TraySpec } from "../model/types";
import { size } from "../sizing";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { printableParts } from "./printable";
import { splitRisers } from "./risers";
import { toU } from "./units";

function owner(): Project {
  const parsed = parseProject(starRealmsOwner4);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

/** The stored plan the optimizer makes for the file today (seed 1, as auto-storage.test.ts). */
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

const inputsOf = (p: Project) => ({ settings: p.settings, printer: p.printer, locks: p.locks });

/** How far the floor of a well stands above its tray's own floor: 0 for a plain one. */
const raise = (t: TraySpec): number =>
  Math.max(0, ...t.compartments.filter((c) => c.kind !== "spare").map((c) => c.floorZ - t.floor));

describe(
  "the owner's Star Realms file prints a riser under each stack",
  { timeout: 60_000 },
  () => {
    const p = owner();
    const trays = stored(p);
    const stackOf = (t: TraySpec): number => t.stack;
    const stacks = [...new Set(trays.filter((t) => t.part === "tray").map(stackOf))];

    it("has the padding the owner described: raised floors under the old 10 mm minimum", () => {
      expect(stacks).toHaveLength(2);
      const before = splitRisers(trays, {
        ...inputsOf(p),
        settings: { ...p.settings, minRiser: 10 },
      });
      expect(before.filter((t) => t.part === "riser")).toEqual([]);
      expect(Math.max(...trays.filter((t) => t.part === "tray").map(raise))).toBeGreaterThan(6);
    });

    it("splits a riser from both stacks at the default 3 mm", () => {
      expect(p.settings.minRiser).toBe(3);
      const printed = splitRisers(trays, inputsOf(p));
      const risers = printed.filter((t) => t.part === "riser");
      expect(
        risers.map((r) => trays.find((t) => `${t.key}:riser` === r.key)?.stack).sort(),
      ).toEqual([...stacks].sort());
      for (const r of risers) {
        expect(r.h).toBeGreaterThanOrEqual(3);
        expect(r.z).toBe(0);
      }
    });

    it("leaves every tray a normal floor, and the stacks still reach the top plane", () => {
      const printed = splitRisers(trays, inputsOf(p));
      for (const t of printed.filter((x) => x.part === "tray")) {
        // a floor, or at most the depth of a divider's slot (about 1.2 mm), never a block
        expect(raise(t), t.key).toBeLessThan(1.5);
      }
      for (const stack of stacks) {
        const parts = printed.filter(
          (t) => (t.part === "tray" || t.part === "riser") && t.stack === stack,
        );
        const top = trays.filter((t) => t.part === "tray" && t.stack === stack);
        expect(toU(parts.reduce((sum, t) => sum + t.h, 0)), `stack ${stack}`).toBe(
          toU(top.reduce((sum, t) => sum + t.h, 0)),
        );
      }
    });

    it("prints the same trays through printableParts, the risers folded into the joined spacers as the file says", () => {
      expect(p.settings.mergeRisers).toBe(true);
      const flat = printableParts(trays, {
        ...inputsOf(p),
        components: p.components,
        settings: { ...p.settings, mergeRisers: false },
      });
      expect(flat.trays.filter((t) => t.part === "riser")).toHaveLength(2);
      const folded = printableParts(trays, { ...inputsOf(p), components: p.components });
      // a riser beside a joined spacer is one part with it; none stands alone in the same place
      expect(folded.trays.filter((t) => t.part === "tray").map((t) => [t.key, t.z, t.h])).toEqual(
        flat.trays.filter((t) => t.part === "tray").map((t) => [t.key, t.z, t.h]),
      );
      for (const t of folded.trays.filter((x) => x.part === "tray")) {
        expect(raise(t), t.key).toBeLessThan(1.5);
      }
    });

    it("keeps the old output on request: at 10 mm the trays keep their raised floors", () => {
      const old = { ...p.settings, minRiser: 10 };
      const printed = printableParts(trays, {
        ...inputsOf(p),
        components: p.components,
        settings: old,
      });
      expect(
        Math.max(...printed.trays.filter((t) => t.part === "tray").map(raise)),
      ).toBeGreaterThan(6);
    });
  },
);
