// src/layout/lock-shared-keys.test.ts
// Tray keys are shared by variants (`<key>:p0:0` is the one strip of `flat|strip|split1` and the
// first tray of `flat|strip|split3`). A lock names keys, not variants: the resolver has to pin the
// variant that makes the lock hold, not the first one that has the keys.
import { describe, expect, it } from "vitest";
import { buildLayoutInput } from "../app/runner";
import { parseProject } from "../model/schema";
import type { CardsComponent, Lock, Project } from "../model/types";
import starRealmsAuto from "../../test/fixtures/star-realms-auto.json";
import { createCtx } from "./context";
import { resolveLocks } from "./locks";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { toMm } from "./units";
import { warmHints } from "./warmstart";

type Storage = CardsComponent["storage"];

const COUNTER = "epeanzhc:p0:0";
const STARTER = ["70kgton0:p0:0", "70kgton0:p0:1", "70kgton0:p0:2"];
const STACK: Lock = { kind: "stack", trayKeys: [COUNTER, ...STARTER] };

function projectWith(starter: Storage, locks: Lock[]): Project {
  const parsed = parseProject(starRealmsAuto);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const p = parsed.project;
  return {
    ...p,
    locks,
    components: p.components.map((c) =>
      c.kind === "cards" && c.name === "Starter deck" ? { ...c, storage: starter } : c,
    ),
  };
}

describe("a lock on keys several variants share", { timeout: 120_000 }, () => {
  for (const storage of ["flat", "auto"] as const) {
    describe(`Starter deck stored ${storage}`, () => {
      it("accepts the stack of the Counter and the three Starter trays", () => {
        const input = buildLayoutInput(projectWith(storage, [STACK]));
        const ctx = createCtx(input);
        const { resolved, conflicts } = resolveLocks(ctx, [STACK]);
        expect(conflicts).toEqual([]);
        expect(resolved.kept).toEqual([STACK]);
      });

      it("optimizes to those four trays in one stack", () => {
        const result = optimize(
          buildLayoutInput(projectWith(storage, [STACK])),
          1,
          DEFAULT_ITERATIONS,
        );
        expect(result.lockConflicts).toEqual([]);
        expect(result.layout).not.toBeNull();
        const trays = result.layout?.trays.filter((t) => t.part === "tray") ?? [];
        const stacked = trays.filter((t) => [COUNTER, ...STARTER].includes(t.key));
        expect(stacked.map((t) => t.key).sort()).toEqual([COUNTER, ...STARTER].sort());
        expect(new Set(stacked.map((t) => t.path)).size).toBe(1);
      });

      it("accepts it with the hints of the plan the user was looking at", () => {
        const unlocked = projectWith(storage, []);
        const first = optimize(buildLayoutInput(unlocked), 1, DEFAULT_ITERATIONS);
        expect(first.layout).not.toBeNull();
        const input = buildLayoutInput(projectWith(storage, [STACK]));
        const ctx = createCtx(input);
        const hints = warmHints(ctx, first.layout?.trays ?? []);
        const { conflicts } = resolveLocks(ctx, [STACK], hints);
        expect(conflicts).toEqual([]);
      });
    });
  }

  it("keeps a position lock on a tray whose key an upright variant shares with the flat one", () => {
    const lock: Lock = { kind: "position", trayKey: COUNTER, path: "0", rotated: false };
    const ctx = createCtx(buildLayoutInput(projectWith("flat", [lock])));
    const { resolved, conflicts } = resolveLocks(ctx, [lock]);
    expect(conflicts).toEqual([]);
    expect(resolved.kept).toEqual([lock]);
  });

  it("pins the variant a size lock fits, not the first one with the key", () => {
    const ctx = createCtx(buildLayoutInput(projectWith("flat", [])));
    // the Counter's flat variant (the last), measured as the sizing step gives it
    const flat = ctx.input.requirements[2]?.variants.findIndex((v) => v.id.startsWith("flat"));
    const m = ctx.metrics({ req: 2, variant: flat ?? 0, part: 0 }, false, 0);
    const lock: Lock = {
      kind: "size",
      trayKey: COUNTER,
      w: toMm(m.w),
      d: toMm(m.d),
      h: toMm(m.h),
    };
    const { resolved, conflicts } = resolveLocks(ctx, [lock]);
    expect(conflicts).toEqual([]);
    expect(resolved.pinnedVariant[2]).toBe(flat);
  });

  it("names each deck once in a conflict of a stack lock", () => {
    // five trays in a stack lock: more than a stack holds, so the lock is in conflict
    const input = buildLayoutInput(projectWith("auto", []));
    const ctx = createCtx(input);
    const tall: Lock = { kind: "stack", trayKeys: [COUNTER, ...STARTER, "ctzfqraw:p0:0"] };
    const { conflicts } = resolveLocks(ctx, [tall]);
    const stackConflict = conflicts.find((c) => c.kind === "stack");
    expect(stackConflict?.reason).toBe("a stack holds at most 4 trays");
    expect(stackConflict?.name).toBe(
      "Counter ×18, Starter deck — Deck 1 ×15, Starter deck — Deck 2 ×5, Starter deck — Deck 3 ×5, Trade deck ×80",
    );
  });
});
