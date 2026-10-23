/**
 * Schema version of project files written by this app (spec §9).
 *
 * How to bump it: while MAJOR is 0, an additive change (new optional field,
 * new enum value, new component kind) bumps PATCH, and MINOR is a breaking
 * change that needs a migration (MIGRATIONS in schema.ts). From 1.0 on, an
 * additive change bumps MINOR and a breaking change bumps MAJOR.
 */
export const SCHEMA_VERSION = "0.3.0";

/** App version from package.json, injected by Vite `define`. */
export const APP_VERSION = __APP_VERSION__;

/**
 * Short git commit SHA of this build (or "unknown"), injected by Vite `define`. Shown in the
 * footer so a deployment can be told from the last one even when the version was not bumped.
 * Display and diagnostics only: never write it into a project, a stored layout or the inputs hash.
 */
export const BUILD_ID = __BUILD_ID__;

/** createdWith of a file or stored layout that doesn't say which app version made it. */
export const UNKNOWN_APP_VERSION = "unknown";

export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Strict `MAJOR.MINOR.PATCH`; anything else (prerelease tags, "v1.0.0", "1.0") → null. */
export function parseSemver(v: string): Semver | null {
  const m = SEMVER.exec(v);
  if (!m) {
    return null;
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}
