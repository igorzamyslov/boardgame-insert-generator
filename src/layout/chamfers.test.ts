// @vitest-environment node
// src/layout/chamfers.test.ts
// Top chamfers (geometry 0.9.8, DESIGN §7 "lifting trays"): a print-time pass that cuts a 45°
// chamfer along the top edge of each solid filler where it touches a tray, so a fingertip reaches
// the tray beside it. Derived from the printed parts, never stored.
import { describe, expect, it } from "vitest";
import {
  CHAMFER_LAND_MM,
  CHAMFER_MIN_MM,
  CHAMFER_MM,
  CHAMFER_PINCH_MAX_MM,
  edgeTopOf,
  topChamfersOf,
} from "../model/top-chamfer";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import { loadSeed } from "../test-support/harbourKings";
import { addTopChamfers, chamfersFacingTrays } from "./chamfers";
import { mergeParts } from "./merge";
import { printableParts } from "./printable";
import { TEST_PRINTER, traySpec } from "./test-utils";
import { roundMm } from "./units";

const S: Settings = DEFAULT_SETTINGS;
const GAP = S.trayGap;

const tray = (o: Partial<TraySpec> = {}): TraySpec =>
  traySpec({ key: "t", part: "tray", x: 0, y: 0, z: 0, w: 60, d: 60, h: 30, ...o });
const filler = (o: Partial<TraySpec> = {}): TraySpec =>
  traySpec({
    key: "leftover:0",
    part: "leftover",
    path: "",
    stack: 9,
    solid: true,
    x: 60 + GAP,
    y: 0,
    z: 0,
    w: 40,
    d: 60,
    h: 30,
    ...o,
  });
const chamfersOf = (parts: readonly TraySpec[], key: string) =>
  topChamfersOf(parts.find((p) => p.key === key) as TraySpec).map((c) => c.chamfer);

