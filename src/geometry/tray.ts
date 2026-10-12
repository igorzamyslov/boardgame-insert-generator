import type { Manifold, ManifoldToplevel, Vec2, Vec3 } from "manifold-3d";
import type { Settings, TraySpec } from "../model/types";
import type { Mesh } from "./types";
import { planTray } from "./plan";
import { cutFace, cutReach } from "./plan-cuts";
import { INNER_CORNER_RADIUS_MM } from "../model/settings";
import type {
  CompartmentPlan,
  CutPlan,
  FilletPlan,
  LipPlan,
  Rect,
  ScoopPlan,
  SlotPlan,
  TrayPlan,
} from "./plan-types";
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

// A wall cutout: the U through the wall or divider; with a floor notch the cut instead goes down
// through the bottom at its full width, and on into the compartment's floor `notch` from its face,
// the far corners rounded with half the width (at most the reach): a half-disc when the notch
// reaches half the width. All are vertical prisms or open at the top, so nothing overhangs
// (spec §6.1).
// `nextFloor`: the floor of the compartment the cut runs into, null where it leaves the tray.
function buildCut(
  m: ManifoldToplevel,
  scope: Scope,
  cut: CutPlan,
  nextFloor: number | null,
  top: number,
): Manifold[] {
  // The U reaches past the wells' rounded inner corners (INNER_CORNER_RADIUS_MM) on both ends, so no
  // sliver of a corner stays beside it, and OVERSHOOT past an outer face it leaves through.
  const u = buildSlot(
    m,
    scope,
    { ...cut, ...cutReach(cut, INNER_CORNER_RADIUS_MM + EPS, OVERSHOOT) },
    top,
  );
  if (cut.notch <= 0) {
    return [u];
  }
  // Through the floor only EPS into the compartments, whose floors it must not cut.
  const reach = cutReach(cut, EPS, OVERSHOOT);
  const through = box(m, scope, [reach.x0, reach.y0, -OVERSHOOT], [reach.x1, reach.y1, top]);
  // Above the floor of the compartment it runs into, past that one's rounded inner corners too
  // (below the U, where the U does not reach: that floor may lie lower than the cut's own).
  const beside: Manifold[] = [];
  if (nextFloor !== null) {
    const past = cutReach(cut, INNER_CORNER_RADIUS_MM + EPS, OVERSHOOT);
    const next = {
      front: { ...past, y1: reach.y1 },
      back: { ...past, y0: reach.y0 },
      left: { ...past, x1: reach.x1 },
      right: { ...past, x0: reach.x0 },
    }[cut.side];
    beside.push(box(m, scope, [next.x0, next.y0, nextFloor], [next.x1, next.y1, top]));
  }
  // In the floor, along the side (u) and into the compartment (v = face + inward·distance).
  const face = cutFace(cut);
  const alongX = cut.side === "front" || cut.side === "back";
  const inward = { front: 1, back: -1, left: 1, right: -1 }[cut.side];
  const [a, b] = alongX ? [cut.x0, cut.x1] : [cut.y0, cut.y1];
  const rho = Math.min(cut.radius, cut.notch);
  const point = (u: number, distance: number): Vec2 => {
    const v = face + inward * distance;
    return alongX ? [u, v] : [v, u];
  };
  const ring: Vec2[] = [point(a, -EPS), point(b, -EPS)];
  const segments = quarterSegments(rho);
  for (let k = 0; k <= segments; k += 1) {
    const t = (Math.PI / 2) * (k / segments);
    const far = cut.notch - rho + rho * Math.sin(t);
    ring.push(point(a + rho - rho * Math.cos(t), far), point(b - rho + rho * Math.cos(t), far));
  }
  return [u, through, ...beside, prism(m, scope, ring, -OVERSHOOT, top)];
}

// A fillet on a finger cut's vertical edge: the square from the corner toward the material, EPS
// into the cut and past the face so no face of it is coplanar, less the cylinder that stays.
function buildFillet(m: ManifoldToplevel, scope: Scope, f: FilletPlan, top: number): Manifold {
  const [x0, x1] = [f.x - f.sx * EPS, f.x + f.sx * f.r].sort((p, q) => p - q) as [number, number];
  const [y0, y1] = [f.y - f.sy * EPS, f.y + f.sy * f.r].sort((p, q) => p - q) as [number, number];
  const z0 = f.z0 <= 0 ? -OVERSHOOT : f.z0;
  const square = box(m, scope, [x0, y0, z0], [x1, y1, top]);
  const ring = circleRing(f.x + f.sx * f.r, f.y + f.sy * f.r, f.r, 4 * quarterSegments(f.r));
  const kept = prism(m, scope, ring, z0 - 1, top + 1);
  return scope.track(square.subtract(kept));
}

// The floor of compartment `index` of the plan, or null for none.
function floorOf(plan: TrayPlan, index: number | null): number | null {
  return plan.compartments.find((c) => c.index === index)?.floorZ ?? null;
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
    INNER_CORNER_RADIUS_MM,
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
    ...c.cuts.flatMap((cut) => [
      ...buildCut(m, scope, cut, floorOf(plan, cut.into), top),
      ...cut.fillets.map((f) => buildFillet(m, scope, f, top)),
    ]),
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

// Builds one printed part from its TraySpec alone, plus the settings that define
// the lip and the bottom chamfer and cap the outer corner radius (scoop radii
// and every other size come from the spec). Mesh frame: tray-local, origin at
// the outer min corner, z = 0 at the bottom.
// Throws TraySpecError (a RangeError) for a spec planTray rejects, UnsupportedFeatureError for
// parts or features from a newer app version, Error if the kernel fails.
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
    if (plan.notch) {
      // A spacer's notch leaves through both end faces: past them by OVERSHOOT.
      const n = plan.notch;
      const along = n.side === "left";
      const ends = along
        ? { x0: n.x0 - OVERSHOOT, x1: n.x1 + OVERSHOOT }
        : { y0: n.y0 - OVERSHOOT, y1: n.y1 + OVERSHOOT };
      cutters.push(buildSlot(m, scope, { ...n, ...ends }, plan.topZ + OVERSHOOT));
      n.fillets.forEach((f) => cutters.push(buildFillet(m, scope, f, plan.topZ + OVERSHOOT)));
    }
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
