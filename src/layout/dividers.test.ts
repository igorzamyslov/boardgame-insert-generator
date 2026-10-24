import { describe, expect, it } from "vitest";
import { inputsHash } from "../model/hash";
import { noForeign, parseProject } from "../model/schema";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Project, StoredLayout, TraySpec } from "../model/types";
import { decodeHash } from "../share/link";
import { encodeHash } from "../test-support/link";
import { size } from "../sizing";
import { DIVIDER_END_PLAY, DIVIDER_GROOVE, SPACER_TOP_GAP } from "../sizing/constants";
import { splitDividers } from "./dividers";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { printableParts } from "./printable";
import { splitRisers } from "./risers";
import { summarize } from "./summarize";
import { FIXTURES } from "./test-fixtures";
import { traySpec } from "./test-utils";

interface Slot {
  type: "dividerSlot";
  axis: "x" | "y";
  at: number;
  width: number;
  depth: number;
}
const dividersOf = (trays: readonly TraySpec[]) => trays.filter((t) => t.part === "divider");

/** A tray 100 × 60 × 40 at (10, 20, 5) with one well, its floor 4 mm thick, holding `slots`. */
const tray = (slots: Slot[], over: Partial<TraySpec> = {}): TraySpec =>
  traySpec({
    key: "a:p0:0",
    x: 10,
    y: 20,
    z: 5,
    w: 100,
    d: 60,
    h: 40,
    compartments: [
      {
        x: 1.6,
        y: 1.6,
        w: 96.8,
        d: 56.8,
        floorZ: 4,
        kind: "well",
        contents: "Action",
        componentId: "c1",
        features: slots,
      },
    ],
    ...over,
  });
const slot = (at: number, over: Partial<Slot> = {}): Slot => ({
  type: "dividerSlot",
  axis: "y",
  at,
  width: 3.4,
  depth: 2,
  ...over,
});

describe("splitDividers", () => {
  it("returns a tray with no slots, and everything that is not a tray, as it is", () => {
    const plain = tray([]);
    const spacer = traySpec({ key: "a:p0:0:spacer", part: "spacer", w: 10, d: 10, h: 10 });
    const filler = traySpec({ key: "leftover:0", part: "leftover", w: 10, d: 10, h: 10 });
    expect(splitDividers([plain, spacer, filler])).toEqual([plain, spacer, filler]);
  });

  it("makes one divider per slot, after its tray, keyed from 1 in order along the well", () => {
    const stored = tray([slot(67), slot(34), slot(100 - 1.6 - 5)]);
    const out = splitDividers([stored]);
    expect(out[0]).toBe(stored);
    expect(dividersOf(out).map((d) => d.key)).toEqual([
      "a:p0:0:divider:1",
      "a:p0:0:divider:2",
      "a:p0:0:divider:3",
    ]);
    // numbered from the front/left, whatever order the slots were stored in
    expect(dividersOf(out).map((d) => d.x)).toEqual([
      10 + 34 - 1.5,
      10 + 67 - 1.5,
      10 + 93.4 - 1.5,
    ]);
  });

  it("makes a plate that fits its slot and stands in it", () => {
    const [, d] = splitDividers([tray([slot(34)])]) as [TraySpec, TraySpec];
    expect(d).toMatchObject({ part: "divider", solid: true, compartments: [], rotated: false });
    // as wide as the slot less its play, DIVIDER_END_PLAY short of the walls at each end
    expect(d.w).toBe(3);
    expect(d.d).toBeCloseTo(56.8 - 2 * DIVIDER_END_PLAY, 9);
    expect(d.y).toBeCloseTo(20 + 1.6 + DIVIDER_END_PLAY, 9);
    // from the bottom of the slot (the floor less the slot's depth) up to SPACER_TOP_GAP under the rim
    expect(d.z).toBe(5 + 4 - DIVIDER_GROOVE);
    expect(d.z + d.h).toBeCloseTo(5 + 40 - SPACER_TOP_GAP, 9);
    // centred on its slot
    expect(d.x + d.w / 2).toBeCloseTo(10 + 34, 9);
    expect([d.stack, d.level]).toEqual([0, 0]);
  });

  it("takes a tray's stack and level, and its position as printed after the riser split", () => {
    const [, d] = splitDividers([tray([slot(34)], { stack: 2, level: 1 })]) as [TraySpec, TraySpec];
    expect([d.stack, d.level]).toEqual([2, 1]);
  });

  it("makes a plate across the well's width for a slot along x (a turned tray)", () => {
    const [, d] = splitDividers([tray([slot(30, { axis: "x" })], { rotated: true })]) as [
      TraySpec,
      TraySpec,
    ];
    expect(d.w).toBeCloseTo(96.8 - 2 * DIVIDER_END_PLAY, 9);
    expect(d.d).toBe(3);
    expect(d.x).toBeCloseTo(10 + 1.6 + DIVIDER_END_PLAY, 9);
    expect(d.y + d.d / 2).toBeCloseTo(20 + 30, 9);
  });

  it("numbers over the compartments of a tray in order", () => {
    const stored = tray([slot(20)]);
    const second = { ...(stored.compartments[0] as TraySpec["compartments"][number]) };
    const two = {
      ...stored,
      compartments: [
        stored.compartments[0] as (typeof stored.compartments)[number],
        { ...second, features: [slot(60), slot(80)] },
      ],
    };
    expect(dividersOf(splitDividers([two])).map((d) => d.key)).toEqual([
      "a:p0:0:divider:1",
      "a:p0:0:divider:2",
      "a:p0:0:divider:3",
    ]);
  });
});

