// src/app/state.test.ts
import { describe, expect, it } from "vitest";
import { GEOMETRY_VERSION } from "../geometry/version";
import { NOTICE_CODES } from "../layout";
import { inputsHash } from "../model/hash";
import {
  CAPPED_CODE,
  GEOMETRY_MAJOR_CODE,
  STALE_CODE,
  createState,
  dismissNotice,
  pushNotice,
} from "./state";
import { fixtureProject, makeLayout, makeResult } from "./test-helpers";

describe("createState", () => {
  it("is not stale without a layout or with a matching hash", () => {
    const p = fixtureProject();
    expect(createState(p).stale.value).toBe(false);
    const withLayout = { ...p, layout: makeLayout(inputsHash(p)) };
    expect(createState(withLayout).stale.value).toBe(false);
  });

  it("becomes stale when inputs change and reports it as a notice", () => {
    const p = fixtureProject();
    const s = createState({ ...p, layout: makeLayout(inputsHash(p)) });
    s.project.value = { ...s.project.value, box: { ...p.box, innerHeight: p.box.innerHeight + 1 } };
    expect(s.stale.value).toBe(true);
    expect(s.layoutNotices.value.map((n) => n.code)).toContain(STALE_CODE);
  });

  it("does not become stale when only the name changes", () => {
    const p = fixtureProject();
    const s = createState({ ...p, layout: makeLayout(inputsHash(p)) });
    s.project.value = { ...s.project.value, name: "Renamed" };
    expect(s.stale.value).toBe(false);
  });

  it("uses the run summary for the accepted layout and recomputes otherwise", () => {
    const p = fixtureProject();
    const layout = makeLayout(inputsHash(p));
    const s = createState({ ...p, layout });
    const result = makeResult(layout);
    s.lastResult.value = result;
    expect(s.summary.value).toBe(result.summary);
    s.lastResult.value = makeResult(makeLayout("other"));
    expect(s.summary.value).not.toBeNull();
    expect(s.summary.value).not.toBe(result.summary);
    expect(typeof s.summary.value?.trayCount).toBe("number");
  });

  it("drops the run summary once a setting that moves the riser split changes", () => {
    const p = fixtureProject();
    const layout = makeLayout(inputsHash(p));
    const s = createState({ ...p, layout });
    const result = makeResult(layout);
    s.lastResult.value = result;
    expect(s.summary.value).toBe(result.summary);
    s.project.value = {
      ...s.project.value,
      settings: { ...s.project.value.settings, leftover: "solid" },
    };
    expect(s.summary.value).not.toBe(result.summary);
    // infill alone is not in the hash but still refreshes the estimate
    s.project.value = {
      ...s.project.value,
      settings: { ...s.project.value.settings, leftover: p.settings.leftover },
    };
    expect(s.summary.value).toBe(result.summary);
    s.project.value = {
      ...s.project.value,
      settings: { ...s.project.value.settings, infill: 40 },
    };
    expect(s.summary.value?.infillPct).toBe(40);
  });

  it("shows run notices only for the layout they belong to, plus capped", () => {
    const p = fixtureProject();
    const layout = makeLayout(inputsHash(p), undefined, { capped: true });
    const s = createState({ ...p, layout });
    const notice = {
      level: "warning" as const,
      code: NOTICE_CODES.play,
      message: "Play 1.8 mm on X",
    };
    s.lastResult.value = makeResult(makeLayout("other"), { notices: [notice] });
    expect(s.layoutNotices.value.map((n) => n.code)).not.toContain(NOTICE_CODES.play);
    s.lastResult.value = makeResult(layout, { notices: [notice] });
    expect(s.layoutNotices.value.map((n) => n.code)).toContain(NOTICE_CODES.play);
    expect(s.layoutNotices.value.map((n) => n.code)).toContain(CAPPED_CODE);
  });

  it("shows notices of an infeasible run (no layout)", () => {
    const s = createState(fixtureProject());
    const notice = {
      level: "error" as const,
      code: NOTICE_CODES.doesNotFit,
      message: "Doesn't fit",
    };
    s.lastResult.value = makeResult(null, { notices: [notice] });
    s.lastResultHash.value = s.currentHash.value;
    expect(s.layoutNotices.value).toContainEqual(notice);
  });

  it("drops the notices of an infeasible run once the inputs change", () => {
    const p = fixtureProject();
    const s = createState(p);
    const notice = {
      level: "error" as const,
      code: NOTICE_CODES.doesNotFit,
      message: "Doesn't fit",
    };
    s.lastResult.value = makeResult(null, { notices: [notice] });
    s.lastResultHash.value = s.currentHash.value;
    s.project.value = { ...p, box: { ...p.box, innerHeight: p.box.innerHeight + 1 } };
    expect(s.layoutNotices.value).not.toContainEqual(notice);
  });

  it("reports the shortfall of an infeasible run only for the inputs it was computed for", () => {
    const p = fixtureProject();
    const s = createState(p);
    const shortfall = { x: 12.3, y: 0, z: 0 };
    expect(s.shortfall.value).toBeNull();
    s.lastResult.value = makeResult(null, { bestAttempt: { trays: [], shortfall } });
    // A result no run has stamped for these inputs does not count.
    expect(s.shortfall.value).toBeNull();
    s.lastResultHash.value = s.currentHash.value;
    expect(s.shortfall.value).toEqual(shortfall);
    s.project.value = { ...p, box: { ...p.box, innerHeight: p.box.innerHeight + 1 } };
    expect(s.shortfall.value).toBeNull();
  });

  it("has no shortfall for a feasible result", () => {
    const p = fixtureProject();
    const layout = makeLayout(inputsHash(p));
    const s = createState({ ...p, layout });
    s.lastResult.value = makeResult(layout);
    s.lastResultHash.value = s.currentHash.value;
    expect(s.shortfall.value).toBeNull();
  });

  it("asks for a reprint for a layout from an older geometry line only", () => {
    const p = fixtureProject();
    const codesFor = (geometryVersion: string) =>
      createState({
        ...p,
        layout: makeLayout(inputsHash(p), undefined, { geometryVersion }),
      }).layoutNotices.value.map((n) => n.code);
    // GEOMETRY_VERSION is 0.5.2: pre-1.0 an older 0.MINOR is an older line, a PATCH is not.
    expect(codesFor("0.3.2")).toContain(GEOMETRY_MAJOR_CODE);
    expect(codesFor("0.4.2")).toContain(GEOMETRY_MAJOR_CODE);
    expect(codesFor("0.5.2")).not.toContain(GEOMETRY_MAJOR_CODE);
    expect(codesFor("0.6.0")).not.toContain(GEOMETRY_MAJOR_CODE);
  });

  it("says the plan is out of date, and that re-running it rebuilds the trays", () => {
    const p = fixtureProject();
    const s = createState({
      ...p,
      layout: makeLayout(inputsHash(p), undefined, { geometryVersion: "0.1.0" }),
    });
    expect(s.geometryOld.value).toBe(true);
    const n = s.layoutNotices.value.find((x) => x.code === GEOMETRY_MAJOR_CODE);
    expect(n?.level).toBe("warning");
    expect(n?.message).toContain("out of date");
    expect(n?.message).toContain("0.1.0");
    expect(n?.message).toContain(`the app now uses ${GEOMETRY_VERSION}`);
    expect(n?.message).toContain("Update plan");
    expect(n?.message).toContain("current geometry");
    expect(n?.message).toContain("reprint the whole insert");
    const current = createState({ ...p, layout: makeLayout(inputsHash(p)) });
    expect(current.geometryOld.value).toBe(false);
  });

  it("validates the project", () => {
    const p = fixtureProject();
    const s = createState(p);
    expect(s.validation.value.filter((n) => n.level === "error")).toEqual([]);
    s.project.value = { ...p, box: { ...p.box, innerWidth: -5 } };
    expect(s.validation.value.some((n) => n.level === "error")).toBe(true);
  });
});

describe("app notices", () => {
  it("replaces by code and dismisses", () => {
    const s = createState(fixtureProject());
    pushNotice(s, { level: "info", code: "x", message: "one" });
    pushNotice(s, { level: "info", code: "x", message: "two" });
    pushNotice(s, { level: "info", code: "y", message: "three" });
    expect(s.appNotices.value.map((n) => n.message)).toEqual(["two", "three"]);
    dismissNotice(s, "x");
    expect(s.appNotices.value.map((n) => n.code)).toEqual(["y"]);
  });
});
