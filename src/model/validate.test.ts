import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { newComponent, newProject } from "./defaults";
import { parseProject } from "./schema";
import { DEFAULT_SETTINGS, maxBottomChamfer } from "./settings";
import type {
  BulkComponent,
  CardsComponent,
  Component,
  ComponentKind,
  CustomComponent,
  GrowthMode,
  Group,
  MinisComponent,
  Notice,
  Project,
  Settings,
  TilesComponent,
} from "./types";
import type { SettingRange } from "./validate";
import {
  BOUNDS,
  isBlocking,
  SETTING_RANGES,
  settingsValid,
  VALIDATION_NOTICE_CODES,
  validateComponent,
  validateProject,
} from "./validate";

const { field, limit, invalid } = VALIDATION_NOTICE_CODES;

const KINDS: ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];

function withComponents(...components: Component[]): Project {
  return { ...newProject(), components };
}

function cards(patch: Partial<CardsComponent> = {}): CardsComponent {
  return { ...(newComponent("cards") as CardsComponent), ...patch };
}

function custom(patch: Partial<CustomComponent> = {}): CustomComponent {
  return { ...(newComponent("custom") as CustomComponent), ...patch };
}

/** [code, path] pairs, which is what the UI uses to place a message. */
function codes(notices: Notice[]): [string, string | undefined][] {
  return notices.map((n) => [n.code, n.path]);
}

/** Writes `value` at a JSON pointer such as "/settings/lip/thickness". */
function setAtPointer(root: object, pointer: string, value: number): void {
  const keys = pointer.split("/").slice(1);
  const last = keys.pop();
  if (last === undefined) {
    throw new Error(`Empty pointer: ${pointer}`);
  }
  let node = root as Record<string, unknown>;
  for (const key of keys) {
    node = node[key] as Record<string, unknown>;
  }
  node[last] = value;
}

describe("VALIDATION_NOTICE_CODES", () => {
  it("names each code after its family, and only limit and invalid codes block", () => {
    for (const [family, codesOfFamily] of Object.entries(VALIDATION_NOTICE_CODES)) {
      for (const [name, code] of Object.entries(codesOfFamily)) {
        expect(code).toBe(`${family}.${name}`);
        expect(isBlocking({ level: "error", code, message: "" })).toBe(family !== "field");
      }
    }
  });
});

