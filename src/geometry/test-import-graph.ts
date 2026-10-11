// Static analysis of a module's import graph, for tests that guard what a
// bundle may pull in. Works on source text, keyed by absolute path.

// The module specifiers a source file imports or re-exports: `import x from`,
// multi-line `import { .. } from`, `export * from`, `export { .. } from`,
// side-effect `import "x"` and dynamic `import("x")`. A dynamic import whose
// argument is not a string literal is reported as NON_LITERAL_IMPORT, as it
// could name anything.
export const NON_LITERAL_IMPORT = "<non-literal dynamic import>";

export function specifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const found = [
    ...code.matchAll(/\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g),
    ...code.matchAll(/\bimport\s*["']([^"']+)["']/g),
    ...code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
  if (/\bimport\s*\(\s*(?!["'])/.test(code)) {
    found.push(NON_LITERAL_IMPORT);
  }
  return found;
}

function resolveLocal(sources: ReadonlyMap<string, string>, from: string, specifier: string) {
  const base = new URL(specifier, `file://${from}`).pathname;
  const found = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) =>
    sources.has(candidate),
  );
  if (found === undefined) {
    throw new Error(`Cannot resolve ${specifier} from ${from}`);
  }
  return found;
}

// Every module reachable from `entry` through imports, and every package (or
// other non-relative specifier) those modules import. Relative imports are
// followed; packages are collected, not followed.
export function importGraph(
  entry: string,
  sources: ReadonlyMap<string, string>,
): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (files.has(file)) {
      continue;
    }
    files.add(file);
    const source = sources.get(file);
    if (source === undefined) {
      throw new Error(`No source for ${file}`);
    }
    for (const specifier of specifiers(source)) {
      if (specifier.startsWith(".")) {
        queue.push(resolveLocal(sources, file, specifier));
      } else {
        packages.add(specifier);
      }
    }
  }
  return { files, packages };
}
