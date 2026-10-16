import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import appJson from "../../app.json?raw";
import indexHtml from "../../index.html?raw";
import readme from "../../README.md?raw";

/**
 * How the scan works. Every non-test `.ts` and `.tsx` file under `src/` is parsed with the
 * TypeScript compiler, and only the text a person can end up reading is checked: string
 * literals, template-literal text and JSX text. Comments, identifiers and imports are never
 * looked at, so a doc comment may still say "advanced mode". Test files (`*.test.*`), test
 * helpers (`test-*`, `test-support/`) and CSS are skipped.
 *
 * Two lists are checked (spec "Words"):
 *
 * - RETIRED: phrases and capitalised words the redesign dropped ("Copy link", "Advanced",
 *   "advanced mode", "Update plan", a "#" and a digit, ...).
 * - NOT_WORDS: the spec's "Not" column, as whole words, case-insensitively ("bits", "minis",
 *   "components", "filler", "lock", "keep", "placement", "bin", "part", "things", ...).
 *
 * Not copy, so never checked: a string that is one lowercase token (a type tag such as "minis" or
 * "part", a key, a path) and a string made only of hyphenated or dotted lowercase tokens (a
 * class list such as "tray-chip tray-chip--spare"). A hex colour (`#1D1F1C`), an HTML entity
 * (`&#8212;`) and a colour put together from its channels (`#${r}${g}${b}`) are not "#" and a
 * digit; `Plan #{n}`, `"Plan #" + n` and `Plan #${n}` are.
 *
 * ALLOWED is the allow-list of legitimate uses of a Not-word. Each entry is removed from the text
 * before the check, so the rest of the same string is still checked:
 *
 * - "Lock size", "Unlock size", "size locked", "size lock(s)": the size lock is a real control
 *   and its name (spec: only the position lock is a "pin").
 * - "Keep searching", "Keep space free", "Part of it": real labels (the box's headroom choice;
 *   named in DESIGN §2 Words).
 * - "data-part": an attribute name inside an SVG string, not text.
 * - "part"/"parts" is the download list's word, so it is allowed (PART_FILES) only in the three
 *   files that write the download list (ExportPanel.tsx), the reason it can be empty
 *   (app/exportBuild.ts) and the part names (instructions/naming.ts); spec: "part (except in the
 *   download list)". Nowhere else.
 */