describe("validateProject", () => {
  it("accepts a new project with no components", () => {
    expect(validateProject(newProject())).toEqual([]);
  });

  it.each(KINDS)("accepts a default %s component", (kind) => {
    expect(validateProject(withComponents(newComponent(kind)))).toEqual([]);
  });

  it("enforces the component limit as blocking", () => {
    const many = Array.from({ length: BOUNDS.maxComponents + 1 }, () => newComponent("custom"));
    const notices = validateProject(withComponents(...many));
    expect(codes(notices)).toEqual([[limit.components, "/components"]]);
    expect(notices.every(isBlocking)).toBe(true);
    expect(validateProject(withComponents(...many.slice(1)))).toEqual([]);
  });

  it("rejects counts below 1 or fractional (field) and above 2000 (blocking)", () => {
    const p = withComponents(
      cards({
        decks: [
          { name: "a", count: 0 },
          { name: "b", count: 2.5 },
          { name: "c", count: 2001 },
          { name: "d", count: 2000 },
        ],
      }),
    );
    const notices = validateProject(p);
    expect(codes(notices)).toEqual([
      [field.count, "/components/0/decks/0/count"],
      [field.count, "/components/0/decks/1/count"],
      [limit.count, "/components/0/decks/2/count"],
    ]);
    expect(notices.map(isBlocking)).toEqual([false, false, true]);
  });

  it("checks count bounds for any integer", () => {
    fc.assert(
      fc.property(fc.integer({ min: -10, max: 5000 }), (count) => {
        const custom: CustomComponent = { ...(newComponent("custom") as CustomComponent), count };
        const found = codes(validateProject(withComponents(custom))).map(([code]) => code);
        if (count < 1) {
          expect(found).toEqual([field.count]);
        } else if (count > BOUNDS.maxCount) {
          expect(found).toEqual([limit.count]);
        } else {
          expect(found).toEqual([]);
        }
      }),
    );
  });

  it("rejects lengths ≤ 0, NaN (field) and > 1000 mm (blocking)", () => {
    const p = newProject();
    p.box = { ...p.box, innerWidth: 0, innerDepth: Number.NaN, innerHeight: 1000.5 };
    expect(codes(validateProject(p))).toEqual([
      [field.length, "/box/innerWidth"],
      [field.length, "/box/innerDepth"],
      [limit.length, "/box/innerHeight"],
    ]);
  });

  it("checks every length inside every component kind", () => {
    const bulk: BulkComponent = {
      ...(newComponent("bulk") as BulkComponent),
      items: [
        { name: "cube", count: 10, w: 8, d: -1, h: 8 },
        { name: "pile", volumeMl: 0 },
      ],
    };
    const tiles: TilesComponent = {
      ...(newComponent("tiles") as TilesComponent),
      shape: { type: "hex", flatToFlat: 1200, orientation: "flat" },
      thickness: 0,
    };
    const minis: MinisComponent = {
      ...(newComponent("minis") as MinisComponent),
      figures: [{ name: "hero", w: 25, d: 25, h: 0, count: 1 }],
    };
    expect(codes(validateProject(withComponents(bulk, tiles, minis)))).toEqual([
      [field.length, "/components/0/items/0/d"],
      [field.volume, "/components/0/items/1/volumeMl"],
      [limit.length, "/components/1/shape/flatToFlat"],
      [field.length, "/components/1/thickness"],
      [field.length, "/components/2/figures/0/h"],
    ]);
  });

  it("requires at least one deck, item and figure", () => {
    const p = withComponents(
      cards({ decks: [] }),
      { ...(newComponent("bulk") as BulkComponent), items: [] },
      { ...(newComponent("minis") as MinisComponent), figures: [] },
    );
    expect(codes(validateProject(p))).toEqual([
      [field.empty, "/components/0/decks"],
      [field.empty, "/components/1/items"],
      [field.empty, "/components/2/figures"],
    ]);
  });

  it("refuses a curved floor on cards and tiles, and allows it on the other kinds", () => {
    const p = withComponents(
      cards({ curvedFloor: true }),
      { ...newComponent("tiles"), id: "t1", curvedFloor: true },
      cards({ id: "c2", curvedFloor: false, fingerCuts: false }),
      { ...newComponent("bulk"), id: "b1", curvedFloor: true, fingerCuts: true },
      { ...newComponent("minis"), id: "m1", curvedFloor: true },
      custom({ id: "x1", curvedFloor: true, fingerCuts: false }),
    );
    const notices = validateProject(p);
    expect(codes(notices)).toEqual([
      [field.curvedFloor, "/components/0/curvedFloor"],
      [field.curvedFloor, "/components/1/curvedFloor"],
    ]);
    expect(notices.map((n) => n.message)).toEqual([
      "Cards can't have a curved floor: they would bend. Turn it off.",
      "Tiles can't have a curved floor: upright tiles would tilt. Turn it off.",
    ]);
    expect(notices.map((n) => n.level)).toEqual(["error", "error"]);
  });

  it("bounds copies to 1…10", () => {
    const p = withComponents(cards({ copies: 0 }), cards({ copies: 11 }));
    const notices = validateProject(p);
    expect(codes(notices)).toEqual([
      [field.copies, "/components/0/copies"],
      [limit.copies, "/components/1/copies"],
    ]);
    expect(notices.map((n) => n.message)).toEqual([
      "Copies must be a whole number of at least 1.",
      "Copies must be at most 10.",
    ]);
  });

  it("warns (does not error) when card sides are entered the wrong way round", () => {
    const notices = validateProject(withComponents(cards({ shortSide: 88, longSide: 63.5 })));
    expect(notices).toEqual([
      expect.objectContaining({
        level: "warning",
        code: field.cardSides,
        path: "/components/0/shortSide",
      }),
    ]);
  });

  it("checks custom sleeves and measured thickness", () => {
    const p = withComponents(
      cards({
        sleeve: { w: 66.5, h: 0, thickness: -0.1 },
        thickness: { mode: "measured", cards: 0, stackMm: 20 },
      }),
    );
    expect(codes(validateProject(p))).toEqual([
      [field.length, "/components/0/sleeve/h"],
      [field.length, "/components/0/sleeve/thickness"],
      [field.count, "/components/0/thickness/cards"],
    ]);
  });

  it("allows a clearance override of 0 but not below", () => {
    expect(validateProject(withComponents(cards({ clearance: 0 })))).toEqual([]);
    expect(codes(validateProject(withComponents(cards({ clearance: -1 }))))).toEqual([
      [field.length, "/components/0/clearance"],
    ]);
  });

  it("requires headroom below the box height and a usable bed", () => {
    const p = newProject();
    p.box = { ...p.box, innerHeight: 40, headroom: 40 };
    p.printer = { ...p.printer, bedX: 200, bedY: 200, bedMargin: 100, layerHeight: 0 };
    expect(codes(validateProject(p))).toEqual([
      [field.headroom, "/box/headroom"],
      [field.bedMargin, "/printer/bedMargin"],
      [field.layerHeight, "/printer/layerHeight"],
    ]);
  });

  it("checks settings ranges, including nested ones", () => {
    const p = newProject();
    p.settings = {
      ...p.settings,
      wall: 0.5,
      topPressFit: 1.5,
      lip: { ...p.settings.lip, thickness: 0.4 },
    };
    expect(codes(validateProject(p))).toEqual([
      [field.setting, "/settings/wall"],
      [field.setting, "/settings/lip/thickness"],
      [field.setting, "/settings/topPressFit"],
    ]);
  });

  it("checks the least riser against 1 to 50 mm, at /settings/minRiser", () => {
    const at = (minRiser: number) => {
      const p = newProject();
      p.settings = { ...p.settings, minRiser };
      return codes(validateProject(p));
    };
    expect(at(1)).toEqual([]);
    expect(at(3)).toEqual([]);
    expect(at(50)).toEqual([]);
    expect(at(0.5)).toEqual([[field.setting, "/settings/minRiser"]]);
    expect(at(50.5)).toEqual([[field.setting, "/settings/minRiser"]]);
    expect(at(Number.NaN)).toEqual([[field.setting, "/settings/minRiser"]]);
  });

  it("treats duplicate component ids as blocking", () => {
    const a = newComponent("custom");
    const notices = validateProject(withComponents(a, { ...a }));
    expect(codes(notices)).toEqual([[invalid.duplicateId, "/components/1/id"]]);
    expect(notices.every(isBlocking)).toBe(true);
  });

  it("checks lock paths and sizes", () => {
    const p = newProject();
    p.locks = [
      { kind: "position", trayKey: "a:p0:0", path: "01x", rotated: false },
      { kind: "size", trayKey: "a:p0:0", w: 2000, d: 50, h: 30 },
      { kind: "stack", trayKeys: [] },
    ];
    expect(codes(validateProject(p))).toEqual([
      [field.lockPath, "/locks/0/path"],
      [limit.length, "/locks/1/w"],
      [field.lockStack, "/locks/2/trayKeys"],
    ]);
  });

  it("limits position lock paths to 64 binary digits", () => {
    const p = newProject();
    p.locks = [
      { kind: "position", trayKey: "a:p0:0", path: "0102", rotated: false },
      { kind: "position", trayKey: "a:p0:0", path: "0".repeat(65), rotated: false },
      { kind: "position", trayKey: "a:p0:0", path: "1".repeat(64), rotated: false },
    ];
    expect(codes(validateProject(p))).toEqual([
      [field.lockPath, "/locks/0/path"],
      [field.lockPath, "/locks/1/path"],
    ]);
  });

  const countCases: [number, string][] = [
    [2000.5, limit.count],
    [Number.POSITIVE_INFINITY, limit.count],
    [Number.NaN, field.count],
  ];
  it.each(countCases)(
    "tests the count upper bound before integrality (%s gives %s)",
    (count, code) => {
      expect(codes(validateProject(withComponents(custom({ count }))))).toEqual([
        [code, "/components/0/count"],
      ]);
    },
  );

  const scaleCases: [number, string | null][] = [
    [1, null],
    [0.5, null],
    [2, null],
    [0.49, field.thicknessScale],
    [2.01, field.thicknessScale],
    [0, field.thicknessScale],
    [-1, field.thicknessScale],
    [Number.NaN, field.thicknessScale],
  ];
  it.each(scaleCases)("checks the preset thickness correction (%s gives %s)", (scale, code) => {
    const project = withComponents(cards({ thickness: { mode: "preset", scale } }));
    expect(codes(validateProject(project))).toEqual(
      code === null ? [] : [[code, "/components/0/thickness/scale"]],
    );
  });

  const separatorCases: [number, string | null][] = [
    [0, null],
    [1, null],
    [10, null],
    [11, limit.separators],
    [Number.POSITIVE_INFINITY, limit.separators],
    [10.5, limit.separators],
    [-2, field.separators],
    [2.5, field.separators],
    [Number.NaN, field.separators],
  ];
  it.each(separatorCases)("checks %s spacer plates (%s)", (separators, code) => {
    expect(codes(validateProject(withComponents(cards({ separators }))))).toEqual(
      code === null ? [] : [[code, "/components/0/separators"]],
    );
  });

  const dividerCases: [number, string | null][] = [
    [0, null],
    [1, null],
    [6, null],
    [7, limit.dividers],
    [Number.POSITIVE_INFINITY, limit.dividers],
    [6.5, limit.dividers],
    [-1, field.dividers],
    [2.5, field.dividers],
    [Number.NaN, field.dividers],
  ];
  it.each(dividerCases)("checks %s dividers (%s)", (dividers, code) => {
    expect(codes(validateProject(withComponents(cards({ dividers }))))).toEqual(
      code === null ? [] : [[code, "/components/0/dividers"]],
    );
  });

  it("accepts a component with no separators set", () => {
    expect(codes(validateProject(withComponents(cards())))).toEqual([]);
  });

  const growthCases: [GrowthMode, string | null][] = [
    ["off", null],
    ["auto", null],
    ["max", null],
    [0, null],
    [12.5, null],
    [1000, null],
    [1000.5, limit.length],
    [Number.POSITIVE_INFINITY, limit.length],
    [-1, field.length],
    [Number.NaN, field.length],
  ];
  it.each(growthCases)("checks a growth of %s (%s)", (mode, code) => {
    expect(codes(validateProject(withComponents(cards({ growth: { stack: mode } }))))).toEqual(
      code === null ? [] : [[code, "/components/0/growth/stack"]],
    );
  });

  const copiesCases: [number, string][] = [
    [10.5, limit.copies],
    [Number.POSITIVE_INFINITY, limit.copies],
    [2.5, field.copies],
  ];
  it.each(copiesCases)(
    "tests the copies upper bound before integrality (%s gives %s)",
    (copies, code) => {
      expect(codes(validateProject(withComponents(cards({ copies }))))).toEqual([
        [code, "/components/0/copies"],
      ]);
    },
  );

  it("bounds bulk volumes above 1 000 000 ml as blocking", () => {
    const bulk: BulkComponent = {
      ...(newComponent("bulk") as BulkComponent),
      items: [{ name: "pile", volumeMl: 1_000_001 }],
    };
    const notices = validateProject(withComponents(bulk));
    expect(codes(notices)).toEqual([[limit.volume, "/components/0/items/0/volumeMl"]]);
    expect(notices.every(isBlocking)).toBe(true);
  });

  it("checks tile rect sides and tile count", () => {
    const tiles: TilesComponent = {
      ...(newComponent("tiles") as TilesComponent),
      shape: { type: "rect", w: 0, d: 1001 },
      count: 2001,
    };
    expect(codes(validateProject(withComponents(tiles)))).toEqual([
      [field.length, "/components/0/shape/w"],
      [limit.length, "/components/0/shape/d"],
      [limit.count, "/components/0/count"],
    ]);
  });

  it("checks bulk item count, width and height", () => {
    const bulk: BulkComponent = {
      ...(newComponent("bulk") as BulkComponent),
      items: [{ name: "cube", count: 0, w: 1001, d: 5, h: -1 }],
    };
    expect(codes(validateProject(withComponents(bulk)))).toEqual([
      [field.count, "/components/0/items/0/count"],
      [limit.length, "/components/0/items/0/w"],
      [field.length, "/components/0/items/0/h"],
    ]);
  });

  it("checks minis figure width, depth and count", () => {
    const minis: MinisComponent = {
      ...(newComponent("minis") as MinisComponent),
      figures: [{ name: "hero", w: 0, d: 1001, h: 10, count: 2001 }],
    };
    expect(codes(validateProject(withComponents(minis)))).toEqual([
      [field.length, "/components/0/figures/0/w"],
      [limit.length, "/components/0/figures/0/d"],
      [limit.count, "/components/0/figures/0/count"],
    ]);
  });

  it("checks custom width, depth and height", () => {
    expect(
      codes(validateProject(withComponents(custom({ w: 1001, d: 0, h: Number.NaN })))),
    ).toEqual([
      [limit.length, "/components/0/w"],
      [field.length, "/components/0/d"],
      [field.length, "/components/0/h"],
    ]);
  });

  it("checks bed X, Y and Z lengths", () => {
    const p = newProject();
    p.printer = { ...p.printer, bedX: 0, bedY: 1001, bedZ: Number.NaN };
    expect(codes(validateProject(p))).toEqual([
      [field.length, "/printer/bedX"],
      [limit.length, "/printer/bedY"],
      [field.length, "/printer/bedZ"],
    ]);
  });

  it("bounds sleeve thickness and clearance at 1000 mm as blocking", () => {
    const p = withComponents(
      cards({ sleeve: { w: 66.5, h: 88, thickness: 1001 } }),
      cards({ clearance: 1001 }),
    );
    expect(codes(validateProject(p))).toEqual([
      [limit.length, "/components/0/sleeve/thickness"],
      [limit.length, "/components/1/clearance"],
    ]);
  });

  it("rejects layer heights above 1 mm", () => {
    const p = newProject();
    p.printer = { ...p.printer, layerHeight: 1.5 };
    expect(codes(validateProject(p))).toEqual([[field.layerHeight, "/printer/layerHeight"]]);
  });

  it("does not warn about card sides when they are equal", () => {
    expect(validateProject(withComponents(cards({ shortSide: 63.5, longSide: 63.5 })))).toEqual([]);
  });

  it("skips the headroom cross-check when the box height is invalid", () => {
    const p = newProject();
    p.box = { ...p.box, innerHeight: 0, headroom: 0 };
    expect(codes(validateProject(p))).toEqual([[field.length, "/box/innerHeight"]]);
  });

  it("reports an out-of-range headroom exactly once", () => {
    const p = newProject();
    p.box = { ...p.box, headroom: 1001 };
    expect(codes(validateProject(p))).toEqual([[limit.length, "/box/headroom"]]);
  });

  it("skips the bed margin cross-check when a bed side is invalid", () => {
    const p = newProject();
    p.printer = { ...p.printer, bedX: 0, bedY: 200, bedMargin: 100 };
    expect(codes(validateProject(p))).toEqual([[field.length, "/printer/bedX"]]);
  });

  it("rejects a press fit that leaves no room for trays", () => {
    const p = newProject();
    p.box = { ...p.box, innerHeight: 40, headroom: 39.5 };
    p.settings = { ...p.settings, topPressFit: -2 };
    expect(codes(validateProject(p))).toEqual([[field.topPlane, "/box/headroom"]]);
  });

  it("rejects a component id containing a colon, which would break tray key prefixes", () => {
    const notices = validateProject(withComponents({ ...cards(), id: "a:b" }));
    expect(codes(notices)).toEqual([[invalid.id, "/components/0/id"]]);
    expect(notices[0]?.message).toBe("An item id can't contain ':'.");
    expect(isBlocking(notices[0] as Notice)).toBe(true);
  });

  it("treats an empty component id as blocking", () => {
    const notices = validateProject(withComponents({ ...newComponent("custom"), id: "" }));
    expect(codes(notices)).toEqual([[invalid.id, "/components/0/id"]]);
    expect(notices.every(isBlocking)).toBe(true);
  });

  it("treats an empty or missing project id as blocking", () => {
    const missing = { ...newProject(), id: undefined } as unknown as Project;
    for (const p of [{ ...newProject(), id: "" }, missing]) {
      const notices = validateProject(p);
      expect(codes(notices)).toEqual([[invalid.id, "/id"]]);
      expect(notices.every(isBlocking)).toBe(true);
    }
  });

  it("does not throw on a null sleeve", () => {
    const c = { ...cards(), sleeve: null } as unknown as CardsComponent;
    expect(validateProject(withComponents(c))).toEqual([]);
  });
});

