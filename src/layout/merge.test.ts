import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Printer, Settings, TraySpec } from "../model/types";
import { fitsBed } from "./bed";
import { mergeParts, MIN_JOIN_MM, slitFills } from "./merge";
import { TEST_PRINTER, traySpec } from "./test-utils";
import { toU, toUFloor } from "./units";

const WALL = 1.6;
const FLOOR = 1.2;
const GAP = DEFAULT_SETTINGS.trayGap;

// Without the rim between layers unless a test asks for it: with it on, a filler in a stack level
// has a groove and stays a part of its own (the rim tests below pass `lip` themselves).
const settings = (o: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  lip: { ...DEFAULT_SETTINGS.lip, enabled: false },
  ...o,
});
const inputs = (s: Partial<Settings> = {}, printer: Printer = TEST_PRINTER) => ({
  settings: settings(s),
  printer,
});

/** A filler: a solid block from the floor to the top plane (35 mm), as the layout stores it. */
const filler = (o: Partial<TraySpec> = {}): TraySpec =>
  traySpec({
    key: "leftover:0",
    part: "leftover",
    path: "0",
    stack: 5,
    h: 35,
    wall: WALL,
    floor: FLOOR,
    solid: true,
    ...o,
  });

/** An open spare: the same block as a walled box with a floor, as a large filler is. */
const spare = (o: Partial<TraySpec> = {}): TraySpec => {
  const f = filler(o);
  return {
    ...f,
    solid: false,
    compartments: [
      {
        x: WALL,
        y: WALL,
        w: f.w - 2 * WALL,
        d: f.d - 2 * WALL,
        floorZ: FLOOR,
        kind: "spare",
        contents: "",
        features: [],
      },
    ],
  };
};

/** A riser under a stack, as splitRisers makes it: the tray's footprint, from the floor up. */
const riser = (o: Partial<TraySpec> = {}): TraySpec => ({
  ...spare({ key: "a:p0:0:riser", part: "riser", path: "", stack: 0, w: 90, d: 60, h: 16.4 }),
  ...o,
});

const tray = (o: Partial<TraySpec> = {}): TraySpec =>
  traySpec({ key: "a:p0:0", stack: 0, w: 90, d: 60, h: 8, z: 16.4, ...o });

const merged = (parts: TraySpec[]): TraySpec[] => parts.filter((p) => p.merged !== undefined);

describe("mergeParts: two co-planar strips", () => {
  // The same strip in two leaves of the tree: same x and width, separated by the tray gap.
  const a = filler({ key: "leftover:0", x: 90.2, y: 0, w: 10, d: 100 });
  const b = filler({ key: "leftover:1", x: 90.2, y: 100 + GAP, w: 10, d: 80, stack: 6 });

  it("are one part, which takes in the tray gap between them", () => {
    const out = mergeParts([a, b], inputs());
    expect(out).toHaveLength(1);
    const part = out[0] as TraySpec;
    expect(part).toMatchObject({
      key: "merged:0",
      part: "leftover",
      x: 90.2,
      y: 0,
      z: 0,
      w: 10,
      d: 180.2,
      h: 35,
      solid: true,
      compartments: [],
    });
    expect(part.merged?.members.map((m) => m.key)).toEqual(["leftover:0", "leftover:1"]);
    expect(part.merged?.flipped).toBe(false);
    // one bridge, filling the gap over the strips' whole common length
    expect(part.merged?.bridges).toHaveLength(1);
    const bridge = part.merged?.bridges[0];
    expect(bridge?.y).toBeLessThanOrEqual(100);
    expect((bridge?.y ?? 0) + (bridge?.d ?? 0)).toBeGreaterThanOrEqual(100 + GAP);
    expect(bridge?.h).toBe(35);
  });

  it("stay two with mergeFillers off, and the list is returned as it is", () => {
    const parts = [a, b];
    const out = mergeParts(parts, inputs({ mergeFillers: false }));
    expect(out).toEqual(parts);
    expect(out).not.toBe(parts);
  });

  it("keep the order of everything else, and the merged part takes its first member's place", () => {
    const t = tray();
    const other = traySpec({ key: "z:p0:0", stack: 9, x: 0, y: 200, w: 40, d: 40 });
    const out = mergeParts([t, a, other, b], inputs());
    expect(out.map((p) => p.key)).toEqual(["a:p0:0", "merged:0", "z:p0:0"]);
  });

  it("is derived: merging a merged list changes nothing, and the input is not touched", () => {
    const parts = [a, b];
    const snapshot = structuredClone(parts);
    const once = mergeParts(parts, inputs());
    expect(parts).toEqual(snapshot);
    expect(mergeParts(once, inputs())).toEqual(once);
  });
});

