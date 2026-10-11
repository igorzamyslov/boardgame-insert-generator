import { describe, expect, it } from "vitest";

// Every source file, as text, keyed by its absolute path under a fake root so
// that relative specifiers can be resolved with the URL class.
const ROOT = "file:///src/geometry/";
const sources = new Map(
  Object.entries(
    import.meta.glob<string>("../**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ).map(([key, source]) => [new URL(key, ROOT).pathname, source]),
);

// Static `import ... from "x"` / `export ... from "x"` specifiers of a file.
// The worker is reached through `new URL("./worker.ts", import.meta.url)`,
// which is not an import and so (correctly) stays out of the graph.
function specifiers(source: string): string[] {
  return [...source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gms)].flatMap(
    (m) => (m[1] === undefined ? [] : [m[1]]),
  );
}

function resolveLocal(from: string, specifier: string): string {
  const base = new URL(specifier, `file://${from}`).pathname;
  const found = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((c) => sources.has(c));
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
    for (const specifier of specifiers(sources.get(file) ?? "")) {
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
  const { files, packages } = importGraph("/src/geometry/client.ts");
  const reached = [...files];

  it("never reaches manifold-3d or any other package", () => {
    expect([...packages]).toEqual([]);
  });

  it("never reaches the geometry kernel or the worker", () => {
    for (const kernel of ["index", "tray", "load", "worker", "worker-core"]) {
      expect(reached).not.toContain(`/src/geometry/${kernel}.ts`);
    }
  });

  it("walks the graph for real (sanity check of this test)", () => {
    expect(reached).toContain("/src/geometry/client.ts");
    expect(reached).toContain("/src/geometry/types.ts");
    expect(specifiers(`import { a } from "manifold-3d";`)).toEqual(["manifold-3d"]);
  });
});
