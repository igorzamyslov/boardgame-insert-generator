/** Schema version of project files written by this app (spec §9). */
export const SCHEMA_VERSION = "0.1.0";

/** App version from package.json, injected by Vite `define`. */
export const APP_VERSION = __APP_VERSION__;

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

/** True while the app is a preview release (0.x): show the "links may break" banner. */
export function isPreview(version: string): boolean {
  return parseSemver(version)?.major === 0;
}
