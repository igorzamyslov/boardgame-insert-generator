// src/layout/copies.alike.test.ts
// "All trays from the same group/set should be the same in size, no variations" and "same
// components always the same, especially if they stack (e.g. it shouldn't matter which one I put
// on top)" (owner, 2026-10-23). The copies of an item or a group are one set of alike trays: the
// same outer size, height, rim, groove and wells wherever they stand, any of them in any place.
// Where the room beside one is more than it needs, a spacer takes it, never the tray; the
// split of an item that does not fit one tray is even.
import { describe, expect, it } from "vitest";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import { builtLevel, jointOf } from "../model/lip";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Component, Project, TraySpec } from "../model/types";
import { size } from "../sizing";
import type { LayoutInput } from "./types";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { splitRisers } from "./risers";
import { checkHardRules } from "./test-hard-rules";

type Raw = Record<string, unknown>;

function projectOf(
  box: Partial<Project["box"]>,
  components: Raw[],
  o: { settings?: Raw; groups?: Raw[]; printer?: Raw } = {},
): Project {
  const base = bitsHeavy as unknown as Raw;
  const parsed = parseProject({
    ...base,
    box: { ...(base.box as Raw), headroom: 0, ...box },
    printer: { ...(base.printer as Raw), ...o.printer },
    settings: { ...(base.settings as Raw), ...o.settings },
    components,
    groups: o.groups ?? [],
    layout: undefined,
  });
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

function inputOf(p: Project): LayoutInput {
  return {
    requirements: size(p.components, p.settings, p.groups).requirements,
    box: p.box,
    printer: p.printer,
    settings: p.settings,
    locks: p.locks,
    inputsHash: inputsHash(p),
    appVersion: "0.0.0-test",
  };
}

const bits = (id: string, copies: number, over: Raw = {}): Raw => ({
  id,
  name: "Bits",
  access: "sometimes",
  kind: "bulk",
  copies,
  items: [{ name: "", count: 15, w: 15, d: 15, h: 3 }],
  ...over,
});

const deck = (id: string, copies: number, count = 30): Raw => ({
  id,
  name: "Deck",
  access: "sometimes",
  kind: "cards",
  copies,
  shortSide: 63.5,
  longSide: 88,
  decks: [{ name: "", count }],
  sleeve: "none",
  thickness: { mode: "preset" },
  storage: "upright-short",
});

/** The layout the optimizer finds, and what is printed from it: the trays, their risers, fillers. */
function planned(
  p: Project,
  seed = 1,
): {
  input: LayoutInput;
  trays: TraySpec[];
  printed: TraySpec[];
  result: ReturnType<typeof optimize>;
} {
  const input = inputOf(p);
  const result = optimize(input, seed, DEFAULT_ITERATIONS);
  if (!result.layout) {
    throw new Error("no layout");
  }
  const trays = result.layout.trays;
  // an Auto plan is printed with the joint it was planned with
  const settings = jointOf(p.settings, result.layout);
  const printed = splitRisers(trays, { settings, printer: p.printer, locks: p.locks });
  return { input, trays, printed, result };
}

/** A printed tray in its own frame: size, height, rim, groove, wells. Two alike trays have one. */
const shape = (t: TraySpec): string =>
  JSON.stringify([
    t.rotated ? [t.d, t.w] : [t.w, t.d],
    t.h,
    t.lip,
    builtLevel(t) > 0,
    t.compartments.map((c) => [...(t.rotated ? [c.d, c.w] : [c.w, c.d]), c.floorZ, c.kind]).sort(),
  ]);

const trayOf = (list: readonly TraySpec[], id: string): TraySpec[] =>
  list.filter((t) => t.part === "tray" && t.key.startsWith(`${id}:`));

describe("copies in a grid are one size", { timeout: 120_000 }, () => {
  for (const growth of [undefined, { w: "off", d: "off", h: "off" }]) {
    it(`eight copies of a bin in a roomy box (growth ${growth ? "off" : "auto"})`, () => {
      const p = projectOf({ innerWidth: 280, innerDepth: 200, innerHeight: 40 }, [
        bits("b", 8, growth ? { growth } : {}),
      ]);
      for (const seed of [1, 2, 3]) {
        const { printed, trays } = planned(p, seed);
        const copies = trayOf(printed, "b");
        expect(copies).toHaveLength(8);
        expect(new Set(copies.map(shape)).size, `seed ${seed}`).toBe(1);
        // stored too: the same footprint, whichever way each is turned
        expect(
          new Set(trayOf(trays, "b").map((t) => (t.rotated ? `${t.d}x${t.w}` : `${t.w}x${t.d}`)))
            .size,
        ).toBe(1);
      }
    });
  }

  it("leaves the room around a copy to spacers: it is no bigger than its natural size", () => {
    const p = projectOf({ innerWidth: 280, innerDepth: 200, innerHeight: 40 }, [bits("b", 8)]);
    const { trays } = planned(p);
    const natural = size(p.components, p.settings, p.groups).requirements[0];
    expect(natural).toBeDefined();
    const copies = trayOf(trays, "b");
    // 15 bits of 15 × 15 mm are nowhere near the 66 mm a bin grew to when it took its slot's room
    expect(Math.max(...copies.map((t) => Math.max(t.w, t.d)))).toBeLessThan(60);
    expect(trays.some((t) => t.part === "leftover")).toBe(true);
  });

  it("makes decks and a tray of another kind agree to the last 0.01 mm", () => {
    const odd = {
      id: "odd",
      name: "Odd",
      access: "sometimes",
      kind: "custom",
      w: 40,
      d: 60,
      h: 30,
      count: 1,
    };
    const p = projectOf({ innerWidth: 290, innerDepth: 200, innerHeight: 95 }, [
      deck("d", 10),
      odd,
    ]);
    const { printed, input, result } = planned(p);
    expect(new Set(trayOf(printed, "d").map(shape)).size).toBe(1);
    expect(result.layout && checkHardRules(input, result.layout, result.notices)).toEqual([]);
  });
});

describe("copies in a stack are interchangeable", { timeout: 120_000 }, () => {
  // a box with room for one tray's footprint: the four copies have to stand in one stack
  const p = projectOf({ innerWidth: 45, innerDepth: 45, innerHeight: 100 }, [bits("b", 4)]);

  it("stands four copies in one stack, each the same: the same size, height, rim, groove and wells", () => {
    for (const seed of [1, 2, 3]) {
      const { printed, trays, input, result } = planned(p, seed);
      const copies = trayOf(printed, "b");
      expect(copies).toHaveLength(4);
      expect(new Set(copies.map(shape)).size, `seed ${seed}`).toBe(1);
      expect(result.layout && checkHardRules(input, result.layout, result.notices)).toEqual([]);
      // one stack of four: the bottom one stands on a riser with the joint, the top has its lip
      expect(new Set(trayOf(trays, "b").map((t) => t.stack)).size).toBe(1);
      const bottom = copies.find((t) => t.level === 0);
      const top = copies.find((t) => t.level === 3);
      expect(bottom?.onRiser).toBe(true);
      expect(top?.lip).toBe(true);
      expect(printed.some((t) => t.part === "riser")).toBe(true);
    }
  });

  it("keeps the copies one size and one set of wells without Fill to the lid, which has no riser", () => {
    const loose = projectOf({ innerWidth: 45, innerDepth: 45, innerHeight: 100 }, [bits("b", 4)], {
      settings: { fillToTop: false },
    });
    const { printed, result, input } = planned(loose);
    const copies = trayOf(printed, "b");
    expect(copies).toHaveLength(4);
    // no riser to stand the bottom copy on, so no groove under it; everything else is alike
    const sans = (t: TraySpec): string =>
      JSON.stringify(JSON.parse(shape(t)).filter((_: unknown, i: number) => i !== 3));
    expect(new Set(copies.map(sans)).size).toBe(1);
    expect(printed.some((t) => t.part === "riser")).toBe(false);
    expect(result.layout && checkHardRules(input, result.layout, result.notices)).toEqual([]);
  });

  it("is built so whichever copy stands on top, the stack is as tall as the box leaves it", () => {
    const { printed, input } = planned(p);
    const topPlane = input.box.innerHeight - input.box.headroom;
    for (const stack of new Set(printed.filter((t) => t.part === "tray").map((t) => t.stack))) {
      const parts = printed.filter(
        (t) => t.stack === stack && (t.part === "tray" || t.part === "riser"),
      );
      const top = Math.max(
        ...parts.map(
          (t) => t.z + t.h + (t.part === "tray" && t.lip ? input.settings.lip.height : 0),
        ),
      );
      expect(top).toBeLessThanOrEqual(topPlane + 1e-9);
    }
  });
});

describe("copies of figures, which may lie down", { timeout: 120_000 }, () => {
  const figures = (over: Raw = {}): Raw => ({
    id: "f",
    name: "Heroes",
    access: "sometimes",
    kind: "minis",
    copies: 4,
    figures: [{ name: "Hero", w: 25, d: 25, h: 40, count: 3 }],
    storage: "pockets",
    ...over,
  });

  it("lays every copy the same way, in a grid and in a stack", () => {
    for (const box of [
      { innerWidth: 300, innerDepth: 200, innerHeight: 60 },
      { innerWidth: 110, innerDepth: 50, innerHeight: 120 },
    ]) {
      const p = projectOf(box, [figures()]);
      for (const seed of [1, 2]) {
        const { printed, input, result } = planned(p, seed);
        const copies = trayOf(printed, "f");
        expect(copies).toHaveLength(4);
        expect(new Set(copies.map(shape)).size, `${box.innerWidth} seed ${seed}`).toBe(1);
        expect(result.layout && checkHardRules(input, result.layout, result.notices)).toEqual([]);
      }
    }
  });
});

describe(
  "the joints of a stack of copies are best-effort (owner, 2026-10-23)",
  { timeout: 120_000 },
  () => {
    // four bins stand in one stack (21.2 mm each): 84.8 mm of trays, the top copy's 2 mm rim above
    // them and 3 mm of riser under them
    const stackIn = (innerHeight: number) =>
      planned(projectOf({ innerWidth: 45, innerDepth: 45, innerHeight }, [bits("b", 4)]));
    const noMore = (t: TraySpec): string =>
      JSON.stringify(JSON.parse(shape(t)).filter((_: unknown, i: number) => i !== 2 && i !== 3));
    const joint = (r: ReturnType<typeof optimize>) =>
      r.notices.find((n) => n.code === "layout.copiesJoint")?.message;

    it("keeps both and says nothing when the stack has the room", () => {
      const { printed, result } = stackIn(90);
      expect(joint(result)).toBeUndefined();
      const copies = trayOf(printed, "b");
      expect(new Set(copies.map(shape)).size).toBe(1);
    });

    it("drops the top copy's rim first, keeping the riser and the groove, and says so", () => {
      const { printed, input, result } = stackIn(88);
      expect(joint(result)).toBe(
        "The top Bits ×15 tray has no rim, so the Bits ×15 trays only stack in this order.",
      );
      const copies = trayOf(printed, "b");
      expect(copies.map((t) => t.lip).sort()).toEqual([false, true, true, true]);
      expect(copies.find((t) => t.level === 0)?.onRiser).toBe(true);
      // the copies are still one size, one height, one set of wells
      expect(new Set(copies.map(noMore)).size).toBe(1);
      expect(result.layout && checkHardRules(input, result.layout, result.notices)).toEqual([]);
    });

    it("then drops the riser and the groove under the bottom copy, still the same trays", () => {
      const { printed, input, result } = stackIn(86);
      expect(joint(result)).toBe(
        "The top Bits ×15 tray has no rim and the bottom one no groove, so the Bits ×15 trays only stack in this order.",
      );
      expect(printed.some((t) => t.part === "riser")).toBe(false);
      const copies = trayOf(printed, "b");
      expect(new Set(copies.map(noMore)).size).toBe(1);
      expect(result.layout && checkHardRules(input, result.layout, result.notices)).toEqual([]);
    });
  },
);

describe("copies of a group are one set", { timeout: 120_000 }, () => {
  it("builds every copy of a kit the same way, in a stack or not", () => {
    const members = [
      bits("m1", 1, { name: "Wood" }),
      bits("m2", 1, { name: "Stone", items: [{ name: "", count: 20, w: 12, d: 12, h: 5 }] }),
    ];
    const p = projectOf(
      { innerWidth: 85, innerDepth: 50, innerHeight: 100 },
      members.map((m) => ({ ...m, copies: undefined })),
      {
        groups: [
          { id: "kit", name: "Kit", copies: 4, access: "sometimes", memberIds: ["m1", "m2"] },
        ],
      },
    );
    for (const seed of [1, 2]) {
      const { printed, input, result } = planned(p, seed);
      const kits = trayOf(printed, "kit");
      expect(kits.length).toBeGreaterThanOrEqual(4);
      expect(new Set(kits.map(shape)).size, `seed ${seed}`).toBe(1);
      expect(result.layout && checkHardRules(input, result.layout, result.notices)).toEqual([]);
    }
  });
});

describe("with the stepped base", { timeout: 120_000 }, () => {
  it("gives every copy a slab and a socket, on a riser that carries the socket", () => {
    const p = projectOf({ innerWidth: 45, innerDepth: 45, innerHeight: 100 }, [bits("b", 4)], {
      settings: {
        lip: {
          joint: "step" as const,
          height: 2,
          thickness: 1.2,
          ledge: 1.7,
          play: 0.25,
          stepHeight: 1.5,
        },
      },
    });
    const { printed, input, result } = planned(p);
    const copies = trayOf(printed, "b");
    expect(copies).toHaveLength(4);
    expect(new Set(copies.map(shape)).size).toBe(1);
    expect(printed.find((t) => t.part === "riser")?.lip).toBe(true);
    expect(copies.find((t) => t.level === 0)?.onRiser).toBe(true);
    expect(result.layout && checkHardRules(input, result.layout, result.notices)).toEqual([]);
  });
});

describe("with Auto, whichever joint it chooses (owner, 2026-10-24)", { timeout: 120_000 }, () => {
  it("keeps every copy alike and the hard rules, in a stack of copies", () => {
    const p = projectOf({ innerWidth: 45, innerDepth: 45, innerHeight: 100 }, [bits("b", 4)], {
      settings: { lip: { ...DEFAULT_SETTINGS.lip, joint: "auto" as const } },
    });
    const { printed, input, result } = planned(p);
    const joint = result.layout?.joint;
    expect(joint === "rim" || joint === "step").toBe(true);
    const copies = trayOf(printed, "b");
    expect(copies).toHaveLength(4);
    expect(new Set(copies.map(shape)).size).toBe(1);
    expect(result.layout && checkHardRules(input, result.layout, result.notices)).toEqual([]);
  });
});

describe("a split is even (owner, 2026-10-23)", { timeout: 120_000 }, () => {
  const four: Component = {
    id: "four",
    name: "Four decks",
    access: "sometimes",
    kind: "cards",
    shortSide: 63.5,
    longSide: 88,
    decks: [0, 1, 2, 3].map((k) => ({ name: `D${k}`, count: 150 })),
    sleeve: "none",
    thickness: { mode: "preset" },
    storage: "upright-short",
  } as Component;

  it("never cuts four entries 2 + 1 + 1: two trays of two, or four of one", () => {
    // too long for the print bed in one tray (the whole is 68 × 229 mm): it has to be split
    for (const box of [
      { innerWidth: 100, innerDepth: 250, innerHeight: 100 },
      { innerWidth: 150, innerDepth: 250, innerHeight: 100 },
    ]) {
      const p = projectOf(box, [four as unknown as Raw], {
        printer: { bedX: 140, bedY: 140, bedMargin: 5 },
      });
      for (const seed of [1, 2, 3]) {
        const { trays } = planned(p, seed);
        const parts = trayOf(trays, "four");
        expect(parts.length, `seed ${seed}`).toBeGreaterThan(1);
        const entries = parts.map((t) => t.compartments.filter((c) => c.kind !== "spare").length);
        expect(new Set(entries).size, `${entries.join(":")} (seed ${seed})`).toBe(1);
      }
    }
  });
});
