// src/instructions/render.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { DEFAULT_SETTINGS } from "../model/settings";
import { shadeHex } from "../ui/identity";
import type { Component, Project, ReservedSpec } from "../model/types";
import { planFrame } from "../plan/layers";
import { pngSize, svgDataUrl } from "./png";
import { escapeXml, layerInfo, packingGuide, render, truncate, whatGoesWhere } from "./render";

/** The guide's part names, layer by layer, in the order to put them in the box. */
const guideNames = (l: ReturnType<typeof makeLayout>, p: Project): string[][] =>
  packingGuide(l, p).map((layer) => layer.rows.map((r) => r.name));

const bottom = makeTray({
  key: "a:p0:0",
  stack: 0,
  level: 0,
  x: 0,
  y: 0,
  w: 120,
  d: 90,
  h: 30,
  lip: true, // the top tray stands on it
});
const spacer = makeTray({
  key: "a:p0:0:spacer",
  part: "spacer",
  path: "",
  stack: 0,
  level: 0,
  x: 5,
  y: 5,
  w: 10,
  d: 60,
  h: 20,
  solid: true,
  compartments: [],
});
const top = makeTray({
  key: "b:p0:0",
  stack: 0,
  level: 1,
  x: 0, // flush on the tray below: a stored 0.8 upper tray has the same footprint and a groove's wall
  y: 0,
  z: 30,
  w: 120,
  d: 90,
  h: 25,
  compartments: [
    {
      x: 3,
      y: 3,
      w: 100,
      d: 70,
      floorZ: 1.2,
      kind: "scoop",
      contents: "<Coins> & gems",
      features: [],
    },
  ],
});
const side = makeTray({ key: "c:p0:0", stack: 1, level: 0, x: 130, y: 0, w: 100, d: 90, h: 55 });
const layout = makeLayout("h", [bottom, spacer, top, side]);

/** The cards-heavy project with the two components the layouts below hold, named for them. */
function namedProject(): Project {
  const project = fixtureProject();
  const base = project.components[0] as Component;
  const named = (id: string, name: string): Component => ({
    ...structuredClone(base),
    id,
    name,
  });
  return {
    ...project,
    components: [named("deck0001", "Deck A"), named("coin0001", "<Coins> & gems")],
  };
}

const named = namedProject();

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