describe("where a chamfer goes", () => {
  it("runs along the top edge of a filler against a tray, over the tray's side", () => {
    const out = addTopChamfers([tray(), filler()], { settings: S });
    expect(chamfersOf(out, "leftover:0")).toEqual([
      { type: "topChamfer", side: "left", from: 0, to: 60, size: CHAMFER_MM },
    ]);
    // the tray and the stored fields of the filler are untouched
    expect(out[0]).toEqual(tray());
    expect(out[1]).toMatchObject({ x: filler().x, w: 40, h: 30, solid: true });
  });

  it("runs the face's whole top edge, however little of it the tray's side shares", () => {
    // the filler is 60 mm long and the tray only 20 mm of it, at one end (owner, 2026-10-24: "if
    // spacer has any component on one of its sides, the edge of this side should be chamfered")
    const out = addTopChamfers([tray({ d: 20 }), filler()], { settings: S });
    expect(chamfersOf(out, "leftover:0")).toEqual([
      { type: "topChamfer", side: "left", from: 0, to: 60, size: CHAMFER_MM },
    ]);
    // the tray in the middle of a longer filler: still end to end, no square stubs either side
    const mid = addTopChamfers([tray({ y: 50, d: 20 }), filler({ d: 120 })], { settings: S });
    expect(chamfersOf(mid, "leftover:0")).toEqual([
      { type: "topChamfer", side: "left", from: 0, to: 120, size: CHAMFER_MM },
    ]);
    // a tray that shares under CHAMFER_MIN_CONTACT_MM of the face is no reason for one
    const edge = addTopChamfers([tray({ d: 85 }), filler({ y: 80, d: 40 })], { settings: S });
    expect(chamfersOf(edge, "leftover:0")).toEqual([]);
  });

  it("stops at the filler's own ends, not at the tray's", () => {
    // the filler is shorter than the tray and stands at its far end
    const out = addTopChamfers([tray({ d: 120 }), filler({ y: 80, d: 40 })], { settings: S });
    expect(chamfersOf(out, "leftover:0")).toEqual([
      { type: "topChamfer", side: "left", from: 0, to: 40, size: CHAMFER_MM },
    ]);
  });

  it("is on a tray's side only: a filler beside the box wall or beside nothing has none", () => {
    expect(topChamfersOf(addTopChamfers([filler()], { settings: S })[0] as TraySpec)).toEqual([]);
    const far = addTopChamfers([tray(), filler({ x: 62 })], { settings: S });
    expect(chamfersOf(far, "leftover:0")).toEqual([]);
  });

  it("leaves a face square when no tray stands against it, even on a filler with a chamfer", () => {
    // a tray on the left: the right, front and back faces have none against them
    const out = addTopChamfers([tray(), filler({ w: 40, d: 60 })], { settings: S });
    expect(chamfersOf(out, "leftover:0").map((c) => c.side)).toEqual(["left"]);
    // a tray only at the left end of the front face does not chamfer the back
    const front = addTopChamfers(
      [tray({ key: "a", x: 0, y: 60 + GAP, w: 30, d: 60 }), filler({ x: 0, y: 0, w: 80, d: 60 })],
      { settings: S },
    );
    expect(chamfersOf(front, "leftover:0")).toEqual([
      { type: "topChamfer", side: "back", from: 0, to: 80, size: CHAMFER_MM },
    ]);
  });

  it("is on the face that touches a tray, whichever of the four it is", () => {
    const side = (parts: TraySpec[]) =>
      chamfersOf(addTopChamfers(parts, { settings: S }), "leftover:0").map((c) => c.side);
    expect(
      side([tray({ key: "a", x: 60, y: 60 + GAP }), filler({ x: 60, y: 0, w: 60, d: 60 })]),
    ).toEqual(["back"]);
    expect(
      side([tray({ key: "a", x: 60, y: 0 }), filler({ x: 60, y: 60 + GAP, w: 60, d: 60 })]),
    ).toEqual(["front"]);
    expect(
      side([tray({ key: "a", x: 60 + GAP, y: 0 }), filler({ x: 0, y: 0, w: 60, d: 60 })]),
    ).toEqual(["right"]);
  });

  it("is on every face that touches a tray, one chamfer along each, never a stretch per tray", () => {
    const out = addTopChamfers(
      [tray({ key: "a", d: 20 }), tray({ key: "b", y: 40, d: 20 }), filler({ w: 80 })],
      { settings: S },
    );
    expect(chamfersOf(out, "leftover:0").map(({ side, from, to }) => [side, from, to])).toEqual([
      ["left", 0, 60],
    ]);
    // a tray on the left and one at the back: two chamfered faces
    const two = addTopChamfers(
      [tray({ key: "a", d: 20 }), tray({ key: "b", x: 70, y: 60 + GAP, d: 30 }), filler({ w: 80 })],
      { settings: S },
    );
    expect(chamfersOf(two, "leftover:0").map(({ side, from, to }) => [side, from, to])).toEqual([
      ["back", 0, 80],
      ["left", 0, 60],
    ]);
  });

  it("meets at a corner without a stub: both chamfers run to the filler's ends", () => {
    const parts = [
      tray({ key: "a", d: 30 }),
      tray({ key: "b", x: 70, y: 60 + GAP, w: 40, d: 40 }),
      filler({ w: 80 }),
    ];
    const chamfers = chamfersOf(addTopChamfers(parts, { settings: S }), "leftover:0");
    expect(chamfers.map((c) => [c.side, c.from, c.to, c.size])).toEqual([
      ["back", 0, 80, CHAMFER_MM],
      ["left", 0, 60, CHAMFER_MM],
    ]);
  });

  it("is not cut where the tray stands too low to reach into the groove at all", () => {
    const beside = (h: number) =>
      chamfersOf(addTopChamfers([tray({ h }), filler({ h: 70 })], { settings: S }), "leftover:0");
    expect(beside(68)).toHaveLength(1);
    expect(beside(66)).toHaveLength(1);
    expect(beside(64)).toEqual([]);
    expect(beside(12)).toEqual([]);
  });

  it("is cut, but offered as no grip, where the tray's wall stands under CHAMFER_MIN_GRIP_MM in it", () => {
    // 70 mm filler, 68 mm tray: 3 mm into the 5 mm groove is a grip; a 66 mm tray's 1 mm is not
    // (a spacer a little taller than the stack beside it looks like its neighbours)
    const lift = (h: number) => {
      const parts = addTopChamfers([tray({ h }), filler({ h: 70 })], { settings: S });
      return chamfersFacingTrays(parts, { settings: S }).get("t") ?? [];
    };
    expect(lift(68)).toHaveLength(1);
    expect(lift(66)).toEqual([]);
  });
});

