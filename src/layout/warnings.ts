import { rimOn } from "../model/lip";
import { FIT_CHOICES } from "../model/settings";
import type { Notice, TraySpec } from "../model/types";
import { fitsBed } from "./bed";
import { printedHeight, type Ctx, type PartRef } from "./context";
import { partLabel, requirementLabel } from "./labels";
import { coverageApplies } from "./score";
import { splitRisers } from "./risers";
import type { LayoutSummary } from "./types";
import { toMm, toU, type U } from "./units";
import { inferVariant } from "./warmstart";

/** Stable notice codes emitted by the layout engine (spec §7.3). */
export const NOTICE_CODES = {
  coverage: "layout.coverage",
  play: "layout.play",
  lipOff: "layout.lipOff",
  stopsShort: "layout.stopsShort",
  capped: "layout.capped",
  bed: "layout.bed",
  doesNotFit: "layout.doesNotFit",
  lockDropped: "lock.dropped",
  copiesJoint: "layout.copiesJoint",
} as const;

/** How much longer a repeated search runs than the one that found nothing (the runner uses it too). */
export const REPEAT_FACTOR = 3;

function mm(v: number): string {
  return v.toFixed(1);
}

/** A shortfall (mm, on the 0.01 grid) shown rounded up to 0.1 mm: a positive one never reads 0.0. */
export function mmUp(v: number): string {
  return (Math.ceil(Math.round(v * 100) / 10) / 10).toFixed(1);
}

/**
 * The play warning, naming the row of trays behind the number, the controls that change it and the
 * limit itself, which is a setting (Play limit). Play is 2 × box clearance + (trays in the row − 1)
 * × tray gap, all times Fit; the axes are named as the Summary's "Slack" readouts name them. Kept
 * no longer than it was before the limit became adjustable: the controls are named once, with where
 * they live.
 */
function playMessage(
  axis: "x" | "y",
  play: number,
  limit: number,
  crossed: number,
  canTighten: boolean,
  empty: number,
): string {
  const where = axis === "x" ? "left–right" : "front–back";
  const row =
    axis === "x"
      ? `${crossed} trays sit side by side in one row`
      : `${crossed} trays sit one behind the other in one row`;
  const tips: string[] = [];
  if (canTighten) {
    tips.push("choose a tighter Fit");
  }
  tips.push(
    crossed > 1
      ? "lower Box clearance (counts twice) or Tray gap (once per extra tray) under Exact numbers"
      : "lower Box clearance (counts twice) under Exact numbers",
  );
  if (crossed > 1) {
    tips.push("put fewer trays in that row");
  }
  const last = tips.length - 1;
  const steps = tips.map((t, i) => (i > 0 && i === last ? `or ${t}` : t));
  const rest =
    empty > 0 ? ` ${empty.toFixed(2)} mm of it is room beside copies, too thin for a spacer.` : "";
  return `Trays can shift ${play.toFixed(2)} mm ${where} (Play limit: ${limit} mm): ${row}.${rest} To reduce it: ${steps.join("; ")}. Or raise Play limit there.`;
}

