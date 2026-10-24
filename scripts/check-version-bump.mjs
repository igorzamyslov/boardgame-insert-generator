#!/usr/bin/env node
// scripts/check-version-bump.mjs — CI gate for pull requests to main.
//
//   node scripts/check-version-bump.mjs <base-package.json> [package.json]
//
// Fails unless "version" in package.json is a higher semver than the one in the base
// package.json (main's), because every merge to main is a release: the footer and every
// saved project's `createdWith` read that version.
//
// One exception: a Renovate pull request that changes nothing but package-lock.json (lock
// file maintenance) passes without a bump. Renovate's `bumpVersion` only acts when it edits
// package.json, and such a release changes no dependency the app declares. CI passes the
// author in PR_AUTHOR and the changed paths, one per line, in CHANGED_FILES.
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(text) {
  const m = SEMVER.exec(text);
  if (!m) {
    throw new Error(`"${text}" is not a semver version`);
  }
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4]?.split(".") ?? [] };
}

function comparePre(a, b) {
  if (a.length === 0 || b.length === 0) {
    // A release outranks any of its pre-releases.
    return Math.sign(b.length - a.length);
  }
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const numA = /^\d+$/.test(a[i]);
    const numB = /^\d+$/.test(b[i]);
    if (numA && numB) {
      if (Number(a[i]) !== Number(b[i])) return Number(a[i]) < Number(b[i]) ? -1 : 1;
    } else if (numA !== numB) {
      return numA ? -1 : 1;
    } else if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return 0;
}

/** -1, 0 or 1 as `a` is lower than, equal to or higher than `b` (semver precedence). */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (x.core[i] !== y.core[i]) return x.core[i] < y.core[i] ? -1 : 1;
  }
  return comparePre(x.pre, y.pre);
}

/** Null when `next` is a bump over `base`, else the reason it is not. */
export function checkBump(base, next) {
  if (compareVersions(next, base) > 0) {
    return null;
  }
  return `package.json version ${next} must be greater than ${base} on main; bump it before merging`;
}

const RENOVATE = "renovate[bot]";

/** True for a Renovate pull request whose only change is package-lock.json. */
export function isLockfileOnlyRenovate(author, changedFiles) {
  return (
    author === RENOVATE &&
    changedFiles.length > 0 &&
    changedFiles.every((path) => path === "package-lock.json")
  );
}

const readVersion = (path) => JSON.parse(readFileSync(path, "utf8")).version;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [basePath, nextPath = "package.json"] = process.argv.slice(2);
  if (!basePath) {
    process.stderr.write("usage: check-version-bump.mjs <base-package.json> [package.json]\n");
    process.exit(2);
  }
  const author = process.env.PR_AUTHOR ?? "";
  const changed = (process.env.CHANGED_FILES ?? "").split("\n").filter(Boolean);
  if (isLockfileOnlyRenovate(author, changed)) {
    process.stdout.write(
      "check-version-bump: OK (Renovate lock-file-only update, no bump needed)\n",
    );
    process.exit(0);
  }
  const base = readVersion(basePath);
  const next = readVersion(nextPath);
  const problem = checkBump(base, next);
  if (problem) {
    process.stderr.write(`check-version-bump: FAILED\n  - ${problem}\n`);
    process.exit(1);
  }
  process.stdout.write(`check-version-bump: OK (${base} -> ${next})\n`);
}
