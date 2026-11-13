// @vitest-environment node
import type { Project, StoredLayout, TraySpec } from "../model/types";
import { planNamedEngravings, nameChoices } from "../geometry/engrave";
import type { InsidePlan } from "../geometry/engrave";
import { planTray } from "../geometry/plan";
import { optimize, printableParts } from "../layout";
import { FIXTURES } from "../layout/test-fixtures";
import { inputsHash } from "../model/hash";
import { carriesName } from "../model/part-name";
import { parseProject } from "../model/schema";
import { size } from "../sizing";
import { trayNames } from "./naming";
import type { TrayName } from "./naming";
import { buildSpecOf, numberParts } from "./numbering";
import type { NumberedPart } from "./numbering";
import { whatGoesWhere } from "./render";
// The engraving matrix: every kind of tray and part that carries a name, from a laid-out project
// through the packing guide ("Engraved as") and the geometry's plan (the part's name, the kind cut
// on each well's floor). Rules held for every case: the guide says what the geometry cuts; a kind
// is cut only in the well that holds it, once; plates, spacers and merged parts carry no kind
// names; a name too small for any face is left off and the guide says so.
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { buildTray, loadManifold } from "../geometry";
import scythe from "../../test/fixtures/engraving/scythe.json";
import star from "../../test/fixtures/engraving/star-realms.json";

/** One printed part: what is said about its name and what the geometry cuts. */
interface Probe {
  part: NumberedPart;
  name: TrayName;
  /** The spec the builder is asked for (partName, partNames, wellNames set). */
  spec: TraySpec;
  /** The packing guide's "Engraved as" (upper case), null when it says none. */
  guide: string | null;
  tooSmall: boolean;
  /** The name the geometry cuts on the part itself; "" when it cuts none. */
  cutName: string;
  /** Each kind cut on a well's floor, with the compartment the cut lies in (null: in none). */
  cutWells: { text: string; index: number | null; plan: InsidePlan }[];
}

interface Probed {
  project: Project;
  parts: Probe[];
}

/** The parts of a project as an export prints them, probed. */
function probe(project: Project, layout: StoredLayout): Probed {
  const printed = printableParts(layout.trays, {
    components: project.components,
    settings: project.settings,
    printer: project.printer,
    locks: project.locks,
  }).trays;
  const parts = numberParts(printed);
  const names = trayNames(parts, project.components, project.groups);
  const rows = new Map(
    whatGoesWhere(
      { ...layout, trays: printed },
      { ...project, settings: { ...project.settings, engraveNames: true } },
    ).map((r) => [r.key, r]),
  );
  const out = parts.map((part): Probe => {
    const name = names.get(part.spec.key) as TrayName;
    const spec = buildSpecOf(part, true, name);
    const row = rows.get(part.spec.key);
    let cutName = "";
    let cutWells: Probe["cutWells"] = [];
    if (carriesName(spec.part) && spec.merged === undefined) {
      const plan = planTray(spec, project.settings);
      const chosen = planNamedEngravings(plan, nameChoices(spec), spec.wellNames);
      cutName = chosen?.name ?? "";
      cutWells = (chosen?.engravings.wells ?? []).map((w) => {
        const at = plan.compartments.find(
          (c) => w.cx > c.rect.x0 && w.cx < c.rect.x1 && w.cy > c.rect.y0 && w.cy < c.rect.y1,
        );
        return { text: w.text, index: at?.index ?? null, plan: w };
      });
    }
    return {
      part,
      name,
      spec,
      guide: row?.engraved ?? null,
      tooSmall: row?.tooSmall ?? false,
      cutName,
      cutWells,
    };
  });
  return { project, parts: out };
}

const BASE = FIXTURES["cards-heavy"];

/** A project of `components` and `groups` in the box of the cards-heavy fixture, laid out. */
function laidOut(
  components: unknown[],
  groups: unknown[] = [],
  over: { box?: Record<string, unknown>; iterations?: number } = {},
): [Project, StoredLayout] {
  const parsed = parseProject({
    ...(BASE as object),
    box: { ...(BASE as { box: object }).box, innerHeight: 90, ...over.box },
    components,
    groups,
    locks: [],
    layout: undefined,
  });
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const p = parsed.project;
  const { requirements } = size(p.components, p.settings, p.groups);
  const { layout } = optimize(
    {
      requirements,
      box: p.box,
      printer: p.printer,
      settings: p.settings,
      locks: p.locks,
      inputsHash: inputsHash(p),
      appVersion: "0.0.0-test",
    },
    1,
    over.iterations ?? 3000,
  );
  if (!layout) {
    throw new Error("no layout");
  }
  return [{ ...p, settings: { ...p.settings, engraveNames: true } }, layout];
}