describe("one size for every chamfer of a layout", () => {
  const layout = (d: number): TraySpec[] => [
    tray({ w: 60, d: 60 }),
    filler({ key: "leftover:0" }),
    // a second filler, a strip `d` thick across the way, beside a tray of its own
    tray({ key: "u", x: 200, y: 0, w: 60, d: 60 }),
    filler({ key: "leftover:1", x: 200 + 60 + GAP, y: 0, w: d, d: 60 }),
  ];
  const sizes = (parts: readonly TraySpec[]) =>
    ["leftover:0", "leftover:1"].map((k) => chamfersOf(parts, k).map((c) => c.size));

  it("is CHAMFER_MM when every filler can take it", () => {
    expect(sizes(addTopChamfers(layout(40), { settings: S }))).toEqual([
      [CHAMFER_MM],
      [CHAMFER_MM],
    ]);
  });

  it("is the smallest any filler can take, on all of them, never one square beside one cut", () => {
    // a 4.72 mm strip: 4.72 less CHAMFER_LAND_MM is 3.12, and it is what every filler gets
    const out = addTopChamfers(layout(4.72), { settings: S });
    expect(sizes(out)).toEqual([[3.12], [3.12]]);
  });

  it("leaves a filler square that cannot take CHAMFER_MIN_MM, without shrinking the others", () => {
    const out = addTopChamfers(layout(4), { settings: S });
    expect(sizes(out)).toEqual([[CHAMFER_MM], []]);
  });
});

describe("a strip a finger and thumb can pinch", () => {
  const beside = (w: number, far: TraySpec[] = []) =>
    chamfersOf(addTopChamfers([tray(), filler({ w }), ...far], { settings: S }), "leftover:0");

  it("is chamfered along both long edges when one has a tray beside it", () => {
    // the far face stands against nothing: the box wall, or another filler
    expect(beside(10).map((c) => [c.side, c.from, c.to, c.size])).toEqual([
      ["left", 0, 60, 4.2],
      ["right", 0, 60, 4.2],
    ]);
  });

  it("is chamfered along the whole of both long edges, however short the tray beside it", () => {
    const short = chamfersOf(
      addTopChamfers([tray({ d: 20 }), filler({ w: 10 })], { settings: S }),
      "leftover:0",
    );
    expect(short.map((c) => [c.side, c.from, c.to])).toEqual([
      ["left", 0, 60],
      ["right", 0, 60],
    ]);
  });

  it("is chamfered on the tray's face only once it is a thick filler", () => {
    expect(beside(CHAMFER_PINCH_MAX_MM - 0.01).map((c) => c.side)).toEqual(["left", "right"]);
    expect(beside(CHAMFER_PINCH_MAX_MM).map((c) => c.side)).toEqual(["left"]);
    expect(beside(40).map((c) => c.side)).toEqual(["left"]);
  });

  it("is chamfered on the one face when two would be under CHAMFER_MIN_MM", () => {
    expect(beside(7.4).map((c) => [c.side, c.size])).toEqual([["left", 5]]);
  });
});

describe("a strip thinner than two chamfers", () => {
  const strip = (w: number) => {
    const a = tray({ key: "a", x: 0 });
    const b = tray({ key: "b", x: 60 + GAP + w + GAP });
    return chamfersOf(addTopChamfers([a, b, filler({ w })], { settings: S }), "leftover:0");
  };

  it("chamfers both long edges, each no more than the top leaves room for", () => {
    const wide = strip(18);
    expect(wide.map((c) => [c.side, c.size])).toEqual([
      ["left", CHAMFER_MM],
      ["right", CHAMFER_MM],
    ]);
    // 10 mm across: 1.6 mm of flat top, 4.2 mm each
    expect(strip(10).map((c) => c.size)).toEqual([4.2, 4.2]);
    expect(strip(8).map((c) => c.size)).toEqual([3.2, 3.2]);
  });

  it("never leaves the top under CHAMFER_LAND_MM, whatever the strip", () => {
    for (const w of [5, 6, 7.4, 7.88, 8, 9, 10, 11, 12, 14]) {
      const cs = strip(w);
      const left = Math.max(0, ...cs.filter((c) => c.side === "left").map((c) => c.size));
      const right = Math.max(0, ...cs.filter((c) => c.side === "right").map((c) => c.size));
      expect(w - left - right, `${w} mm`).toBeGreaterThanOrEqual(CHAMFER_LAND_MM - 1e-9);
    }
  });

  it("takes the one longer edge when two would be under CHAMFER_MIN_MM", () => {
    // 6 mm across: two chamfers of 2.2 mm are no grip; one of 4.4 mm is
    const cs = strip(6);
    expect(cs).toHaveLength(1);
    expect(cs[0]?.size).toBe(4.4);
    expect(cs[0]?.size).toBeGreaterThanOrEqual(CHAMFER_MIN_MM);
  });

  it("is left whole when no chamfer reaches CHAMFER_MIN_MM", () => {
    expect(strip(CHAMFER_MIN_MM + CHAMFER_LAND_MM - 0.5)).toEqual([]);
    expect(strip(4)).toEqual([]);
  });
});

