// src/instructions/naming.test.ts
import { describe, expect, it } from "vitest";
import smallTiles from "../../test/fixtures/small-tiles.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import tightMinis from "../../test/fixtures/tight-minis.json";
import { makeTray } from "../app/test-helpers";
import { optimize, printableParts } from "../layout";
import { fixtureInput, type FixtureName } from "../layout/test-fixtures";
import { parseProject } from "../model/schema";
import type { Component, CompartmentSpec, Group, TraySpec } from "../model/types";
import { numberParts } from "./numbering";
import { trayNames } from "./naming";

function cards(id: string, name: string): Component {
  return {
    id,
    name,
    access: "sometimes",
    kind: "cards",
    shortSide: 63.5,
    longSide: 88,
    decks: [{ name: "Deck", count: 10 }],
    sleeve: "none",
    thickness: { mode: "preset" },
    storage: "auto",
  };
}

function well(componentId: string | undefined, contents: string): CompartmentSpec {
  return {
    x: 1.6,
    y: 1.6,
    w: 50,
    d: 50,
    floorZ: 1.2,
    kind: "well",
    contents,
    ...(componentId === undefined ? {} : { componentId }),
    features: [],
  };
}

function trayOf(key: string, componentId: string, over: Partial<TraySpec> = {}): TraySpec {
  return makeTray({ key, compartments: [well(componentId, "Whatever ×3")], ...over });
}

function named(trays: TraySpec[], components: Component[]) {
  return trayNames(numberParts(trays), components);
}