describe("render", () => {
  it("draws one well-formed SVG per layer, bottom first", () => {
    const svgs = render(layout, named);
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      expect(parse(svg).getElementsByTagName("parsererror")).toHaveLength(0);
      expect(svg).toContain(">Front<");
    }
    const [first, second] = svgs;
    expect(first).toContain("<title>Layer 1 of 2</title>");
    // each part has a badge with its short name, in capitals, as engraved on it
    expect(first).toContain(">DECK 1</text>");
    expect(first).toContain(">SPAC DEC 2</text>");
    expect(first).toContain(">DECK 2</text>");
    expect(second).toContain(">COINS</text>");
    // and the full name where the tray has room for a caption
    expect(second).toContain("&lt;Coins&gt; &amp; gems");
    // layer 2 shows the trays of layer 1 as ghosts: the two decks (the spacer is not a tray)
    expect(second).toContain(">DECK 1</text>");
    expect(second).toContain(">DECK 2</text>");
    expect(second).not.toContain(">SPAC DEC 2</text>");
    // no number is drawn as a label
    expect(first).not.toMatch(/>\d<\/text>/);
  });

  it("draws every name after every shape, so no shape can cover one", () => {
    // A spacer centred on its tray used to be painted over the tray's badge.
    const covered = makeLayout("h", [
      makeTray({ key: "a:p0:0", x: 0, y: 0, w: 100, d: 80 }),
      makeTray({
        key: "a:p0:0:spacer",
        part: "spacer",
        path: "",
        x: 40,
        y: 30,
        w: 20,
        d: 20,
        solid: true,
        compartments: [],
      }),
      makeTray({ key: "tiny:p0:0", stack: 1, x: 110, y: 0, w: 4, d: 4, compartments: [] }),
    ]);
    const [svg] = render(covered, named);
    const doc = parse(svg ?? "");
    const all = [...doc.documentElement.querySelectorAll("*")];
    // the shapes are the outline, the trays (rx 1.5) and the spacers; the badge pills are rounder
    const isShape = (e: Element) =>
      e.tagName === "rect" && (e.getAttribute("rx") ?? "1.5") === "1.5";
    const lastShape = all.map(isShape).lastIndexOf(true);
    const badges = all.filter(
      (e) => e.tagName === "text" && e.getAttribute("font-weight") === "700",
    );
    expect(badges).toHaveLength(3);
    for (const t of badges) {
      expect(all.indexOf(t)).toBeGreaterThan(lastShape);
      // each name sits on its own white pill, drawn right before it
      expect(all[all.indexOf(t) - 1]?.tagName).toBe("rect");
    }
    // a tray too small for its badge gets a leader line
    expect(doc.getElementsByTagName("line").length).toBeGreaterThan(0);
  });

  // light-dark() and var() are CSS-only: a standalone SVG, and so the PNG made from it, shows
  // nothing for them. Paper colours must be plain hex (shadeHex(kind, i, "light") when they move
  // to the per-component shades).
  it("keeps CSS-only colour functions out of the SVG and its data URL", () => {
    const comp = (key: string, contents: string, x: number) =>
      makeTray({
        key,
        x,
        y: 0,
        w: 40,
        d: 30,
        compartments: [
          { x: 1, y: 1, w: 30, d: 20, floorZ: 1, kind: "well", contents, features: [] },
        ],
      });
    const two = makeLayout("h", [
      comp("a:p0:0", "Action ×10", 0),
      comp("b:p0:0", "Market ×10", 50),
    ]);
    const svgs = render(two, fixtureProject());
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      for (const text of [svg, decodeURIComponent(svgDataUrl(svg))]) {
        expect(text).not.toContain("light-dark(");
        expect(text).not.toContain("var(");
      }
      const colours = [...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]);
      for (const c of colours) {
        // The spacer hatch is a pattern the SVG defines itself.
        expect(c, `colour ${c}`).toMatch(/^(none|#[0-9a-f]{3,8}|url\(#spacer-hatch\))$/i);
      }
    }
  });

  it("fills each tray with the tint of its component and adds the kind glyph", () => {
    const comp = (key: string, contents: string, x: number) =>
      makeTray({
        key,
        x,
        y: 0,
        w: 40,
        d: 30,
        compartments: [
          { x: 1, y: 1, w: 30, d: 20, floorZ: 1, kind: "well", contents, features: [] },
        ],
      });
    const tinted = makeLayout("h", [
      comp("a:p0:0", "Action ×10", 0),
      comp("b:p0:0", "Market ×10", 50),
      comp("c:p0:0", "Objectives ×10", 100),
    ]);
    const project = fixtureProject();
    const [svg] = render(tinted, project);
    const fills = [...parse(svg ?? "").querySelectorAll('rect[rx="1.5"]')].map((r) =>
      r.getAttribute("fill"),
    );
    // Each component has its own shade of its kind's hue, as on screen, in plain hex.
    const comps = project.components;
    const shades = comps
      .slice(0, 3)
      .map((c, i) =>
        shadeHex(
          c.kind,
          comps.slice(0, i).filter((x) => x.kind === c.kind).length,
          "light",
        ).fill.toLowerCase(),
      );
    expect(new Set(shades).size).toBe(3);
    expect(fills.map((f) => f?.toLowerCase())).toEqual(shades);
    // one cards glyph per tray, stroked, unfilled
    const glyphs = parse(svg ?? "").querySelectorAll("g[transform]");
    expect(glyphs).toHaveLength(3);
    expect(glyphs[0]?.getAttribute("stroke")).toBe("#333333");
    expect(glyphs[0]?.getAttribute("fill")).toBe("none");
  });

  it("hatches spacers with a dashed edge, and defines the hatch only where a spacer is drawn", () => {
    const withSpacer = makeLayout("h", [bottom, spacer]);
    const [svg] = render(withSpacer, named);
    const doc = parse(svg ?? "");
    expect(doc.querySelectorAll("pattern#spacer-hatch")).toHaveLength(1);
    const hatched = [...doc.querySelectorAll("rect")].filter(
      (r) => r.getAttribute("fill") === "url(#spacer-hatch)",
    );
    expect(hatched).toHaveLength(1);
    expect(hatched[0]?.getAttribute("stroke")).toBe("#6e695c");
    expect(hatched[0]?.getAttribute("stroke-dasharray")).toBeTruthy();
    const [plain] = render(makeLayout("h", [bottom]), named);
    expect(plain).not.toContain("spacer-hatch");
  });

  it("leaves spare and leftover trays white with a dashed outline and no glyph", () => {
    const spare = makeLayout("h", [
      makeTray({ key: "a:p0:0", x: 0, y: 0, part: "leftover", solid: false }),
      makeTray({ key: "b:p0:0", stack: 1, x: 120, y: 0 }),
    ]);
    const [svg] = render(spare, fixtureProject());
    const rects = [...parse(svg ?? "").querySelectorAll('rect[rx="1.5"]')];
    expect(rects).toHaveLength(2);
    for (const r of rects) {
      expect(r.getAttribute("fill")).toBe("#ffffff");
      expect(r.getAttribute("stroke-dasharray")).toBeTruthy();
    }
    expect(parse(svg ?? "").querySelectorAll("g[transform]")).toHaveLength(0);
  });

  it("draws no kind glyph on a tray too small for one", () => {
    const small = makeLayout("h", [
      makeTray({
        x: 0,
        y: 0,
        w: 6,
        d: 40,
        compartments: [
          { x: 1, y: 1, w: 3, d: 30, floorZ: 1, kind: "well", contents: "Action ×1", features: [] },
        ],
      }),
    ]);
    const [svg] = render(small, fixtureProject());
    expect(parse(svg ?? "").querySelectorAll("g[transform]")).toHaveLength(0);
  });

  it("draws the trays of the layer below as grey ghosts with their names, and none on layer 1", () => {
    const [first, second] = render(layout, named);
    const ghosts = (svg: string | undefined) =>
      [...parse(svg ?? "").querySelectorAll("rect")].filter(
        (r) => r.getAttribute("stroke") === "#767676",
      );
    expect(ghosts(first)).toHaveLength(0);
    expect(ghosts(second)).toHaveLength(2);
    const grey = [...parse(second ?? "").querySelectorAll("text")].filter(
      (t) => t.getAttribute("fill") === "#767676",
    );
    expect(grey.map((t) => t.textContent)).toEqual(["DECK 1", "DECK 2"]);
    expect(ghosts(second)[0]?.getAttribute("fill")).toBe("none");
  });

  it("escapes XML", () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;",
    );
  });
});

