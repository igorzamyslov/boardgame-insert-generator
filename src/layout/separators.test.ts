import { describe, expect, it } from "vitest";
import { newComponent } from "../model/defaults";
import { inputsHash } from "../model/hash";
import { noForeign, parseProject } from "../model/schema";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { CardsComponent, Component, Project, StoredLayout, TraySpec } from "../model/types";
import { decodeHash, encodeHash } from "../share/link";
import { size } from "../sizing";
import { MIN_SEPARATOR } from "../sizing/constants";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { splitRisers } from "./risers";
import { SEPARATORS_REDUCED_CODE, splitSeparators } from "./separators";
import { FIXTURES } from "./test-fixtures";
import { traySpec } from "./test-utils";

const cards = (separators?: number, name = "Action"): CardsComponent => {
  const c = newComponent("cards");
  if (c.kind !== "cards") {
    throw new Error("cards");
  }
  return {
    ...c,
    id: "c1",
    name,
    stretch: true,
    ...(separators === undefined ? {} : { separators }),
  };
};

/** A tray with one well holding component c1 and, at its +X end, a stored spacer `length` long. */
function stretched(length: number, o: { rotated?: boolean } = {}): TraySpec[] {
  const tray = traySpec({
    key: "a:p0:0",
    x: 10,
    y: 20,
    w: 100,
    d: 60,
    h: 40,
    rotated: o.rotated ?? false,
    compartments: [
      {
        x: 1.6,
        y: 1.6,
        w: 96.8,
        d: 56.8,
        floorZ: 1.2,
        kind: "well",
        contents: "Action",
        componentId: "c1",
        features: [],
      },
    ],
  });
  const spacer = traySpec({
    key: "a:p0:0:spacer",
    part: "spacer",
    path: "",
    x: o.rotated ? 10 + 1.6 : 10 + 1.6 + 96.8 - length,
    y: o.rotated ? 20 + 1.6 + 56.8 - length : 20 + 1.6,
    z: 1.2,
    w: o.rotated ? 96.8 : length,
    d: o.rotated ? length : 56.8,
    h: 30,
    rotated: o.rotated ?? false,
    solid: true,
    features: [{ type: "spacerNotch", axis: "x", at: 28.4, width: 20, depth: 12 }],
  });
  return [tray, spacer];
}

const run = (trays: TraySpec[], separators?: number, components: Component[] = []) =>
  splitSeparators(trays, {
    components: components.length > 0 ? components : [cards(separators)],
    settings: DEFAULT_SETTINGS,
  });
const spacers = (trays: readonly TraySpec[]) => trays.filter((t) => t.part === "spacer");
const sum = (list: readonly number[]) => Math.round(list.reduce((a, v) => a + v, 0) * 100) / 100;

