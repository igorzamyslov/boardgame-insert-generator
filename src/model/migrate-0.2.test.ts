import { describe, expect, it } from "vitest";
import combinedLegacy from "../../test/fixtures/legacy/combined.json";
import groupedSpace from "../../test/fixtures/legacy/grouped-space.json";
import perPlayerLegacy from "../../test/fixtures/legacy/per-player.json";
import plainLegacy from "../../test/fixtures/legacy/plain.json";
import type { Json } from "./json";
import { migrateTo020 } from "./migrate-0.2";

/** A bare component of 0.1: just what the migration reads. */
function item(id: string, extra: Json = {}): Json {
  return {
    id,
    name: id,
    access: "sometimes",
    kind: "custom",
    w: 1,
    d: 1,
    h: 1,
    count: 1,
    ...extra,
  };
}

function project(components: Json[], extra: Json = {}): Json {
  return { schemaVersion: "0.1.16", components, locks: [], ...extra };
}

function groupsOf(out: Json): Json[] {
  return (out.groups ?? []) as Json[];
}

function componentsOf(out: Json): Json[] {
  return out.components as Json[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

interface StoredTray {
  key?: string;
  compartments?: Json[];
}

/** The stored layout; a saved file leaves out what reading puts back (a leftover's key, its spare pocket). */
function layoutOf(out: Json): { inputsHash: string; trays: StoredTray[] } {
  return out.layout as ReturnType<typeof layoutOf>;
}

function keysOf(out: Json): string[] {
  return layoutOf(out).trays.flatMap((t) => (t.key === undefined ? [] : [t.key]));
}

function contentsOf(out: Json): string[] {
  return layoutOf(out).trays.flatMap((t) => (t.compartments ?? []).map((c) => String(c.contents)));
}

describe("migrateTo020: text groups become groups", () => {
  it("text groups become groups in first-appearance order", () => {
    const out = migrateTo020(
      project([
        item("a", { groupId: "setup" }),
        item("b"),
        item("c", { groupId: "kit" }),
        item("d", { groupId: "setup" }),
      ]),
    );
    expect(groupsOf(out).map((g) => g.id)).toEqual(["setup", "kit"]);
    expect(groupsOf(out)[0]?.memberIds).toEqual(["a", "d"]);
    expect(groupsOf(out)[1]?.memberIds).toEqual(["c"]);
    expect(groupsOf(out).map((g) => g.name)).toEqual(["setup", "kit"]);
    expect(componentsOf(out).some((c) => "groupId" in c)).toBe(false);
  });

  it("names a group by its trimmed text and keeps the text as the id when it is safe", () => {
    const out = migrateTo020(project([item("a", { groupId: "Kit_1-b" })]));
    expect(groupsOf(out)[0]).toMatchObject({ id: "Kit_1-b", name: "Kit_1-b" });
  });

  it("unsafe text gets group-<n>, and keeps its text as the name", () => {
    const out = migrateTo020(project([item("a", { groupId: "my kit!" })]));
    expect(groupsOf(out)[0]).toMatchObject({ id: "group-1", name: "my kit!", memberIds: ["a"] });
  });

  it("trims the name of a group", () => {
    const out = migrateTo020(project([item("a", { groupId: "  Player kit  " })]));
    expect(groupsOf(out)[0]).toMatchObject({ id: "group-1", name: "Player kit" });
  });

  it("a text equal to a component id gets group-<n>", () => {
    const out = migrateTo020(project([item("a", { groupId: "b" }), item("b")]));
    expect(groupsOf(out)[0]?.id).toBe("group-1");
    expect(groupsOf(out)[0]?.name).toBe("b");
  });

  it("two unsafe texts get group-1 and group-2", () => {
    const out = migrateTo020(
      project([item("a", { groupId: "one kit" }), item("b", { groupId: "two kit" })]),
    );
    expect(groupsOf(out).map((g) => g.id)).toEqual(["group-1", "group-2"]);
  });

  it("skips a group-<n> a component already has", () => {
    const out = migrateTo020(project([item("group-1"), item("b", { groupId: "my kit!" })]));
    expect(groupsOf(out)[0]?.id).toBe("group-2");
  });

  it("an empty groupId means no group", () => {
    const out = migrateTo020(project([item("a", { groupId: "" }), item("b")]));
    expect(out.groups).toBeUndefined();
    expect(componentsOf(out).some((c) => "groupId" in c)).toBe(false);
  });

  it("gives no groups key to a project without groups", () => {
    expect("groups" in migrateTo020(project([item("a")]))).toBe(false);
  });
});

describe("migrateTo020: group access", () => {
  it("is the members' most frequent access", () => {
    const out = migrateTo020(
      project([
        item("a", { groupId: "kit", access: "often" }),
        item("b", { groupId: "kit", access: "often" }),
        item("c", { groupId: "kit", access: "setup" }),
      ]),
    );
    expect(groupsOf(out)[0]?.access).toBe("often");
  });

  it("breaks ties the way mostFrequentAccess does (the more often reached wins)", () => {
    const out = migrateTo020(
      project([
        item("a", { groupId: "kit", access: "setup" }),
        item("b", { groupId: "kit", access: "sometimes" }),
      ]),
    );
    expect(groupsOf(out)[0]?.access).toBe("sometimes");
  });

  it("is setup when every member is setup, and sometimes for members that name no access", () => {
    const out = migrateTo020(
      project([
        item("a", { groupId: "k1", access: "setup" }),
        { ...item("b", { groupId: "k2" }), access: undefined },
      ]),
    );
    expect(groupsOf(out).map((g) => g.access)).toEqual(["setup", "sometimes"]);
  });
});

describe("migrateTo020: perPlayer becomes copies", () => {
  it("perPlayer {players: 3} becomes copies 3", () => {
    const out = migrateTo020(project([item("a", { perPlayer: { players: 3 } })]));
    expect(componentsOf(out)[0]).toMatchObject({ copies: 3 });
    expect("perPlayer" in (componentsOf(out)[0] ?? {})).toBe(false);
  });

  it("perPlayer {players: 1} becomes no copies at all", () => {
    const out = migrateTo020(project([item("a", { perPlayer: { players: 1 } })]));
    expect("copies" in (componentsOf(out)[0] ?? {})).toBe(false);
    expect("perPlayer" in (componentsOf(out)[0] ?? {})).toBe(false);
  });

  it("keeps a value out of range as it is, so validation still reports it", () => {
    const out = migrateTo020(project([item("a", { perPlayer: { players: 11 } })]));
    expect(componentsOf(out)[0]).toMatchObject({ copies: 11 });
  });

  it("a grouped perPlayer: the group takes the largest N, members have neither field", () => {
    const out = migrateTo020(
      project([
        item("a", { groupId: "kit", perPlayer: { players: 2 } }),
        item("b", { groupId: "kit", perPlayer: { players: 4 } }),
      ]),
    );
    expect(groupsOf(out)[0]).toMatchObject({ copies: 4 });
    for (const c of componentsOf(out)) {
      expect("perPlayer" in c).toBe(false);
      expect("copies" in c).toBe(false);
    }
  });

  it("a group whose largest N is 1 has no copies", () => {
    const out = migrateTo020(project([item("a", { groupId: "kit", perPlayer: { players: 1 } })]));
    expect("copies" in (groupsOf(out)[0] ?? {})).toBe(false);
  });
});

describe("migrateTo020: stored plans and pins", () => {
  it("combined plans go stale: a ':pall:' tray key empties the hash", () => {
    const out = migrateTo020(clone(combinedLegacy) as Json);
    expect(layoutOf(out).inputsHash).toBe("");
  });

  it("leaves the hash of a plan with no combined tray as it was", () => {
    const raw = clone(plainLegacy) as Json;
    const out = migrateTo020(raw);
    expect(layoutOf(out).inputsHash).toBe(layoutOf(raw).inputsHash);
    expect(layoutOf(out).inputsHash).not.toBe("");
  });

  it("pins are kept: every lock, including one on a pall key", () => {
    const locks = [
      { kind: "position", trayKey: "a:pall:0", path: "0", rotated: false },
      { kind: "size", trayKey: "a:p1:0", w: 1, d: 2, h: 3 },
      { kind: "stack", trayKeys: ["a:pall:0", "b:p0:0"] },
    ];
    const out = migrateTo020(project([item("a"), item("b")], { locks: clone(locks) }));
    expect(out.locks).toEqual(locks);
  });

  it("renamed groups carry their pins (R18): grouped-space.json becomes group-1", () => {
    const raw = clone(groupedSpace) as Json;
    const out = migrateTo020(raw);
    expect(groupsOf(out)[0]).toMatchObject({ id: "group-1", name: "Player kit" });
    expect(out.locks).toEqual([
      { kind: "position", trayKey: "group-1:p0:0", path: "00", rotated: false },
      { kind: "stack", trayKeys: ["group-1:p0:0", "cards001:p0:0"] },
    ]);
    const keys = keysOf(out);
    expect(keys).toEqual(keysOf(raw).map((k) => k.replace(/^Player kit:/, "group-1:")));
    expect(keys.some((k) => k.startsWith("Player kit"))).toBe(false);
    expect(keys.filter((k) => k.startsWith("group-1:")).length).toBeGreaterThan(0);
  });

  it("also moves a spacer's key and a size lock with its group", () => {
    const out = migrateTo020(
      project([item("a", { groupId: "my kit" })], {
        locks: [{ kind: "size", trayKey: "my kit:p0:0", w: 1, d: 1, h: 1 }],
        layout: {
          inputsHash: "abc",
          trays: [
            { key: "my kit:p0:0", compartments: [] },
            { key: "my kit:p0:0:spacer", compartments: [] },
            { key: "leftover:0", compartments: [] },
          ],
        },
      }),
    );
    expect((out.locks as Json[])[0]).toMatchObject({ trayKey: "group-1:p0:0" });
    expect(keysOf(out)).toEqual(["group-1:p0:0", "group-1:p0:0:spacer", "leftover:0"]);
  });

  it("leaves the keys of a group that keeps its text, and of ungrouped items, alone", () => {
    const out = migrateTo020(
      project([item("a", { groupId: "setup" }), item("b")], {
        locks: [{ kind: "position", trayKey: "setup:p0:0", path: "", rotated: false }],
        layout: { inputsHash: "abc", trays: [{ key: "setup:p0:0", compartments: [] }] },
      }),
    );
    expect((out.locks as Json[])[0]).toMatchObject({ trayKey: "setup:p0:0" });
    expect(layoutOf(out).trays[0]?.key).toBe("setup:p0:0");
  });

  it("safe texts are reserved first: an unsafe text before a group named 'group-1'", () => {
    const out = migrateTo020(
      project([item("a", { groupId: "my kit" }), item("b", { groupId: "group-1" })], {
        locks: [
          { kind: "position", trayKey: "my kit:p0:0", path: "0", rotated: false },
          { kind: "position", trayKey: "group-1:p0:0", path: "1", rotated: false },
        ],
        layout: {
          inputsHash: "abc",
          trays: [
            { key: "my kit:p0:0", compartments: [{ contents: "A" }] },
            { key: "group-1:p0:0", compartments: [{ contents: "B" }] },
          ],
        },
      }),
    );
    expect(groupsOf(out).map((g) => [g.id, g.name, g.memberIds])).toEqual([
      ["group-2", "my kit", ["a"]],
      ["group-1", "group-1", ["b"]],
    ]);
    // each pin and tray stays with its own group
    expect(out.locks).toEqual([
      { kind: "position", trayKey: "group-2:p0:0", path: "0", rotated: false },
      { kind: "position", trayKey: "group-1:p0:0", path: "1", rotated: false },
    ]);
    expect(keysOf(out)).toEqual(["group-2:p0:0", "group-1:p0:0"]);
  });

  it("a text equal to a member id gets group-1, with its keys rewritten", () => {
    const out = migrateTo020(
      project([item("kit", { groupId: "kit" })], {
        locks: [{ kind: "position", trayKey: "kit:p0:0", path: "", rotated: true }],
        layout: { inputsHash: "abc", trays: [{ key: "kit:p0:0", compartments: [] }] },
      }),
    );
    expect(groupsOf(out)[0]).toMatchObject({ id: "group-1", name: "kit", memberIds: ["kit"] });
    expect((out.locks as Json[])[0]).toMatchObject({ trayKey: "group-1:p0:0" });
    expect(layoutOf(out).trays[0]?.key).toBe("group-1:p0:0");
  });

  it("does not touch an ungrouped item's tray whose key starts with a renamed text", () => {
    const out = migrateTo020(
      project([item("a", { groupId: "my kit" }), item("my kit:p0")], {
        layout: {
          inputsHash: "abc",
          trays: [
            { key: "my kit:p0:0", compartments: [] },
            { key: "my kit:p0:p0:0", compartments: [] },
          ],
        },
      }),
    );
    // the second key is the tray of a requirement called "my kit:p0", not of the group "my kit"
    expect(keysOf(out)).toEqual(["group-1:p0:0", "my kit:p0:p0:0"]);
  });
});

describe("migrateTo020: stored contents", () => {
  it("(P1) suffixes are stripped (R19): per-player.json", () => {
    const raw = clone(perPlayerLegacy) as Json;
    const before = contentsOf(raw);
    expect(before.some((c) => / \(P\d+\)$/.test(c))).toBe(true);
    const out = migrateTo020(raw);
    const after = contentsOf(out);
    expect(after.some((c) => c.includes("(P"))).toBe(false);
    expect(after).toEqual(before.map((c) => c.replace(/ \(P\d+\)$/, "")));
  });

  it("strips only a trailing ' (P<n>)'", () => {
    const out = migrateTo020(
      project([item("a")], {
        layout: {
          inputsHash: "x",
          trays: [
            {
              key: "a:p0:0",
              compartments: [{ contents: "Pawns (P2) ×4" }, { contents: "Bits ×4 (P12)" }, {}],
            },
          ],
        },
      }),
    );
    expect(layoutOf(out).trays[0]?.compartments).toEqual([
      { contents: "Pawns (P2) ×4" },
      { contents: "Bits ×4" },
      {},
    ]);
  });
});

describe("migrateTo020: behaviour", () => {
  it("is deterministic and does not mutate its input", () => {
    for (const legacy of [groupedSpace, perPlayerLegacy, combinedLegacy, plainLegacy]) {
      const raw = clone(legacy) as Json;
      const snapshot = clone(raw);
      const first = migrateTo020(raw);
      expect(raw).toEqual(snapshot);
      expect(migrateTo020(raw)).toEqual(first);
    }
  });

  it("does not throw on odd shapes", () => {
    const odd: unknown[] = [
      {},
      { components: "no", locks: 3, layout: "x" },
      { components: [null, 1, "a", [], { groupId: 5 }, { groupId: "g" }] },
      {
        components: [{ id: 7, groupId: "g", perPlayer: "many" }],
        locks: [null, { kind: "stack" }],
      },
      {
        layout: {
          trays: [null, { key: 3 }, { key: "a:p0:0", compartments: [null, { contents: 4 }] }],
        },
      },
      { components: [], layout: { trays: "none" } },
    ];
    for (const raw of odd) {
      expect(() => migrateTo020(clone(raw) as Json)).not.toThrow();
    }
  });

  it("gives a member with no id of its own a fixed one, so the group can name it", () => {
    const out = migrateTo020({ components: [{ groupId: "g", kind: "custom" }] });
    const id = (out.components as Json[])[0]?.id;
    expect(typeof id).toBe("string");
    expect(groupsOf(out)[0]?.memberIds).toEqual([id]);
    expect(migrateTo020({ components: [{ groupId: "g", kind: "custom" }] })).toEqual(out);
  });
});
