// @vitest-environment node
// src/geometry/tray.cut-rim.test.ts
// A finger cut through the rim between layers (owner, 2026-10-24: "they are protruding beyond the
// fillet of the finger slot and you can catch them"): every layer the cut passes through gets the
// fillet of the wall top where the cut's side meets its top, not only the wall or the lip ring.
// The rim kind: the lip ring and the ledge beside it; the stepped base: the wall, and the floor of
// the socket (where the slab of the part above stands) beside it, and a divider's top.
import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { MIN_FEATURE_MM } from "../model/settings";
import type { Settings, Side } from "../model/types";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { FINGER_FILLET_MM } from "./plan-types";
import type { CutPlan } from "./plan-types";
import { problemsOf, thinSlices } from "./test-build";
import { GEO, compartment, cutout, traySpec } from "./test-specs";
import { buildTray } from "./tray";
import type { Mesh } from "./types";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

function solid(mesh: Mesh): Manifold {
  return new m.Manifold(
    new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }),
  );
}

const RIM: Settings = GEO;
const STEP: Settings = { ...GEO, lip: { ...GEO.lip, kind: "step" } };

const SIZE = 60; // the part is square, so a cut through any side is the same
const H = 30;
const AT = 30; // the cut's centre along its side
const WIDTH = 22;
const A = AT - WIDTH / 2;
const B = AT + WIDTH / 2;
const DEPTH = 20;

const wallOf = (s: Settings): number => (s === RIM ? 2.9 : 1.6);

// A lipped part with one cut through its `side` wall; `block` mm of solid between the wall and the
// compartment (a card tray's face: the cut runs through the block's top as well).
function part(settings: Settings, side: Side, block: number) {
  const wall = wallOf(settings);
  const inner = SIZE - 2 * wall;
  const box = { x: wall, y: wall, w: inner, d: inner };
  switch (side) {
    case "front":
      box.y += block;
      box.d -= block;
      break;
    case "back":
      box.d -= block;
      break;
    case "left":
      box.x += block;
      box.w -= block;
      break;
    case "right":
      box.w -= block;
      break;
  }
  return traySpec({
    key: "cut-rim:p0:0",
    w: SIZE,
    d: SIZE,
    h: H,
    lip: true,
    compartments: [compartment({ ...box, features: [cutout(side, AT, DEPTH)] })],
  });
}

// Where the material of `z`'s slice stands nearest the cut `across` the wall (a distance from the
// outer face, inside the strip of the layer): at the cut's low side (material beside u = A) the
// largest u, at its high side (beside u = B) the smallest. `at` is the u of the cut's side.
function edge(
  s: Manifold,
  side: Side,
  z: number,
  across: number,
  which: "low" | "high",
): number | null {
  const along = side === "front" || side === "back";
  const v = side === "front" || side === "left" ? across : SIZE - across;
  const u0 = which === "low" ? A - 6 : B - 0.01;
  const [x, y, w, d] = along ? [u0, v - 0.05, 6.01, 0.1] : [v - 0.05, u0, 0.1, 6.01];
  const probe = m.CrossSection.square([w, d]).translate([x, y]);
  const hit = s.slice(z).intersect(probe);
  const box = hit.bounds();
  const none = hit.isEmpty();
  hit.delete();
  probe.delete();
  const i = along ? 0 : 1;
  return none ? null : which === "low" ? box.max[i] : box.min[i];
}

// How far a fillet of radius `r` under `top` takes the material back from the cut's side at `z`.
function setback(z: number, top: number, r: number): number {
  const dz = z - (top - r);
  return dz <= 0 ? 0 : r - Math.sqrt(Math.max(0, r * r - dz * dz));
}

const FACET = 0.1; // how far a circle's facets stand inside it: 16 to a 2 mm ring

// A layer's fillet as the mesh has it: at the heights its top is rounded over, the material beside
// each side of the cut stands back from the side by what the fillet's circle leaves, and never past it.
function expectRounded(
  s: Manifold,
  side: Side,
  layer: { top: number; across: number; r: readonly [number, number]; name: string },
): void {
  for (const [which, r] of [
    ["low", layer.r[0]],
    ["high", layer.r[1]],
  ] as const) {
    const label = `${layer.name}, ${side} cut's ${which} side`;
    expect(r, label).toBeGreaterThan(0);
    for (let k = 1; k <= 5; k += 1) {
      const z = layer.top - r + (r * k) / 6;
      const at = `${label} at z ${z.toFixed(2)}`;
      const u = edge(s, side, z, layer.across, which);
      expect(u, at).not.toBeNull();
      const want = which === "low" ? A - setback(z, layer.top, r) : B + setback(z, layer.top, r);
      const out = which === "low" ? (u ?? 0) - want : want - (u ?? 0);
      expect(out, `${at} sticks out`).toBeLessThan(0.01);
      expect(out, `${at} is cut back`).toBeGreaterThan(-FACET);
    }
  }
}

const ledgeOf = (cut: CutPlan | undefined) => cut?.ledgeFillets ?? [0, 0];
const topOf = (cut: CutPlan | undefined) => cut?.topFillets ?? [0, 0];

