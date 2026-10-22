import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { StoredLayout, TraySpec } from "../model/types";
import { realizeTray } from "../sizing/realize";
import { cards, partOf } from "../sizing/test-helpers";
import { createCtx, type Ctx } from "./context";
import { optimize } from "./optimize";
import { splitRisers, type RiserInputs } from "./risers";
import { stackHeights, stackLevels } from "./stack";
import { checkHardRules } from "./test-hard-rules";
import { TEST_PRINTER, boxReq, fakeMeasure, item, makeInput, traySpec } from "./test-utils";
import { toU } from "./units";
import type { LayoutInput } from "./types";

const compartment = (floorZ: number) => ({
  x: 1.6,
  y: 1.6,
  w: 96.8,
  d: 56.8,
  floorZ,
  kind: "well" as const,
  contents: "a",
  features: [],
});
/** A stored tray padded to `h`, its content 20 mm deep: the rest is a raised floor. */
const padded = (h: number, o: Partial<TraySpec> = {}): TraySpec =>
  traySpec({ key: "a:p0:0", w: 100, d: 60, h, compartments: [compartment(h - 20)], ...o });

const base = (extra: Partial<RiserInputs> = {}): RiserInputs => ({
  settings: { ...DEFAULT_SETTINGS },
  printer: { ...TEST_PRINTER },
  locks: [],
  ...extra,
});

