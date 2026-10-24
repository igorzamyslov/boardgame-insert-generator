#!/usr/bin/env node
// scripts/backfill-releases.mjs — one-off: tag and release every version already on main.
//
//   node scripts/backfill-releases.mjs [--apply] [--ref origin/main] [--repo owner/name]
//
// Walks main's first-parent history, finds the commit where each package.json version first
// appeared and plans the tag `v<version>` on it, with the release title and notes the release
// workflow would have made (the CHANGELOG.md section; GitHub's generated notes when there is
// none). Without --apply it only prints the plan. With --apply it creates what is missing,
// oldest first, and skips every tag or release that exists, so it can be run again.
// Run it from a checkout whose CHANGELOG.md is the one on main, with `gh` signed in.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { compareVersions } from "./check-version-bump.mjs";
import { notesFor, releaseTitle } from "./changelog.mjs";

/**
 * From first-parent commits, oldest first (`{ sha, date, subject, version }`), the commit that
 * first carried each version. A version that was seen before is not planned twice.
 */
export function releaseCandidates(commits) {
  const seen = new Set();
  const out = [];
  let previous = null;
  for (const c of commits) {
    if (c.version && c.version !== previous && !seen.has(c.version)) {
      seen.add(c.version);
      out.push(c);
    }
    if (c.version) previous = c.version;
  }
  return out;
}

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

function versionAt(sha) {
  try {
    return JSON.parse(git("show", `${sha}:package.json`)).version ?? null;
  } catch {
    return null;
  }
}

function historyOf(ref) {
  return git("log", "--first-parent", "--reverse", "--format=%H%x09%cs%x09%s", ref)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, date, ...subject] = line.split("\t");
      return { sha, date, subject: subject.join("\t"), version: versionAt(sha) };
    });
}

// Titles for versions whose commit subject does not read as a summary.
const TITLES = {
  "0.4.0": "UX redesign: named trays, undo and redo, settings sheet, one Download, phone layout",
};

const gh = (args, input) =>
  spawnSync("gh", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const option = (name, fallback) => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : fallback;
  };
  const ref = option("--ref", "origin/main");
  const repo = option("--repo", "igorzamyslov/boardgame-insert-generator");
  const changelog = readFileSync("CHANGELOG.md", "utf8");

  const plan = releaseCandidates(historyOf(ref)).map((c) => ({
    ...c,
    tag: `v${c.version}`,
    title: TITLES[c.version]
      ? `${c.version}: ${TITLES[c.version]}`
      : releaseTitle(c.version, c.subject),
    notes: notesFor(changelog, c.version),
  }));
  const newest = plan.reduce((a, b) => (compareVersions(a.version, b.version) >= 0 ? a : b));

  process.stdout.write(
    `${apply ? "Creating" : "Dry run, would create"} ${plan.length} releases on ${repo}:\n\n`,
  );
  for (const p of plan) {
    const notes = p.notes
      ? `CHANGELOG section, ${p.notes.split("\n").length} lines`
      : "generated notes";
    process.stdout.write(
      `${p.tag.padEnd(9)} ${p.sha.slice(0, 8)} ${p.date}  ${p.title}\n          notes: ${notes}\n`,
    );
  }
  if (!apply) {
    process.stdout.write("\nNothing was created. Run again with --apply to create them.\n");
    process.exit(0);
  }

  let created = 0;
  for (const p of plan) {
    if (gh(["release", "view", p.tag, "--repo", repo]).status === 0) {
      process.stdout.write(`${p.tag}: release exists, skipped\n`);
      continue;
    }
    const tagExists = git(
      "ls-remote",
      "--tags",
      `https://github.com/${repo}.git`,
      `refs/tags/${p.tag}`,
    ).trim();
    if (tagExists) {
      process.stdout.write(`${p.tag}: tag exists, skipped\n`);
      continue;
    }
    const args = [
      "release",
      "create",
      p.tag,
      "--repo",
      repo,
      "--target",
      p.sha,
      "--title",
      p.title,
      `--latest=${p === newest}`,
      ...(p.notes ? ["--notes-file", "-"] : ["--generate-notes"]),
    ];
    const result = gh(args, p.notes ?? "");
    if (result.status !== 0) {
      process.stderr.write(`${p.tag}: failed\n${result.stderr}`);
      process.exit(1);
    }
    created += 1;
    process.stdout.write(`${p.tag}: created ${result.stdout.trim()}\n`);
  }
  process.stdout.write(`Done: ${created} created.\n`);
}
