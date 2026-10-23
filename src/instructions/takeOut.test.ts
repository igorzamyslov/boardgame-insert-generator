// src/instructions/takeOut.test.ts
// @vitest-environment jsdom
// The order to take the parts out (the packing guide's rows read from the last up) and the line
// that says how to lift each one: `packingGuide` in render.ts, with the grips of lift.ts.
import { describe, expect, it } from "vitest";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { printableParts } from "../layout";
import { parseProject } from "../model/schema";
import type { Component, FeatureSpec, Project, StoredLayout } from "../model/types";
import { loadSeed } from "../test-support/harbourKings";
import owner5 from "../../test/fixtures/star-realms-owner-5.json";
import { packingGuide } from "./render";

const cutOut: FeatureSpec = {
  type: "wallCutout",
  side: "left",
  at: 10,
  width: 18,
  depth: 12,
  floorNotch: 0,
};

/** A tray holding `name`, with a finger cut unless told otherwise. */
function holding(name: string, over: Parameters<typeof makeTray>[0] = {}, cut = true) {
  return makeTray({
    key: `${name}:p0:0`,
    x: 0,
    y: 0,
    w: 100,
    d: 80,
    h: 40,
    compartments: [
      {
        x: 1.6,
        y: 1.6,
        w: 20,
        d: 20,
        floorZ: 1.2,
        kind: "well",
        contents: `${name} ×10`,
        features: cut ? [cutOut] : [],
      },
    ],
    ...over,
  });
}

/** A solid strip: a leftover with nothing to hold. */
const strip = (key: string, over: Parameters<typeof makeTray>[0]) =>
  makeTray({ key, part: "leftover", solid: true, compartments: [], stack: 9, h: 40, ...over });

function projectOf(names: string[]): Project {
  const base = fixtureProject();
  const proto = base.components[0] as Component;
  return {
    ...base,
    components: names.map((n, i) => ({ ...structuredClone(proto), id: `comp000${i}`, name: n })),
  };
}

const rowsOf = (trays: ReturnType<typeof makeTray>[], names: string[]) =>
  packingGuide(makeLayout("h", trays), projectOf(names)).map((l) => l.rows);

const keys = (rows: { key: string }[] | undefined) => rows?.map((r) => r.key);

