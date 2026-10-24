/**
 * Test helper: checks a StoredLayout against the spec §3 hard rules, and that geometry builds
 * every printed part (planTray). Returns a list of violations (empty = all rules hold). Used by
 * the property and fixture tests.
 *
 * Known limits: a TraySpec does not record which variant produced it, and variants share
 * trayKeys, so the variant is inferred from the trays (`inferVariant`) and rule 7 is judged
 * against whichever same-key variant matches the stored trays. The bearing test of rule 4
 * restates the flush check with the realized lower wall, so it is a consistency check, not an
 * independent one. The coverage and lip-off rules are derived here from the box and settings
 * (not by importing the engine's predicates).
 */
import { planTray } from "../geometry/plan";
import { effective } from "../model/settings";
import { builtLevel, grooveOf, jointOf, lipAbove, lipEnabled, rimOn } from "../model/lip";
import type { Lock, Notice, StoredLayout, TraySpec } from "../model/types";
import { fitsBed } from "./bed";
import { hasGrip, needsGrip, wallFor } from "../sizing";
import { createCtx, printedHeight, type PartRef } from "./context";
import { splitRisers } from "./risers";
import { inferVariant, meetsMinimum } from "./warmstart";
import type { LayoutInput, LockConflict } from "./types";
import { toU, type Rect, type U } from "./units";

/**
 * `slack`: how much of a region may be empty past the parts in it, along each axis: 0 for an exact
 * tiling, or less than a filler needs where alike trays leave room too thin to be one.
 */
function tiles(rects: readonly Rect[], region: Rect, gap: U, slack: U): boolean {
  if (rects.length === 0) {
    return false;
  }
  if (rects.length === 1) {
    const r = rects[0];
    return (
      r !== undefined &&
      r.x === region.x &&
      r.y === region.y &&
      region.w - r.w >= 0 &&
      region.w - r.w <= slack &&
      region.d - r.d >= 0 &&
      region.d - r.d <= slack
    );
  }
  for (const alongX of [true, false]) {
    const end = (r: Rect): U => (alongX ? r.x + r.w : r.y + r.d);
    const start = (r: Rect): U => (alongX ? r.x : r.y);
    const cuts = [...new Set(rects.map(end))].sort((a, b) => a - b);
    for (const c of cuts) {
      const lo = rects.filter((r) => end(r) <= c);
      const hi = rects.filter((r) => start(r) >= c + gap);
      if (lo.length === 0 || hi.length === 0 || lo.length + hi.length !== rects.length) {
        continue;
      }
      // the next region starts where its first part does, up to `slack` past the gap
      const next = Math.min(...hi.map(start));
      if (next - c - gap > slack) {
        continue;
      }
      const regionLo: Rect = alongX
        ? { ...region, w: c - region.x }
        : { ...region, d: c - region.y };
      const regionHi: Rect = alongX
        ? { x: next, y: region.y, w: region.x + region.w - next, d: region.d }
        : { x: region.x, y: next, w: region.w, d: region.y + region.d - next };
      if (tiles(lo, regionLo, gap, slack) && tiles(hi, regionHi, gap, slack)) {
        return true;
      }
    }
  }
  return false;
}

/** Exact guillotine tiling of `region` by `rects`, separated by exactly `gap` along every cut. */
export function isGuillotineTiling(
  rects: readonly Rect[],
  region: Rect,
  gap: U,
  slack: U = 0,
): boolean {
  return tiles(rects, region, gap, slack);
}

function overlap3d(a: TraySpec, b: TraySpec): boolean {
  const ov = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 && b0 < a1;
  const r = (t: TraySpec) => ({
    x0: toU(t.x),
    x1: toU(t.x) + toU(t.w),
    y0: toU(t.y),
    y1: toU(t.y) + toU(t.d),
    z0: toU(t.z),
    z1: toU(t.z) + toU(t.h),
  });
  const p = r(a);
  const q = r(b);
  return ov(p.x0, p.x1, q.x0, q.x1) && ov(p.y0, p.y1, q.y0, q.y1) && ov(p.z0, p.z1, q.z0, q.z1);
}