const sources = new Map(
  Object.entries(
    import.meta.glob<string>("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
  ).map(([key, source]) => [new URL(key, "file:///src/ui/").pathname, source]),
);

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

/** True when the expression is text that ends with "#" (so a number follows it). */
function endsWithHash(node: ts.Expression): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return /(?<![(\w&])#$/.test(node.text);
  }
  if (ts.isParenthesizedExpression(node)) {
    return endsWithHash(node.expression);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return endsWithHash(node.right);
  }
  return false;
}

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
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      add(node, node.text);
    }
    if (ts.isTemplateExpression(node)) {
      // A number built into the text after a "#" ("#${n}") is a retired "#<digit>" too, unless the
      // template is only "#" and substitutions: a colour put together from its channels.
      const spans = node.templateSpans;
      const colour = spans.length >= 3 && spans.every((s) => s.literal.text === "");
      const before = [node.head.text, ...spans.slice(0, -1).map((s) => s.literal.text)];
      if (!colour && before.some((t) => /(?<![(\w&])#$/.test(t))) {
        add(node, "#0");
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      endsWithHash(node.left)
    ) {
      add(node, "#0"); // "Plan #" + n
    }
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const kids = node.children;
      kids.forEach((child, i) => {
        const next = kids[i + 1];
        if (
          ts.isJsxText(child) &&
          next !== undefined &&
          ts.isJsxExpression(next) &&
          /(?<![(\w&])#$/.test(child.text.trimEnd())
        ) {
          add(child, "#0"); // Tray #{n}
        }
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/** Strings that are identifiers, keys or class lists, not sentences. */
function isNotCopy(text: string): boolean {
  const t = text.trim();
  if (t === "") {
    return true;
  }
  if (/^\/[\w/-]*$/.test(t)) {
    return true; // a JSON pointer such as "/components/3"
  }
  if (/^[a-z][\w.:/#@$-]*$/.test(t)) {
    return true; // one lowercase token: "minis", "part", "tray-chip"
  }
  return t.split(/\s+/).every((tok) => /^[a-z][\w.:/#@$]*[-_.:\d][\w.:/#@$-]*$/.test(tok));
}

/** The words and phrases the redesign retired (spec "Words"), as the scan looks for them. */
const RETIRED: readonly { name: string; test: (text: string) => boolean }[] = [
  { name: "Copy link", test: (t) => /\bCopy link\b/i.test(t) },
  { name: "share link", test: (t) => /\bshare link\b/i.test(t) },
  // DESIGN §2 Claims: no slicer is named, and no compatibility is promised.
  {
    name: "a slicer claim",
    test: (t) => /\b(?:slicers?|works with|compatible with|opens in any)\b/i.test(t),
  },
  { name: "Simple", test: (t) => /\bSimple\b/.test(t) },
  { name: "Advanced", test: (t) => /\bAdvanced\b/.test(t) },
  { name: "advanced mode", test: (t) => /\badvanced mode\b/i.test(t) },
  { name: "simple mode", test: (t) => /\bsimple mode\b/i.test(t) },
  { name: "Find a better fit", test: (t) => /\bFind a better fit\b/i.test(t) },
  { name: "tighter layout", test: (t) => /\btighter layout\b/i.test(t) },
  { name: "Locking rim", test: (t) => /\bLocking rim\b/i.test(t) },
  { name: "loose dividers", test: (t) => /\bloose dividers\b/i.test(t) },
  { name: "loose plates", test: (t) => /\bloose plates\b/i.test(t) },
  { name: "Update plan", test: (t) => /\bUpdate (?:the )?plan\b/i.test(t) },
  { name: "Improve more", test: (t) => /\bImprove more\b/i.test(t) },
  { name: "Lock position", test: (t) => /\bLock position\b/i.test(t) },
  { name: "Exact values", test: (t) => /\bExact values\b/i.test(t) },
  {
    name: "# and a digit",
    test: (t) => [...t.matchAll(/(?<!&)#(?=\d)/g)].some((m) => !HEX_COLOUR.test(t.slice(m.index))),
  },
];

/**
 * The spec's "Not" column: words a person should not read (whole words, any case). "keep" is the
 * pin synonym, so "kept" (as in "Kept free on every side") is not looked for.
 */
const NOT_WORDS =
  /\b(?:parts?|bins?|fillers?|loose spacers?|locks?|locked|locking|unlock(?:ed)?|keeps?|keeping|placements?|let go|bits?|minis|components?|things?)\b/i;

/** Legitimate uses, removed from the text before NOT_WORDS looks at it. */
const ALLOWED =
  /\b(?:Lock size|Unlock size|size locked|size locks?|Keep searching|Keep space free|Part of it|data-part)\b/gi;

/** Files that write the download list, why a part could not be exported, and part names. */
const PART_FILES: readonly RegExp[] = [
  /\/ui\/ExportPanel\.tsx$/,
  /\/app\/exportBuild\.ts$/,
  /\/instructions\/naming\.ts$/,
];

function notWordsIn(path: string, text: string): string | null {
  const rest = text.replace(ALLOWED, " ");
  const partOk = PART_FILES.some((re) => re.test(path));
  for (const m of rest.matchAll(new RegExp(NOT_WORDS.source, "gi"))) {
    const word = m[0].toLowerCase();
    if ((word === "part" || word === "parts") && partOk) {
      continue;
    }
    if (
      (word === "bits" || word === "minis") &&
      /--(?:bits|minis)$/.test(rest.slice(0, m.index + word.length))
    ) {
      continue; // the --bits-* and --minis-* colour tokens
    }
    return m[0];
  }
  return null;
}

describe("copy", () => {
  it("scans the app's strings", () => {
    const files = [...sources.keys()].filter(isScanned);
    expect(files.length).toBeGreaterThan(100);
    const all = files.flatMap((f) => texts(f, sources.get(f) ?? ""));
    // A scan that read nothing would pass for the wrong reason.
    expect(all.length).toBeGreaterThan(1000);
    expect(all.some((t) => t.text.includes("Keep searching"))).toBe(true);
    // Comments are not read, and a colour is not a retired "#<digit>".
    expect(texts("x.ts", "// Advanced mode, #1.\nconst a = '#1D1F1C';").map((t) => t.text)).toEqual(
      ["#1D1F1C"],
    );
    const retired = (s: string) =>
      texts("x.tsx", s).some((t) => RETIRED.some((w) => w.test(t.text)));
    expect(retired("const a = 'Copy link';")).toBe(true);
    expect(retired("const a = 'Switch to Advanced Mode';")).toBe(true);
    expect(retired("const a = 'simple mode';")).toBe(true);
    expect(retired("const a = `Plan #${n}`;")).toBe(true);
    expect(retired("const a = 'Tray #3';")).toBe(true);
    expect(retired("const a = 'Tray #' + n;")).toBe(true);
    expect(retired("const a = 'Tray ' + '#' + (n + 1);")).toBe(true);
    expect(retired("const a = <p>Tray #{n}</p>;")).toBe(true);
    expect(retired("const a = <p>Tray #{n} of 3</p>;")).toBe(true);
    expect(retired("const a = '#333333';")).toBe(false);
    expect(retired("const a = `#${r}${g}${b}`;")).toBe(false);
    expect(retired("const a = <p>A&#39;s and &#8212; dash</p>;")).toBe(false);
    expect(retired("const a = <p>Plan {n}</p>;")).toBe(false);
    // The Not-words: whole words, any case, with the allow-list taken out first.
    const not = (s: string, path = "/src/x.tsx") => notWordsIn(path, s);
    expect(not("Add Bits")).toBe("Bits");
    expect(not("Lock this tray")).toBe("Lock");
    expect(not("a component")).toBe("component");
    expect(not("Lock size")).toBeNull();
    expect(not("Lock size and keep it")).toBe("keep");
    expect(not("Keep searching")).toBeNull();
    expect(not("Keep space free on top")).toBeNull();
    expect(not("Size locked")).toBeNull();
    expect(not("the filler piece")).toBe("filler");
    expect(not("Parts")).toBe("Parts");
    expect(not("Parts", "/src/ui/ExportPanel.tsx")).toBeNull();
    expect(not("minimum")).toBeNull();
    expect(isNotCopy("minis") && isNotCopy("tray-chip tray-chip--spare")).toBe(true);
    expect(isNotCopy("use a bin") || isNotCopy("Parts")).toBe(false);
  });

  it("uses no retired words", () => {
    const found: string[] = [];
    for (const path of [...sources.keys()].filter(isScanned)) {
      for (const { text, line } of texts(path, sources.get(path) ?? "")) {
        for (const word of RETIRED) {
          if (word.test(text)) {
            found.push(`${path}:${line} ${word.name}: ${JSON.stringify(text.slice(0, 80))}`);
          }
        }
        const not = isNotCopy(text) ? null : notWordsIn(path, text);
        if (not !== null) {
          found.push(`${path}:${line} Not-word "${not}": ${JSON.stringify(text.slice(0, 80))}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("keeps the README to the same words", () => {
    // The README says what the app does today: no mode switch, no numbered trays, no old controls.
    for (const old of [
      /\bAdvanced\b/,
      /\bSimple mode\b/i,
      /\bnumbered (?:tray|spare)/i,
      /\bLock position\b/,
      /<MoreOptions open=/,
      /\bCopy link\b/,
      /\bFind a better fit\b/i,
      /\bExact values\b/,
      /\bUpdate the plan\b/,
      /\bshare link\b/i,
      /\b(?:slicers?|works with|compatible with|opens in any)\b/i,
    ]) {
      expect(readme).not.toMatch(old);
    }
    expect(readme).toContain("Pin");
    expect(readme).toContain("Keep searching");
    // The Not-column words, in the prose only: a code span (`...`) and a heading naming a file
    // or code is not copy, and "part" belongs to the download list.
    const prose = readme
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(ALLOWED, " ")
      .replace(/\bpart(?:s)?\b/gi, (m, at: number, all: string) =>
        /download list|per part|part names?|part ids?/i.test(
          all.slice(Math.max(0, at - 60), at + 60).replace(/\s+/g, " "),
        )
          ? " "
          : m,
      );
    const hits = [...prose.matchAll(new RegExp(NOT_WORDS.source, "gi"))].map((m) => {
      const at = m.index ?? 0;
      return `${m[0]}: ${JSON.stringify(prose.slice(Math.max(0, at - 40), at + 40))}`;
    });
    expect(hits).toEqual([]);
  });

  it("keeps the page's own text to the same words", () => {
    // index.html (title, description, noscript) and app.json: what search results and the gallery show.
    for (const text of [indexHtml, appJson]) {
      const visible = text
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/\b(?:content|name|href|src|rel)="[^"]*"/g, (m) =>
          m.startsWith("content=") ? m : " ",
        );
      expect(visible.match(new RegExp(NOT_WORDS.source, "gi"))).toBeNull();
    }
  });
});
