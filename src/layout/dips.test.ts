// @vitest-environment node
// src/layout/dips.test.ts
// Finger dips (geometry 0.9.4, DESIGN §7 "lifting trays"): a print-time pass that cuts a U from the
// top of each solid filler where it touches a tray, so the tray beside it can be gripped. Derived
// from the printed parts, never stored.
import { describe, expect, it } from "vitest";
import {
  DIPS_PER_TRAY_SIDE,
  DIP_MAX_DEPTH_MM,
  dipBox,
  dipMargin,
  edgeTopOf,
  fingerDipsOf,
} from "../model/finger-dip";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import { loadSeed } from "../test-support/harbourKings";
import { addFingerDips, dipsFacingTrays, traysOpenedBy } from "./dips";
import { mergeParts } from "./merge";
import { printableParts } from "./printable";
import { TEST_PRINTER, traySpec } from "./test-utils";

const S: Settings = DEFAULT_SETTINGS;
const WIDTH = S.fingerPocket.width;
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
const dipsOf = (parts: readonly TraySpec[], key: string) =>
  fingerDipsOf(parts.find((p) => p.key === key) as TraySpec).map((d) => d.dip);

describe("where a dip goes", () => {
  it("is cut from the top of a filler against a tray, centred on the tray's side", () => {
    const out = addFingerDips([tray(), filler()], { settings: S });
    expect(dipsOf(out, "leftover:0")).toEqual([
      { type: "fingerDip", side: "left", at: 30, width: WIDTH, depth: 15 },
    ]);
    // the tray and the stored fields of the filler are untouched
    expect(out[0]).toEqual(tray());
    expect(out[1]).toMatchObject({ x: filler().x, w: 40, h: 30, solid: true });
  });

  it("is about half the filler's height, never over DIP_MAX_DEPTH_MM", () => {
    const tall = addFingerDips([tray({ h: 70 }), filler({ h: 70 })], { settings: S });
    expect(dipsOf(tall, "leftover:0")[0]?.depth).toBe(DIP_MAX_DEPTH_MM);
    const low = addFingerDips([tray({ h: 12 }), filler({ h: 12 })], { settings: S });
    expect(dipsOf(low, "leftover:0")[0]?.depth).toBe(6);
  });

  it("goes no deeper than the tray it faces", () => {
    // a tray 9 mm high on a riser, beside a filler 70 mm high that stands to the same top
    const out = addFingerDips([tray({ z: 61, h: 9 }), filler({ h: 70 })], { settings: S });
    expect(dipsOf(out, "leftover:0")[0]?.depth).toBe(9);
  });

  it("is on a tray's side only: a filler beside the box wall or beside nothing has none", () => {
    expect(fingerDipsOf(addFingerDips([filler()], { settings: S })[0] as TraySpec)).toEqual([]);
    // a tray that is not touching (two millimetres off)
    const far = addFingerDips([tray(), filler({ x: 62 })], { settings: S });
    expect(dipsOf(far, "leftover:0")).toEqual([]);
  });

  it("takes the nearest place with room when the tray's middle is too near the filler's end", () => {
    // the filler is shorter than the tray, standing at its far end: its middle is not the tray's
    const out = addFingerDips([tray({ d: 120 }), filler({ y: 80, d: 40 })], { settings: S });
    const [dip] = dipsOf(out, "leftover:0");
    expect(dip?.side).toBe("left");
    const margin = dipMargin(S);
    // 25 mm wide with `margin` kept from the filler's ends: the nearest centre to y = 60 is 80 + …
    expect(dip?.at).toBeCloseTo(margin + WIDTH / 2, 1);
  });

  it("keeps the dip off a filler too short to hold one", () => {
    const short = 2 * dipMargin(S) + WIDTH - 0.5;
    const out = addFingerDips([tray(), filler({ d: short })], { settings: S });
    expect(dipsOf(out, "leftover:0")).toEqual([]);
  });

  it("runs 15 mm into a thick filler, ending in a post of its own", () => {
    const out = addFingerDips([tray(), filler({ w: 40 })], { settings: S });
    const [dip] = dipsOf(out, "leftover:0");
    const box = dipBox(dip as NonNullable<typeof dip>, { w: 40, d: 60 });
    expect(box).toMatchObject({ x0: 0, x1: 15, through: false });
  });

  it("is on the face that touches a tray, whichever of the four it is", () => {
    const cross = [
      tray({ key: "a", x: 60, y: 60 + GAP, w: 60, d: 60 }),
      filler({ x: 60, y: 0, w: 60, d: 60 }),
    ];
    expect(dipsOf(addFingerDips(cross, { settings: S }), "leftover:0")[0]?.side).toBe("back");
    const behind = [
      tray({ key: "a", x: 60, y: 0, w: 60, d: 60 }),
      filler({ x: 60, y: 60 + GAP, w: 60, d: 60 }),
    ];
    expect(dipsOf(addFingerDips(behind, { settings: S }), "leftover:0")[0]?.side).toBe("front");
    const right = [
      tray({ key: "a", x: 60 + GAP, y: 0, w: 60, d: 60 }),
      filler({ x: 0, y: 0, w: 60, d: 60 }),
    ];
    expect(dipsOf(addFingerDips(right, { settings: S }), "leftover:0")[0]?.side).toBe("right");
  });
});

