import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../layout/test-fixtures";
import { newComponent, newProject } from "./defaults";
import { canonicalJson, cyrb53, inputsHash } from "./hash";
import { parseProject } from "./schema";
import type { BulkComponent, CardsComponent, MinisComponent, Project } from "./types";

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

  it("changes with fillToTop, so a stored layout made the other way is stale", () => {
    const on = sample();
    const off: Project = { ...on, settings: { ...on.settings, fillToTop: false } };
    expect(inputsHash(off)).not.toBe(inputsHash(on));
  });

  it("changes with wallAbsorb, since it moves where leaf slack goes", () => {
    const base = sample();
    const grown: Project = { ...base, settings: { ...base.settings, wallAbsorb: 1 } };
    expect(inputsHash(grown)).not.toBe(inputsHash(base));
  });

  it("hashes the fixtures as before wallGrowth became wallAbsorb, so no saved plan goes stale", () => {
    // Pinned from the code before the rename: the hash still names the setting wallGrowth.
    const pinned: Record<string, string> = {
      "cards-heavy": "12814b27c4de66",
      "bits-heavy": "1f7b3a193165a8",
      "tiles-minis": "13bb56259e7343",
      "small-tiles": "18eb0ff1c6707c",
      "tiny-box": "15096435ce0ebb",
    };
    for (const [name, hash] of Object.entries(pinned)) {
      const parsed = parseProject(FIXTURES[name as keyof typeof FIXTURES]);
      expect(parsed.ok && inputsHash(parsed.project), name).toBe(hash);
    }
  });

  it("ignores infill: it only changes the filament estimate, never a part", () => {
    const base = sample();
    const denser: Project = { ...base, settings: { ...base.settings, infill: 80 } };
    expect(inputsHash(denser)).toBe(inputsHash(base));
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
