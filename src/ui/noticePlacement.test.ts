// src/ui/noticePlacement.test.ts
import { describe, expect, it } from "vitest";
import {
  CONFLICT_CODE,
  OPEN_FAILED_CODE,
  SAVE_FAILED_CODE,
  STORAGE_UNAVAILABLE_CODE,
} from "../app/persistence";
import { GEOMETRY_MAJOR_CODE, STALE_CODE } from "../app/state";
import type { Notice } from "../model/types";
import { menuNoticeCount, noticePlacement, placeNotices } from "./noticePlacement";
import type { PlacementContext } from "./noticePlacement";

const quiet: PlacementContext = { runPending: false, runStatus: "idle", noFit: false };
const notice = (code: string): Notice => ({ level: "info", code, message: code });

describe("noticePlacement", () => {
  it.each([
    [STALE_CODE, quiet, "banner"],
    [STALE_CODE, { ...quiet, runPending: true }, "none"],
    [STALE_CODE, { ...quiet, runStatus: "running" as const }, "none"],
    [STALE_CODE, { ...quiet, noFit: true }, "none"],
    [GEOMETRY_MAJOR_CODE, quiet, "banner"],
    [GEOMETRY_MAJOR_CODE, { ...quiet, runPending: true, noFit: true }, "banner"],
    [CONFLICT_CODE, quiet, "menu"],
    [STORAGE_UNAVAILABLE_CODE, quiet, "menu"],
    [SAVE_FAILED_CODE, quiet, "menu"],
    [OPEN_FAILED_CODE, quiet, "inline"],
    ["schema.newerMinor", quiet, "inline"],
  ] as const)("puts %s in %o as %s", (code, ctx, place) => {
    expect(noticePlacement(notice(code), ctx)).toBe(place);
  });

  it("splits a list into banner, menu and inline, keeping the order", () => {
    const list = [
      notice("a.one"),
      notice(CONFLICT_CODE),
      notice(STALE_CODE),
      notice("a.two"),
      notice(SAVE_FAILED_CODE),
    ];
    const placed = placeNotices(list, quiet);
    expect(placed.banner.map((n) => n.code)).toEqual([STALE_CODE]);
    expect(placed.menu.map((n) => n.code)).toEqual([CONFLICT_CODE, SAVE_FAILED_CODE]);
    expect(placed.inline.map((n) => n.code)).toEqual(["a.one", "a.two"]);
  });

  it("drops a stale notice while the no-fit state wins", () => {
    const placed = placeNotices([notice(STALE_CODE)], { ...quiet, noFit: true });
    expect(placed).toEqual({ banner: [], menu: [], inline: [] });
  });

  it("shows one plan banner: the older-geometry one when both would", () => {
    const placed = placeNotices([notice(STALE_CODE), notice(GEOMETRY_MAJOR_CODE)], quiet);
    expect(placed.banner.map((n) => n.code)).toEqual([GEOMETRY_MAJOR_CODE]);
  });

  it("names the menu notices for the menu button", () => {
    expect(menuNoticeCount(0)).toBe("");
    expect(menuNoticeCount(1)).toBe(", 1 notice");
    expect(menuNoticeCount(2)).toBe(", 2 notices");
  });
});