describe("splitSeparators", () => {
  it("leaves the single spacer exactly as it is by default, and at 1", () => {
    const stored = stretched(24);
    for (const n of [undefined, 1]) {
      const out = run(stored, n);
      expect(out.trays).toEqual(stored);
      expect(out.notices).toEqual([]);
    }
  });

  it("splits it into n plates of equal thickness filling exactly its space", () => {
    const stored = stretched(24);
    const [spacer] = spacers(stored) as [TraySpec];
    const out = run(stored, 4);
    const plates = spacers(out.trays);
    expect(plates.map((p) => p.key)).toEqual([
      "a:p0:0:spacer:1",
      "a:p0:0:spacer:2",
      "a:p0:0:spacer:3",
      "a:p0:0:spacer:4",
    ]);
    expect(plates.map((p) => p.w)).toEqual([6, 6, 6, 6]);
    expect(sum(plates.map((p) => p.w))).toBe(spacer.w);
    expect(plates[0]?.x).toBeCloseTo(spacer.x, 6);
    plates.forEach((p, i) => {
      expect(p.x).toBeCloseTo(spacer.x + 6 * i, 6);
      expect({ ...p, key: "", x: 0, w: 0 }).toEqual({ ...spacer, key: "", x: 0, w: 0 });
    });
    const last = plates.at(-1) as TraySpec;
    expect(Math.round((last.x + last.w) * 100)).toBe(Math.round((spacer.x + spacer.w) * 100));
    expect(out.trays.filter((t) => t.part === "tray")).toEqual(stored.slice(0, 1));
    expect(out.notices).toEqual([]);
  });

  it("shares a thickness that doesn't divide on the 0.01 mm grid, the sum still exact", () => {
    const [spacer] = spacers(stretched(10)) as [TraySpec];
    const plates = spacers(run(stretched(10), 3).trays);
    expect(plates.map((p) => p.w)).toEqual([3.34, 3.33, 3.33]);
    expect(sum(plates.map((p) => p.w))).toBe(spacer.w);
    expect(plates.map((p) => p.x)).toEqual(
      [0, 3.34, 6.67].map((d) => Math.round((spacer.x + d) * 100) / 100),
    );
  });

  it("slices along y when the tray is turned", () => {
    const [spacer] = spacers(stretched(24, { rotated: true })) as [TraySpec];
    const plates = spacers(run(stretched(24, { rotated: true }), 3).trays);
    expect(plates.map((p) => p.d)).toEqual([8, 8, 8]);
    expect(plates.every((p) => p.w === spacer.w && p.x === spacer.x)).toBe(true);
    expect(plates.map((p) => p.y)).toEqual(
      [0, 8, 16].map((d) => Math.round((spacer.y + d) * 100) / 100),
    );
  });

  it("cuts the count back to what fits, with an info notice", () => {
    // 10 mm of slack at 3 mm a plate: 3 plates, not 6.
    const out = run(stretched(10), 6);
    const plates = spacers(out.trays);
    expect(plates).toHaveLength(3);
    expect(plates.every((p) => p.w >= MIN_SEPARATOR)).toBe(true);
    expect(out.notices).toHaveLength(1);
    expect(out.notices[0]).toMatchObject({
      level: "info",
      code: SEPARATORS_REDUCED_CODE,
      path: "/components/0/separators",
    });
    expect(out.notices[0]?.message).toMatch(/asked for 6.*3 fit.*10 mm.*3 mm/);
  });

  it("falls back to the one spacer when not even two plates fit, and says so", () => {
    const stored = stretched(5);
    const out = run(stored, 4);
    expect(out.trays).toEqual(stored);
    expect(out.notices[0]?.message).toMatch(/asked for 4, but only 1 fits/);
  });

  it("never goes below what the bottom chamfer needs, whatever the constant says", () => {
    const settings = { ...DEFAULT_SETTINGS, bottomChamfer: 2 }; // chamfer minimum side 5.6 mm
    const out = splitSeparators(stretched(12), { components: [cards(4)], settings });
    expect(spacers(out.trays).map((p) => p.w)).toEqual([6, 6]);
  });

  it("finds the component by the compartment the spacer stands in, not by the tray key", () => {
    const other = { ...cards(1, "Other"), id: "c0" };
    const out = run(stretched(24), undefined, [other, cards(3)]);
    expect(spacers(out.trays)).toHaveLength(3);
    const reduced = run(stretched(7), undefined, [other, cards(5)]);
    expect(reduced.notices[0]?.path).toBe("/components/1/separators");
  });

  it("keeps a spacer whose compartment names no component (a layout stored before 0.1.2)", () => {
    const stored = stretched(24).map((t) =>
      t.part === "tray"
        ? {
            ...t,
            compartments: t.compartments.map((c) =>
              Object.fromEntries(Object.entries(c).filter(([key]) => key !== "componentId")),
            ) as TraySpec["compartments"],
          }
        : t,
    );
    expect(run(stored, 4).trays).toEqual(stored);
  });

  it("is a pure function of its inputs: the same plates every time", () => {
    expect(run(stretched(24), 5)).toEqual(run(stretched(24), 5));
  });
});

