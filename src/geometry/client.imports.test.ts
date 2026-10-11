import { describe, expect, it } from "vitest";
import { NON_LITERAL_IMPORT, importGraph, specifiers } from "./test-import-graph";

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

// What main-thread code may reach (roadmap 4.6): the worker client, the
// geometry types and version, and the model they are written in terms of.
function allowed(path: string): boolean {
  return (
    ["/src/geometry/client.ts", "/src/geometry/types.ts", "/src/geometry/version.ts"].includes(
      path,
    ) || path.startsWith("/src/model/")
  );
}

describe("client.ts import graph (roadmap 4.6)", () => {
  const { files, packages } = importGraph("/src/geometry/client.ts", sources);

  it("reaches no package, so no manifold-3d", () => {
    expect([...packages]).toEqual([]);
  });

  it("stays inside the modules the main thread may use", () => {
    expect([...files].filter((path) => !allowed(path))).toEqual([]);
  });

  it("reaches the geometry types, so the walk is real", () => {
    expect([...files]).toContain("/src/geometry/types.ts");
  });
});

describe("specifiers", () => {
  it("finds every way of importing a module", () => {
    const source = `
      import a from "./default";
      import { b } from "./named";
      import type { T } from "./type-only";
      import {
        c,
        d,
      } from "./multiline";
      import "./side-effect";
      export * from "./star";
      export { e } from "./reexport";
      const lazy = import("./dynamic");
      import * as ns from 'pkg';
    `;
    expect(specifiers(source)).toEqual([
      "./default",
      "./named",
      "./type-only",
      "./multiline",
      "./star",
      "./reexport",
      "pkg",
      "./side-effect",
      "./dynamic",
    ]);
  });

  it("reports a dynamic import it cannot read", () => {
    expect(specifiers("const name = 'x'; import(name);")).toEqual([NON_LITERAL_IMPORT]);
    expect(specifiers("import(`./${name}`);")).toEqual([NON_LITERAL_IMPORT]);
  });

  it("ignores imports in comments and exports without a source", () => {
    const source = `
      // import { x } from "./line-comment";
      /* import { y } from "./block-comment"; */
      export const z = 1;
      export { z as w };
    `;
    expect(specifiers(source)).toEqual([]);
  });
});

describe("importGraph", () => {
  const fixture = new Map([
    ["/src/a.ts", `import { b } from "./b";\nimport "pkg-side-effect";\nexport const a = b;`],
    ["/src/b.ts", `export * from "./sub/c";\nconst x = import("./d");\nexport const b = x;`],
    [
      "/src/sub/c.ts",
      `import { a } from "../a";\nimport lib from "lib";\nexport const c = [a, lib];`,
    ],
    ["/src/d.ts", `import type { Thing } from "types-pkg";\nexport type D = Thing;`],
    ["/src/unreached.ts", `import "never";`],
  ]);

  it("follows static, re-exported and dynamic imports, cycles included", () => {
    const { files, packages } = importGraph("/src/a.ts", fixture);
    expect([...files].sort()).toEqual(["/src/a.ts", "/src/b.ts", "/src/d.ts", "/src/sub/c.ts"]);
    expect([...packages].sort()).toEqual(["lib", "pkg-side-effect", "types-pkg"]);
  });

  it("resolves directory imports to their index", () => {
    const graph = new Map([
      ["/src/a.ts", `import { x } from "./dir";`],
      ["/src/dir/index.ts", "export const x = 1;"],
    ]);
    expect([...importGraph("/src/a.ts", graph).files].sort()).toEqual([
      "/src/a.ts",
      "/src/dir/index.ts",
    ]);
  });

  it("collects a non-literal dynamic import as a package-like specifier", () => {
    const graph = new Map([["/src/a.ts", "import(name);"]]);
    expect([...importGraph("/src/a.ts", graph).packages]).toEqual([NON_LITERAL_IMPORT]);
  });

  it("fails loudly on an import it cannot resolve", () => {
    const graph = new Map([["/src/a.ts", `import "./missing";`]]);
    expect(() => importGraph("/src/a.ts", graph)).toThrow(/Cannot resolve \.\/missing/);
  });
});