describe("text safety", () => {
  it("drops characters XML 1.0 forbids and lone surrogates, keeps real pairs", () => {
    expect(escapeXml("a\u0000b\u0001c\u000Bd\u001Fe\uFFFEf\uFFFFg")).toBe("abcdefg");
    expect(escapeXml("x\uD800y\uDC00z")).toBe("xyz");
    expect(escapeXml("tab\there\nline\r")).toBe("tab\there\nline\r");
    expect(escapeXml("dice \u{1F3B2}")).toBe("dice \u{1F3B2}");
  });

  it("truncates without cutting a surrogate pair in half", () => {
    expect(truncate("ab\u{1F3B2}cd", 4)).toBe("ab…");
    expect(truncate("abc\u{1F3B2}d", 5)).toBe("abc…");
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 3)).toBe("abc");
  });

  it("draws a label with control characters as well-formed SVG", () => {
    const messy = makeLayout("h", [
      makeTray({
        compartments: [
          {
            x: 2,
            y: 2,
            w: 90,
            d: 70,
            floorZ: 1,
            kind: "well",
            contents: "Co\u0001ins\uD83D",
            features: [],
          },
        ],
      }),
    ]);
    const base = named.components[0] as Component;
    const project = {
      ...named,
      components: [{ ...structuredClone(base), id: "messy001", name: "Co\u0001ins\uD83D" }],
    };
    const [svg] = render(messy, project);
    expect(parse(svg ?? "").getElementsByTagName("parsererror")).toHaveLength(0);
    expect(svg).toContain("Coins");
  });
});

