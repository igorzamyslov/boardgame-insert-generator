// src/test-support/boardCopy.ts
// The copy check: what a board says, what the app shows, and what is left over. Test-only.
import { boardTexts } from "../../scripts/design/renderBoard.mjs";
import type { BoardOptions } from "../../scripts/design/renderBoard.mjs";
import { COPY_DENIED } from "../screens/copy-rulings";
import type { CopyRuling } from "../screens/copy-rulings";

export interface Allowed {
  /** A board's fixed text (`boardLiterals`). A digit run in one matches any number. */
  literals: Set<string>;
  /** Strings ruled in DESIGN §7; `{…}` in one matches any text. */
  rulings: readonly CopyRuling[];
  /** The user's own words: component, deck, item and project names, and the like. */
  data: Set<string>;
  /** Strings the engine writes (notices, tray names). */
  engine: Set<string>;
}

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * The fixed text of a board: its template's text nodes with no `{{`, and the string literals of
 * its script that contain a letter, trimmed and with whitespace collapsed; minus every string the
 * app does not print (COPY_DENIED) and every literal that contains one. `opts` is the same as
 * `renderBoard`'s and does not change the answer: every variant draws from the same source.
 */
export function boardLiterals(file: string, opts: BoardOptions = {}): Promise<Set<string>> {
  void opts;
  const { markup, strings } = boardTexts(file);
  const out = new Set<string>();
  for (const raw of [...markup, ...strings.filter((s) => /\p{L}/u.test(s))]) {
    const text = collapse(raw);
    if (text !== "" && !COPY_DENIED.some((denied) => text.includes(denied))) {
      out.add(text);
    }
  }
  return Promise.resolve(out);
}

const HIDDEN = '[aria-hidden="true"], .visually-hidden, [hidden], style, script';

/** The text a person can read under `root`: no hidden subtrees; trimmed, collapsed, no blanks. */
export function visibleStrings(root: Element): string[] {
  const out: string[] = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const text = collapse(child.textContent ?? "");
        if (text !== "") {
          out.push(text);
        }
      } else if (child.nodeType === 1 && !(child as Element).matches(HIDDEN)) {
        walk(child);
      }
    }
  };
  walk(root);
  return out;
}

const NUMBER = "\\d+(?:\\.\\d+)?";
const MEASURE = /^\d+(\.\d+)?( × \d+(\.\d+)?)*( mm| g| h| min| %)?$/;
const ESTIMATE = /^about \d+(\.\d+)? (g|h|min)(, \d+(\.\d+)? (g|h|min))?$/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A literal as a pattern: every digit run matches any number. */
function literalPattern(literal: string): RegExp {
  const source = literal
    .split(/(\d+(?:\.\d+)?)/)
    .map((part, i) => (i % 2 === 1 ? NUMBER : escapeRegExp(part)))
    .join("");
  return new RegExp(`^${source}$`);
}

/** A ruling as a pattern: `{…}` matches any text. */
function rulingPattern(text: string): RegExp {
  const source = text
    .split(/(\{[^}]*\})/)
    .map((part, i) => (i % 2 === 1 ? ".+" : escapeRegExp(part)))
    .join("");
  return new RegExp(`^${source}$`);
}

const literalPatterns = new WeakMap<Set<string>, RegExp[]>();

function patternsOf(literals: Set<string>): RegExp[] {
  let patterns = literalPatterns.get(literals);
  if (patterns === undefined || patterns.length !== literals.size) {
    patterns = [...literals].map(literalPattern);
    literalPatterns.set(literals, patterns);
  }
  return patterns;
}

/**
 * The strings that no source allows. A string is split on " · " and each part must be a
 * literal (digits match any number), a ruled template, a data or engine string, a measure
 * ("285 × 285 × 70 mm", "1.6") or an estimate ("about 3.5 h, 58 g").
 */
export function unruled(strings: string[], allowed: Allowed): string[] {
  const literalRes = patternsOf(allowed.literals);
  const rulingRes = allowed.rulings.map((r) => rulingPattern(r.text));
  const ok = (part: string): boolean =>
    allowed.literals.has(part) ||
    literalRes.some((re) => re.test(part)) ||
    rulingRes.some((re) => re.test(part)) ||
    allowed.data.has(part) ||
    allowed.engine.has(part) ||
    MEASURE.test(part) ||
    ESTIMATE.test(part);
  return strings.filter((text) => !text.split(" · ").every(ok));
}