describe("a finger cut through the rim: nothing beside it stands past its rounded edge", () => {
  const sides: Side[] = ["front", "back", "left", "right"];

  describe.each(sides)("through the %s wall", (side) => {
    for (const block of [0, 10]) {
      it(`rounds the lip ring and the ledge of the rim, ${block} mm of block behind the wall`, () => {
        const spec = part(RIM, side, block);
        const plan = planTray(spec, RIM);
        const cut = plan.compartments[0]?.cuts[0];
        const lip = plan.lip;
        expect(lip).not.toBeNull();
        expect(ledgeOf(cut)).toEqual([FINGER_FILLET_MM, FINGER_FILLET_MM]);
        const s = solid(buildTray(m, spec, RIM).mesh);
        const t = lip?.thickness ?? 0;
        expectRounded(s, side, {
          name: "lip ring",
          top: H + (lip?.height ?? 0),
          across: t / 4,
          r: topOf(cut),
        });
        expectRounded(s, side, {
          name: "ledge",
          top: H,
          across: (t + wallOf(RIM) + block) / 2,
          r: ledgeOf(cut),
        });
        expect(problemsOf(m, spec, RIM)).toEqual([]);
      });

      it(`rounds the wall and the socket floor of the stepped base, ${block} mm of block behind the wall`, () => {
        const spec = part(STEP, side, block);
        const plan = planTray(spec, STEP);
        const cut = plan.compartments[0]?.cuts[0];
        const socket = plan.socket;
        expect(socket).not.toBeNull();
        const wall = socket?.wall ?? 0;
        const s = solid(buildTray(m, spec, STEP).mesh);
        expectRounded(s, side, { name: "wall", top: H, across: wall / 2, r: topOf(cut) });
        if (block === 0) {
          // the compartment starts at the wall: no floor of the socket beside the cut
          expect(ledgeOf(cut)).toEqual([0, 0]);
        } else {
          expect(ledgeOf(cut)).toEqual([FINGER_FILLET_MM, FINGER_FILLET_MM]);
          expectRounded(s, side, {
            name: "socket floor",
            top: H - (socket?.depth ?? 0),
            across: (wall + wall + block) / 2,
            r: ledgeOf(cut),
          });
        }
        expect(problemsOf(m, spec, STEP)).toEqual([]);
      });
    }
  });

  it("keeps a groove's roof thick enough in a low part that carries the lip too", () => {
    // a level-1 part 4 mm high: the ledge's fillet stops above the roof, which at the lip ring's
    // inner face would leave less than MIN_FEATURE_MM of wall under the pocket
    const wall = wallOf(RIM);
    const spec = traySpec({
      key: "cut-rim-low:p0:1",
      level: 1,
      w: SIZE,
      d: SIZE,
      h: 4,
      lip: true,
      compartments: [
        compartment({
          x: wall,
          y: wall,
          w: SIZE - 2 * wall,
          d: SIZE - 2 * wall,
          features: [cutout("front", AT, 2.8, 11)],
        }),
      ],
    });
    const plan = planTray(spec, RIM);
    const cut = plan.compartments[0]?.cuts[0];
    const groove = plan.groove;
    expect(groove).not.toBeNull();
    const lowest = (groove?.zTop ?? 0) - (plan.lip?.thickness ?? 0) + MIN_FEATURE_MM;
    for (const r of ledgeOf(cut)) {
      expect(4 - r).toBeGreaterThanOrEqual(lowest - 1e-9);
    }
    const { mesh } = buildTray(m, spec, RIM);
    expect(thinSlices(m, mesh, [2.05, 2.25, 2.45, 2.65, 3, 3.5])).toEqual([]);
    expect(problemsOf(m, spec, RIM)).toEqual([]);
  });

  it.each([
    ["rim", RIM],
    ["step", STEP],
  ] as const)("rounds a cut through a divider at its top in the %s kind", (_kind, settings) => {
    // two wells side by side, a finger cut from the left one through the divider into the right
    const wall = wallOf(settings);
    const well = (SIZE - 2 * wall - 1.2) / 2;
    const spec = traySpec({
      key: "cut-rim-divided:p0:0",
      w: SIZE,
      d: SIZE,
      h: H,
      lip: true,
      compartments: [
        compartment({
          x: wall,
          y: wall,
          w: well,
          d: SIZE - 2 * wall,
          features: [cutout("right", AT, DEPTH)],
        }),
        compartment({
          x: wall + well + 1.2,
          y: wall,
          w: well,
          d: SIZE - 2 * wall,
          features: [cutout("left", AT, DEPTH)],
        }),
      ],
    });
    const plan = planTray(spec, settings);
    const cut = plan.compartments[0]?.cuts[0];
    expect(cut?.into).toBe(1);
    expect(ledgeOf(cut)).toEqual([0, 0]);
    const top = H - (settings === STEP ? (plan.socket?.depth ?? 0) : 0);
    const s = solid(buildTray(m, spec, settings).mesh);
    // the divider stands in the middle of the part
    expectRounded(s, "right", {
      name: "divider",
      top,
      across: SIZE / 2,
      r: topOf(cut),
    });
    expect(problemsOf(m, spec, settings)).toEqual([]);
  });
});
