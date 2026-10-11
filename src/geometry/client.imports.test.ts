// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

// Static `import ... from "x"` / `export ... from "x"` specifiers of a file.
// The worker is reached through `new URL("./worker.ts", import.meta.url)`,
// which is not an import and so (correctly) stays out of the graph.
function specifiers(source: string): string[] {
  return [...source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gms)].flatMap(
    (m) => (m[1] === undefined ? [] : [m[1]]),
  );
}

function resolveLocal(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier);
  const found = [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")].find((c) => existsSync(c));
  if (found === undefined) {
    throw new Error(`Cannot resolve ${specifier} from ${from}`);
  }
  return found;
}

// Walks every module reachable from `entry` through static imports. Local
// modules are followed; package imports are collected, not followed.
function importGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (files.has(file)) {
      continue;
    }
    files.add(file);
    for (const specifier of specifiers(readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".")) {
        queue.push(resolveLocal(file, specifier));
      } else {
        packages.add(specifier);
      }
    }
  }
  return { files, packages };
}

describe("client.ts import graph (roadmap 4.6)", () => {
  const { files, packages } = importGraph(resolve(here, "client.ts"));
  const reached = [...files].map((f) => f.slice(here.length + 1));

  it("never reaches manifold-3d or any other package", () => {
    expect([...packages]).toEqual([]);
  });

  it("never reaches the geometry kernel or the worker", () => {
    for (const kernel of ["index.ts", "tray.ts", "load.ts", "worker.ts", "worker-core.ts"]) {
      expect(reached).not.toContain(kernel);
    }
  });

  it("walks the graph for real (sanity check of this test)", () => {
    expect(reached).toContain("client.ts");
    expect(specifiers(`import { a } from "manifold-3d";`)).toEqual(["manifold-3d"]);
  });
});