describe("a strip thinner than a finger", () => {
  const scene = (d: number): TraySpec[] => [
    tray({ key: "front", x: 0, y: 0, w: 80, d: 60 }),
    filler({ x: 0, y: 60 + GAP, w: 80, d }),
    tray({ key: "back", x: 0, y: 60 + GAP + d + GAP, w: 80, d: 60 }),
  ];

  it("is cut across, open on both faces, and serves the tray on each", () => {
    const out = addFingerDips(scene(9.6), { settings: S });
    const [dip] = dipsOf(out, "leftover:0");
    expect(dip).toBeDefined();
    expect(dipBox(dip as NonNullable<typeof dip>, { w: 80, d: 9.6 })).toMatchObject({
      through: true,
      y0: 0,
      y1: 9.6,
    });
    const facing = dipsFacingTrays(out, { settings: S });
    expect(facing.get("front")?.map((f) => f.side)).toEqual(["back"]);
    expect(facing.get("back")?.map((f) => f.side)).toEqual(["front"]);
  });

  it("is one dip, not one on each face", () => {
    const out = addFingerDips(scene(9.6), { settings: S });
    expect(dipsOf(out, "leftover:0")).toHaveLength(1);
  });

  it("is left whole under DIP_MIN_STRIP_MM, where no finger goes in", () => {
    expect(dipsOf(addFingerDips(scene(5.5), { settings: S }), "leftover:0")).toEqual([]);
    expect(dipsOf(addFingerDips(scene(6.5), { settings: S }), "leftover:0")).toHaveLength(1);
  });

  it("is cut across up to a finger and a post (18 mm), run in 15 mm from there", () => {
    expect(dipBox({ side: "front", at: 40, width: WIDTH }, { w: 80, d: 17.9 }).through).toBe(true);
    expect(dipBox({ side: "front", at: 40, width: WIDTH }, { w: 80, d: 18 })).toMatchObject({
      through: false,
      y1: 15,
    });
  });
});

