import type { Manifold, ManifoldToplevel, Vec2, Vec3 } from "manifold-3d";
import type { Groove, Step } from "../model/lip";
import type { BoxMm, MergedPart, Settings, TraySpec } from "../model/types";
import type { Mesh } from "./types";
import { planTray } from "./plan";
import { carriesName } from "../model/part-name";
import { buildEngravings, hasEngraving, planEngravings, planMergedEngraving } from "./engrave";
import type { Engravings } from "./engrave";
import { cutFace, filletStrip, ledgeStrip } from "./plan-cuts";
import { mergedBody, mergedOutline } from "./merged-outline";
import type { Band } from "./merged-outline";
import { INNER_CORNER_RADIUS_MM } from "./plan-types";
import type {
  CompartmentPlan,
  CutPlan,
  DipPlan,
  LipPlan,
  Rect,
  ScoopPlan,
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
  if (plan.groove) {
    return buildGroovedOuter(m, scope, plan, plan.groove);
  }
  if (plan.step) {
    return buildSteppedOuter(m, scope, plan, plan.step);
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

// The outer body of a part with the stepped base under it (model/lip.ts stepOf), in the spec frame
// (z = 0 at the seam; buildPart lifts it so the slab is on the bed), as two convex lofts: the body,
// from the step's ring at the slab's side (inset, z = −play) out at 45° to the outer face at
// z = wall, then straight up, its rings offsets of the outline (radius r − u; plan keeps r at least
// the inset); and the slab under it, from its bed ring (inset + foot, sharp) up the foot chamfer to
// its side (inset, radius foot), then straight up into the body. The slab's corners are at most as
// round as the body's ring at the inset, so its top is a ledge facing up where they differ, and
// every face that looks down is the bed face or slopes at 45°.
function buildSteppedOuter(m: ManifoldToplevel, scope: Scope, plan: TrayPlan, st: Step): Manifold {
  const { w, d, h, cornerRadius: r } = plan;
  const n = quarterSegments(r);
  const ring = (u: number): Vec2[] => roundedRectRing(u, u, w - u, d - u, Math.max(r - u, 0), n);
  const body = loft(m, scope, [
    { ring: ring(st.inset), z: -st.play },
    { ring: ring(0), z: st.wall },
    { ring: ring(0), z: h },
  ]);
  const slabRing = (u: number): Vec2[] =>
    roundedRectRing(u, u, w - u, d - u, Math.max(st.foot - (u - st.inset), 0), n);
  // Its top takes the body's bottom ring too: where the two corners are as round (foot = r −
  // inset) their facets differ, and the body's would stand out over the slab's as slivers facing
  // down.
  const slab = loft(m, scope, [
    { ring: slabRing(st.inset + st.foot), z: -st.height },
    { ring: slabRing(st.inset), z: -st.height + st.foot },
    { ring: [...slabRing(st.inset), ...ring(st.inset)], z: -st.play + EPS },
  ]);
  return scope.track(m.Manifold.union([body, slab]));
}

// The socket of a part with another stacked on it, with the stepped base: everything more than the
// wall in from the outer faces, from `depth` under the rim up (dividers, the tops of the wells'
// walls), so the slab above drops in with the play all round and under it. Its corners are rounded
// with the plan's radius (at most the slab's inset, less the wall), so every slab fits.
function buildSocket(
  m: ManifoldToplevel,
  scope: Scope,
  plan: TrayPlan,
  socket: NonNullable<TrayPlan["socket"]>,
): Manifold {
  const { w, d, h } = plan;
  const u = socket.wall;
  const ring = roundedRectRing(u, u, w - u, d - u, socket.radius, quarterSegments(socket.radius));
  return prism(m, scope, ring, h - socket.depth, plan.topZ + OVERSHOOT);
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
function buildCut(
  m: ManifoldToplevel,
  scope: Scope,
  cut: CutPlan,
  top: number,
  // where a cut through the floor ends, OVERSHOOT under the bed (under a part's slab, if it has one)
  bottom = -OVERSHOOT,
): Manifold[] {
  const reach = cutReach(cut);
  const u = buildU(m, scope, { ...cut, ...reach }, top);
  if (cut.notch <= 0) {
    return [u];
  }
  // Through the floor down to the bed, EPS into the compartments at its ends like the U.
  const through = box(m, scope, [reach.x0, reach.y0, bottom], [reach.x1, reach.y1, top]);
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
  return [u, through, prism(m, scope, ring, bottom, top)];
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
  [r0, r1]: readonly [number, number] = cut.topFillets,
): Manifold[] {
  const along = cut.side === "front" || cut.side === "back";
  const [a, b] = along ? [cut.x0, cut.x1] : [cut.y0, cut.y1];
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

// The strip the fillets of the layer beside a cut's own (ledgeStrip) are cut across: its outer
// side stays where the layer ends (against the lip ring or the wall, whose fillets are the strip
// of filletReach), its inner one reaches INNER_CORNER_RADIUS_MM + EPS into the compartment.
function ledgeReach(
  cut: CutPlan,
  strip: { top: number; v0: number; v1: number },
): { top: number; v0: number; v1: number } {
  const outerLow = cut.side === "front" || cut.side === "left";
  const inner = INNER_CORNER_RADIUS_MM + EPS;
  return outerLow ? { ...strip, v1: strip.v1 + inner } : { ...strip, v0: strip.v0 - inner };
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
      ...buildCut(m, scope, cut, top, -(plan.step?.height ?? 0) - OVERSHOOT),
      ...buildTopFillets(
        m,
        scope,
        cut,
        filletReach(
          cut,
          filletStrip(cut, plan, plan.lip, plan.socket),
          plan.lip !== null || plan.socket !== null,
        ),
      ),
      ...buildLedgeFillets(m, scope, plan, cut),
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

// The fillets of the layer a cut through the rim passes through beside its own strip: the ledge
// beside the lip ring, the floor of the socket beside the wall.
function buildLedgeFillets(
  m: ManifoldToplevel,
  scope: Scope,
  plan: TrayPlan,
  cut: CutPlan,
): Manifold[] {
  const strip = ledgeStrip(cut, plan, plan.lip, plan.socket);
  return strip === null
    ? []
    : buildTopFillets(m, scope, cut, ledgeReach(cut, strip), cut.ledgeFillets);
}

// A finger dip: the U of a cut, run in from its face and, across the whole part when `through`, out
// through the opposite one too; past each face it leaves through by OVERSHOOT. Vertical sides, a
// round bottom, open at the top: nothing overhangs.
function buildDip(m: ManifoldToplevel, scope: Scope, dip: DipPlan, top: number): Manifold {
  const { side, through } = dip;
  const alongX = side === "front" || side === "back";
  const first = side === "front" || side === "left";
  const out = (near: boolean): number => (near ? OVERSHOOT : 0);
  const reach = alongX
    ? {
        y0: dip.y0 - out(first || through),
        y1: dip.y1 + out(!first || through),
      }
    : {
        x0: dip.x0 - out(first || through),
        x1: dip.x1 + out(!first || through),
      };
  return buildU(m, scope, { ...dip, ...reach }, top);
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

// A divider's finger cuts (spec.notches): half-round, through the plate. A flat plate's are vertical
// cylinders centred on an edge, a standing plate's one is a horizontal cylinder centred on its top
// edge, along the plate's long side. Past the faces they leave through by OVERSHOOT.
function buildNotches(
  m: ManifoldToplevel,
  scope: Scope,
  spec: TraySpec,
  plan: TrayPlan,
): Manifold[] {
  return (spec.notches ?? []).map((n) => {
    if (n.face === "top") {
      const alongY = plan.d > plan.w;
      return horizontalCylinder(
        m,
        scope,
        alongY ? "x" : "y",
        -OVERSHOOT,
        (alongY ? plan.w : plan.d) + OVERSHOOT,
        n.at,
        plan.h,
        n.r,
      );
    }
    const [cx, cy] =
      n.face === "left"
        ? [0, n.at]
        : n.face === "right"
          ? [plan.w, n.at]
          : n.face === "front"
            ? [n.at, 0]
            : [n.at, plan.d];
    return prism(
      m,
      scope,
      circleRing(cx, cy, n.r, 4 * quarterSegments(n.r)),
      -OVERSHOOT,
      plan.h + OVERSHOOT,
    );
  });
}

// What a part's solid loses: the compartments' cutters, a spacer's notch, a filler's dips and the engraving, in the
// part's own frame (origin at its outer min corner).
function buildCutters(
  m: ManifoldToplevel,
  scope: Scope,
  spec: TraySpec,
  plan: TrayPlan,
  engravings: Engravings | null,
): Manifold[] {
  const cutters = plan.compartments.map((c) => buildCutter(m, scope, plan, c));
  if (plan.socket) {
    cutters.push(buildSocket(m, scope, plan, plan.socket));
  }
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
  // A filler's finger dips leave through the faces that touch a tray.
  for (const dip of plan.dips) {
    cutters.push(buildDip(m, scope, dip, plan.topZ + OVERSHOOT));
  }
  cutters.push(...buildNotches(m, scope, spec, plan));
  // An underside name is cut into the bed face: the slab's, below the seam, on a stepped part.
  const engraved = engravings
    ? buildEngravings(m, scope, engravings, spec, -(plan.step?.height ?? 0))
    : null;
  if (engraved) {
    cutters.push(engraved);
  }
  return cutters;
}

// The solid of one tray part from its TraySpec alone, tracked in `scope`; its frame is tray-local
// (origin at the outer min corner, z = 0 at the bottom). Throws like buildTray.
function buildSolid(
  m: ManifoldToplevel,
  scope: Scope,
  spec: TraySpec,
  settings: Settings,
  plan: TrayPlan = planTray(spec, settings),
  engravings: Engravings | null = null,
): Manifold {
  let solid = buildOuter(m, scope, plan);
  if (plan.lip) {
    solid = scope.track(solid.add(buildLip(m, scope, plan, plan.lip)));
  }
  const cutters = buildCutters(m, scope, spec, plan, engravings);
  if (cutters.length > 0) {
    solid = scope.track(solid.subtract(scope.track(m.Manifold.union(cutters))));
  }
  return solid;
}

// The name engraved on a part (spec.partName, set by the app on the copy it asks to build when
// the engraving setting is on) and where: two opposite outer walls and the underside, each that
// has room; null for a part that carries none (a plate: a spacer or divider), or that has no face
// with room (planEngravings).
function engravingsOf(plan: TrayPlan, spec: TraySpec): Engravings | null {
  const name = spec.partName;
  if (name === undefined || !carriesName(spec.part)) {
    return null;
  }
  const found = planEngravings(plan, name);
  return hasEngraving(found) ? found : null;
}

function buildPart(
  m: ManifoldToplevel,
  scope: Scope,
  spec: TraySpec,
  settings: Settings,
): Manifold {
  const plan = planTray(spec, settings);
  const solid = buildSolid(m, scope, spec, settings, plan, engravingsOf(plan, spec));
  // The mesh frame has z = 0 at the bed: a stepped part's slab, built under the seam, goes up.
  return plan.step ? scope.track(solid.translate([0, 0, plan.step.height])) : solid;
}

// A merged part (several fillers and risers printed as one, mergeParts) is its members and the
// solid bridges that fill the tray gaps between them. Everything is in the merged part's frame: its
// bounding box's min corner is the origin.
//
// Built as one shape: the outline is the union of the members' footprints and the bridges (one per
// height, as members differ in height), its convex corners are rounded once and its bottom edge is
// chamfered once, so the joined outline has no step where two members meet (a member built alone
// has rounded corners and a chamfer of its own, and the seam between two of them is a notch the
// bridge only fills so far). Each member's own cuts (its pocket, notch and engraving) are then
// taken out of it, and only out of it.
//
// A socketed riser (the stepped base) is built once like any other: its socket is one of its own
// cuts (buildCutters). A riser's lip ring (the rim between layers) is added on its member after the
// outline is built, as buildSolid adds it, so a lipped riser is no reason to build the members
// alone. A flipped part (members on different floors, printed upside down), a member with a groove
// or a step, and members with different chamfers are built the way each member would be alone,
// joined by the bridges.
function buildMerged(
  m: ManifoldToplevel,
  scope: Scope,
  spec: TraySpec,
  merged: MergedPart,
  settings: Settings,
): Manifold {
  // The name goes on one member, on a face on the merged part's own outside (as it prints: a
  // flipped part is turned over, front and back change places): the member where it is largest,
  // and the wall opposite when that is on the outside too. Never the underside.
  const plans = merged.members.map((member) => planTray(member, settings));
  const found =
    spec.partName !== undefined && carriesName(spec.part)
      ? planMergedEngraving(spec, merged, plans, spec.partName)
      : null;
  const onMember = found?.member ?? -1;
  const engravings: Engravings | null = found ? { walls: found.engravings, underside: null } : null;
  const once = buildMergedOnce(m, scope, spec, merged, plans, (i) =>
    i === onMember ? engravings : null,
  );
  if (once) {
    return once;
  }
  const pieces: Manifold[] = merged.members.map((member, i) =>
    scope.track(
      buildSolid(
        m,
        scope,
        member,
        settings,
        plans[i],
        i === onMember ? engravings : null,
      ).translate([member.x - spec.x, member.y - spec.y, member.z - spec.z]),
    ),
  );
  for (const b of merged.bridges) {
    pieces.push(bridgeBox(m, scope, spec, b));
  }
  return scope.track(m.Manifold.union(pieces));
}

// A bridge, in the merged part's frame.
function bridgeBox(m: ManifoldToplevel, scope: Scope, spec: TraySpec, b: BoxMm): Manifold {
  return box(
    m,
    scope,
    [b.x - spec.x, b.y - spec.y, b.z - spec.z],
    [b.x + b.w - spec.x, b.y + b.d - spec.y, b.z + b.h - spec.z],
  );
}

// The merged part as one rounded outline (see buildMerged); null for a part that is built from its
// members instead, or when the outline cannot be made.
function buildMergedOnce(
  m: ManifoldToplevel,
  scope: Scope,
  spec: TraySpec,
  merged: MergedPart,
  plans: TrayPlan[],
  engravingsOf: (member: number) => Engravings | null,
): Manifold | null {
  const first = plans[0];
  if (
    !first ||
    merged.flipped ||
    plans.some(
      (p) => p.groove !== null || p.step !== null || Math.abs(p.chamfer - first.chamfer) > 1e-9,
    )
  ) {
    return null;
  }
  const inFrame = (b: BoxMm) => ({
    x0: b.x - spec.x,
    y0: b.y - spec.y,
    z0: b.z - spec.z,
    x1: b.x + b.w - spec.x,
    y1: b.y + b.d - spec.y,
    z1: b.z + b.h - spec.z,
  });
  const members = merged.members.map((member, i) => ({
    ...inFrame({ x: member.x, y: member.y, z: member.z, w: member.w, d: member.d, h: member.h }),
    radius: plans[i]?.cornerRadius ?? 0,
  }));
  const feet = [...members, ...merged.bridges.map(inFrame)];
  // Everything stands on one floor (a part with members on different floors is flipped).
  const floor = Math.min(...feet.map((b) => b.z0));
  if (feet.some((b) => Math.abs(b.z0 - floor) > 1e-6)) {
    return null;
  }
  const tops = [...new Set(feet.map((b) => Math.round((b.z1 - floor) * 1e4) / 1e4))].sort(
    (a, b) => a - b,
  );
  const fallback = Math.min(...members.map((b) => b.radius));
  const bands: Band[] = [];
  for (const top of tops) {
    const outline = mergedOutline(
      m,
      scope,
      feet.filter((b) => b.z1 - floor >= top - 1e-4),
      first.chamfer,
      fallback,
    );
    if (!outline) {
      return null;
    }
    bands.push({ outline, top });
  }
  const body = mergedBody(m, scope, bands, first.chamfer);
  if (!body) {
    return null;
  }
  const joined = scope.track(body.translate([0, 0, floor]));
  // A riser's lip ring (the rim between layers) stands on its own member's rim, round its own rounded
  // footprint as it does alone: the ring is what the tray above fits, and it is added before the
  // member's cuts, which go through it as they do through a lipped part alone.
  const rings = merged.members.flatMap((member, i) => {
    const lip = plans[i]?.lip;
    return lip
      ? [
          scope.track(
            buildLip(m, scope, plans[i] as TrayPlan, lip).translate([
              member.x - spec.x,
              member.y - spec.y,
              member.z - spec.z,
            ]),
          ),
        ]
      : [];
  });
  const solid = rings.length === 0 ? joined : scope.track(m.Manifold.union([joined, ...rings]));
  // A member's cuts leave through its faces (a notch, a wall cutout) and past them by OVERSHOOT:
  // they take material out of the member and the air around it, and never out of a neighbour or a
  // bridge, which would have filled them again.
  const cuts: Manifold[] = [];
  for (const [i, member] of merged.members.entries()) {
    const plan = plans[i] as TrayPlan;
    const cutters = buildCutters(m, scope, member, plan, engravingsOf(i));
    if (cutters.length === 0) {
      continue;
    }
    const own = members[i] as (typeof members)[number];
    const others = [
      ...members
        .filter((_, j) => j !== i)
        .map((b) => box(m, scope, [b.x0, b.y0, b.z0], [b.x1, b.y1, b.z1])),
      ...merged.bridges.map((b) => bridgeBox(m, scope, spec, b)),
    ];
    const reach = box(
      m,
      scope,
      [own.x0 - OVERSHOOT, own.y0 - OVERSHOOT, own.z0 - OVERSHOOT],
      [own.x1 + OVERSHOOT, own.y1 + OVERSHOOT, own.z1 + (plan.lip?.height ?? 0) + OVERSHOOT],
    );
    const room = scope.track(reach.subtract(scope.track(m.Manifold.union(others))));
    const moved = scope.track(
      scope.track(m.Manifold.union(cutters)).translate([own.x0, own.y0, own.z0]),
    );
    cuts.push(scope.track(moved.intersect(room)));
  }
  return cuts.length === 0
    ? solid
    : scope.track(solid.subtract(scope.track(m.Manifold.union(cuts))));
}

// Builds one printed part from its TraySpec alone, plus the settings that define
// the lip and the bottom chamfer and cap the outer corner radius (scoop radii
// and every other size come from the spec). A merged part (`spec.merged`) is built from its
// members. Mesh frame: tray-local, origin at the outer min corner, z = 0 at the bottom (a part with
// the stepped base under it: at the slab's bed face, its spec's z less the slab's height).
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