describe("dividers and the riser split", () => {
  const settings = DEFAULT_SETTINGS;
  const printer = { bedX: 256, bedY: 256, bedZ: 256, bedMargin: 5, layerHeight: 0.2 };

  it("never lets a riser take the floor the slots are cut into", () => {
    // A tray whose floor is raised to 14: a riser may take what is above floor + slot depth.
    const raised = tray([slot(34)], { z: 0 });
    const stored = {
      ...raised,
      compartments: raised.compartments.map((c) => ({ ...c, floorZ: 14 })),
    };
    const out = splitRisers([stored], { settings, printer, locks: [] });
    const printed = out.find((t) => t.part === "tray") as TraySpec;
    const floor = printed.compartments[0]?.floorZ ?? 0;
    expect(floor).toBeGreaterThanOrEqual(settings.floor + DIVIDER_GROOVE - 0.01);
    const [, d] = splitDividers([printed]) as [TraySpec, TraySpec];
    // the slot's bottom is still over the bed by the floor's own thickness
    expect(d.z - printed.z).toBeGreaterThanOrEqual(settings.floor - 0.01);
  });
});

describe("dividers in a real layout", () => {
  const raw = FIXTURES["cards-heavy"] as unknown as Record<string, unknown> & {
    box: Record<string, unknown>;
    components: Record<string, unknown>[];
  };
  const projectWith = (dividers: number, innerWidth = 150): Project => {
    const parsed = parseProject({
      ...raw,
      box: { ...raw.box, innerWidth, innerDepth: 110, innerHeight: 120 },
      components: [
        {
          ...(raw.components[0] as Record<string, unknown>),
          decks: [{ name: "Action", count: 60 }],
          storage: "upright-long",
          room: "max",
          ...(dividers > 0 ? { dividers } : {}),
        },
      ],
    });
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return parsed.project;
  };
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
  const printed = (p: Project, layout: StoredLayout) =>
    printableParts(layout.trays, {
      components: p.components,
      settings: p.settings,
      printer: p.printer,
      locks: p.locks,
    });
  const slotsIn = (layout: StoredLayout) =>
    layout.trays.flatMap((t) =>
      t.compartments.flatMap((c) => c.features.filter((f) => f.type === "dividerSlot")),
    );

  it("is part of the inputs hash, so editing it stales the layout", () => {
    expect(inputsHash(projectWith(2))).not.toBe(inputsHash(projectWith(0)));
    expect(inputsHash(projectWith(2))).not.toBe(inputsHash(projectWith(3)));
    expect(inputsHash(projectWith(2))).toBe(inputsHash(projectWith(2)));
  });

  it("stores the slots in the tray and prints N dividers, none of them stored", () => {
    for (const n of [1, 2, 4]) {
      const p = projectWith(n);
      const layout = stored(p);
      expect(slotsIn(layout)).toHaveLength(n);
      expect(dividersOf(layout.trays)).toEqual([]);
      const out = printed(p, layout);
      expect(dividersOf(out.trays)).toHaveLength(n);
      // no spacer: with dividers the well has none
      expect(layout.trays.filter((t) => t.part === "spacer")).toEqual([]);
    }
  });

  it("stores nothing for a project without them: the layout is the one it was", () => {
    const layout = stored(projectWith(0));
    expect(slotsIn(layout)).toEqual([]);
    expect(dividersOf(printed(projectWith(0), layout).trays)).toEqual([]);
  });

  it("counts the dividers' plastic in the filament, and not in the fill", () => {
    const p = projectWith(3);
    const layout = stored(p);
    const withPlates = summarize(layout.trays, p);
    const without = summarize(
      layout.trays.map((t) => ({
        ...t,
        compartments: t.compartments.map((c) => ({
          ...c,
          features: c.features.filter((f) => f.type !== "dividerSlot"),
        })),
      })),
      p,
    );
    expect(withPlates.filamentG).toBeGreaterThan(without.filamentG);
    expect(withPlates.fillPct).toBe(without.fillPct);
    expect(withPlates.trayCount).toBe(without.trayCount);
  });

  it("derives the same dividers after a store and reload through a share link", () => {
    const p = { ...projectWith(3), layout: stored(projectWith(3)) };
    const direct = printed(p, p.layout);
    const back = decodeHash(encodeHash(p, noForeign()));
    if (!back.ok || !back.project.layout) {
      throw new Error("round trip failed");
    }
    expect(back.project.layout).toEqual(p.layout);
    expect(back.project.components[0]?.dividers).toBe(3);
    expect(printed(back.project, back.project.layout)).toEqual(direct);
    expect(dividersOf(direct.trays)).toHaveLength(3);
  });

  it("keeps the link for the plates nearly free: only the slots are stored", () => {
    // Same slots count in the two layouts' trays but 2 and 6 dividers printed: the link grows by
    // the extra slots (a few characters each), never by a part each.
    const link = (n: number): number => {
      const p = projectWith(n);
      return encodeHash({ ...p, layout: stored(p) }, noForeign()).length;
    };
    expect(link(6) - link(2)).toBeLessThan(60);
  });
});
