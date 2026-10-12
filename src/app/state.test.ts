// src/app/state.test.ts
import { describe, expect, it } from "vitest";
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
    expect(s.layoutNotices.value).toContainEqual(notice);
  });

  it("asks for a reprint for a layout from an older geometry line only", () => {
    const p = fixtureProject();
    const codesFor = (geometryVersion: string) =>
      createState({
        ...p,
        layout: makeLayout(inputsHash(p), undefined, { geometryVersion }),
      }).layoutNotices.value.map((n) => n.code);
    // GEOMETRY_VERSION is 0.2.0: pre-1.0 an older 0.MINOR is an older line, a PATCH is not.
    expect(codesFor("0.1.4")).toContain(GEOMETRY_MAJOR_CODE);
    expect(codesFor("0.2.3")).not.toContain(GEOMETRY_MAJOR_CODE);
    expect(codesFor("0.3.0")).not.toContain(GEOMETRY_MAJOR_CODE);
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