describe("the tray's own cuts", () => {
  const cutTray = (at: number): TraySpec =>
    tray({
      compartments: [
        {
          x: 1.6,
          y: 1.6,
          w: 56.8,
          d: 56.8,
          floorZ: 1.2,
          kind: "well",
          contents: "",
          features: [
            { type: "wallCutout", side: "right", at, width: WIDTH, depth: 20, floorNotch: 0 },
          ],
        },
      ],
    });

  it("stays clear of a cut that leaves through the tray's wall, where there is room", () => {
    // the filler runs on past the tray: a clear place is on the tray's side, beyond the cut
    const out = addFingerDips([cutTray(30), filler({ d: 100 })], { settings: S });
    const [dip] = dipsOf(out, "leftover:0");
    expect(dip).toBeDefined();
    expect((dip?.at ?? 0) - WIDTH / 2).toBeGreaterThanOrEqual(30 + WIDTH / 2 - 0.02);
  });

  it("faces the cut when the filler seals all of it (the dip opens it to the finger)", () => {
    const out = addFingerDips([cutTray(30), filler()], { settings: S });
    expect(dipsOf(out, "leftover:0")[0]?.at).toBe(30);
  });

  it("does not take a cut that only runs into the next compartment for one through the wall", () => {
    const t = cutTray(30);
    const second = {
      x: 1.6,
      y: 1.6,
      w: 56.8,
      d: 56.8,
      floorZ: 1.2,
      kind: "well" as const,
      contents: "",
      features: [],
    };
    // a well in the way across the cut: it stops there, and the wall to the filler is whole
    const split = {
      ...t,
      compartments: [
        { ...second, w: 20, features: t.compartments[0]?.features ?? [] },
        { ...second, x: 30, w: 28.4 },
      ],
    };
    const out = addFingerDips([split, filler({ d: 100 })], { settings: S });
    expect(dipsOf(out, "leftover:0")[0]?.at).toBe(30);
  });
});

describe("at most two dips on a tray's side", () => {
  it("keeps the two best placed, and leaves the third filler whole", () => {
    const big = tray({ d: 130 });
    const parts = [
      big,
      filler({ key: "leftover:0", y: 0, d: 40 }),
      filler({ key: "leftover:1", y: 40 + GAP, d: 40 }),
      filler({ key: "leftover:2", y: 80 + 2 * GAP, d: 40 }),
    ];
    const out = addFingerDips(parts, { settings: S });
    const count = ["leftover:0", "leftover:1", "leftover:2"].reduce(
      (n, k) => n + dipsOf(out, k).length,
      0,
    );
    expect(DIPS_PER_TRAY_SIDE).toBe(2);
    expect(count).toBe(2);
    expect(dipsFacingTrays(out, { settings: S }).get("t")).toHaveLength(2);
  });
});

describe("a dip cut across a strip counts on every side it serves", () => {
  // Tray T has two thick fillers beside its right side, each with a dip, and a thin strip beyond
  // them with a third place for one. The strip's dip is cut across: it would reach T's side a
  // third time (and the tray U on the strip's far face), so it is left out. Counting it only on
  // the side that still had room put three dips on T.
  const scene = (): TraySpec[] => [
    tray({ key: "t", w: 60, d: 100 }),
    filler({ key: "leftover:0", y: 0, d: 40 }),
    filler({ key: "leftover:1", y: 40 + GAP, d: 40 }),
    // 5 mm past the second filler, so it touches T and U only, and only 15 mm of each (the
    // fillers' dips face 25 mm of T, so they are placed first)
    filler({ key: "leftover:2", y: 85, d: 34.6, w: 10 }),
    tray({ key: "u", x: 60 + GAP + 10 + GAP, y: 85, d: 15, w: 60 }),
  ];

  it("never puts a third dip on a side of a tray", () => {
    const out = addFingerDips(scene(), { settings: S });
    const facing = dipsFacingTrays(out, { settings: S });
    for (const [, list] of facing) {
      for (const side of ["front", "back", "left", "right"]) {
        expect(list.filter((f) => f.side === side).length).toBeLessThanOrEqual(DIPS_PER_TRAY_SIDE);
      }
    }
    expect(facing.get("t")?.filter((f) => f.side === "right")).toHaveLength(2);
    // the strip is the third place for T's right side, so it keeps its face whole
    expect(dipsOf(out, "leftover:2")).toEqual([]);
  });
});