function group(id: string, memberIds: string[], patch: Partial<Group> = {}): Group {
  return { id, name: "Player kit", access: "sometimes", memberIds, ...patch };
}

function withGroups(components: Component[], groups: Group[]): Project {
  return { ...newProject(), components, groups };
}

describe("validateProject: groups", () => {
  const a = custom({ id: "item0001" });
  const b = custom({ id: "item0002" });

  it("accepts a group of items, and an empty one", () => {
    expect(validateProject(withGroups([a, b], [group("kit", [a.id, b.id])]))).toEqual([]);
    expect(validateProject(withGroups([a, b], [group("kit", [])]))).toEqual([]);
  });

  it.each([
    [11, limit.copies, "Copies must be at most 10."],
    [0, field.copies, "Copies must be a whole number of at least 1."],
    [1.5, field.copies, "Copies must be a whole number of at least 1."],
  ])("checks a group's copies (%s gives %s)", (copies, code, message) => {
    const notices = validateProject(withGroups([a], [group("kit", [a.id], { copies })]));
    expect(notices).toEqual([{ level: "error", code, path: "/groups/0/copies", message }]);
  });

  it("accepts group copies from 1 to 10", () => {
    for (const copies of [1, 4, 10]) {
      expect(validateProject(withGroups([a], [group("kit", [a.id], { copies })]))).toEqual([]);
    }
  });

  it("refuses copies on a grouped item: they are set on the group", () => {
    const notices = validateProject(
      withGroups([{ ...a, copies: 2 }, b], [group("kit", [a.id], { name: "Player kit" })]),
    );
    expect(notices).toEqual([
      {
        level: "error",
        code: field.copiesInGroup,
        path: "/components/0/copies",
        message: "Copies are set on the group, Player kit.",
      },
    ]);
    expect(notices.some(isBlocking)).toBe(false);
  });

  it("names an unnamed group Group in that message", () => {
    const notices = validateProject(
      withGroups([{ ...a, copies: 2 }], [group("kit", [a.id], { name: "" })]),
    );
    expect(notices.map((n) => n.message)).toEqual(["Copies are set on the group, Group."]);
  });

  it("allows copies on an item in no group, and no copies on a grouped one", () => {
    expect(validateProject(withGroups([{ ...a, copies: 2 }, b], [group("kit", [b.id])]))).toEqual(
      [],
    );
  });

  it("blocks a member that is no item of the project", () => {
    const notices = validateProject(withGroups([a], [group("kit", [a.id, "ghost001"])]));
    expect(codes(notices)).toEqual([[invalid.groupMember, "/groups/0/memberIds/1"]]);
    expect(notices.every(isBlocking)).toBe(true);
  });

  it("refuses to open a file with such a member", () => {
    const file = {
      ...JSON.parse(JSON.stringify(withGroups([a], [group("kit", [a.id, "ghost001"])]))),
    };
    const result = parseProject(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/\/groups\/0\/memberIds\/1/);
    }
  });

  it("is no error when the member is a foreign component of a newer 0.2.x file", () => {
    const base = withGroups([a], [group("kit", [a.id, "dial0001"])]);
    const file = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    file.schemaVersion = "0.2.9";
    (file.components as unknown[]).push({ id: "dial0001", name: "Dial", kind: "dial", size: 40 });
    const result = parseProject(file);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.project.groups?.[0]?.memberIds).toEqual([a.id, "dial0001"]);
      // The running app has the foreign component only in `foreign`, and validates with it.
      expect(validateProject(result.project)).toEqual([
        expect.objectContaining({ code: invalid.groupMember }),
      ]);
      expect(validateProject(result.project, result.foreign)).toEqual([]);
    }
  });

  it("blocks an item in two groups, and a repeated member", () => {
    const two = validateProject(withGroups([a], [group("one", [a.id]), group("two", [a.id])]));
    expect(codes(two)).toEqual([[invalid.group, "/groups/1/memberIds/0"]]);
    const twice = validateProject(withGroups([a], [group("one", [a.id, a.id])]));
    expect(codes(twice)).toEqual([[invalid.group, "/groups/0/memberIds/1"]]);
    expect([...two, ...twice].every(isBlocking)).toBe(true);
  });

  it("blocks a group id that is a component id, another group's id, or has a stray character", () => {
    expect(codes(validateProject(withGroups([a], [group(a.id, [])])))).toEqual([
      [invalid.group, "/groups/0/id"],
    ]);
    expect(codes(validateProject(withGroups([a], [group("kit", []), group("kit", [])])))).toEqual([
      [invalid.group, "/groups/1/id"],
    ]);
    for (const id of ["a:b", "", "a b", "kit/1"]) {
      expect(codes(validateProject(withGroups([a], [group(id, [])]))), id).toEqual([
        [invalid.group, "/groups/0/id"],
      ]);
    }
    // 1 to 40 characters: 41 is too long, 40 is fine.
    expect(codes(validateProject(withGroups([a], [group("g".repeat(41), [])])))).toEqual([
      [invalid.group, "/groups/0/id"],
    ]);
    for (const id of ["a-b", "A_b9", "g".repeat(40)]) {
      expect(validateProject(withGroups([a], [group(id, [])])), id).toEqual([]);
    }
  });

  it("does not count groups toward the item limit, and has its own limit of 100", () => {
    const items = Array.from({ length: 100 }, (_, i) => custom({ id: `item${i}` }));
    const three = [group("g1", ["item0", "item1"]), group("g2", ["item2"]), group("g3", ["item3"])];
    expect(validateProject(withGroups(items, three))).toEqual([]);
    const many = Array.from({ length: 101 }, (_, i) => group(`g${i}`, []));
    const notices = validateProject(withGroups([a], many));
    expect(notices).toEqual([
      {
        level: "error",
        code: limit.groups,
        path: "/groups",
        message: "Too many groups (101); the maximum is 100.",
      },
    ]);
    expect(notices.every(isBlocking)).toBe(true);
    expect(validateProject(withGroups([a], many.slice(0, 100)))).toEqual([]);
  });

  it("checks a group's growth like an item's", () => {
    expect(
      codes(validateProject(withGroups([a], [group("kit", [a.id], { growth: { w: -1 } })]))),
    ).toEqual([[field.length, "/groups/0/growth/w"]]);
    for (const growth of [{ w: "off" }, { w: "auto" }, { w: 5, d: "max" }, { h: 0 }] as const) {
      expect(validateProject(withGroups([a], [group("kit", [a.id], { growth })]))).toEqual([]);
    }
  });
});

