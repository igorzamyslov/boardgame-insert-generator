import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { createCtx } from "./context";
import { createRun, DEFAULT_ITERATIONS } from "./optimize";
import { comp, fakeMeasure, fakeRealize, makeInput, part, req, variant } from "./test-utils";
import type { LayoutInput, LayoutResult } from "./types";

// Groups spec §6.3 (owner A): an item stays in one tray (one per copy) unless no single tray fits.
describe("one tray per item when a whole tray fits", () => {
  // One item of two 40 × 60 wells: one 84 × 64 tray, or two 44 × 64 trays (fakeMeasure), in an
  // 88 × 140 box. The split is listed first, so the search starts from it. On packing alone the
  // two trays one behind the other win (by about 70 000, an extra stack and parts included): they
  // fill the box's depth, where the whole tray leaves a wide filler beside it.
  const a = comp({ minW: 40, minD: 60, minH: 20, contents: "a" });
  const b = comp({ minW: 40, minD: 60, minH: 20, contents: "b" });
  const item = req("w", [
    variant("halves", [part("w:p0:0", [a]), part("w:p0:1", [b])]),
    variant("whole", [part("w:p0:0", [a, b])]),
  ]);
  const noLip = { lip: { ...DEFAULT_SETTINGS.lip, joint: "off" as const } };
  const box = { innerWidth: 88, innerDepth: 140, innerHeight: 30 };
  const run = (input: LayoutInput): LayoutResult => {
    const r = createRun(input, 1, DEFAULT_ITERATIONS, {
      measure: fakeMeasure,
      realize: fakeRealize,
    });
    while (!r.step()) {
      // to the end of the budget
    }
    return r.result();
  };
  const trays = (r: LayoutResult) => (r.layout?.trays ?? []).filter((t) => t.part === "tray");

  it("picks the one-tray variant when it fits", () => {
    const input = makeInput([item], { box, settings: noLip });
    expect(createCtx(input, fakeMeasure).wholeFits).toEqual([true]);
    const whole = trays(run(input));
    expect(whole.map((t) => t.key)).toEqual(["w:p0:0"]);
    expect(whole[0]?.compartments).toHaveLength(2);
  });

  it("still splits when no single tray fits the bed", () => {
    // 80 mm of usable bed: the 84 mm tray is over it however it lies, the halves are not
    const input = makeInput([item], { box, settings: noLip, printer: { bedX: 90, bedY: 90 } });
    expect(createCtx(input, fakeMeasure).wholeFits).toEqual([false]);
    const r = run(input);
    expect(r.layout).not.toBeNull();
    expect(
      trays(r)
        .map((t) => t.key)
        .sort(),
    ).toEqual(["w:p0:0", "w:p0:1"]);
  });
});