describe("the order to take the parts out", () => {
  it("packs a strip with nothing to hold before the tray beside it, so that tray comes out first", () => {
    const rows = rowsOf(
      [holding("Anchors"), strip("leftover:0", { x: 0, y: 80.2, w: 100, d: 10 })],
      ["Anchors"],
    );
    // by name the tray would come first; the strip waits for it, so it is packed before it
    expect(keys(rows[0])).toEqual(["leftover:0", "Anchors:p0:0"]);
    const [filler, tray] = rows[0] ?? [];
    expect(filler?.noGrip).toBe(true);
    expect(filler?.grip).toBe("none");
    expect(filler?.lift).toBe("Take out Anchors first, then tip it out");
    expect(tray?.noGrip).toBe(false);
    expect(tray?.lift).toBe("Lift it by the finger cut");
  });

  it("leaves the order as it was when every part has a grip", () => {
    const rows = rowsOf(
      [holding("Banners", { x: 110, stack: 1 }), holding("Anchors")],
      ["Anchors", "Banners"],
    );
    expect(rows[0]?.map((r) => r.name)).toEqual(["Anchors", "Banners"]);
    expect(rows[0]?.every((r) => !r.noGrip)).toBe(true);
  });

  it("waits for the neighbour with a grip of its own, even when a gripless one touches more", () => {
    // Anchors has no cut and shares 80 mm of edge with the strip; Banners has one and shares 20 mm
    const rows = rowsOf(
      [
        holding("Anchors", {}, false),
        strip("leftover:0", { x: 100.2, y: 0, w: 10, d: 80 }),
        holding("Banners", { x: 110.4, y: 0, d: 20, stack: 1 }),
      ],
      ["Anchors", "Banners"],
    );
    const filler = rows[0]?.find((r) => r.key === "leftover:0");
    expect(filler?.lift).toBe("Take out Banners first, then tip it out");
    const order = keys(rows[0]) ?? [];
    expect(order.indexOf("leftover:0")).toBeLessThan(order.indexOf("Banners:p0:0"));
  });

  it("asks nothing of a neighbour in a layer above, which is already out", () => {
    // a tall strip beside Banners, a tray of the layer above whose height it shares
    const rows = rowsOf(
      [
        strip("leftover:0", { x: 0, y: 0, w: 10, d: 80, h: 80 }),
        holding("Banners", { x: 10.2, level: 1, z: 40, stack: 1 }),
      ],
      ["Banners"],
    );
    expect(rows[0]?.[0]?.lift).toBe("Take out Banners first, then tip it out");
    expect(keys(rows[0])).toEqual(["leftover:0"]);
    expect(keys(rows[1])).toEqual(["Banners:p0:0"]);
  });

  it("chains strips: the one beside a strip waits for it, and that one for the tray", () => {
    const rows = rowsOf(
      [
        holding("Anchors"),
        strip("leftover:0", { x: 100.2, y: 0, w: 10, d: 80 }),
        strip("leftover:1", { x: 110.4, y: 0, w: 10, d: 80 }),
      ],
      ["Anchors"],
    );
    // packed: far strip, near strip, tray; so out: tray, near strip, far strip
    expect(keys(rows[0])).toEqual(["leftover:1", "leftover:0", "Anchors:p0:0"]);
    const lift = (key: string) => rows[0]?.find((r) => r.key === key)?.lift;
    expect(lift("leftover:0")).toBe("Take out Anchors first, then tip it out");
    // the far strip names the near one (the strips are "Spacer 1 by Anchors" and "Spacer 2 by …")
    expect(lift("leftover:1")).toBe("Take out Spacer 1 by Anchors first, then tip it out");
  });

  it("breaks a loop: of two strips beside only each other, one tips out of the box", () => {
    const rows = rowsOf(
      [
        holding("Anchors", { x: 200 }),
        strip("leftover:0", { x: 0, y: 0, w: 10, d: 80 }),
        strip("leftover:1", { x: 10.2, y: 0, w: 10, d: 80 }),
      ],
      ["Anchors"],
    );
    const lifts = (rows[0] ?? []).filter((r) => r.grip === "none").map((r) => r.lift);
    expect(lifts).toHaveLength(2);
    expect(lifts.filter((l) => l === "Tip it out of the box")).toHaveLength(1);
    expect(lifts.filter((l) => l.startsWith("Take out "))).toHaveLength(1);
  });

  it("packs what stands on a tray after it, wherever its name would put it", () => {
    // a strip sorts before "Zebra", but it stands on Zebra and has to come out first
    const rows = rowsOf(
      [holding("Zebra"), strip("leftover:0", { x: 10, y: 10, w: 20, d: 20, h: 10, z: 40 })],
      ["Zebra"],
    );
    expect(keys(rows[0])).toEqual(["Zebra:p0:0", "leftover:0"]);
    expect(rows[0]?.[1]?.lift).toBe("Tip it out of the box");
  });

  it("is the same whatever order the trays come in", () => {
    const trays = [
      holding("Anchors"),
      strip("leftover:0", { x: 100.2, y: 0, w: 10, d: 80 }),
      strip("leftover:1", { x: 110.4, y: 0, w: 10, d: 80 }),
      holding("Banners", { x: 120.6, stack: 1 }),
    ];
    const forward = rowsOf(trays, ["Anchors", "Banners"]);
    expect(rowsOf([...trays].reverse(), ["Anchors", "Banners"])).toEqual(forward);
  });

  it("puts the parts that go with a tray before it, as they come out of it first", () => {
    const rows = rowsOf(
      [
        holding("Anchors"),
        makeTray({
          key: "Anchors:p0:0:divider:1",
          part: "divider",
          path: "",
          solid: true,
          compartments: [],
        }),
      ],
      ["Anchors"],
    );
    // packed tray first, divider after: out, the divider before the tray
    expect(keys(rows[0])).toEqual(["Anchors:p0:0", "Anchors:p0:0:divider:1"]);
  });
});