describe("trayNames", () => {
  it("uses the component name for a single tray", () => {
    const names = named([trayOf("a:p0:0", "c1")], [cards("c1", "Market deck")]);
    expect(names.get("a:p0:0")).toEqual({ full: "Market deck", short: "Market" });
  });

  it("numbers the trays of one component in plan order", () => {
    const trays = [
      trayOf("b:p0:0", "c1", { x: 100 }),
      trayOf("a:p0:0", "c1", { x: 0 }),
      trayOf("z:p0:0", "c2", { x: 200 }),
    ];
    const names = named(trays, [cards("c1", "Market deck"), cards("c2", "Dice")]);
    // numberParts orders by stack, level, then key
    expect(names.get("a:p0:0")?.full).toBe("Market deck 1");
    expect(names.get("b:p0:0")?.full).toBe("Market deck 2");
    expect(names.get("a:p0:0")?.short).toBe("Market 1");
    expect(names.get("b:p0:0")?.short).toBe("Market 2");
    expect(names.get("z:p0:0")?.full).toBe("Dice");
  });

  it("names a spacer by its neighbour", () => {
    const market = trayOf("a:p0:0", "c1", { x: 0, y: 0, w: 100, d: 80 });
    const dice = trayOf("b:p0:0", "c2", { x: 101, y: 0, w: 60, d: 80 });
    const filler = makeTray({
      key: "leftover:0",
      part: "leftover",
      solid: true,
      compartments: [],
      x: 101,
      y: 81,
      w: 60,
      d: 20,
    });
    const names = named([market, dice, filler], [cards("c1", "Market deck"), cards("c2", "Dice")]);
    expect(names.get("leftover:0")?.full).toBe("Spacer by Dice");
  });

  it("breaks a tie between neighbours as front, back, left, right", () => {
    const spare = makeTray({
      key: "leftover:0",
      part: "leftover",
      solid: false,
      compartments: [],
      x: 100,
      y: 100,
      w: 50,
      d: 50,
    });
    const around = (id: string, key: string, x: number, y: number): TraySpec =>
      trayOf(key, id, { x, y, w: 50, d: 50 });
    const components = [
      cards("front", "Front"),
      cards("back", "Back"),
      cards("left", "Left"),
      cards("right", "Right"),
    ];
    const all = [
      around("front", "k1", 100, 50),
      around("back", "k2", 100, 150),
      around("left", "k3", 50, 100),
      around("right", "k4", 150, 100),
    ];
    const without = (id: string) => all.filter((t) => t.compartments[0]?.componentId !== id);
    expect(named([spare, ...all], components).get("leftover:0")?.full).toBe("Spare by Front");
    expect(named([spare, ...without("front")], components).get("leftover:0")?.full).toBe(
      "Spare by Back",
    );
    expect(
      named([spare, ...without("front").filter((t) => t.key !== "k2")], components).get(
        "leftover:0",
      )?.full,
    ).toBe("Spare by Left");
  });

  it("prefers the neighbour sharing the longest edge, and falls back to the nearest", () => {
    const wide = trayOf("k1", "c1", { x: 0, y: 0, w: 100, d: 40 });
    const narrow = trayOf("k2", "c2", { x: 0, y: 100, w: 10, d: 40 });
    const spare = makeTray({
      key: "leftover:0",
      part: "leftover",
      compartments: [],
      x: 0,
      y: 40,
      w: 100,
      d: 60,
    });
    const components = [cards("c1", "Wide"), cards("c2", "Narrow")];
    expect(named([wide, narrow, spare], components).get("leftover:0")?.full).toBe("Spare by Wide");
    const far = { ...spare, y: 300 };
    expect(named([wide, narrow, far], components).get("leftover:0")?.full).toBe("Spare by Narrow");
  });

  it("numbers several spacers beside the same tray", () => {
    const a = trayOf("a:p0:0", "c1", { x: 0, y: 0 });
    const f = (n: number, x: number): TraySpec =>
      makeTray({ key: `leftover:${n}`, part: "leftover", solid: true, compartments: [], x, y: 80 });
    const names = named([a, f(0, 0), f(1, 50)], [cards("c1", "Dice")]);
    expect(names.get("leftover:0")?.full).toBe("Spacer 1 by Dice");
    expect(names.get("leftover:1")?.full).toBe("Spacer 2 by Dice");
    expect(names.get("leftover:0")?.short).not.toBe(names.get("leftover:1")?.short);
  });

  it("names a card spacer and a riser by the tray they belong to when nothing else is near", () => {
    const a = trayOf("a:p0:0", "c1");
    const sp = makeTray({ key: "a:p0:0:spacer", part: "spacer", compartments: [] });
    const riser = makeTray({ key: "a:p0:0:riser", part: "riser", compartments: [], path: "" });
    const names = named([a, sp, riser], [cards("c1", "Dice")]);
    expect(names.get("a:p0:0:spacer")?.full).toBe("Spacer by Dice");
    expect(names.get("a:p0:0:riser")?.full).toBe("Riser under Dice");
  });

  it("falls back to the contents text on layouts without component ids", () => {
    const t = makeTray({ key: "a:p0:0", compartments: [well(undefined, "Market deck ×40")] });
    expect(named([t], [cards("c1", "Market deck")]).get("a:p0:0")?.full).toBe("Market deck");
  });

  it("keeps full names apart when two components share a name or a name looks numbered", () => {
    const trays = [
      trayOf("a:p0:0", "c1"),
      trayOf("b:p0:0", "c2"),
      trayOf("c:p0:0", "c3"),
      trayOf("d:p0:0", "c3"),
    ];
    const names = named(trays, [cards("c1", "Dice"), cards("c2", "Dice"), cards("c3", "Dice 1")]);
    const full = [...names.values()].map((n) => n.full.toLowerCase());
    expect(new Set(full).size).toBe(full.length);
  });

  it("gives names the engraving font can print", () => {
    const t = trayOf("a:p0:0", "c1");
    const names = named([t], [cards("c1", "Würfel & Münzen")]);
    expect(names.get("a:p0:0")?.short).toMatch(/^[A-Za-z0-9 -]+$/);
    expect(names.get("a:p0:0")?.short).toBe("Wurfel");
  });

  it("transliterates Cyrillic, keeping several names apart", () => {
    const trays = [
      trayOf("a:p0:0", "c1"),
      trayOf("b:p0:0", "c2"),
      trayOf("c:p0:0", "c3"),
      trayOf("d:p0:0", "c4"),
    ];
    const names = named(trays, [
      cards("c1", "Карты"),
      cards("c2", "Кубики"),
      cards("c3", "Жетоны ресурсов"),
      cards("c4", "ШАХ"),
    ]);
    expect(names.get("a:p0:0")?.short).toBe("Karty");
    expect(names.get("b:p0:0")?.short).toBe("Kubiki");
    expect(names.get("c:p0:0")?.short).toBe("Zhetony");
    expect(names.get("d:p0:0")?.short).toBe("SHAKH");
    const short = [...names.values()].map((n) => n.short.toUpperCase());
    expect(new Set(short).size).toBe(short.length);
  });

  it("falls back to the kind name for a name with nothing printable", () => {
    const trays = [trayOf("a:p0:0", "c1"), trayOf("b:p0:0", "c2")];
    const cjk = named(trays, [cards("c1", "卡片"), cards("c2", "骰子")]);
    expect(cjk.get("a:p0:0")?.short).toBe("Cards 1");
    expect(cjk.get("b:p0:0")?.short).toBe("Cards 2");
    expect(cjk.get("a:p0:0")?.full).toBe("卡片");
    const one = named([trays[0] as TraySpec], [cards("c1", "卡片")]);
    expect(one.get("a:p0:0")?.short).toBe("Cards");
    expect(one.get("a:p0:0")?.short).not.toMatch(/Tray/);
  });

  it("calls an empty component name by its kind", () => {
    const names = named([trayOf("a:p0:0", "c1")], [cards("c1", "  ")]);
    expect(names.get("a:p0:0")).toEqual({ full: "Cards", short: "Cards" });
  });

  it("keeps two components with the same name apart", () => {
    const trays = [trayOf("a:p0:0", "c1"), trayOf("b:p0:0", "c2")];
    const names = named(trays, [cards("c1", "Dice"), cards("c2", "Dice")]);
    expect(names.get("a:p0:0")).toEqual({ full: "Dice 1", short: "Dice 1" });
    expect(names.get("b:p0:0")).toEqual({ full: "Dice 2", short: "Dice 2" });
  });

  it("gives every tray of a shared first word the same treatment", () => {
    const trays = ["red", "blue", "green"].map((c) => trayOf(`${c}:p0:0`, c));
    const names = named(
      trays,
      ["red", "blue", "green"].map((c) => cards(c, `Wooden meeples ${c}`)),
    );
    expect(names.get("red:p0:0")?.short).toBe("Woo red");
    expect(names.get("blue:p0:0")?.short).toBe("Woo blue");
    expect(names.get("green:p0:0")?.short).toBe("Woo green");
  });

  it("does not let a numbered component take the plain name from its neighbour", () => {
    const trays = [trayOf("a:p0:0", "c1"), trayOf("a:p0:1", "c1"), trayOf("b:p0:0", "c2")];
    const names = named(trays, [cards("c1", "Market deck"), cards("c2", "Market")]);
    expect(names.get("a:p0:0")?.short).toBe("Mar deck 1");
    expect(names.get("a:p0:1")?.short).toBe("Mar deck 2");
    expect(names.get("b:p0:0")?.short).toBe("Mar");
  });

  it("builds a short name for a part by a tray from that tray's short name", () => {
    const a = trayOf("a:p0:0", "c1", { x: 0, y: 0 });
    const b = trayOf("b:p0:0", "c2", { x: 100, y: 0 });
    const c = trayOf("b:p0:1", "c2", { x: 200, y: 0 });
    const f = makeTray({
      key: "leftover:0",
      part: "leftover",
      solid: true,
      compartments: [],
      x: 0,
      y: 80,
      w: 100,
    });
    const g = makeTray({
      key: "leftover:1",
      part: "leftover",
      solid: false,
      compartments: [],
      x: 100,
      y: 80,
      w: 50,
    });
    const names = named([a, b, c, f, g], [cards("c1", "Dice"), cards("c2", "Hex tiles")]);
    expect(names.get("leftover:0")).toEqual({ full: "Spacer by Dice", short: "Spac Dice" });
    expect(names.get("leftover:1")).toEqual({ full: "Spare by Hex tiles 1", short: "Spar Hex 1" });
  });

  it("does not depend on the order the parts are passed in", () => {
    const comps = [cards("c1", "Wooden meeples red"), cards("c2", "Wooden meeples blue")];
    const trays = [
      trayOf("a:p0:0", "c1", { x: 0 }),
      trayOf("b:p0:0", "c2", { x: 100 }),
      makeTray({ key: "leftover:0", part: "leftover", solid: true, compartments: [], x: 0, y: 80 }),
      makeTray({
        key: "leftover:1",
        part: "leftover",
        solid: true,
        compartments: [],
        x: 50,
        y: 80,
      }),
    ];
    const parts = numberParts(trays);
    const expected = [...trayNames(parts, comps)];
    const shuffled = [parts[2], parts[0], parts[3], parts[1]] as typeof parts;
    expect([...trayNames([...parts].reverse(), comps)]).toEqual(expected);
    expect([...trayNames(shuffled, comps)]).toEqual(expected);
  });
});