describe("splitRisers: a riser under a stack (spec §3 rule 2)", () => {
  it("takes the raised floor out of a tray padded to the top plane", () => {
    const parts = splitRisers([padded(60)], base());
    const tray = parts.find((t) => t.part === "tray");
    const riser = parts.find((t) => t.part === "riser");
    expect(riser).toMatchObject({
      key: "a:p0:0:riser",
      path: "",
      level: 0,
      x: 0,
      y: 0,
      z: 0,
      w: 100,
      d: 60,
      h: 38.8,
      lip: false,
    });
    expect(tray).toMatchObject({ z: 38.8, h: 21.2 });
    expect(tray?.compartments.map((c) => c.floorZ)).toEqual([1.2]);
    expect(toU((riser?.h ?? 0) + (tray?.h ?? 0))).toBe(6000);
  });

  describe("a tray with a spare compartment", () => {
    const spare = (floorZ: number) => ({
      ...compartment(floorZ),
      x: 60,
      w: 38,
      kind: "spare" as const,
      contents: "spare",
    });
    const trayWith = (floorZ: number): TraySpec => {
      const well = { ...compartment(60 - 20), w: 50 };
      return traySpec({ key: "a:p0:0", w: 100, d: 60, h: 60, compartments: [well, spare(floorZ)] });
    };

    it("still sheds its riser when the spare stands on its deck's floor", () => {
      const parts = splitRisers([trayWith(40)], base());
      expect(parts.find((t) => t.part === "riser")?.h).toBe(38.8);
      const tray = parts.find((t) => t.part === "tray");
      expect(tray?.h).toBe(21.2);
      expect(tray?.compartments.map((c) => c.floorZ)).toEqual([1.2, 1.2]);
    });

    it("sheds it from a tray the sizing layer realized with a long spare length: a spacer, no pocket", () => {
      const part = partOf(
        [cards({ growth: { stack: "max" }, separators: 2 })],
        "upright-long|strip|split1",
      );
      const r = realizeTray(part, { w: 82.8, d: 95.9, h: 90 }, DEFAULT_SETTINGS, {
        lipped: false,
        level: 0,
      });
      expect(r.compartments.map((c) => c.kind)).toEqual(["well"]);
      expect(r.spacers).toHaveLength(1);
      const tray = traySpec({
        key: "a:p0:0",
        w: 82.8,
        d: 95.9,
        h: 90,
        wall: r.wall,
        compartments: r.compartments,
      });
      const parts = splitRisers([tray], base());
      const shed = parts.find((t) => t.part === "riser");
      expect(shed?.h).toBe(20.8);
      expect(parts.find((t) => t.part === "tray")?.h).toBe(69.2);
    });
  });

  it("does not touch the stored tray", () => {
    const stored = padded(60);
    const copy = structuredClone(stored);
    splitRisers([stored], base());
    expect(stored).toEqual(copy);
  });

  it("keeps a spacer on its tray's floor: the tray rises by as much as its floor drops", () => {
    const spacer = traySpec({ key: "a:p0:0:spacer", part: "spacer", path: "", z: 40 });
    const parts = splitRisers([padded(60), spacer], base());
    const tray = parts.find((t) => t.part === "tray");
    expect(parts.find((t) => t.part === "spacer")?.z).toBe(
      toU((tray?.z ?? 0) + (tray?.compartments[0]?.floorZ ?? 0)) / 100,
    );
  });

  it("is a whole number of layers, and open or solid like a leftover", () => {
    const open = splitRisers([padded(60)], base()).find((t) => t.part === "riser");
    expect(toU(open?.h ?? 0) % 20).toBe(0);
    expect(open?.solid).toBe(false);
    expect(open?.compartments).toMatchObject([{ kind: "spare", floorZ: 1.2, x: 1.6, y: 1.6 }]);
    const settings = { ...DEFAULT_SETTINGS, leftover: "solid" as const };
    const solid = splitRisers([padded(60)], base({ settings })).find((t) => t.part === "riser");
    expect(solid).toMatchObject({ solid: true, compartments: [] });
  });

  it("is emitted for a raise of the minimum riser setting (3 mm by default), not below it", () => {
    expect(DEFAULT_SETTINGS.minRiser).toBe(3);
    // content 20 + floor 1.2 + a raise of 3 mm
    const parts = splitRisers([padded(24.2)], base());
    expect(parts.find((t) => t.part === "riser")?.h).toBe(3);
    expect(parts.find((t) => t.part === "tray")).toMatchObject({ z: 3, h: 21.2 });
    expect(parts.find((t) => t.part === "tray")?.compartments.map((c) => c.floorZ)).toEqual([1.2]);
    // 2.8 mm is under it: the tray keeps its raised floor
    const under = splitRisers([padded(24)], base());
    expect(under.some((t) => t.part === "riser")).toBe(false);
    expect(under).toEqual([padded(24)]);
  });

  it("splits at the setting the person chose: 10 mm is the old rule, 1 mm is the smallest", () => {
    const ten = { settings: { ...DEFAULT_SETTINGS, minRiser: 10 } };
    expect(splitRisers([padded(28.8)], base(ten)).some((t) => t.part === "riser")).toBe(false);
    expect(splitRisers([padded(31.2)], base(ten)).find((t) => t.part === "riser")?.h).toBe(10);
    const one = { settings: { ...DEFAULT_SETTINGS, minRiser: 1 } };
    // a riser is a part of its own, so it is never lower than the chamfer and a wall's worth (1.2 mm)
    expect(splitRisers([padded(22.2)], base(one)).some((t) => t.part === "riser")).toBe(false);
    expect(splitRisers([padded(22.4)], base(one)).find((t) => t.part === "riser")?.h).toBe(1.2);
  });

  it("prints a low riser solid and a deep one open, as the leftover style allows", () => {
    // an open riser needs a pocket of at least MIN_SPACER (5 mm) above its floor (1.2 mm)
    const low = splitRisers([padded(27.2)], base()).find((t) => t.part === "riser");
    expect(low).toMatchObject({ h: 6, solid: true, compartments: [] });
    const deep = splitRisers([padded(27.4)], base()).find((t) => t.part === "riser");
    expect(deep).toMatchObject({ h: 6.2, solid: false });
    expect(deep?.compartments).toHaveLength(1);
  });

  it("is not blocked by a full-depth spare: the spare is clamped to the shortened tray's floor", () => {
    const tray = padded(60);
    tray.compartments.push({ ...compartment(1.2), kind: "spare", contents: "" });
    const parts = splitRisers([tray], base());
    const out = parts.find((t) => t.part === "tray");
    // The well is 20 mm deep above a 1.2 mm floor: 60 - 21.2 = 38.8 mm moves to the riser.
    expect(parts.find((t) => t.part === "riser")?.h).toBe(38.8);
    expect(out?.h).toBe(21.2);
    expect(out?.z).toBe(38.8);
    expect(out?.compartments).toMatchObject([
      { kind: "well", floorZ: 1.2 },
      { kind: "spare", floorZ: 1.2 },
    ]);
    for (const c of out?.compartments ?? []) {
      expect(c.floorZ).toBeGreaterThanOrEqual(out?.floor ?? Infinity);
    }
  });

  it("leaves a tray of nothing but spares alone", () => {
    const tray = padded(60, {
      compartments: [{ ...compartment(1.2), kind: "spare", contents: "" }],
    });
    expect(splitRisers([tray], base())).toEqual([tray]);
  });

  it("leaves a size-locked tray at its height", () => {
    const locks = [{ kind: "size" as const, trayKey: "a:p0:0", w: 100, d: 60, h: 60 }];
    const parts = splitRisers([padded(60)], base({ locks }));
    expect(parts).toEqual([padded(60)]);
  });

  it("goes under the bottom tray of a stack, so the lips above stay as they are", () => {
    const lower = padded(30, { stack: 1, level: 0, compartments: [compartment(10)], lip: true });
    const upper = padded(50, {
      key: "b:p0:0",
      stack: 1,
      level: 1,
      z: 30,
      x: 2,
      y: 2,
      w: 96,
      d: 56,
      compartments: [compartment(30)],
    });
    const parts = splitRisers([lower, upper], base());
    const [l, u] = ["a:p0:0", "b:p0:0"].map((k) => parts.find((t) => t.key === k));
    const riser = parts.find((t) => t.part === "riser");
    // 8.8 mm from the lower tray, 28.8 from the upper one.
    expect(riser).toMatchObject({ key: "a:p0:0:riser", z: 0, w: 100, d: 60, h: 37.6 });
    expect(l?.z).toBe(37.6);
    expect(u?.z).toBeCloseTo((l?.z ?? 0) + (l?.h ?? 0), 9);
    expect(toU((u?.z ?? 0) + (u?.h ?? 0))).toBe(toU(37.6 + 30 - 8.8 + 50 - 28.8));
    expect(toU(37.6 + (30 - 8.8) + (50 - 28.8))).toBe(toU(80));
    expect(u?.h).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.lip.height + 3);
  });

  describe("a filler standing in a stack level (spec: minimal trays)", () => {
    // 100 × 60 lipped tray padded to 30 (10 mm raised floor), a smaller tray on it padded to 50
    // (30 mm raised floor), and a filler beside the upper tray, from its floor to the stack top.
    const lower = () =>
      padded(30, { stack: 1, level: 0, compartments: [compartment(10)], lip: true });
    const upper = () =>
      padded(50, {
        key: "b:p0:0",
        stack: 1,
        level: 1,
        z: 30,
        x: 2,
        y: 2,
        w: 60,
        d: 56,
        compartments: [{ ...compartment(30), w: 56 }],
      });
    const filler = (o: Partial<TraySpec> = {}) =>
      traySpec({
        key: "leftover:0",
        part: "leftover",
        path: "0",
        stack: 1,
        level: 1,
        x: 62.2,
        y: 2,
        z: 30,
        w: 35.8,
        d: 56,
        h: 50,
        solid: true,
        compartments: [],
        ...o,
      });

    it("moves up with its tray and keeps its top on the stack's top plane", () => {
      const parts = splitRisers([lower(), upper(), filler()], base());
      const u = parts.find((t) => t.key === "b:p0:0");
      const f = parts.find((t) => t.part === "leftover");
      expect(f).toBeDefined();
      expect(f?.z).toBe(u?.z);
      expect(toU((f?.z ?? 0) + (f?.h ?? 0))).toBe(toU(30 + 50));
      expect(toU((u?.z ?? 0) + (u?.h ?? 0))).toBe(toU(30 + 50));
      // x, y, footprint, level and stack are untouched
      expect(f).toMatchObject({ x: 62.2, y: 2, w: 35.8, d: 56, level: 1, stack: 1 });
    });

    it("neither blocks the split nor changes the riser", () => {
      const without = splitRisers([lower(), upper()], base());
      const withFiller = splitRisers([lower(), upper(), filler()], base());
      expect(withFiller.filter((t) => t.part !== "leftover")).toEqual(without);
      expect(withFiller.find((t) => t.part === "riser")?.h).toBe(37.6);
    });

    it("is left alone when nothing is shed, and a walled one keeps its floor", () => {
      const f = filler();
      // a raise of 2 mm is under the 3 mm minimum
      expect(splitRisers([padded(23.2, { stack: 1 }), f], base())).toEqual([
        padded(23.2, { stack: 1 }),
        f,
      ]);
      const walled = filler({
        solid: false,
        compartments: [{ ...compartment(1.2), kind: "spare", contents: "" }],
      });
      const out = splitRisers([lower(), upper(), walled], base()).find(
        (t) => t.part === "leftover",
      );
      expect(out?.compartments[0]?.floorZ).toBe(1.2);
      expect(out?.h).toBe(21.2);
    });

    it("is a bottom-level leftover's neighbour, not a member: a leftover of its own stack stays put", () => {
      const beside = filler({ stack: 9, level: 0, z: 0, h: 80, path: "1" });
      const parts = splitRisers([lower(), upper(), beside], base());
      expect(parts.find((t) => t.stack === 9)).toEqual(beside);
    });
  });

  it("is never taller than the print bed", () => {
    const printer = { ...TEST_PRINTER, bedZ: 25 };
    const riser = splitRisers([padded(60)], base({ printer })).find((t) => t.part === "riser");
    // 38.8 mm of padding, at most 25 mm of riser: the tray keeps the rest as a raised floor.
    expect(riser?.h).toBe(25);
  });

  it("splits nothing with fillToTop off", () => {
    const settings = { ...DEFAULT_SETTINGS, fillToTop: false };
    expect(splitRisers([padded(60)], base({ settings }))).toEqual([padded(60)]);
  });
});

