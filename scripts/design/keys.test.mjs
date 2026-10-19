// scripts/design/keys.test.mjs
import { describe, expect, it } from "vitest";
import { trapProblems } from "./keys.mjs";

const stop = (label) => ({ label });
const good = () => ({
  stops: [stop("Close"), stop("This insert"), stop("Done")],
  behind: [],
  wrapTo: "Close",
  viaBrowser: false,
  shiftTabFromFirst: "Done",
  shiftViaBrowser: false,
});

describe("trapProblems", () => {
  it("finds nothing in a trap that wraps both ways", () => {
    expect(trapProblems(good())).toEqual([]);
  });

  it("accepts the step through the browser's own interface that a native dialog takes", () => {
    expect(trapProblems({ ...good(), viaBrowser: true, shiftViaBrowser: true })).toEqual([]);
  });

  it("names a stop on the page behind the drawer", () => {
    const found = trapProblems({ ...good(), behind: ['button "Undo"'] });
    expect(found).toEqual(['Tab took the focus to the page behind the drawer: button "Undo"']);
  });

  it("says when Tab goes to the wrong control, or never wraps", () => {
    expect(trapProblems({ ...good(), wrapTo: "This insert", viaBrowser: true })).toEqual([
      "Tab past the last control (Done) went to This insert (through the browser's own interface), not the first (Close)",
    ]);
    expect(trapProblems({ ...good(), wrapTo: null })[0]).toMatch(/never came round/);
  });

  it("says when Shift+Tab from the first does not reach the last", () => {
    expect(trapProblems({ ...good(), shiftTabFromFirst: "This insert" })).toEqual([
      "Shift+Tab from the first control (Close) went to This insert, not the last (Done)",
    ]);
  });

  it("has nothing to judge with under two stops", () => {
    expect(trapProblems({ ...good(), stops: [stop("Done")] })).toEqual([
      "the drawer has 1 Tab stops: nothing to trap",
    ]);
  });
});