describe("a dip cut across a strip is no deeper than any tray it serves", () => {
  // The strip is 30 mm high with a tray 30 mm high on its front face and a short one, 6 mm high on
  // a riser, on its back face: a dip 15 mm deep would reach 9 mm below the short tray's foot.
  const scene = (): TraySpec[] => [
    tray({ key: "front", x: 0, y: 0, w: 80, d: 60 }),
    filler({ x: 0, y: 60 + GAP, w: 80, d: 9.6 }),
    tray({ key: "back", x: 40, y: 60 + GAP + 9.6 + GAP, w: 20, d: 60, z: 24, h: 6 }),
  ];

  it("takes the depth the shortest tray allows", () => {
    const out = addFingerDips(scene(), { settings: S });
    const dips = dipsOf(out, "leftover:0");
    expect(dips).toHaveLength(1);
    expect(dips[0]?.depth).toBe(6);
    const facing = dipsFacingTrays(out, { settings: S });
    expect(facing.get("front")).toHaveLength(1);
    expect(facing.get("back")).toHaveLength(1);
  });

  it("keeps every dip's bottom above the foot of every tray it faces, on the seeds", () => {
    for (const name of ["harbour-kings", "harbour-kings-headroom", "harbour-kings-kit"]) {
      const { project } = loadSeed(name);
      const parts = printableParts(project.layout?.trays ?? [], {
        components: project.components,
        settings: project.settings,
        printer: project.printer,
        locks: project.locks,
      }).trays;
      const trays = parts.filter((q) => q.part === "tray");
      for (const part of parts) {
        for (const { part: member, dip } of fingerDipsOf(part)) {
          const bottom = member.z + member.h - dip.depth;
          for (const { tray } of traysOpenedBy(member, dip, trays, project.settings.trayGap)) {
            expect(bottom).toBeGreaterThanOrEqual(tray.z - 1e-6);
          }
        }
      }
    }
  });
});

describe("what never gets a dip", () => {
  it("a tray, a riser, a spacer, and an open spare tray", () => {
    const parts = [
      tray(),
      filler({ key: "riser", part: "riser" }),
      filler({ key: "spare", solid: false, y: 60 + GAP + 60 + GAP, x: 0, w: 60, d: 60 }),
      filler({ key: "spacer", part: "spacer", y: 130, w: 40 }),
    ];
    const out = addFingerDips(parts, { settings: S });
    expect(out.flatMap((p) => fingerDipsOf(p))).toEqual([]);
  });

  it("a merged part that prints upside down: its top is the bed face", () => {
    const a = filler({ key: "leftover:0", x: 60 + GAP, w: 40 });
    const b = filler({ key: "leftover:1", x: 60 + GAP, y: 60 + GAP, w: 40, stack: 8 });
    const flipped = {
      ...a,
      key: "merged:0",
      merged: { members: [a, b], bridges: [], flipped: true },
    };
    const out = addFingerDips([tray(), flipped], { settings: S });
    expect(out[1]).toBe(flipped);
  });

  it("anything when the finger width is no width", () => {
    const off: Settings = { ...S, fingerPocket: { ...S.fingerPocket, width: 0 } };
    expect(addFingerDips([tray(), filler()], { settings: off })).toEqual([tray(), filler()]);
  });
});

describe("a filler in an upper stack level", () => {
  const upper = (h: number): TraySpec[] => [
    tray({ z: 22.6, h, level: 1, stack: 0 }),
    filler({ z: 22.6, h, level: 1, stack: 0 }),
  ];

  it("keeps the dip MIN_FEATURE_MM above the groove (rim): none under 3 mm deep", () => {
    const top = edgeTopOf(S, 1);
    expect(top).toBeCloseTo(2.85, 2);
    const ok = addFingerDips(upper(7.4), { settings: S });
    const [dip] = dipsOf(ok, "leftover:0");
    expect(dip?.depth).toBe(3.7);
    expect(7.4 - (dip?.depth ?? 0) - top).toBeGreaterThanOrEqual(MIN_FEATURE_MM - 1e-9);
    // 6 mm high: half is 3, but only 2.35 mm stand clear of the groove
    expect(dipsOf(addFingerDips(upper(6), { settings: S }), "leftover:0")).toEqual([]);
  });

  it("keeps it MIN_FEATURE_MM above the step with the stepped base", () => {
    const step: Settings = { ...S, lip: { ...S.lip, joint: "step" as const } };
    expect(edgeTopOf(step, 1)).toBeCloseTo(1.6, 2);
    expect(dipsOf(addFingerDips(upper(6), { settings: step }), "leftover:0")[0]?.depth).toBe(3);
    expect(dipsOf(addFingerDips(upper(5.4), { settings: step }), "leftover:0")).toEqual([]);
  });
});

