// src/instructions/exploded.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { trayPosition } from "../viewer/transform";
import { explodedView } from "./exploded";
import { numberParts } from "./numbering";

const project = fixtureProject();

const bottom = makeTray({ key: "a:p0:0", stack: 0, level: 0, w: 120, d: 90, h: 30, lip: true });
const spacer = makeTray({
  key: "a:p0:0:spacer",
  part: "spacer",
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
});
const side = makeTray({ key: "c:p0:0", stack: 1, level: 0, x: 130, y: 0, w: 100, d: 90, h: 55 });
const layout = makeLayout("h", [bottom, spacer, top, side]);

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

const topOf = (doc: Document, number: number): { x: number; y: number }[] => {
  // The last polygon of a part's group is its top face.
  const polys = [
    ...(doc.querySelector(`g[data-part="${number}"]`)?.querySelectorAll("polygon") ?? []),
  ];
  const pts = polys.at(-1)?.getAttribute("points") ?? "";
  return pts.split(" ").map((p) => {
    const [x, y] = p.split(",").map(Number);
    return { x: x ?? 0, y: y ?? 0 };
  });
};

const centreY = (pts: { y: number }[]): number => pts.reduce((s, p) => s + p.y, 0) / pts.length;

describe("explodedView", () => {
  it("has nothing to show for a layout without parts", () => {
    expect(explodedView(makeLayout("h", []), project)).toBeNull();
  });

  it("is a standalone, well-formed SVG (vector, no canvas or embedded raster)", () => {
    const view = explodedView(layout, project);
    expect(view).not.toBeNull();
    const doc = parse(view?.svg ?? "");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    expect(doc.querySelector("image, canvas, foreignObject")).toBeNull();
    // Small enough to sit in the page's own markup however many parts there are.
    expect(view?.svg.length).toBeLessThan(20_000);
  });

  it("lists and numbers the parts in assembly order, as the instructions do", () => {
    const view = explodedView(layout, project);
    const expected = numberParts(layout.trays);
    expect(view?.parts).toEqual(expected.map((p) => ({ number: p.number, label: p.label })));
    expect(view?.parts.map((p) => p.number)).toEqual([1, 2, 3, 4]);
    const doc = parse(view?.svg ?? "");
    const badges = [...doc.querySelectorAll("g[data-badge]")];
    // One badge per part, in numbering order, carrying that number.
    expect(badges.map((b) => b.getAttribute("data-badge"))).toEqual(["1", "2", "3", "4"]);
    expect(badges.map((b) => b.querySelector("text")?.textContent)).toEqual(["1", "2", "3", "4"]);
    // The tray at level 0 of stack 0 is #1, its spacer #2, the tray on it #3, the next stack #4.
    expect(expected.map((p) => p.spec.key)).toEqual([
      "a:p0:0",
      "a:p0:0:spacer",
      "b:p0:0",
      "c:p0:0",
    ]);
  });

  it("spreads the parts as the 3D view does: the upper layer is drawn higher than it stands", () => {
    const doc = parse(explodedView(layout, project)?.svg ?? "");
    const lowerY = centreY(topOf(doc, 1));
    const upperY = centreY(topOf(doc, 3));
    // Higher on the page is a smaller y. Assembled, the two top faces are 25 mm apart (about 22 mm
    // on the page); exploded, trayPosition lifts the upper tray a further 40 mm per level.
    expect(trayPosition(top, 1)[2] - trayPosition(bottom, 1)[2]).toBe(70);
    expect(upperY).toBeLessThan(lowerY);
    expect(lowerY - upperY).toBeGreaterThan(40);
  });

  it("paints back to front: a tray before the spacer that goes into it, lower layers before upper", () => {
    const doc = parse(explodedView(layout, project)?.svg ?? "");
    const order = [...doc.querySelectorAll("g[data-part]")].map((g) =>
      Number(g.getAttribute("data-part")),
    );
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(2));
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(3));
    // Every number's badge is painted after every part, so no number is hidden.
    const all = [...doc.documentElement.children];
    const lastPart = all.reduce((at, e, i) => (e.getAttribute("data-part") !== null ? i : at), -1);
    const firstBadge = all.findIndex((e) => e.getAttribute("data-badge") !== null);
    expect(firstBadge).toBeGreaterThan(lastPart);
  });

  it("keeps the numbers apart", () => {
    const doc = parse(explodedView(layout, project)?.svg ?? "");
    const centres = [...doc.querySelectorAll("g[data-badge] circle")].map((c) => ({
      x: Number(c.getAttribute("cx")),
      y: Number(c.getAttribute("cy")),
    }));
    for (let i = 0; i < centres.length; i++) {
      for (let j = i + 1; j < centres.length; j++) {
        const a = centres[i];
        const b = centres[j];
        expect(Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))).toBeGreaterThan(8);
      }
    }
  });

  it("draws a merged part as the blocks it is made of, moved together", () => {
    const m1 = makeTray({ key: "m1", part: "leftover", x: 0, y: 0, w: 20, d: 20, h: 10 });
    const m2 = makeTray({ key: "m2", part: "leftover", x: 40, y: 0, w: 20, d: 20, h: 10 });
    const merged = makeTray({
      key: "m1+m2",
      part: "leftover",
      x: 0,
      y: 0,
      w: 60,
      d: 20,
      h: 10,
      merged: {
        members: [m1, m2],
        bridges: [{ x: 20, y: 0, z: 0, w: 20, d: 5, h: 10 }],
        flipped: false,
      },
    });
    const view = explodedView(makeLayout("h", [bottom, merged]), project);
    const doc = parse(view?.svg ?? "");
    // The merged part goes first (nothing it rests on): #1, drawn as two members and one bridge.
    expect(numberParts(makeLayout("h", [bottom, merged]).trays)[0]?.spec.key).toBe("m1+m2");
    expect(doc.querySelectorAll('g[data-part="1"]')).toHaveLength(3);
    expect(doc.querySelectorAll("g[data-badge]")).toHaveLength(2);
  });
});