describe("mergeParts: what is not connected stays apart", () => {
  const a = filler({ key: "leftover:0", x: 0, y: 0, w: 10, d: 50 });

  it("two strips with more than the tray gap between them (a tray stands there)", () => {
    const b = filler({ key: "leftover:1", x: 0, y: 50 + GAP + 5, w: 10, d: 50 });
    expect(mergeParts([a, b], inputs())).toEqual([a, b]);
  });

  it("two strips that only meet at a corner", () => {
    const b = filler({ key: "leftover:1", x: 10 + GAP, y: 50 + GAP, w: 10, d: 50 });
    expect(mergeParts([a, b], inputs())).toEqual([a, b]);
  });

  it("two strips that share less than MIN_JOIN_MM of an edge", () => {
    const b = filler({
      key: "leftover:1",
      x: 10 + GAP,
      y: 50 - (MIN_JOIN_MM - 0.5),
      w: 10,
      d: 50,
    });
    expect(mergeParts([a, b], inputs())).toEqual([a, b]);
    const enough = { ...b, y: 50 - MIN_JOIN_MM };
    expect(merged(mergeParts([a, enough], inputs()))).toHaveLength(1);
  });

  it("a filler and a part that is not one (a tray stands between two strips)", () => {
    const middle = traySpec({ key: "t", x: 0, y: 50 + GAP, w: 10, d: 30 });
    const c = filler({ key: "leftover:2", x: 0, y: 50 + 2 * GAP + 30, w: 10, d: 50 });
    expect(mergeParts([a, middle, c], inputs())).toEqual([a, middle, c]);
  });

  it("touching strips of one leaf (no gap at all) are connected", () => {
    const b = filler({ key: "leftover:1", x: 10, y: 0, w: 20, d: 50 });
    expect(merged(mergeParts([a, b], inputs()))).toHaveLength(1);
  });
});

describe("mergeParts: the print bed", () => {
  // Usable bed: 256 − 2 · 5 = 246 mm either way round.
  const strip = (n: number, d: number, y: number): TraySpec =>
    filler({ key: `leftover:${n}`, x: 0, y, w: 10, d, stack: n });

  it("a merge that is longer than the bed splits into as many parts as it needs", () => {
    // 100 + gap + 100 + gap + 100 = 300.4 mm along Y: two strips fit, three do not.
    const parts = [strip(0, 100, 0), strip(1, 100, 100 + GAP), strip(2, 100, 200 + 2 * GAP)];
    const out = mergeParts(parts, inputs());
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.merged?.members.length ?? 1).sort()).toEqual([1, 2]);
    const bed = {
      w: toUFloor(TEST_PRINTER.bedX - 2 * TEST_PRINTER.bedMargin),
      d: toUFloor(TEST_PRINTER.bedY - 2 * TEST_PRINTER.bedMargin),
      z: toUFloor(TEST_PRINTER.bedZ),
    };
    for (const p of out) {
      expect(fitsBed(bed, toU(p.w), toU(p.d), toU(p.h))).toBe(true);
    }
  });

  it("a long strip is never merged beyond the bed, whatever it touches", () => {
    const small = { ...TEST_PRINTER, bedX: 120, bedY: 120 };
    // 100 mm usable: 60 + gap + 60 does not fit
    const out = mergeParts([strip(0, 60, 0), strip(1, 60, 60 + GAP)], inputs({}, small));
    expect(out).toHaveLength(2);
    expect(merged(out)).toHaveLength(0);
  });

  it("fits a part the bed holds turned: 200 × 20 on a 240 × 100 bed", () => {
    const wide = { ...TEST_PRINTER, bedX: 250, bedY: 110 };
    const a = filler({ key: "leftover:0", x: 0, y: 0, w: 150, d: 20 });
    const b = filler({ key: "leftover:1", x: 150 + GAP, y: 0, w: 50, d: 20 });
    // 200.2 × 20 against a 240 × 100 bed: fits as it is
    expect(merged(mergeParts([a, b], inputs({}, wide)))).toHaveLength(1);
    // against 100 × 240 it fits turned
    const tall = { ...TEST_PRINTER, bedX: 110, bedY: 250 };
    expect(merged(mergeParts([a, b], inputs({}, tall)))).toHaveLength(1);
  });

  it("a part taller than the bed cannot be merged (the layout's own rule already holds each one)", () => {
    const low = { ...TEST_PRINTER, bedZ: 30 };
    const a = filler({ key: "leftover:0", x: 0, y: 0, w: 10, d: 50, h: 25 });
    const b = filler({ key: "leftover:1", x: 10 + GAP, y: 0, w: 10, d: 50, h: 25 });
    expect(merged(mergeParts([a, b], inputs({}, low)))).toHaveLength(1);
    expect(merged(mergeParts([a, b], inputs({}, { ...TEST_PRINTER, bedZ: 20 })))).toHaveLength(0);
  });

  it("counts the lip a riser carries: a part is as tall as its lip stands (the riser's rim between layers)", () => {
    const lip = { ...DEFAULT_SETTINGS.lip, enabled: true };
    const a = riser({ key: "a:p0:0:riser", lip: true, x: 0, y: 0, w: 40, d: 60, h: 28 });
    const b = riser({ key: "b:p0:0:riser", lip: true, x: 40 + GAP, y: 0, w: 40, d: 60, h: 28 });
    const low = { ...TEST_PRINTER, bedZ: 29 };
    // 28 mm tall, 30 with the 2 mm lip: the part does not fit a 29 mm bed, nor does either riser alone
    expect(merged(mergeParts([a, b], inputs({ mergeRisers: true, lip }, low)))).toHaveLength(0);
    const fits = { ...TEST_PRINTER, bedZ: 30 };
    expect(merged(mergeParts([a, b], inputs({ mergeRisers: true, lip }, fits)))).toHaveLength(1);
    // a plain riser has no lip to count
    const plain = [a, b].map((r) => ({ ...r, lip: false }));
    expect(merged(mergeParts(plain, inputs({ mergeRisers: true, lip }, low)))).toHaveLength(1);
  });

  it("splits a comb (a spine with two teeth) into two parts, a half each, never one over the bed", () => {
    // The spine is 120.2 mm long, the bed 70: each half takes a tooth.
    const bed = { ...TEST_PRINTER, bedX: 80, bedY: 80 }; // 70 usable
    const spineA = filler({ key: "leftover:0", x: 60, y: 0, w: 10, d: 60 });
    const spineB = filler({ key: "leftover:1", x: 60, y: 60 + GAP, w: 10, d: 60 });
    const toothA = filler({ key: "leftover:2", x: 0, y: 20, w: 60 - GAP, d: 10 });
    const toothB = filler({ key: "leftover:3", x: 0, y: 90, w: 60 - GAP, d: 10 });
    const out = mergeParts([spineA, spineB, toothA, toothB], inputs({}, bed));
    expect(out).toHaveLength(2);
  });
});

