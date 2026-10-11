import type { Manifold, ManifoldToplevel, Vec3 } from "manifold-3d";
import type { Settings, TraySpec } from "../model/types";
import type { Mesh } from "./types";
import { planTray } from "./plan";
import { INNER_CORNER_RADIUS } from "./plan-types";
import type { CompartmentPlan, LipPlan, Rect, ScoopPlan, SlotPlan, TrayPlan } from "./plan-types";
import { withScope } from "./scope";
import type { Scope } from "./scope";
import {
  box,
  circleRing,
  horizontalCylinder,
  hullPoints,
  loft,
  prism,
  quarterSegments,
  roundedRectRing,
} from "./shapes";

const OVERSHOOT = 1; // cutters extend this far above the top so no face is coplanar with it
const EPS = 0.01; // small overlap to avoid coplanar faces between solids
const LIP_OVERLAP = 0.5; // the lip ring reaches this far down into the solid outer wall

function buildOuter(m: ManifoldToplevel, scope: Scope, plan: TrayPlan): Manifold {
  const { w, d, h, chamfer: c, cornerRadius: r } = plan;
  const n = quarterSegments(r);
  const outer = roundedRectRing(0, 0, w, d, r, n);
  if (c <= 0) {
    return prism(m, scope, outer, 0, h);
  }
  // Bottom ring = outer ring inset by c with radius r − c and the same
  // vertex angles, lofted up c: an exact 45° chamfer (plan ensures r ≥ c).
  return loft(m, scope, [
    { ring: roundedRectRing(c, c, w - c, d - c, r - c, n), z: 0 },
    { ring: outer, z: c },
    { ring: outer, z: h },
  ]);
}

// Locating lip (spec §6.1): the outer `thickness` of the wall rises `height`
// above the rim; its inner top edge has a `chamfer` × 45° chamfer.
function buildLip(m: ManifoldToplevel, scope: Scope, plan: TrayPlan, lip: LipPlan): Manifold {
  const { w, d, h, cornerRadius: r } = plan;
  const { thickness: t, chamfer: ch } = lip;
  const top = h + lip.height;
  const n = quarterSegments(r);
  const innerRing = roundedRectRing(t, t, w - t, d - t, Math.max(r - t, 0), n);
  const chamferRing = roundedRectRing(
    t - ch,
    t - ch,
    w - t + ch,
    d - t + ch,
    Math.max(r - t + ch, 0),
    n,
  );
  const outer = prism(m, scope, roundedRectRing(0, 0, w, d, r, n), h - LIP_OVERLAP, top);
  const inner = prism(m, scope, innerRing, h - LIP_OVERLAP - OVERSHOOT, top + OVERSHOOT);
  const chamferCut = loft(m, scope, [
    { ring: innerRing, z: top - ch },
    { ring: chamferRing, z: top },
    { ring: chamferRing, z: top + OVERSHOOT },
  ]);
  return scope.track(m.Manifold.difference([outer, inner, chamferCut]));
}

// Concave quarter-round fillet between the floor and the wall on `side`:
// the solid r × r corner region minus a cylinder of radius r.
function buildSpandrel(
  m: ManifoldToplevel,
  scope: Scope,
  content: Rect,
  floorZ: number,
  scoop: ScoopPlan,
): Manifold {
  const { r, side } = scoop;
  const z0 = floorZ - EPS;
  const zc = floorZ + r;
  const { x0, y0, x1, y1 } = content;
  let corner: Manifold;
  let cylinder: Manifold;
  switch (side) {
    case "front":
      corner = box(m, scope, [x0 - 1, y0 - EPS, z0], [x1 + 1, y0 + r, zc]);
      cylinder = horizontalCylinder(m, scope, "x", x0 - 2, x1 + 2, y0 + r, zc, r);
      break;
    case "back":
      corner = box(m, scope, [x0 - 1, y1 - r, z0], [x1 + 1, y1 + EPS, zc]);
      cylinder = horizontalCylinder(m, scope, "x", x0 - 2, x1 + 2, y1 - r, zc, r);
      break;
    case "left":
      corner = box(m, scope, [x0 - EPS, y0 - 1, z0], [x0 + r, y1 + 1, zc]);
      cylinder = horizontalCylinder(m, scope, "y", y0 - 2, y1 + 2, x0 + r, zc, r);
      break;
    case "right":
      corner = box(m, scope, [x1 - r, y0 - 1, z0], [x1 + EPS, y1 + 1, zc]);
      cylinder = horizontalCylinder(m, scope, "y", y0 - 2, y1 + 2, x1 - r, zc, r);
      break;
  }
  return scope.track(corner.subtract(cylinder));
}