/** Warnings about a feasible layout: coverage, play, lip off; and a note when stacks stop short of the top. */
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
          exposed.map((t) =>
            // spare compartments (in layouts stored before geometry 0.5.1) are empty filler: nothing to spill
            partLabel(
              t.compartments.filter((c) => c.kind !== "spare").map((c) => c.contents),
              t.key,
            ),
          ),
        ),
      ].join("; ");
      out.push({
        level: "warning",
        code: NOTICE_CODES.coverage,
        message: box.storedOnSide
          ? `The box is stored on its side, so loose pieces in the top layer can spill: ${labels}. Pin them below other trays.`
          : `The boards don't cover the whole top layer, so these loose pieces may not stay in place: ${labels}. Pin them below other trays.`,
      });
    }
  }
  for (const [axis, play, crossed] of [
    ["x", summary.playX, summary.crossX],
    ["y", summary.playY, summary.crossY],
  ] as const) {
    if (play > settings.playLimit) {
      out.push({
        level: "warning",
        code: NOTICE_CODES.play,
        message: playMessage(
          axis,
          play,
          settings.playLimit,
          crossed,
          settings.fit > FIT_CHOICES.tight,
          // what the row leaves empty beyond the clearance and the gaps, mm on the 0.01 grid
          Math.max(
            0,
            Math.round(
              (play - (2 * toMm(ctx.boxClearance) + Math.max(0, crossed - 1) * toMm(ctx.gap))) *
                100,
            ) / 100,
          ),
        ),
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
  if (!settings.fillToTop) {
    // Each stack's height, from its stored trays.
    const heights = new Map<number, number>();
    for (const t of trays) {
      if (t.part === "tray") {
        heights.set(t.stack, (heights.get(t.stack) ?? 0) + toU(t.h));
      }
    }
    const short = [...heights.values()].filter((h) => h < ctx.topPlane);
    if (short.length > 0) {
      const most = Math.max(...short.map((h) => ctx.topPlane - h));
      out.push({
        level: "info",
        code: NOTICE_CODES.stopsShort,
        message: `"Fill the box to the top" is off, so ${short.length === 1 ? "1 stack stops" : `${short.length} stacks stop`} short of the lid (by up to ${mmUp(toMm(most))} mm). Boards and the lid won't rest on ${short.length === 1 ? "it" : "them"}, so trays can shift a little when the box is carried.`,
      });
    }
  }
  out.push(...copiesJointNotices(ctx, trays));
  return out;
}

/**
 * The copies of a set that stand in a stack are interchangeable only with the top copy's rim and
 * the groove under the bottom one, which a stack keeps only while it can afford them (owner,
 * 2026-10-23: best-effort). Says so, per item, when a stack has gone without: the copies are still
 * one size, one height and one set of wells, but only stack in the order they were made for.
 */
function copiesJointNotices(ctx: Ctx, trays: readonly TraySpec[]): Notice[] {
  const { settings } = ctx.input;
  if (!settings.lip.enabled) {
    return [];
  }
  const real = trays.filter((t) => t.part === "tray");
  const setOf = (t: TraySpec): string | null => {
    const m = /^(.*):p\d+:(\d+)$/.exec(t.key);
    return m ? `${m[1]}:${m[2]}` : null;
  };
  const members = new Map<string, TraySpec[]>();
  for (const t of real) {
    const set = setOf(t);
    if (set !== null) {
      members.set(set, [...(members.get(set) ?? []), t]);
    }
  }
  // the sets with a copy in a stack of two or more, the only ones built to stack with each other
  const stacked = [...members].filter(
    ([, list]) =>
      list.length > 1 && list.some((t) => real.some((o) => o !== t && o.path === t.path)),
  );
  if (stacked.length === 0) {
    return [];
  }
  const printed = settings.fillToTop
    ? splitRisers(trays, { settings, printer: ctx.input.printer, locks: ctx.input.locks })
    : [];
  const rim = new Map<number, { top: boolean; bottom: boolean }>();
  for (const [, list] of stacked) {
    const ref = ctx.refsOfKey(list[0]?.key ?? "")[0];
    if (ref === undefined) {
      continue;
    }
    const noRim = list.some(
      (t) =>
        rimOn(settings) &&
        !t.lip &&
        !real.some((o) => o !== t && o.path === t.path && o.level > t.level),
    );
    const noGroove = list.some(
      (t) =>
        t.level === 0 &&
        settings.fillToTop &&
        !printed.some((p) => p.key === t.key && p.onRiser === true),
    );
    const seen = rim.get(ref.req) ?? { top: false, bottom: false };
    rim.set(ref.req, { top: seen.top || noRim, bottom: seen.bottom || noGroove });
  }
  const out: Notice[] = [];
  for (const [req, lack] of rim) {
    const r = ctx.input.requirements[req];
    if (r === undefined || (!lack.top && !lack.bottom)) {
      continue;
    }
    const name = requirementLabel(r);
    const joint = rimOn(settings) ? "groove" : "slab";
    const what =
      lack.top && lack.bottom
        ? `The top ${name} tray has no rim and the bottom one no ${joint}`
        : lack.top
          ? `The top ${name} tray has no rim`
          : `The bottom ${name} tray has no ${joint}`;
    out.push({
      level: "info",
      code: NOTICE_CODES.copiesJoint,
      message: `${what}, so the ${name} trays only stack in this order.`,
    });
  }
  return out;
}

/**
 * Where a part can sit in a stack as far as the print bed goes: as a lower tray its walls
 * thicken to the lipped wall; as an upper tray its walls thicken to what its groove leaves. `bottom`/`top` are false when that size exceeds the bed (in either orientation;
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
  const topSize = { w: upper.w, d: upper.d, h: upper.h };
  const bottomH = printedHeight(ctx, lower.h, ctx.lipOn);
  return {
    bottom: fitsBed(ctx.bed, lower.w, lower.d, bottomH),
    top: fitsBed(ctx.bed, topSize.w, topSize.d, printedHeight(ctx, upper.h, false, true)),
    bottomSize: { w: lower.w, d: lower.d, h: bottomH },
    topSize,
  };
}

function usableBed(ctx: Ctx, withHeight = false): string {
  const xy = `${mm(toMm(ctx.bed.w))} × ${mm(toMm(ctx.bed.d))}`;
  return withHeight ? `${xy} × ${mm(toMm(ctx.bed.z))} mm` : `${xy} mm`;
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
 * that cannot be stacked (the locating lip's thicker walls, or the groove's, outgrow the
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
        roles.top ? null : `${size(roles.topSize)} as an upper tray (lip groove)`,
      ].filter((x) => x !== null);
      return `"${label}" fits the bed ${rolesPhrase(roles)}: it needs ${need.join(" and ")}, more than the usable bed ${usableBed(ctx, true)}`;
    });
    out.push({
      level: "warning",
      code: NOTICE_CODES.bed,
      message: `${lines.join("; ")}. So the layout prints it that way. To stack it, turn off the locating lip or use a printer with a larger bed.`,
    });
  });
  return out;
}

/**
 * A printed tray or filler piece the print bed cannot hold, with what the bed allows it. Sizes
 * are in mm and `h` is the printed height, the lip included.
 */
export interface OverBedPart {
  /** The part's key in the plan. */
  readonly key: string;
  /** A leftover: it is as tall as the stacks beside it, so only the box's height can be the reason. */
  readonly filler: boolean;
  readonly label: string;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** Set when the part fits the bed plain: it is the stack (lip) that makes it too big. */
  readonly stackPhrase: string | null;
}

/**
 * The parts among `trays` (a best attempt) that exceed the print bed in every orientation:
 * trays and filler pieces (leftovers, as tall as the box's top plane).
 */
export function overBedParts(ctx: Ctx, trays: readonly TraySpec[]): OverBedPart[] {
  const real = trays.filter((t) => t.part === "tray");
  return trays.flatMap((t): OverBedPart[] => {
    if (t.part === "leftover") {
      return fitsBed(ctx.bed, toU(t.w), toU(t.d), toU(t.h))
        ? []
        : [{ key: t.key, filler: true, label: t.key, w: t.w, d: t.d, h: t.h, stackPhrase: null }];
    }
    if (
      t.part !== "tray" ||
      fitsBed(ctx.bed, toU(t.w), toU(t.d), printedHeight(ctx, toU(t.h), t.lip, t.level > 0))
    ) {
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
        key: t.key,
        filler: false,
        label: partLabel(
          t.compartments.map((c) => c.contents),
          t.key,
        ),
        w: t.w,
        d: t.d,
        h: toMm(printedHeight(ctx, toU(t.h), t.lip, t.level > 0)),
        stackPhrase: roles && !(roles.bottom && roles.top) ? rolesPhrase(roles) : null,
      },
    ];
  });
}

/**
 * Spec §7.3: shortfall per axis plus concrete suggestions. Shortfall in mm. `overBed` names
 * the trays of the best attempt that exceed the print bed (the only reason there is when the
 * shortfall is 0 on every axis and nothing is size-locked), and says so when filler pieces are
 * too tall for it: leftovers are as tall as the stacks beside them and are not split in Z, so
 * a box taller than the bed can have none.
 *
 * This is "not found yet", never a verdict: the search is heuristic, and a very tight box can
 * have a fit it cannot find cold (a real one needed millions of iterations). So the message
 * names the iterations the run made, frames the figures as the closest attempt, and says that
 * pressing the button again searches longer (the runner grows the budget of a repeat).
 */
export function doesNotFitNotice(
  ctx: Ctx,
  shortfall: { x: number; y: number; z: number },
  overBed: readonly OverBedPart[] = [],
  iterations = 0,
): Notice {
  const parts: string[] = [];
  if (shortfall.x > 0) {
    parts.push(`${mmUp(shortfall.x)} mm in width (X)`);
  }
  if (shortfall.y > 0) {
    parts.push(`${mmUp(shortfall.y)} mm in length (Y)`);
  }
  if (shortfall.z > 0) {
    parts.push(`${mmUp(shortfall.z)} mm in height`);
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
  const trays = overBed.filter((o) => !o.filler);
  const fillers = overBed.filter((o) => o.filler);
  if (trays.length > 0) {
    if (ctx.lipOn && trays.some((o) => o.stackPhrase !== null)) {
      tips.push("turn off the locating lip");
    }
    tips.push("use a printer with a larger bed");
  }
  if (fillers.length > 0) {
    tips.push(
      "use a printer with a taller bed",
      "leave more headroom, so the stacks are lower",
      "add something inside that fills the gaps around the trays",
    );
  }
  tips.push("split groups into separate items");
  const sentences: string[] = [];
  if (parts.length > 0) {
    sentences.push(`The closest attempt so far is short by ${parts.join(", ")}.`);
  }
  if (trays.length > 0) {
    const named = trays.map(
      (o) =>
        `"${o.label}" is ${mm(o.w)} × ${mm(o.d)} × ${mm(o.h)} mm${o.stackPhrase ? ` (it fits the bed ${o.stackPhrase})` : ""}`,
    );
    const tooTall = trays.some((o) => toU(o.h) > ctx.bed.z);
    sentences.push(
      `Too large for the print bed: ${named.join("; ")}; the usable bed is ${usableBed(ctx, tooTall)}.`,
    );
  }
  if (fillers.length > 0) {
    const height = Math.max(...fillers.map((o) => o.h));
    sentences.push(
      `The stacks are ${mm(height)} mm tall but the print bed is only ${mm(toMm(ctx.bed.z))} mm high, so the spacers that fill the gaps around the trays can't be printed in one piece.`,
    );
  }
  if (sentences.length === 0) {
    sentences.push("Some trays don't fit the print bed or a size lock.");
  }
  const searched =
    iterations > 0 ? `ran ${iterations.toLocaleString("en-US")} iterations` : "ran for a while";
  return {
    level: "error",
    code: NOTICE_CODES.doesNotFit,
    message: `No fit found yet. The search ${searched} without finding a layout that fits. This is not proof that what's inside can't fit: a very tight box can need a much longer search. ${sentences.join(" ")} Press “Try another arrangement” to search about ${REPEAT_FACTOR} times longer. If it still doesn't fit, try: ${tips.join("; ")}.`,
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