describe("mergeParts: risers, with mergeRisers (an L in elevation)", () => {
  // A stack of 90 × 60 on a riser 16.4 mm high, with a full-height filler beside it.
  const r = riser();
  const f = filler({ key: "leftover:0", x: 90 + GAP, y: 0, w: 10, d: 60 });
  const t = tray();

  it("stay as they are while mergeRisers is off", () => {
    const parts = [t, r, f];
    expect(mergeParts(parts, inputs({ mergeRisers: false }))).toEqual(parts);
  });

  it("fold into the filler beside them: a low shelf with a full-height wall alongside", () => {
    const out = mergeParts([t, r, f], inputs({ mergeRisers: true }));
    expect(out.map((p) => p.key)).toEqual(["a:p0:0", "merged:0"]);
    const part = out[1] as TraySpec;
    expect(part.part).toBe("leftover");
    expect(part.merged?.members.map((m) => m.key)).toEqual(["a:p0:0:riser", "leftover:0"]);
    // the L: the riser is 16.4 high, the wall beside it 35
    expect(part.merged?.members.map((m) => m.h)).toEqual([16.4, 35]);
    expect([part.x, part.y, part.z, part.w, part.d, part.h]).toEqual([0, 0, 0, 100.2, 60, 35]);
    // both stand on the floor, so it prints as it stands
    expect(part.merged?.flipped).toBe(false);
    // the bridge between them is as high as the riser: that is all they share
    expect(part.merged?.bridges[0]?.h).toBe(16.4);
    // open riser and solid filler: the part is not solid
    expect(part.solid).toBe(false);
  });

  it("needs mergeFillers on", () => {
    const parts = [t, r, f];
    expect(mergeParts(parts, inputs({ mergeFillers: false, mergeRisers: true }))).toEqual(parts);
  });

  it("leaves a riser with no filler beside it alone", () => {
    const far = filler({ key: "leftover:0", x: 200, y: 0, w: 10, d: 60 });
    expect(mergeParts([t, r, far], inputs({ mergeRisers: true }))).toEqual([t, r, far]);
  });

  it("does not fold a riser into a part standing on a different floor", () => {
    const ledge = filler({
      key: "leftover:1",
      x: 90 + GAP,
      y: 60 + GAP,
      w: 10,
      d: 20,
      z: 28.4,
      h: 6.6,
      level: 1,
    });
    const ground = filler({ key: "leftover:0", x: 90 + GAP, y: 0, w: 10, d: 60 });
    // the riser is open, so the ground filler and the ledge cannot be printed together with it
    const out = mergeParts([t, r, ground, ledge], inputs({ mergeRisers: true }));
    for (const p of merged(out)) {
      const hasRiser = p.merged?.members.some((m) => m.part === "riser");
      expect(hasRiser && p.merged?.flipped).toBe(false);
    }
  });
});