// U-slot: vertical sides, round bottom; convex, so one hull.
function buildSlot(m: ManifoldToplevel, scope: Scope, slot: SlotPlan, topZ: number): Manifold {
  const alongX = slot.side === "front" || slot.side === "back";
  const r = slot.radius;
  const centre = alongX ? (slot.x0 + slot.x1) / 2 : (slot.y0 + slot.y1) / 2;
  const zc = slot.bottomZ + r;
  const zTop = Math.max(topZ, zc);
  const segments = 4 * quarterSegments(r);
  const ends = alongX ? [slot.y0, slot.y1] : [slot.x0, slot.x1];
  const points: Vec3[] = [];
  for (const e of ends) {
    const profile: [number, number][] = [
      [centre - r, zTop],
      [centre + r, zTop],
    ];
    for (let k = segments / 2; k <= segments; k += 1) {
      const a = (2 * Math.PI * k) / segments;
      profile.push([centre + r * Math.cos(a), zc + r * Math.sin(a)]);
    }
    for (const [u, z] of profile) {
      points.push(alongX ? [u, e, z] : [e, u, z]);
    }
  }
  return hullPoints(m, scope, points);
}

function buildCutter(
  m: ManifoldToplevel,
  scope: Scope,
  plan: TrayPlan,
  c: CompartmentPlan,
): Manifold {
  const top = plan.topZ + OVERSHOOT;
  const { content } = c;
  const r = Math.min(
    INNER_CORNER_RADIUS,
    (content.x1 - content.x0) / 2,
    (content.y1 - content.y0) / 2,
  );
  const ring = roundedRectRing(
    content.x0,
    content.y0,
    content.x1,
    content.y1,
    r,
    quarterSegments(r),
  );
  let cutter = prism(m, scope, ring, c.floorZ, top);
  for (const scoop of c.scoops) {
    cutter = scope.track(cutter.subtract(buildSpandrel(m, scope, content, c.floorZ, scoop)));
  }
  const extras = [
    ...c.slots.map((slot) => buildSlot(m, scope, slot, top)),
    ...c.reliefs.map((rl) =>
      prism(m, scope, circleRing(rl.cx, rl.cy, rl.r, 4 * quarterSegments(rl.r)), c.floorZ, top),
    ),
  ];
  if (extras.length > 0) {
    cutter = scope.track(m.Manifold.union([cutter, ...extras]));
  }
  return cutter;
}

function toMesh(solid: Manifold): Mesh {
  // Copy out of the kernel's buffers: the arrays are transferred to the main
  // thread later, which must never detach WASM memory.
  const raw = solid.getMesh();
  const stride = raw.numProp;
  const count = raw.vertProperties.length / stride;
  const positions = new Float32Array(count * 3);
  for (let v = 0; v < count; v += 1) {
    for (let k = 0; k < 3; k += 1) {
      positions[v * 3 + k] = raw.vertProperties[v * stride + k] ?? 0;
    }
  }
  return { positions, indices: new Uint32Array(raw.triVerts) };
}

// Builds one printed part from its TraySpec alone (plus the settings that
// define lip, chamfer, corner radius and scoop sizes). Mesh frame: tray-local,
// origin at the outer min corner, z = 0 at the bottom.
// Throws TraySpecError (a RangeError) for an invalid spec, UnsupportedFeatureError for parts or
// features from a newer app version, Error if the kernel fails.
export function buildTray(
  m: ManifoldToplevel,
  spec: TraySpec,
  settings: Settings,
): { mesh: Mesh; volumeMm3: number } {
  const plan = planTray(spec, settings);
  return withScope((scope) => {
    let solid = buildOuter(m, scope, plan);
    if (plan.lip) {
      solid = scope.track(solid.add(buildLip(m, scope, plan, plan.lip)));
    }
    const cutters = plan.compartments.map((c) => buildCutter(m, scope, plan, c));
    if (cutters.length > 0) {
      solid = scope.track(solid.subtract(scope.track(m.Manifold.union(cutters))));
    }
    const status = solid.status();
    if (status !== "NoError") {
      throw new Error(`Tray ${spec.key}: geometry kernel failed (${status})`);
    }
    return { mesh: toMesh(solid), volumeMm3: solid.volume() };
  });
}