describe("what never gets a chamfer", () => {
  it("a tray, a riser, a spacer, and an open spare tray", () => {
    const parts = [
      tray(),
      filler({ key: "riser", part: "riser" }),
      filler({ key: "spare", solid: false, y: 60 + GAP + 60 + GAP, x: 0, w: 60, d: 60 }),
      filler({ key: "spacer", part: "spacer", y: 130, w: 40 }),
    ];
    expect(addTopChamfers(parts, { settings: S }).flatMap((p) => topChamfersOf(p))).toEqual([]);
  });

  it("a merged part that prints upside down: its top is the bed face", () => {
    const a = filler({ key: "leftover:0", x: 60 + GAP, w: 40 });
    const b = filler({ key: "leftover:1", x: 60 + GAP, y: 60 + GAP, w: 40, stack: 8 });
    const flipped = {
      ...a,
      key: "merged:0",
      merged: { members: [a, b], bridges: [], flipped: true },
    };
    const out = addTopChamfers([tray(), flipped], { settings: S });
    expect(out[1]).toBe(flipped);
  });
});

describe("a filler in an upper stack level", () => {
  const upper = (h: number): TraySpec[] => [
    tray({ z: 22.6, h, level: 1, stack: 0 }),
    filler({ z: 22.6, h, level: 1, stack: 0 }),
  ];

  it("keeps MIN_FEATURE_MM of wall above the groove (rim), and none when that leaves under 3 mm", () => {
    const top = edgeTopOf(S, 1);
    expect(top).toBeCloseTo(2.85, 2);
    // 7.4 mm high: 7.4 - 2.85 - 0.8 = 3.75 mm of room
    const [c] = chamfersOf(addTopChamfers(upper(7.4), { settings: S }), "leftover:0");
    expect(c?.size).toBe(3.75);
    expect(7.4 - (c?.size ?? 0) - top).toBeGreaterThanOrEqual(MIN_FEATURE_MM - 1e-9);
    expect(chamfersOf(addTopChamfers(upper(6), { settings: S }), "leftover:0")).toEqual([]);
  });

  it("keeps it above the step with the stepped base", () => {
    const step: Settings = { ...S, lip: { ...S.lip, joint: "step" as const } };
    expect(edgeTopOf(step, 1)).toBeCloseTo(1.6, 2);
    expect(chamfersOf(addTopChamfers(upper(6), { settings: step }), "leftover:0")[0]?.size).toBe(
      3.6,
    );
    expect(chamfersOf(addTopChamfers(upper(5), { settings: step }), "leftover:0")).toEqual([]);
  });
});

describe("a merged part", () => {
  const NO_LIP: Settings = { ...S, lip: { ...S.lip, joint: "off" as const } };

  it("carries the chamfer on the member it is cut in, in the member's own frame", () => {
    const strip = filler({ key: "leftover:0", x: 60 + GAP, y: 0, w: 40, d: 60 });
    const next = filler({ key: "leftover:1", x: 60 + GAP, y: 60 + GAP, w: 40, d: 60, stack: 8 });
    const joined = mergeParts([tray(), strip, next], { settings: NO_LIP, printer: TEST_PRINTER });
    const part = addTopChamfers(joined, { settings: NO_LIP }).find((p) => p.merged) as TraySpec;
    const found = topChamfersOf(part);
    expect(found.length).toBeGreaterThan(0);
    for (const { part: member, chamfer } of found) {
      expect(member.part).toBe("leftover");
      expect(chamfer.side).toBe("left");
      // the bridge to the next strip reaches 3 mm into this one, so the chamfer stops short of it
      expect([chamfer.from, chamfer.to]).toEqual([0, 57]);
    }
    // the strip behind touches no tray
    expect(found.map((f) => f.part.key)).toEqual(["leftover:0"]);
    // only the members have it: the merged part's own features stay as they were
    expect(part.features).toBeUndefined();
  });

  it("is never cut where a bridge sits: the strip the bridge joins keeps that face whole", () => {
    const a = filler({ key: "leftover:0", x: 60 + GAP, y: 0, w: 10, d: 60 });
    const b = filler({ key: "leftover:1", x: 60 + GAP + 10 + GAP, y: 0, w: 40, d: 60, stack: 8 });
    const joined = mergeParts([tray(), a, b], { settings: NO_LIP, printer: TEST_PRINTER });
    expect((joined.find((p) => p.merged) as TraySpec).merged?.bridges.length).toBeGreaterThan(0);
    const placed = addTopChamfers(joined, { settings: NO_LIP }).find((p) => p.merged) as TraySpec;
    for (const { part: member, chamfer } of topChamfersOf(placed)) {
      // the face toward the other member is the bridge's: no chamfer there
      expect(member.key === "leftover:0" ? chamfer.side : "left").not.toBe("right");
    }
    // the thin strip is chamfered on its tray's face alone
    const own = topChamfersOf(placed).filter((c) => c.part.key === "leftover:0");
    expect(own.map((c) => c.chamfer.side)).toEqual(["left"]);
  });
});

