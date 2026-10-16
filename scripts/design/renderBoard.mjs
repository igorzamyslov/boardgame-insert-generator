// scripts/design/renderBoard.mjs
// Renders a design board (docs/design/boards/*.dc.html) to a plain HTML document that a browser
// shows as the board's canvas did, with no support.js: the board's script runs once in a
// stand-in for the canvas runtime (DCLogic), and its template (<sc-if>, <sc-for>, {{path}}) is
// expanded here. Used by the board screenshots, the copy check and the tests.
import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import * as ts from "typescript";

const ROOT = `${resolvePath(dirname(fileURLToPath(import.meta.url)), "../..")}/`;
export const BOARDS_DIR = `${ROOT}docs/design/boards/`;

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

/** @font-face rules for the two families, pointing at the installed files by file:// URL. */
function fontCss() {
  const faces = [];
  const add = (family, pkg, slug, weight) => {
    for (const [subset, range] of [
      ["latin-ext", LATIN_EXT],
      ["latin", LATIN],
    ]) {
      const file = `${ROOT}node_modules/@fontsource/${pkg}/files/${slug}-${subset}-${weight}-normal.woff2`;
      faces.push(
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;` +
          `src:url(${pathToFileURL(file).href}) format('woff2');unicode-range:${range}}`,
      );
    }
  };
  for (const weight of [400, 500, 600, 700]) {
    add("Figtree", "figtree", "figtree", weight);
  }
  for (const weight of [500, 700]) {
    add("Bricolage Grotesque", "bricolage-grotesque", "bricolage-grotesque", weight);
  }
  return faces.join("\n");
}

function boardPath(file) {
  return `${BOARDS_DIR}${file}`;
}

function propsOf(document) {
  const script = document.querySelector("script[data-dc-script]");
  const raw = script?.getAttribute("data-props");
  return raw ? JSON.parse(raw) : {};
}

/** The size the board is drawn at, from its `$preview`. */
export function boardPreview(file) {
  const document = new JSDOM(readFileSync(boardPath(file), "utf8")).window.document;
  const preview = propsOf(document).$preview;
  return { width: preview.width, height: preview.height };
}

/** Resolves `a.b.c` in a chain of scopes (the innermost first). */
function resolve(path, scopes) {
  const [head, ...rest] = path.trim().split(".");
  let value;
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (head in scopes[i]) {
      value = scopes[i][head];
      break;
    }
  }
  for (const key of rest) {
    if (value === undefined || value === null) {
      return undefined;
    }
    value = value[key];
  }
  return value;
}

function print(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

const WHOLE = /^\s*\{\{([^}]*)\}\}\s*$/;

function interpolate(text, scopes) {
  return text.replace(/\{\{([^}]*)\}\}/g, (_, path) => print(resolve(path, scopes)));
}

/** The raw value of an attribute that is one `{{path}}`; the text otherwise. */
function rawValue(text, scopes) {
  const whole = WHOLE.exec(text);
  return whole ? resolve(whole[1], scopes) : interpolate(text, scopes);
}

function expandChildren(parent, scopes) {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === 3) {
      child.data = interpolate(child.data, scopes);
      continue;
    }
    if (child.nodeType !== 1) {
      continue;
    }
    const tag = child.localName;
    if (tag === "sc-if") {
      const keep = Boolean(rawValue(child.getAttribute("value") ?? "", scopes));
      if (keep) {
        expandChildren(child, scopes);
        child.replaceWith(...child.childNodes);
      } else {
        child.remove();
      }
    } else if (tag === "sc-for") {
      const list = rawValue(child.getAttribute("list") ?? "", scopes);
      const name = child.getAttribute("as") ?? "item";
      const out = parent.ownerDocument.createDocumentFragment();
      for (const item of Array.isArray(list) ? list : []) {
        const copy = parent.ownerDocument.createDocumentFragment();
        for (const node of child.childNodes) {
          copy.append(node.cloneNode(true));
        }
        expandChildren(copy, [...scopes, { [name]: item }]);
        out.append(copy);
      }
      child.replaceWith(out);
    } else {
      for (const attr of [...child.attributes]) {
        if (/^on[a-z]/i.test(attr.name) || attr.name.startsWith("hint-")) {
          child.removeAttribute(attr.name);
        } else if (attr.value.includes("{{")) {
          child.setAttribute(attr.name, interpolate(attr.value, scopes));
        }
      }
      expandChildren(child, scopes);
    }
  }
}

/**
 * The board as a full HTML document. `opts.props` overlays the defaults of the board's
 * `data-props`; `opts.state` is the board's `this.state` (null by default, as at first paint).
 */
export async function renderBoard(file, opts = {}) {
  const window = new JSDOM(readFileSync(boardPath(file), "utf8")).window;
  const document = window.document;
  const declared = propsOf(document);
  const props = {};
  for (const [key, spec] of Object.entries(declared)) {
    if (key !== "$preview") {
      props[key] = spec.default;
    }
  }
  Object.assign(props, opts.props ?? {});
  const state = opts.state ?? null;

  for (const script of document.querySelectorAll("script[src]")) {
    script.remove();
  }
  const head = document.head;
  // Before the board's own styles, so any of its rules wins: a board link that sets no colour
  // (MobileWorkspace's rows) must not turn browser blue, as no board means it to.
  const reset = document.createElement("style");
  reset.textContent = "a{color:inherit}";
  head.append(reset);
  const helmet = document.querySelector("helmet");
  for (const node of [...(helmet?.childNodes ?? [])]) {
    if (
      node.localName === "link" &&
      /fonts\.googleapis\.com/.test(node.getAttribute("href") ?? "")
    ) {
      continue;
    }
    head.append(node);
  }
  helmet?.remove();
  const fonts = document.createElement("style");
  fonts.textContent = `${fontCss()}\nx-dc{display:block}`;
  head.append(fonts);
  const base = document.createElement("base");
  base.setAttribute("href", pathToFileURL(BOARDS_DIR).href);
  head.prepend(base);

  const scriptEl = document.querySelector("script[data-dc-script]");
  const source = scriptEl?.textContent ?? "";
  scriptEl?.remove();
  const noop = () => undefined;
  const context = vm.createContext({
    DCLogic: class DCLogic {
      constructor() {
        this.props = props;
        this.state = state;
      }
      setState(patch) {
        this.state = { ...this.state, ...patch };
      }
    },
    setTimeout: noop,
    clearTimeout: noop,
    setInterval: noop,
    clearInterval: noop,
  });
  const Component = vm.runInContext(`${source};Component`, context, { filename: file });
  const vals = new Component().renderVals();

  const root = document.querySelector("x-dc");
  if (root) {
    expandChildren(root, [vals]);
  }
  const html = `<!doctype html>\n${document.documentElement.outerHTML}`;
  window.close();
  return html;
}

/**
 * The fixed text of a board, read from its source: `markup` is every text node of the raw
 * `<x-dc>` template (not its style or script) with no `{{` in it, `strings` is every string
 * literal of the board script that has no `${` in it (a template with substitutions is built at
 * run time, so it is not fixed text). Both as written: callers trim and collapse.
 */
export function boardTexts(file) {
  const window = new JSDOM(readFileSync(boardPath(file), "utf8")).window;
  const document = window.document;
  const markup = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        if (!child.data.includes("{{")) {
          markup.push(child.data);
        }
      } else if (child.nodeType === 1 && !["style", "script"].includes(child.localName)) {
        walk(child);
      }
    }
  };
  const root = document.querySelector("x-dc");
  if (root) {
    walk(root);
  }
  const source = document.querySelector("script[data-dc-script]")?.textContent ?? "";
  const strings = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      strings.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true));
  window.close();
  return { markup, strings };
}