describe("validateProject: turn locks and flat decks", () => {
  it("blocks nothing for a turn lock with a tray, and flags one with an empty trayKey", () => {
    const p = newProject();
    p.locks = [
      { kind: "turn", trayKey: "kit:0", rotated: true },
      { kind: "turn", trayKey: "", rotated: false },
    ];
    expect(validateProject(p)).toEqual([
      {
        level: "error",
        code: field.turnLock,
        path: "/locks/1/trayKey",
        message: "A turn needs a tray.",
      },
    ]);
  });

  it("accepts flatDecks walls and dividers, and flags another value", () => {
    expect(validateProject(withComponents(cards({ flatDecks: "walls" })))).toEqual([]);
    expect(validateProject(withComponents(cards({ flatDecks: "dividers" })))).toEqual([]);
    const bad = cards({ flatDecks: "sideways" as unknown as "walls" });
    expect(codes(validateProject(withComponents(bad)))).toEqual([
      [field.flatDecks, "/components/0/flatDecks"],
    ]);
  });
});

describe("validateComponent", () => {
  it("returns exactly the per-component notices of validateProject, with the same paths", () => {
    const bad = withComponents(
      { ...newComponent("bulk"), items: [] } as Component,
      cards({ shortSide: 0, decks: [{ name: "A", count: 0 }], clearance: -1 }),
      custom({ w: 0, count: 3000 }),
      { ...newComponent("tiles"), thickness: 0 } as Component,
      { ...newComponent("minis"), figures: [] } as Component,
      custom({ copies: 0 }),
    );
    // A duplicate id is cross-component: not part of validateComponent.
    const dup = { ...custom({ h: 0 }), id: bad.components.map((c) => c.id)[0] ?? "" };
    const project = { ...bad, components: [...bad.components, dup] };
    const all = validateProject(project);
    const crossComponent = new Set<string>([invalid.duplicateId, invalid.id]);
    project.components.forEach((c, i) => {
      const slice = all.filter(
        (n) => n.path?.startsWith(`/components/${i}/`) === true && !crossComponent.has(n.code),
      );
      expect(validateComponent(c, i)).toEqual(slice);
    });
    expect(all.some((n) => n.code === invalid.duplicateId)).toBe(true);
    expect(validateComponent(dup, 6).some((n) => n.code === invalid.duplicateId)).toBe(false);
    expect(project.components.map((c, i) => validateComponent(c, i).length)).toEqual([
      1, 3, 2, 1, 1, 1, 1,
    ]);
  });

  it.each(KINDS)("is empty for a default %s component", (kind) => {
    expect(validateComponent(newComponent(kind), 4)).toEqual([]);
  });

  it("roots every path at the given index", () => {
    const notices = validateComponent(custom({ w: 0 }), 7);
    expect(codes(notices)).toEqual([[field.length, "/components/7/w"]]);
  });
});