/** A stored project file (a layout from the app) taken as it is. */
function stored(file: unknown): [Project, StoredLayout] {
  const parsed = parseProject(file);
  if (!parsed.ok || parsed.project.layout === undefined) {
    throw new Error(parsed.ok ? "no layout" : parsed.error);
  }
  const p = parsed.project;
  return [{ ...p, settings: { ...p.settings, engraveNames: true } }, p.layout as StoredLayout];
}

const cards = (id: string, name: string, decks: [string, number][], over = {}) => ({
  id,
  name,
  access: "often",
  kind: "cards",
  shortSide: 63.5,
  longSide: 88,
  decks: decks.map(([n, count]) => ({ name: n, count })),
  sleeve: "standard",
  thickness: { mode: "preset" },
  storage: "auto",
  ...over,
});
const bulk = (id: string, name: string, items: object[], over = {}) => ({
  id,
  name,
  access: "often",
  kind: "bulk",
  items,
  ...over,
});
const tiles = (id: string, name: string, over = {}) => ({
  id,
  name,
  access: "setup",
  kind: "tiles",
  shape: { type: "rect", w: 45, d: 45 },
  thickness: 2,
  count: 12,
  storage: "auto",
  ...over,
});
const minis = (id: string, name: string, figures: object[], over = {}) => ({
  id,
  name,
  access: "sometimes",
  kind: "minis",
  storage: "pockets",
  figures,
  ...over,
});
const custom = (id: string, name: string, over = {}) => ({
  id,
  name,
  access: "often",
  kind: "custom",
  w: 50,
  d: 40,
  h: 10,
  count: 2,
  ...over,
});
const cube = (name: string, count = 20) => ({ name, count, w: 16, d: 16, h: 12 });

const trays = (r: Probed): Probe[] => r.parts.filter((p) => p.spec.part === "tray");

/** The rules every part of every case keeps. */
function holdsRules(r: Probed): void {
  const shorts = new Set<string>();
  for (const p of r.parts) {
    const where = `${p.spec.key} (${p.name.full})`;
    // the guide says what the geometry cuts
    if (p.spec.merged === undefined) {
      expect(p.guide, `guide vs geometry on ${where}`).toBe(
        p.cutName === "" ? null : p.cutName.toUpperCase(),
      );
    }
    // a part carrying a name says so; a plate carries none
    if (p.spec.part === "spacer" || p.spec.part === "divider") {
      expect(p.spec.partName, where).toBeUndefined();
    }
    // no kind names off a tray (spacers, risers, spare trays, merged parts)
    if (p.spec.part !== "tray") {
      expect(p.spec.wellNames, `kind names on ${where}`).toBeUndefined();
    }
    // each kind is cut in the well that holds it, one per well
    const named = p.spec.wellNames ?? [];
    expect(named.length === 0 || named.length === p.spec.compartments.length, where).toBe(true);
    const used = new Set<number>();
    for (const w of p.cutWells) {
      expect(w.index, `a kind cut across wells on ${where}`).not.toBeNull();
      expect(
        named[w.index as number]?.toUpperCase(),
        `a kind cut in the wrong well on ${where}`,
      ).toBe(w.text.toUpperCase());
      expect(used.has(w.index as number), `two kinds in one well on ${where}`).toBe(false);
      used.add(w.index as number);
    }
    // the part's own name is not set on the floor of a well that carries a kind
    expect(p.spec.partName === undefined || /^[A-Za-z0-9 -]{1,20}$/.test(p.spec.partName)).toBe(
      true,
    );
    if (p.spec.partName !== undefined) {
      const upper = p.name.short.toUpperCase();
      expect(shorts.has(upper), `short name repeated: ${p.name.short}`).toBe(false);
      shorts.add(upper);
    }
  }
}

