// src/ui/noticePlacement.ts
import { CONFLICT_CODE, SAVE_FAILED_CODE, STORAGE_UNAVAILABLE_CODE } from "../app/persistence";
import { GEOMETRY_MAJOR_CODE, STALE_CODE } from "../app/state";
import type { RunState } from "../app/state";
import type { Notice } from "../model/types";

/** Where a notice shows: the one banner, the menu (with a dot on its button), under the status, or nowhere. */
export type NoticePlace = "banner" | "menu" | "inline" | "none";

export interface PlacementContext {
  /** A run is scheduled or going: the plan is about to change by itself. */
  runPending: boolean;
  runStatus: RunState["status"];
  /** The inputs do not fit the box: that state is the news, not the stale plan behind it. */
  noFit: boolean;
}

/** Notices that need a look but not an interruption: they wait in the project menu. */
const MENU_CODES: ReadonlySet<string> = new Set([
  CONFLICT_CODE,
  STORAGE_UNAVAILABLE_CODE,
  SAVE_FAILED_CODE,
]);

export function noticePlacement(n: Notice, ctx: PlacementContext): NoticePlace {
  if (n.code === STALE_CODE) {
    return !ctx.runPending && ctx.runStatus !== "running" && !ctx.noFit ? "banner" : "none";
  }
  if (n.code === GEOMETRY_MAJOR_CODE) {
    return "banner";
  }
  return MENU_CODES.has(n.code) ? "menu" : "inline";
}

export interface PlacedNotices {
  banner: Notice[];
  menu: Notice[];
  inline: Notice[];
}

/** Splits notices by where they show; the order inside each place is kept. */
export function placeNotices(notices: readonly Notice[], ctx: PlacementContext): PlacedNotices {
  const out: PlacedNotices = { banner: [], menu: [], inline: [] };
  for (const n of notices) {
    const place = noticePlacement(n, ctx);
    if (place !== "none") {
      out[place].push(n);
    }
  }
  return out;
}

/** The part of the menu button's name that counts the notices inside: ", 1 notice". */
export function menuNoticeCount(count: number): string {
  return count === 0 ? "" : `, ${count} ${count === 1 ? "notice" : "notices"}`;
}
