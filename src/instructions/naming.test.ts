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
import type { Component, CompartmentSpec, TraySpec } from "../model/types";
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
    expect(names.get("leftover:0")?.full).toBe("Spacer by Dice 1");
    expect(names.get("leftover:1")?.full).toBe("Spacer by Dice 2");
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
    const odd = named([t], [cards("c1", "Карты")]);
    expect(odd.get("a:p0:0")?.short).toMatch(/^[A-Za-z0-9 -]+$/);
    expect(odd.get("a:p0:0")?.short.length).toBeGreaterThan(0);
  });
});

const LAYOUTS: Record<string, unknown> = {
  "cards-heavy": cardsHeavy,
  "bits-heavy": bitsHeavy,
  "tiles-minis": tilesMinis,
  "small-tiles": smallTiles,
  "tight-minis": tightMinis,
};

function namesOfFixture(name: string) {
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
  return { parts, names: trayNames(parts, p.components) };
}

describe.each(Object.keys(LAYOUTS))("trayNames on fixture %s", (name) => {
  const { parts, names } = namesOfFixture(name);

  it("names every part", () => {
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(names.get(part.spec.key)?.full.length).toBeGreaterThan(0);
    }
  });

  it("never returns two equal full names", () => {
    const full = [...names.values()].map((n) => n.full.toLowerCase());
    expect(new Set(full).size).toBe(full.length);
  });

  it("short names fit 10 characters and stay unique", () => {
    const short = [...names.values()].map((n) => n.short.toUpperCase());
    for (const s of short) {
      expect(s.length).toBeGreaterThan(0);
      expect(s.length).toBeLessThanOrEqual(10);
      expect(s).toMatch(/^[A-Z0-9 -]+$/);
    }
    expect(new Set(short).size).toBe(short.length);
  });

  it("is deterministic", () => {
    expect([...namesOfFixture(name).names]).toEqual([...names]);
  });
});