const kindsOf = (p: Probe): string[] => (p.spec.wellNames ?? []).filter((n) => n !== "");
const cutKinds = (p: Probe): string[] => p.cutWells.map((w) => w.text.toUpperCase());

describe("engraved names: every kind of tray", () => {
  it("one card deck: its name on the walls, no kinds", () => {
    const r = probe(...laidOut([cards("c1", "Combat cards", [["", 42]])]));
    holdsRules(r);
    const t = trays(r);
    expect(t).toHaveLength(1);
    expect(kindsOf(t[0] as Probe)).toEqual([]);
    expect(t[0]?.guide).not.toBeNull();
  });

  it("several decks of one item: each deck's name in its own well", () => {
    const r = probe(
      ...laidOut([
        cards("c1", "Encounter cards", [
          ["Base", 28],
          ["Promo", 32],
        ]),
      ]),
    );
    holdsRules(r);
    const t = trays(r);
    expect(t).toHaveLength(1);
    expect(kindsOf(t[0] as Probe).map((s) => s.toUpperCase())).toEqual(["BASE", "PROMO"]);
    expect(cutKinds(t[0] as Probe)).toEqual(["BASE", "PROMO"]);
  });

  it("an item with copies: each tray is named, none loses its kinds", () => {
    const r = probe(
      ...laidOut([
        cards(
          "c1",
          "Market",
          [
            ["Red", 20],
            ["Blue", 20],
          ],
          { copies: 3 },
        ),
      ]),
    );
    holdsRules(r);
    const t = trays(r);
    expect(t.length).toBeGreaterThanOrEqual(3);
    for (const p of t) {
      expect(p.guide, p.name.full).not.toBeNull();
    }
    const withKinds = t.filter((p) => kindsOf(p).length > 0);
    expect(withKinds.length).toBeGreaterThan(0);
  });

  it("bulk of one kind (Coins): the name, no kind", () => {
    const r = probe(...laidOut([bulk("b1", "Coins", [{ name: "Coins", volumeMl: 70 }])]));
    holdsRules(r);
    expect(kindsOf(trays(r)[0] as Probe)).toEqual([]);
  });

  it("bulk of several kinds (Resources): Oil, Metal, Wood, Food, each in its own well", () => {
    const r = probe(
      ...laidOut([
        bulk("b1", "Resources", [cube("Oil"), cube("Metal"), cube("Wood"), cube("Food")]),
      ]),
    );
    holdsRules(r);
    const t = trays(r)[0] as Probe;
    expect(
      kindsOf(t)
        .map((s) => s.toUpperCase())
        .sort(),
    ).toEqual(["FOOD", "METAL", "OIL", "WOOD"]);
    expect(cutKinds(t).sort()).toEqual(["FOOD", "METAL", "OIL", "WOOD"]);
  });

  it("tiles of one kind, and of several kinds", () => {
    const r = probe(
      ...laidOut([tiles("t1", "Hex tiles", { count: 30 }), tiles("t2", "Bonus tiles")]),
    );
    holdsRules(r);
    for (const p of trays(r)) {
      expect(p.guide, p.name.full).not.toBeNull();
    }
  });

  it("minis: one figure kind, several figure kinds", () => {
    const r = probe(
      ...laidOut([
        minis("m1", "Airships", [{ name: "", w: 33, d: 101, h: 41, count: 1 }]),
        minis("m2", "Faction miniatures", [
          { name: "Leader", w: 28, d: 28, h: 38, count: 1 },
          { name: "Mech", w: 28, d: 28, h: 33, count: 4 },
        ]),
      ]),
    );
    holdsRules(r);
    const f = trays(r).find((p) => p.name.full.startsWith("Faction")) as Probe;
    expect(kindsOf(f).map((s) => s.toUpperCase())).toEqual(
      expect.arrayContaining(["LEADER", "MECH"]),
    );
    expect(cutKinds(f).length).toBeGreaterThan(0);
  });

  it("minis lying down, standing up, and stored as bulk", () => {
    const r = probe(
      ...laidOut([
        minis("m1", "Lying minis", [
          { name: "Knight", w: 25, d: 25, h: 45, count: 4 },
          { name: "Squire", w: 25, d: 25, h: 40, count: 2 },
        ]),
        minis("m3", "Standing minis", [
          { name: "Giant", w: 30, d: 30, h: 60, count: 1, keepUpright: true },
          { name: "Imp", w: 20, d: 20, h: 30, count: 3, keepUpright: true },
        ]),
        minis(
          "m2",
          "Bagged minis",
          [
            { name: "Pawn", w: 15, d: 15, h: 25, count: 10 },
            { name: "King", w: 20, d: 20, h: 35, count: 2 },
          ],
          { storage: "bulk" },
        ),
      ]),
    );
    holdsRules(r);
    for (const name of ["Lying minis", "Standing minis", "Bagged minis"]) {
      const t = trays(r).find((p) => p.name.full.startsWith(name)) as Probe;
      expect(kindsOf(t).length, name).toBeGreaterThan(0);
      expect(cutKinds(t).length, name).toBeGreaterThan(0);
    }
  });

  it("a custom item", () => {
    const r = probe(...laidOut([custom("x1", "Power dials", { w: 66, d: 66, h: 7 })]));
    holdsRules(r);
    expect(kindsOf(trays(r)[0] as Probe)).toEqual([]);
  });

  it("a group tray holding several items of the group: named by the group, no item names as kinds", () => {
    const comps = [
      minis("m2", "Faction miniatures", [
        { name: "Leader", w: 28, d: 28, h: 38, count: 1 },
        { name: "Mech", w: 28, d: 28, h: 33, count: 4 },
      ]),
      bulk("b2", "Faction wooden pieces", [
        { name: "Workers, structures, recruits", count: 31, w: 12, d: 12, h: 12 },
      ]),
    ];
    const r = probe(
      ...laidOut(comps, [
        { id: "faction1", name: "Faction", copies: 3, access: "setup", memberIds: ["m2", "b2"] },
      ]),
    );
    holdsRules(r);
    const t = trays(r);
    expect(t.length).toBeGreaterThanOrEqual(3);
    for (const p of t) {
      expect(p.name.full, p.spec.key).toMatch(/^Faction/);
      expect(p.guide, p.name.full).not.toBeNull();
    }
    // the tray of two items says which well holds which: the figures by kind, the pieces by item
    const both = t.find((p) => (p.spec.wellNames ?? []).some((n) => /wooden/i.test(n)));
    expect(both?.spec.wellNames, "the wooden pieces' well is named").toBeDefined();
  });

  it("a group's tray of two single-kind items names each well by its item", () => {
    const r = probe(
      ...laidOut(
        [
          minis("m1", "Airships", [{ name: "", w: 33, d: 101, h: 41, count: 1 }]),
          bulk("b1", "Wooden pieces", [{ name: "Workers", count: 31, w: 12, d: 12, h: 12 }]),
        ],
        [{ id: "fac", name: "Faction", copies: 2, access: "setup", memberIds: ["m1", "b1"] }],
      ),
    );
    holdsRules(r);
    const t = trays(r).find((p) => kindsOf(p).length > 0) as Probe;
    expect(
      kindsOf(t)
        .map((s) => s.toUpperCase())
        .sort(),
    ).toEqual(["AIRSHIPS", "WOODEN PIECES"]);
    expect(cutKinds(t).sort()).toEqual(["AIRSHIPS", "WOODEN PIECES"]);
  });

  it("mixed trays where kinds share a tray, and the spacers beside them carry no kind", () => {
    const r = probe(
      ...laidOut([
        cards("c1", "Starter deck 3", [["", 10]]),
        bulk("b1", "Resources", [cube("Oil"), cube("Wood")]),
        tiles("t1", "Tiles"),
        custom("x1", "Dial"),
      ]),
    );
    holdsRules(r);
  });

  it("long names, repeated names and digits keep one name per part", () => {
    const r = probe(
      ...laidOut([
        cards("c1", "Starter deck 3", [["", 10]]),
        cards("c2", "Starter deck 4", [["", 10]]),
        cards("c3", "Starter deck", [["", 10]]),
        cards("c4", "The extremely long name of a deck of cards that goes on", [["", 10]]),
        bulk("b1", "Wooden meeples", [cube("Red"), cube("Blue"), cube("Green")]),
        bulk("b2", "Wooden meeples", [cube("Red"), cube("Blue")]),
      ]),
    );
    holdsRules(r);
  });

  it("names with letters the font lacks: transliterated or left off, never a gap in the guide", () => {
    const r = probe(
      ...laidOut([
        cards("c1", "Колода тайн", [["", 10]]),
        bulk("b1", "Café Ünïcode", [cube("Ölé"), cube("日本")]),
        cards("c2", "★★★", [["", 10]]),
      ]),
    );
    holdsRules(r);
    for (const p of trays(r)) {
      expect(p.spec.partName, p.name.full).toMatch(/^[A-Za-z0-9 -]+$/);
    }
  });

  it("a well too small for its kind goes unnamed; its neighbours keep theirs", () => {
    const r = probe(
      ...laidOut([
        bulk("b1", "Pips", [
          { name: "Ivory", count: 40, w: 20, d: 20, h: 12 },
          { name: "X", count: 1, w: 3, d: 3, h: 3 },
        ]),
      ]),
    );
    holdsRules(r);
    const t = trays(r)[0] as Probe;
    const small = t.spec.compartments.findIndex((c) => Math.min(c.w, c.d) < 12);
    for (const w of t.cutWells) {
      expect(w.index, "a kind cut in a well too small for it").not.toBe(small);
    }
  });
});

