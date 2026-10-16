// src/instructions/exploded.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { boxOutline, outlineCenter, trayPosition } from "../viewer/transform";
import { explodedView } from "./exploded";
import { trayNames } from "./naming";
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

  it("lists and names the parts in assembly order, as the instructions do", () => {
    const view = explodedView(layout, project);
    const expected = numberParts(layout.trays);
    const names = trayNames(expected, project.components);
    const full = expected.map((p) => names.get(p.spec.key)?.full);
    expect(view?.parts).toEqual(full.map((name) => ({ name })));
    expect(new Set(full).size).toBe(4);
    const doc = parse(view?.svg ?? "");
    const badges = [...doc.querySelectorAll("g[data-badge]")];
    // One badge per part, in assembly order, carrying the short name engraved on the part.
    expect(badges.map((b) => b.getAttribute("data-badge"))).toEqual(["1", "2", "3", "4"]);
    expect(badges.map((b) => b.querySelector("text")?.textContent)).toEqual(
      expected.map((p) => names.get(p.spec.key)?.short.toUpperCase()),
    );
    expect(badges.some((b) => /^\d+$/.test(b.querySelector("text")?.textContent ?? ""))).toBe(
      false,
    );
    // The tray at level 0 of stack 0 is first, its spacer next, the tray on it, the next stack.
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

  // A merged filler that wraps the trays is centred on the box, so spreading and lifting left it
  // among the trays. trayPosition now drops it; the picture, which shares it, must show it lower.
  it("draws a merged part that wraps the box dropped clear below the trays", () => {
    const outline = boxOutline(project.box, project.settings);
    const [cx, cy] = outlineCenter(outline);
    const w = outline.size[0] - 4;
    const d = outline.size[1] - 4;
    const h = 30;
    const frame = makeTray({
      key: "m:p0:0",
      stack: 0,
      level: 0,
      x: cx - w / 2,
      y: cy - d / 2,
      w,
      d,
      h,
      merged: {
        members: [makeTray({ key: "m:p0:0", x: cx - w / 2, y: cy - d / 2, w, d: 10, h })],
        bridges: [{ x: cx - w / 2, y: cy - d / 2, z: 0, w: 10, d, h }],
        flipped: false,
      },
    });
    const small = makeTray({ key: "s:p0:0", stack: 1, level: 0, x: 0, y: 0, w: 40, d: 40, h });
    const doc = parse(explodedView(makeLayout("h", [frame, small]), project)?.svg ?? "");
    const frameNo = numberParts([frame, small]).find((p) => p.spec === frame)?.number ?? 0;
    // The frame's block is bridged members, so take the lowest point of any of its faces.
    const ys = [...doc.querySelectorAll(`g[data-part="${frameNo}"] polygon`)]
      .flatMap((poly) => (poly.getAttribute("points") ?? "").split(" "))
      .map((pt) => Number(pt.split(",")[1]));
    // Undropped, its lowest point on the page is one of its bounding box's corners.
    const AZ = (35 * Math.PI) / 180;
    const EL = (30 * Math.PI) / 180;
    const [b0, b1, b2] = [Math.sin(AZ) * Math.cos(EL), -Math.cos(AZ) * Math.cos(EL), Math.sin(EL)];
    const [r0, r1, r2] = [Math.cos(AZ), Math.sin(AZ), 0];
    const [upX, upY, upZ] = [b1 * r2 - b2 * r1, b2 * r0 - b0 * r2, b0 * r1 - b1 * r0];
    const pageY = (x: number, y: number, z: number): number => -(upX * x + upY * y + upZ * z);
    const boxes = [...(frame.merged?.members ?? []), ...(frame.merged?.bridges ?? [])];
    const assembledLowest = Math.max(
      ...boxes.flatMap((b) =>
        [b.x, b.x + b.w].flatMap((x) =>
          [b.y, b.y + b.d].flatMap((y) => [0, h].map((z) => pageY(x, y, z))),
        ),
      ),
    );
    // Page y grows downward: dropped 40 mm, it reaches 40 * cos(30 deg) lower than assembled.
    expect(Math.max(...ys) - assembledLowest).toBeGreaterThan(40 * Math.cos(EL) - 0.5);
  });

  it("paints back to front: a tray before the spacer that goes into it, lower layers before upper", () => {
    const doc = parse(explodedView(layout, project)?.svg ?? "");
    const order = [...doc.querySelectorAll("g[data-part]")].map((g) =>
      Number(g.getAttribute("data-part")),
    );
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(2));
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(3));
    // Every badge is painted after every part, so no name is hidden.
    const all = [...doc.documentElement.children];
    const lastPart = all.reduce((at, e, i) => (e.getAttribute("data-part") !== null ? i : at), -1);
    const firstBadge = all.findIndex((e) => e.getAttribute("data-badge") !== null);
    expect(firstBadge).toBeGreaterThan(lastPart);
  });

  it("keeps the name badges apart", () => {
    const doc = parse(explodedView(layout, project)?.svg ?? "");
    const pills = [...doc.querySelectorAll("g[data-badge] rect")].map((r) => ({
      x: Number(r.getAttribute("x")),
      y: Number(r.getAttribute("y")),
      w: Number(r.getAttribute("width")),
      h: Number(r.getAttribute("height")),
    }));
    expect(pills).toHaveLength(4);
    for (let i = 0; i < pills.length; i++) {
      for (let j = i + 1; j < pills.length; j++) {
        const a = pills[i];
        const b = pills[j];
        if (!a || !b) {
          continue;
        }
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
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