function ctxOf(
  innerHeight: number,
  settings: Partial<LayoutInput["settings"]> = {},
  reqs = [boxReq("a", 100, 60, 20)],
): Ctx {
  return createCtx(makeInput(reqs, { box: { innerHeight }, settings }), fakeMeasure);
}

describe("fillToTop off (spec §3 rule 2)", () => {
  it("leaves every tray at its content height", () => {
    const ctx = ctxOf(60, { fillToTop: false });
    const heights = stackHeights(ctx, stackLevels(ctx, [item(0)]));
    expect(heights.h).toEqual([2120]);
    expect(heights.overflow).toBe(0);
    const on = ctxOf(60);
    expect(stackHeights(on, stackLevels(on, [item(0)])).h).toEqual([6000]);
  });

  it("stacks of several trays are not padded, and a stack too tall still overflows", () => {
    const ctx = ctxOf(60, { fillToTop: false }, [
      boxReq("a", 100, 60, 20),
      boxReq("b", 80, 40, 20),
    ]);
    const h = stackHeights(ctx, stackLevels(ctx, [item(0), item(1)]));
    expect(h.h.reduce((s, v) => s + v, 0)).toBeLessThan(ctx.topPlane);
    expect(h.h[0] ?? 0).toBe(2120);
    const tall = ctxOf(30, { fillToTop: false });
    expect(stackHeights(tall, stackLevels(tall, [item(0)])).overflow).toBe(0);
    const over = ctxOf(15, { fillToTop: false });
    expect(stackHeights(over, stackLevels(over, [item(0)])).overflow).toBe(2120 - 1500);
  });
});