describe("engraved names: the real projects", () => {
  it("Scythe: every part keeps the rules", () => {
    const r = probe(...stored(scythe));
    holdsRules(r);
    const resources = trays(r).find((p) => p.name.full === "Resources 1");
    expect(kindsOf(resources as Probe).map((s) => s.toUpperCase())).toEqual(["OIL", "METAL"]);
    // the card box: every well of its decks is named, the lone deck by its item
    const box = trays(r).find((p) => p.name.full === "Card box") as Probe;
    expect(box.spec.wellNames?.[0]).toBe("Combat cards");
    expect(box.spec.wellNames?.slice(1, 3)).toEqual(["Base", "Encounters promo"]);
    // a well too shallow for its name goes unnamed (Factory, Riverwalk, Quick-start: 2 to 5 mm)
    expect(cutKinds(box)).not.toContain("FACTORY");
    // Faction trays: Airships beside the wooden pieces, each named by its item
    const f = trays(r).find((p) => p.name.full === "Faction 1a") as Probe;
    expect(kindsOf(f).map((s) => s.toUpperCase())).toEqual(["AIRSHIPS", "FACTION WOODEN PIECES"]);
  });
  it("Star Realms: every part keeps the rules", () => {
    holdsRules(probe(...stored(star)));
  });
});

