// scripts/changelog.test.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkChangelog } from "./check-changelog.mjs";
import { lintChangelog, notesFor, parseChangelog, releaseTitle } from "./changelog.mjs";
import { releaseCandidates } from "./backfill-releases.mjs";

const SAMPLE = `# Changelog

## [Unreleased]

### Added

- Something new.

## [0.2.0] - 2026-02-02

### Fixed

- A fix.
- Another fix.

## [0.1.0] - 2026-01-01

First version.
`;

describe("parseChangelog", () => {
  it("reads the sections, their dates and their entries", () => {
    const [unreleased, v2, v1] = parseChangelog(SAMPLE);
    expect([unreleased.name, unreleased.date, unreleased.entries]).toEqual(["Unreleased", null, 1]);
    expect([v2.name, v2.date, v2.entries, v2.kinds]).toEqual(["0.2.0", "2026-02-02", 2, ["Fixed"]]);
    expect([v1.name, v1.entries]).toEqual(["0.1.0", 0]);
  });
});

describe("notesFor", () => {
  it("returns a version's section without its heading", () => {
    expect(notesFor(SAMPLE, "0.2.0")).toBe("### Fixed\n\n- A fix.\n- Another fix.");
    expect(notesFor(SAMPLE, "0.1.0")).toBe("First version.");
  });
  it("returns null for a missing version", () => {
    expect(notesFor(SAMPLE, "0.3.0")).toBeNull();
  });
});

describe("releaseTitle", () => {
  it("is the version and the subject without its version prefix and PR number", () => {
    expect(releaseTitle("0.21.0", "0.21.0: room shared in stacks (#55)")).toBe(
      "0.21.0: room shared in stacks",
    );
    expect(releaseTitle("0.2.2", "Add a favicon (#11)")).toBe("0.2.2: Add a favicon");
    expect(releaseTitle("0.3.0", "")).toBe("0.3.0");
  });
});

describe("lintChangelog", () => {
  it("accepts a sound file", () => {
    expect(lintChangelog(SAMPLE)).toEqual([]);
  });
  it("rejects a missing date, a wrong order, a duplicate and a stray heading", () => {
    const bad = `## [0.1.0] - 2026-01-01\n\n## [0.2.0]\n\n## [0.2.0] - 2026-02-02\n\n### Misc\n`;
    const problems = lintChangelog(bad).join("\n");
    expect(problems).toContain("must come below");
    expect(problems).toContain("needs a date");
    expect(problems).toContain("appears twice");
    expect(problems).toContain('"### Misc"');
  });
  it("wants Unreleased first", () => {
    expect(lintChangelog("## [0.1.0] - 2026-01-01\n\n## [Unreleased]\n").join()).toContain(
      "must be the first",
    );
  });
});

describe("checkChangelog", () => {
  it("passes a feature pull request with entries under Unreleased", () => {
    expect(checkChangelog("0.1.0", "0.2.1", SAMPLE)).toEqual([]);
  });
  it("passes an integrating pull request with its own dated section", () => {
    expect(checkChangelog("0.1.0", "0.2.0", SAMPLE.replace("- Something new.", ""))).toEqual([]);
  });
  it("fails when the new version has no section and Unreleased is empty", () => {
    const empty = SAMPLE.replace("### Added\n\n- Something new.\n", "");
    expect(checkChangelog("0.1.0", "0.3.0", empty).join()).toContain("no entry");
  });
  it("fails an empty section for the new version", () => {
    expect(checkChangelog("0.0.9", "0.1.0", SAMPLE).join()).toContain("no entries");
  });
  it("ignores a pull request that does not raise the version", () => {
    expect(checkChangelog("0.2.0", "0.2.0", "nothing here")).toEqual([]);
  });
});

describe("releaseCandidates", () => {
  it("picks the first commit of each version, oldest first", () => {
    const c = (sha, version) => ({ sha, version, date: "", subject: "" });
    const plan = releaseCandidates([
      c("a", null),
      c("b", "0.1.0"),
      c("c", "0.1.0"),
      c("d", "0.2.0"),
      c("e", "0.2.0"),
    ]);
    expect(plan.map((p) => `${p.version}@${p.sha}`)).toEqual(["0.1.0@b", "0.2.0@d"]);
  });
});

describe("CHANGELOG.md of this repository", () => {
  const text = readFileSync(fileURLToPath(new URL("../CHANGELOG.md", import.meta.url)), "utf8");
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  );
  it("is sound", () => {
    expect(lintChangelog(text)).toEqual([]);
  });
  it("covers the current version (its own section or Unreleased)", () => {
    expect(checkChangelog("0.0.0", pkg.version, text)).toEqual([]);
  });
  it("uses no file names in its entries", () => {
    expect(text).not.toMatch(/\b[\w-]+\.(?:ts|tsx|mjs|json|yml)\b/);
  });
});

describe("the check-changelog command", () => {
  const dirs = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const script = fileURLToPath(new URL("./check-changelog.mjs", import.meta.url));
  function run(changelog, env = {}) {
    const dir = mkdtempSync(join(tmpdir(), "check-changelog-"));
    dirs.push(dir);
    writeFileSync(join(dir, "base.json"), JSON.stringify({ version: "0.1.0" }));
    writeFileSync(join(dir, "next.json"), JSON.stringify({ version: "0.2.0" }));
    writeFileSync(join(dir, "CHANGELOG.md"), changelog);
    return spawnSync(
      process.execPath,
      [script, join(dir, "base.json"), join(dir, "next.json"), join(dir, "CHANGELOG.md")],
      { encoding: "utf8", env: { ...process.env, PR_AUTHOR: "", ...env } },
    );
  }
  it("exits 0 for a covered release and 1 for an uncovered one", () => {
    expect(run(SAMPLE).status).toBe(0);
    const failed = run("# Changelog\n");
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain("check-changelog: FAILED");
  });
  it("lets Renovate through", () => {
    expect(run("# Changelog\n", { PR_AUTHOR: "renovate[bot]" }).status).toBe(0);
  });
});