describe("shared constants", () => {
  it("freezes BOUNDS with the spec values", () => {
    expect(Object.isFrozen(BOUNDS)).toBe(true);
    expect(BOUNDS).toEqual({
      maxComponents: 100,
      maxCount: 2000,
      maxDividers: 6,
      maxLength: 1000,
      maxCopies: 10,
      maxGroups: 100,
      maxSeparators: 10,
    });
  });

  it("freezes SETTING_RANGES and every entry", () => {
    expect(Object.isFrozen(SETTING_RANGES)).toBe(true);
    for (const r of SETTING_RANGES) {
      expect(Object.isFrozen(r)).toBe(true);
    }
  });

  it("gives every SETTING_RANGES entry a hint that is more than its label", () => {
    for (const r of SETTING_RANGES) {
      expect(r.hint.trim().length, r.path).toBeGreaterThan(r.label.length);
      expect(r.hint, r.path).toMatch(/\.$/);
    }
  });
});

describe("setting ranges", () => {
  // Thick walls and floor, so the largest bottomChamfer (3) is allowed too (2 + 2.2/√2 = 3.56),
  // and no lip, so no chamfer, ledge, play or fit is too large for upper trays to bear on it.
  const roomy = (): Project => {
    const p = newProject();
    p.settings = { ...p.settings, wall: 2, floor: 3, lip: { ...p.settings.lip, enabled: false } };
    return p;
  };
  const rangeCases: [string, SettingRange][] = SETTING_RANGES.map((r) => [r.path, r]);

  it.each(rangeCases)("flags %s one step outside either end", (_path, range) => {
    for (const value of [range.min - 0.001, range.max + 0.001]) {
      const p = newProject();
      setAtPointer(p, `/settings/${range.path}`, value);
      expect(codes(validateProject(p))).toEqual([[field.setting, `/settings/${range.path}`]]);
      expect(settingsValid(p.settings)).toBe(false);
    }
  });

  it.each(rangeCases)("accepts %s at either end", (_path, range) => {
    for (const value of [range.min, range.max]) {
      const p = roomy();
      setAtPointer(p, `/settings/${range.path}`, value);
      expect(settingsValid(p.settings)).toBe(true);
    }
  });

  it("needs a lip at least 1 mm high", () => {
    const p = newProject();
    p.settings = { ...p.settings, lip: { ...p.settings.lip, height: 0.99 } };
    expect(codes(validateProject(p))).toEqual([[field.setting, "/settings/lip/height"]]);
    p.settings = { ...p.settings, lip: { ...p.settings.lip, height: 1 } };
    expect(validateProject(p)).toEqual([]);
  });

  it("needs a wall of at least 0.9 mm (0.8 plus the corner margin)", () => {
    const p = newProject();
    p.settings = { ...p.settings, wall: 0.89 };
    expect(codes(validateProject(p))).toEqual([[field.setting, "/settings/wall"]]);
    expect(settingsValid(p.settings)).toBe(false);
    p.settings = { ...p.settings, wall: 0.9 };
    expect(validateProject(p)).toEqual([]);
    expect(settingsValid(p.settings)).toBe(true);
  });

  it("needs a lip thickness of at least 0.9 mm (0.8 plus the corner margin)", () => {
    const p = newProject();
    p.settings = { ...p.settings, lip: { ...p.settings.lip, thickness: 0.89 } };
    expect(codes(validateProject(p))).toEqual([[field.setting, "/settings/lip/thickness"]]);
    expect(settingsValid(p.settings)).toBe(false);
    p.settings = { ...p.settings, lip: { ...p.settings.lip, thickness: 0.9 } };
    expect(validateProject(p)).toEqual([]);
    expect(settingsValid(p.settings)).toBe(true);
  });

  it("rejects a NaN setting", () => {
    const p = newProject();
    p.settings = { ...p.settings, wall: Number.NaN };
    expect(settingsValid(p.settings)).toBe(false);
  });

  it("limits the bottom chamfer to what the wall and floor leave (field.bottomChamfer)", () => {
    // A 3 mm lip ledge bears any chamfer below 2.5 mm (lipBearing).
    const withChamfer = (wall: number, floor: number, bottomChamfer: number): Project => {
      const p = newProject();
      const lip = { ...p.settings.lip, ledge: 3 };
      p.settings = { ...p.settings, wall, floor, bottomChamfer, lip };
      return p;
    };
    // Defaults: 1.6 + 0.3/√2 = 1.812 mm at most.
    expect(validateProject(withChamfer(1.6, 1.2, 1.81))).toEqual([]);
    expect(codes(validateProject(withChamfer(1.6, 1.2, 1.82)))).toEqual([
      [field.bottomChamfer, "/settings/bottomChamfer"],
    ]);
    // The thinnest wall (0.9 mm) and floor (0.8 mm): at most 0.9 − 0.1/√2 = 0.829 mm.
    expect(validateProject(withChamfer(0.9, 0.8, 0.82))).toEqual([]);
    expect(codes(validateProject(withChamfer(0.9, 0.8, 0.84)))).toEqual([
      [field.bottomChamfer, "/settings/bottomChamfer"],
    ]);
    expect(codes(validateProject(withChamfer(0.9, 0.8, 3)))).toEqual([
      [field.bottomChamfer, "/settings/bottomChamfer"],
    ]);
    expect(settingsValid(withChamfer(0.9, 0.8, 3).settings)).toBe(false);
    expect(settingsValid(withChamfer(0.9, 0.8, 0.82).settings)).toBe(true);
  });

  it("compares the bottom chamfer with its limit without the TraySpec grid tolerance", () => {
    for (const [wall, floor] of [
      [DEFAULT_SETTINGS.wall, DEFAULT_SETTINGS.floor],
      [0.9, 0.9],
      [1.2, 1.2],
    ] as const) {
      const p = newProject();
      const limit = maxBottomChamfer({ ...p.settings, wall, floor });
      const lip = { ...p.settings.lip, ledge: 3 };
      p.settings = { ...p.settings, wall, floor, bottomChamfer: limit, lip };
      expect(validateProject(p)).toEqual([]);
      p.settings = { ...p.settings, bottomChamfer: limit + 0.001 };
      expect(codes(validateProject(p))).toEqual([[field.bottomChamfer, "/settings/bottomChamfer"]]);
    }
    // Regression: the defaults allow 1.812 mm; 1.816 passed with the 0.005 mm tolerance and then
    // made planTray reject sizing output (a forced R = c corner keeps 0.9 − √2·0.004 mm).
    expect(settingsValid({ ...DEFAULT_SETTINGS, bottomChamfer: 1.816 })).toBe(false);
  });

  it("keeps the lip ledge bearing upper trays past their bottom chamfer (field.lipBearing)", () => {
    // Upper trays (chamfer ≥ 0.5 mm) rest on ledge − 2 × play × fit; defaults: 1.7 − 0.5 = 1.2 mm.
    const withLip = (over: Partial<Settings>, lip: Partial<Settings["lip"]> = {}): Project => {
      const p = newProject();
      // The rule only bites on a tray that has a lip, and the lip is off by default.
      p.settings = { ...p.settings, ...over, lip: { ...p.settings.lip, enabled: true, ...lip } };
      return p;
    };
    const bearing = [[field.lipBearing, "/settings/bottomChamfer"]];
    expect(validateProject(withLip({ bottomChamfer: 1.19 }))).toEqual([]);
    expect(codes(validateProject(withLip({ bottomChamfer: 1.2 })))).toEqual(bearing);
    expect(settingsValid(withLip({ bottomChamfer: 1.2 }).settings)).toBe(false);
    // Play scales with fit: 1.7 − 2 × 0.25 × 1.4 = 1 mm.
    expect(validateProject(withLip({ bottomChamfer: 0.99, fit: 1.4 }))).toEqual([]);
    expect(codes(validateProject(withLip({ bottomChamfer: 1, fit: 1.4 })))).toEqual(bearing);
    // Upper trays keep UPPER_MIN_CHAMFER (0.5 mm) whatever bottomChamfer says.
    expect(validateProject(withLip({ bottomChamfer: 0 }, { ledge: 1.01 }))).toEqual([]);
    expect(codes(validateProject(withLip({ bottomChamfer: 0 }, { ledge: 1 })))).toEqual(bearing);
    // Without a lip nothing rests on a ledge.
    expect(validateProject(withLip({ bottomChamfer: 1.2 }, { enabled: false }))).toEqual([]);
  });

  it("checks the lip bearing only with the chamfer, ledge, play and fit in range", () => {
    for (const [over, lip, path] of [
      [{ bottomChamfer: 3.1 }, {}, "/settings/bottomChamfer"],
      [{}, { ledge: 0.4 }, "/settings/lip/ledge"],
      [{}, { play: 2.1 }, "/settings/lip/play"],
      [{ fit: 3.1 }, {}, "/settings/fit"],
    ] as const) {
      const p = newProject();
      p.settings = { ...p.settings, ...over, lip: { ...p.settings.lip, ...lip } };
      expect(codes(validateProject(p))).toEqual([[field.setting, path]]);
    }
    // A chamfer over maxBottomChamfer gets that notice only.
    const p = newProject();
    p.settings = { ...p.settings, bottomChamfer: 2 };
    expect(codes(validateProject(p))).toEqual([[field.bottomChamfer, "/settings/bottomChamfer"]]);
  });

  it("does not add a chamfer notice when the wall, floor or chamfer is out of range", () => {
    const p = newProject();
    p.settings = { ...p.settings, wall: 0.5, bottomChamfer: 3 };
    expect(codes(validateProject(p))).toEqual([[field.setting, "/settings/wall"]]);
    p.settings = { ...p.settings, wall: Number.NaN };
    expect(codes(validateProject(p))).toEqual([[field.setting, "/settings/wall"]]);
  });

  it("allows a floor notch of 0 to 50 mm and a wall and divider room of 0 to 20 mm", () => {
    for (const [key, max] of [
      ["floorNotch", 50],
      ["wallRoom", 20],
      ["dividerRoom", 20],
    ] as const) {
      const p = newProject();
      for (const value of [0, max]) {
        p.settings = { ...p.settings, fingerPocket: { ...p.settings.fingerPocket, [key]: value } };
        expect(validateProject(p), `${key} ${value}`).toEqual([]);
      }
      p.settings = {
        ...p.settings,
        fingerPocket: { ...p.settings.fingerPocket, [key]: max + 0.01 },
      };
      expect(codes(validateProject(p))).toEqual([[field.setting, `/settings/fingerPocket/${key}`]]);
    }
  });
});
