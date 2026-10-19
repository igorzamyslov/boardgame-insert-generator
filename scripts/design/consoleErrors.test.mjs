// scripts/design/consoleErrors.test.mjs
import { describe, expect, it } from "vitest";
import { consoleSection, consoleSummary, splitErrors } from "./consoleErrors.mjs";

describe("splitErrors", () => {
  it("expects nothing by default", () => {
    expect(splitErrors(["boom"])).toEqual({ expected: [], unexpected: ["boom"] });
  });

  it("matches a string as a substring and a RegExp as a pattern", () => {
    const found = splitErrors(
      ["Failed to load resource: 404", "page error: x is not a function", "other"],
      ["Failed to load resource", /^page error: .* is not a function$/],
    );
    expect(found.expected).toHaveLength(2);
    expect(found.unexpected).toEqual(["other"]);
  });
});

describe("consoleSection", () => {
  it("says none when the page logged nothing", () => {
    expect(consoleSection([])).toBe("## Console errors\n\nnone\n");
  });

  it("lists each error on one line and marks the expected ones", () => {
    const section = consoleSection(["bad\nthing", "known"], ["known"]);
    expect(section).toBe("## Console errors\n\n- bad thing\n- known (expected)\n");
  });
});

describe("consoleSummary", () => {
  it("says none when every state is clean or only has expected errors", () => {
    expect(
      consoleSummary({
        a: { errors: [], allowed: [] },
        b: { errors: ["known"], allowed: ["known"] },
      }),
    ).toBe("console errors: none");
  });

  it("names the states with unexpected errors and how many", () => {
    expect(
      consoleSummary({
        a: { errors: ["x", "y"], allowed: [] },
        b: { errors: [], allowed: [] },
        c: { errors: ["z"], allowed: [] },
      }),
    ).toBe("console errors in 2 states: a (2), c (1)");
  });
});