function layoutOf(r: ReturnType<typeof optimize>): StoredLayout {
  if (!r.layout) {
    throw new Error("expected a feasible layout");
  }
  return r.layout;
}

describe("a whole layout with and without fillToTop", () => {
  const reqs = () => [boxReq("a", 60, 50, 20), boxReq("b", 60, 50, 20)];
  const box = { innerWidth: 300, innerDepth: 200, innerHeight: 60 };

  it("stores full-height trays, and prints them as trays on risers adding up to the top", () => {
    const input = makeInput(reqs(), { box });
    const r = optimize(input, 1, 2000);
    const layout = layoutOf(r);
    expect(checkHardRules(input, layout, r.notices)).toEqual([]);
    expect(r.notices.some((n) => n.code === "layout.stopsShort")).toBe(false);
    // The stored layout holds no riser.
    expect(layout.trays.some((t) => t.part === "riser")).toBe(false);
    const parts = splitRisers(layout.trays, input);
    expect(parts.some((t) => t.part === "riser")).toBe(true);
    for (const t of layout.trays.filter((x) => x.part === "tray")) {
      const stack = parts.filter(
        (x) => x.stack === t.stack && (x.part === "tray" || x.part === "riser"),
      );
      expect(toU(stack.reduce((sum, x) => sum + x.h, 0))).toBe(toU(60));
    }
  });

  it("stops short with a note and no riser", () => {
    const input = makeInput(reqs(), { box, settings: { fillToTop: false } });
    const r = optimize(input, 1, 2000);
    const layout = layoutOf(r);
    expect(checkHardRules(input, layout, r.notices)).toEqual([]);
    expect(splitRisers(layout.trays, input).some((t) => t.part === "riser")).toBe(false);
    const heights = layout.trays.filter((t) => t.part === "tray").map((t) => t.h);
    expect(Math.max(...heights)).toBeLessThan(60);
    const note = r.notices.find((n) => n.code === "layout.stopsShort");
    expect(note?.level).toBe("info");
    expect(note?.message).toContain("Fill the box to the top");
  });
});
