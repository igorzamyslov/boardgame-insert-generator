import { describe, expect, it } from "vitest";
import type { Json } from "./json";
import { migrateTo030, roomFromGrowth } from "./migrate-0.3";
import { MIGRATIONS, parseProject } from "./schema";
import { inputsHash } from "./hash";
import { SCHEMA_VERSION, parseSemver } from "./version";

// Schema 0.3.0: per-axis `growth` (and the older `stretch`) become one `room` per item, in the
// contents' terms. Owner, 2026-10-23: growth is off by default, so Auto reads as None.

const cards = (extra: Json = {}): Json => ({
  id: "cards1",
  name: "Cards",
  access: "sometimes",
  kind: "cards",
  shortSide: 63,
  longSide: 88,
  decks: [{ name: "", count: 50 }],
  sleeve: "none",
  thickness: { mode: "preset" },
  storage: "upright-long",
  ...extra,
});
const tiles = (extra: Json = {}): Json => ({
  id: "tiles1",
  name: "Tiles",
  access: "sometimes",
  kind: "tiles",
  shape: { type: "rect", w: 50, d: 50 },
  thickness: 2,
  count: 20,
  storage: "upright",
  ...extra,
});
const bulk = (extra: Json = {}): Json => ({
  id: "bulk1",
  name: "Tokens",
  access: "sometimes",
  kind: "bulk",
  items: [{ name: "", count: 20, w: 20, d: 20, h: 2 }],
  ...extra,
});
const minis = (extra: Json = {}): Json => ({
  id: "minis1",
  name: "Minis",
  access: "sometimes",
  kind: "minis",
  figures: [{ name: "", w: 25, d: 25, h: 40, count: 4 }],
  storage: "bulk",
  ...extra,
});
const custom = (extra: Json = {}): Json => ({
  id: "custom1",
  name: "Item",
  access: "sometimes",
  kind: "custom",
  w: 10,
  d: 10,
  h: 10,
  count: 1,
  ...extra,
});

function file(components: Json[], extra: Json = {}): Json {
  return { schemaVersion: "0.2.4", createdWith: "0.18.0", components, locks: [], ...extra };
}
function roomsOf(out: Json): unknown[] {
  return (out.components as Json[]).map((c) => c.room);
}

describe("the migration from 0.2 to 0.3", () => {
  it("is registered for the line 0.2 and is the one the schema version needs", () => {
    expect(parseSemver(SCHEMA_VERSION)).toMatchObject({ major: 0, minor: 4 });
    expect(MIGRATIONS.find((m) => m.from === "0.2")).toMatchObject({ to: "0.3.0" });
  });

  it("reads off and auto as none: nothing grows unless asked", () => {
    const out = migrateTo030(
      file([
        cards({ growth: { stack: "off" } }),
        tiles({ growth: { stack: "auto" } }),
        bulk({ growth: { w: "auto", d: "auto", h: "off" } }),
        cards({ id: "c2" }),
      ]),
    );
    expect(roomsOf(out)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("reads max as as much as fits, on any axis of a bin", () => {
    const out = migrateTo030(
      file([
        cards({ growth: { stack: "max" } }),
        tiles({ growth: { stack: "max" } }),
        bulk({ growth: { w: "auto", d: "max" } }),
      ]),
    );
    expect(roomsOf(out)).toEqual(["max", "max", "max"]);
  });

  it("reads a set amount of a deck as that many more cards, in whole cards", () => {
    // 50 cards of 0.32 mm; 3.2 mm more is ten cards
    expect(roomsOf(migrateTo030(file([cards({ growth: { stack: 3.2 } })])))).toEqual([10]);
    // sleeves count: standard adds 0.1 mm a card, 0.42 mm each
    expect(
      roomsOf(migrateTo030(file([cards({ sleeve: "standard", growth: { stack: 8.4 } })]))),
    ).toEqual([20]);
    // never less than one card
    expect(roomsOf(migrateTo030(file([cards({ growth: { stack: 0.01 } })])))).toEqual([1]);
  });

  it("reads a measured stack by its own thickness per card", () => {
    const measured = cards({
      thickness: { mode: "measured", cards: 100, stackMm: 40 },
      growth: { stack: 12 },
    });
    expect(roomsOf(migrateTo030(file([measured])))).toEqual([30]);
  });

  it("reads a set amount of tiles as that many more tiles", () => {
    expect(roomsOf(migrateTo030(file([tiles({ growth: { stack: 7 } })])))).toEqual([4]);
  });

  it("reads a set amount on a bin as a percent more pieces, the largest axis deciding", () => {
    const out = migrateTo030(file([bulk({ growth: { w: 5, d: 12, h: 3 } })]));
    expect(roomsOf(out)).toEqual([roomFromGrowth.piecesPercent(12)]);
    expect(roomFromGrowth.piecesPercent(12)).toBe(24);
    expect(roomFromGrowth.piecesPercent(0.1)).toBe(1);
    expect(roomFromGrowth.piecesPercent(5000)).toBe(500);
  });

  it("lets max win over a set amount on another axis", () => {
    expect(roomsOf(migrateTo030(file([bulk({ growth: { w: 10, h: "max" } })])))).toEqual(["max"]);
  });

  it("drops growth on items with no room row, and the group's growth", () => {
    const out = migrateTo030(
      file([minis({ growth: { w: "max" } }), custom({ growth: { h: 5 } })], {
        groups: [{ id: "g1", name: "G", access: "often", memberIds: ["minis1"], growth: { w: 3 } }],
      }),
    );
    expect(roomsOf(out)).toEqual([undefined, undefined]);
    expect((out.components as Json[]).some((c) => "growth" in c)).toBe(false);
    expect((out.groups as Json[])[0]).not.toHaveProperty("growth");
  });

  it("drops the old stretch key, which meant auto or none: no room", () => {
    const out = migrateTo030(
      file([cards({ stretch: true }), tiles({ stretch: false, growth: { stack: "auto" } })]),
    );
    expect(roomsOf(out)).toEqual([undefined, undefined]);
    expect((out.components as Json[]).some((c) => "stretch" in c)).toBe(false);
  });

  it("keeps everything else, never mutates its input and gives the same output twice", () => {
    const input = file([cards({ growth: { stack: "max" }, copies: 2, dividers: 1 })], {
      settings: { wall: 1.6 },
    });
    const before = structuredClone(input);
    const a = migrateTo030(input);
    expect(input).toEqual(before);
    expect(migrateTo030(input)).toEqual(a);
    expect((a.components as Json[])[0]).toMatchObject({ copies: 2, dividers: 1, room: "max" });
    expect(a.settings).toEqual({ wall: 1.6 });
  });

  it("never throws for odd input", () => {
    expect(() => migrateTo030({ components: "no" })).not.toThrow();
    expect(() => migrateTo030({ components: [1, null, { growth: 5 }] })).not.toThrow();
  });

  it("opens a saved 0.2.4 file at the current schema with its room, and its plan goes stale once", () => {
    const raw = file([cards({ growth: { stack: "max" } })], {
      id: "p1",
      name: "P",
      box: { innerWidth: 285, innerDepth: 285, innerHeight: 70 },
      printer: { bedX: 256, bedY: 256, bedZ: 256, bedMargin: 5, layerHeight: 0.2 },
      settings: {},
    });
    const parsed = parseProject(raw);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    expect(parsed.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.project.components[0]?.room).toBe("max");
    // A plan stored under the hash of 0.18.0 is not the plan these inputs make now.
    expect(inputsHash(parsed.project)).not.toBe("0611ca92ba254b");
  });
});
