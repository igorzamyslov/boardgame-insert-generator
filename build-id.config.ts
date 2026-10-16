import { execFileSync } from "node:child_process";

/** What the footer shows when the build can't tell which commit it was made from. */
export const UNKNOWN_BUILD_ID = "unknown";

/** Runs `git` with these arguments and returns its stdout; throws when git can't answer. */
export type GitRunner = (args: string[]) => string;

const runGit: GitRunner = (args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/**
 * Build id for the footer: the short git commit SHA, plus "-dirty" when the working tree has
 * uncommitted changes (so a build of unsaved work is not mistaken for the commit). A display and
 * diagnostic value only: it must never reach `createdWith`, the inputs hash or a saved file.
 *
 * Never throws: with no git (tarball build, no .git, git not installed) or a reply that is not a
 * SHA, it returns "unknown".
 */
export function resolveBuildId(git: GitRunner = runGit): string {
  try {
    const sha = git(["rev-parse", "--short=7", "HEAD"]).trim();
    if (!/^[0-9a-f]{7,40}$/.test(sha)) {
      return UNKNOWN_BUILD_ID;
    }
    let dirty = false;
    try {
      dirty = git(["status", "--porcelain", "--untracked-files=no"]).trim() !== "";
    } catch {
      // The SHA is known; only the dirty flag is not. Show the SHA.
    }
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return UNKNOWN_BUILD_ID;
  }
}
