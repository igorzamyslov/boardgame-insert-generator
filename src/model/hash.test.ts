import fc from "fast-check";
import { describe, expect, it } from "vitest";
import groupedLegacy from "../../test/fixtures/legacy/grouped-space.json";
import hashes from "../../test/fixtures/legacy/hashes.json";
import perPlayerLegacy from "../../test/fixtures/legacy/per-player.json";
import plainLegacy from "../../test/fixtures/legacy/plain.json";
import { FIXTURES } from "../layout/test-fixtures";
import { newComponent, newProject } from "./defaults";
import { canonicalJson, cyrb53, inputsHash } from "./hash";
import { parseProject } from "./schema";
import type {
  BulkComponent,
  CardsComponent,
  Component,
  Group,
  MinisComponent,
  Project,
} from "./types";

function sample(): Project {
  const p = newProject();
  p.components = [newComponent("cards"), newComponent("bulk"), newComponent("minis")];
  p.locks = [
    { kind: "position", trayKey: `${p.components[0]?.id ?? ""}:p0:0`, path: "01", rotated: false },
  ];
  return p;
}

describe("canonicalJson", () => {
  it("sorts keys at every level and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,1]},"b":1}',
    );
  });

  it("skips undefined properties", () => {
    expect(canonicalJson({ a: undefined, b: 2 })).toBe('{"b":2}');
  });
});

describe("cyrb53", () => {
  it("is stable across releases (pinned values)", () => {
    expect(cyrb53("")).toBe(3338908027751811);
    expect(cyrb53("insert")).toBe(cyrb53("insert"));
    expect(cyrb53("insert")).not.toBe(cyrb53("insers"));
  });
});