describe("a merged part, whole member by member", () => {
  const NO_LIP: Settings = { ...S, lip: { ...S.lip, joint: "off" as const } };
  const BRIDGE_IN = 3; // how far a bridge reaches into each member (merge.ts)
  const strips = (): TraySpec[] => [
    filler({ key: "leftover:0", x: 60 + GAP, y: 0, w: 40, d: 60 }),
    filler({ key: "leftover:1", x: 60 + GAP, y: 60 + GAP, w: 40, d: 60, stack: 8 }),
  ];
  const placed = (trays: TraySpec[]): TraySpec => {
    const joined = mergeParts(trays, { settings: NO_LIP, printer: TEST_PRINTER });
    return addTopChamfers(joined, { settings: NO_LIP }).find((p) => p.merged) as TraySpec;
  };
  const of = (part: TraySpec, key: string) =>
    topChamfersOf(part)
      .filter((c) => c.part.key === key)
      .map(({ chamfer }) => [chamfer.side, chamfer.from, chamfer.to]);

  it("chamfers the whole member's edge when a tray is against only part of it", () => {
    // a tray along the first 20 mm of the first strip; the second strip has nothing beside it
    const part = placed([tray({ d: 20 }), ...strips()]);
    expect(part.merged?.bridges.length).toBeGreaterThan(0);
    // the member's whole face, less the 3 mm the bridge to the next member would fill
    expect(of(part, "leftover:0")).toEqual([["left", 0, 60 - BRIDGE_IN]]);
    expect(of(part, "leftover:1")).toEqual([]);
  });

  it("chamfers each member that has a tray beside it, and never into the bridge between them", () => {
    const part = placed([
      tray({ key: "a", d: 60 }),
      tray({ key: "b", y: 60 + GAP, d: 30 }),
      ...strips(),
    ]);
    expect(of(part, "leftover:0")).toEqual([["left", 0, 60 - BRIDGE_IN]]);
    expect(of(part, "leftover:1")).toEqual([["left", BRIDGE_IN, 60]]);
  });

  it("leaves the face of a member that no tray stands against square", () => {
    // the tray is beside the first strip only; the second keeps its left face square
    const part = placed([tray({ d: 60 }), ...strips()]);
    expect(of(part, "leftover:1")).toEqual([]);
  });
});

describe("derived, never stored", () => {
  it("running the pass twice gives the same parts as running it once", () => {
    const once = addTopChamfers([tray(), filler()], { settings: S });
    expect(addTopChamfers(once, { settings: S })).toEqual(once);
  });

  it("does not change the trays it is given", () => {
    const parts = [tray(), filler()];
    const before = JSON.stringify(parts);
    addTopChamfers(parts, { settings: S });
    expect(JSON.stringify(parts)).toBe(before);
  });
});

describe("chamfersFacingTrays", () => {
  it("names the tray a chamfer opens on, and the part that has it", () => {
    const out = addTopChamfers([tray(), filler()], { settings: S });
    const facing = chamfersFacingTrays(out, { settings: S });
    expect(facing.get("t")?.map((f) => [f.by.key, f.side])).toEqual([["leftover:0", "right"]]);
    expect(facing.has("leftover:0")).toBe(false);
  });
});