describe("mergeParts: a filler in a stack level (it stands from the level's floor to the top)", () => {
  // The ground filler stands from 0 to 35; the level-1 filler beside the upper tray from 28.4 to
  // 35, over the tray below. Their tops are level.
  const ground = filler({ key: "leftover:0", x: 0, y: 8.4 + GAP, w: 90, d: 8 });
  const ledge = filler({
    key: "leftover:1",
    x: 0,
    y: 0,
    w: 90,
    d: 8.4,
    z: 28.4,
    h: 6.6,
    level: 1,
    stack: 0,
  });

  it("joins a ground filler when both are solid with level tops, and prints upside down", () => {
    const out = mergeParts([ground, ledge], inputs());
    expect(out).toHaveLength(1);
    const part = out[0] as TraySpec;
    expect(part.merged?.flipped).toBe(true);
    expect(part.merged?.members.map((m) => [m.z, m.h])).toEqual([
      [0, 35],
      [28.4, 6.6],
    ]);
    expect([part.z, part.h]).toEqual([0, 35]);
    // the bridge is as tall as what they share: the ledge
    expect(part.merged?.bridges[0]).toMatchObject({ z: 28.4, h: 6.6 });
  });

  it("does not join when the ledge is an open tray (its pocket would face the bed)", () => {
    expect(merged(mergeParts([ground, spare({ ...ledge })], inputs()))).toHaveLength(0);
  });

  it("does not join when the ground filler is open", () => {
    expect(merged(mergeParts([spare({ ...ground }), ledge], inputs()))).toHaveLength(0);
  });

  it("does not join when the tops are not level (a stack that stops short of the top plane)", () => {
    const short = { ...ledge, h: 5 };
    expect(merged(mergeParts([ground, short], inputs()))).toHaveLength(0);
  });

  it("with the lip on, a filler in a stack level stays a part of its own: it has a groove for the lip", () => {
    // Its groove runs along its outer edge, over the lip of the tray below, so a bridge to a part
    // beside it would reach over the lip. The same two fillers merge with the lip off (above).
    const lipOn = { lip: { ...DEFAULT_SETTINGS.lip, enabled: true } };
    expect(mergeParts([ground, ledge], inputs(lipOn))).toHaveLength(2);
    const a = filler({ key: "leftover:1", x: 0, y: 0, w: 5, d: 40, z: 28.4, h: 6.6, level: 1 });
    const b = filler({
      key: "leftover:2",
      x: 5 + GAP,
      y: 0,
      w: 40,
      d: 10,
      z: 28.4,
      h: 6.6,
      level: 1,
    });
    expect(merged(mergeParts([a, b], inputs(lipOn)))).toHaveLength(0);
    // fillers on the floor are not affected: nothing under them has a lip
    const g1 = filler({ key: "leftover:3", x: 0, y: 0, w: 10, d: 40 });
    const g2 = filler({ key: "leftover:4", x: 10 + GAP, y: 0, w: 40, d: 10 });
    expect(merged(mergeParts([g1, g2], inputs(lipOn)))).toHaveLength(1);
  });

  it("two fillers of one level, on the same floor, merge as any two (and stand as they are)", () => {
    const a = filler({ key: "leftover:1", x: 0, y: 0, w: 5, d: 40, z: 28.4, h: 6.6, level: 1 });
    const b = filler({
      key: "leftover:2",
      x: 5 + GAP,
      y: 0,
      w: 40,
      d: 10,
      z: 28.4,
      h: 6.6,
      level: 1,
    });
    const out = mergeParts([a, b], inputs());
    expect(merged(out)).toHaveLength(1);
    expect(merged(out)[0]?.merged?.flipped).toBe(false);
    expect(merged(out)[0]).toMatchObject({ level: 1, z: 28.4, h: 6.6 });
  });
});