describe("a merged part", () => {
  const NO_LIP: Settings = { ...S, lip: { ...S.lip, joint: "off" as const } };

  it("carries the dip on the member it is cut in, in the member's own frame", () => {
    const strip = filler({ key: "leftover:0", x: 60 + GAP, y: 0, w: 40, d: 60 });
    const next = filler({ key: "leftover:1", x: 60 + GAP, y: 60 + GAP, w: 40, d: 60, stack: 8 });
    const joined = mergeParts([tray(), strip, next], { settings: NO_LIP, printer: TEST_PRINTER });
    const out = addFingerDips(joined, { settings: NO_LIP });
    const part = out.find((p) => p.merged) as TraySpec;
    const dips = fingerDipsOf(part);
    expect(dips.length).toBeGreaterThan(0);
    for (const { part: member, dip } of dips) {
      expect(member.part).toBe("leftover");
      expect(dip.side).toBe("left");
      // the tray's side is 60 long, the member sits level with it
      expect(dip.at).toBe(30);
    }
    // only the members have it: the merged part's own features stay as they were
    expect(part.features).toBeUndefined();
  });

  it("is never cut where a bridge sits: the strip the bridge joins keeps its whole face", () => {
    // a thin strip against the tray, another filler beyond it: the bridge between them reaches 3 mm
    // into the strip, over its whole length, so a dip cut across the strip would be filled by it
    const a = filler({ key: "leftover:0", x: 60 + GAP, y: 0, w: 10, d: 60 });
    const b = filler({ key: "leftover:1", x: 60 + GAP + 10 + GAP, y: 0, w: 40, d: 60, stack: 8 });
    const joined = mergeParts([tray(), a, b], { settings: NO_LIP, printer: TEST_PRINTER });
    const part = joined.find((p) => p.merged) as TraySpec;
    expect(part.merged?.bridges.length).toBeGreaterThan(0);
    const out = addFingerDips(joined, { settings: NO_LIP });
    const placed = out.find((p) => p.merged) as TraySpec;
    const dips = fingerDipsOf(placed);
    // none on the thin strip, and the one behind it touches no tray
    expect(dips.filter((d) => d.part.key === "leftover:0")).toEqual([]);
    for (const { part: member, dip } of dips) {
      const box = dipBox(dip, member);
      for (const bridge of placed.merged?.bridges ?? []) {
        const xApart = member.x + box.x1 <= bridge.x || member.x + box.x0 >= bridge.x + bridge.w;
        const yApart = member.y + box.y1 <= bridge.y || member.y + box.y0 >= bridge.y + bridge.d;
        expect(xApart || yApart).toBe(true);
      }
    }
  });
});