describe("inputsHash", () => {
  it("is 14 hex characters", () => {
    expect(inputsHash(sample())).toMatch(/^[0-9a-f]{14}$/);
  });

  it("hashes the stored rim setting, so a saved project with the rim off keeps its hash", () => {
    // Saved projects carry lip.enabled; the new default (on) must not reach them.
    const base = sample();
    const off: Project = {
      ...base,
      settings: { ...base.settings, lip: { ...base.settings.lip, enabled: false } },
    };
    const reread = parseProject(JSON.parse(JSON.stringify(off)));
    if (!reread.ok) {
      throw new Error(reread.error);
    }
    expect(reread.project.settings.lip.enabled).toBe(false);
    expect(inputsHash(reread.project)).toBe(inputsHash(off));
    expect(inputsHash(off)).not.toBe(inputsHash(base));
  });

  it("changes with fillToTop, so a stored layout made the other way is stale", () => {
    const on = sample();
    const off: Project = { ...on, settings: { ...on.settings, fillToTop: false } };
    expect(inputsHash(off)).not.toBe(inputsHash(on));
  });

  it("changes with a card thickness correction, since it moves the sizes", () => {
    const base = sample();
    const corrected: Project = {
      ...base,
      components: base.components.map((c) =>
        c.kind === "cards" ? { ...c, thickness: { mode: "preset" as const, scale: 1.2 } } : c,
      ),
    };
    expect(inputsHash(corrected)).not.toBe(inputsHash(base));
    const other: Project = {
      ...base,
      components: base.components.map((c) =>
        c.kind === "cards" ? { ...c, thickness: { mode: "preset" as const, scale: 1.3 } } : c,
      ),
    };
    expect(inputsHash(other)).not.toBe(inputsHash(corrected));
  });

  it("changes with a component's room: it sizes the tray, or what the last step gives it, so the layout", () => {
    const base = sample();
    const withRoom = (room?: number | "max"): Project => ({
      ...base,
      components: base.components.map((c) => (c.kind === "bulk" ? { ...c, room } : c)),
    });
    expect(inputsHash(withRoom("max"))).not.toBe(inputsHash(base));
    expect(inputsHash(withRoom(12))).not.toBe(inputsHash(base));
    expect(inputsHash(withRoom(12))).not.toBe(inputsHash(withRoom("max")));
    expect(inputsHash(withRoom(13))).not.toBe(inputsHash(withRoom(12)));
    expect(inputsHash(withRoom(12))).toBe(inputsHash(withRoom(12)));
    // none is no field at all
    expect(inputsHash(withRoom(undefined))).toBe(inputsHash(base));
  });

  it("changes with biggerWells when on, and is the hash it was before the setting when off", () => {
    const base = sample();
    const on: Project = { ...base, settings: { ...base.settings, biggerWells: true } };
    expect(inputsHash(on)).not.toBe(inputsHash(base));
    // Off is left out of the hashed settings (as oneWall is), so adding the setting stales nothing
    // by itself: only PLANNING_MODEL does, once.
    const off: Project = { ...base, settings: { ...base.settings, biggerWells: false } };
    expect(inputsHash(off)).toBe(inputsHash(base));
    const without: Record<string, unknown> = { ...base.settings };
    delete without.biggerWells;
    expect(inputsHash({ ...base, settings: without as unknown as typeof base.settings })).toBe(
      inputsHash(base),
    );
  });

  it("changes with a component's dividers: they cut slots into the tray, so the layout", () => {
    const base = sample();
    const divided = (n: number): Project => ({
      ...base,
      components: base.components.map((c) => (c.kind === "cards" ? { ...c, dividers: n } : c)),
    });
    expect(inputsHash(divided(2))).not.toBe(inputsHash(base));
    expect(inputsHash(divided(3))).not.toBe(inputsHash(divided(2)));
    expect(inputsHash(divided(2))).toBe(inputsHash(divided(2)));
  });

  it("changes with wallAbsorb, since it moves where leaf slack goes", () => {
    const base = sample();
    const grown: Project = { ...base, settings: { ...base.settings, wallAbsorb: 1 } };
    expect(inputsHash(grown)).not.toBe(inputsHash(base));
  });

  it("changes with oneWall when on, and is the hash it was before the setting when off", () => {
    const base = sample();
    const on: Project = { ...base, settings: { ...base.settings, oneWall: true } };
    expect(inputsHash(on)).not.toBe(inputsHash(base));
    // Off is left out of the hashed settings, so no saved plan goes stale: the pinned fixture
    // hashes below are the same as before the setting existed.
    const off: Project = { ...base, settings: { ...base.settings, oneWall: false } };
    expect(inputsHash(off)).toBe(inputsHash(base));
  });

  it("hashes the fixtures to pinned values, none of them the hash they had before schema 0.3.0", () => {
    // Schema 0.3.0 put PLANNING_MODEL into every hash (growth is the last step of planning), so
    // every saved plan goes stale once, by design. These are pinned again from the code of that
    // release; the second table is what they were before, kept to show none is current. Change a
    // value only for a deliberate change of what the hash covers, and say why here.
    const pinned: Record<string, string> = {
      "cards-heavy": "0eab3a2d9c44b9",
      "bits-heavy": "0094f5b385e987",
      "tiles-minis": "1df44efc800ca5",
      "small-tiles": "1441a877fcde53",
      "tiny-box": "041ccd3bfee0a1",
    };
    const before: Record<string, string> = {
      "cards-heavy": "01768a82dd047a",
      "bits-heavy": "1f7b3a193165a8",
      "tiles-minis": "13bb56259e7343",
      "small-tiles": "09791dc6f15922",
      "tiny-box": "15096435ce0ebb",
    };
    for (const [name, hash] of Object.entries(pinned)) {
      const parsed = parseProject(FIXTURES[name as keyof typeof FIXTURES]);
      expect(parsed.ok && inputsHash(parsed.project), name).toBe(hash);
      expect(hash, name).not.toBe(before[name]);
    }
  });

  it("is deterministic and sensitive to the same inputs as before: only the planning model is new", () => {
    // Everything but the planning model is hashed as it was, so the two hashes of one project differ
    // only by the constant, and the project's own inputs still move the hash.
    for (const name of Object.keys(FIXTURES)) {
      const parsed = parseProject(FIXTURES[name as keyof typeof FIXTURES]);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const p = parsed.project;
      expect(inputsHash(p), name).toBe(inputsHash(structuredClone(p)));
      expect(
        inputsHash({ ...p, box: { ...p.box, innerWidth: p.box.innerWidth + 1 } }),
        name,
      ).not.toBe(inputsHash(p));
    }
  });

  it("ignores infill: it only changes the filament estimate, never a part", () => {
    const base = sample();
    const denser: Project = { ...base, settings: { ...base.settings, infill: 80 } };
    expect(inputsHash(denser)).toBe(inputsHash(base));
  });

  it("hashes the play limit when it is changed, and leaves the 1.5 mm default out of the hash", () => {
    // It moves the score and the warning, so a plan made under another limit is stale. At the
    // default the key is left out, so every plan saved before the setting existed stays current.
    const base = sample();
    expect(base.settings.playLimit).toBe(1.5);
    const looser: Project = { ...base, settings: { ...base.settings, playLimit: 2 } };
    const tighter: Project = { ...base, settings: { ...base.settings, playLimit: 1 } };
    expect(inputsHash(looser)).not.toBe(inputsHash(base));
    expect(inputsHash(tighter)).not.toBe(inputsHash(base));
    expect(inputsHash(looser)).not.toBe(inputsHash(tighter));
  });

  it("ignores mergeFillers and mergeRisers: they only group the stored parts for printing", () => {
    // Print-time decompositions like the riser split (spec minimal-trays §6, lever 1): turning
    // either switch must neither stale a plan nor re-run the optimizer.
    const base = sample();
    const hash = inputsHash(base);
    for (const mergeFillers of [true, false]) {
      for (const mergeRisers of [true, false]) {
        const p: Project = { ...base, settings: { ...base.settings, mergeFillers, mergeRisers } };
        expect(inputsHash(p), `${mergeFillers} ${mergeRisers}`).toBe(hash);
      }
    }
    for (const name of Object.keys(FIXTURES)) {
      const parsed = parseProject(FIXTURES[name as keyof typeof FIXTURES]);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const p = parsed.project;
      const flipped: Project = {
        ...p,
        settings: { ...p.settings, mergeFillers: !p.settings.mergeFillers, mergeRisers: true },
      };
      expect(inputsHash(flipped), name).toBe(inputsHash(p));
    }
  });

  it("ignores minRiser: it only decides which padding is printed as a riser", () => {
    // splitRisers reads it from the stored trays, so no tray moves or grows for it: changing it
    // must neither stale a plan nor re-run the optimizer, and a project saved before the setting
    // existed keeps its hash (the setting is absent from what is hashed).
    const base = sample();
    expect(base.settings.minRiser).toBe(3);
    const hash = inputsHash(base);
    for (const minRiser of [1, 2.5, 3, 10, 50]) {
      const p: Project = { ...base, settings: { ...base.settings, minRiser } };
      expect(inputsHash(p), String(minRiser)).toBe(hash);
    }
    const without: Record<string, unknown> = { ...base.settings };
    delete without.minRiser;
    expect(inputsHash({ ...base, settings: without as unknown as typeof base.settings })).toBe(
      hash,
    );
    // ... and the riser fold, now on by default, still is not in it either
    expect(base.settings.mergeRisers).toBe(true);
    expect(inputsHash({ ...base, settings: { ...base.settings, mergeRisers: false } })).toBe(hash);
  });

  it("ignores engraveNames: it only engraves the printed meshes", () => {
    const base = sample();
    for (const engraveNames of [true, false]) {
      const p: Project = { ...base, settings: { ...base.settings, engraveNames } };
      expect(inputsHash(p)).toBe(inputsHash(base));
    }
  });

  it("includes an own __proto__ field of a component", () => {
    const base = sample();
    const withProtoField = (value: number): Project => {
      const [first, ...rest] = structuredClone(base.components);
      const text = JSON.stringify(first).replace(/^\{/, `{"__proto__":{"a":${value}},`);
      const component = JSON.parse(text) as Project["components"][number];
      return { ...base, components: [component, ...rest] };
    };
    const one = withProtoField(1);
    expect(Object.hasOwn(one.components[0] as object, "__proto__")).toBe(true);
    expect(inputsHash(one)).not.toBe(inputsHash(withProtoField(2)));
    expect(inputsHash(one)).not.toBe(inputsHash(base));
  });

  it("ignores every name, the project id, versions and the stored layout", () => {
    const p = sample();
    const before = inputsHash(p);
    const [c0, c1, c2] = p.components as [CardsComponent, BulkComponent, MinisComponent];
    const renamed: Project = {
      ...p,
      id: "zzzzzzzz",
      name: "Renamed",
      schemaVersion: "0.9.0",
      createdWith: "9.9.9",
      layout: {
        createdWith: "0.1.0",
        geometryVersion: "0.1.0",
        inputsHash: "x",
        seed: 1,
        iterations: 1,
        capped: false,
        trays: [],
      },
      components: [
        { ...c0, name: "Other", decks: c0.decks.map((d) => ({ ...d, name: `${d.name}!` })) },
        {
          ...c1,
          name: "Other",
          items: c1.items.map((it) => ({ ...it, name: "x" })),
        },
        { ...c2, name: "Other", figures: c2.figures.map((f) => ({ ...f, name: "x" })) },
      ],
    };
    expect(inputsHash(renamed)).toBe(before);
  });

  it("ignores key order", () => {
    const p = sample();
    const reordered: Project = {
      ...p,
      box: {
        storedOnSide: p.box.storedOnSide,
        headroomCoverage: p.box.headroomCoverage,
        headroom: p.box.headroom,
        innerHeight: p.box.innerHeight,
        innerDepth: p.box.innerDepth,
        innerWidth: p.box.innerWidth,
      },
    };
    expect(inputsHash(reordered)).toBe(inputsHash(p));
  });

  it("changes when any box dimension changes", () => {
    const p = sample();
    const before = inputsHash(p);
    fc.assert(
      fc.property(
        fc.constantFrom("innerWidth", "innerDepth", "innerHeight", "headroom"),
        fc.integer({ min: 1, max: 100_000 }).map((n) => n / 100),
        (field, delta) => {
          const changed: Project = { ...p, box: { ...p.box, [field]: p.box[field] + delta } };
          expect(inputsHash(changed)).not.toBe(before);
        },
      ),
    );
  });

  it("changes when a component, setting, printer value, lock or component order changes", () => {
    const p = sample();
    const before = inputsHash(p);
    const [c0, c1, c2] = p.components as [CardsComponent, BulkComponent, MinisComponent];
    const variants: Project[] = [
      { ...p, components: [{ ...c0, longSide: 89 }, c1, c2] },
      { ...p, components: [{ ...c0, decks: [{ name: "Deck", count: 51 }] }, c1, c2] },
      { ...p, components: [{ ...c0, access: "often" }, c1, c2] },
      { ...p, components: [c1, c0, c2] },
      { ...p, settings: { ...p.settings, lip: { ...p.settings.lip, play: 0.3 } } },
      { ...p, printer: { ...p.printer, layerHeight: 0.28 } },
      { ...p, locks: [] },
    ];
    for (const v of variants) {
      expect(inputsHash(v)).not.toBe(before);
    }
  });
});

function opened(raw: unknown): Project {
  const result = parseProject(structuredClone(raw));
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.project;
}

describe("inputsHash: groups, copies, turn locks and flat decks", () => {
  const kit = (memberIds: string[], patch: Partial<Group> = {}): Group => ({
    id: "kit",
    name: "Player kit",
    access: "sometimes",
    memberIds,
    ...patch,
  });
  // One sample, so every variant below has the same item ids (newComponent makes random ones).
  const fixed = sample();
  /** The sample project with its first two items grouped. */
  function grouped(patch: Partial<Group> = {}): Project {
    const [c0, c1] = fixed.components as [Component, Component];
    return { ...fixed, groups: [kit([c0.id, c1.id], patch)] };
  }

  it("legacy hashes: every 0.6 project's old hash is stale now, a plain and a per-player one included", () => {
    // They kept their hash through the 0.2.0 migration, and hashes.json still holds those values for
    // documentation. Schema 0.3.0's PLANNING_MODEL changed every hash once on purpose, so none of
    // the four is current: each of these plans is re-planned on open.
    expect(inputsHash(opened(plainLegacy))).not.toBe(hashes.plain);
    expect(inputsHash(opened(perPlayerLegacy))).not.toBe(hashes["per-player"]);
    expect(inputsHash(opened(groupedLegacy))).not.toBe(hashes["grouped-space"]);
  });

  it("copies N hashes as perPlayer N, and copies 1 like no field", () => {
    const base = sample();
    const [c0, ...rest] = base.components as [BulkComponent, ...Component[]];
    const withCopies = (copies: number): Project => ({
      ...base,
      components: [{ ...c0, copies }, ...rest],
    });
    const old = { ...c0, perPlayer: { players: 3 } } as unknown as Component;
    expect(inputsHash(withCopies(3))).toBe(inputsHash({ ...base, components: [old, ...rest] }));
    expect(inputsHash(withCopies(1))).toBe(inputsHash(base));
    expect(inputsHash(withCopies(2))).not.toBe(inputsHash(base));
    expect(inputsHash(withCopies(2))).not.toBe(inputsHash(withCopies(3)));
  });

  it("a grouped project gets a new hash", () => {
    expect(inputsHash(grouped())).not.toBe(inputsHash(fixed));
  });

  it("empty groups, group names, group order and a member's hidden access don't change the hash", () => {
    const base = grouped();
    const before = inputsHash(base);
    const empty: Group = { id: "zzz", name: "Nothing", access: "often", memberIds: [] };
    expect(inputsHash({ ...base, groups: [...(base.groups ?? []), empty] })).toBe(before);
    expect(inputsHash(grouped({ name: "Renamed" }))).toBe(before);
    const [c0, c1, c2] = base.components as [Component, Component, Component];
    const second: Group = { id: "abc", name: "Other", access: "often", memberIds: [c2.id] };
    const two = { ...base, groups: [kit([c0.id, c1.id]), second] };
    const swapped = { ...base, groups: [second, kit([c0.id, c1.id])] };
    expect(inputsHash(swapped)).toBe(inputsHash(two));
    expect(inputsHash(two)).not.toBe(before);
    const hidden = { ...base, components: [{ ...c0, access: "often" as const }, c1, c2] };
    expect(inputsHash(hidden)).toBe(before);
    // An item in no group still hashes its access.
    const visible = { ...base, components: [c0, c1, { ...c2, access: "often" as const }] };
    expect(inputsHash(visible)).not.toBe(before);
  });

  it("a grouped item's own copies don't reach the hash, an ungrouped item's do", () => {
    const base = grouped();
    const [c0, c1, c2] = base.components as [Component, Component, Component];
    expect(inputsHash({ ...base, components: [{ ...c0, copies: 3 }, c1, c2] })).toBe(
      inputsHash(base),
    );
    expect(inputsHash({ ...base, components: [c0, c1, { ...c2, copies: 3 }] })).not.toBe(
      inputsHash(base),
    );
  });

  it("only empty groups hash like no groups", () => {
    const base = sample();
    const empty: Group = { id: "zzz", name: "Nothing", access: "often", memberIds: [] };
    expect(inputsHash({ ...base, groups: [empty] })).toBe(inputsHash(base));
  });

  it("member order, group copies and access do change the hash", () => {
    const before = inputsHash(grouped());
    const [c0, c1] = fixed.components as [Component, Component];
    const reordered = { ...grouped(), groups: [kit([c1.id, c0.id])] };
    expect(inputsHash(reordered)).not.toBe(before);
    expect(inputsHash(grouped({ copies: 2 }))).not.toBe(before);
    expect(inputsHash(grouped({ copies: 3 }))).not.toBe(inputsHash(grouped({ copies: 2 })));
    expect(inputsHash(grouped({ access: "often" }))).not.toBe(before);
  });

  it("an item's own packing is hashed only when set, so no saved plan goes stale", () => {
    const base = sample();
    const packed = (packing?: number): Project => ({
      ...base,
      components: base.components.map((c) =>
        c.kind === "bulk" || c.kind === "minis" ? { ...c, packing } : c,
      ),
    });
    expect(inputsHash(packed(undefined))).toBe(inputsHash(base));
    expect(inputsHash(packed(0.65))).not.toBe(inputsHash(base));
    expect(inputsHash(packed(0.65))).not.toBe(inputsHash(packed(0.8)));
  });

  it("a turn lock changes the hash; flatDecks walls doesn't, dividers does", () => {
    const base = sample();
    const turned: Project = {
      ...base,
      locks: [...base.locks, { kind: "turn", trayKey: "a:0", rotated: true }],
    };
    expect(inputsHash(turned)).not.toBe(inputsHash(base));
    const straight: Project = {
      ...base,
      locks: [...base.locks, { kind: "turn", trayKey: "a:0", rotated: false }],
    };
    expect(inputsHash(straight)).not.toBe(inputsHash(turned));
    const flat = (flatDecks?: "walls" | "dividers"): Project => ({
      ...base,
      components: base.components.map((c) =>
        c.kind === "cards" ? { ...c, ...(flatDecks ? { flatDecks } : {}) } : c,
      ),
    });
    expect(inputsHash(flat("walls"))).toBe(inputsHash(flat()));
    expect(inputsHash(flat("dividers"))).not.toBe(inputsHash(flat()));
  });
});