describe("mergeParts: the star realms comb", () => {
  // The §6 worked example (101 × 195 box, 91.45 stacks, 0.14 mm gaps), as fillers: two edge
  // strips that are one strip, a cross strip between the stacks and an end strip, plus the two
  // fillers beside the upper trays. The bed is 170 mm, so the 194.3 mm strip needs two parts.
  const printer = { ...TEST_PRINTER, bedX: 180, bedY: 180, bedZ: 180 };
  const gap = 0.14;
  const parts = [
    filler({ key: "leftover:0", x: 91.59, y: 0, w: 8.71, d: 100.12, stack: 2 }),
    filler({ key: "leftover:1", x: 0, y: 91.59, w: 91.45, d: 8.53, stack: 3 }),
    filler({ key: "leftover:2", x: 91.59, y: 100.12 + gap, w: 8.71, d: 94.04, stack: 4 }),
    filler({ key: "leftover:3", x: 0, y: 191.85, w: 91.45, d: 2.45, stack: 5 }),
    filler({ key: "leftover:4", x: 0, y: 87.09, w: 91.45, d: 4.36, z: 28.4, h: 6.6, level: 1 }),
    filler({ key: "leftover:5", x: 0, y: 187.35, w: 91.45, d: 4.36, z: 24.4, h: 10.6, level: 1 }),
  ];

  it("six fillers print as two parts", () => {
    const out = mergeParts(parts, inputs({ trayGap: gap }, printer));
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.merged?.members.map((m) => m.key))).toEqual([
      ["leftover:0", "leftover:1", "leftover:4"],
      ["leftover:2", "leftover:3", "leftover:5"],
    ]);
    expect(out.every((p) => p.merged?.flipped === true)).toBe(true);
  });
});

describe("mergeParts: the slit where members meet at a corner", () => {
  const corner = (cH = 35): TraySpec[] => [
    filler({ key: "leftover:0", x: 0, y: 20 + GAP, w: 30, d: 30 }),
    filler({ key: "leftover:1", x: 30 + GAP, y: 20 + GAP, w: 30, d: 30 }),
    filler({ key: "leftover:2", x: 0, y: 0, w: 60 + GAP, d: 20, h: cH }),
  ];

  it("three members: the bridges get a fill for the gap x gap square between them", () => {
    const merged = mergeParts(corner(), inputs()).find((t) => t.merged) as TraySpec;
    const fill = merged.merged?.bridges.find(
      (b) => Math.abs(b.w - GAP) < 1e-6 && Math.abs(b.d - GAP) < 1e-6,
    );
    expect(fill).toEqual({ x: 30, y: 20, z: 0, w: GAP, d: GAP, h: 35 });
  });

  it("the lower member across them: the fill is as high as the lower one", () => {
    const merged = mergeParts(corner(12), inputs()).find((t) => t.merged) as TraySpec;
    const fill = merged.merged?.bridges.find(
      (b) => Math.abs(b.w - GAP) < 1e-6 && Math.abs(b.d - GAP) < 1e-6,
    );
    expect(fill).toMatchObject({ x: 30, y: 20, z: 0, h: 12 });
  });

  it("two members side by side: nothing to fill", () => {
    const parts = [
      filler({ key: "leftover:0", x: 0, y: 0, w: 30, d: 30 }),
      filler({ key: "leftover:1", x: 30 + GAP, y: 0, w: 30, d: 30 }),
    ];
    const merged = mergeParts(parts, inputs()).find((t) => t.merged) as TraySpec;
    expect(merged.merged?.bridges).toHaveLength(1);
  });

  it("slitFills leaves air wider than the gap alone (the place of a tray)", () => {
    const box = (x: number, y: number, w: number, d: number) => ({ x, y, z: 0, w, d, h: 10 });
    const ring = [box(0, 0, 50, 5), box(50, 0, 5, 50), box(5, 50, 50, 5), box(0, 5, 5, 50)];
    expect(slitFills(ring, [], GAP)).toEqual([]);
    // a slit between two blocks closed at both ends by a third and fourth
    const slit = [box(0, 0, 10, 10), box(10 + GAP, 0, 10, 10), box(0, 10, 20 + GAP, 5)];
    expect(slitFills(slit, [], GAP)).toEqual([]); // open at the front: not enclosed
    const closed = [...slit, box(0, -5, 20 + GAP, 5)];
    expect(slitFills(closed, [], GAP)).toEqual([{ x: 10, y: 0, z: 0, w: GAP, d: 10, h: 10 }]);
  });
});
