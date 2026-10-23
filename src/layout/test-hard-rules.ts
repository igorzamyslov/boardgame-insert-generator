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
import { grooveOf, rimOn } from "../model/lip";
import type { Lock, Notice, StoredLayout, TraySpec } from "../model/types";
import { fitsBed } from "./bed";
import { hasGrip, needsGrip, wallFor } from "../sizing";
import { createCtx, printedHeight, type PartRef } from "./context";
import { inferVariant, meetsMinimum } from "./warmstart";
import type { LayoutInput, LockConflict } from "./types";
import { toU, type Rect, type U } from "./units";

function tiles(rects: readonly Rect[], region: Rect, gap: U): boolean {
  if (rects.length === 0) {
    return false;
  }
  if (rects.length === 1) {
    const r = rects[0];
    return (
      r !== undefined &&
      r.x === region.x &&
      r.y === region.y &&
      r.w === region.w &&
      r.d === region.d
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
      const regionLo: Rect = alongX
        ? { ...region, w: c - region.x }
        : { ...region, d: c - region.y };
      const regionHi: Rect = alongX
        ? { x: c + gap, y: region.y, w: region.x + region.w - c - gap, d: region.d }
        : { x: region.x, y: c + gap, w: region.w, d: region.y + region.d - c - gap };
      if (tiles(lo, regionLo, gap) && tiles(hi, regionHi, gap)) {
        return true;
      }
    }
  }
  return false;
}

/** Exact guillotine tiling of `region` by `rects`, separated by exactly `gap` along every cut. */
export function isGuillotineTiling(rects: readonly Rect[], region: Rect, gap: U): boolean {
  return tiles(rects, region, gap);
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
  input: LayoutInput,
  layout: StoredLayout,
  notices: readonly Notice[],
  /** The result's `lockConflicts`: locks the layout ignored are not checked. */
  conflicts: readonly LockConflict[] = [],
): string[] {
  const v: string[] = [];
  const ctx = createCtx(input);
  const { settings } = input;
  const trays = layout.trays;
  const real = trays.filter((t) => t.part === "tray");
  const printed = trays.filter((t) => t.part !== "spacer");
  const eps = 1e-6;

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

  // Rule 1: the bottom layer tiles the floor with only trayGap between parts.
  const bottoms = printed
    .filter((t) => t.level === 0)
    .map((t) => ({ x: toU(t.x), y: toU(t.y), w: toU(t.w), d: toU(t.d) }));
  if (!isGuillotineTiling(bottoms, { x: 0, y: 0, w: ctx.floorW, d: ctx.floorD }, ctx.gap)) {
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
    const sum = stack.reduce((s, t) => s + toU(t.h), 0);
    if (settings.fillToTop ? sum !== ctx.topPlane : sum > ctx.topPlane) {
      v.push(`stack ${path}: Σh = ${sum} ≠ topPlane ${ctx.topPlane}`);
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
      if (t.lip !== (settings.lip.enabled && !top)) {
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
        if (settings.lip.enabled && toU(t.h) < ctx.upperMinH) {
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
          if (toU(lower.z + lower.h + settings.lip.height) > ctx.topPlane) {
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
      if (toU(l.h) !== Math.max(0, ctx.topPlane)) {
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
    if (toU(t.z) + toU(t.h) > ctx.topPlane) {
      v.push(`${t.key}: rises above the top plane`);
    }
  }

  // Rule 3: loose pieces left uncovered in the top layer need the coverage warning.
  const coverageNeeded =
    (input.box.headroom > 0 && input.box.headroomCoverage === "partial") || input.box.storedOnSide;
  const exposedLoose = real.some((t) => {
    const covered = real.some((o) => o.path === t.path && o.level > t.level);
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
  if (!settings.lip.enabled && stacked && !has("layout.lipOff")) {
    v.push("the lip is off and trays stack but there is no layout.lipOff notice");
  }
  if ((settings.lip.enabled || !stacked) && has("layout.lipOff")) {
    v.push("layout.lipOff notice without a stack that needs it");
  }

  // Rule 2 opt-out: the note says some stack stops short, exactly when one does.
  const heights = new Map<number, number>();
  for (const t of real) {
    heights.set(t.stack, (heights.get(t.stack) ?? 0) + toU(t.h));
  }
  const stopsShort = [...heights.values()].some((h) => h < ctx.topPlane);
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
