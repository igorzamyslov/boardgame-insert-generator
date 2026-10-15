// src/instructions/render.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { DEFAULT_SETTINGS } from "../model/settings";
import { pngSize, svgDataUrl } from "./png";
import { escapeXml, layerInfo, packingSteps, render, truncate, whatGoesWhere } from "./render";

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
  x: 1.45,
  y: 1.45,
  z: 30,
  w: 117,
  d: 87,
  h: 25,
  compartments: [
    {
      x: 2,
      y: 2,
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

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

describe("render", () => {
  it("draws one well-formed SVG per layer, bottom first", () => {
    const svgs = render(layout, fixtureProject());
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      expect(parse(svg).getElementsByTagName("parsererror")).toHaveLength(0);
      expect(svg).toContain(">FRONT<");
    }
    const [first, second] = svgs;
    expect(first).toContain("<title>Layer 1 of 2</title>");
    expect(first).toMatch(/>1<\/text>/);
    expect(first).toMatch(/>2<\/text>/);
    expect(first).toMatch(/>4<\/text>/);
    expect(second).toMatch(/>3<\/text>/);
    expect(second).toContain("&lt;Coins&gt; &amp; gems");
    // layer 2 shows the trays of layer 1 as ghosts: 1 and 4 (the spacer is not a tray)
    expect(second).toMatch(/>1<\/text>/);
    expect(second).toMatch(/>4<\/text>/);
    expect(second).not.toMatch(/>2<\/text>/);
  });

  it("draws every number after every shape, so no shape can cover one", () => {
    // A spacer centred on its tray used to be painted over the tray's number.
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
    const [svg] = render(covered, fixtureProject());
    const doc = parse(svg ?? "");
    const all = [...doc.documentElement.querySelectorAll("*")];
    const lastShape = all.map((e) => e.tagName).lastIndexOf("rect");
    const numbers = all.filter((e) => e.tagName === "text" && /^\d+$/.test(e.textContent ?? ""));
    expect(numbers.map((e) => e.textContent).sort()).toEqual(["1", "2", "3"]);
    for (const t of numbers) {
      expect(all.indexOf(t)).toBeGreaterThan(lastShape);
      // each number sits on its own white badge, drawn right before it
      expect(all[all.indexOf(t) - 1]?.tagName).toBe("circle");
    }
    // a tray too small for its number gets a leader line
    expect(doc.getElementsByTagName("line").length).toBeGreaterThan(0);
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
    const fills = [...parse(svg ?? "").querySelectorAll("rect[rx]")].map((r) =>
      r.getAttribute("fill"),
    );
    expect(fills).toEqual(["#d3e0f5", "#f0d5cc", "#d6ead7"]);
    // one cards glyph per tray, stroked, unfilled
    const glyphs = parse(svg ?? "").querySelectorAll("g[transform]");
    expect(glyphs).toHaveLength(3);
    expect(glyphs[0]?.getAttribute("stroke")).toBe("#333333");
    expect(glyphs[0]?.getAttribute("fill")).toBe("none");
  });

  it("leaves spare and leftover trays white with a dashed outline and no glyph", () => {
    const spare = makeLayout("h", [
      makeTray({ key: "a:p0:0", x: 0, y: 0, part: "leftover", solid: false }),
      makeTray({ key: "b:p0:0", stack: 1, x: 120, y: 0 }),
    ]);
    const [svg] = render(spare, fixtureProject());
    const rects = [...parse(svg ?? "").querySelectorAll("rect[rx]")];
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

  it("draws the trays of the layer below as numbered grey ghosts, and none on layer 1", () => {
    const [first, second] = render(layout, fixtureProject());
    const ghosts = (svg: string | undefined) =>
      [...parse(svg ?? "").querySelectorAll("rect")].filter(
        (r) => r.getAttribute("stroke") === "#767676",
      );
    expect(ghosts(first)).toHaveLength(0);
    expect(ghosts(second)).toHaveLength(2);
    const grey = [...parse(second ?? "").querySelectorAll("text")].filter(
      (t) => t.getAttribute("fill") === "#767676",
    );
    expect(grey.map((t) => t.textContent)).toEqual(["1", "4"]);
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
    const [svg] = render(messy, fixtureProject());
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
    expect(packingSteps(orphan)).toEqual([
      "Layer 1: place #1 Deck A ×40.",
      "Place card spacer #2 (the tray it belongs in is not in this layout).",
    ]);
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
    expect(packingSteps(withRiser)).toEqual(["Layer 1: place riser #1, then #2 Deck A ×40 on it."]);
    expect(layerInfo(withRiser)).toEqual([
      { layer: 1, title: "Layer 1 (bottom)", trays: ["2 Deck A ×40"] },
    ]);
    expect(render(withRiser, fixtureProject())).toHaveLength(1);
    const rows = whatGoesWhere(withRiser, DEFAULT_SETTINGS);
    expect(rows.map((r) => [r.number, r.label, r.goesInto, r.carries])).toEqual([
      [1, "Riser", null, 2],
      [2, "Deck A ×40", null, null],
    ]);
  });

  it("still places a riser whose tray is not in the layout", () => {
    const orphan = makeLayout("h", [
      makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
      makeTray({ key: "gone:p0:0:riser", part: "riser", path: "", stack: 5, level: 0 }),
    ]);
    expect(packingSteps(orphan).at(-1)).toBe(
      "Place riser #2 (the tray that stands on it is not in this layout).",
    );
  });

  it("packs bottom first, spacers after their tray", () => {
    expect(packingSteps(layout)).toEqual([
      "Layer 1: place #1 Deck A ×40.",
      "Slide card spacer #2 into tray #1.",
      "Layer 1: place #4 Deck A ×40.",
      "Layer 2: place #3 <Coins> & gems on top.",
    ]);
  });

  it("titles the layers and lists their trays", () => {
    expect(layerInfo(layout)).toEqual([
      { layer: 1, title: "Layer 1 (bottom)", trays: ["1 Deck A ×40", "4 Deck A ×40"] },
      { layer: 2, title: "Layer 2 (top)", trays: ["3 <Coins> & gems"] },
    ]);
    const three = makeLayout("h", [
      makeTray({ key: "a:p0:0", level: 0 }),
      makeTray({ key: "b:p0:0", level: 1, z: 40 }),
      makeTray({ key: "c:p0:0", level: 2, z: 80 }),
    ]);
    expect(layerInfo(three).map((l) => l.title)).toEqual([
      "Layer 1 (bottom)",
      "Layer 2",
      "Layer 3 (top)",
    ]);
    expect(layerInfo(makeLayout("h", [makeTray()])).map((l) => l.title)).toEqual([
      "Layer 1 (bottom)",
    ]);
  });

  it("says where each part stands, to 0.1 mm", () => {
    const rows = whatGoesWhere(
      makeLayout("h", [makeTray({ x: 12, y: 30.04 }), makeTray({ key: "b:p0:0", x: 0.26, y: 0 })]),
      DEFAULT_SETTINGS,
    );
    expect(rows.map((r) => r.position)).toEqual([
      "12 mm from the left, 30 mm from the front",
      "0.3 mm from the left, 0 mm from the front",
    ]);
  });

  it("lists what goes where", () => {
    const rows = whatGoesWhere(layout, DEFAULT_SETTINGS);
    expect(rows.map((r) => [r.number, r.layer, r.goesInto])).toEqual([
      [1, 1, null],
      [2, 1, 1],
      [3, 2, null],
      [4, 1, null],
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

  it("draws a shape per member and one number, on the larger", () => {
    const [svg] = render(withMerged, fixtureProject());
    const doc = parse(svg ?? "");
    // the bottom tray and one rect per member (plus the box outline and the white page)
    const shapes = [...doc.querySelectorAll("rect")].filter((r) => r.getAttribute("rx") === "1.5");
    expect(shapes).toHaveLength(3);
    const numbers = [...doc.querySelectorAll("text")].filter((t) =>
      /^\d+$/.test(t.textContent ?? ""),
    );
    expect(numbers.map((t) => t.textContent).sort()).toEqual(["1", "2"]);
  });

  it("lists and places it as one part", () => {
    const rows = whatGoesWhere(withMerged, DEFAULT_SETTINGS);
    const row = rows.find((r) => r.label === "Merged filler block");
    expect(row).toMatchObject({ layer: 1, goesInto: null, carries: null });
    expect(rows).toHaveLength(2);
    expect(packingSteps(withMerged).join("\n")).toContain("Merged filler block");
  });
});