describe("the line that says how to lift a part", () => {
  it("says how to lift the parts that go with a tray: a divider by its edge, a spacer by its notch", () => {
    const rows = rowsOf(
      [
        holding("Anchors"),
        makeTray({
          key: "Anchors:p0:0:divider:1",
          part: "divider",
          path: "",
          solid: true,
          compartments: [],
        }),
        makeTray({
          key: "Anchors:p0:0:spacer",
          part: "spacer",
          path: "",
          solid: true,
          compartments: [],
          features: [{ type: "spacerNotch", axis: "x", at: 10, width: 18, depth: 8 }],
        }),
      ],
      ["Anchors"],
    );
    const lifts = Object.fromEntries((rows[0] ?? []).map((r) => [r.key, r.lift]));
    expect(lifts["Anchors:p0:0:divider:1"]).toBe("Empty one side first, then pinch its top edge");
    expect(lifts["Anchors:p0:0:spacer"]).toBe("Lift it by the finger cut");
  });

  it("flags a tray whose only grip is its contents, with its line", () => {
    const [row] = rowsOf([holding("Anchors", {}, false)], ["Anchors"])[0] ?? [];
    expect(row?.grip).toBe("contents");
    expect(row?.noGrip).toBe(true);
    expect(row?.lift).toBe("Empty it first, then lift it from inside");
  });

  it("names the tray a solid riser carries, and puts the riser's row before its tray's", () => {
    const rows = rowsOf(
      [
        holding("Anchors", { z: 10.6 }),
        makeTray({
          key: "Anchors:p0:0:riser",
          part: "riser",
          path: "",
          solid: true,
          compartments: [],
          h: 10.6,
        }),
      ],
      ["Anchors"],
    );
    expect(rows[0]?.map((r) => r.name)).toEqual(["Riser under Anchors", "Anchors"]);
    expect(rows[0]?.[0]?.lift).toBe("Take out Anchors first, then tip it out");
  });

  it("tells a spacer with no way in to wait for what its tray holds", () => {
    const rows = rowsOf(
      [
        holding("Anchors"),
        makeTray({
          key: "Anchors:p0:0:spacer",
          part: "spacer",
          path: "",
          solid: true,
          compartments: [],
        }),
      ],
      ["Anchors"],
    );
    const plate = rows[0]?.find((r) => r.key === "Anchors:p0:0:spacer");
    expect(plate?.noGrip).toBe(true);
    expect(plate?.lift).toBe("Take out what Anchors holds first, then tip it out");
  });
});

describe("on real plans", () => {
  const guideOf = (project: Project) => {
    const trays = printableParts(project.layout?.trays ?? [], {
      components: project.components,
      settings: project.settings,
      printer: project.printer,
      locks: project.locks,
    }).trays;
    return packingGuide({ ...(project.layout as StoredLayout), trays }, project);
  };

  it("lifts the two strips of Harbour Kings by their finger dips, so none is flagged", () => {
    const layers = guideOf(loadSeed("harbour-kings").project);
    expect(layers.flatMap((l) => l.rows.filter((r) => r.noGrip))).toEqual([]);
    const strips = layers
      .flatMap((l) => l.rows)
      .filter((r) => r.name === "Spacer by Event cards" || r.name === "Spacer by Starter decks 1");
    expect(strips.map((r) => [r.name, r.lift])).toEqual([
      ["Spacer by Event cards", "Lift it by the finger dip"],
      ["Spacer by Starter decks 1", "Lift it by the finger dip"],
    ]);
  });

  it("lifts every tray of the owner's Star Realms plan by its finger cut, the top layer first", () => {
    const parsed = parseProject(owner5);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    const layers = guideOf(parsed.project);
    expect(layers.map((l) => l.title)).toEqual([
      "Layer 1 (bottom)",
      "Layer 2",
      "Layer 3",
      "Layer 4 (top)",
    ]);
    const trays = layers.flatMap((l) => l.rows).filter((r) => r.grip === "finger-cut");
    expect(trays.map((r) => r.name)).toEqual([
      "Counter",
      "Trade deck",
      "Starter deck 1",
      "Starter deck 2",
      "Starter deck 3",
    ]);
    // the merged spares are open boxes with a pocket to reach into
    expect(layers[0]?.rows.filter((r) => r.grip === "pocket")).toHaveLength(2);
    expect(layers.flatMap((l) => l.rows).some((r) => r.noGrip)).toBe(false);
  });
});
