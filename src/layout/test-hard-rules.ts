/**
 * Test helper: checks a StoredLayout against the spec §3 hard rules, and that geometry builds
 * every printed part (planTray). Returns a list of violations (empty = all rules hold). Used by
 * the property and fixture tests.
 */
import { planTray } from "../geometry/plan";
import { effectiveBottomChamfer } from "../model/settings";
import type { Lock, Notice, StoredLayout, TraySpec } from "../model/types";
import { fitsBed } from "./bed";
import { hasGrip, needsGrip, wallFor } from "../sizing";
import { createCtx, type PartRef } from "./context";
import { describeLock } from "./locks";
import { inferVariant, meetsMinimum } from "./warmstart";
import type { LayoutInput } from "./types";
import { toMm, toU, type Rect, type U } from "./units";

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

export function isDropped(lock: Lock, notices: readonly Notice[]): boolean {
  const d = describeLock(lock);
  return notices.some((n) => n.code === "lock.dropped" && n.message.startsWith(d));
}

export function checkHardRules(
  input: LayoutInput,
  layout: StoredLayout,
  notices: readonly Notice[],
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
    input.locks.flatMap((l) => (l.kind === "size" && !isDropped(l, notices) ? [l.trayKey] : [])),
  );
  const byPath = new Map<string, TraySpec[]>();
  for (const t of real) {
    byPath.set(t.path, [...(byPath.get(t.path) ?? []), t]);
  }
  const chamfer = effectiveBottomChamfer(settings, 1);
  const play = toMm(ctx.inset) - settings.lip.thickness;
  for (const [path, list] of byPath) {
    const stack = [...list].sort((a, b) => a.level - b.level);
    const sum = stack.reduce((s, t) => s + toU(t.h), 0);
    if (sum !== ctx.topPlane) {
      v.push(`stack ${path}: Σh = ${sum} ≠ topPlane ${ctx.topPlane}`);
    }
    let z = 0;
    const base = stack[0];
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
        const inset = k * ctx.inset;
        if (
          toU(t.x) - toU(base.x) !== inset ||
          toU(t.y) - toU(base.y) !== inset ||
          toU(t.w) !== toU(base.w) - 2 * inset ||
          toU(t.d) !== toU(base.d) - 2 * inset
        ) {
          v.push(`${t.key}: level ${k} not inset k·(lip.thickness + play)`);
        }
        if (settings.lip.enabled && toU(t.h) < ctx.upperMinH) {
          v.push(`${t.key}: upper tray lower than lip.height + 3`);
        }
        const lower = stack[k - 1];
        if (lower && settings.lip.enabled) {
          // The lower tray's outer wall as planTray builds it: its base wall or the lipped wall.
          const lipped = Math.max(lower.wall, wallFor(settings, true));
          const bearing = lipped - (t.x - lower.x) - play - chamfer;
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
    if (toU(l.h) !== Math.max(0, ctx.topPlane)) {
      v.push(`${l.key}: leftover not at full stack height`);
    }
  }

  // Rule 5: bed fit with margin, either rotation.
  for (const t of trays) {
    if (!fitsBed(ctx.bed, toU(t.w), toU(t.d), toU(t.h))) {
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
    if ((!part || needsGrip(part)) && !hasGrip(t.compartments)) {
      v.push(`${t.key}: no grip`);
    }
  }

  // Specs geometry accepts (roadmap §4.6): compartments inside the outer wall (lipped wall
  // when lip is set), not touching each other, floorZ in (0, h). planTray below checks every
  // rule; these name the common failures.
  for (const t of printed) {
    const wallOut = t.lip ? Math.max(t.wall, wallFor(settings, true)) : t.wall;
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
    if (!hasGrip(l.compartments)) {
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

  // Locks: respected, or dropped with a notice.
  for (const lock of input.locks) {
    if (isDropped(lock, notices)) {
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
