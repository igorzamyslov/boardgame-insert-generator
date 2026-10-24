#!/usr/bin/env node
// scripts/check-changelog.mjs — CI gate for pull requests to main, next to check-version-bump.
//
//   node scripts/check-changelog.mjs <base-package.json> [package.json] [CHANGELOG.md]
//
// A pull request that raises the version must say what it changes. It passes when CHANGELOG.md
// either has a dated section for the new version with entries (the integrating pull request
// that cuts a release), or has entries under "## [Unreleased]" (a feature pull request, whose
// entries the integrating pull request moves under the version). The file must also be sound:
// newest first, dated, with Added / Changed / Fixed headings only. Renovate pull requests
// (author in PR_AUTHOR) need no entry; their releases get generated notes.
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { compareVersions } from "./check-version-bump.mjs";
import { findSection, lintChangelog, parseChangelog } from "./changelog.mjs";

/** The reasons `changelog` does not cover the step from `base` to `next`; empty when it does. */
export function checkChangelog(base, next, changelog) {
  if (compareVersions(next, base) <= 0) {
    return []; // not a release: check-version-bump reports that
  }
  const problems = lintChangelog(changelog);
  const sections = parseChangelog(changelog);
  const own = findSection(sections, next);
  const pending = findSection(sections, "Unreleased");
  if (own ? own.entries === 0 : !pending || pending.entries === 0) {
    problems.push(
      own
        ? `the ${next} section has no entries`
        : `CHANGELOG.md has no entry for this change: add it under "## [Unreleased]" (or, when you cut the release, under "## [${next}] - YYYY-MM-DD")`,
    );
  }
  return problems;
}

const readVersion = (path) => JSON.parse(readFileSync(path, "utf8")).version;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [basePath, nextPath = "package.json", changelogPath = "CHANGELOG.md"] =
    process.argv.slice(2);
  if (!basePath) {
    process.stderr.write(
      "usage: check-changelog.mjs <base-package.json> [package.json] [CHANGELOG.md]\n",
    );
    process.exit(2);
  }
  if (process.env.PR_AUTHOR === "renovate[bot]") {
    process.stdout.write("check-changelog: OK (Renovate pull request, no entry needed)\n");
    process.exit(0);
  }
  const base = readVersion(basePath);
  const next = readVersion(nextPath);
  const problems = checkChangelog(base, next, readFileSync(changelogPath, "utf8"));
  if (problems.length > 0) {
    process.stderr.write(
      `check-changelog: FAILED\n${problems.map((p) => `  - ${p}`).join("\n")}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`check-changelog: OK (${base} -> ${next})\n`);
}
