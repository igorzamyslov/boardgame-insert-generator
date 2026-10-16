import { describe, expect, it } from "vitest";
import type { TraySpec } from "../model/types";
import type { Measure } from "./context";
import { createCtx } from "./context";
import {
  boxReq,
  comp,
  fakeMeasure,
  groovedMeasure,
  makeInput,
  part,
  req,
  traySpec,
  variant,
} from "./test-utils";
import type { LayoutSummary } from "./types";
import {
  bedNotices,
  cappedNotice,
  doesNotFitNotice,
  layoutWarnings,
  NOTICE_CODES,
  overBedParts,
} from "./warnings";
import { requirementLabel } from "./labels";

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
  filamentAtInfillG: 10,
  infillPct: 15,
  printMinutes: 90,
  longestPartMinutes: 30,
  playLimit: 1.5,
  fillerCount: 0,
  mergeFillers: true,
  mergeRisers: false,
  playX: 1.2,
  playY: 1.4,
  crossX: 3,
  crossY: 2,
};
const reqs = [boxReq("bits", 40, 40, 10, { loose: true }), boxReq("cards", 40, 40, 10)];
const trays = [tray("bits:p0:0", "0", 0, "Cubes"), tray("cards:p0:0", "1", 0, "Deck")];

describe("layout warnings", () => {
  it("warns about loose pieces on top only when coverage is partial or the box stands on its side", () => {
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
    expect(w[0]?.message).toContain("left–right");
  });

  it("says how many trays sit in the row and which controls to change", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const x = layoutWarnings(ctx, trays, { ...okSummary, playX: 1.6, crossX: 4 })[0]?.message;
    expect(x).toBe(
      "Trays can shift 1.60 mm left–right (Play limit: 1.5 mm): 4 trays sit side by side in one row. To reduce it: choose a tighter Fit; lower Box clearance (counts twice) or Tray gap (once per extra tray) under Exact values; or put fewer trays in that row. Or raise Play limit there.",
    );
    const y = layoutWarnings(ctx, trays, { ...okSummary, playY: 1.6, crossY: 4 })[0]?.message;
    expect(y).toContain("front–back");
    expect(y).toContain("4 trays sit one behind the other in one row");
    // a tighter Fit is only suggested while there is one
    const tight = createCtx(makeInput(reqs, { settings: { fit: 0.7 } }), fakeMeasure);
    expect(
      layoutWarnings(tight, trays, { ...okSummary, playX: 1.6, crossX: 4 })[0]?.message,
    ).not.toContain("Fit");
    const loose = createCtx(makeInput(reqs, { settings: { fit: 1.4 } }), fakeMeasure);
    expect(
      layoutWarnings(loose, trays, { ...okSummary, playX: 1.6, crossX: 4 })[0]?.message,
    ).toContain("choose a tighter Fit");
    // one tray in the row: only the box clearance counts
    const one = layoutWarnings(ctx, trays, { ...okSummary, playX: 1.6, crossX: 1 })[0]?.message;
    expect(one).not.toContain("Tray gap");
    expect(one).not.toContain("fewer trays");
  });

  it("measures play against the Play limit setting, in the warning and its text", () => {
    const at = (playLimit: number) =>
      createCtx(makeInput(reqs, { settings: { playLimit } }), fakeMeasure);
    // 1.6 mm is over the default limit, and under a raised one
    expect(layoutWarnings(at(1.5), trays, { ...okSummary, playX: 1.6 }).map((n) => n.code)).toEqual(
      [NOTICE_CODES.play],
    );
    expect(layoutWarnings(at(2), trays, { ...okSummary, playX: 1.6 })).toEqual([]);
    // and a lowered one warns where the default does not
    const low = layoutWarnings(at(1), trays, { ...okSummary, playX: 1.2 });
    expect(low[0]?.message).toContain("Play limit: 1 mm");
  });

  it("keeps the play warning no longer than it was before the limit was a setting", () => {
    // the longest variant: a tighter Fit is on offer and more than one tray is in the row
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const msg = layoutWarnings(ctx, trays, { ...okSummary, playY: 1.6, crossY: 4 })[0]?.message;
    const before =
      "Trays can shift 1.60 mm front–back (more than 1.5 mm): 4 trays sit one behind the other in one row. To reduce it: choose a tighter Fit; lower Box clearance (it counts twice) or Tray gap (it counts once for each extra tray in the row) under Exact values; or put fewer trays in that row.";
    expect(msg?.length).toBeLessThanOrEqual(before.length);
  });

  it("leaves spare compartments out of the coverage warning", () => {
    const partial = createCtx(
      makeInput(reqs, { box: { headroom: 5, headroomCoverage: "partial" } }),
      fakeMeasure,
    );
    const withSpares = traySpec({
      key: "bits:p0:0",
      path: "0",
      level: 0,
      w: 50,
      d: 50,
      compartments: [
        {
          x: 2,
          y: 2,
          w: 20,
          d: 46,
          floorZ: 1.2,
          kind: "scoop",
          contents: "Cubes ×20",
          features: [],
        },
        { x: 24, y: 2, w: 20, d: 46, floorZ: 1.2, kind: "spare", contents: "spare", features: [] },
        { x: 44, y: 2, w: 4, d: 46, floorZ: 1.2, kind: "spare", contents: "spare", features: [] },
      ],
    });
    const msg = layoutWarnings(partial, [withSpares], okSummary)[0]?.message;
    expect(msg).toContain("Cubes ×20.");
    expect(msg).not.toContain("spare");
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
    expect(n.message).toContain("12.4 mm in width (X)"); // 12.34 rounds up: the box needs that much
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

  it("reports no fit as not found yet, naming the iterations, never as a proven fact", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const n = doesNotFitNotice(ctx, { x: 12.34, y: 0, z: 0 }, [], 300_000);
    expect(n.message).toMatch(/^No fit found yet\./);
    expect(n.message).toContain("300,000 iterations");
    expect(n.message).toContain("not proof");
    expect(n.message).toContain("closest attempt so far is short by 12.4 mm in width (X)");
    expect(n.message).toContain("Press “Update plan” again to search about 3 times longer");
    for (const verdict of ["too small by", "don't fit in this box"]) {
      expect(n.message).not.toContain(verdict);
    }
    // Without a count it still says the search was limited, and does not invent a number.
    expect(doesNotFitNotice(ctx, { x: 1, y: 0, z: 0 }).message).not.toMatch(/\d iterations/);
  });

  it("rounds a shortfall up to 0.1 mm, never printing 0.0 for a positive one", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const message = (x: number, y: number, z: number): string =>
      doesNotFitNotice(ctx, { x, y, z }).message;
    expect(message(0.01, 0, 0)).toContain("0.1 mm in width (X)");
    expect(message(0, 0.04, 0)).toContain("0.1 mm in length (Y)");
    expect(message(0, 0, 0.1)).toContain("0.1 mm in height");
    expect(message(0.3, 0.7, 12)).toContain("0.3 mm in width (X), 0.7 mm in length (Y), 12.0 mm");
    expect(message(0.01, 0, 0)).not.toContain("0.0 mm");
  });

  it("marks capped runs with an info notice", () => {
    const time = cappedNotice({ reason: "time", limitMs: 30_000 });
    expect(time).toMatchObject({ level: "info", code: "layout.capped" });
    expect(time.message).toContain("30 s safety limit");
    expect(cappedNotice({ reason: "time", limitMs: 1500 }).message).toContain("1.5 s safety limit");
    // caps under a second are shown in ms, not rounded to "0 s"
    expect(cappedNotice({ reason: "time", limitMs: 40 }).message).toContain("40 ms safety limit");
    expect(cappedNotice({ reason: "time", limitMs: 0 }).message).toContain("0 ms safety limit");
    const cancel = cappedNotice({ reason: "cancel" });
    expect(cancel.code).toBe("layout.capped");
    expect(cancel.message).not.toContain("safety limit");
  });

  // fakeMeasure: outer = inner + 4 plain, + 6 lipped; the usable bed is 120 mm (130 − 2 × 5);
  // groovedMeasure: + 5.2 on top of a lipped tray, where the groove thickens the wall.
  const small = { printer: { bedX: 130, bedY: 130 } };
  const wide = boxReq("wide", 115, 40, 10); // 119 plain, 121 lipped: only fits alone

  it("warns about a part that fits the bed plain but not with a lip, in no variant", () => {
    const ctx = createCtx(makeInput([wide, ...reqs], small), groovedMeasure);
    const n = bedNotices(ctx);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ level: "warning", code: NOTICE_CODES.bed });
    expect(n[0]?.message).toContain('"wide"');
    expect(n[0]?.message).toContain("on its own");
    expect(n[0]?.message).toContain("turn off the locating lip");
    // nothing to say with the lip off, on a bigger bed, or when another variant stacks fine
    const off = makeInput([wide], {
      ...small,
      settings: { lip: { enabled: false, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 } },
    });
    expect(bedNotices(createCtx(off, fakeMeasure))).toEqual([]);
    expect(bedNotices(createCtx(makeInput([wide]), fakeMeasure))).toEqual([]);
    const flexible = req("flex", [
      variant("wide", [part("flex:p0:0", [comp({ minW: 115, minD: 40, minH: 10 })])]),
      variant("narrow", [part("flex:p0:0", [comp({ minW: 60, minD: 40, minH: 10 })])]),
    ]);
    expect(bedNotices(createCtx(makeInput([flexible], small), fakeMeasure))).toEqual([]);
  });

  it("says a part fits only with nothing stacked on it when its lower-tray size is the one that exceeds", () => {
    // lipped walls cost 6 mm here, so 116 mm plain fits as an upper tray (118.9) not as a lower
    const heavyLip: Measure = (p, s, o) => {
      const m = fakeMeasure(p, s, o);
      return o.lipped ? { ...m, w: m.w + 4, d: m.d + 4 } : m;
    };
    const ctx = createCtx(makeInput([boxReq("top", 112, 40, 10)], small), heavyLip);
    const n = bedNotices(ctx);
    expect(n).toHaveLength(1);
    expect(n[0]?.message).toContain("only with nothing stacked on it");
    expect(n[0]?.message).not.toContain("on its own");
  });

  it("names the over-bed tray and the real remedies when nothing else is short", () => {
    const ctx = createCtx(makeInput([wide, ...reqs], small), groovedMeasure);
    const over = overBedParts(ctx, [
      traySpec({
        key: "wide:p0:0",
        w: 121,
        d: 44,
        h: 14,
        lip: true,
        compartments: [
          {
            x: 2,
            y: 2,
            w: 117,
            d: 40,
            floorZ: 1.2,
            kind: "scoop",
            contents: "Boards",
            features: [],
          },
        ],
      }),
      traySpec({ key: "cards:p0:0", w: 50, d: 50, h: 20 }),
    ]);
    expect(over).toHaveLength(1);
    const n = doesNotFitNotice(ctx, { x: 0, y: 0, z: 0 }, over);
    expect(n.message).not.toContain("too small by");
    expect(n.message).toContain('"Boards"');
    expect(n.message).toContain("121.0 × 44.0");
    expect(n.message).toContain("usable bed is 120.0 × 120.0 mm");
    expect(n.message).toContain("fits the bed only on its own");
    expect(n.message).toContain("turn off the locating lip");
    expect(n.message).toContain("larger bed");
    // a tray the bed cannot print even plain gets no stacking hint
    const huge = overBedParts(ctx, [traySpec({ key: "cards:p0:0", w: 150, d: 50, h: 20 })]);
    const plain = doesNotFitNotice(ctx, { x: 0, y: 0, z: 0 }, huge).message;
    expect(plain).toContain("cards:p0:0");
    expect(plain).not.toContain("only on its own");
  });

  it("describes a tray that is over the bed only because of its lip with the lip's height", () => {
    const ctx = createCtx(
      makeInput([wide], { printer: { bedX: 130, bedY: 130, bedZ: 20 } }),
      fakeMeasure,
    );
    const [over] = overBedParts(ctx, [
      traySpec({ key: "wide:p0:0", w: 100, d: 40, h: 19, lip: true }),
      traySpec({ key: "cards:p0:0", w: 50, d: 50, h: 19, lip: false }),
    ]);
    // 19 mm of body plus the 2 mm lip prints 21 mm tall on a 20 mm bed
    expect(over?.h).toBe(21);
    const message = doesNotFitNotice(ctx, { x: 0, y: 0, z: 0 }, over ? [over] : []).message;
    expect(message).toContain("100.0 × 40.0 × 21.0 mm");
    expect(message).toContain("usable bed is 120.0 × 120.0 × 20.0 mm");
  });

  it("leaves the lip tip out when the lip is already off", () => {
    const off = createCtx(
      makeInput([wide], {
        ...small,
        settings: { lip: { enabled: false, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 } },
      }),
      fakeMeasure,
    );
    const over = overBedParts(off, [traySpec({ key: "wide:p0:0", w: 121, d: 44, h: 14 })]);
    const m = doesNotFitNotice(off, { x: 0, y: 0, z: 0 }, over).message;
    expect(m).not.toContain("locating lip");
    expect(m).toContain("larger bed");
  });
});
