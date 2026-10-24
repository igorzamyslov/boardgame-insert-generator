import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { createRun } from "./optimize";
import { boxReq, fakeMeasure, fakeRealize, makeInput } from "./test-utils";
import type { TraySpec } from "../model/types";

// Growth is the last step of planning (owner, 2026-10-23, DESIGN.md decision log): the layout is
// chosen on natural sizes, where every gap is a spacer and the score charges it, and only then does
// the room left go to the wells of the items that asked for "as much as fits".

const trays = (r: ReturnType<typeof optimize>): TraySpec[] =>
  (r.layout?.trays ?? []).filter((t) => t.part === "tray");
const fillers = (r: ReturnType<typeof optimize>): TraySpec[] =>
  (r.layout?.trays ?? []).filter((t) => t.part === "leftover");

const optimize = (
  input: ReturnType<typeof makeInput>,
  seed: number,
  iterations: number,
  opts: { measure: typeof fakeMeasure; realize: typeof fakeRealize },
) => {
  const r = createRun(input, seed, iterations, opts);
  while (!r.step()) {
    // runs to the end of its budget
  }
  return r.result();
};

const run = (growing: boolean, extra = {}) =>
  optimize(
    makeInput(
      [
        boxReq("bin", 50, 40, 10, growing ? { elastic: { w: true, d: true, h: false } } : {}),
        boxReq("rigid", 60, 40, 10),
      ],
      { box: { innerWidth: 200, innerDepth: 120 }, ...extra },
    ),
    1,
    3000,
    { measure: fakeMeasure, realize: fakeRealize },
  );

describe("the context a layout is planned in", () => {
  const input = makeInput([boxReq("bin", 50, 40, 10, { elastic: { w: true, d: true, h: true } })]);
  const ref = { req: 0, variant: 0, part: 0 };

  it("sees room for growth only when growth is on (the last step)", () => {
    const last = createCtx(input, fakeMeasure).metrics(ref, false, 0);
    expect(last.growW).toBeGreaterThan(0);
    const planned = createCtx(input, fakeMeasure, { growth: false }).metrics(ref, false, 0);
    expect(planned.growW).toBe(0);
    expect(planned.growD).toBe(0);
    expect(planned.growH).toBe(0);
    expect(planned.elasticH).toBe(false);
    // the minimum size is the same: only what the tray may take is left out
    expect(planned.w).toBe(last.w);
  });

  it("still counts thicker walls as room the plan may use: that choice is made in the plan", () => {
    const withWalls = makeInput([boxReq("rigid", 50, 40, 10)], { settings: { wallAbsorb: 1.6 } });
    const planned = createCtx(withWalls, fakeMeasure, { growth: false }).metrics(
      { req: 0, variant: 0, part: 0 },
      false,
      0,
    );
    expect(planned.capW).toBe(320);
  });
});

describe("a plan with growth as the last step", () => {
  it("chooses the same arrangement whether or not an item asks for room: the score does not reward growth", () => {
    const a = run(true);
    const b = run(false);
    // the arrangement is which tray comes where in the order of the box, stack level and turn: not
    // the coordinates, which move when a grown tray pushes its neighbour along
    const where = (r: ReturnType<typeof optimize>) =>
      trays(r)
        .sort((p, q) => p.x - q.x || p.y - q.y)
        .map((t) => [t.key, t.level, t.rotated]);
    expect(a.layout).not.toBeNull();
    expect(where(a)).toEqual(where(b));
  });

  it("gives the room left to the well of the item that asked, and no spacer is left beside it", () => {
    const grown = run(true);
    const plain = run(false);
    const bin = (r: ReturnType<typeof optimize>) => trays(r).find((t) => t.key.startsWith("bin"));
    // the plain plan leaves room as a spacer; the growing item's tray absorbed it
    expect(fillers(plain).length).toBeGreaterThan(0);
    expect((bin(grown)?.w ?? 0) * (bin(grown)?.d ?? 0)).toBeGreaterThan(
      (bin(plain)?.w ?? 0) * (bin(plain)?.d ?? 0),
    );
    expect(fillers(grown).length).toBeLessThan(fillers(plain).length);
  });

  it("never grows a tray that asked for no room", () => {
    const plain = run(false);
    const rigid = trays(plain).find((t) => t.key.startsWith("rigid"));
    // 60 × 40 inside, fakeMeasure's 2 mm walls
    expect(rigid?.w).toBe(64);
    expect(rigid?.d).toBe(44);
  });

  it("is as feasible as the plan: growth never turns a fit into no fit", () => {
    const tight = run(true, { box: { innerWidth: 120, innerDepth: 50 } });
    expect(tight.layout).not.toBeNull();
  });
});