describe("separators and the stored layout", () => {
  // One stretched deck in a box just wider than it: the optimizer stores a spacer of 10.99 mm.
  // (With one plate a longer slack becomes a spare pocket instead, a shorter than 5 mm one
  // thicker walls; with several plates it stays a spacer, see "a roomy box" below.)
  const raw = FIXTURES["cards-heavy"] as unknown as Record<string, unknown> & {
    box: Record<string, unknown>;
    components: Record<string, unknown>[];
  };
  const inBox = (innerWidth: number) =>
    parseProject({
      ...raw,
      box: { ...raw.box, innerWidth, innerDepth: 100, innerHeight: 120 },
      components: [
        {
          ...(raw.components[0] as Record<string, unknown>),
          decks: [{ name: "Action", count: 40 }],
          storage: "upright-long",
        },
      ],
    });
  const projectIn = (innerWidth: number): Project => {
    const parsed = inBox(innerWidth);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return parsed.project;
  };
  const project = projectIn(33.5);
  const withSeparators = (n: number): Project => ({
    ...project,
    components: project.components.map((c) => ({ ...c, separators: n })),
  });

  // A count above 1 decides between a spacer and a spare pocket (realizeTray), which is the stored
  // layout, so editing it must make the plan stale.
  it("is part of the inputs hash, so editing it stales the layout", () => {
    expect(inputsHash(withSeparators(6))).not.toBe(inputsHash(project));
    expect(inputsHash(withSeparators(6))).not.toBe(inputsHash(withSeparators(2)));
    expect(inputsHash(withSeparators(6))).toBe(inputsHash(withSeparators(6)));
  });

  const stored = (p: Project): StoredLayout => {
    const { requirements } = size(p.components, p.settings);
    const { layout } = optimize(
      {
        requirements,
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
    if (!layout) {
      throw new Error("no layout");
    }
    return layout;
  };
  const along = (t: TraySpec) => (t.rotated ? t.d : t.w);
  const printed = (p: Project, layout: StoredLayout) =>
    splitSeparators(
      splitRisers(layout.trays, { settings: p.settings, printer: p.printer, locks: p.locks }),
      { components: p.components, settings: p.settings },
    );

  it("stores one spacer however many plates are asked for, and prints what fits", () => {
    // Nothing but the hash differs: the tight box has a spacer, not a spare, either way.
    const base = stored(project);
    const [one] = spacers(base.trays) as [TraySpec];
    expect(spacers(base.trays)).toHaveLength(1);
    expect(along(one)).toBe(10.99);
    // 10.99 mm holds three plates of at least 3 mm
    for (const [asked, got] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [10, 3],
    ] as const) {
      const p = withSeparators(asked);
      const layout = stored(p);
      expect(layout.inputsHash).toBe(inputsHash(p));
      expect({ ...layout, inputsHash: base.inputsHash }).toEqual(base);
      expect(JSON.stringify({ ...layout, inputsHash: base.inputsHash })).toBe(JSON.stringify(base));
      const out = printed(p, layout);
      const plates = spacers(out.trays);
      expect(plates).toHaveLength(got);
      expect(sum(plates.map(along))).toBe(along(one));
      expect(out.notices).toHaveLength(asked > got ? 1 : 0);
    }
  });

  it("derives the same plates after a store and reload through a share link", () => {
    const p = { ...withSeparators(3), layout: stored(withSeparators(3)) };
    const direct = printed(p, p.layout);
    const back = decodeHash(encodeHash(p, noForeign()));
    if (!back.ok || !back.project.layout) {
      throw new Error("round trip failed");
    }
    expect(printed(back.project, back.project.layout)).toEqual(direct);
    expect(spacers(direct.trays)).toHaveLength(3);
    expect(spacers(p.layout.trays)).toHaveLength(1);
  });

  describe("a roomy box", () => {
    // 63 mm for a 40-card deck: with one plate the slack becomes a spare pocket, with several the
    // same slack is a spacer, which is then split into plates.
    const roomy = projectIn(63);
    const roomyWith = (n: number): Project => ({
      ...roomy,
      components: roomy.components.map((c) => ({ ...c, separators: n })),
    });
    const kinds = (layout: StoredLayout) =>
      layout.trays.flatMap((t) => (t.part === "tray" ? t.compartments.map((c) => c.kind) : []));

    it("makes one spacer block with one plate, and no spare pocket", () => {
      const p = roomyWith(1);
      const layout = stored(p);
      expect(kinds(layout)).not.toContain("spare");
      expect(spacers(layout.trays)).toHaveLength(1);
      expect(spacers(printed(p, layout).trays)).toHaveLength(1);
    });

    it("turns the slack into plates with several, and no spare pocket", () => {
      const p = roomyWith(5);
      const layout = stored(p);
      expect(kinds(layout)).not.toContain("spare");
      expect(spacers(layout.trays)).toHaveLength(1);
      const out = printed(p, layout);
      expect(spacers(out.trays)).toHaveLength(5);
      expect(out.notices).toHaveLength(0);
    });
  });
});
