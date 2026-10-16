import type { Manifold, ManifoldToplevel, Vec2, Vec3 } from "manifold-3d";
import type { Groove } from "../model/lip";
import type { MergedPart, Settings, Side, TraySpec } from "../model/types";
import type { Mesh } from "./types";
import { planTray } from "./plan";
import { carriesNumber } from "../model/part-number";
import { buildEngraving, planEngraving } from "./engrave";
import type { EngravePlan } from "./engrave";
import { cutFace, filletStrip } from "./plan-cuts";
import { INNER_CORNER_RADIUS_MM } from "./plan-types";
import type { CompartmentPlan, CutPlan, LipPlan, Rect, ScoopPlan, TrayPlan } from "./plan-types";
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
  if (plan.groove) {
    return buildGroovedOuter(m, scope, plan, plan.groove);
  }
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

// The outer body of a tray with a groove under its outer edge (model/lip.ts), as two convex lofts
// of rings inset by u from the outer face (radius r − u, the same vertex angles, so every slope
// is an exact 45°; plan ensures r ≥ the groove's reach): the foot, whose bottom ring is the bed
// face, a 45° foot chamfer in to the inner wall; and the roof, from the top of the inner wall out
// at 45° to the outer face at `zTop`, then straight up. Each layer of the roof lies over the one
// below it, out to the layer's edge, so it prints without support, like a chamfer turned over.
function buildGroovedOuter(m: ManifoldToplevel, scope: Scope, plan: TrayPlan, g: Groove): Manifold {
  const { w, d, h, cornerRadius: r } = plan;
  const n = quarterSegments(r);
  const ring = (u: number): Vec2[] => roundedRectRing(u, u, w - u, d - u, Math.max(r - u, 0), n);
  const foot = loft(m, scope, [
    { ring: ring(g.reach), z: 0 },
    { ring: ring(g.inset), z: g.foot },
    { ring: ring(g.inset), z: g.zIn + EPS },
  ]);
  const roof = loft(m, scope, [
    { ring: ring(g.inset), z: g.zIn },
    { ring: ring(0), z: g.zTop },
    { ring: ring(0), z: h },
  ]);
  return scope.track(m.Manifold.union([foot, roof]));
}