describe("chamfersFacingTrays on a chamfer that runs past a tray", () => {
  it("names a tray the chamfer faces over at least CHAMFER_MIN_CONTACT_MM, and no other", () => {
    // the long chamfer is there for tray a; tray c shares 5 mm of it, too little to grip it by
    const parts = addTopChamfers(
      [
        tray({ key: "a", d: 40 }),
        tray({ key: "c", y: 55, d: 25 }),
        filler({ d: 60, h: 30 }),
        tray({ key: "far", x: 200 }),
      ],
      { settings: S },
    );
    expect(chamfersOf(parts, "leftover:0")).toHaveLength(1);
    const facing = chamfersFacingTrays(parts, { settings: S });
    expect([...facing.keys()]).toEqual(["a"]);
  });
});

describe("the Harbour Kings seed", () => {
  const { project } = loadSeed("harbour-kings", true);
  const stored = project.layout?.trays ?? [];
  const printed = printableParts(stored, {
    components: project.components,
    settings: project.settings,
    printer: project.printer,
    locks: project.locks,
  }).trays;

  it("chamfers the strips beside Events, Starter and Market, on both faces of a thin strip", () => {
    const events = chamfersOf(printed, "leftover:3");
    const long = chamfersOf(printed, "leftover:1");
    expect(events.length).toBeGreaterThan(0);
    expect(long.length).toBeGreaterThan(0);
    for (const c of events) {
      expect(c.size).toBeGreaterThanOrEqual(CHAMFER_MIN_MM);
    }
  });

  it("reaches Events and Starter, and the trays on the strips' other faces", () => {
    const facing = chamfersFacingTrays(printed, { settings: project.settings });
    expect(facing.get("events01:p0:0")?.map((f) => f.by.key)).toContain("leftover:3");
    expect(facing.get("starter1:p0:0")?.map((f) => f.by.key)).toContain("leftover:1");
  });

  it("leaves the stored layout as it was: no chamfer is stored", () => {
    expect(JSON.stringify(stored)).not.toContain("topChamfer");
    expect(JSON.stringify(project)).not.toContain("topChamfer");
  });
});

describe("a chamfer never cuts into a neighbouring tray", () => {
  const SEEDS = [
    "harbour-kings",
    "harbour-kings-headroom",
    "harbour-kings-long",
    "harbour-kings-wide",
    "harbour-kings-kit",
    "harbour-kings-flat",
    "star-realms",
  ];

  it.each(SEEDS)("%s", (name) => {
    const { project } = loadSeed(name);
    const o = {
      components: project.components,
      settings: project.settings,
      printer: project.printer,
      locks: project.locks,
    };
    const stored = project.layout?.trays ?? [];
    const without = printableParts(stored, o).trays;
    for (const part of without) {
      for (const { part: member, chamfer } of topChamfersOf(part)) {
        const along = chamfer.side === "front" || chamfer.side === "back" ? member.w : member.d;
        expect(chamfer.from).toBeGreaterThanOrEqual(-1e-6);
        expect(chamfer.to).toBeLessThanOrEqual(along + 1e-6);
        expect(chamfer.to - chamfer.from).toBeGreaterThan(0);
        expect(chamfer.size).toBeLessThanOrEqual(member.h + 1e-9);
        expect(chamfer.size).toBeGreaterThanOrEqual(CHAMFER_MIN_MM - 1e-9);
        expect(member.h - chamfer.size).toBeGreaterThanOrEqual(
          edgeTopOf(project.settings, member.level ?? 0) + MIN_FEATURE_MM - 1e-9,
        );
      }
    }
    expect(JSON.stringify(stored)).not.toContain("topChamfer");
    expect(addTopChamfers(without, o)).toEqual(without);
  });

  it.each(SEEDS)("%s: a chamfer on a plain filler runs the face end to end", (name) => {
    const { project } = loadSeed(name);
    const parts = printableParts(project.layout?.trays ?? [], {
      components: project.components,
      settings: project.settings,
      printer: project.printer,
      locks: project.locks,
    }).trays;
    for (const part of parts.filter((p) => p.merged === undefined)) {
      for (const { chamfer } of topChamfersOf(part)) {
        const along = chamfer.side === "front" || chamfer.side === "back" ? part.w : part.d;
        expect([part.key, chamfer.side, chamfer.from, chamfer.to]).toEqual([
          part.key,
          chamfer.side,
          0,
          roundMm(along),
        ]);
      }
    }
  });
});