const LAYOUTS: Record<string, unknown> = {
  "cards-heavy": cardsHeavy,
  "bits-heavy": bitsHeavy,
  "tiles-minis": tilesMinis,
  "small-tiles": smallTiles,
  "tight-minis": tightMinis,
};

const memo = new Map<string, ReturnType<typeof computeFixture>>();

function computeFixture(name: string) {
  const parsed = parseProject(LAYOUTS[name]);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const p = parsed.project;
  const result = optimize(fixtureInput(name as FixtureName), 1, 4000);
  const stored = result.layout?.trays ?? result.bestAttempt?.trays ?? [];
  const printed = printableParts(stored, {
    components: p.components,
    settings: p.settings,
    printer: p.printer,
    locks: p.locks,
  }).trays;
  const parts = numberParts(printed);
  return { parts, components: p.components, names: trayNames(parts, p.components) };
}

/** The fixture's plan, computed once and only when a test asks for it. */
function namesOfFixture(name: string) {
  let found = memo.get(name);
  if (found === undefined) {
    found = computeFixture(name);
    memo.set(name, found);
  }
  return found;
}

describe.each(Object.keys(LAYOUTS))("trayNames on fixture %s", (name) => {
  it("names every part", () => {
    const { parts, names } = namesOfFixture(name);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(names.get(part.spec.key)?.full.length).toBeGreaterThan(0);
    }
  });

  it("never returns two equal full names", () => {
    const { names } = namesOfFixture(name);
    const full = [...names.values()].map((n) => n.full.toLowerCase());
    expect(new Set(full).size).toBe(full.length);
  });

  it("short names fit 10 characters and stay unique", () => {
    const { names } = namesOfFixture(name);
    const short = [...names.values()].map((n) => n.short.toUpperCase());
    for (const s of short) {
      expect(s.length).toBeGreaterThan(0);
      expect(s.length).toBeLessThanOrEqual(10);
      expect(s).toMatch(/^[A-Z0-9 -]+$/);
    }
    expect(new Set(short).size).toBe(short.length);
  });

  it("is deterministic over reversed and shuffled parts", () => {
    const { parts, components, names } = namesOfFixture(name);
    expect([...trayNames([...parts].reverse(), components)]).toEqual([...names]);
    const shuffled = [...parts].sort((a, b) => ((a.number * 7) % 11) - ((b.number * 7) % 11));
    expect([...trayNames(shuffled, components)]).toEqual([...names]);
  });
});