describe("engraved names: the mesh", () => {
  let m: ManifoldToplevel;
  beforeAll(async () => {
    m = await loadManifold();
  });
  // the volume a name takes out of a part: the plain part less the named one
  const cutBy = (r: Probed, p: Probe): { wells: number; all: number } => {
    const build = (spec: typeof p.spec) => buildTray(m, spec, r.project.settings).volumeMm3;
    const plain = build({
      ...p.spec,
      partName: undefined,
      partNames: undefined,
      wellNames: undefined,
    });
    const noWells = build({ ...p.spec, wellNames: undefined });
    const all = build(p.spec);
    return { wells: noWells - all, all: plain - all };
  };

  it("each kind named in the plan is cut into the part: the kinds take material out", () => {
    const [project, layout] = stored(scythe);
    const r = probe(project, layout);
    for (const name of ["Resources 1", "Resources 2", "Card box", "Faction 1a", "Faction 1b"]) {
      const p = trays(r).find((x) => x.name.full === name) as Probe;
      expect(p.cutWells.length, name).toBeGreaterThan(0);
      expect(cutBy(r, p).wells, `${name}: the kinds are in the mesh`).toBeGreaterThan(0);
    }
  });

  it("a part whose kinds are all too small for them is built as it would be without them", () => {
    const [project, layout] = laidOut([
      bulk("b1", "Dots", [
        { name: "A", count: 2, w: 3, d: 3, h: 3 },
        { name: "B", count: 2, w: 3, d: 3, h: 3 },
      ]),
    ]);
    const r = probe(project, layout);
    const p = trays(r)[0] as Probe;
    if (p.cutWells.length === 0) {
      expect(cutBy(r, p).wells).toBe(0);
    }
  });
});
