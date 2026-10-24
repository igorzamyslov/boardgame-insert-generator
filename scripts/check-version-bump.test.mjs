// scripts/check-version-bump.test.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkBump,
  compareVersions,
  isLockfileOnlyRenovate,
  parseVersion,
} from "./check-version-bump.mjs";

const script = fileURLToPath(new URL("./check-version-bump.mjs", import.meta.url));
const created = [];
afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function run(base, next, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "version-bump-"));
  created.push(dir);
  writeFileSync(join(dir, "base.json"), JSON.stringify({ version: base }));
  writeFileSync(join(dir, "next.json"), JSON.stringify({ version: next }));
  return spawnSync(process.execPath, [script, join(dir, "base.json"), join(dir, "next.json")], {
    encoding: "utf8",
    env: { ...process.env, PR_AUTHOR: "", CHANGED_FILES: "", ...env },
  });
}

describe("compareVersions", () => {
  it("compares numerically, not as text", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "0.99.99")).toBe(1);
    expect(compareVersions("0.2.1", "0.2.10")).toBe(-1);
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
  });

  it("ranks a release above its pre-releases", () => {
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
    expect(compareVersions("1.0.0-rc.2", "1.0.0-rc.10")).toBe(-1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
  });

  it("ignores build metadata", () => {
    expect(compareVersions("1.0.0+a", "1.0.0+b")).toBe(0);
  });

  it("rejects text that is not semver", () => {
    expect(() => parseVersion("1.0")).toThrow(/semver/);
  });
});

describe("checkBump", () => {
  it("accepts a higher version", () => {
    expect(checkBump("0.2.0", "0.2.1")).toBeNull();
    expect(checkBump("0.2.0", "0.3.0")).toBeNull();
  });

  it("rejects the same or a lower version", () => {
    expect(checkBump("0.2.0", "0.2.0")).toMatch(/must be greater/);
    expect(checkBump("0.2.0", "0.1.9")).toMatch(/must be greater/);
  });
});

describe("isLockfileOnlyRenovate", () => {
  it("accepts a Renovate change to package-lock.json alone", () => {
    expect(isLockfileOnlyRenovate("renovate[bot]", ["package-lock.json"])).toBe(true);
  });

  it("rejects other authors, other files and an empty list", () => {
    expect(isLockfileOnlyRenovate("igorzamyslov", ["package-lock.json"])).toBe(false);
    expect(isLockfileOnlyRenovate("renovate[bot]", ["package-lock.json", "package.json"])).toBe(
      false,
    );
    expect(isLockfileOnlyRenovate("renovate[bot]", [])).toBe(false);
  });
});

describe("check-version-bump script", () => {
  it("exits 0 on a bump", () => {
    const res = run("0.2.0", "0.3.0");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("0.2.0 -> 0.3.0");
  });

  it("exits 1 when the version is unchanged", () => {
    const res = run("0.2.0", "0.2.0");
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("FAILED");
  });

  it("exits 0 without a bump for a Renovate lock-file-only update", () => {
    const res = run("0.2.0", "0.2.0", {
      PR_AUTHOR: "renovate[bot]",
      CHANGED_FILES: "package-lock.json\n",
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("lock-file-only");
  });

  it("still fails a Renovate update that touches package.json without a bump", () => {
    const res = run("0.2.0", "0.2.0", {
      PR_AUTHOR: "renovate[bot]",
      CHANGED_FILES: "package.json\npackage-lock.json\n",
    });
    expect(res.status).toBe(1);
  });
});
