// src/rules.test.ts
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const styles = import.meta.glob<string>("./**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

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

  // DESIGN §2 Accessibility: icons are inline SVG or drawn shapes, never text characters. CSS may
  // only generate empty boxes (`content: ""`) or read an attribute (`attr(data-label)`).
  it("generates no text character in CSS to stand for an icon", () => {
    const found: string[] = [];
    for (const [path, css] of Object.entries(styles)) {
      for (const m of css.matchAll(/(?<![\w-])content:\s*([^;}]+)/g)) {
        const value = (m[1] ?? "").trim();
        if (value !== '""' && value !== "none" && !value.startsWith("attr(")) {
          found.push(`${path}: content: ${value}`);
        }
      }
    }
    expect(Object.keys(styles).length).toBeGreaterThan(5);
    expect(found).toEqual([]);
  });

  // DESIGN §2 Colour: new code uses the primary token names. The legacy aliases at the end of
  // tokens.css still have old users; this ratchet only lets their number go down.
  it("does not add uses of the legacy alias tokens", () => {
    const LEGACY =
      /var\(--(?:paper|sheet-sunken|rule-strong|ink-soft|indigo|on-indigo|indigo-wash|madder|on-madder|madder-wash|ochre|on-ochre|ochre-wash|tint-8)\)/g;
    let uses = 0;
    for (const css of Object.values(styles)) {
      uses += css.match(LEGACY)?.length ?? 0;
    }
    expect(uses).toBeLessThanOrEqual(70);
  });
});
