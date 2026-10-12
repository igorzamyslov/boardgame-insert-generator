// src/licenses/renderLicenses.ts
// Pure text builder for dist/third-party-licenses.txt (used by licenses.config.ts at build time).
import { compareCodeUnits } from "../util/compare";

export interface DependencyInfo {
  name?: string | null;
  version?: string | null;
  license?: string | null;
  licenseText?: string | null;
  noticeText?: string | null;
}

export interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  text: string;
}

export const REQUIRED_PACKAGES = [
  "manifold-3d",
  "Clipper2",
  "three",
  "preact",
  "@preact/signals",
  "fflate",
];

const RULE = "=".repeat(72);

export function toEntries(deps: readonly DependencyInfo[]): LicenseEntry[] {
  const entries: LicenseEntry[] = [];
  for (const d of deps) {
    if (!d.name) {
      continue;
    }
    const parts = [d.licenseText, d.noticeText].filter(
      (t): t is string => typeof t === "string" && t.trim() !== "",
    );
    entries.push({
      name: d.name,
      version: d.version ?? "",
      license: d.license ?? "UNKNOWN",
      text: parts.length > 0 ? parts.join("\n\n") : "(The package ships no license text.)",
    });
  }
  return entries;
}

export function renderLicenses(entries: readonly LicenseEntry[], appName: string): string {
  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    const key = `${e.name}@${e.version}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => compareCodeUnits(a.name, b.name));
  const sections = unique.map((e) => {
    const title = `${e.name}${e.version === "" ? "" : ` ${e.version}`} — ${e.license}`;
    return `${RULE}\n${title}\n${RULE}\n\n${e.text.trim()}\n`;
  });
  return `Third-party software in ${appName}\n\nThis app bundles the following open-source software. Their licenses follow.\n\n${sections.join("\n")}`;
}

export function missingPackages(text: string, required: readonly string[]): string[] {
  return required.filter((name) => !text.includes(name));
}