describe("derived, never stored", () => {
  it("running the pass twice gives the same parts as running it once", () => {
    const once = addFingerDips([tray(), filler()], { settings: S });
    expect(addFingerDips(once, { settings: S })).toEqual(once);
  });

  it("does not change the trays it is given", () => {
    const parts = [tray(), filler()];
    const before = JSON.stringify(parts);
    addFingerDips(parts, { settings: S });
    expect(JSON.stringify(parts)).toBe(before);
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

  it("gives the strips a dip: the thin one beside Events, the long one beside Starter and Market", () => {
    const events = dipsOf(printed, "leftover:3");
    const long = dipsOf(printed, "leftover:1");
    expect(events.length).toBeGreaterThan(0);
    expect(long.length).toBeGreaterThan(0);
    const strip = (key: string): TraySpec => printed.find((p) => p.key === key) as TraySpec;
    // the strip beside Events is thinner than a finger (7.88 mm): cut across
    expect(dipBox(events[0] as NonNullable<(typeof events)[0]>, strip("leftover:3")).through).toBe(
      true,
    );
    // each is 25 mm wide and about half the strip's height deep, over the groove it stands on
    for (const [key, dips] of [
      ["leftover:3", events],
      ["leftover:1", long],
    ] as const) {
      const h = strip(key).h;
      for (const dip of dips) {
        expect(dip.width).toBe(project.settings.fingerPocket.width);
        expect(dip.depth).toBeLessThanOrEqual(h / 2 + 1e-9);
        expect(h - dip.depth).toBeGreaterThanOrEqual(
          edgeTopOf(project.settings, 1) + MIN_FEATURE_MM,
        );
      }
    }
  });

  it("reaches Events and Starter, and the trays on the strips' other faces", () => {
    const facing = dipsFacingTrays(printed, { settings: project.settings });
    expect(facing.get("events01:p0:0")?.map((f) => f.by.key)).toContain("leftover:3");
    expect(facing.get("starter1:p0:0")?.map((f) => f.by.key)).toContain("leftover:1");
    expect(facing.get("market01:p0:0")?.map((f) => f.by.key)).toContain("leftover:1");
  });

  it("puts at most two dips on any side of a tray", () => {
    for (const faces of dipsFacingTrays(printed, { settings: project.settings }).values()) {
      for (const side of ["front", "back", "left", "right"]) {
        expect(faces.filter((f) => f.side === side).length).toBeLessThanOrEqual(DIPS_PER_TRAY_SIDE);
      }
    }
  });

  it("leaves the stored layout as it was: no dip is stored", () => {
    expect(JSON.stringify(stored)).not.toContain("fingerDip");
    expect(JSON.stringify(project)).not.toContain("fingerDip");
  });
});

describe("a dip never cuts into a neighbouring tray", () => {
  // every seed with a plan: each dip lies inside its own part, and the parts that are not fillers
  // are returned as they were
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
    const trays = without.filter((t) => t.part === "tray");
    for (const part of without) {
      for (const { part: member, dip } of fingerDipsOf(part)) {
        const box = dipBox(dip, member);
        // inside the member's own box, from the top down by the dip's depth
        expect(box.x0).toBeGreaterThanOrEqual(-1e-6);
        expect(box.y0).toBeGreaterThanOrEqual(-1e-6);
        expect(box.x1).toBeLessThanOrEqual(member.w + 1e-6);
        expect(box.y1).toBeLessThanOrEqual(member.d + 1e-6);
        expect(dip.depth).toBeLessThanOrEqual(member.h + 1e-9);
        // and so clear of every tray: the boxes of a plan do not overlap
        for (const t of trays) {
          const overlapsXY =
            member.x + box.x0 < t.x + t.w - 1e-6 &&
            t.x < member.x + box.x1 - 1e-6 &&
            member.y + box.y0 < t.y + t.d - 1e-6 &&
            t.y < member.y + box.y1 - 1e-6;
          const overlapsZ =
            member.z + member.h - dip.depth < t.z + t.h - 1e-6 && t.z < member.z + member.h - 1e-6;
          expect(overlapsXY && overlapsZ).toBe(false);
        }
        // the part keeps its box: a dip changes the shape, never the part's place or size
        expect(part.merged ? true : member === part).toBe(true);
      }
    }
    // the stored layout has none, and a second run on the printed parts changes nothing
    expect(JSON.stringify(stored)).not.toContain("fingerDip");
    expect(addFingerDips(without, o)).toEqual(without);
  });
});
