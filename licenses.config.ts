import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import license from "rollup-plugin-license";
import type { Plugin } from "vite";
import {
  REQUIRED_PACKAGES,
  missingPackages,
  renderLicenses,
  toEntries,
} from "./src/licenses/renderLicenses";
import type { DependencyInfo, LicenseEntry } from "./src/licenses/renderLicenses";

export const LICENSES_FILE = "third-party-licenses.txt";

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** manifold-3d is only in the geometry worker bundle, which the main-build plugin never sees. */
function manifoldEntry(): LicenseEntry {
  const dir = here("./node_modules/manifold-3d/");
  const pkg = JSON.parse(readIfExists(`${dir}package.json`) || "{}") as {
    version?: string;
    license?: string;
  };
  const text = [readIfExists(`${dir}LICENSE`), readIfExists(`${dir}NOTICE`)]
    .filter((t) => t.trim() !== "")
    .join("\n\n");
  if (text === "") {
    throw new Error("manifold-3d license text not found in node_modules/manifold-3d");
  }
  return {
    name: "manifold-3d",
    version: pkg.version ?? "",
    license: pkg.license ?? "Apache-2.0",
    text,
  };
}

/**
 * The self-hosted fonts. Their CSS is bundled but the font files are plain assets, so the plugin
 * never sees the packages: read their licence (SIL OFL 1.1) from node_modules here.
 */
const FONT_PACKAGES = ["@fontsource/bricolage-grotesque", "@fontsource/figtree"];

function fontEntries(): LicenseEntry[] {
  return FONT_PACKAGES.map((name) => {
    const dir = here(`./node_modules/${name}/`);
    const pkg = JSON.parse(readIfExists(`${dir}package.json`) || "{}") as {
      version?: string;
      license?: string;
    };
    const text = readIfExists(`${dir}LICENSE`);
    if (text.trim() === "") {
      throw new Error(`${name} license text not found in node_modules/${name}`);
    }
    return { name, version: pkg.version ?? "", license: pkg.license ?? "OFL-1.1", text };
  });
}

function clipperEntry(): LicenseEntry {
  return {
    name: "Clipper2 (inside manifold-3d's WASM)",
    version: "",
    license: "BSL-1.0",
    text: readFileSync(here("./licenses/clipper2-LICENSE.txt"), "utf8"),
  };
}

/** The engraved names' font: outlines of Overpass Bold are compiled into the geometry (name-font-data.ts). */
function overpassEntry(): LicenseEntry {
  return {
    name: "Overpass (outlines of the engraved names)",
    version: "4.0",
    license: "OFL-1.1",
    text: readFileSync(here("./licenses/overpass-OFL.txt"), "utf8"),
  };
}

export function licensePlugin(): Plugin {
  // rollup-plugin-license is typed against its own rollup version; the hooks it uses are
  // the same in Vite's rollup, so the plugin object is passed through as a Vite plugin.
  const plugin = license({
    thirdParty: {
      includePrivate: false,
      output: {
        file: here(`./dist/${LICENSES_FILE}`),
        template: (dependencies: DependencyInfo[]) => {
          const entries = [
            ...toEntries(dependencies).filter(
              (e) => e.name !== "manifold-3d" && !FONT_PACKAGES.includes(e.name),
            ),
            manifoldEntry(),
            clipperEntry(),
            overpassEntry(),
            ...fontEntries(),
          ];
          const text = renderLicenses(entries, "Board Game Insert Generator");
          const missing = missingPackages(text, REQUIRED_PACKAGES);
          if (missing.length > 0) {
            throw new Error(`Third-party licenses file is missing: ${missing.join(", ")}`);
          }
          return text;
        },
      },
    },
  }) as unknown as Plugin;
  return { ...plugin, apply: "build" };
}
