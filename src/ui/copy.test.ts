import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * How the scan works. Every non-test `.ts` and `.tsx` file under `src/` is parsed with the
 * TypeScript compiler, and only the text a person can end up reading is checked: string
 * literals, template-literal text and JSX text. Comments, identifiers and imports are never
 * looked at, so a doc comment may still say "advanced mode". Test files (`*.test.*`), test
 * helpers (`test-*`, `test-support/`) and CSS are skipped. Strings that are not copy (a class
 * name, a type tag such as "minis", a colour) are harmless unless they contain a retired
 * phrase; the patterns below are phrases and capitalised words, and a hex colour such as
 * `#1D1F1C` is not read as "#" and a digit.
 */
const sources = import.meta.glob<string>("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

function isScanned(path: string): boolean {
  return (
    !/\.test\.tsx?$/.test(path) &&
    !/\/test-[^/]*$/.test(path) &&
    !path.includes("/test-support/") &&
    !path.endsWith(".d.ts")
  );
}

/** A colour: "#" and 3, 4, 6 or 8 hex digits. It begins with a digit about as often as not. */
const HEX_COLOUR =
  /^#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9A-Za-z])/;

/** Every piece of text in a source file that can reach a screen, with its line. */
function texts(path: string, source: string): { text: string; line: number }[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { text: string; line: number }[] = [];
  const add = (node: ts.Node, text: string): void => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    out.push({ text, line: line + 1 });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      return; // module paths are not copy
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      add(node, node.text);
    } else if (ts.isJsxText(node)) {
      add(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      // A number built into the text after a "#" ("#${n}") is a retired "#<digit>" too, unless the
      // template is only "#" and substitutions: a colour put together from its channels.
      const spans = node.templateSpans;
      const colour = spans.length >= 3 && spans.every((s) => s.literal.text === "");
      if (/(?<![(\w&])#$/.test(node.head.text) && !colour) {
        add(node, "#0");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/** The words and phrases the redesign retired (spec "Words"), as the scan looks for them. */
const RETIRED: readonly { name: string; test: (text: string) => boolean }[] = [
  { name: "Copy link", test: (t) => /\bCopy link\b/i.test(t) },
  { name: "Simple", test: (t) => /\bSimple\b/.test(t) },
  { name: "Advanced", test: (t) => /\bAdvanced\b/.test(t) },
  { name: "Find a better fit", test: (t) => /\bFind a better fit\b/i.test(t) },
  { name: "tighter layout", test: (t) => /\btighter layout\b/i.test(t) },
  { name: "Locking rim", test: (t) => /\bLocking rim\b/i.test(t) },
  { name: "loose dividers", test: (t) => /\bloose dividers\b/i.test(t) },
  { name: "Update plan", test: (t) => /\bUpdate plan\b/i.test(t) },
  { name: "Improve more", test: (t) => /\bImprove more\b/i.test(t) },
  { name: "loose plates", test: (t) => /\bloose plates\b/i.test(t) },
  { name: "bit(s)", test: (t) => /(?<!-)\bbits?\b/i.test(t) /* not the --bits-* colour tokens */ },
  { name: "Lock position", test: (t) => /\bLock position\b/i.test(t) },
  {
    name: "# and a digit",
    test: (t) => [...t.matchAll(/#(?=\d)/g)].some((m) => !HEX_COLOUR.test(t.slice(m.index))),
  },
];

describe("copy", () => {
  it("scans the app's strings", () => {
    const files = Object.keys(sources).filter(isScanned);
    expect(files.length).toBeGreaterThan(100);
    const all = files.flatMap((f) => texts(f, sources[f] ?? ""));
    // A scan that read nothing would pass for the wrong reason.
    expect(all.length).toBeGreaterThan(1000);
    expect(all.some((t) => t.text.includes("Keep searching"))).toBe(true);
    // Comments are not read, and a colour is not a retired "#<digit>".
    expect(texts("x.ts", "// Advanced mode, #1.\nconst a = '#1D1F1C';").map((t) => t.text)).toEqual(
      ["#1D1F1C"],
    );
    const hit = (s: string) =>
      texts("x.ts", `const a = ${s};`).some((t) => RETIRED.some((w) => w.test(t.text)));
    expect(hit("'Copy link'")).toBe(true);
    expect(hit("`Plan #${n}`")).toBe(true);
    expect(hit("'Tray #3'")).toBe(true);
    expect(hit("'#333333'")).toBe(false);
  });

  it("uses no retired words", () => {
    const found: string[] = [];
    for (const path of Object.keys(sources).filter(isScanned)) {
      for (const { text, line } of texts(path, sources[path] ?? "")) {
        for (const word of RETIRED) {
          if (word.test(text)) {
            found.push(`${path}:${line} ${word.name}: ${JSON.stringify(text.slice(0, 80))}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
