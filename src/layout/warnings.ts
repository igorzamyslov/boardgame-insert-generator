import { FIT_CHOICES } from "../model/settings";
import type { Notice, TraySpec } from "../model/types";
import type { TrayRequirement } from "../sizing/types";
import { fitsBed } from "./bed";
import { PLAY_LIMIT_U, printedHeight, type Ctx, type PartRef } from "./context";
import { coverageApplies } from "./score";
import type { LayoutSummary } from "./types";
import { toMm, toU, type U } from "./units";
import { inferVariant } from "./warmstart";

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

/**
 * Where a part can sit in a stack as far as the print bed goes: as a lower tray its walls
 * thicken to the lipped wall; as an upper tray its bottom footprint grows by the lip inset on
 * every side. `bottom`/`top` are false when that size exceeds the bed (in either orientation;
 * a lipped lower tray prints its lip tall as well), and `bottomSize`/`topSize` give the footprint,
 * in units.
 */
interface Size3 {
  readonly w: U;
  readonly d: U;
  readonly h: U;
}

interface StackRoles {
  readonly bottom: boolean;
  readonly top: boolean;
  readonly bottomSize: Size3;
  readonly topSize: Size3;
}

function stackRoles(ctx: Ctx, ref: PartRef): StackRoles {
  const lower = ctx.metrics(ref, ctx.lipOn, 0);
  const upper = ctx.metrics(ref, false, 1);
  const topSize = { w: upper.w + 2 * ctx.inset, d: upper.d + 2 * ctx.inset, h: upper.h };
  const bottomH = printedHeight(ctx, lower.h, ctx.lipOn);
  return {
    bottom: fitsBed(ctx.bed, lower.w, lower.d, bottomH),
    top: fitsBed(ctx.bed, topSize.w, topSize.d, upper.h),
    bottomSize: { w: lower.w, d: lower.d, h: bottomH },
    topSize,
  };
}

function usableBed(ctx: Ctx): string {
  return `${mm(toMm(ctx.bed.w))} × ${mm(toMm(ctx.bed.d))} mm`;
}

/** The size with its height, the print bed's Z limit being part of the story. */
function size(s: Size3): string {
  return `${mm(toMm(s.w))} × ${mm(toMm(s.d))} × ${mm(toMm(s.h))} mm`;
}

/** What a part's stack roles mean for the user, e.g. "only on its own". */
function rolesPhrase(r: StackRoles): string {
  if (!r.bottom && !r.top) {
    return "only on its own, with nothing stacked on it or under it";
  }
  return r.bottom ? "only with nothing under it" : "only with nothing stacked on it";
}

/**
 * Notices about the print bed: an error for requirements that fit it in no variant, splits
 * included, and a warning for requirements whose every variant fits plain but needs a part
 * that cannot be stacked (the locating lip's thicker walls or inset footprint outgrow the
 * bed), which the layout therefore prints with nothing stacked on it or under it.
 */
export function bedNotices(ctx: Ctx): Notice[] {
  const out: Notice[] = [];
  ctx.input.requirements.forEach((r, i) => {
    let smallest: { w: number; d: number; h: number } | null = null;
    const fitsPlain = r.variants.map((v, vi) =>
      v.parts.every((_, pi) => {
        const m = ctx.metrics({ req: i, variant: vi, part: pi }, false, 0);
        const ok = fitsBed(ctx.bed, m.w, m.d, m.h);
        if (!ok && (smallest === null || m.w * m.d < smallest.w * smallest.d)) {
          smallest = { w: m.w, d: m.d, h: m.h };
        }
        return ok;
      }),
    );
    if (!fitsPlain.some(Boolean) && r.variants.length > 0) {
      const s = smallest ?? { w: 0, d: 0, h: 0 };
      out.push({
        level: "error",
        code: NOTICE_CODES.bed,
        message: `"${requirementLabel(r)}" is too large for the print bed in every variant, splits included: it needs at least ${mm(toMm(s.w))} × ${mm(toMm(s.d))} × ${mm(toMm(s.h))} mm; the usable bed is ${mm(toMm(ctx.bed.w))} × ${mm(toMm(ctx.bed.d))} × ${mm(toMm(ctx.bed.z))} mm.`,
      });
      return;
    }
    if (!ctx.lipOn) {
      return;
    }
    // The fitting variant with the fewest parts that cannot be stacked; none free of them.
    let restricted: { ref: PartRef; roles: StackRoles }[] | null = null;
    r.variants.forEach((v, vi) => {
      if (!fitsPlain[vi]) {
        return;
      }
      const bad = v.parts.flatMap((_, pi) => {
        const ref = { req: i, variant: vi, part: pi };
        const roles = stackRoles(ctx, ref);
        return roles.bottom && roles.top ? [] : [{ ref, roles }];
      });
      if (restricted === null || bad.length < restricted.length) {
        restricted = bad;
      }
    });
    const bad: { ref: PartRef; roles: StackRoles }[] = restricted ?? [];
    if (bad.length === 0) {
      return;
    }
    const lines = bad.map(({ ref, roles }) => {
      const p = ctx.part(ref);
      const label = p
        ? partLabel(
            p.compartments.map((c) => c.contents),
            p.trayKey,
          )
        : "";
      const need = [
        roles.bottom ? null : `${size(roles.bottomSize)} as a lower tray (lipped walls and lip)`,
        roles.top ? null : `${size(roles.topSize)} as an upper tray (lip inset)`,
      ].filter((x) => x !== null);
      return `"${label}" fits the bed ${rolesPhrase(roles)}: it needs ${need.join(" and ")}, more than the usable bed ${mm(toMm(ctx.bed.w))} × ${mm(toMm(ctx.bed.d))} × ${mm(toMm(ctx.bed.z))} mm`;
    });
    out.push({
      level: "warning",
      code: NOTICE_CODES.bed,
      message: `${lines.join("; ")}. So the layout prints it that way. To stack it, turn off the locating lip or use a printer with a larger bed.`,
    });
  });
  return out;
}