// Locating lip (spec §6.1): the outer `thickness` of the wall rises `height` above the rim at the
// outer face, with a flat top, then a 45° ramp down to the inner face at `zIn`. The groove of the
// tray above is this shape, one play further out and up.
function buildLip(m: ManifoldToplevel, scope: Scope, plan: TrayPlan, lip: LipPlan): Manifold {
  const { w, d, h, cornerRadius: r } = plan;
  const { thickness: t, flat: f } = lip;
  const top = h + lip.height;
  const n = quarterSegments(r);
  const ring = (u: number): Vec2[] => roundedRectRing(u, u, w - u, d - u, Math.max(r - u, 0), n);
  const outer = prism(m, scope, ring(0), h - LIP_OVERLAP, top);
  // What the lip ring leaves out: the straight inner face up to `zIn`, then the ramp out to the
  // flat's width, then straight up (two convex pieces: the profile turns outward at the ramp).
  const inner = prism(m, scope, ring(t), h - LIP_OVERLAP - OVERSHOOT, h + lip.zIn + EPS);
  const ramp = loft(m, scope, [
    { ring: ring(t), z: h + lip.zIn },
    { ring: ring(f), z: top },
    { ring: ring(f), z: top + OVERSHOOT },
  ]);
  return scope.track(m.Manifold.difference([outer, inner, ramp]));
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

// A cut's U: vertical sides, round bottom; convex, so one hull.
type UPlan = Pick<CutPlan, "x0" | "x1" | "y0" | "y1" | "side" | "bottomZ" | "radius">;
function buildU(m: ManifoldToplevel, scope: Scope, cut: UPlan, topZ: number): Manifold {
  const alongX = cut.side === "front" || cut.side === "back";
  const r = cut.radius;
  const centre = alongX ? (cut.x0 + cut.x1) / 2 : (cut.y0 + cut.y1) / 2;
  const zc = cut.bottomZ + r;
  const zTop = Math.max(topZ, zc);
  const segments = 4 * quarterSegments(r);
  const ends = alongX ? [cut.y0, cut.y1] : [cut.x0, cut.x1];
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

// A cut's footprint reaching EPS into the compartments at both ends (its sides keep POST_MM posts
// to their faces, clear of their rounded corners) and OVERSHOOT past an outer face it leaves
// through.
function cutReach(cut: CutPlan): Rect {
  const far = cut.into === null ? OVERSHOOT : EPS;
  switch (cut.side) {
    case "front":
      return { ...cut, y0: cut.y0 - far, y1: cut.y1 + EPS };
    case "back":
      return { ...cut, y0: cut.y0 - EPS, y1: cut.y1 + far };
    case "left":
      return { ...cut, x0: cut.x0 - far, x1: cut.x1 + EPS };
    case "right":
      return { ...cut, x0: cut.x0 - EPS, x1: cut.x1 + far };
  }
}

// A wall cutout: the U through the wall or divider; with a floor notch the cut instead goes down
// through the bottom at its full width, and on into the compartment's floor `notch` from its face,
// the far corners rounded with half the width (at most the reach): a half-disc when the notch
// reaches half the width. All are vertical prisms or open at the top, so nothing overhangs
// (spec §6.1).
function buildCut(m: ManifoldToplevel, scope: Scope, cut: CutPlan, top: number): Manifold[] {
  const reach = cutReach(cut);
  const u = buildU(m, scope, { ...cut, ...reach }, top);
  if (cut.notch <= 0) {
    return [u];
  }
  // Through the floor down to the bed, EPS into the compartments at its ends like the U.
  const through = box(m, scope, [reach.x0, reach.y0, -OVERSHOOT], [reach.x1, reach.y1, top]);
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
  return [u, through, prism(m, scope, ring, -OVERSHOOT, top)];
}

// A U's top fillets (CutPlan.topFillets): at each top corner the square of radius r beside the
// side, EPS into the cut and OVERSHOOT above the top, across the strip v0..v1 and past its ends
// (past the compartments' rounded inner corners, as the U), less the horizontal cylinder along the
// strip that stays. The surface left faces up and into the cut, so it needs no support.
function buildTopFillets(
  m: ManifoldToplevel,
  scope: Scope,
  cut: CutPlan,
  { top, v0, v1 }: { top: number; v0: number; v1: number },
): Manifold[] {
  const along = cut.side === "front" || cut.side === "back";
  const [a, b] = along ? [cut.x0, cut.x1] : [cut.y0, cut.y1];
  const [r0, r1] = cut.topFillets;
  return [
    { r: r0, from: a - r0, to: a + EPS, centre: a - r0 },
    { r: r1, from: b - EPS, to: b + r1, centre: b + r1 },
  ].flatMap(({ r, from, to, centre }) => {
    if (r <= 0) {
      return [];
    }
    const lo: Vec3 = along ? [from, v0, top - r] : [v0, from, top - r];
    const hi: Vec3 = along ? [to, v1, top + OVERSHOOT] : [v1, to, top + OVERSHOOT];
    const square = box(m, scope, lo, hi);
    const axis = along ? "y" : "x";
    const kept = horizontalCylinder(m, scope, axis, v0 - 1, v1 + 1, centre, top - r, r);
    return [scope.track(square.subtract(kept))];
  });
}

// The strip a cut's top fillets are cut across, reaching past its ends like the U: OVERSHOOT out
// through an outer face, INNER_CORNER_RADIUS_MM + EPS into the compartments past their corners; on
// a lipped wall's lip ring, EPS past its inner side (above the ledge, so into air).
function filletReach(
  cut: CutPlan,
  strip: { top: number; v0: number; v1: number },
  lipped: boolean,
): { top: number; v0: number; v1: number } {
  const exit = cut.into === null;
  const outerLow = cut.side === "front" || cut.side === "left";
  const inner = exit && lipped ? EPS : INNER_CORNER_RADIUS_MM + EPS;
  return {
    top: strip.top,
    v0: strip.v0 - (exit && outerLow ? OVERSHOOT : inner),
    v1: strip.v1 + (exit && !outerLow ? OVERSHOOT : inner),
  };
}

function buildCutter(
  m: ManifoldToplevel,
  scope: Scope,
  plan: TrayPlan,
  c: CompartmentPlan,
): Manifold {
  const top = plan.topZ + OVERSHOOT;
  const { rect } = c;
  const r = Math.min(INNER_CORNER_RADIUS_MM, (rect.x1 - rect.x0) / 2, (rect.y1 - rect.y0) / 2);
  const ring = roundedRectRing(rect.x0, rect.y0, rect.x1, rect.y1, r, quarterSegments(r));
  let cutter = prism(m, scope, ring, c.floorZ, top);
  for (const scoop of c.scoops) {
    cutter = scope.track(cutter.subtract(buildSpandrel(m, scope, rect, c.floorZ, scoop)));
  }
  const extras = [
    ...c.cuts.flatMap((cut) => [
      ...buildCut(m, scope, cut, top),
      ...buildTopFillets(
        m,
        scope,
        cut,
        filletReach(cut, filletStrip(cut, plan, plan.lip), plan.lip !== null),
      ),
    ]),
    // A divider's slot: from the bottom of the slot up into the well, EPS over its floor.
    ...c.slots.map((sl) =>
      box(m, scope, [sl.x0, sl.y0, sl.bottomZ], [sl.x1, sl.y1, c.floorZ + EPS]),
    ),
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

// The solid of one tray part from its TraySpec alone, tracked in `scope`; its frame is tray-local
// (origin at the outer min corner, z = 0 at the bottom). Throws like buildTray.
function buildSolid(
  m: ManifoldToplevel,
  scope: Scope,
  spec: TraySpec,
  settings: Settings,
  plan: TrayPlan = planTray(spec, settings),
  engraving: EngravePlan | null = null,
): Manifold {
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
    cutters.push(buildU(m, scope, { ...n, ...ends }, plan.topZ + OVERSHOOT));
    const strip = along
      ? { v0: -OVERSHOOT, v1: plan.w + OVERSHOOT }
      : { v0: -OVERSHOOT, v1: plan.d + OVERSHOOT };
    cutters.push(...buildTopFillets(m, scope, n, { top: plan.h, ...strip }));
  }
  if (engraving) {
    cutters.push(buildEngraving(m, scope, engraving, spec));
  }
  if (cutters.length > 0) {
    solid = scope.track(solid.subtract(scope.track(m.Manifold.union(cutters))));
  }
  return solid;
}

// The number engraved on a part (spec.partNumber, set by the app on the copy it asks to build when
// the engraving setting is on) and where; null for a part that carries none (a plate: a spacer or
// divider), or that has no face with room (planEngraving).
function engravingOf(plan: TrayPlan, spec: TraySpec): EngravePlan | null {
  const n = spec.partNumber;
  return n === undefined || !carriesNumber(spec.part) ? null : planEngraving(plan, n);
}

function buildPart(
  m: ManifoldToplevel,
  scope: Scope,
  spec: TraySpec,
  settings: Settings,
): Manifold {
  const plan = planTray(spec, settings);
  return buildSolid(m, scope, spec, settings, plan, engravingOf(plan, spec));
}

// A merged part (several fillers and risers printed as one, mergeParts): each member built as it
// would be alone and moved to its place, joined by the solid bridges that fill the tray gaps
// between them. Everything is in the merged part's frame: its bounding box's min corner is the
// origin.
function buildMerged(
  m: ManifoldToplevel,
  scope: Scope,
  spec: TraySpec,
  merged: MergedPart,
  settings: Settings,
): Manifold {
  // The number goes on one member, on a face on the merged part's own outside (as it prints: a
  // flipped part is turned over, front and back change places): the member where it is largest.
  const plans = merged.members.map((member) => planTray(member, settings));
  let onMember = -1;
  let engraving: EngravePlan | null = null;
  if (spec.partNumber !== undefined && carriesNumber(spec.part)) {
    const flipped = merged.flipped === true;
    merged.members.forEach((member, i) => {
      const plan = plans[i];
      const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;
      const faces: Side[] = [];
      const buildFront = near(member.y, spec.y);
      const buildBack = near(member.y + member.d, spec.y + spec.d);
      if (flipped ? buildBack : buildFront) {
        faces.push("front");
      }
      if (flipped ? buildFront : buildBack) {
        faces.push("back");
      }
      if (near(member.x, spec.x)) {
        faces.push("left");
      }
      if (near(member.x + member.w, spec.x + spec.w)) {
        faces.push("right");
      }
      const found =
        plan === undefined ? null : planEngraving(plan, spec.partNumber ?? 0, faces, flipped);
      if (found !== null && (engraving === null || found.stroke > engraving.stroke)) {
        engraving = found;
        onMember = i;
      }
    });
  }
  const pieces: Manifold[] = merged.members.map((member, i) =>
    scope.track(
      buildSolid(m, scope, member, settings, plans[i], i === onMember ? engraving : null).translate(
        [member.x - spec.x, member.y - spec.y, member.z - spec.z],
      ),
    ),
  );
  for (const b of merged.bridges) {
    pieces.push(
      box(
        m,
        scope,
        [b.x - spec.x, b.y - spec.y, b.z - spec.z],
        [b.x + b.w - spec.x, b.y + b.d - spec.y, b.z + b.h - spec.z],
      ),
    );
  }
  return scope.track(m.Manifold.union(pieces));
}

// Builds one printed part from its TraySpec alone, plus the settings that define
// the lip and the bottom chamfer and cap the outer corner radius (scoop radii
// and every other size come from the spec). A merged part (`spec.merged`) is built from its
// members. Mesh frame: tray-local, origin at the outer min corner, z = 0 at the bottom.
// Throws TraySpecError (a RangeError) for a spec planTray rejects, UnsupportedFeatureError for
// parts or features from a newer app version, Error if the kernel fails.
export function buildTray(
  m: ManifoldToplevel,
  spec: TraySpec,
  settings: Settings,
): { mesh: Mesh; volumeMm3: number } {
  return withScope((scope) => {
    const solid = spec.merged
      ? buildMerged(m, scope, spec, spec.merged, settings)
      : buildPart(m, scope, spec, settings);
    const status = solid.status();
    if (status !== "NoError") {
      throw new Error(`Tray ${spec.key}: geometry kernel failed (${status})`);
    }
    return { mesh: toMesh(solid), volumeMm3: solid.volume() };
  });
}
