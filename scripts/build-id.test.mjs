// scripts/build-id.test.mjs
import process from "node:process";
import { describe, expect, it } from "vitest";
import { UNKNOWN_BUILD_ID, resolveBuildId } from "../build-id.config.ts";

const git =
  (sha, status = "") =>
  (args) =>
    args[0] === "rev-parse" ? `${sha}\n` : status;

describe("resolveBuildId", () => {
  it("is the short SHA of a clean tree", () => {
    expect(resolveBuildId(git("2a2ec02"))).toBe("2a2ec02");
  });

  it("marks uncommitted changes", () => {
    expect(resolveBuildId(git("2a2ec02", " M src/a.ts\n"))).toBe("2a2ec02-dirty");
  });

  it("shows the SHA when only the status check fails", () => {
    const run = (args) => {
      if (args[0] === "status") {
        throw new Error("boom");
      }
      return "2a2ec02\n";
    };
    expect(resolveBuildId(run)).toBe("2a2ec02");
  });

  it("is unknown, and does not throw, when git is unavailable", () => {
    const run = () => {
      throw new Error("git: command not found");
    };
    expect(resolveBuildId(run)).toBe(UNKNOWN_BUILD_ID);
    expect(UNKNOWN_BUILD_ID).toBe("unknown");
  });

  it("is unknown when git answers with something that is not a SHA", () => {
    expect(resolveBuildId(() => "fatal: not a git repository")).toBe("unknown");
    expect(resolveBuildId(() => "")).toBe("unknown");
  });

  it("is unknown when the git binary is not installed (real runner, empty PATH)", () => {
    const saved = process.env.PATH;
    process.env.PATH = "";
    try {
      expect(resolveBuildId()).toBe("unknown");
    } finally {
      process.env.PATH = saved;
    }
  });
});
