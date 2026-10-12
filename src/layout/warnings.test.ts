import { describe, expect, it } from "vitest";
import type { TraySpec } from "../model/types";
import { createCtx } from "./context";
import { boxReq, fakeMeasure, makeInput, traySpec } from "./test-utils";
import type { LayoutSummary } from "./types";
import {
  bedNotices,
  cappedNotice,
  doesNotFitNotice,
  layoutWarnings,
  NOTICE_CODES,
  requirementLabel,
} from "./warnings";

function tray(key: string, path: string, level: number, contents: string): TraySpec {
  return traySpec({
    key,
    path,
    level,
    w: 50,
    d: 50,
    compartments: [
      { x: 2, y: 2, w: 46, d: 46, floorZ: 1.2, kind: "scoop", contents, features: [] },
    ],
  });
}

const okSummary: LayoutSummary = {
  fillPct: 99,
  trayCount: 2,
  stackCount: 2,
  filamentG: 10,
  playX: 1.2,
  playY: 1.4,
};
const reqs = [boxReq("bits", 40, 40, 10, { loose: true }), boxReq("cards", 40, 40, 10)];
const trays = [tray("bits:p0:0", "0", 0, "Cubes"), tray("cards:p0:0", "1", 0, "Deck")];

describe("layout warnings", () => {
  it("warns about loose bits on top only when coverage is partial or the box stands on its side", () => {
    const full = createCtx(makeInput(reqs, { box: { headroom: 5 } }), fakeMeasure);
    expect(layoutWarnings(full, trays, okSummary)).toEqual([]);
    const partial = createCtx(
      makeInput(reqs, { box: { headroom: 5, headroomCoverage: "partial" } }),
      fakeMeasure,
    );
    const w = layoutWarnings(partial, trays, okSummary);
    expect(w.map((n) => n.code)).toEqual([NOTICE_CODES.coverage]);
    expect(w[0]?.message).toContain("Cubes");
    expect(w[0]?.message).toContain("below other trays");
    const covered = [tray("bits:p0:0", "0", 0, "Cubes"), tray("cards:p0:0", "0", 1, "Deck")];
    expect(layoutWarnings(partial, covered, okSummary)).toEqual([]);
    const side = createCtx(makeInput(reqs, { box: { storedOnSide: true } }), fakeMeasure);
    expect(layoutWarnings(side, trays, okSummary)[0]?.message).toContain("on its side");
  });

  it("warns about play above 1.5 mm per axis and about a disabled lip", () => {
    const ctx = createCtx(
      makeInput(reqs, {
        settings: { lip: { enabled: false, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 } },
      }),
      fakeMeasure,
    );
    const stacked = [tray("bits:p0:0", "0", 0, "Cubes"), tray("cards:p0:0", "0", 1, "Deck")];
    const w = layoutWarnings(ctx, stacked, { ...okSummary, playX: 1.6 });
    expect(w.map((n) => n.code)).toEqual([NOTICE_CODES.play, NOTICE_CODES.lipOff]);
    expect(w[0]?.message).toContain("along X");
  });

  it("names requirements that fit the bed in no variant", () => {
    const ctx = createCtx(
      makeInput([boxReq("board", 300, 40, 10), ...reqs], { printer: { bedX: 200, bedY: 200 } }),
      fakeMeasure,
    );
    const n = bedNotices(ctx);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ level: "error", code: NOTICE_CODES.bed });
    expect(n[0]?.message).toContain('"board"');
    expect(requirementLabel(reqs[0] ?? boxReq("x", 1, 1, 1))).toBe("bits");
  });

  it("explains doesNotFit with the shortfall per axis and concrete suggestions", () => {
    const ctx = createCtx(makeInput(reqs, { box: { headroom: 6 } }), fakeMeasure);
    const n = doesNotFitNotice(ctx, { x: 12.34, y: 0, z: 3 });
    expect(n).toMatchObject({ level: "error", code: NOTICE_CODES.doesNotFit });
    expect(n.message).toContain("12.3 mm in width (X)");
    expect(n.message).toContain("3.0 mm in height");
    expect(n.message).not.toContain("depth");
    for (const tip of [
      "unsleeved",
      "flat or upright",
      "less headroom",
      "choose a tighter fit (Fit: tight)",
      "split groups",
    ]) {
      expect(n.message).toContain(tip);
    }
    const noHeadroom = createCtx(makeInput(reqs), fakeMeasure);
    expect(doesNotFitNotice(noHeadroom, { x: 1, y: 0, z: 0 }).message).not.toContain("headroom");
  });

  it("marks capped runs with an info notice", () => {
    const time = cappedNotice({ reason: "time", limitMs: 30_000 });
    expect(time).toMatchObject({ level: "info", code: "layout.capped" });
    expect(time.message).toContain("30 s safety limit");
    expect(cappedNotice({ reason: "time", limitMs: 1500 }).message).toContain("1.5 s safety limit");
    const cancel = cappedNotice({ reason: "cancel" });
    expect(cancel.code).toBe("layout.capped");
    expect(cancel.message).not.toContain("safety limit");
  });
});