/**
 * True when the layout ignored this lock: a conflict names its tray (a stack lock: its first
 * tray) and its kind.
 */
export function isDropped(lock: Lock, conflicts: readonly LockConflict[]): boolean {
  const key = lock.kind === "stack" ? lock.trayKeys[0] : lock.trayKey;
  return conflicts.some((c) => c.trayKey === key && (c.kind === undefined || c.kind === lock.kind));
}

export function checkHardRules(
  planned: LayoutInput,
  layout: StoredLayout,
  notices: readonly Notice[],
  /** The result's `lockConflicts`: locks the layout ignored are not checked. */
  conflicts: readonly LockConflict[] = [],
): string[] {
  const v: string[] = [];
  // an Auto plan is checked with the joint it was made with
  const input = { ...planned, settings: jointOf(planned.settings, layout) };
  const ctx = createCtx(input);
  const { settings } = input;
  const trays = layout.trays;
  const real = trays.filter((t) => t.part === "tray");
  const printed = trays.filter((t) => t.part !== "spacer");
  const eps = 1e-6;

  // The kept-free areas (box.headroomAreas with a size, "Part of it"): the paper lies in a corner of
  // the floor, and every stack that stands under it stops at the low plane, filled to it, so the
  // paper has one level top; every other stack reaches the lid.
  const papers = (layout.reserved ?? []).map((r) => ({
    x: toU(r.x),
    y: toU(r.y),
    w: toU(r.w),
    d: toU(r.d),
  }));
  const touchesPaper = (t: TraySpec): boolean =>
    papers.some((p) => {
      const x = toU(t.x);
      const y = toU(t.y);
      return x < p.x + p.w && p.x < x + toU(t.w) && y < p.y + p.d && p.y < y + toU(t.d);
    });
  const underPaper = (parts: readonly TraySpec[]): boolean => parts.some(touchesPaper);
  const planeOf = (parts: readonly TraySpec[]): U =>
    underPaper(parts) ? ctx.lowPlane : ctx.topPlane;
  const stacksOf = new Map<string, TraySpec[]>();
  for (const t of trays.filter((x) => x.part !== "spacer")) {
    stacksOf.set(t.path, [...(stacksOf.get(t.path) ?? []), t]);
  }
  const planeOfTray = (t: TraySpec): U => planeOf(stacksOf.get(t.path) ?? [t]);
  if (papers.length !== ctx.areas.length) {
    v.push(`the plan stores ${papers.length} kept-free areas, the box has ${ctx.areas.length}`);
  }
  papers.forEach((p, i) => {
    const turned = ctx.areas[i] && p.w === ctx.areas[i]?.d && p.d === ctx.areas[i]?.w;
    const as = ctx.areas[i];
    if (as && !(turned || (p.w === as.w && p.d === as.d))) {
      v.push(`kept-free area ${i}: ${p.w} × ${p.d} is not the size the box gives`);
    }
    const nearX = p.x === 0 || p.x + p.w === ctx.floorW;
    const nearY = p.y === 0 || p.y + p.d === ctx.floorD;
    if (!nearX || !nearY) {
      v.push(`kept-free area ${i} does not lie in a corner of the floor`);
    }
    papers.slice(i + 1).forEach((q) => {
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.d && q.y < p.y + p.d) {
        v.push(`kept-free area ${i} overlaps another`);
      }
    });
    // the paper is fully supported: whatever stands under it ends at the low plane exactly
    for (const t of printed.filter((x) => x.level === 0 && touchesPaper(x))) {
      const tops = (stacksOf.get(t.path) ?? [t]).reduce((m, x) => Math.max(m, toU(x.z + x.h)), 0);
      if (tops !== ctx.lowPlane && !(t.part === "tray" && t.lip)) {
        v.push(`${t.key}: under the paper, but its stack ends at ${tops}, not at ${ctx.lowPlane}`);
      }
    }
  });

  // 0.01 mm precision
  for (const t of trays) {
    for (const n of [t.x, t.y, t.z, t.w, t.d, t.h]) {
      if (toU(n) / 100 !== n) {
        v.push(`${t.key}: ${n} is not a multiple of 0.01 mm`);
      }
    }
  }

  // Every tray key appears once and belongs to a requirement.
  const seenKeys = new Set<string>();
  for (const t of trays) {
    if (seenKeys.has(t.key)) {
      v.push(`${t.key}: duplicate tray key`);
    }
    seenKeys.add(t.key);
  }
  for (const t of real) {
    if (ctx.refsOfKey(t.key).length === 0) {
      v.push(`${t.key}: owned by no requirement`);
    }
  }

  // Exactly one variant per requirement, every part of it.
  const refOf = new Map<string, PartRef>();
  input.requirements.forEach((r, i) => {
    const keys = new Set(real.filter((t) => ctx.refsOfKey(t.key)[0]?.req === i).map((t) => t.key));
    // Variants share trayKeys, so the variant is inferred from the trays (warm start does too).
    const vi = inferVariant(ctx, i, real);
    const chosen = vi === undefined ? undefined : r.variants[vi];
    const exact =
      chosen !== undefined &&
      chosen.parts.length === keys.size &&
      chosen.parts.every((p) => keys.has(p.trayKey));
    if (r.variants.length > 0 && (vi === undefined || !exact)) {
      v.push(`${r.key}: placed trays [${[...keys].join(", ")}] match no variant`);
    }
    if (vi !== undefined && exact) {
      chosen.parts.forEach((p, k) => refOf.set(p.trayKey, { req: i, variant: vi, part: k }));
    }
  });

  // The joints of a stack of copies (the top one's rim, the groove under the bottom one) are
  // best-effort: a stack that went without says so in a notice, and may differ from the others in
  // only those.
  const jointDropped = notices.some((n) => n.code === "layout.copiesJoint");
  // The sets of alike trays (owner, 2026-10-23: all trays of one set are the same size), and the
  // ones with a tray in a stack, which are built as a tray in the middle of one is wherever they stand.
  const setOf = (t: TraySpec): number => {
    const ref = refOf.get(t.key);
    return ref ? ctx.alikeOf(ref) : -1;
  };
  const inStack = new Set(
    real.filter((t) => real.some((o) => o !== t && o.path === t.path)).map((t) => setOf(t)),
  );
  inStack.delete(-1);
  const plug = (t: TraySpec): boolean => inStack.has(setOf(t));
  // The split parts of one item with another of them in the stack carry the joint too, in any place.
  const kinOf = (t: TraySpec): number => {
    const ref = refOf.get(t.key);
    return ref ? ctx.kinOf(ref) : -1;
  };
  const joint = (t: TraySpec): boolean =>
    plug(t) ||
    (lipEnabled(settings) &&
      kinOf(t) >= 0 &&
      real.filter((o) => o.path === t.path && kinOf(o) === kinOf(t)).length >= 2);
  const alikeOnFloor = real.some((t) => t.level === 0 && setOf(t) >= 0);

  // Rule 1: the bottom layer tiles the floor with only trayGap between parts. Beside an alike
  // tray room too thin for a filler stays empty instead of going into the tray.
  const bottoms = printed
    .filter((t) => t.level === 0)
    .map((t) => ({ x: toU(t.x), y: toU(t.y), w: toU(t.w), d: toU(t.d) }));
  if (
    !isGuillotineTiling(
      bottoms,
      { x: 0, y: 0, w: ctx.floorW, d: ctx.floorD },
      ctx.gap,
      alikeOnFloor ? ctx.minFillerUpper - 1 : 0,
    )
  ) {
    v.push("bottom layer does not tile the floor with exactly trayGap gaps");
  }

  // Rules 2 and 4: stacks.
  const sizeLocked = new Set(
    input.locks.flatMap((l) => (l.kind === "size" && !isDropped(l, conflicts) ? [l.trayKey] : [])),
  );
  const byPath = new Map<string, TraySpec[]>();
  for (const t of real) {
    byPath.set(t.path, [...(byPath.get(t.path) ?? []), t]);
  }
  const groove = grooveOf(settings, 1);
  const play = effective(settings).lipPlay;
  for (const [path, list] of byPath) {
    const stack = [...list].sort((a, b) => a.level - b.level);
    const base = stack[0];
    // Rule 2: the trays add up to the top plane exactly (fillToTop), or to no more than it
    // (fillToTop off). Risers are derived for printing and never stored.
    // An alike tray on top has its lip standing above the stack, and the alike trays of a stack
    // share the surplus in whole layers, so a stack of them only is up to a layer each short of it.
    const sum = stack.reduce((s, t) => s + toU(t.h), 0);
    const topTray = stack[stack.length - 1];
    const paper = underPaper(list);
    const plane = paper ? ctx.lowPlane : ctx.topPlane;
    const limit = plane - (topTray?.lip && joint(topTray) ? toU(lipAbove(settings, true)) : 0);
    const plugs = stack.filter((t) => plug(t) && !sizeLocked.has(t.key));
    const restFree = stack.some((t) => !plug(t) && !sizeLocked.has(t.key));
    // a stack that went without its rim or riser (best-effort, with the notice that says so) stops
    // short by whatever it did not pad
    const exact = plugs.length === 0 || restFree;
    if (
      settings.fillToTop || paper
        ? exact
          ? sum !== limit
          : sum > limit || (!jointDropped && limit - sum >= plugs.length * ctx.layer)
        : sum > limit
    ) {
      v.push(`stack ${path}: Σh = ${sum} ≠ topPlane ${plane}`);
    }
    let z = 0;
    stack.forEach((t, k) => {
      if (t.level !== k) {
        v.push(`stack ${path}: levels not consecutive`);
      }
      if (t.stack !== base?.stack) {
        v.push(`stack ${path}: mixed stack numbers`);
      }
      if (toU(t.z) !== z) {
        v.push(`${t.key}: z ${t.z} ≠ Σ lower heights`);
      }
      z += toU(t.h);
      const top = k === stack.length - 1;
      const topCopy = top && joint(t);
      if (t.lip !== (lipEnabled(settings) && (!top || joint(t))) && !(topCopy && jointDropped)) {
        v.push(`${t.key}: lip flag wrong`);
      }
      if (base && k > 0) {
        // A level is its own tray plus fillers: it stands flush in a corner of the tray below
        // (the lip is flush with the outer face, and the tray above has a groove for it, so the
        // stack does not narrow), and is no larger than that tray.
        const below = stack[k - 1];
        // (at either end of an axis: the filler goes to the end a finger cut does not face)
        const flush = (at: number, size: number, from: number, room: number): boolean =>
          at === from || at + size === from + room;
        if (
          !below ||
          !flush(toU(t.x), toU(t.w), toU(below.x), toU(below.w)) ||
          !flush(toU(t.y), toU(t.d), toU(below.y), toU(below.d)) ||
          toU(t.w) > toU(below.w) ||
          toU(t.d) > toU(below.d)
        ) {
          v.push(`${t.key}: level ${k} not flush in the tray below`);
        }
        if (lipEnabled(settings) && toU(t.h) < ctx.upperMinH) {
          v.push(`${t.key}: upper tray lower than its groove needs`);
        }
        const lower = stack[k - 1];
        // The stepped base has no ledge to bear on: its trays rest on their 45° step.
        if (lower && rimOn(settings)) {
          // The lower tray's outer wall as planTray builds it: its base wall or the lipped wall.
          const lipped = Math.max(lower.wall, wallFor(settings, true));
          // the end of x the tray stands flush on (a tray with a filler beside it hangs over the
          // tray's cavity at the other end, where the filler holds the space)
          const onLow = t.x - lower.x;
          const onHigh = lower.x + lower.w - (t.x + t.w);
          // what is left of the lower tray's rim past the groove's foot, and the play
          const bearing = lipped - Math.min(onLow, onHigh) - play - (groove?.reach ?? 0);
          const chamfer = groove?.foot ?? 0;
          if (bearing < settings.lip.ledge - 2 * play - chamfer - eps || bearing <= 0) {
            v.push(`${t.key}: bearing ${bearing} too small`);
          }
          if (toU(lower.z + lower.h + settings.lip.height) > plane) {
            v.push(`${lower.key}: lip rises above the top plane`);
          }
        }
      }
      if (!top && !stack.some((s) => sizeLocked.has(s.key)) && toU(t.h) % ctx.layer !== 0) {
        v.push(`${t.key}: h ${t.h} not a multiple of the layer height`);
      }
    });
  }
  for (const l of trays.filter((t) => t.part === "leftover")) {
    if (l.level === 0) {
      // beside a whole stack (or alone): as tall as the box, on the floor
      if (toU(l.h) !== Math.max(0, planeOfTray(l))) {
        v.push(`${l.key}: leftover not at full stack height`);
      }
      if (toU(l.z) !== 0) {
        v.push(`${l.key}: leftover not on the floor (z ${l.z}, level ${l.level})`);
      }
      continue;
    }
    // A filler within a stack level: it stands beside that level's tray, from the tray's floor to
    // the top of the stack, inside the tray below it, and apart from the level's tray.
    const stack = (byPath.get(l.path) ?? []).sort((a, b) => a.level - b.level);
    const own = stack.find((t) => t.level === l.level);
    const below = stack.find((t) => t.level === l.level - 1);
    if (!own || !below || own.stack !== l.stack) {
      v.push(`${l.key}: in-level filler (level ${l.level}) without a tray in that level`);
      continue;
    }
    const top = stack.reduce((s, t) => s + toU(t.h), 0);
    if (toU(l.z) !== toU(own.z) || toU(l.z) + toU(l.h) !== top) {
      v.push(`${l.key}: filler does not run from its level's floor to the top of the stack`);
    }
    const inside =
      toU(l.x) >= toU(below.x) &&
      toU(l.y) >= toU(below.y) &&
      toU(l.x) + toU(l.w) <= toU(below.x) + toU(below.w) &&
      toU(l.y) + toU(l.d) <= toU(below.y) + toU(below.d);
    if (!inside) {
      v.push(`${l.key}: filler not inside the footprint of the tray below`);
    }
    const apartX =
      toU(l.x) >= toU(own.x) + toU(own.w) + ctx.gap || toU(own.x) >= toU(l.x) + toU(l.w) + ctx.gap;
    const apartY =
      toU(l.y) >= toU(own.y) + toU(own.d) + ctx.gap || toU(own.y) >= toU(l.y) + toU(l.d) + ctx.gap;
    if (!apartX && !apartY) {
      v.push(`${l.key}: filler overlaps or touches its level's tray`);
    }
  }
  for (const t of printed) {
    if (toU(t.z) + toU(t.h) > planeOfTray(t)) {
      v.push(`${t.key}: rises above the top plane`);
    }
    if (t.part === "tray" && toU(t.z + t.h + lipAbove(settings, t.lip)) > planeOfTray(t)) {
      v.push(`${t.key}: its lip rises above the top plane`);
    }
  }

  // Rule 3: loose pieces left uncovered in the top layer need the coverage warning.
  const coverageNeeded =
    (input.box.headroom > 0 && input.box.headroomCoverage === "partial") || input.box.storedOnSide;
  const exposedLoose = real.some((t) => {
    const covered =
      real.some((o) => o.path === t.path && o.level > t.level) ||
      underPaper(stacksOf.get(t.path) ?? [t]);
    const r = input.requirements[ctx.refsOfKey(t.key)[0]?.req ?? -1];
    return !covered && r?.loose === true;
  });
  const has = (code: string): boolean => notices.some((n) => n.code === code);
  if (coverageNeeded && exposedLoose && !has("layout.coverage")) {
    v.push("loose pieces are uncovered in the top layer but there is no layout.coverage notice");
  }

  // Rule 4 with the lip off: stacked trays are loose, so the lip-off warning is required
  // exactly when something stacks.
  const stacked = real.some((t) => t.level > 0);
  if (!lipEnabled(settings) && stacked && !has("layout.lipOff")) {
    v.push("the lip is off and trays stack but there is no layout.lipOff notice");
  }
  if ((lipEnabled(settings) || !stacked) && has("layout.lipOff")) {
    v.push("layout.lipOff notice without a stack that needs it");
  }

  // Rule 2 opt-out: the note says some stack stops short, exactly when one does.
  const heights = new Map<number, number>();
  const planes = new Map<number, U>();
  for (const t of real) {
    heights.set(t.stack, (heights.get(t.stack) ?? 0) + toU(t.h));
    planes.set(t.stack, planeOfTray(t));
  }
  const stopsShort = [...heights].some(([stack, h]) => h < (planes.get(stack) ?? ctx.topPlane));
  if (!settings.fillToTop && stopsShort && !has("layout.stopsShort")) {
    v.push("a stack stops short of the top plane but there is no layout.stopsShort notice");
  }
  if ((settings.fillToTop || !stopsShort) && has("layout.stopsShort")) {
    v.push("layout.stopsShort notice without a stack that stops short");
  }

  // Rule 5: bed fit with margin, either rotation; a lipped tray prints its lip tall as well.
  for (const t of trays) {
    if (!fitsBed(ctx.bed, toU(t.w), toU(t.d), printedHeight(ctx, toU(t.h), t.lip, t.level > 0))) {
      v.push(`${t.key}: does not fit the print bed`);
    }
  }

  // Rule 7: compartments meet their minimums (compartment i ↔ CompartmentReq i; the
  // rectangle is content + clearance, no reach bands: amendment 7). Rule 8: grip.
  for (const t of real) {
    const ref = refOf.get(t.key);
    const part = ref ? ctx.part(ref) : undefined;
    (part?.compartments ?? []).forEach((c, i) => {
      const s = t.compartments[i];
      if (!s) {
        v.push(`${t.key}: compartment ${i} ("${c.contents}") missing`);
        return;
      }
      if (!meetsMinimum(c, s, t.h)) {
        v.push(`${t.key}: compartment ${i} below its minimum ${c.minW}×${c.minD}×${c.minH}`);
      }
    });
    if ((!part || needsGrip(part)) && !hasGrip(t.compartments, t.h)) {
      v.push(`${t.key}: no grip`);
    }
  }

  // Specs geometry accepts (roadmap §4.6): compartments inside the outer wall (lipped wall
  // when lip is set), not touching each other, floorZ in (0, h). planTray below checks every
  // rule; these name the common failures.
  for (const t of printed) {
    const wallOut = Math.max(t.wall, wallFor(settings, t.lip, t.level));
    t.compartments.forEach((s, i) => {
      if (
        s.x < wallOut - eps ||
        s.y < wallOut - eps ||
        s.x + s.w > t.w - wallOut + eps ||
        s.y + s.d > t.d - wallOut + eps
      ) {
        v.push(`${t.key}: compartment ${i} closer to an outer face than the outer wall`);
      }
      if (!(s.floorZ > 0 && s.floorZ < t.h)) {
        v.push(`${t.key}: compartment ${i} floorZ ${s.floorZ} outside (0, ${t.h})`);
      }
      t.compartments.slice(i + 1).forEach((o, j) => {
        const apart =
          s.x + s.w < o.x - eps ||
          o.x + o.w < s.x - eps ||
          s.y + s.d < o.y - eps ||
          o.y + o.d < s.y - eps;
        if (!apart) {
          v.push(`${t.key}: compartments ${i} and ${i + 1 + j} overlap or touch`);
        }
      });
    });
  }
  for (const l of trays.filter((t) => t.part === "leftover" && !t.solid)) {
    if (!hasGrip(l.compartments, l.h)) {
      v.push(`${l.key}: spare leftover without grip`);
    }
  }

  // Geometry builds every part (roadmap §4.6): planTray throws TraySpecError for a spec it
  // would not build (thin dividers, walls under MIN_WALL_MM, a part too small for its chamfer…).
  for (const t of trays) {
    try {
      planTray(t, settings);
    } catch (error) {
      v.push(`${t.key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // No two parts overlap in 3D; spacers lie inside their tray.
  for (let i = 0; i < printed.length; i++) {
    for (let j = i + 1; j < printed.length; j++) {
      const a = printed[i];
      const b = printed[j];
      if (a && b && overlap3d(a, b)) {
        v.push(`${a.key} overlaps ${b.key}`);
      }
    }
  }
  for (const s of trays.filter((t) => t.part === "spacer")) {
    const owner = real.find((t) => s.key === `${t.key}:spacer`);
    if (
      !owner ||
      s.x < owner.x - eps ||
      s.y < owner.y - eps ||
      s.x + s.w > owner.x + owner.w + eps ||
      s.y + s.d > owner.y + owner.d + eps
    ) {
      v.push(`${s.key}: spacer outside its tray`);
    }
  }

  // Alike trays (owner, 2026-10-23: "all trays from the same group/set should be the same in size,
  // no variations"): as printed, every tray of a set has the same size, height, rim and wells, so
  // any can take another's place. Padding goes into the riser, so it is judged after splitRisers.
  if (settings.fillToTop) {
    const made = splitRisers(trays, { settings, printer: input.printer, locks: input.locks });
    const bySet = new Map<number, TraySpec[]>();
    for (const t of made) {
      const own = real.find((r) => r.key === t.key);
      const set = t.part === "tray" && own ? setOf(own) : -1;
      if (set >= 0 && !sizeLocked.has(t.key)) {
        bySet.set(set, [...(bySet.get(set) ?? []), t]);
      }
    }
    for (const list of bySet.values()) {
      // in the tray's own frame: a tray turned a quarter turn has its sides swapped
      const shape = (t: TraySpec): string =>
        JSON.stringify([
          t.rotated ? [t.d, t.w] : [t.w, t.d],
          t.h,
          jointDropped ? null : t.lip,
          jointDropped ? null : builtLevel(t) > 0,
          t.compartments
            .map((c) => [...(t.rotated ? [c.d, c.w] : [c.w, c.d]), c.floorZ, c.kind])
            .sort(),
        ]);
      const first = list[0];
      for (const t of list) {
        if (first && shape(t) !== shape(first)) {
          v.push(`${t.key}: not the same as ${first.key}, which it should be (alike trays)`);
        }
      }
    }
  }

  // Locks: respected, or reported as conflicts.
  for (const lock of input.locks) {
    if (isDropped(lock, conflicts)) {
      continue;
    }
    if (lock.kind === "position") {
      const t = real.find((x) => x.key === lock.trayKey);
      if (!t || t.path !== lock.path || t.rotated !== lock.rotated) {
        v.push(`position lock on ${lock.trayKey} not respected`);
      }
    } else if (lock.kind === "size") {
      const t = real.find((x) => x.key === lock.trayKey);
      const same =
        t !== undefined &&
        toU(t.w) === toU(lock.w) &&
        toU(t.d) === toU(lock.d) &&
        toU(t.h) === toU(lock.h);
      if (!same) {
        v.push(`size lock on ${lock.trayKey} not respected`);
      }
    } else if (lock.kind === "turn") {
      const t = real.find((x) => x.key === lock.trayKey);
      if (!t || t.rotated !== lock.rotated) {
        v.push(`turn lock on ${lock.trayKey} not respected`);
      }
    } else {
      const ts = lock.trayKeys.map((k) => real.find((x) => x.key === k));
      const first = ts[0];
      const ok =
        first !== undefined &&
        ts.every((t, i) => t !== undefined && t.path === first.path && t.level === first.level + i);
      if (!ok) {
        v.push(`stack lock on ${lock.trayKeys.join(", ")} not respected`);
      }
    }
  }
  return v;
}
