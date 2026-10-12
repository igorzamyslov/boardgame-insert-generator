import { describe, expect, it } from "vitest";
import * as layout from "./index";

describe("layout public API", () => {
  it("exports the roadmap §4.4 functions plus swapLocks and NOTICE_CODES", () => {
    expect(typeof layout.optimize).toBe("function");
    expect(typeof layout.summarize).toBe("function");
    expect(typeof layout.swapLocks).toBe("function");
    expect(layout.DEFAULT_ITERATIONS).toBeGreaterThan(0);
    expect(layout.NOTICE_CODES.doesNotFit).toBe("layout.doesNotFit");
  });
});
