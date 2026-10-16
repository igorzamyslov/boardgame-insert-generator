// src/rules.test.ts
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Tests for the hard rules in docs/DESIGN.md §2 that no feature test covers. Each one reads the
 * source (or the CSS) as text, so a change that breaks a rule fails here with the place named.
 */
const sources = new Map(
  Object.entries(
    import.meta.glob<string>("./**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
  ).map(([key, source]) => [key.replace(/^\./, "/src"), source]),
);

/** The non-test app files: not `*.test.*`, test helpers or declaration files. */
const appFiles = [...sources.keys()].filter(
  (p) =>
    !/\.test\.tsx?$/.test(p) &&
    !/\/test-[^/]*$/.test(p) &&
    !p.includes("/test-support/") &&
    !p.endsWith(".d.ts"),
);

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    sources.get(path) ?? "",
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

describe("rules", () => {
  it("reads the source", () => {
    expect(appFiles.length).toBeGreaterThan(100);
    expect(appFiles).toContain("/src/ui/StatusLine.tsx");
  });

  // DESIGN §2 Accessibility: a blocked action stays focusable (aria-disabled plus a reason).
  // `disabled` on a select's <option> is correct HTML (an option cannot be aria-disabled in a
  // way every browser honours) and is the one exception.
  it("puts no `disabled` attribute on a button, input, select, textarea or fieldset", () => {
    const FORM_TAGS = new Set(["button", "input", "select", "textarea", "fieldset"]);
    const found: string[] = [];
    for (const path of appFiles.filter((p) => p.endsWith(".tsx"))) {
      const file = parse(path);
      const visit = (node: ts.Node): void => {
        if (
          ts.isJsxAttribute(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === "disabled"
        ) {
          const tag = node.parent.parent;
          const name =
            ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag)
              ? tag.tagName.getText(file)
              : "";
          if (FORM_TAGS.has(name)) {
            const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
            found.push(`${path}:${line + 1} <${name} disabled>`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(found).toEqual([]);
  });
});
