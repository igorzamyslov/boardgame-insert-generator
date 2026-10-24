#!/usr/bin/env node
// scripts/changelog.mjs — reads CHANGELOG.md (Keep a Changelog style) for the release tooling.
//
//   node scripts/changelog.mjs notes <version>            the version's section, without its heading
//   node scripts/changelog.mjs title <version> [subject]  "<version>: <short summary>"
//
// `notes` exits 1 when there is no section for the version (the release job then falls back
// to GitHub's generated notes). `title` takes the summary from a commit or PR subject such as
// "0.21.0: room shared in stacks (#55)".
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HEADING = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/;
const KINDS = ["Added", "Changed", "Fixed", "Removed"];

/**
 * The `## [x]` sections of a changelog, top to bottom:
 * `{ name, date, body, kinds, entries, line }`. `name` is "Unreleased" or a version; `kinds`
 * are the `### ` headings under it; `entries` counts its list items.
 */
export function parseChangelog(text) {
  const sections = [];
  let current = null;
  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/\s+$/, "");
    const heading = HEADING.exec(line);
    if (heading) {
      current = {
        name: heading[1],
        date: heading[2] ?? null,
        body: [],
        kinds: [],
        entries: 0,
        line: index + 1,
      };
      sections.push(current);
    } else if (/^## /.test(line)) {
      current = null; // some other second-level heading: not a release section
    } else if (current) {
      current.body.push(line);
      const kind = /^### (.+)$/.exec(line);
      if (kind) current.kinds.push(kind[1]);
      if (/^\s*[-*] \S/.test(line)) current.entries += 1;
    }
  });
  for (const section of sections) {
    section.body = section.body.join("\n").trim();
  }
  return sections;
}

export const findSection = (sections, name) => sections.find((s) => s.name === name) ?? null;

/** The notes of a version's section, or null when it has none (or is empty). */
export function notesFor(text, version) {
  const section = findSection(parseChangelog(text), version);
  return section && section.body ? section.body : null;
}

/** "<version>: <summary>", the summary being a commit or PR subject without its prefix. */
export function releaseTitle(version, subject = "") {
  const summary = subject
    .trim()
    .replace(/^v?\d+\.\d+\.\d+[^:]*:\s*/, "")
    .replace(/\s*\(#\d+\)$/, "")
    .trim();
  return summary ? `${version}: ${summary}` : version;
}

const SEMVER_SECTION = /^\d+\.\d+\.\d+$/;

/** Problems that make the file unreadable for the tooling; an empty list when it is sound. */
export function lintChangelog(text) {
  const problems = [];
  const sections = parseChangelog(text);
  const seen = new Set();
  let previous = null;
  for (const s of sections) {
    if (s.name !== "Unreleased" && !SEMVER_SECTION.test(s.name)) {
      problems.push(`line ${s.line}: "${s.name}" is neither "Unreleased" nor a version`);
      continue;
    }
    if (seen.has(s.name)) problems.push(`line ${s.line}: ${s.name} appears twice`);
    seen.add(s.name);
    if (s.name === "Unreleased") {
      if (s.date) problems.push(`line ${s.line}: "Unreleased" has no date`);
      if (previous) problems.push(`line ${s.line}: "Unreleased" must be the first section`);
    } else {
      if (!s.date)
        problems.push(`line ${s.line}: ${s.name} needs a date, as "## [${s.name}] - YYYY-MM-DD"`);
      if (previous && previous !== "Unreleased" && compare(s.name, previous) >= 0) {
        problems.push(`line ${s.line}: ${s.name} must come below ${previous} (newest first)`);
      }
    }
    for (const kind of s.kinds) {
      if (!KINDS.includes(kind)) {
        problems.push(`line ${s.line}: "### ${kind}" under ${s.name}; use ${KINDS.join(", ")}`);
      }
    }
    previous = s.name;
  }
  return problems;
}

function compare(a, b) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, version, subject] = process.argv.slice(2);
  const path = process.env.CHANGELOG ?? "CHANGELOG.md";
  if (command === "notes" && version) {
    const notes = notesFor(readFileSync(path, "utf8"), version);
    if (notes === null) {
      process.stderr.write(`changelog: no entries for ${version} in ${path}\n`);
      process.exit(1);
    }
    process.stdout.write(`${notes}\n`);
  } else if (command === "title" && version) {
    process.stdout.write(`${releaseTitle(version, subject)}\n`);
  } else {
    process.stderr.write("usage: changelog.mjs notes <version> | title <version> [subject]\n");
    process.exit(2);
  }
}