describe("packing order and parts list", () => {
  it("still places a spacer whose tray is not in the layout", () => {
    const orphan = makeLayout("h", [
      makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
      makeTray({
        key: "gone:p0:0:spacer",
        part: "spacer",
        path: "",
        stack: 0,
        level: 0,
        solid: true,
        compartments: [],
      }),
    ]);
    // the spacer has no tray to follow: it is last in its layer
    expect(guideNames(orphan, named)).toEqual([["Deck A", "Spacer by Deck A"]]);
  });

  it("stands each divider in its tray, after the tray is placed, and keeps it out of the layers", () => {
    const withDividers = makeLayout("h", [
      makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
      ...[1, 2].map((n) =>
        makeTray({
          key: `a:p0:0:divider:${n}`,
          part: "divider",
          path: "",
          stack: 0,
          level: 0,
          solid: true,
          compartments: [],
        }),
      ),
    ]);
    expect(guideNames(withDividers, named)).toEqual([
      ["Deck A", "Divider 1 in Deck A", "Divider 2 in Deck A"],
    ]);
    expect(layerInfo(withDividers, named.components)).toEqual([
      { layer: 1, title: "Layer 1 (bottom)", trays: ["Deck A"] },
    ]);
    expect(whatGoesWhere(withDividers, named).map((r) => [r.name, r.goesInto])).toEqual([
      ["Deck A", null],
      ["Divider 1 in Deck A", "Deck A"],
      ["Divider 2 in Deck A", "Deck A"],
    ]);
    // every divider has a badge with its name on the plan
    const [svg] = render(withDividers, named);
    expect(svg).toContain(">DIV1 DECK</text>");
    expect(svg).toContain(">DIV2 DECK</text>");
  });

  it("places a riser first and stands its tray on it, leaving it out of the layers", () => {
    const withRiser = makeLayout("h", [
      makeTray({ key: "a:p0:0", stack: 0, level: 0, z: 12 }),
      makeTray({
        key: "a:p0:0:riser",
        part: "riser",
        path: "",
        stack: 0,
        level: 0,
        z: 0,
        h: 12,
        solid: true,
        compartments: [],
      }),
    ]);
    expect(guideNames(withRiser, named)).toEqual([["Riser under Deck A", "Deck A"]]);
    expect(layerInfo(withRiser, named.components)).toEqual([
      { layer: 1, title: "Layer 1 (bottom)", trays: ["Deck A"] },
    ]);
    expect(render(withRiser, named)).toHaveLength(1);
    const rows = whatGoesWhere(withRiser, named);
    expect(rows.map((r) => [r.name, r.goesInto, r.carries])).toEqual([
      ["Riser under Deck A", null, "Deck A"],
      ["Deck A", null, null],
    ]);
  });

  it("still places a riser whose tray is not in the layout", () => {
    const orphan = makeLayout("h", [
      makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
      makeTray({ key: "gone:p0:0:riser", part: "riser", path: "", stack: 5, level: 0 }),
    ]);
    expect(guideNames(orphan, named)[0]?.at(-1)).toBe("Riser under Deck A");
  });

  it("packs bottom layer first, spacers after their tray", () => {
    expect(guideNames(layout, named)).toEqual([
      ["Deck A 1", "Spacer by Deck A 2", "Deck A 2"],
      ["<Coins> & gems"],
    ]);
  });

  it("titles the layers and lists their trays", () => {
    expect(layerInfo(layout, named.components)).toEqual([
      { layer: 1, title: "Layer 1 (bottom)", trays: ["Deck A 1", "Deck A 2"] },
      { layer: 2, title: "Layer 2 (top)", trays: ["<Coins> & gems"] },
    ]);
    const three = makeLayout("h", [
      makeTray({ key: "a:p0:0", level: 0 }),
      makeTray({ key: "b:p0:0", level: 1, z: 40 }),
      makeTray({ key: "c:p0:0", level: 2, z: 80 }),
    ]);
    expect(layerInfo(three, named.components).map((l) => l.title)).toEqual([
      "Layer 1 (bottom)",
      "Layer 2",
      "Layer 3 (top)",
    ]);
    expect(layerInfo(makeLayout("h", [makeTray()]), named.components).map((l) => l.title)).toEqual([
      "Layer 1 (bottom)",
    ]);
  });

  it("says what each part is engraved as: its short name in capitals, nothing for a plate or a tiny part", () => {
    // the same trays as above, with the lip left off the one that could not be planned with it
    const valid = makeLayout("h", [{ ...bottom, lip: false, w: 120, d: 90 }, spacer, top, side]);
    const rows = whatGoesWhere(valid, named);
    // trays carry the short name drawn on the diagrams; the spacer is a plate and carries none
    expect(rows.map((r) => [r.name, r.engraved, r.tooSmall])).toEqual([
      ["Deck A 1", "DECK 1", false],
      ["Spacer by Deck A 2", null, false],
      ["<Coins> & gems", "COINS", false],
      ["Deck A 2", "DECK 2", false],
    ]);
    // a tray 4 mm across has no room for any name, and the guide says so
    const tiny = makeLayout("h", [
      makeTray({ key: "a:p0:0", w: 4, d: 4, h: 30, compartments: [] }),
      makeTray({ key: "b:p0:0", stack: 1, x: 10 }),
    ]);
    const [small, roomy] = whatGoesWhere(tiny, named);
    expect(small).toMatchObject({ engraved: null, tooSmall: true });
    expect(roomy?.engraved).not.toBeNull();
    // a part that cannot be planned at all (the fixture's lipped tray) is neither engraved nor
    // "too small": nothing can be said of its name
    expect(whatGoesWhere(layout, named)[0]).toMatchObject({ engraved: null, tooSmall: false });
    // with the engraving off nothing is engraved and nothing is too small to carry a name
    const off = { ...named, settings: { ...named.settings, engraveNames: false } };
    expect(whatGoesWhere(tiny, off).map((r) => [r.engraved, r.tooSmall])).toEqual([
      [null, false],
      [null, false],
    ]);
  });

  it("says where each part stands, to 0.1 mm", () => {
    const rows = whatGoesWhere(
      makeLayout("h", [makeTray({ x: 12, y: 30.04 }), makeTray({ key: "b:p0:0", x: 0.26, y: 0 })]),
      named,
    );
    expect(rows.map((r) => r.position)).toEqual([
      "12 mm from the left, 30 mm from the front",
      "0.3 mm from the left, 0 mm from the front",
    ]);
  });

  it("lists what goes where", () => {
    const rows = whatGoesWhere(layout, named);
    expect(rows.map((r) => [r.name, r.layer, r.goesInto])).toEqual([
      ["Deck A 1", 1, null],
      ["Spacer by Deck A 2", 1, "Deck A 1"],
      ["<Coins> & gems", 2, null],
      ["Deck A 2", 1, null],
    ]);
    // the lipped bottom tray prints taller than its h: 30 + the lip height
    expect(rows[0]?.size).toBe(
      `120.0 × 90.0 × ${(30 + DEFAULT_SETTINGS.lip.height).toFixed(1)} mm with its lip`,
    );
    expect(rows[3]?.size).toBe("100.0 × 90.0 × 55.0 mm");
    expect(rows[2]?.contents).toEqual(["<Coins> & gems"]);
  });
});