describe("trayNames for a group", () => {
  const hero = cards("h", "Hero");
  const board = cards("b", "Board");
  const components = [hero, board, cards("d", "Dice")];
  const group = (name: string, copies?: number): Group => ({
    id: "kit",
    name,
    ...(copies === undefined ? {} : { copies }),
    access: "often",
    memberIds: ["h", "b"],
  });
  /** One tray of the group: copy c, part n, holding both members. */
  const kitTray = (copy: number, part: number, over: Partial<TraySpec> = {}): TraySpec =>
    makeTray({
      key: `kit:p${copy}:${part}`,
      stack: copy * 4 + part,
      compartments: [well("h", "Hero ×1"), well("b", "Board ×1")],
      ...over,
    });
  const fullNames = (trays: TraySpec[], groups: Group[]) =>
    [...trayNames(numberParts(trays), components, groups).entries()].map(
      ([key, n]) => [key, n.full] as const,
    );

  it("calls the trays of a group by its name, numbered by copy", () => {
    const trays = [0, 1, 2, 3].map((c) => kitTray(c, 0));
    expect(fullNames(trays, [group("Player kit", 4)])).toEqual([
      ["kit:p0:0", "Player kit 1"],
      ["kit:p1:0", "Player kit 2"],
      ["kit:p2:0", "Player kit 3"],
      ["kit:p3:0", "Player kit 4"],
    ]);
  });

  it("calls one copy by the group's name alone", () => {
    expect(fullNames([kitTray(0, 0)], [group("Player kit")])).toEqual([["kit:p0:0", "Player kit"]]);
  });

  it("gives a copy that had to split a letter: 2a and 2b", () => {
    const trays = [kitTray(0, 0), kitTray(1, 0), kitTray(1, 1), kitTray(2, 0)];
    expect(fullNames(trays, [group("Player kit", 3)])).toEqual([
      ["kit:p0:0", "Player kit 1"],
      ["kit:p1:0", "Player kit 2a"],
      ["kit:p1:1", "Player kit 2b"],
      ["kit:p2:0", "Player kit 3"],
    ]);
  });

  it("gives the parts of a single split copy a letter alone: a and b", () => {
    const trays = [kitTray(0, 0), kitTray(0, 1), kitTray(0, 2)];
    expect(fullNames(trays, [group("Player kit")])).toEqual([
      ["kit:p0:0", "Player kit a"],
      ["kit:p0:1", "Player kit b"],
      ["kit:p0:2", "Player kit c"],
    ]);
  });

  it("calls an unnamed group Group", () => {
    expect(fullNames([kitTray(0, 0)], [group("")])).toEqual([["kit:p0:0", "Group"]]);
    expect(fullNames([kitTray(0, 0)], [group("  ")])).toEqual([["kit:p0:0", "Group"]]);
  });

  it("gives short names the same stem, with the copy and the letter", () => {
    const trays = [kitTray(0, 0), kitTray(1, 0), kitTray(1, 1)];
    const names = trayNames(numberParts(trays), components, [group("Player kit", 2)]);
    expect(names.get("kit:p0:0")?.short).toBe("Player 1");
    expect(names.get("kit:p1:0")?.short).toBe("Player 2a");
    expect(names.get("kit:p1:1")?.short).toBe("Player 2b");
    const one = trayNames(numberParts([kitTray(0, 0)]), components, [group("Player kit")]);
    expect(one.get("kit:p0:0")?.short).toBe("Player");
    for (const n of names.values()) {
      expect(n.short.length).toBeLessThanOrEqual(10);
    }
  });

  it("names a part beside a group tray by that tray's name", () => {
    const spare = makeTray({
      key: "leftover:0",
      part: "leftover",
      solid: true,
      compartments: [],
      x: 101,
      y: 0,
      w: 30,
      d: 80,
    });
    const names = trayNames(numberParts([kitTray(0, 0), spare]), components, [group("Player kit")]);
    expect(names.get("leftover:0")?.full).toBe("Spacer by Player kit");
  });

  it("names ungrouped trays as it always did, with or without groups given", () => {
    const trays = [
      trayOf("b:p0:0", "d", { x: 100 }),
      trayOf("a:p0:0", "d", { x: 0 }),
      trayOf("z:p0:0", "h", { x: 200 }),
    ];
    const without = trayNames(numberParts(trays), components);
    const withGroups = trayNames(numberParts(trays), components, [group("Player kit", 4)]);
    expect([...withGroups]).toEqual([...without]);
    expect(withGroups.get("a:p0:0")?.full).toBe("Dice 1");
    expect(withGroups.get("b:p0:0")?.full).toBe("Dice 2");
    expect(withGroups.get("z:p0:0")?.full).toBe("Hero");
  });

  it("keeps a group tray beside ungrouped trays, and no name repeats", () => {
    const trays = [kitTray(0, 0), kitTray(1, 0), trayOf("d:p0:0", "d", { x: 300 })];
    const names = trayNames(numberParts(trays), components, [group("Dice", 2)]);
    const full = [...names.values()].map((n) => n.full.toLowerCase());
    expect(new Set(full).size).toBe(full.length);
    const short = [...names.values()].map((n) => n.short.toUpperCase());
    expect(new Set(short).size).toBe(short.length);
  });
});