function partLabel(contents: readonly string[], key: string): string {
  const names = [...new Set(contents.filter((c) => c !== ""))];
  return names.length > 0 ? names.join(", ") : key;
}

/** A printed tray the print bed cannot hold (mm), with what the bed allows it. */
export interface OverBedPart {
  readonly label: string;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** Set when the part fits the bed plain: it is the stack (lip) that makes it too big. */
  readonly stackPhrase: string | null;
}

/** The parts among `trays` (a best attempt) that exceed the print bed in every orientation. */
export function overBedParts(ctx: Ctx, trays: readonly TraySpec[]): OverBedPart[] {
  const real = trays.filter((t) => t.part === "tray");
  return real.flatMap((t) => {
    if (fitsBed(ctx.bed, toU(t.w), toU(t.d), printedHeight(ctx, toU(t.h), t.lip))) {
      return [];
    }
    const refs = ctx.refsOfKey(t.key);
    const first = refs[0];
    const vi = first ? inferVariant(ctx, first.req, real) : undefined;
    const ref = refs.find((x) => x.variant === vi) ?? first;
    const plain = ref ? ctx.metrics(ref, false, 0) : undefined;
    const plainFits = plain !== undefined && fitsBed(ctx.bed, plain.w, plain.d, plain.h);
    const roles = ref && plainFits ? stackRoles(ctx, ref) : undefined;
    return [
      {
        label: partLabel(
          t.compartments.map((c) => c.contents),
          t.key,
        ),
        w: t.w,
        d: t.d,
        h: t.h,
        stackPhrase: roles && !(roles.bottom && roles.top) ? rolesPhrase(roles) : null,
      },
    ];
  });
}

/**
 * Spec §7.3: shortfall per axis plus concrete suggestions. Shortfall in mm. `overBed` names
 * the trays of the best attempt that exceed the print bed (the only reason there is when the
 * shortfall is 0 on every axis and nothing is size-locked).
 */
export function doesNotFitNotice(
  ctx: Ctx,
  shortfall: { x: number; y: number; z: number },
  overBed: readonly OverBedPart[] = [],
): Notice {
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
  if (overBed.length > 0) {
    if (ctx.lipOn && overBed.some((o) => o.stackPhrase !== null)) {
      tips.push("turn off the locating lip");
    }
    tips.push("use a printer with a larger bed");
  }
  tips.push("split groups into separate components");
  const sentences: string[] = [];
  if (parts.length > 0) {
    sentences.push(`The box is too small by ${parts.join(", ")}.`);
  }
  if (overBed.length > 0) {
    const named = overBed.map(
      (o) =>
        `"${o.label}" is ${mm(o.w)} × ${mm(o.d)} × ${mm(o.h)} mm${o.stackPhrase ? ` (it fits the bed ${o.stackPhrase})` : ""}`,
    );
    sentences.push(
      `Too large for the print bed: ${named.join("; ")}; the usable bed is ${usableBed(ctx)}.`,
    );
  }
  if (sentences.length === 0) {
    sentences.push("Some trays don't fit the print bed or a locked size.");
  }
  return {
    level: "error",
    code: NOTICE_CODES.doesNotFit,
    message: `The components don't fit in this box. ${sentences.join(" ")} Try: ${tips.join("; ")}.`,
  };
}

/** Why a run stopped early: the time cap (with the cap in effect) or a cancel request. */
export type StopReason = { reason: "time"; limitMs: number } | { reason: "cancel" };

/** "30 s", "1.5 s", or "40 ms" below a second (no rounding to "0 s"). */
function formatCap(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${Number((ms / 1000).toFixed(1))} s`;
}

export function cappedNotice(stop: StopReason): Notice {
  const message =
    stop.reason === "time"
      ? `The optimizer stopped at its ${formatCap(stop.limitMs)} safety limit; this layout can't be reproduced from its seed.`
      : "The optimization was stopped before it finished; this layout can't be reproduced from its seed.";
  return { level: "info", code: NOTICE_CODES.capped, message };
}
