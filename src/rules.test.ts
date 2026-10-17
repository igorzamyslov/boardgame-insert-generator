// src/rules.test.ts
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import { SUPPORT_LINKS } from "./ui/ExportPanel";

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
    expect(appFiles).toContain("/src/screens/StageTop.tsx");
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

  // DESIGN §2 Flow: one Download entry point, the header's. Nothing else opens the dialog.
  it("opens the Download dialog from one place only", () => {
    const at = (pattern: RegExp): string[] =>
      appFiles.flatMap((path) =>
        Array.from((sources.get(path) ?? "").matchAll(pattern), () => path),
      );
    const opens = at(/\bsetExportOpen\(\s*true\s*\)/g);
    const panels = at(/<ExportPanel\b/g);
    expect(opens).toEqual(["/src/app/App.tsx"]);
    expect(panels).toEqual(["/src/app/App.tsx"]);
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
    expect(uses).toBeLessThanOrEqual(32);
  });

  // DESIGN §2 Colour: every colour comes from a token. Hex lives in tokens.css; the print rules of
  // the packing guide are the exemption (paper is black on white whatever the screen uses).
  it("writes no raw hex colour in component CSS, outside tokens.css and print rules", () => {
    const found: string[] = [];
    for (const [path, css] of Object.entries(styles)) {
      if (path.endsWith("/tokens.css")) {
        continue;
      }
      let source = css.replace(/\/\*[\s\S]*?\*\//g, "");
      for (;;) {
        const at = source.indexOf("@media print");
        if (at === -1) {
          break;
        }
        let depth = 0;
        let end = source.indexOf("{", at);
        for (; end < source.length; end += 1) {
          depth += source[end] === "{" ? 1 : source[end] === "}" ? -1 : 0;
          if (depth === 0) {
            break;
          }
        }
        source = source.slice(0, at) + source.slice(end + 1);
      }
      for (const m of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        found.push(`${path}: ${m[0]}`);
      }
    }
    expect(found).toEqual([]);
  });

  // DESIGN §2 Hosting: the app makes no request to another host. Fonts, scripts, WASM and workers
  // are bundled; Ko-fi and PayPal are links a person clicks, not requests; the XML namespaces of
  // exported files are names, not addresses to fetch.
  describe("makes no runtime request to another host", () => {
    const NETWORK_CALLS =
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/;
    const NAMESPACE_HOSTS = ["www.w3.org", "schemas.openxmlformats.org", "schemas.microsoft.com"];

    /** Every string, template and JSX text in a file: what can end up as an address. */
    function literals(path: string): string[] {
      const file = parse(path);
      const out: string[] = [];
      const visit = (node: ts.Node): void => {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node) ||
          ts.isJsxText(node)
        ) {
          out.push(node.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      return out;
    }

    it("calls no network API", () => {
      const found: string[] = [];
      for (const path of appFiles) {
        const file = parse(path);
        const visit = (node: ts.Node): void => {
          // a call or a `new`, by name: `fetch(…)`, `new WebSocket(…)`, `navigator.sendBeacon(…)`
          if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
            if (NETWORK_CALLS.test(node.expression.getText(file))) {
              const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
              found.push(`${path}:${line + 1} ${node.expression.getText(file)}`);
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(file);
      }
      expect(found).toEqual([]);
    });

    it("writes an absolute URL only for the support links and XML namespaces", () => {
      const allowed = new Set([
        ...NAMESPACE_HOSTS,
        ...SUPPORT_LINKS.map((l) => new URL(l.href).host),
      ]);
      expect(allowed).toContain("ko-fi.com");
      expect(allowed).toContain("paypal.me");
      const found: string[] = [];
      for (const path of appFiles) {
        for (const text of literals(path)) {
          for (const m of text.matchAll(/\bhttps?:\/\/([^/\s"'<>)]+)/gi)) {
            if (!allowed.has((m[1] ?? "").toLowerCase())) {
              found.push(`${path}: ${m[0]}`);
            }
          }
        }
      }
      expect(found).toEqual([]);
    });

    it("loads nothing from another host in the page itself", () => {
      const refs = [...indexHtml.matchAll(/\s(?:src|href|action)="([^"]*)"/g)].map(
        (m) => m[1] ?? "",
      );
      expect(refs.length).toBeGreaterThan(0);
      expect(refs.filter((r) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(r))).toEqual([]);
    });
  });
});