describe("png helpers", () => {
  it("builds a data URL and keeps the aspect ratio", () => {
    expect(svgDataUrl("<svg/>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
    expect(pngSize('<svg viewBox="-4.5 -4.5 209 125">', 1000)).toEqual({
      width: 1000,
      height: 598,
    });
  });
});

describe("the order of the packing guide", () => {
  /** A project whose components are called `names`, and a tray holding each of them. */
  function trayFor(name: string, over: Parameters<typeof makeTray>[0] = {}) {
    return makeTray({
      key: `${name}:p0:0`,
      compartments: [
        {
          x: 1.6,
          y: 1.6,
          w: 20,
          d: 20,
          floorZ: 1.2,
          kind: "well",
          contents: `${name} ×10`,
          features: [],
        },
      ],
      ...over,
    });
  }
  function projectOf(names: string[]): Project {
    const base = fixtureProject();
    const proto = base.components[0] as Component;
    return {
      ...base,
      components: names.map((n, i) => ({ ...structuredClone(proto), id: `comp000${i}`, name: n })),
    };
  }

  it("goes layer by layer, bottom first, whatever order the trays come in", () => {
    const names = ["Tiles", "Miniatures", "Cards", "Dice"];
    const project = projectOf(names);
    const shuffled = makeLayout("h", [
      trayFor("Dice", { level: 2, z: 80, stack: 3 }),
      trayFor("Tiles", { level: 0, stack: 0 }),
      trayFor("Cards", { level: 1, z: 40, stack: 1 }),
      trayFor("Miniatures", { level: 1, z: 40, stack: 2 }),
    ]);
    expect(guideNames(shuffled, project)).toEqual([["Tiles"], ["Cards", "Miniatures"], ["Dice"]]);
    expect(packingGuide(shuffled, project).map((l) => l.title)).toEqual([
      "Layer 1 (bottom)",
      "Layer 2",
      "Layer 3 (top)",
    ]);
  });

  it("orders a layer by name, counting numbers by value: Cards 2 before Cards 10", () => {
    const project = projectOf(["Cards"]);
    // Ten copies of one component are named Cards 1 … Cards 10; keys put 10 and 2 in odd places
    const trays = [10, 2, 1, 9, 3, 8, 4, 7, 5, 6].map((n, i) =>
      trayFor("Cards", { key: `Cards:p${n}:0`, stack: i, x: i * 5 }),
    );
    const [layer] = packingGuide(makeLayout("h", trays), project);
    expect(layer?.rows.map((r) => r.name)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `Cards ${n}`),
    );
  });

  it("is the same whatever the position or the input order of the trays in the layer", () => {
    const project = projectOf(["Banners", "Anchors", "Coins"]);
    const trays = [
      trayFor("Coins", { x: 0, y: 0, stack: 0 }),
      trayFor("Anchors", { x: 120, y: 0, stack: 1 }),
      trayFor("Banners", { x: 60, y: 90, stack: 2 }),
    ];
    const forward = guideNames(makeLayout("h", trays), project);
    const moved = guideNames(
      makeLayout(
        "h",
        [...trays].reverse().map((t) => ({ ...t, x: t.y, y: t.x })),
      ),
      project,
    );
    expect(forward).toEqual([["Anchors", "Banners", "Coins"]]);
    expect(moved).toEqual(forward);
  });

  it("lists a layer's trays for the picture's description in the guide's order, not the part numbers'", () => {
    const project = projectOf(["Banners", "Anchors", "Coins"]);
    const trays = [
      trayFor("Coins", { x: 0, y: 0, stack: 0 }),
      trayFor("Anchors", { x: 120, y: 0, stack: 1 }),
      trayFor("Banners", { x: 60, y: 90, stack: 2 }),
    ];
    const layout = makeLayout("h", trays);
    const [layer] = packingGuide(layout, project);
    expect(layer?.trays).toEqual(["Anchors", "Banners", "Coins"]);
    expect(layer?.trays).toEqual(layer?.rows.map((r) => r.name));
  });

  it("puts a riser before the tray it carries, and a spacer and dividers right after the tray", () => {
    const project = projectOf(["Anchors", "Banners"]);
    const addOn = (key: string, part: "riser" | "spacer" | "divider") =>
      makeTray({ key, part, path: "", solid: true, compartments: [], stack: 0, level: 0 });
    const trays = [
      trayFor("Banners", { stack: 1, x: 120 }),
      trayFor("Anchors", { stack: 0, z: 12 }),
      addOn("Anchors:p0:0:divider:2", "divider"),
      addOn("Anchors:p0:0:divider:1", "divider"),
      addOn("Anchors:p0:0:spacer", "spacer"),
      addOn("Anchors:p0:0:riser", "riser"),
    ];
    expect(guideNames(makeLayout("h", trays), project)).toEqual([
      [
        "Riser under Anchors",
        "Anchors",
        "Spacer by Banners", // a spacer is named by the component it spaces
        "Divider 1 in Anchors",
        "Divider 2 in Anchors",
        "Banners",
      ],
    ]);
  });

  it("puts a spare that nothing under it holds up first in its layer, and one resting on a tray after it", () => {
    const project = projectOf(["Anchors", "Banners"]);
    const strip = (key: string, o: Parameters<typeof makeTray>[0]) =>
      makeTray({ key, part: "leftover", solid: true, compartments: [], stack: 5, ...o });
    const member = (key: string, o: Parameters<typeof makeTray>[0]) => strip(key, o);
    const mergedOf = (key: string, o: Parameters<typeof makeTray>[0]) =>
      makeTray({
        key,
        part: "leftover",
        solid: true,
        compartments: [],
        stack: 5,
        merged: { members: [member(`${key}:m`, o)], bridges: [], flipped: false },
        ...o,
      });
    // a spare beside the trays (z 0), and one in the layer above, on top of Anchors (z 40)
    const beside = mergedOf("merged:0", { x: 200, y: 0, w: 10, d: 40, h: 35 });
    const above = mergedOf("merged:1", { x: 0, y: 0, w: 20, d: 20, h: 10, z: 40, level: 1 });
    const trays = [
      trayFor("Banners", { stack: 1, x: 100 }),
      trayFor("Anchors", { stack: 0 }),
      beside,
      above,
    ];
    const rows = guideNames(makeLayout("h", trays), project);
    // layer 1: the spare beside goes in first, then the trays by name
    expect(rows[0]?.slice(1)).toEqual(["Anchors", "Banners"]);
    expect(rows[0]?.[0]).toMatch(/^Spacer|^Spare/);
    // the layer above holds only the spare resting on Anchors, which is already in the box
    expect(rows[1]).toHaveLength(1);
  });

  it("puts a merged part that rests on a tray of its own layer right after that tray", () => {
    const project = projectOf(["Anchors", "Banners"]);
    const member = makeTray({
      key: "merged:0:m",
      part: "leftover",
      solid: true,
      compartments: [],
      stack: 5,
      x: 0,
      y: 0,
      w: 20,
      d: 20,
      h: 10,
      z: 40,
    });
    const resting = makeTray({
      ...member,
      key: "merged:0",
      merged: { members: [member], bridges: [], flipped: false },
    });
    const trays = [
      trayFor("Banners", { stack: 1, x: 100 }),
      trayFor("Anchors", { stack: 0 }),
      resting,
    ];
    const [layer] = packingGuide(makeLayout("h", trays), project);
    const names = layer?.rows.map((r) => r.name) ?? [];
    expect(names[0]).toBe("Anchors");
    expect(names[1]).toMatch(/^Spacer|^Spare/);
    expect(names[2]).toBe("Banners");
  });

  it("lists every part of the layout exactly once", () => {
    const project = projectOf(["Anchors", "Banners"]);
    const trays = [
      trayFor("Banners", { stack: 1, x: 120, level: 1, z: 40 }),
      trayFor("Anchors", { stack: 0 }),
      makeTray({ key: "Anchors:p0:0:spacer", part: "spacer", path: "", solid: true }),
      makeTray({ key: "gone:p0:0:divider:1", part: "divider", path: "", solid: true }),
    ];
    const flat = guideNames(makeLayout("h", trays), project).flat();
    expect(flat).toHaveLength(4);
    expect(new Set(flat).size).toBe(4);
  });

  it("is empty for a layout with no trays", () => {
    expect(packingGuide(makeLayout("h", []), projectOf(["Anchors"]))).toEqual([]);
  });
});

describe("a merged filler in the instructions", () => {
  const strip = (key: string, o: Parameters<typeof makeTray>[0]) =>
    makeTray({ key, part: "leftover", solid: true, compartments: [], stack: 5, ...o });
  const a = strip("leftover:0", { x: 130, y: 0, w: 10, d: 40 });
  const b = strip("leftover:1", { x: 130, y: 40.2, w: 10, d: 50 });
  const merged = makeTray({
    key: "merged:0",
    part: "leftover",
    solid: true,
    compartments: [],
    stack: 5,
    x: 130,
    y: 0,
    w: 10,
    d: 90.2,
    h: 35,
    merged: { members: [a, b], bridges: [], flipped: false },
  });
  const withMerged = makeLayout("h", [bottom, merged]);

  it("draws a shape per member and one badge with its name, on the larger", () => {
    const [svg] = render(withMerged, named);
    const doc = parse(svg ?? "");
    // the bottom tray and one rect per member (plus the box outline and the white page)
    const shapes = [...doc.querySelectorAll("rect")].filter((r) => r.getAttribute("rx") === "1.5");
    expect(shapes).toHaveLength(3);
    const badges = [...doc.querySelectorAll("text")].filter(
      (t) => t.getAttribute("font-weight") === "700",
    );
    expect(badges.map((t) => t.textContent).sort()).toEqual(["DECK", "SPAC DECK"]);
  });

  it("lists and places it as one part", () => {
    const rows = whatGoesWhere(withMerged, named);
    const row = rows.find((r) => r.name.startsWith("Spacer by"));
    expect(row).toMatchObject({ layer: 1, goesInto: null, carries: null });
    expect(rows).toHaveLength(2);
    expect(guideNames(withMerged, named).flat()).toContain(row?.name ?? "?");
  });
});

describe("a group's trays in the packing guide (spec §7.7)", () => {
  const kit = {
    id: "kit",
    name: "Player kit",
    copies: 2,
    access: "often" as const,
    memberIds: ["deck0001", "coin0001"],
  };
  const well = (id: string, contents: string, x: number, w: number) => ({
    x,
    y: 3,
    w,
    d: 80,
    floorZ: 1.2,
    kind: "well" as const,
    contents,
    componentId: id,
    features: [],
  });
  const copy = (n: number, x: number) =>
    makeTray({
      key: `kit:p${n}:0`,
      path: String(n),
      stack: n,
      level: 0,
      x,
      y: 0,
      w: 120,
      d: 90,
      h: 30,
      compartments: [well("deck0001", "Deck A ×50", 3, 50), well("coin0001", "Coins ×12", 60, 50)],
    });
  const own = makeTray({
    key: "own:p0:0",
    path: "5",
    stack: 5,
    level: 0,
    x: 250,
    y: 0,
    w: 80,
    d: 90,
    h: 30,
    compartments: [well("deck0001", "Deck A ×5", 3, 60)],
  });
  const grouped = { ...named, groups: [kit] };
  // an ungrouped tray of the project, for the unchanged look
  const lone = {
    ...named,
    components: [
      ...named.components,
      { ...(named.components[0] as Component), id: "hex00001", name: "Hex tiles" },
    ],
  };
  const kitLayout = makeLayout("h", [copy(0, 0), copy(1, 125)]);

  it("draws a group's tray in its group's hue with each well in its member's colours", () => {
    const [svg] = render(kitLayout, grouped);
    const doc = parse(svg ?? "");
    const rects = [...doc.querySelectorAll("rect")];
    const tray = rects.find(
      (r) =>
        r.getAttribute("fill") === shadeHex("group", 0, "light").fill &&
        r.getAttribute("rx") === "1.5",
    );
    expect(tray, "a tray in the group hue").toBeTruthy();
    expect(tray?.getAttribute("stroke")).toBe(shadeHex("group", 0, "light").line);
    const cards = shadeHex("cards", 0, "light");
    // both members are cards here: the second takes the second shade of the hue, as in the rail
    const bulk = shadeHex("cards", 1, "light");
    const wells = rects.filter((r) => r.getAttribute("data-well") !== null);
    expect(wells).toHaveLength(4);
    expect(wells[0]?.getAttribute("fill")).toBe(cards.fill);
    expect(wells[0]?.getAttribute("stroke")).toBe(cards.line);
    expect(wells[1]?.getAttribute("fill")).toBe(bulk.fill);
    expect(wells[1]?.getAttribute("stroke")).toBe(bulk.line);
    // a well sits where it is in the tray: x from the left, y from the front (the bottom)
    const t = tray as Element;
    expect(Number(wells[0]?.getAttribute("x"))).toBeCloseTo(Number(t.getAttribute("x")) + 3, 1);
    expect(Number(wells[0]?.getAttribute("y"))).toBeCloseTo(Number(t.getAttribute("y")) + 7, 1);
    expect(Number(wells[0]?.getAttribute("width"))).toBeCloseTo(50, 1);
    expect(Number(wells[0]?.getAttribute("height"))).toBeCloseTo(80, 1);
  });

  it("names each copy: a caption and a badge in the group's name, never a member's", () => {
    const [svg] = render(kitLayout, grouped);
    expect(svg).toContain("Player kit 1");
    expect(svg).toContain("Player kit 2");
    expect(svg).toContain(">PLAYER 1</text>");
    expect(svg).toContain(">PLAYER 2</text>");
    expect(svg).not.toContain("Deck A + ");
  });

  it("leaves an ungrouped tray as it was: its kind's fill, no wells drawn", () => {
    const [svg] = render(makeLayout("h", [own]), lone);
    const doc = parse(svg ?? "");
    expect(doc.querySelectorAll("rect[data-well]")).toHaveLength(0);
    expect(svg).toContain(`fill="${shadeHex("cards", 0, "light").fill}"`);
  });

  it("lists a row per copy, named by the group, holding its compartments in tray order", () => {
    const rows = whatGoesWhere(kitLayout, grouped);
    expect(rows.map((r) => r.name)).toEqual(["Player kit 1", "Player kit 2"]);
    expect(rows.map((r) => r.contents)).toEqual([
      ["Deck A ×50", "Coins ×12"],
      ["Deck A ×50", "Coins ×12"],
    ]);
    expect(rows.every((r) => r.contents.every((c) => !/\(P\d+\)/.test(c)))).toBe(true);
    expect(rows.map((r) => r.engraved)).toEqual(["PLAYER 1", "PLAYER 2"]);
  });

  it("says Player kit 1 … in the guide and the layer lists", () => {
    expect(guideNames(kitLayout, grouped)).toEqual([["Player kit 1", "Player kit 2"]]);
    expect(layerInfo(kitLayout, grouped.components, grouped.groups)[0]?.trays).toEqual([
      "Player kit 1",
      "Player kit 2",
    ]);
  });
});

describe("the paper that lies on top", () => {
  const project = fixtureProject();
  const frame = planFrame(project.box, project.settings);
  const reserved: ReservedSpec[] = [
    {
      area: 0,
      name: "Rulebook",
      x: frame.usableW - 200,
      y: frame.usableD - 120,
      w: 200,
      d: 120,
      z: 55,
    },
  ];
  const plain = makeLayout("h", [bottom, top, side]);
  const withPaper = { ...plain, reserved };

  it("ends the guide with one step per area, on the last layer", () => {
    const layers = packingGuide(withPaper, project);
    expect(layers.at(-1)?.closing).toEqual([
      {
        name: "Rulebook",
        text: `Lay the Rulebook (200 × 120 mm, ${project.box.headroom} mm thick) flat on the trays in the back right corner.`,
      },
    ]);
    expect(layers.slice(0, -1).every((l) => l.closing === undefined)).toBe(true);
  });

  it("draws the outline and its label on the top layer only", () => {
    const svgs = render(withPaper, project);
    expect(svgs.length).toBe(2);
    expect(svgs[1]).toContain("Rulebook 200 × 120");
    expect(svgs[1]).toContain("data-reserved");
    expect(svgs[0]).not.toContain("data-reserved");
    expect(svgs[0]).not.toContain("Rulebook");
    const doc = new DOMParser().parseFromString(svgs[1] ?? "", "image/svg+xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    for (const svg of svgs) {
      expect(svg).not.toContain("light-dark(");
      expect(svg).not.toContain("var(");
    }
  });

  it("leaves the guide and the pictures as they were with no area or an empty list", () => {
    for (const none of [plain, { ...plain, reserved: [] }]) {
      expect(packingGuide(none, project)).toEqual(packingGuide(plain, project));
      expect(JSON.stringify(packingGuide(none, project))).not.toContain("closing");
      expect(render(none, project)).toEqual(render(plain, project));
    }
    // and the extra field is all that differs with an area
    const base = render(plain, project);
    expect(render(withPaper, project)[0]).toBe(base[0]);
  });
});
