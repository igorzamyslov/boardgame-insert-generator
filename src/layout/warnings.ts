import { FIT_CHOICES } from "../model/settings";
import type { Notice, TraySpec } from "../model/types";
import type { TrayRequirement } from "../sizing/types";
import { fitsBed } from "./bed";
import { PLAY_LIMIT_U, type Ctx } from "./context";
import { coverageApplies } from "./score";
import type { LayoutSummary } from "./types";
import { toMm } from "./units";

/** Stable notice codes emitted by the layout engine (spec §7.3). */
export const NOTICE_CODES = {
  coverage: "layout.coverage",
  play: "layout.play",
  lipOff: "layout.lipOff",
  capped: "layout.capped",
  bed: "layout.bed",
  doesNotFit: "layout.doesNotFit",
  lockDropped: "lock.dropped",
} as const;

export function requirementLabel(r: TrayRequirement): string {
  const names = new Set(
    (r.variants[0]?.parts ?? []).flatMap((p) => p.compartments.map((c) => c.contents)),
  );
  return names.size > 0 ? [...names].join(", ") : r.key;
}

function mm(v: number): string {
  return v.toFixed(1);
}

/** Warnings about a feasible layout: coverage, play, lip off. */
export function layoutWarnings(
  ctx: Ctx,
  trays: readonly TraySpec[],
  summary: LayoutSummary,
): Notice[] {
  const out: Notice[] = [];
  const { box, settings } = ctx.input;
  const real = trays.filter((t) => t.part === "tray");
  if (coverageApplies(ctx)) {
    const exposed = real.filter((t) => {
      const covered = real.some((o) => o.path === t.path && o.level > t.level);
      const r = ctx.input.requirements[ctx.refsOfKey(t.key)[0]?.req ?? -1];
      return !covered && r?.loose === true;
    });
    if (exposed.length > 0) {
      const labels = [
        ...new Set(
          exposed.map(
            (t) =>
              t.compartments
                .map((c) => c.contents)
                .filter((c) => c !== "")
                .join(", ") || t.key,
          ),
        ),
      ].join("; ");
      out.push({
        level: "warning",
        code: NOTICE_CODES.coverage,
        message: box.storedOnSide
          ? `The box is stored on its side, so loose bits in the top layer can spill: ${labels}. Lock them below other trays.`
          : `The boards don't cover the whole top layer, so these loose bits may not stay in place: ${labels}. Lock them below other trays.`,
      });
    }
  }
  const limit = toMm(PLAY_LIMIT_U);
  for (const [axis, play] of [
    ["X", summary.playX],
    ["Y", summary.playY],
  ] as const) {
    if (play > limit) {
      out.push({
        level: "warning",
        code: NOTICE_CODES.play,
        message: `Trays can shift ${play.toFixed(2)} mm along ${axis} (more than ${limit} mm). Fewer trays side by side or a tighter Fit reduce it.`,
      });
    }
  }
  if (!settings.lip.enabled && real.some((t) => t.level > 0)) {
    out.push({
      level: "warning",
      code: NOTICE_CODES.lipOff,
      message: "The locating lip is off, so stacked trays are not held in place.",
    });
  }
  return out;
}

/** Errors for requirements that fit the print bed in no variant, splits included. */
export function bedNotices(ctx: Ctx): Notice[] {
  const out: Notice[] = [];
  ctx.input.requirements.forEach((r, i) => {
    let smallest: { w: number; d: number; h: number } | null = null;
    const anyFits = r.variants.some((v, vi) =>
      v.parts.every((_, pi) => {
        const m = ctx.metrics({ req: i, variant: vi, part: pi }, false, 0);
        const ok = fitsBed(ctx.bed, m.w, m.d, m.h);
        if (!ok && (smallest === null || m.w * m.d < smallest.w * smallest.d)) {
          smallest = { w: m.w, d: m.d, h: m.h };
        }
        return ok;
      }),
    );
    if (!anyFits && r.variants.length > 0) {
      const s = smallest ?? { w: 0, d: 0, h: 0 };
      out.push({
        level: "error",
        code: NOTICE_CODES.bed,
        message: `"${requirementLabel(r)}" is too large for the print bed in every variant, splits included: it needs at least ${mm(toMm(s.w))} × ${mm(toMm(s.d))} × ${mm(toMm(s.h))} mm; the usable bed is ${mm(toMm(ctx.bed.w))} × ${mm(toMm(ctx.bed.d))} × ${mm(toMm(ctx.bed.z))} mm.`,
      });
    }
  });
  return out;
}

/** Spec §7.3: shortfall per axis plus concrete suggestions. Shortfall in mm. */
export function doesNotFitNotice(ctx: Ctx, shortfall: { x: number; y: number; z: number }): Notice {
  const parts: string[] = [];
  if (shortfall.x > 0) {
    parts.push(`${mm(shortfall.x)} mm in width (X)`);
  }
  if (shortfall.y > 0) {
    parts.push(`${mm(shortfall.y)} mm in depth (Y)`);
  }
  if (shortfall.z > 0) {
    parts.push(`${mm(shortfall.z)} mm in height`);
  }
  const tips = [
    "use unsleeved cards or thinner sleeves",
    "store cards flat or upright (Storage: auto tries both)",
  ];
  if (ctx.input.box.headroom > 0) {
    tips.push("move the rulebook or boards elsewhere (less headroom)");
  }
  if (ctx.input.settings.fit > FIT_CHOICES.tight) {
    tips.push("choose a tighter fit (Fit: tight)");
  }
  tips.push("split groups into separate components");
  const short =
    parts.length > 0
      ? `The box is too small by ${parts.join(", ")}.`
      : "Some trays don't fit the print bed or a locked size.";
  return {
    level: "error",
    code: NOTICE_CODES.doesNotFit,
    message: `The components don't fit in this box. ${short} Try: ${tips.join("; ")}.`,
  };
}

/** Why a run stopped early: the time cap (with the cap in effect) or a cancel request. */
export type StopReason = { reason: "time"; limitMs: number } | { reason: "cancel" };

export function cappedNotice(stop: StopReason): Notice {
  const message =
    stop.reason === "time"
      ? `The optimizer stopped at its ${Number((stop.limitMs / 1000).toFixed(1))} s safety limit; this layout can't be reproduced from its seed.`
      : "The optimization was stopped before it finished; this layout can't be reproduced from its seed.";
  return { level: "info", code: NOTICE_CODES.capped, message };
}
