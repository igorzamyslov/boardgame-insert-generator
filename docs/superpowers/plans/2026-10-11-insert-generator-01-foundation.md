# Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold `apps/insert-generator` and build its pure foundation: the shared model types, settings and presets, field validation, schema versioning (load, migrate, preserve), input hashing, the URL-hash codec, the local project store and JSON file I/O, plus synthetic fixtures that later plans reuse.

**Architecture:** A Vite + TypeScript + Preact app whose `build` runs `vitest run && tsc --noEmit && tsc --noEmit -p tsconfig.node.json && vite build`, so CI runs the tests. Everything in this plan is a pure module with plain-data interfaces: `model/` (types from roadmap §4.1 and the helpers of §4.5) and `share/` (link codec, storage, files). Untrusted JSON (links, files, localStorage) goes through one reader (`model/schema-read.ts`) behind one version gate (`model/schema.ts`), then `validateProject()` decides what blocks loading. The UI is only a placeholder shell; plan 5 replaces it.

**Tech Stack:** Node 22, Vite 6, TypeScript 6 (strict), Preact 10, Vitest 5 (+ jsdom per file, fast-check for property tests), fflate (deflate + zip), root ESLint/Prettier/Stylelint/html-validate.

**Spec:** `docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md` (§3–§5, §8.4, §9–§11) and the roadmap `docs/superpowers/plans/2026-10-11-insert-generator-00-roadmap.md` (§1–§5; §4 contracts are binding).

## Global Constraints

- App lives in ``. Built app: `package.json`, `npm run build` outputs `dist/`, `vite.config.ts` sets `base: "./"`, `app.json` has `{ title, description }`.
- Node 22 (`.nvmrc`). Dependency versions (exact ranges): `vite ^6.4.0`, `vitest ^5.0.3`, `typescript ^6.0.3`, `preact ^10.29.8`, `@preact/signals ^2.11.3`, `@preact/preset-vite ^2.10.6`, `manifold-3d ^3.5.4` (single-threaded build only), `three ^0.186.1`, `@types/three ^0.186.0`, `fflate ^0.8.3`, `fast-check ^4.10.2`, `jsdom ^30.1.2`, `@testing-library/preact ^3.2.4`, `rollup-plugin-license ^3.7.1`, `@types/node ^22.0.0` (type-only, for `tsconfig.node.json`). No copyleft dependencies.
- TypeScript strictness from `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` → use `import type`). App `tsconfig.json` (covers `src/`, no Node types): `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`. `tsconfig.node.json` covers the Node-side config files (`vite.config.ts`, later `licenses.config.ts`) with `"types": ["node"]`.
- Lint: root `eslint.config.mjs` (non-type-checked `strict` + `stylistic`, `curly: all`, `eqeqeq`, `prefer-template`, `no-param-reassign`, `no-console` except warn/error). Prettier: `printWidth` 100 from `.prettierrc.json`. Stylelint for CSS. html-validate for `index.html`.
- The app's `build` script: `vitest run && tsc --noEmit && tsc --noEmit -p tsconfig.node.json && vite build` (plan 5 appends `&& node scripts/smoke-dist.mjs dist`); `npm run typecheck` runs both `tsc` checks. Tests run in CI via `npm run build:all`.
- `Math.random` is banned in `src/layout/**` (root ESLint rule, this plan).
- All lengths are millimetres. Inside `layout/`, lengths are integer 0.01 mm units (plan 4); `TraySpec` stores mm rounded to 0.01.
- Versions start at app `0.1.0`, `SCHEMA_VERSION = "0.1.0"`, `GEOMETRY_VERSION = "0.1.0"`. Pre-1.0 makes no compatibility promise (spec §9).
- Never use `localStorage` without `try/catch`. No network calls at runtime.
- Commits: plain imperative messages (e.g. `Add card sizing`). **No `Co-Authored-By` or any trailer.** Commit after every task.
- Run tests and repo checks from the repo root: `npx vitest run <path>`, `npm run lint`, `npm run format:check`, `npm run verify`.
- No non-null assertions (`!`), no `any`, `curly` on every `if`, `===` only, template literals instead of `+` on strings, no `delete obj[computed]`, `interface` instead of object `type` aliases (typescript-eslint `stylistic`).

## Review Focus

1. **A shared link damaged in transit**: cut off by a chat app, wrapped with line breaks by a mail client, or followed by `).` swallowed from the sentence. Wrapped and punctuated links must still open; a truncated one must fail with "incomplete or damaged … ask for the link again", never crash or half-load. Tests: Task 10 ("decodeHash: links damaged on the way").
2. **Browser storage full or blocked** (QuotaExceededError on autosave; Safari private mode or blocked site data). A failed save throws `StoreWriteError` and leaves the previous save and the list intact; blocked storage gives `available: false` and every call is a safe no-op. Tests: Task 11 ("when storage is full", "without usable storage").
3. **A file or link from a newer app minor** with an unknown component kind, an unknown enum value inside a known component, an unknown box/settings value, a lock of an unknown kind, unknown fields, or an unknown tray feature. It must load with a warning, keep the unknown parts, and write them back at their original positions on save, unless the user has since changed that field. Tests: Task 8 ("files from a newer minor") and Task 9 ("same line, newer minor", "toSerializable").
4. **Numbers typed the European or American way**: "63,5", " 63.5 ", "1.000,5", "1,000.5", "−2", "63,5 mm". Unambiguous ones parse; ambiguous ones return `null` so the field shows an error instead of silently storing 1 or 1000. Tests: Task 4.
5. **A project with 0 components, or a half-edited autosave** (a deck count of 0 while typing). A new empty project validates clean and round-trips through links, files and storage; a field-level problem never makes a saved project unloadable. Only upper bounds and corrupt structure block loading. Tests: Task 6 ("accepts a new project with no components"), Task 9 ("still loads field-level problems"), Task 10 ("round-trips a project with no components").

---

## File map

| Path (under ``)                                                                                                                     | Responsibility                                                                   | Task  |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----- |
| `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `app.json`, `README.md` | Built-app scaffold                                                               | 1     |
| `src/env.d.ts`, `src/main.tsx`, `src/style.css`, `src/app/App.tsx`                                                                  | Placeholder shell with preview banner and version footer (plan 5 replaces `App`) | 1     |
| `src/model/version.ts`                                                                                                              | `SCHEMA_VERSION`, `APP_VERSION`, `parseSemver`, `isPreview`                      | 1     |
| `src/model/types.ts`                                                                                                                | Roadmap §4.1 contract, verbatim                                                  | 3     |
| `src/model/presets.ts`                                                                                                              | Card sizes, sleeves, bed presets                                                 | 3     |
| `src/model/settings.ts`                                                                                                             | `DEFAULT_SETTINGS`, simple-mode choices, `effective()`, `topPlane()`             | 3     |
| `src/model/numbers.ts`, `src/model/ids.ts`                                                                                          | `parseNumber()` (decimal comma/point), `newId()`                                 | 4     |
| `src/model/defaults.ts`                                                                                                             | `newProject()`, `newComponent()`, default box/printer                            | 5     |
| `src/model/validate.ts`                                                                                                             | `BOUNDS`, `validateProject()`, `isBlocking()`                                    | 6     |
| `src/model/hash.ts`                                                                                                                 | `inputsHash()` (canonical JSON, names excluded, cyrb53)                          | 7     |
| `src/model/schema-read.ts`                                                                                                          | Typed reader for untrusted JSON of a supported schema line                       | 8     |
| `src/model/schema.ts`                                                                                                               | Version gate, migrations, `parseProject()`, `serializeProject()`                 | 9     |
| `src/share/base64url.ts`, `src/share/link.ts`                                                                                       | `#1.` link codec with 1 MB inflate cap                                           | 10    |
| `src/share/store.ts`                                                                                                                | localStorage project list                                                        | 11    |
| `src/share/file.ts`, `src/share/index.ts`                                                                                           | JSON file export/import, public `share/` surface                                 | 12    |
| `src/test-support/sample.ts`, `src/test-support/memory-storage.ts`                                                                  | Test-only helpers (never imported by app code)                                   | 8, 11 |
| `test/fixtures/*.json`, `test/fixtures/schema/0.1.0.json`, `src/model/fixtures.test.ts`                                             | Roadmap §5 fixtures and the schema-history file                                  | 13    |
| repo root `eslint.config.mjs`, `renovate.json`                                                                                      | `Math.random` ban in `layout/`, no automerge for `manifold-3d`                   | 2     |

## Decisions this plan makes (read before implementing)

- **Notice codes.** `validateProject()` emits `field.*` (shown next to the field, project still loads), `limit.*` (spec §5 upper bounds) and `invalid.*` (`invalid.id` for an empty project or component id, `invalid.duplicateId`); the codes are exported as `VALIDATION_NOTICE_CODES`, and parse notice codes as `SCHEMA_NOTICE_CODES`. `isBlocking(n)` is true for `limit.*` and `invalid.*` errors; `parseProject()` refuses only those, so a half-edited autosave never locks the user out. `ProjectStore.load()` parses with `parseStoredProject()` (`enforceBounds: false`), so a local autosave over a `limit.*` bound still opens (links and files refuse it). Plans 4 and 5 must not optimize while `validateProject()` returns any `error`.
- **Pre-1.0 versioning.** While the schema MAJOR is 0, each `0.MINOR` is its own compatibility line and PATCH plays the additive role of MINOR: app schema 0.1.0 reads 0.1.x (newer patch: warning + preserve), refuses 0.2.0 ("update the app"), and needs a migration for 0.0.x (none registered, so it refuses). Once the app's schema MAJOR is ≥ 1, every 0.x file is refused outright with a "preview version" error (spec §9).
- **Unknown values (newer-minor files, spec §9: preserved verbatim on save).**
  - Inside a component, an unknown kind, enum value or shape makes the whole component _foreign_: kept verbatim in `foreign.components`, not laid out, re-inserted at its original index on save.
  - An unknown enum value in `box`, `printer` or `settings`: the in-memory project uses the default (the same `DEFAULT_BOX` / `DEFAULT_PRINTER` / `DEFAULT_SETTINGS` value the reader falls back to), the raw value goes to `foreign.values` as `{ path: "/settings/leftover", raw: "hollow" }`, and a `schema.unknownValue` warning is shown.
  - A lock of an unknown kind is not applied; it goes to `foreign.values` as `{ path: "/locks/3", raw: <the lock> }` with a `schema.unknownValue` warning. An unreadable lock of a known kind is still dropped (`lock.dropped`).
  - **"Changed since loading" rule:** `serializeProject` writes an object-field value back only while the field still equals the default that was substituted; any other value means the user changed it, and their value is saved. Re-selecting the default itself can't be told apart from "unchanged", so the original value is kept then (the user never saw a different value). Array-element values (unknown locks) are re-inserted at their index, ascending, like foreign components.
  - A stored tray with an unknown feature/value is kept verbatim and flagged `layout.unsupportedTrays`; plan 3 refuses to export it.
- **Unknown fields.** Newer-minor files keep them on every known object (written back on save, included in `inputsHash`). Files of the same or an older minor drop them with one `schema.unknownFields` info notice.
- **Damaged parts.** An unreadable lock or stored layout is dropped with a notice; it never makes the project unloadable. Anything else unreadable makes the file unloadable with a message naming the JSON path.
- **Card sides.** `parseProject()` swaps `shortSide`/`longSide` when they are the wrong way round (info notice `schema.cardSidesSwapped`); `validateProject()` warns (`field.cardSides`) so the UI can swap on input. Loaded projects therefore always have `shortSide ≤ longSide`.
- **`createdWith`.** `serializeProject()` writes `APP_VERSION` ("app version that last saved it"); `parseProject()` keeps the file's value so the newer-minor warning can name it. `schemaVersion` becomes the app's version on load, except for newer-minor files, which keep theirs so their preserved extras stay meaningful.
- **Number input.** A single `,` or `.` is always the decimal separator; any input with both, with spaces inside, exponents or units returns `null`. "1.000" reads as 1 (lengths are capped at 1000 mm, and the field shows the parsed value).
- **Storage failures.** `ProjectStore.save()` throws `StoreWriteError` when the browser refuses the write, after restoring the previous state (see "Contract changes").

---

### Task 1: App scaffold, version module and placeholder shell

**Files:**

- Create: `package.json`, `package-lock.json` (generated), `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `app.json`, `README.md`
- Create: `src/env.d.ts`, `src/main.tsx`, `src/style.css`, `src/app/App.tsx`, `src/model/version.ts`
- Test: `src/model/version.test.ts`, `src/app/App.test.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `SCHEMA_VERSION = "0.1.0"` (literal type, assignable to `string`), `APP_VERSION: string` (from `__APP_VERSION__`)
  - `interface Semver { major: number; minor: number; patch: number }`, `parseSemver(v: string): Semver | null` (strict `MAJOR.MINOR.PATCH`), `isPreview(version: string): boolean`
  - `App()` Preact component (placeholder; plan 5 replaces its body, keeping the banner and footer)
  - Global `declare const __APP_VERSION__: string`
  - Two TypeScript projects: `tsconfig.json` (`src/`, browser code, no Node types) and `tsconfig.node.json` (`vite.config.ts`; later plans add other Node-side config files to its `include`). `npm run typecheck` and `npm run build` check both.
  - Vitest runs `src/**/*.test.{ts,tsx}` in Node; a file starting with `// @vitest-environment jsdom` gets a DOM.

- [ ] **Step 1: Make sure the root tooling is installed**

From the repo root:

```bash
npm install
```

Expected: exits 0 (installs ESLint, Prettier, Stylelint, html-validate, Husky).

- [ ] **Step 2: Create the package manifest and install dependencies**

`package.json`:

```json
{
  "name": "insert-generator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vitest run && tsc --noEmit && tsc --noEmit -p tsconfig.node.json && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json"
  },
  "dependencies": {
    "@preact/signals": "^2.11.3",
    "fflate": "^0.8.3",
    "manifold-3d": "^3.5.4",
    "preact": "^10.29.8",
    "three": "^0.186.1"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.10.6",
    "@testing-library/preact": "^3.2.4",
    "@types/node": "^22.0.0",
    "@types/three": "^0.186.0",
    "fast-check": "^4.10.2",
    "jsdom": "^30.1.2",
    "rollup-plugin-license": "^3.7.1",
    "typescript": "^6.0.3",
    "vite": "^6.4.0",
    "vitest": "^5.0.3"
  }
}
```

From the repo root:

```bash
npm install
```

Expected: exits 0 and creates `package-lock.json` and `node_modules/`. (npm 11 may print an `install-scripts … esbuild` notice; it is harmless, esbuild runs from its platform package.) `scripts/build-app.mjs` runs `npm ci` when a lockfile exists, so the lockfile is committed.

- [ ] **Step 3: Add the TypeScript, Vite and Vitest configuration**

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "types": ["vite/client", "vitest"]
  },
  "include": ["src"]
}
```

`tsconfig.node.json` (the config files run in Node, not in the browser, so only they get Node's types; `src/` never sees `process` or `Buffer`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import pkg from "./package.json";

// `base: "./"` keeps every asset URL relative, so the built app works from any
// subpath (e.g. /<repo>/insert-generator/).
export default defineConfig({
  base: "./",
  plugins: [preact()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    // Pure modules run in Node. Component tests opt in to a DOM with a
    // `// @vitest-environment jsdom` comment on their first line.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

`src/env.d.ts`:

```ts
// Injected by Vite `define` from package.json (see vite.config.ts).
declare const __APP_VERSION__: string;
```

- [ ] **Step 4: Write the failing tests**

`src/model/version.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { APP_VERSION, SCHEMA_VERSION, isPreview, parseSemver } from "./version";

describe("version", () => {
  it("takes APP_VERSION from package.json", () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toBe("0.1.0");
  });

  it("starts the schema at 0.1.0", () => {
    expect(SCHEMA_VERSION).toBe("0.1.0");
  });

  it("parses strict semver", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver("0.10.0")).toEqual({ major: 0, minor: 10, patch: 0 });
  });

  it.each(["", "1", "1.2", "v1.2.3", "1.2.3-beta", "01.2.3", "1.2.3.4", " 1.2.3"])(
    "rejects %j",
    (v) => {
      expect(parseSemver(v)).toBeNull();
    },
  );

  it("treats 0.x as preview", () => {
    expect(isPreview("0.1.0")).toBe(true);
    expect(isPreview("1.0.0")).toBe(false);
  });
});
```

`src/app/App.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/preact";
import { App } from "./App";

afterEach(cleanup);

describe("App shell", () => {
  it("shows the preview banner", () => {
    render(<App />);
    expect(screen.getByRole("note").textContent).toMatch(/links may break/i);
  });

  it("shows the app version in the footer", () => {
    render(<App />);
    expect(screen.getByRole("contentinfo").textContent).toContain("v0.1.0");
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

From the repo root: `npx vitest run`

Expected: FAIL. `src/model/version.test.ts` reports `Error: Cannot find module './version'`, and `src/app/App.test.tsx` reports `Failed to resolve import "./App"`.

- [ ] **Step 6: Implement the version module, the shell and the page**

`src/model/version.ts`:

```ts
/** Schema version of project files written by this app (spec §9). */
export const SCHEMA_VERSION = "0.1.0";

/** App version from package.json, injected by Vite `define`. */
export const APP_VERSION = __APP_VERSION__;

export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Strict `MAJOR.MINOR.PATCH`; anything else (prerelease tags, "v1.0.0", "1.0") → null. */
export function parseSemver(v: string): Semver | null {
  const m = SEMVER.exec(v);
  if (!m) {
    return null;
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** True while the app is a preview release (0.x): show the "links may break" banner. */
export function isPreview(version: string): boolean {
  return parseSemver(version)?.major === 0;
}
```

`src/app/App.tsx`:

```tsx
import { APP_VERSION, isPreview } from "../model/version";

/** Placeholder shell; plan 5 replaces the body with the real UI. */
export function App() {
  return (
    <>
      {isPreview(APP_VERSION) && (
        <p class="preview-banner" role="note">
          Preview: saved projects and shared links may break between versions.
        </p>
      )}
      <main>
        <h1>Board Game Insert Generator</h1>
        <p>Measure your box and components; get a 3D-printable insert.</p>
      </main>
      <footer>
        Insert Generator v{APP_VERSION} · <a href="../">All apps</a>
      </footer>
    </>
  );
}
```

`src/main.tsx`:

```tsx
import { render } from "preact";
import { App } from "./app/App";
import "./style.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app element");
}
render(<App />, root);
```

`src/style.css`:

```css
:root {
  font-family: system-ui, sans-serif;
  color-scheme: light dark;
}

body {
  margin: 0;
}

.preview-banner {
  padding: 0.5rem 1rem;
  background: #fff3cd;
  color: #664d03;
  text-align: center;
}

main {
  max-width: 60rem;
  margin: 0 auto;
  padding: 1rem;
}

footer {
  padding: 1rem;
  text-align: center;
  font-size: 0.875rem;
  opacity: 0.8;
}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Board Game Insert Generator</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`app.json`:

```json
{
  "title": "Board Game Insert Generator",
  "description": "Measure a board game box and its components; get a 3D-printable insert (preview)."
}
```

`README.md`:

````markdown
# insert-generator

Built app: **Vite + TypeScript + Preact**. Turns a board game box and its
components into a 3D-printable insert (trays that fill the box, stack, and fit
the print bed). Design: [`docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md`](../../docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md).

Status: **preview (0.x)**: saved projects and shared links may break between
versions.

```bash
npm install
npm run dev        # dev server
npm test           # vitest run
npm run build      # vitest run && tsc (app + node configs) && vite build → dist/
npm run preview    # serve the production build
```

Tests run inside `npm run build`, because the repo's quality gate only runs
lint, format and build. Pure modules test in Node; component tests opt in to
jsdom with `// @vitest-environment jsdom` on their first line.

`vite.config.ts` sets `base: "./"` for subpath hosting and defines
`__APP_VERSION__` from `package.json`. TypeScript strictness comes from the
repo's [`tsconfig.base.json`](../../tsconfig.base.json). `tsconfig.json`
checks the browser code in `src/` (no Node types); `tsconfig.node.json` checks
the config files that run in Node. `npm run typecheck` runs both.
````

- [ ] **Step 7: Run the tests, the type check and the build**

From the repo root:

```bash
npx vitest run && npm run build
```

Expected: `Test Files  2 passed`, `Tests  14 passed`; both `tsc` runs (app and `tsconfig.node.json`) print nothing; Vite prints `✓ built` and writes `dist/index.html`.

From the repo root:

```bash
npm run lint && npx prettier --check apps/insert-generator
```

Expected: no ESLint, Stylelint or html-validate errors; `All matched files use Prettier code style!`. (If Prettier reports a file, run `npx prettier --write apps/insert-generator` and re-check.)

- [ ] **Step 8: Commit**

```bash
git add apps/insert-generator
git commit -m "Scaffold insert-generator app with version module and preview shell"
```

---

### Task 2: Root tooling rules (Math.random ban, manifold-3d automerge)

**Files:**

- Modify: `eslint.config.mjs` (new config object just before the final `prettier,` entry)
- Modify: `renovate.json` (new last entry of `packageRules`)
- Test: temporary probe files `src/layout/lint-probe.ts` and `src/model/lint-probe.ts` (deleted in this task)

**Interfaces:**

- Consumes: the app folder from Task 1.
- Produces: ESLint error `no-restricted-properties` for `Math.random` (including destructuring `const { random } = Math`) in `src/layout/**` only. Plan 4 relies on it.
- Already true, no change needed: the root config lints `.tsx` (typescript-eslint's configs add `**/*.tsx` to the linted files), `vite.config.ts` gets Node globals through the existing `**/*.config.{js,mjs,ts}` block, and tests import `describe`/`it`/`expect` from `vitest` explicitly, so no test globals are needed.

- [ ] **Step 1: Write the failing lint probe**

Create `src/layout/lint-probe.ts`:

```ts
export const probe = (): number => Math.random();
export const { random } = Math;
```

Create `src/model/lint-probe.ts` (outside `layout/`, must stay allowed):

```ts
export const probe = (): number => Math.random();
```

- [ ] **Step 2: Run the probe to verify the rule is missing**

From the repo root: `npx eslint src/layout/lint-probe.ts`

Expected: exits 0 with no output (the ban does not exist yet; this is the failure we fix).

Also from the repo root, check that Renovate has no rule yet:

```bash
node -e 'const c=JSON.parse(require("fs").readFileSync("renovate.json","utf8"));const r=c.packageRules.at(-1);if(!(r.matchPackageNames??[]).includes("manifold-3d")||r.automerge!==false){console.error("manifold-3d rule missing");process.exit(1)}console.log("renovate ok")'
```

Expected: `manifold-3d rule missing`, exit code 1.

- [ ] **Step 3: Add the ESLint rule**

In `eslint.config.mjs`, insert this object directly above the `// Turn off stylistic rules that Prettier owns. Keep this last.` comment:

```js
  // insert-generator: the layout optimizer must be deterministic (spec §7.2),
  // so it may only use its seeded PRNG.
  {
    files: ["src/layout/**"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "layout/ must be deterministic: use the seeded PRNG (spec §7.2).",
        },
      ],
    },
  },

```

- [ ] **Step 4: Add the Renovate rule**

In `renovate.json`, append this object as the **last** element of `packageRules` (later rules override the earlier automerge rule), adding a comma after the previous element:

```json
{
  "description": "insert-generator: manifold-3d (WASM geometry kernel) updates are reviewed by hand, never auto-merged",
  "matchPackageNames": ["manifold-3d"],
  "automerge": false
}
```

- [ ] **Step 5: Run the probes again to verify both rules**

From the repo root:

```bash
npx eslint src/layout/lint-probe.ts
```

Expected: exit code 1 with two errors, both `'Math.random' is restricted from being used. layout/ must be deterministic: use the seeded PRNG (spec §7.2)  no-restricted-properties` (lines 1 and 2).

```bash
npx eslint src/model/lint-probe.ts
```

Expected: exits 0, no output (the ban is scoped to `layout/`).

Re-run the `node -e …` Renovate check from Step 2. Expected: `renovate ok`.

- [ ] **Step 6: Delete the probes and run the root checks**

```bash
rm -r src/layout src/model/lint-probe.ts
npm run lint && npx prettier --check eslint.config.mjs renovate.json
```

Expected: no lint errors; `All matched files use Prettier code style!`.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.mjs renovate.json
git commit -m "Ban Math.random in insert-generator layout and stop manifold-3d automerge"
```

---

### Task 3: Model types, presets and settings

**Files:**

- Create: `src/model/types.ts`, `src/model/presets.ts`, `src/model/settings.ts`
- Test: `src/model/presets.test.ts`, `src/model/settings.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces (roadmap §4.1 and §4.5, exact):
  - every type of roadmap §4.1 (as amended: `ForeignData.values?`) from `model/types.ts` (`Project`, `Box`, `Printer`, `Component` and its kinds, `ComponentKind`, `Sleeve`, `BulkItem`, `TileShape`, `Lock`, `Settings`, `StoredLayout`, `FeatureSpec`, `CompartmentSpec`, `TraySpec`, `Notice`, `ForeignData`, `ParseResult`, `Access`, `Side`)
  - `CARD_PRESETS: { id: string; label: string; shortSide: number; longSide: number }[]`
  - `SLEEVES: Record<"none" | "standard" | "premium", { addThickness: number; addSize: number }>`
  - `BED_PRESETS: { id: string; label: string; bedX: number; bedY: number; bedZ: number }[]` (first entry is the default printer)
  - `DEFAULT_SETTINGS: Settings`; `type WallChoice = "thin" | "normal" | "sturdy"`; `type FitChoice = "tight" | "normal" | "loose"`; `WALL_CHOICES: Record<WallChoice, number>`; `FIT_CHOICES: Record<FitChoice, number>`
  - `applyWallChoice(s: Settings, c: WallChoice): Settings`, `applyFitChoice(s: Settings, c: FitChoice): Settings`, `wallChoiceOf(s: Settings): WallChoice | "custom"`, `fitChoiceOf(s: Settings): FitChoice | "custom"`
  - `interface Effective { cardClearance; cardStackClearance; pieceClearance; boxClearance; trayGap; lipPlay }` (all `number`), `effective(s: Settings): Effective` (base × fit, rounded to 1e-6; `cardStackClearancePct` is a fraction, 0.03 = 3 %, not part of `Effective`; sizing multiplies it by `fit` itself, per the spec's ×Fit)
  - `topPlane(box: Box, s: Settings): number` = `innerHeight − headroom + topPressFit`

- [ ] **Step 1: Write the failing tests**

`src/model/presets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BED_PRESETS, CARD_PRESETS, SLEEVES } from "./presets";

describe("presets", () => {
  it("has the nine card sizes from the spec", () => {
    expect(CARD_PRESETS.map((p) => [p.label, p.shortSide, p.longSide])).toEqual([
      ["Standard", 63.5, 88],
      ["Standard American", 56, 87],
      ["Euro", 59, 92],
      ["Mini Euro", 44, 68],
      ["Mini American", 41, 63],
      ["Tarot", 70, 120],
      ["French Tarot", 61, 112],
      ["Extra Large", 65, 100],
      ["Dixit", 80, 120],
    ]);
  });

  it("stores every card preset short side first, with unique ids", () => {
    for (const p of CARD_PRESETS) {
      expect(p.shortSide).toBeLessThanOrEqual(p.longSide);
    }
    expect(new Set(CARD_PRESETS.map((p) => p.id)).size).toBe(CARD_PRESETS.length);
  });

  it("has the sleeve table from the spec", () => {
    expect(SLEEVES).toEqual({
      none: { addThickness: 0, addSize: 0 },
      standard: { addThickness: 0.1, addSize: 3 },
      premium: { addThickness: 0.28, addSize: 3 },
    });
  });

  it("has the three bed presets from the spec", () => {
    expect(BED_PRESETS.map((b) => [b.bedX, b.bedY, b.bedZ])).toEqual([
      [256, 256, 256],
      [250, 210, 220],
      [220, 220, 250],
    ]);
  });
});
```

`src/model/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  applyFitChoice,
  applyWallChoice,
  effective,
  fitChoiceOf,
  topPlane,
  wallChoiceOf,
} from "./settings";
import type { Box } from "./types";

describe("DEFAULT_SETTINGS", () => {
  it("matches the spec §5 table", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      wall: 1.6,
      floor: 1.2,
      divider: 1.2,
      fit: 1,
      cardClearance: 1.5,
      cardStackClearance: 1,
      cardStackClearancePct: 0.03,
      cardThickness: 0.32,
      pieceClearance: 1,
      boxClearance: 0.5,
      trayGap: 0.2,
      bottomChamfer: 0.4,
      cornerRadius: 3,
      scoopRadius: 12,
      fingerPocket: { width: 22, reach: 12 },
      lip: { enabled: true, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 },
      topPressFit: 0,
      packingFactor: 0.5,
      leftover: "spare",
    });
  });
});

describe("simple-mode choices", () => {
  it("maps wall thin/normal/sturdy to 1.2/1.6/2.0", () => {
    expect(applyWallChoice(DEFAULT_SETTINGS, "thin").wall).toBe(1.2);
    expect(applyWallChoice(DEFAULT_SETTINGS, "normal").wall).toBe(1.6);
    expect(applyWallChoice(DEFAULT_SETTINGS, "sturdy").wall).toBe(2);
  });

  it("maps fit tight/normal/loose to 0.7/1/1.4", () => {
    expect(applyFitChoice(DEFAULT_SETTINGS, "tight").fit).toBe(0.7);
    expect(applyFitChoice(DEFAULT_SETTINGS, "normal").fit).toBe(1);
    expect(applyFitChoice(DEFAULT_SETTINGS, "loose").fit).toBe(1.4);
  });

  it("does not mutate its input", () => {
    const before = structuredClone(DEFAULT_SETTINGS);
    applyWallChoice(DEFAULT_SETTINGS, "sturdy");
    applyFitChoice(DEFAULT_SETTINGS, "loose");
    expect(DEFAULT_SETTINGS).toEqual(before);
  });

  it("reads the choice back, or custom", () => {
    expect(wallChoiceOf(DEFAULT_SETTINGS)).toBe("normal");
    expect(fitChoiceOf(applyFitChoice(DEFAULT_SETTINGS, "tight"))).toBe("tight");
    expect(wallChoiceOf({ ...DEFAULT_SETTINGS, wall: 1.8 })).toBe("custom");
    expect(fitChoiceOf({ ...DEFAULT_SETTINGS, fit: 1.2 })).toBe("custom");
  });
});

describe("effective", () => {
  it("is the base value at fit 1", () => {
    expect(effective(DEFAULT_SETTINGS)).toEqual({
      cardClearance: 1.5,
      cardStackClearance: 1,
      pieceClearance: 1,
      boxClearance: 0.5,
      trayGap: 0.2,
      lipPlay: 0.25,
    });
  });

  it("scales every ×Fit clearance without float noise", () => {
    expect(effective(applyFitChoice(DEFAULT_SETTINGS, "tight"))).toEqual({
      cardClearance: 1.05,
      cardStackClearance: 0.7,
      pieceClearance: 0.7,
      boxClearance: 0.35,
      trayGap: 0.14,
      lipPlay: 0.175,
    });
  });
});

describe("topPlane", () => {
  const box: Box = {
    innerWidth: 290,
    innerDepth: 290,
    innerHeight: 70,
    headroom: 8,
    headroomCoverage: "full",
    storedOnSide: false,
  };

  it("is innerHeight − headroom + topPressFit", () => {
    expect(topPlane(box, DEFAULT_SETTINGS)).toBe(62);
    expect(topPlane(box, { ...DEFAULT_SETTINGS, topPressFit: 0.3 })).toBe(62.3);
    expect(topPlane({ ...box, headroom: 0 }, { ...DEFAULT_SETTINGS, topPressFit: -2 })).toBe(68);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

From the repo root: `npx vitest run src/model/presets.test.ts src/model/settings.test.ts`

Expected: FAIL with `Error: Cannot find module './presets'` and `Error: Cannot find module './settings'`.

- [ ] **Step 3: Write the contract types**

`types.ts` is roadmap §4.1 verbatim, plus a header comment. Do not rename or change anything in it.

`src/model/types.ts`:

```ts
// Cross-plan contract: roadmap §4.1 (spec §5 types plus shared helpers).
// Do not rename or change anything here without a roadmap contract change.
// All lengths are millimetres.

export type Access = "often" | "sometimes" | "setup";
export type Side = "front" | "back" | "left" | "right"; // tray-local: front = −Y, back = +Y, left = −X, right = +X

export interface Project {
  schemaVersion: string;
  createdWith: string;
  id: string;
  name: string;
  box: Box;
  printer: Printer;
  settings: Settings;
  components: Component[];
  locks: Lock[];
  layout?: StoredLayout;
}

export interface Box {
  innerWidth: number;
  innerDepth: number;
  innerHeight: number;
  headroom: number;
  headroomCoverage: "full" | "partial";
  storedOnSide: boolean;
}

export interface Printer {
  bedX: number;
  bedY: number;
  bedZ: number;
  bedMargin: number;
  layerHeight: number;
}

export type Component =
  CardsComponent | BulkComponent | TilesComponent | MinisComponent | CustomComponent;
export type ComponentKind = Component["kind"];

export interface ComponentBase {
  id: string;
  name: string;
  access: Access;
  groupId?: string;
  perPlayer?: { players: number };
  clearance?: number;
}

export type Sleeve = "none" | "standard" | "premium" | { w: number; h: number; thickness: number };

export interface CardsComponent extends ComponentBase {
  kind: "cards";
  shortSide: number;
  longSide: number;
  decks: { name: string; count: number }[];
  sleeve: Sleeve;
  thickness: { mode: "preset" } | { mode: "measured"; cards: number; stackMm: number };
  storage: "upright-long" | "upright-short" | "flat" | "auto";
}

export type BulkItem =
  | { name: string; count: number; w: number; d: number; h: number }
  | { name: string; volumeMl: number };

export interface BulkComponent extends ComponentBase {
  kind: "bulk";
  items: BulkItem[];
}

export type TileShape =
  | { type: "rect"; w: number; d: number }
  | { type: "hex"; flatToFlat: number; orientation: "flat" | "pointy" };

export interface TilesComponent extends ComponentBase {
  kind: "tiles";
  shape: TileShape;
  thickness: number;
  count: number;
  storage: "flat" | "upright" | "auto";
}

export interface MinisComponent extends ComponentBase {
  kind: "minis";
  figures: { name: string; w: number; d: number; h: number; count: number }[];
  storage: "pockets" | "bulk";
}

export interface CustomComponent extends ComponentBase {
  kind: "custom";
  w: number;
  d: number;
  h: number;
  count: number;
}

export type Lock =
  | { kind: "position"; trayKey: string; path: string; rotated: boolean }
  | { kind: "size"; trayKey: string; w: number; d: number; h: number }
  | { kind: "stack"; trayKeys: string[] };

export interface Settings {
  wall: number;
  floor: number;
  divider: number;
  fit: number;
  cardClearance: number;
  cardStackClearance: number;
  cardStackClearancePct: number;
  cardThickness: number;
  pieceClearance: number;
  boxClearance: number;
  trayGap: number;
  bottomChamfer: number;
  cornerRadius: number;
  scoopRadius: number;
  fingerPocket: { width: number; reach: number };
  lip: { enabled: boolean; height: number; thickness: number; ledge: number; play: number };
  topPressFit: number;
  packingFactor: number;
  leftover: "spare" | "solid";
}

export interface StoredLayout {
  createdWith: string;
  geometryVersion: string;
  inputsHash: string;
  seed: number;
  iterations: number;
  capped: boolean;
  trays: TraySpec[];
}

export type FeatureSpec =
  | { type: "fingerPocket"; side: Side; at: number; width: number; reach: number; depth: number }
  | { type: "scoop"; side: Side; r: number }
  | { type: "cornerRelief"; d: number };

export interface CompartmentSpec {
  x: number; // inner, tray-local, min corner; origin = tray outer min corner
  y: number;
  w: number;
  d: number;
  floorZ: number; // tray-local; = settings.floor unless raised
  kind: "well" | "scoop" | "pocket" | "spare";
  contents: string;
  features: FeatureSpec[];
}

export interface TraySpec {
  key: string;
  part: "tray" | "leftover" | "spacer";
  path: string;
  stack: number;
  level: number;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rotated: boolean;
  wall: number;
  floor: number;
  lip: boolean; // true when another tray is stacked on this one and settings.lip.enabled
  solid: boolean;
  compartments: CompartmentSpec[];
}

// Shared helpers
export interface Notice {
  level: "info" | "warning" | "error";
  code: string; // stable machine code, e.g. "lock.dropped", "schema.newerMinor"
  message: string; // human-readable, English
  path?: string; // JSON-pointer-like field path for field-level validation, e.g. "/components/2/decks/0/count"
}

export interface ForeignData {
  // Unknown components from a newer-minor file, kept verbatim and re-inserted on save
  components: { index: number; raw: unknown }[];
  // Unknown enum values inside box/settings/printer/locks, kept verbatim and written back on save
  values?: { path: string; raw: unknown }[]; // path: JSON-pointer, e.g. "/settings/leftover"
}

export type ParseResult =
  | { ok: true; project: Project; foreign: ForeignData; notices: Notice[] }
  | { ok: false; error: string };
```

- [ ] **Step 4: Implement presets and settings**

`src/model/presets.ts`:

```ts
/** Card sizes (card, not sleeve), spec §5. shortSide ≤ longSide. */
export const CARD_PRESETS: { id: string; label: string; shortSide: number; longSide: number }[] = [
  { id: "standard", label: "Standard", shortSide: 63.5, longSide: 88 },
  { id: "standard-american", label: "Standard American", shortSide: 56, longSide: 87 },
  { id: "euro", label: "Euro", shortSide: 59, longSide: 92 },
  { id: "mini-euro", label: "Mini Euro", shortSide: 44, longSide: 68 },
  { id: "mini-american", label: "Mini American", shortSide: 41, longSide: 63 },
  { id: "tarot", label: "Tarot", shortSide: 70, longSide: 120 },
  { id: "french-tarot", label: "French Tarot", shortSide: 61, longSide: 112 },
  { id: "extra-large", label: "Extra Large", shortSide: 65, longSide: 100 },
  { id: "dixit", label: "Dixit", shortSide: 80, longSide: 120 },
];

/**
 * Sleeve table, spec §5: thickness added per card, and length added to both the
 * short and the long side. Custom sleeves give their outer size directly.
 */
export const SLEEVES: Record<
  "none" | "standard" | "premium",
  { addThickness: number; addSize: number }
> = {
  none: { addThickness: 0, addSize: 0 },
  standard: { addThickness: 0.1, addSize: 3 },
  premium: { addThickness: 0.28, addSize: 3 },
};

/** Print bed presets, spec §5. The UI adds "custom". */
export const BED_PRESETS: {
  id: string;
  label: string;
  bedX: number;
  bedY: number;
  bedZ: number;
}[] = [
  { id: "bambu-256", label: "Bambu Lab (256 × 256 × 256)", bedX: 256, bedY: 256, bedZ: 256 },
  { id: "prusa-mk4", label: "Prusa MK4 (250 × 210 × 220)", bedX: 250, bedY: 210, bedZ: 220 },
  { id: "ender-3", label: "Ender 3 (220 × 220 × 250)", bedX: 220, bedY: 220, bedZ: 250 },
];
```

`src/model/settings.ts`:

```ts
import type { Box, Settings } from "./types";

/** Spec §5 defaults. Projects store resolved values, never "use the default". */
export const DEFAULT_SETTINGS: Settings = {
  wall: 1.6,
  floor: 1.2,
  divider: 1.2,
  fit: 1,
  cardClearance: 1.5,
  cardStackClearance: 1,
  cardStackClearancePct: 0.03,
  cardThickness: 0.32,
  pieceClearance: 1,
  boxClearance: 0.5,
  trayGap: 0.2,
  bottomChamfer: 0.4,
  cornerRadius: 3,
  scoopRadius: 12,
  fingerPocket: { width: 22, reach: 12 },
  lip: { enabled: true, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 },
  topPressFit: 0,
  packingFactor: 0.5,
  leftover: "spare",
};

export type WallChoice = "thin" | "normal" | "sturdy";
export type FitChoice = "tight" | "normal" | "loose";

export const WALL_CHOICES: Record<WallChoice, number> = { thin: 1.2, normal: 1.6, sturdy: 2 };
export const FIT_CHOICES: Record<FitChoice, number> = { tight: 0.7, normal: 1, loose: 1.4 };

const EPS = 1e-9;

/** Simple-mode "Walls" control: writes the resolved wall thickness. */
export function applyWallChoice(s: Settings, c: WallChoice): Settings {
  return { ...s, wall: WALL_CHOICES[c] };
}

/** Simple-mode "Fit" control: writes the resolved fit factor. */
export function applyFitChoice(s: Settings, c: FitChoice): Settings {
  return { ...s, fit: FIT_CHOICES[c] };
}

function choiceOf<C extends string>(table: Record<C, number>, value: number): C | "custom" {
  for (const [choice, v] of Object.entries(table) as [C, number][]) {
    if (Math.abs(v - value) < EPS) {
      return choice;
    }
  }
  return "custom";
}

/** Which simple-mode choice the current wall matches, or "custom" (set in advanced mode). */
export function wallChoiceOf(s: Settings): WallChoice | "custom" {
  return choiceOf(WALL_CHOICES, s.wall);
}

export function fitChoiceOf(s: Settings): FitChoice | "custom" {
  return choiceOf(FIT_CHOICES, s.fit);
}

/** Clearances after Fit scaling (spec §5 rows marked ×Fit). */
export interface Effective {
  cardClearance: number;
  cardStackClearance: number;
  pieceClearance: number;
  boxClearance: number;
  trayGap: number;
  lipPlay: number;
}

/** Rounds away float noise such as 1.5 × 0.7 = 1.0499999999999998. */
function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** Base clearances × fit. `cardStackClearancePct` is not included; sizing scales it by `fit` itself. */
export function effective(s: Settings): Effective {
  return {
    cardClearance: round6(s.cardClearance * s.fit),
    cardStackClearance: round6(s.cardStackClearance * s.fit),
    pieceClearance: round6(s.pieceClearance * s.fit),
    boxClearance: round6(s.boxClearance * s.fit),
    trayGap: round6(s.trayGap * s.fit),
    lipPlay: round6(s.lip.play * s.fit),
  };
}

/** Height every stack must reach (spec §3 rule 2). */
export function topPlane(box: Box, s: Settings): number {
  return round6(box.innerHeight - box.headroom + s.topPressFit);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

From the repo root:

```bash
npx vitest run src/model/presets.test.ts src/model/settings.test.ts && npx tsc --noEmit
```

Expected: `Tests  12 passed`; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/model
git commit -m "Add insert-generator model types, presets and settings"
```

---

### Task 4: Decimal-comma number parsing and ids

**Files:**

- Create: `src/model/numbers.ts`, `src/model/ids.ts`
- Test: `src/model/numbers.test.ts`, `src/model/ids.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `parseNumber(text: string): number | null` ("63,5" → 63.5, "" → null, ambiguous → null); `newId(): string` (8 chars `[0-9a-z]`, from `crypto.getRandomValues`).

- [ ] **Step 1: Write the failing tests**

`src/model/numbers.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseNumber } from "./numbers";

describe("parseNumber", () => {
  it.each([
    ["63,5", 63.5],
    ["63.5", 63.5],
    ["  63,5\t", 63.5],
    ["88", 88],
    ["0,32", 0.32],
    [",5", 0.5],
    [".5", 0.5],
    ["5.", 5],
    ["-2", -2],
    ["\u22122", -2],
    ["+1", 1],
    ["1.000", 1],
    ["1,000", 1],
    ["0", 0],
  ])("reads %j as %d", (text, expected) => {
    expect(parseNumber(text)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "1.000,5",
    "1,000.5",
    "1 000",
    "1e3",
    "63,5 mm",
    "abc",
    "-",
    ",",
    "1,2,3",
    "Infinity",
    "0x10",
  ])("rejects %j", (text) => {
    expect(parseNumber(text)).toBeNull();
  });

  it("round-trips any number written with a decimal comma or point", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }).map((x) => Math.round(x * 100) / 100),
        fc.boolean(),
        (x, comma) => {
          const text = comma ? String(x).replace(".", ",") : String(x);
          expect(parseNumber(text)).toBe(x === 0 ? 0 : x);
        },
      ),
    );
  });
});
```

`src/model/ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newId } from "./ids";

describe("newId", () => {
  it("is 8 base36 characters", () => {
    expect(newId()).toMatch(/^[0-9a-z]{8}$/);
  });

  it("does not repeat in 10 000 draws", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId()));
    expect(ids.size).toBe(10_000);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

From the repo root: `npx vitest run src/model/numbers.test.ts src/model/ids.test.ts`

Expected: FAIL with `Error: Cannot find module './numbers'` and `Error: Cannot find module './ids'`.

- [ ] **Step 3: Implement**

`src/model/numbers.ts`:

```ts
/**
 * One optional sign, digits, and at most one decimal separator (comma or
 * point). No thousands separators, exponents, units or inner spaces.
 */
const NUMBER = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/**
 * Parses a number typed by the user, with a decimal comma or point (spec §8.2).
 * Returns null for anything it can't read unambiguously, so the field can show
 * an error instead of silently using a wrong value:
 *
 * - "63,5" and "63.5" → 63.5; " 63,5 " → 63.5 (outer whitespace is ignored)
 * - "−2" (Unicode minus) → −2
 * - "1.000,5", "1,000.5", "1 000", "1e3", "63,5 mm", "" → null
 *
 * "1.000" and "1,000" both read as 1: a single separator is always decimal.
 * Lengths are capped at 1000 mm, so "one thousand" typed with a thousands
 * separator is unlikely, and validation shows the result next to the field.
 */
export function parseNumber(text: string): number | null {
  const s = text.trim().replace(/\u2212/g, "-");
  if (!NUMBER.test(s)) {
    return null;
  }
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
```

`src/model/ids.ts`:

```ts
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 8 random base36 characters, for project and component ids. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let id = "";
  for (const b of bytes) {
    id += ALPHABET.charAt(b % 36);
  }
  return id;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/model/numbers.test.ts src/model/ids.test.ts && npx tsc --noEmit
```

Expected: `Tests  30 passed`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/model
git commit -m "Add decimal-comma number parsing and id generation"
```

---

### Task 5: Project and component defaults

**Files:**

- Create: `src/model/defaults.ts`
- Test: `src/model/defaults.test.ts`

**Interfaces:**

- Consumes: `newId()` (Task 4), `BED_PRESETS` and `DEFAULT_SETTINGS` (Task 3), `SCHEMA_VERSION`, `APP_VERSION` (Task 1).
- Produces:
  - `newProject(): Project` (no components, no locks, no layout, deep copy of `DEFAULT_SETTINGS`, first bed preset with `bedMargin: 5`, `layerHeight: 0.2`)
  - `newComponent(kind: ComponentKind): Component` (`access: "sometimes"`, cards/tiles `storage: "auto"`, minis `storage: "pockets"`, cards Standard 63.5 × 88 unsleeved with preset thickness)
  - `DEFAULT_BOX: Box`, `DEFAULT_PRINTER: Printer`, `DEFAULT_PROJECT_NAME = "Untitled insert"`, `KIND_NAMES: Record<ComponentKind, string>` (schema reading uses these to fill missing fields)

- [ ] **Step 1: Write the failing test**

`src/model/defaults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newComponent, newProject } from "./defaults";
import { DEFAULT_SETTINGS } from "./settings";
import type { ComponentKind } from "./types";
import { APP_VERSION, SCHEMA_VERSION } from "./version";

const KINDS: ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];

describe("newProject", () => {
  it("starts empty at the current versions with default settings and printer", () => {
    const p = newProject();
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.createdWith).toBe(APP_VERSION);
    expect(p.id).toMatch(/^[0-9a-z]{8}$/);
    expect(p.components).toEqual([]);
    expect(p.locks).toEqual([]);
    expect(p.layout).toBeUndefined();
    expect(p.settings).toEqual(DEFAULT_SETTINGS);
    expect(p.printer).toEqual({ bedX: 256, bedY: 256, bedZ: 256, bedMargin: 5, layerHeight: 0.2 });
    expect(p.box.headroom).toBe(0);
  });

  it("never shares nested objects with DEFAULT_SETTINGS", () => {
    const p = newProject();
    expect(p.settings.lip).not.toBe(DEFAULT_SETTINGS.lip);
    expect(p.settings.fingerPocket).not.toBe(DEFAULT_SETTINGS.fingerPocket);
  });

  it("gives every project a new id", () => {
    expect(newProject().id).not.toBe(newProject().id);
  });
});

describe("newComponent", () => {
  it.each(KINDS)("creates a %s component with access 'sometimes'", (kind) => {
    const c = newComponent(kind);
    expect(c.kind).toBe(kind);
    expect(c.access).toBe("sometimes");
    expect(c.id).toMatch(/^[0-9a-z]{8}$/);
    expect(c.groupId).toBeUndefined();
    expect(c.perPlayer).toBeUndefined();
  });

  it("uses storage 'auto' for cards and tiles and 'pockets' for minis", () => {
    const cards = newComponent("cards");
    const tiles = newComponent("tiles");
    const minis = newComponent("minis");
    expect(cards.kind === "cards" && cards.storage).toBe("auto");
    expect(tiles.kind === "tiles" && tiles.storage).toBe("auto");
    expect(minis.kind === "minis" && minis.storage).toBe("pockets");
  });

  it("defaults cards to Standard size, unsleeved, preset thickness", () => {
    const c = newComponent("cards");
    expect(c).toMatchObject({
      shortSide: 63.5,
      longSide: 88,
      sleeve: "none",
      thickness: { mode: "preset" },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

From the repo root: `npx vitest run src/model/defaults.test.ts`

Expected: FAIL with `Error: Cannot find module './defaults'`.

- [ ] **Step 3: Implement**

`src/model/defaults.ts`:

```ts
import { newId } from "./ids";
import { BED_PRESETS } from "./presets";
import { DEFAULT_SETTINGS } from "./settings";
import { APP_VERSION, SCHEMA_VERSION } from "./version";
import type { Box, Component, ComponentKind, Printer, Project } from "./types";

/**
 * Box for a new project. Its headroom, headroomCoverage and storedOnSide also
 * fill files that lack them (spec §9).
 */
export const DEFAULT_BOX: Box = {
  innerWidth: 285,
  innerDepth: 285,
  innerHeight: 70,
  headroom: 0,
  headroomCoverage: "full",
  storedOnSide: false,
};

const defaultBed = BED_PRESETS[0] ?? { bedX: 256, bedY: 256, bedZ: 256 };

/** Printer for a new project. bedMargin and layerHeight also fill files that lack them. */
export const DEFAULT_PRINTER: Printer = {
  bedX: defaultBed.bedX,
  bedY: defaultBed.bedY,
  bedZ: defaultBed.bedZ,
  bedMargin: 5,
  layerHeight: 0.2,
};

export const DEFAULT_PROJECT_NAME = "Untitled insert";

/** Default display name per component kind. */
export const KIND_NAMES: Record<ComponentKind, string> = {
  cards: "Cards",
  bulk: "Bits",
  tiles: "Tiles",
  minis: "Miniatures",
  custom: "Item",
};

export function newProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdWith: APP_VERSION,
    id: newId(),
    name: DEFAULT_PROJECT_NAME,
    box: { ...DEFAULT_BOX },
    printer: { ...DEFAULT_PRINTER },
    settings: structuredClone(DEFAULT_SETTINGS),
    components: [],
    locks: [],
  };
}

/** A new component with spec §5 defaults (access "sometimes", storage "auto", minis "pockets"). */
export function newComponent(kind: ComponentKind): Component {
  const base = { id: newId(), name: KIND_NAMES[kind], access: "sometimes" as const };
  switch (kind) {
    case "cards":
      return {
        ...base,
        kind,
        shortSide: 63.5,
        longSide: 88,
        decks: [{ name: "Deck", count: 50 }],
        sleeve: "none",
        thickness: { mode: "preset" },
        storage: "auto",
      };
    case "bulk":
      return { ...base, kind, items: [{ name: "Tokens", count: 20, w: 20, d: 20, h: 2 }] };
    case "tiles":
      return {
        ...base,
        kind,
        shape: { type: "rect", w: 50, d: 50 },
        thickness: 2,
        count: 20,
        storage: "auto",
      };
    case "minis":
      return {
        ...base,
        kind,
        figures: [{ name: "Figure", w: 25, d: 25, h: 40, count: 4 }],
        storage: "pockets",
      };
    case "custom":
      return { ...base, kind, w: 50, d: 50, h: 20, count: 1 };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/model/defaults.test.ts && npx tsc --noEmit
```

Expected: `Tests  10 passed`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/model
git commit -m "Add project and component defaults"
```

---

### Task 6: Field-level validation and bounds

**Files:**

- Create: `src/model/validate.ts`
- Test: `src/model/validate.test.ts`

**Interfaces:**

- Consumes: types (Task 3), `newProject()`, `newComponent()` (Task 5, tests only).
- Produces:
  - `BOUNDS: { maxComponents: 100; maxCount: 2000; maxLength: 1000; maxPlayers: 10 }`, `MAX_VOLUME_ML = 1_000_000`
  - `validateProject(p: Project): Notice[]` (never throws; every notice has a JSON-pointer `path` such as `/components/2/decks/0/count`)
  - `isBlocking(n: Notice): boolean` (true for `limit.*` and `invalid.*` errors)
  - `SETTING_RANGES: { path: string; label: string; get: (s: Settings) => number; min: number; max: number }[]` (plan 5 can show the ranges next to advanced settings)
  - Codes: `field.length`, `field.count`, `field.players`, `field.volume`, `field.empty`, `field.perPlayerInGroup`, `field.cardSides` (warning), `field.headroom`, `field.bedMargin`, `field.layerHeight`, `field.setting`, `field.lockPath`, `field.lockStack`, `limit.components`, `limit.count`, `limit.length`, `limit.players`, `limit.volume`, `invalid.duplicateId`

- [ ] **Step 1: Write the failing test**

`src/model/validate.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { newComponent, newProject } from "./defaults";
import type {
  BulkComponent,
  CardsComponent,
  Component,
  ComponentKind,
  CustomComponent,
  MinisComponent,
  Notice,
  Project,
  TilesComponent,
} from "./types";
import { BOUNDS, isBlocking, validateProject } from "./validate";

const KINDS: ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];

function withComponents(...components: Component[]): Project {
  return { ...newProject(), components };
}

function cards(patch: Partial<CardsComponent> = {}): CardsComponent {
  return { ...(newComponent("cards") as CardsComponent), ...patch };
}

/** [code, path] pairs, which is what the UI uses to place a message. */
function codes(notices: Notice[]): [string, string | undefined][] {
  return notices.map((n) => [n.code, n.path]);
}

describe("validateProject", () => {
  it("accepts a new project with no components", () => {
    expect(validateProject(newProject())).toEqual([]);
  });

  it.each(KINDS)("accepts a default %s component", (kind) => {
    expect(validateProject(withComponents(newComponent(kind)))).toEqual([]);
  });

  it("enforces the component limit as blocking", () => {
    const many = Array.from({ length: BOUNDS.maxComponents + 1 }, () => newComponent("custom"));
    const notices = validateProject(withComponents(...many));
    expect(codes(notices)).toEqual([["limit.components", "/components"]]);
    expect(notices.every(isBlocking)).toBe(true);
    expect(validateProject(withComponents(...many.slice(1)))).toEqual([]);
  });

  it("rejects counts below 1 or fractional (field) and above 2000 (blocking)", () => {
    const p = withComponents(
      cards({
        decks: [
          { name: "a", count: 0 },
          { name: "b", count: 2.5 },
          { name: "c", count: 2001 },
          { name: "d", count: 2000 },
        ],
      }),
    );
    const notices = validateProject(p);
    expect(codes(notices)).toEqual([
      ["field.count", "/components/0/decks/0/count"],
      ["field.count", "/components/0/decks/1/count"],
      ["limit.count", "/components/0/decks/2/count"],
    ]);
    expect(notices.map(isBlocking)).toEqual([false, false, true]);
  });

  it("checks count bounds for any integer", () => {
    fc.assert(
      fc.property(fc.integer({ min: -10, max: 5000 }), (count) => {
        const custom: CustomComponent = { ...(newComponent("custom") as CustomComponent), count };
        const found = codes(validateProject(withComponents(custom))).map(([code]) => code);
        if (count < 1) {
          expect(found).toEqual(["field.count"]);
        } else if (count > BOUNDS.maxCount) {
          expect(found).toEqual(["limit.count"]);
        } else {
          expect(found).toEqual([]);
        }
      }),
    );
  });

  it("rejects lengths ≤ 0, NaN (field) and > 1000 mm (blocking)", () => {
    const p = newProject();
    p.box = { ...p.box, innerWidth: 0, innerDepth: Number.NaN, innerHeight: 1000.5 };
    expect(codes(validateProject(p))).toEqual([
      ["field.length", "/box/innerWidth"],
      ["field.length", "/box/innerDepth"],
      ["limit.length", "/box/innerHeight"],
    ]);
  });

  it("checks every length inside every component kind", () => {
    const bulk: BulkComponent = {
      ...(newComponent("bulk") as BulkComponent),
      items: [
        { name: "cube", count: 10, w: 8, d: -1, h: 8 },
        { name: "pile", volumeMl: 0 },
      ],
    };
    const tiles: TilesComponent = {
      ...(newComponent("tiles") as TilesComponent),
      shape: { type: "hex", flatToFlat: 1200, orientation: "flat" },
      thickness: 0,
    };
    const minis: MinisComponent = {
      ...(newComponent("minis") as MinisComponent),
      figures: [{ name: "hero", w: 25, d: 25, h: 0, count: 1 }],
    };
    expect(codes(validateProject(withComponents(bulk, tiles, minis)))).toEqual([
      ["field.length", "/components/0/items/0/d"],
      ["field.volume", "/components/0/items/1/volumeMl"],
      ["limit.length", "/components/1/shape/flatToFlat"],
      ["field.length", "/components/1/thickness"],
      ["field.length", "/components/2/figures/0/h"],
    ]);
  });

  it("requires at least one deck, item and figure", () => {
    const p = withComponents(
      cards({ decks: [] }),
      { ...(newComponent("bulk") as BulkComponent), items: [] },
      { ...(newComponent("minis") as MinisComponent), figures: [] },
    );
    expect(codes(validateProject(p))).toEqual([
      ["field.empty", "/components/0/decks"],
      ["field.empty", "/components/1/items"],
      ["field.empty", "/components/2/figures"],
    ]);
  });

  it("forbids perPlayer inside a group", () => {
    const p = withComponents(cards({ groupId: "g1", perPlayer: { players: 4 } }));
    expect(codes(validateProject(p))).toEqual([
      ["field.perPlayerInGroup", "/components/0/perPlayer"],
    ]);
  });

  it("bounds players to 1…10", () => {
    const p = withComponents(
      cards({ perPlayer: { players: 0 } }),
      cards({ perPlayer: { players: 11 } }),
    );
    expect(codes(validateProject(p))).toEqual([
      ["field.players", "/components/0/perPlayer/players"],
      ["limit.players", "/components/1/perPlayer/players"],
    ]);
  });

  it("warns (does not error) when card sides are entered the wrong way round", () => {
    const notices = validateProject(withComponents(cards({ shortSide: 88, longSide: 63.5 })));
    expect(notices).toEqual([
      expect.objectContaining({
        level: "warning",
        code: "field.cardSides",
        path: "/components/0/shortSide",
      }),
    ]);
  });

  it("checks custom sleeves and measured thickness", () => {
    const p = withComponents(
      cards({
        sleeve: { w: 66.5, h: 0, thickness: -0.1 },
        thickness: { mode: "measured", cards: 0, stackMm: 20 },
      }),
    );
    expect(codes(validateProject(p))).toEqual([
      ["field.length", "/components/0/sleeve/h"],
      ["field.length", "/components/0/sleeve/thickness"],
      ["field.count", "/components/0/thickness/cards"],
    ]);
  });

  it("allows a clearance override of 0 but not below", () => {
    expect(validateProject(withComponents(cards({ clearance: 0 })))).toEqual([]);
    expect(codes(validateProject(withComponents(cards({ clearance: -1 }))))).toEqual([
      ["field.length", "/components/0/clearance"],
    ]);
  });

  it("requires headroom below the box height and a usable bed", () => {
    const p = newProject();
    p.box = { ...p.box, innerHeight: 40, headroom: 40 };
    p.printer = { ...p.printer, bedX: 200, bedY: 200, bedMargin: 100, layerHeight: 0 };
    expect(codes(validateProject(p))).toEqual([
      ["field.headroom", "/box/headroom"],
      ["field.bedMargin", "/printer/bedMargin"],
      ["field.layerHeight", "/printer/layerHeight"],
    ]);
  });

  it("checks settings ranges, including nested ones", () => {
    const p = newProject();
    p.settings = {
      ...p.settings,
      wall: 0.5,
      topPressFit: 1.5,
      lip: { ...p.settings.lip, thickness: 0.4 },
    };
    expect(codes(validateProject(p))).toEqual([
      ["field.setting", "/settings/wall"],
      ["field.setting", "/settings/lip/thickness"],
      ["field.setting", "/settings/topPressFit"],
    ]);
  });

  it("treats duplicate component ids as blocking", () => {
    const a = newComponent("custom");
    const notices = validateProject(withComponents(a, { ...a }));
    expect(codes(notices)).toEqual([["invalid.duplicateId", "/components/1/id"]]);
    expect(notices.every(isBlocking)).toBe(true);
  });

  it("checks lock paths and sizes", () => {
    const p = newProject();
    p.locks = [
      { kind: "position", trayKey: "a:p0:0", path: "01x", rotated: false },
      { kind: "size", trayKey: "a:p0:0", w: 2000, d: 50, h: 30 },
      { kind: "stack", trayKeys: [] },
    ];
    expect(codes(validateProject(p))).toEqual([
      ["field.lockPath", "/locks/0/path"],
      ["limit.length", "/locks/1/w"],
      ["field.lockStack", "/locks/2/trayKeys"],
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

From the repo root: `npx vitest run src/model/validate.test.ts`

Expected: FAIL with `Error: Cannot find module './validate'`.

- [ ] **Step 3: Implement**

`src/model/validate.ts`:

```ts
import type { Component, Lock, Notice, Project, Settings } from "./types";

/** Spec §5 bounds, applied to UI edits, URL input and files. */
export const BOUNDS: { maxComponents: 100; maxCount: 2000; maxLength: 1000; maxPlayers: 10 } = {
  maxComponents: 100,
  maxCount: 2000,
  maxLength: 1000,
  maxPlayers: 10,
};

/** 1000 mm × 1000 mm × 1000 mm, in ml. */
export const MAX_VOLUME_ML = 1_000_000;

/**
 * Notices that make a file or link unloadable: upper bounds (`limit.*`, they
 * protect the optimizer from absurd input) and corrupt structure
 * (`invalid.*`). Everything else (`field.*`) is shown next to the field and
 * the project still loads, so a half-edited autosave never locks the user out.
 */
export function isBlocking(n: Notice): boolean {
  return n.level === "error" && (n.code.startsWith("limit.") || n.code.startsWith("invalid."));
}

interface SettingRange {
  path: string;
  label: string;
  get: (s: Settings) => number;
  min: number;
  max: number;
}

/**
 * Advanced-settings ranges. Minimums of 0.8 mm follow the minimum printable
 * feature width (spec §6.1); topPressFit is spec §3 rule 2.
 */
export const SETTING_RANGES: SettingRange[] = [
  { path: "wall", label: "Wall", get: (s) => s.wall, min: 0.8, max: 10 },
  { path: "floor", label: "Floor", get: (s) => s.floor, min: 0.8, max: 10 },
  { path: "divider", label: "Divider", get: (s) => s.divider, min: 0.8, max: 10 },
  { path: "fit", label: "Fit", get: (s) => s.fit, min: 0.1, max: 3 },
  { path: "cardClearance", label: "Card clearance", get: (s) => s.cardClearance, min: 0, max: 20 },
  {
    path: "cardStackClearance",
    label: "Card stack clearance",
    get: (s) => s.cardStackClearance,
    min: 0,
    max: 20,
  },
  {
    path: "cardStackClearancePct",
    label: "Card stack clearance (fraction of the stack)",
    get: (s) => s.cardStackClearancePct,
    min: 0,
    max: 0.5,
  },
  {
    path: "cardThickness",
    label: "Card thickness",
    get: (s) => s.cardThickness,
    min: 0.05,
    max: 5,
  },
  {
    path: "pieceClearance",
    label: "Piece clearance",
    get: (s) => s.pieceClearance,
    min: 0,
    max: 20,
  },
  { path: "boxClearance", label: "Box clearance", get: (s) => s.boxClearance, min: 0, max: 10 },
  { path: "trayGap", label: "Tray gap", get: (s) => s.trayGap, min: 0, max: 5 },
  { path: "bottomChamfer", label: "Bottom chamfer", get: (s) => s.bottomChamfer, min: 0, max: 3 },
  { path: "cornerRadius", label: "Corner radius", get: (s) => s.cornerRadius, min: 0, max: 50 },
  { path: "scoopRadius", label: "Scoop radius", get: (s) => s.scoopRadius, min: 0, max: 100 },
  {
    path: "fingerPocket/width",
    label: "Finger pocket width",
    get: (s) => s.fingerPocket.width,
    min: 5,
    max: 100,
  },
  {
    path: "fingerPocket/reach",
    label: "Finger pocket reach",
    get: (s) => s.fingerPocket.reach,
    min: 0,
    max: 100,
  },
  { path: "lip/height", label: "Lip height", get: (s) => s.lip.height, min: 0.5, max: 10 },
  { path: "lip/thickness", label: "Lip thickness", get: (s) => s.lip.thickness, min: 0.8, max: 5 },
  { path: "lip/ledge", label: "Lip ledge", get: (s) => s.lip.ledge, min: 0.5, max: 10 },
  { path: "lip/play", label: "Lip play", get: (s) => s.lip.play, min: 0, max: 2 },
  { path: "topPressFit", label: "Top press fit", get: (s) => s.topPressFit, min: -2, max: 1 },
  {
    path: "packingFactor",
    label: "Packing factor",
    get: (s) => s.packingFactor,
    min: 0.05,
    max: 1,
  },
];

class Checker {
  readonly notices: Notice[] = [];

  error(code: string, path: string, message: string): void {
    this.notices.push({ level: "error", code, path, message });
  }

  warning(code: string, path: string, message: string): void {
    this.notices.push({ level: "warning", code, path, message });
  }

  /** 0 < x ≤ 1000 mm. `!(x > 0)` also catches NaN. */
  length(path: string, label: string, x: number): void {
    if (!(x > 0)) {
      this.error("field.length", path, `${label} must be greater than 0 mm.`);
    } else if (x > BOUNDS.maxLength) {
      this.error("limit.length", path, `${label} must be at most ${BOUNDS.maxLength} mm.`);
    }
  }

  /** 0 ≤ x ≤ 1000 mm. */
  nonNegativeLength(path: string, label: string, x: number): void {
    if (!(x >= 0)) {
      this.error("field.length", path, `${label} must be 0 mm or more.`);
    } else if (x > BOUNDS.maxLength) {
      this.error("limit.length", path, `${label} must be at most ${BOUNDS.maxLength} mm.`);
    }
  }

  /** Whole number 1…2000. */
  count(path: string, label: string, n: number): void {
    if (!Number.isInteger(n) || n < 1) {
      this.error("field.count", path, `${label} must be a whole number of at least 1.`);
    } else if (n > BOUNDS.maxCount) {
      this.error("limit.count", path, `${label} must be at most ${BOUNDS.maxCount}.`);
    }
  }

  notEmpty(path: string, what: string, list: unknown[]): void {
    if (list.length === 0) {
      this.error("field.empty", path, `Add at least one ${what}.`);
    }
  }
}

function checkBase(ck: Checker, c: Component, at: string): void {
  if (c.perPlayer) {
    const n = c.perPlayer.players;
    if (!Number.isInteger(n) || n < 1) {
      ck.error(
        "field.players",
        `${at}/perPlayer/players`,
        "Players must be a whole number of at least 1.",
      );
    } else if (n > BOUNDS.maxPlayers) {
      ck.error(
        "limit.players",
        `${at}/perPlayer/players`,
        `Players must be at most ${BOUNDS.maxPlayers}.`,
      );
    }
    if (c.groupId !== undefined) {
      ck.error(
        "field.perPlayerInGroup",
        `${at}/perPlayer`,
        "A grouped component can't be per player. Remove it from the group or turn off per player.",
      );
    }
  }
  if (c.clearance !== undefined) {
    ck.nonNegativeLength(`${at}/clearance`, "Clearance", c.clearance);
  }
}

function checkComponent(ck: Checker, c: Component, at: string): void {
  checkBase(ck, c, at);
  switch (c.kind) {
    case "cards": {
      ck.length(`${at}/shortSide`, "Card short side", c.shortSide);
      ck.length(`${at}/longSide`, "Card long side", c.longSide);
      if (c.shortSide > c.longSide) {
        ck.warning(
          "field.cardSides",
          `${at}/shortSide`,
          "The short side is longer than the long side; they will be swapped.",
        );
      }
      ck.notEmpty(`${at}/decks`, "deck", c.decks);
      c.decks.forEach((deck, i) => {
        ck.count(`${at}/decks/${i}/count`, "Card count", deck.count);
      });
      if (typeof c.sleeve === "object") {
        ck.length(`${at}/sleeve/w`, "Sleeve width", c.sleeve.w);
        ck.length(`${at}/sleeve/h`, "Sleeve height", c.sleeve.h);
        ck.nonNegativeLength(`${at}/sleeve/thickness`, "Sleeve thickness", c.sleeve.thickness);
      }
      if (c.thickness.mode === "measured") {
        ck.count(`${at}/thickness/cards`, "Measured card count", c.thickness.cards);
        ck.length(`${at}/thickness/stackMm`, "Measured stack height", c.thickness.stackMm);
      }
      return;
    }
    case "bulk":
      ck.notEmpty(`${at}/items`, "item", c.items);
      c.items.forEach((item, i) => {
        const p = `${at}/items/${i}`;
        if ("volumeMl" in item) {
          if (!(item.volumeMl > 0)) {
            ck.error("field.volume", `${p}/volumeMl`, "Volume must be greater than 0 ml.");
          } else if (item.volumeMl > MAX_VOLUME_ML) {
            ck.error(
              "limit.volume",
              `${p}/volumeMl`,
              `Volume must be at most ${MAX_VOLUME_ML} ml.`,
            );
          }
        } else {
          ck.count(`${p}/count`, "Count", item.count);
          ck.length(`${p}/w`, "Width", item.w);
          ck.length(`${p}/d`, "Depth", item.d);
          ck.length(`${p}/h`, "Height", item.h);
        }
      });
      return;
    case "tiles":
      if (c.shape.type === "rect") {
        ck.length(`${at}/shape/w`, "Tile width", c.shape.w);
        ck.length(`${at}/shape/d`, "Tile depth", c.shape.d);
      } else {
        ck.length(`${at}/shape/flatToFlat`, "Hex size (flat to flat)", c.shape.flatToFlat);
      }
      ck.length(`${at}/thickness`, "Tile thickness", c.thickness);
      ck.count(`${at}/count`, "Tile count", c.count);
      return;
    case "minis":
      ck.notEmpty(`${at}/figures`, "figure", c.figures);
      c.figures.forEach((f, i) => {
        const p = `${at}/figures/${i}`;
        ck.length(`${p}/w`, "Width", f.w);
        ck.length(`${p}/d`, "Depth", f.d);
        ck.length(`${p}/h`, "Height", f.h);
        ck.count(`${p}/count`, "Count", f.count);
      });
      return;
    case "custom":
      ck.length(`${at}/w`, "Width", c.w);
      ck.length(`${at}/d`, "Depth", c.d);
      ck.length(`${at}/h`, "Height", c.h);
      ck.count(`${at}/count`, "Count", c.count);
      return;
  }
}

function checkLock(ck: Checker, lock: Lock, at: string): void {
  switch (lock.kind) {
    case "position":
      if (!/^[01]*$/.test(lock.path)) {
        ck.error("field.lockPath", `${at}/path`, "A position lock path may only contain 0 and 1.");
      }
      return;
    case "size":
      ck.length(`${at}/w`, "Locked width", lock.w);
      ck.length(`${at}/d`, "Locked depth", lock.d);
      ck.length(`${at}/h`, "Locked height", lock.h);
      return;
    case "stack":
      if (lock.trayKeys.length === 0) {
        ck.error("field.lockStack", `${at}/trayKeys`, "A stack lock needs at least one tray.");
      }
      return;
  }
}

/**
 * Field-level validation (spec §5 bounds, spec §10). Never throws; every
 * problem is a Notice whose `path` points at the field. Plans 4 and 5 must not
 * optimize while any notice has level "error".
 */
export function validateProject(p: Project): Notice[] {
  const ck = new Checker();
  const { box, printer, settings } = p;

  ck.length("/box/innerWidth", "Box width", box.innerWidth);
  ck.length("/box/innerDepth", "Box depth", box.innerDepth);
  ck.length("/box/innerHeight", "Box height", box.innerHeight);
  ck.nonNegativeLength("/box/headroom", "Headroom", box.headroom);
  if (box.headroom >= box.innerHeight) {
    ck.error("field.headroom", "/box/headroom", "Headroom must be less than the box height.");
  }

  ck.length("/printer/bedX", "Bed X", printer.bedX);
  ck.length("/printer/bedY", "Bed Y", printer.bedY);
  ck.length("/printer/bedZ", "Bed Z", printer.bedZ);
  ck.nonNegativeLength("/printer/bedMargin", "Bed margin", printer.bedMargin);
  if (2 * printer.bedMargin >= Math.min(printer.bedX, printer.bedY)) {
    ck.error("field.bedMargin", "/printer/bedMargin", "Bed margin leaves no usable bed.");
  }
  if (!(printer.layerHeight >= 0.05 && printer.layerHeight <= 1)) {
    ck.error("field.layerHeight", "/printer/layerHeight", "Layer height must be 0.05 to 1 mm.");
  }

  for (const r of SETTING_RANGES) {
    const v = r.get(settings);
    if (!(v >= r.min && v <= r.max)) {
      ck.error(
        "field.setting",
        `/settings/${r.path}`,
        `${r.label} must be from ${r.min} to ${r.max}.`,
      );
    }
  }

  if (p.components.length > BOUNDS.maxComponents) {
    ck.error(
      "limit.components",
      "/components",
      `Too many components (${p.components.length}); the maximum is ${BOUNDS.maxComponents}.`,
    );
  }
  const seen = new Set<string>();
  p.components.forEach((c, i) => {
    if (seen.has(c.id)) {
      ck.error(
        "invalid.duplicateId",
        `/components/${i}/id`,
        `Two components share the id "${c.id}".`,
      );
    }
    seen.add(c.id);
    checkComponent(ck, c, `/components/${i}`);
  });

  p.locks.forEach((lock, i) => {
    checkLock(ck, lock, `/locks/${i}`);
  });

  return ck.notices;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/model/validate.test.ts && npx tsc --noEmit
```

Expected: `Tests  21 passed`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/model
git commit -m "Add project validation with spec bounds"
```

---

### Task 7: Inputs hash

**Files:**

- Create: `src/model/hash.ts`
- Test: `src/model/hash.test.ts`

**Interfaces:**

- Consumes: types (Task 3), `newProject()`, `newComponent()` (Task 5, tests only).
- Produces: `inputsHash(p: Project): string` (14 lowercase hex chars; covers box, printer, settings, components with every `name` removed, locks; excludes project id/name, `schemaVersion`, `createdWith`, `layout`); `canonicalJson(value: unknown): string`; `cyrb53(str: string, seed?: number): number`.

- [ ] **Step 1: Write the failing test**

`src/model/hash.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { newComponent, newProject } from "./defaults";
import { canonicalJson, cyrb53, inputsHash } from "./hash";
import type { BulkComponent, CardsComponent, MinisComponent, Project } from "./types";

function sample(): Project {
  const p = newProject();
  p.components = [newComponent("cards"), newComponent("bulk"), newComponent("minis")];
  p.locks = [
    { kind: "position", trayKey: `${p.components[0]?.id ?? ""}:p0:0`, path: "01", rotated: false },
  ];
  return p;
}

describe("canonicalJson", () => {
  it("sorts keys at every level and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,1]},"b":1}',
    );
  });

  it("skips undefined properties", () => {
    expect(canonicalJson({ a: undefined, b: 2 })).toBe('{"b":2}');
  });
});

describe("cyrb53", () => {
  it("is stable across releases (pinned values)", () => {
    expect(cyrb53("")).toBe(3338908027751811);
    expect(cyrb53("insert")).toBe(cyrb53("insert"));
    expect(cyrb53("insert")).not.toBe(cyrb53("insers"));
  });
});

describe("inputsHash", () => {
  it("is 14 hex characters", () => {
    expect(inputsHash(sample())).toMatch(/^[0-9a-f]{14}$/);
  });

  it("ignores every name, the project id, versions and the stored layout", () => {
    const p = sample();
    const before = inputsHash(p);
    const [c0, c1, c2] = p.components as [CardsComponent, BulkComponent, MinisComponent];
    const renamed: Project = {
      ...p,
      id: "zzzzzzzz",
      name: "Renamed",
      schemaVersion: "0.9.0",
      createdWith: "9.9.9",
      layout: {
        createdWith: "0.1.0",
        geometryVersion: "0.1.0",
        inputsHash: "x",
        seed: 1,
        iterations: 1,
        capped: false,
        trays: [],
      },
      components: [
        { ...c0, name: "Other", decks: c0.decks.map((d) => ({ ...d, name: `${d.name}!` })) },
        {
          ...c1,
          name: "Other",
          items: c1.items.map((it) => ({ ...it, name: "x" })),
        },
        { ...c2, name: "Other", figures: c2.figures.map((f) => ({ ...f, name: "x" })) },
      ],
    };
    expect(inputsHash(renamed)).toBe(before);
  });

  it("ignores key order", () => {
    const p = sample();
    const reordered: Project = {
      ...p,
      box: {
        storedOnSide: p.box.storedOnSide,
        headroomCoverage: p.box.headroomCoverage,
        headroom: p.box.headroom,
        innerHeight: p.box.innerHeight,
        innerDepth: p.box.innerDepth,
        innerWidth: p.box.innerWidth,
      },
    };
    expect(inputsHash(reordered)).toBe(inputsHash(p));
  });

  it("changes when any box dimension changes", () => {
    const p = sample();
    const before = inputsHash(p);
    fc.assert(
      fc.property(
        fc.constantFrom("innerWidth", "innerDepth", "innerHeight", "headroom"),
        fc.integer({ min: 1, max: 100_000 }).map((n) => n / 100),
        (field, delta) => {
          const changed: Project = { ...p, box: { ...p.box, [field]: p.box[field] + delta } };
          expect(inputsHash(changed)).not.toBe(before);
        },
      ),
    );
  });

  it("changes when a component, setting, printer value, lock or component order changes", () => {
    const p = sample();
    const before = inputsHash(p);
    const [c0, c1, c2] = p.components as [CardsComponent, BulkComponent, MinisComponent];
    const variants: Project[] = [
      { ...p, components: [{ ...c0, longSide: 89 }, c1, c2] },
      { ...p, components: [{ ...c0, decks: [{ name: "Deck", count: 51 }] }, c1, c2] },
      { ...p, components: [{ ...c0, access: "often" }, c1, c2] },
      { ...p, components: [c1, c0, c2] },
      { ...p, settings: { ...p.settings, lip: { ...p.settings.lip, play: 0.3 } } },
      { ...p, printer: { ...p.printer, layerHeight: 0.28 } },
      { ...p, locks: [] },
    ];
    for (const v of variants) {
      expect(inputsHash(v)).not.toBe(before);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

From the repo root: `npx vitest run src/model/hash.test.ts`

Expected: FAIL with `Error: Cannot find module './hash'`.

- [ ] **Step 3: Implement**

`src/model/hash.ts`:

```ts
import type { Project } from "./types";

/**
 * JSON with object keys sorted at every level, so key order never changes the
 * hash. Arrays keep their order. `undefined` properties are skipped, as in
 * JSON.stringify.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v ?? null)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Deep copy without any `name` property (component, deck, item and figure names). */
function withoutNames(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutNames);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k !== "name") {
        out[k] = withoutNames(v);
      }
    }
    return out;
  }
  return value;
}

/** cyrb53 (public domain, bryc): fast 53-bit string hash. Not cryptographic. */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Hash of everything that affects the layout (spec §5 StoredLayout.inputsHash):
 * box, printer, settings, components and locks. Names are left out, so
 * renaming never triggers a re-optimize. Project id, name, schemaVersion,
 * createdWith and the stored layout itself are left out too. Unknown fields
 * preserved from a newer-minor file are included as-is. 14 hex characters.
 */
export function inputsHash(p: Project): string {
  const canonical = canonicalJson({
    box: p.box,
    printer: p.printer,
    settings: p.settings,
    components: withoutNames(p.components),
    locks: p.locks,
  });
  return cyrb53(canonical).toString(16).padStart(14, "0");
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/model/hash.test.ts && npx tsc --noEmit
```

Expected: `Tests  8 passed`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/model
git commit -m "Add inputs hash that ignores names"
```

---

### Task 8: Schema reader for untrusted project JSON

**Files:**

- Create: `src/model/schema-read.ts`
- Create (test-only helper): `src/test-support/sample.ts`
- Test: `src/model/schema-read.test.ts`

**Interfaces:**

- Consumes: `DEFAULT_BOX`, `DEFAULT_PRINTER`, `DEFAULT_PROJECT_NAME`, `KIND_NAMES` (Task 5), `newId()` (Task 4), `DEFAULT_SETTINGS` (Task 3), types.
- Produces:
  - `type Json = Record<string, unknown>`, `isRecord(x: unknown): x is Json`, `summarize(problems: string[]): string`
  - `pointerKeys(path: string): string[]` (RFC 6901: `"/settings/lip/play"` → `["settings", "lip", "play"]`), `valueAt(root: unknown, keys: string[]): unknown`
  - `interface ReadOptions { newer: boolean; schemaVersion: string }`
  - `readProject(data: Json, opts: ReadOptions): ParseResult` — fills defaults; `newer: true` keeps unknown fields, turns unreadable components into `foreign.components` entries, replaces unknown box/printer/settings values by defaults and records the raw values in `foreign.values` (`schema.unknownValue`), keeps locks of unknown kinds unapplied in `foreign.values`, keeps unknown trays verbatim (`layout.unsupportedTrays`); `foreign.values` is absent when empty; `newer: false` drops unknown fields (`schema.unknownFields`) and treats unknown values as errors. Always: unreadable locks → `lock.dropped`, unreadable layout → `layout.dropped`, swapped card sides → `schema.cardSidesSwapped`. No bounds checks (Task 9 adds them).
  - `sampleProject(): Project` (test-only; ids `cards001`, `cards002`, `bulk0001`, `tiles001`, `minis001`, `custom01`; three locks; a one-tray layout)

- [ ] **Step 1: Write the test helper and the failing test**

`src/test-support/sample.ts`:

```ts
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Project } from "../model/types";
import { APP_VERSION, SCHEMA_VERSION } from "../model/version";

/**
 * A deterministic project that uses every component kind, every optional
 * component field, every lock kind and a stored layout. Test-only.
 */
export function sampleProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdWith: APP_VERSION,
    id: "sample01",
    name: "Sample",
    box: {
      innerWidth: 290,
      innerDepth: 290,
      innerHeight: 70,
      headroom: 8,
      headroomCoverage: "partial",
      storedOnSide: false,
    },
    printer: { bedX: 256, bedY: 256, bedZ: 256, bedMargin: 5, layerHeight: 0.2 },
    settings: structuredClone(DEFAULT_SETTINGS),
    components: [
      {
        id: "cards001",
        name: "Main deck",
        access: "often",
        kind: "cards",
        shortSide: 63.5,
        longSide: 88,
        decks: [
          { name: "Action", count: 60 },
          { name: "Event", count: 40 },
        ],
        sleeve: "standard",
        thickness: { mode: "preset" },
        storage: "auto",
      },
      {
        id: "cards002",
        name: "Big cards",
        access: "setup",
        kind: "cards",
        shortSide: 70,
        longSide: 120,
        decks: [{ name: "Scenario", count: 12 }],
        sleeve: { w: 73, h: 123, thickness: 0.15 },
        thickness: { mode: "measured", cards: 12, stackMm: 5.4 },
        storage: "flat",
        groupId: "setup",
        clearance: 2,
      },
      {
        id: "bulk0001",
        name: "Player bits",
        access: "sometimes",
        kind: "bulk",
        perPlayer: { players: 4 },
        items: [
          { name: "Meeple", count: 5, w: 16, d: 10, h: 16 },
          { name: "Score marker", volumeMl: 20 },
        ],
      },
      {
        id: "tiles001",
        name: "Map tiles",
        access: "setup",
        kind: "tiles",
        shape: { type: "hex", flatToFlat: 40, orientation: "pointy" },
        thickness: 2,
        count: 60,
        storage: "auto",
        groupId: "setup",
      },
      {
        id: "minis001",
        name: "Heroes",
        access: "sometimes",
        kind: "minis",
        figures: [
          { name: "Knight", w: 25, d: 25, h: 45, count: 2 },
          { name: "Dragon", w: 60, d: 50, h: 70, count: 1 },
        ],
        storage: "pockets",
      },
      {
        id: "custom01",
        name: "Score pad",
        access: "setup",
        kind: "custom",
        w: 100,
        d: 70,
        h: 10,
        count: 1,
      },
    ],
    locks: [
      { kind: "position", trayKey: "cards001:p0:0", path: "01", rotated: true },
      { kind: "size", trayKey: "minis001:p0:0", w: 120, d: 80, h: 61.8 },
      { kind: "stack", trayKeys: ["setup:p0:0", "cards001:p0:0"] },
    ],
    layout: {
      createdWith: APP_VERSION,
      geometryVersion: "0.1.0",
      inputsHash: "00000000000000",
      seed: 42,
      iterations: 3000,
      capped: false,
      trays: [
        {
          key: "custom01:p0:0",
          part: "tray",
          path: "1",
          stack: 0,
          level: 0,
          x: 0,
          y: 0,
          z: 0,
          w: 104,
          d: 74,
          h: 62,
          rotated: false,
          wall: 1.6,
          floor: 1.2,
          lip: false,
          solid: false,
          compartments: [
            {
              x: 1.6,
              y: 1.6,
              w: 100.8,
              d: 70.8,
              floorZ: 50,
              kind: "well",
              contents: "Score pad",
              features: [
                { type: "fingerPocket", side: "front", at: 50.4, width: 22, reach: 12, depth: 12 },
                { type: "cornerRelief", d: 3 },
              ],
            },
          ],
        },
      ],
    },
  };
}
```

`src/model/schema-read.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sampleProject } from "../test-support/sample";
import type { Json, ReadOptions } from "./schema-read";
import { readProject } from "./schema-read";
import { DEFAULT_SETTINGS } from "./settings";
import type { ParseResult } from "./types";
import { SCHEMA_VERSION } from "./version";

const CURRENT: ReadOptions = { newer: false, schemaVersion: SCHEMA_VERSION };
const NEWER: ReadOptions = { newer: true, schemaVersion: "0.1.9" };

const MINIMAL: Json = {
  schemaVersion: SCHEMA_VERSION,
  box: { innerWidth: 290, innerDepth: 290, innerHeight: 70 },
  printer: { bedX: 256, bedY: 256, bedZ: 256 },
};

/** The sample project as plain JSON, the way a file holds it. */
function sampleJson(): Json {
  return JSON.parse(JSON.stringify(sampleProject())) as Json;
}

function list(raw: Json, key: string): Json[] {
  return raw[key] as Json[];
}

function at(raw: Json, key: string, index: number): Json {
  return list(raw, key)[index] as Json;
}

function expectOk(result: ParseResult) {
  if (!result.ok) {
    throw new Error(`expected ok, got: ${result.error}`);
  }
  return result;
}

function expectError(result: ParseResult): string {
  if (result.ok) {
    throw new Error("expected an error");
  }
  return result.error;
}

describe("readProject: files of this schema line", () => {
  it("reads every component kind, lock kind and the stored layout unchanged", () => {
    const result = expectOk(readProject(sampleJson(), CURRENT));
    expect(result.project).toEqual(sampleProject());
    expect(result.foreign).toEqual({ components: [] });
    expect(result.notices).toEqual([]);
  });

  it("does not modify its input", () => {
    const input = sampleJson();
    const copy = structuredClone(input);
    readProject(input, CURRENT);
    expect(input).toEqual(copy);
  });

  it("fills every optional field with its default", () => {
    const { project } = expectOk(readProject(MINIMAL, CURRENT));
    expect(project.name).toBe("Untitled insert");
    expect(project.id).toMatch(/^[0-9a-z]{8}$/);
    expect(project.createdWith).toBe("unknown");
    expect(project.box).toEqual({
      innerWidth: 290,
      innerDepth: 290,
      innerHeight: 70,
      headroom: 0,
      headroomCoverage: "full",
      storedOnSide: false,
    });
    expect(project.printer).toEqual({
      bedX: 256,
      bedY: 256,
      bedZ: 256,
      bedMargin: 5,
      layerHeight: 0.2,
    });
    expect(project.settings).toEqual(DEFAULT_SETTINGS);
    expect(project.components).toEqual([]);
    expect(project.locks).toEqual([]);
    expect(project.layout).toBeUndefined();
  });

  it("fills single missing settings, including nested ones", () => {
    const { project } = expectOk(
      readProject({ ...MINIMAL, settings: { wall: 2, lip: { enabled: false } } }, CURRENT),
    );
    expect(project.settings).toEqual({
      ...DEFAULT_SETTINGS,
      wall: 2,
      lip: { ...DEFAULT_SETTINGS.lip, enabled: false },
    });
  });

  it("fills component defaults", () => {
    const input = {
      ...MINIMAL,
      components: [
        { kind: "cards", shortSide: 63.5, longSide: 88, decks: [{ count: 10 }] },
        { kind: "minis", figures: [{ w: 25, d: 25, h: 40, count: 1 }] },
      ],
    };
    const [cards, minis] = expectOk(readProject(input, CURRENT)).project.components;
    expect(cards).toMatchObject({
      name: "Cards",
      access: "sometimes",
      sleeve: "none",
      thickness: { mode: "preset" },
      storage: "auto",
      decks: [{ name: "", count: 10 }],
    });
    expect(cards?.id).toMatch(/^[0-9a-z]{8}$/);
    expect(minis).toMatchObject({ name: "Miniatures", storage: "pockets", access: "sometimes" });
  });

  it("names a field with the wrong type", () => {
    const input = sampleJson();
    (input.box as Json).innerWidth = "290";
    expect(expectError(readProject(input, CURRENT))).toMatch(
      /\/box\/innerWidth: expected a number/,
    );
  });

  it("names missing required fields and summarizes long lists", () => {
    expect(expectError(readProject({ ...MINIMAL, box: { innerWidth: 1 } }, CURRENT))).toMatch(
      /\/box\/innerDepth: missing/,
    );
    expect(expectError(readProject({ schemaVersion: SCHEMA_VERSION }, CURRENT))).toMatch(
      /\/box: missing; \/printer: missing/,
    );
    expect(expectError(readProject({ ...MINIMAL, box: {}, printer: {} }, CURRENT))).toMatch(
      /and 3 more/,
    );
  });

  it("rejects an unknown component kind or value", () => {
    expect(
      expectError(readProject({ ...MINIMAL, components: [{ kind: "dial" }] }, CURRENT)),
    ).toMatch(/\/components\/0\/kind: unknown value "dial"/);
    const input = sampleJson();
    at(input, "components", 0).storage = "sideways";
    expect(expectError(readProject(input, CURRENT))).toMatch(
      /\/components\/0\/storage: unknown value "sideways"/,
    );
  });

  it("rejects an unknown settings value", () => {
    const input = sampleJson();
    (input.settings as Json).leftover = "hollow";
    expect(expectError(readProject(input, CURRENT))).toMatch(
      /\/settings\/leftover: unknown value "hollow"/,
    );
  });

  it("drops unknown fields with one info notice", () => {
    const input = sampleJson();
    input.extra = 1;
    (input.box as Json).lidColour = "red";
    const result = expectOk(readProject(input, CURRENT));
    expect(result.project).not.toHaveProperty("extra");
    expect(result.project.box).not.toHaveProperty("lidColour");
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toMatchObject({ level: "info", code: "schema.unknownFields" });
    expect(result.notices[0]?.message).toContain("/extra");
    expect(result.notices[0]?.message).toContain("/box/lidColour");
  });

  it("swaps card sides entered the wrong way round, with a notice", () => {
    const input = sampleJson();
    const cards = at(input, "components", 0);
    cards.shortSide = 88;
    cards.longSide = 63.5;
    const result = expectOk(readProject(input, CURRENT));
    expect(result.project.components[0]).toMatchObject({ shortSide: 63.5, longSide: 88 });
    expect(result.notices).toEqual([
      expect.objectContaining({ code: "schema.cardSidesSwapped", path: "/components/0/shortSide" }),
    ]);
  });

  it("drops unreadable locks with a notice and keeps the rest", () => {
    const input = sampleJson();
    list(input, "locks").push({ kind: "size", trayKey: "x" }, "junk" as unknown as Json);
    const result = expectOk(readProject(input, CURRENT));
    expect(result.project.locks).toEqual(sampleProject().locks);
    expect(result.notices.map((n) => [n.code, n.path])).toEqual([
      ["lock.dropped", "/locks/3"],
      ["lock.dropped", "/locks/4"],
    ]);
  });

  it("drops an unreadable stored layout with a notice", () => {
    const input = sampleJson();
    (input.layout as Json).seed = "forty-two";
    const result = expectOk(readProject(input, CURRENT));
    expect(result.project.layout).toBeUndefined();
    expect(result.notices.map((n) => n.code)).toEqual(["layout.dropped"]);
  });
});

describe("readProject: files from a newer minor", () => {
  it("writes the given schemaVersion", () => {
    expect(expectOk(readProject(sampleJson(), NEWER)).project.schemaVersion).toBe("0.1.9");
  });

  it("keeps unknown fields on the project, the box and components", () => {
    const input = sampleJson();
    input.theme = "dark";
    (input.box as Json).insertColour = "blue";
    at(input, "components", 0).wrap = "rubber band";
    const result = expectOk(readProject(input, NEWER));
    expect(result.project).toHaveProperty("theme", "dark");
    expect(result.project.box).toHaveProperty("insertColour", "blue");
    expect(result.project.components[0]).toHaveProperty("wrap", "rubber band");
    expect(result.notices).toEqual([]);
  });

  it("keeps unknown kinds and components with unknown values as foreign, with their indices", () => {
    const input = sampleJson();
    const comps = list(input, "components");
    comps.splice(1, 0, { id: "dial0001", name: "Dial", kind: "dial", diameter: 40 });
    at(input, "components", 4).shape = { type: "circle", diameter: 30 };
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.components.map((c) => c.id)).toEqual([
      "cards001",
      "cards002",
      "bulk0001",
      "minis001",
      "custom01",
    ]);
    expect(result.foreign.components).toEqual([
      { index: 1, raw: comps[1] },
      { index: 4, raw: comps[4] },
    ]);
    expect(result.notices.map((n) => [n.code, n.path])).toEqual([
      ["schema.foreignComponent", "/components/1"],
      ["schema.foreignComponent", "/components/4"],
    ]);
  });

  it("uses the default for unknown box and settings values and keeps the raw ones", () => {
    const input = sampleJson();
    (input.box as Json).headroomCoverage = "none";
    (input.settings as Json).leftover = "hollow";
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.box.headroomCoverage).toBe("full");
    expect(result.project.settings.leftover).toBe("spare");
    expect(result.foreign.values).toEqual([
      { path: "/box/headroomCoverage", raw: "none" },
      { path: "/settings/leftover", raw: "hollow" },
    ]);
    expect(result.notices.map((n) => [n.code, n.path])).toEqual([
      ["schema.unknownValue", "/box/headroomCoverage"],
      ["schema.unknownValue", "/settings/leftover"],
    ]);
  });

  it("keeps a lock of an unknown kind in foreign.values without applying it", () => {
    const input = sampleJson();
    const magnet = { kind: "magnet", trayKey: "x", strength: 3 };
    list(input, "locks").push(magnet);
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.locks).toEqual(sampleProject().locks);
    expect(result.foreign.values).toEqual([{ path: "/locks/3", raw: magnet }]);
    expect(result.notices.map((n) => [n.code, n.path])).toEqual([
      ["schema.unknownValue", "/locks/3"],
    ]);
  });

  it("still drops an unreadable lock of a known kind", () => {
    const input = sampleJson();
    list(input, "locks").push({ kind: "size", trayKey: "x" });
    const result = expectOk(readProject(input, NEWER));
    expect(result.foreign.values).toBeUndefined();
    expect(result.notices.map((n) => [n.code, n.path])).toEqual([["lock.dropped", "/locks/3"]]);
  });

  it("keeps a stored tray with an unknown feature verbatim and flags it", () => {
    const input = sampleJson();
    const tray = at(input.layout as Json, "trays", 0);
    const compartment = at(tray, "compartments", 0);
    list(compartment, "features").push({ type: "magnetHole", d: 6 });
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.layout?.trays[0]).toEqual(tray);
    expect(result.notices.map((n) => n.code)).toEqual(["layout.unsupportedTrays"]);

    const current = expectOk(readProject(input, CURRENT));
    expect(current.project.layout).toBeUndefined();
    expect(current.notices.map((n) => n.code)).toEqual(["layout.dropped"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

From the repo root: `npx vitest run src/model/schema-read.test.ts`

Expected: FAIL with `Error: Cannot find module './schema-read'`.

- [ ] **Step 3: Implement**

`src/model/schema-read.ts`:

```ts
import { DEFAULT_BOX, DEFAULT_PRINTER, DEFAULT_PROJECT_NAME, KIND_NAMES } from "./defaults";
import { newId } from "./ids";
import { DEFAULT_SETTINGS } from "./settings";
import type {
  Box,
  BulkItem,
  CompartmentSpec,
  Component,
  ComponentBase,
  ComponentKind,
  FeatureSpec,
  ForeignData,
  Lock,
  Notice,
  ParseResult,
  Printer,
  Project,
  Settings,
  Sleeve,
  StoredLayout,
  TileShape,
  TraySpec,
} from "./types";

// Turns untrusted project JSON of a known schema line into a typed Project.
// Version dispatch (which line, newer or not, migrations) lives in schema.ts.

export type Json = Record<string, unknown>;

export function isRecord(x: unknown): x is Json {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** RFC 6901 JSON pointer → keys: "/settings/lip/play" → ["settings", "lip", "play"]. */
export function pointerKeys(path: string): string[] {
  return path
    .split("/")
    .slice(1)
    .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** The value at `keys` inside plain JSON data, or undefined. */
export function valueAt(root: unknown, keys: string[]): unknown {
  let node = root;
  for (const k of keys) {
    if (Array.isArray(node)) {
      node = node[Number(k)];
    } else if (isRecord(node)) {
      node = node[k];
    } else {
      return undefined;
    }
  }
  return node;
}

type ForeignValue = NonNullable<ForeignData["values"]>[number];

/** Shared state of one read. Child scopes (a component, a lock, a tray) get their own errors. */
interface Ctx {
  /** File is from a newer MINOR of the same line: keep unknown fields, don't fail on unknown values. */
  newer: boolean;
  /** Structural problems; any left at the end of a scope make that scope unreadable. */
  errors: string[];
  /** Newer files only: paths of enum values this app doesn't know. */
  unknownValues: string[];
  /** Same-or-older files only: paths of unknown fields that were dropped. */
  dropped: string[];
  notices: Notice[];
}

function childCtx(ctx: Ctx): Ctx {
  return { newer: ctx.newer, errors: [], unknownValues: [], dropped: [], notices: [] };
}

/** Keeps a child scope's dropped-field paths and notices once the scope itself is kept. */
function adopt(parent: Ctx, child: Ctx): void {
  parent.dropped.push(...child.dropped);
  parent.notices.push(...child.notices);
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly [T, ...T[]],
  path: string,
  ctx: Ctx,
  fallback?: T,
): T {
  if (value === undefined && fallback !== undefined) {
    return fallback;
  }
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  if (typeof value === "string" && ctx.newer) {
    ctx.unknownValues.push(path);
  } else {
    ctx.errors.push(
      `${path}: ${value === undefined ? "missing" : `unknown value ${JSON.stringify(value)}`}`,
    );
  }
  return fallback ?? allowed[0];
}

/** Reads typed fields from one JSON object and remembers which keys it used. */
class Reader {
  readonly raw: Json;
  readonly path: string;
  readonly ctx: Ctx;
  private readonly used = new Set<string>();

  constructor(raw: Json, path: string, ctx: Ctx) {
    this.raw = raw;
    this.path = path;
    this.ctx = ctx;
  }

  at(key: string): string {
    return `${this.path}/${key}`;
  }

  has(key: string): boolean {
    return this.raw[key] !== undefined;
  }

  /** The raw value, marked as read. */
  take(key: string): unknown {
    this.used.add(key);
    return this.raw[key];
  }

  private problem(key: string, message: string): void {
    this.ctx.errors.push(`${this.at(key)}: ${message}`);
  }

  num(key: string, fallback?: number): number {
    const v = this.take(key);
    if (v === undefined && fallback !== undefined) {
      return fallback;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      return v;
    }
    this.problem(key, v === undefined ? "missing" : "expected a number");
    return 0;
  }

  optNum(key: string): number | undefined {
    if (!this.has(key)) {
      this.used.add(key);
      return undefined;
    }
    return this.num(key);
  }

  str(key: string, fallback?: string): string {
    const v = this.take(key);
    if (v === undefined && fallback !== undefined) {
      return fallback;
    }
    if (typeof v === "string") {
      return v;
    }
    this.problem(key, v === undefined ? "missing" : "expected text");
    return "";
  }

  optStr(key: string): string | undefined {
    if (!this.has(key)) {
      this.used.add(key);
      return undefined;
    }
    return this.str(key);
  }

  bool(key: string, fallback?: boolean): boolean {
    const v = this.take(key);
    if (v === undefined && fallback !== undefined) {
      return fallback;
    }
    if (typeof v === "boolean") {
      return v;
    }
    this.problem(key, v === undefined ? "missing" : "expected true or false");
    return false;
  }

  oneOf<T extends string>(key: string, allowed: readonly [T, ...T[]], fallback?: T): T {
    return readEnum(this.take(key), allowed, this.at(key), this.ctx, fallback);
  }

  /** A nested object; null (and an error) when missing or not an object. */
  child(key: string): Reader | null {
    const v = this.take(key);
    if (isRecord(v)) {
      return new Reader(v, this.at(key), this.ctx);
    }
    this.problem(key, v === undefined ? "missing" : "expected an object");
    return null;
  }

  /** A nested object that may be absent. */
  optChild(key: string): Reader | undefined {
    if (!this.has(key)) {
      this.used.add(key);
      return undefined;
    }
    return this.child(key) ?? undefined;
  }

  list(key: string, fallback?: unknown[]): unknown[] {
    const v = this.take(key);
    if (v === undefined && fallback !== undefined) {
      return fallback;
    }
    if (Array.isArray(v)) {
      return v;
    }
    this.problem(key, v === undefined ? "missing" : "expected a list");
    return [];
  }

  /** A list whose entries must all be objects. */
  objects(key: string, fallback?: unknown[]): Reader[] {
    const out: Reader[] = [];
    this.list(key, fallback).forEach((v, i) => {
      if (isRecord(v)) {
        out.push(new Reader(v, `${this.at(key)}/${i}`, this.ctx));
      } else {
        this.ctx.errors.push(`${this.at(key)}/${i}: expected an object`);
      }
    });
    return out;
  }

  /**
   * Call after reading every known key. Newer files: unknown keys are kept
   * (spec §9: preserved verbatim on save). Otherwise they are dropped and
   * reported once.
   */
  finish<T extends object>(value: T): T {
    const rest: Json = {};
    for (const [k, v] of Object.entries(this.raw)) {
      if (!this.used.has(k)) {
        rest[k] = v;
      }
    }
    const keys = Object.keys(rest);
    if (keys.length === 0) {
      return value;
    }
    if (this.ctx.newer) {
      return { ...rest, ...value };
    }
    for (const k of keys) {
      this.ctx.dropped.push(this.at(k));
    }
    return value;
  }
}

const COMPONENT_KINDS = ["cards", "bulk", "tiles", "minis", "custom"] as const;
const SIDES = ["front", "back", "left", "right"] as const;
const SLEEVE_NAMES = ["none", "standard", "premium"] as const;

function readBase(r: Reader, kind: ComponentKind): ComponentBase {
  const base: ComponentBase = {
    id: r.str("id", newId()),
    name: r.str("name", KIND_NAMES[kind]),
    access: r.oneOf("access", ["often", "sometimes", "setup"], "sometimes"),
  };
  const groupId = r.optStr("groupId");
  if (groupId !== undefined) {
    base.groupId = groupId;
  }
  const perPlayer = r.optChild("perPlayer");
  if (perPlayer) {
    base.perPlayer = perPlayer.finish({ players: perPlayer.num("players") });
  }
  const clearance = r.optNum("clearance");
  if (clearance !== undefined) {
    base.clearance = clearance;
  }
  return base;
}

function readSleeve(r: Reader): Sleeve {
  const v = r.take("sleeve");
  if (isRecord(v)) {
    const s = new Reader(v, r.at("sleeve"), r.ctx);
    return s.finish({ w: s.num("w"), h: s.num("h"), thickness: s.num("thickness") });
  }
  return readEnum(v, SLEEVE_NAMES, r.at("sleeve"), r.ctx, "none");
}

function readCards(r: Reader, base: ComponentBase): Component {
  let shortSide = r.num("shortSide");
  let longSide = r.num("longSide");
  if (shortSide > longSide) {
    [shortSide, longSide] = [longSide, shortSide];
    r.ctx.notices.push({
      level: "info",
      code: "schema.cardSidesSwapped",
      path: r.at("shortSide"),
      message: `Card sides of "${base.name}" were the wrong way round and have been swapped.`,
    });
  }
  const decks = r
    .objects("decks")
    .map((d) => d.finish({ name: d.str("name", ""), count: d.num("count") }));
  const sleeve = readSleeve(r);
  const t = r.optChild("thickness");
  let thickness: { mode: "preset" } | { mode: "measured"; cards: number; stackMm: number } = {
    mode: "preset",
  };
  if (t) {
    const mode = t.oneOf("mode", ["preset", "measured"]);
    thickness = t.finish(
      mode === "measured"
        ? { mode, cards: t.num("cards"), stackMm: t.num("stackMm") }
        : { mode: "preset" as const },
    );
  }
  const storage = r.oneOf("storage", ["upright-long", "upright-short", "flat", "auto"], "auto");
  return r.finish({
    ...base,
    kind: "cards",
    shortSide,
    longSide,
    decks,
    sleeve,
    thickness,
    storage,
  });
}

function readBulkItem(r: Reader): BulkItem {
  if (r.has("volumeMl")) {
    return r.finish({ name: r.str("name", ""), volumeMl: r.num("volumeMl") });
  }
  return r.finish({
    name: r.str("name", ""),
    count: r.num("count"),
    w: r.num("w"),
    d: r.num("d"),
    h: r.num("h"),
  });
}

function readTileShape(r: Reader): TileShape {
  const s = r.child("shape");
  if (!s) {
    return { type: "rect", w: 0, d: 0 };
  }
  const type = s.oneOf("type", ["rect", "hex"]);
  if (type === "hex") {
    return s.finish({
      type,
      flatToFlat: s.num("flatToFlat"),
      orientation: s.oneOf("orientation", ["flat", "pointy"], "flat"),
    });
  }
  return s.finish({ type, w: s.num("w"), d: s.num("d") });
}

function readKnownComponent(r: Reader, kind: ComponentKind): Component {
  const base = readBase(r, kind);
  switch (kind) {
    case "cards":
      return readCards(r, base);
    case "bulk":
      return r.finish({ ...base, kind, items: r.objects("items").map(readBulkItem) });
    case "tiles":
      return r.finish({
        ...base,
        kind,
        shape: readTileShape(r),
        thickness: r.num("thickness"),
        count: r.num("count"),
        storage: r.oneOf("storage", ["flat", "upright", "auto"], "auto"),
      });
    case "minis":
      return r.finish({
        ...base,
        kind,
        figures: r.objects("figures").map((f) =>
          f.finish({
            name: f.str("name", ""),
            w: f.num("w"),
            d: f.num("d"),
            h: f.num("h"),
            count: f.num("count"),
          }),
        ),
        storage: r.oneOf("storage", ["pockets", "bulk"], "pockets"),
      });
    case "custom":
      return r.finish({
        ...base,
        kind,
        w: r.num("w"),
        d: r.num("d"),
        h: r.num("h"),
        count: r.num("count"),
      });
  }
}

/**
 * Newer-minor files: a component of an unknown kind, or with a value or shape
 * this app can't read, becomes foreign: kept verbatim, not laid out, and
 * re-inserted at its original index on save. Other files: it is an error.
 */
function readComponents(
  list: unknown[],
  ctx: Ctx,
): { components: Component[]; foreign: ForeignData } {
  const components: Component[] = [];
  const foreign: ForeignData = { components: [] };
  list.forEach((raw, index) => {
    const path = `/components/${index}`;
    const sub = childCtx(ctx);
    let component: Component | null = null;
    if (!isRecord(raw)) {
      sub.errors.push(`${path}: expected an object`);
    } else {
      const r = new Reader(raw, path, sub);
      const kind = r.oneOf("kind", COMPONENT_KINDS);
      if (sub.errors.length === 0 && sub.unknownValues.length === 0) {
        component = readKnownComponent(r, kind);
      }
    }
    const unreadable = sub.errors.length > 0 || sub.unknownValues.length > 0;
    if (unreadable && ctx.newer) {
      foreign.components.push({ index, raw });
      const name =
        isRecord(raw) && typeof raw.name === "string" ? `"${raw.name}"` : `#${index + 1}`;
      ctx.notices.push({
        level: "warning",
        code: "schema.foreignComponent",
        path,
        message: `Component ${name} uses features this app version doesn't know. It is kept but not laid out.`,
      });
    } else if (unreadable) {
      ctx.errors.push(...sub.errors);
    } else if (component) {
      components.push(component);
      adopt(ctx, sub);
    }
  });
  return { components, foreign };
}

function readLock(r: Reader): Lock {
  const kind = r.oneOf("kind", ["position", "size", "stack"]);
  switch (kind) {
    case "position":
      return r.finish({
        kind,
        trayKey: r.str("trayKey"),
        path: r.str("path"),
        rotated: r.bool("rotated", false),
      });
    case "size":
      return r.finish({
        kind,
        trayKey: r.str("trayKey"),
        w: r.num("w"),
        d: r.num("d"),
        h: r.num("h"),
      });
    case "stack": {
      const trayKeys = r.list("trayKeys").map((k, i) => {
        if (typeof k !== "string") {
          r.ctx.errors.push(`${r.at("trayKeys")}/${i}: expected text`);
        }
        return String(k);
      });
      return r.finish({ kind, trayKeys });
    }
  }
}

/**
 * Locks are always droppable (spec §7.2): an unreadable lock is dropped with a
 * notice, never fatal. In newer-minor files a lock of an unknown kind is not
 * applied but kept verbatim in `kept`, and written back at its index on save.
 */
function readLocks(list: unknown[], ctx: Ctx): { locks: Lock[]; kept: ForeignValue[] } {
  const locks: Lock[] = [];
  const kept: ForeignValue[] = [];
  list.forEach((raw, i) => {
    const path = `/locks/${i}`;
    const sub = childCtx(ctx);
    const lock = isRecord(raw) ? readLock(new Reader(raw, path, sub)) : null;
    if (lock && sub.errors.length === 0 && sub.unknownValues.length === 0) {
      locks.push(lock);
      adopt(ctx, sub);
    } else if (ctx.newer && sub.unknownValues.length > 0) {
      kept.push({ path, raw });
      ctx.notices.push({
        level: "warning",
        code: "schema.unknownValue",
        path,
        message:
          "This lock is of a kind this app version doesn't know. It is kept and saved back, but not applied.",
      });
    } else {
      ctx.notices.push({
        level: "warning",
        code: "lock.dropped",
        path,
        message: "A saved lock couldn't be read and was dropped.",
      });
    }
  });
  return { locks, kept };
}

function readFeature(r: Reader): FeatureSpec {
  const known = r.ctx.unknownValues.length;
  const type = r.oneOf("type", ["fingerPocket", "scoop", "cornerRelief"]);
  if (r.ctx.unknownValues.length > known) {
    // Newer file, unknown feature type: keep it verbatim (its fields are unknown too).
    return r.raw as unknown as FeatureSpec;
  }
  switch (type) {
    case "fingerPocket":
      return r.finish({
        type,
        side: r.oneOf("side", SIDES),
        at: r.num("at"),
        width: r.num("width"),
        reach: r.num("reach"),
        depth: r.num("depth"),
      });
    case "scoop":
      return r.finish({ type, side: r.oneOf("side", SIDES), r: r.num("r") });
    case "cornerRelief":
      return r.finish({ type, d: r.num("d") });
  }
}

function readCompartment(r: Reader): CompartmentSpec {
  return r.finish({
    x: r.num("x"),
    y: r.num("y"),
    w: r.num("w"),
    d: r.num("d"),
    floorZ: r.num("floorZ"),
    kind: r.oneOf("kind", ["well", "scoop", "pocket", "spare"]),
    contents: r.str("contents", ""),
    features: r.objects("features", []).map(readFeature),
  });
}

function readTray(r: Reader): TraySpec {
  return r.finish({
    key: r.str("key"),
    part: r.oneOf("part", ["tray", "leftover", "spacer"]),
    path: r.str("path", ""),
    stack: r.num("stack"),
    level: r.num("level"),
    x: r.num("x"),
    y: r.num("y"),
    z: r.num("z"),
    w: r.num("w"),
    d: r.num("d"),
    h: r.num("h"),
    rotated: r.bool("rotated", false),
    wall: r.num("wall"),
    floor: r.num("floor"),
    lip: r.bool("lip"),
    solid: r.bool("solid", false),
    compartments: r.objects("compartments", []).map(readCompartment),
  });
}

/**
 * A stored layout never makes a project unloadable: if it can't be read it is
 * dropped with a notice and the project is optimized again. In newer-minor
 * files a tray with values this app doesn't know is kept verbatim (shown, but
 * geometry refuses to export it).
 */
function readLayout(raw: unknown, ctx: Ctx): StoredLayout | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const dropped = (): undefined => {
    ctx.notices.push({
      level: "warning",
      code: "layout.dropped",
      path: "/layout",
      message: "The saved layout couldn't be read. The insert will be optimized again.",
    });
    return undefined;
  };
  if (!isRecord(raw)) {
    return dropped();
  }
  const sub = childCtx(ctx);
  const r = new Reader(raw, "/layout", sub);
  const unsupported: string[] = [];
  const trays = r.objects("trays").map((t) => {
    const traySub = childCtx(sub);
    const tray = readTray(new Reader(t.raw, t.path, traySub));
    sub.errors.push(...traySub.errors);
    if (traySub.unknownValues.length > 0) {
      unsupported.push(tray.key);
      return t.raw as unknown as TraySpec;
    }
    adopt(sub, traySub);
    return tray;
  });
  const layout: StoredLayout = r.finish({
    createdWith: r.str("createdWith", "unknown"),
    geometryVersion: r.str("geometryVersion"),
    inputsHash: r.str("inputsHash"),
    seed: r.num("seed"),
    iterations: r.num("iterations"),
    capped: r.bool("capped", false),
    trays,
  });
  if (sub.errors.length > 0 || sub.unknownValues.length > 0) {
    return dropped();
  }
  adopt(ctx, sub);
  if (unsupported.length > 0) {
    ctx.notices.push({
      level: "warning",
      code: "layout.unsupportedTrays",
      path: "/layout/trays",
      message: `Some trays use features this app version can't build (${unsupported.join(", ")}). They are shown but can't be exported.`,
    });
  }
  return layout;
}

function readBox(r: Reader | null): Box {
  if (!r) {
    return {
      innerWidth: 0,
      innerDepth: 0,
      innerHeight: 0,
      headroom: 0,
      headroomCoverage: "full",
      storedOnSide: false,
    };
  }
  return r.finish({
    innerWidth: r.num("innerWidth"),
    innerDepth: r.num("innerDepth"),
    innerHeight: r.num("innerHeight"),
    headroom: r.num("headroom", DEFAULT_BOX.headroom),
    headroomCoverage: r.oneOf(
      "headroomCoverage",
      ["full", "partial"],
      DEFAULT_BOX.headroomCoverage,
    ),
    storedOnSide: r.bool("storedOnSide", DEFAULT_BOX.storedOnSide),
  });
}

function readPrinter(r: Reader | null): Printer {
  if (!r) {
    return { bedX: 0, bedY: 0, bedZ: 0, bedMargin: 0, layerHeight: 0 };
  }
  return r.finish({
    bedX: r.num("bedX"),
    bedY: r.num("bedY"),
    bedZ: r.num("bedZ"),
    bedMargin: r.num("bedMargin", DEFAULT_PRINTER.bedMargin),
    layerHeight: r.num("layerHeight", DEFAULT_PRINTER.layerHeight),
  });
}

/** Every missing setting gets its spec §5 default (older-minor files, spec §9). */
function readSettings(r: Reader | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  if (!r) {
    return structuredClone(d);
  }
  const fp = r.optChild("fingerPocket");
  const lip = r.optChild("lip");
  return r.finish({
    wall: r.num("wall", d.wall),
    floor: r.num("floor", d.floor),
    divider: r.num("divider", d.divider),
    fit: r.num("fit", d.fit),
    cardClearance: r.num("cardClearance", d.cardClearance),
    cardStackClearance: r.num("cardStackClearance", d.cardStackClearance),
    cardStackClearancePct: r.num("cardStackClearancePct", d.cardStackClearancePct),
    cardThickness: r.num("cardThickness", d.cardThickness),
    pieceClearance: r.num("pieceClearance", d.pieceClearance),
    boxClearance: r.num("boxClearance", d.boxClearance),
    trayGap: r.num("trayGap", d.trayGap),
    bottomChamfer: r.num("bottomChamfer", d.bottomChamfer),
    cornerRadius: r.num("cornerRadius", d.cornerRadius),
    scoopRadius: r.num("scoopRadius", d.scoopRadius),
    fingerPocket: fp
      ? fp.finish({
          width: fp.num("width", d.fingerPocket.width),
          reach: fp.num("reach", d.fingerPocket.reach),
        })
      : { ...d.fingerPocket },
    lip: lip
      ? lip.finish({
          enabled: lip.bool("enabled", d.lip.enabled),
          height: lip.num("height", d.lip.height),
          thickness: lip.num("thickness", d.lip.thickness),
          ledge: lip.num("ledge", d.lip.ledge),
          play: lip.num("play", d.lip.play),
        })
      : { ...d.lip },
    topPressFit: r.num("topPressFit", d.topPressFit),
    packingFactor: r.num("packingFactor", d.packingFactor),
    leftover: r.oneOf("leftover", ["spare", "solid"], d.leftover),
  });
}

/** "a; b; c; and 2 more" */
export function summarize(problems: string[]): string {
  const shown = problems.slice(0, 3).join("; ");
  return problems.length > 3 ? `${shown}; and ${problems.length - 3} more` : shown;
}

export interface ReadOptions {
  /** The file is from a newer MINOR of this app's line (spec §9). */
  newer: boolean;
  /** Written to project.schemaVersion. */
  schemaVersion: string;
}

/**
 * Reads project JSON whose schema line this app supports. Missing optional
 * fields get defaults. With `newer`, unknown fields are kept, unknown
 * components (or components with unknown values) become foreign, unknown
 * box/printer/settings values fall back to defaults with a warning and go to
 * `foreign.values` (with the raw value), and locks of an unknown kind go to
 * `foreign.values` unapplied. Without `newer`,
 * unknown fields are dropped with one info notice and unknown values are
 * errors. Unreadable locks and layouts are dropped with a notice. Does not
 * validate bounds; see validateProject().
 */
export function readProject(data: Json, opts: ReadOptions): ParseResult {
  const ctx: Ctx = { newer: opts.newer, errors: [], unknownValues: [], dropped: [], notices: [] };
  const r = new Reader(data, "", ctx);
  r.take("schemaVersion");
  const createdWith = r.str("createdWith", "unknown");
  const id = r.str("id", newId());
  const name = r.str("name", DEFAULT_PROJECT_NAME);
  const box = readBox(r.child("box"));
  const printer = readPrinter(r.child("printer"));
  const settings = readSettings(r.optChild("settings"));
  const { components, foreign } = readComponents(r.list("components", []), ctx);
  const { locks, kept } = readLocks(r.list("locks", []), ctx);
  const layout = readLayout(r.take("layout"), ctx);
  // finish() last: it treats every key not read so far as unknown.
  const project: Project = r.finish({
    schemaVersion: opts.schemaVersion,
    createdWith,
    id,
    name,
    box,
    printer,
    settings,
    components,
    locks,
  });
  if (layout) {
    project.layout = layout;
  }
  if (ctx.errors.length > 0) {
    return { ok: false, error: `This project file is damaged: ${summarize(ctx.errors)}.` };
  }
  // Box, printer and settings values this app doesn't know: the project uses
  // the default, and serializeProject writes the original back (spec §9).
  const values: ForeignValue[] = ctx.unknownValues.map((path) => ({
    path,
    raw: valueAt(data, pointerKeys(path)),
  }));
  for (const path of ctx.unknownValues) {
    ctx.notices.push({
      level: "warning",
      code: "schema.unknownValue",
      path,
      message:
        "This setting uses a value this app version doesn't know. The default is used here; the original value is saved back unless you change this setting.",
    });
  }
  values.push(...kept);
  if (values.length > 0) {
    foreign.values = values;
  }
  if (ctx.dropped.length > 0) {
    ctx.notices.push({
      level: "info",
      code: "schema.unknownFields",
      message: `Ignored unknown fields: ${summarize(ctx.dropped)}.`,
    });
  }
  return { ok: true, project, foreign, notices: ctx.notices };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/model/schema-read.test.ts && npx tsc --noEmit
```

Expected: `Tests  20 passed`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/model src/test-support
git commit -m "Add schema reader that keeps newer-minor data"
```

---

### Task 9: Schema versioning, migrations and serialization

**Files:**

- Create: `src/model/schema.ts`
- Test: `src/model/schema.test.ts`, `src/model/schema-versions.test.ts`

**Interfaces:**

- Consumes: `readProject`, `isRecord`, `summarize`, `Json` (Task 8); `validateProject`, `isBlocking` (Task 6); `parseSemver`, `Semver`, `SCHEMA_VERSION`, `APP_VERSION` (Task 1); `sampleProject()` (Task 8, tests only).
- Produces (roadmap §4.5, exact):
  - `parseProject(raw: unknown, appSchemaVersion?: string): ParseResult` (default `SCHEMA_VERSION`)
  - `serializeProject(p: Project, foreign: ForeignData): string` (compact JSON)
- Produces (additional):
  - `interface Migration { from: string; to: string; migrate: (raw: Json) => Json }` (`from` is a compatibility line: `"1"`, `"2"`, or `"0.1"` before 1.0; `to` is a full schema version)
  - `MIGRATIONS: Migration[]` (empty), `interface ParseOptions { appSchemaVersion: string; migrations: readonly Migration[] }`, `parseProjectWith(raw: unknown, opts: ParseOptions): ParseResult`
  - `toSerializable(p: Project, foreign: ForeignData): Json` (used for pretty files; re-inserts `foreign.components`, writes `foreign.values` back per the "changed since loading" rule; never mutates `p`), `noForeign(): ForeignData`
  - Notice codes: `schema.newerMinor` (warning; plan 5 asks for confirmation before re-optimizing when present), `schema.migrated` (info)

- [ ] **Step 1: Write the failing tests**

`src/model/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sampleProject } from "../test-support/sample";
import { newComponent, newProject } from "./defaults";
import { noForeign, parseProject, serializeProject, toSerializable } from "./schema";
import type { Project } from "./types";
import { APP_VERSION, SCHEMA_VERSION } from "./version";

type Json = Record<string, unknown>;

function raw(p: Project): Json {
  return JSON.parse(serializeProject(p, noForeign())) as Json;
}

function firstCards(input: Json): Json {
  return (input.components as Json[])[0] as Json;
}

function expectError(input: unknown): string {
  const result = parseProject(input);
  if (result.ok) {
    throw new Error("expected an error");
  }
  return result.error;
}

describe("serializeProject / parseProject", () => {
  it("round-trips every component kind, lock kind and the stored layout", () => {
    const p = sampleProject();
    const result = parseProject(raw(p));
    expect(result).toEqual({
      ok: true,
      project: { ...p, createdWith: APP_VERSION },
      foreign: { components: [] },
      notices: [],
    });
  });

  it("round-trips a project with no components", () => {
    const p = newProject();
    const result = parseProject(raw(p));
    expect(result.ok && result.project).toEqual(p);
  });

  it("writes createdWith as this app's version", () => {
    expect(raw({ ...sampleProject(), createdWith: "0.0.1" }).createdWith).toBe(APP_VERSION);
  });
});

describe("toSerializable", () => {
  it("re-inserts foreign components at their original indices", () => {
    const p = newProject();
    const [a, b] = [newComponent("custom"), newComponent("cards")];
    p.components = [a, b];
    const x = { kind: "dial", id: "x" };
    const y = { kind: "spinner", id: "y" };
    const out = toSerializable(p, {
      components: [
        { index: 3, raw: y },
        { index: 1, raw: x },
      ],
    });
    expect(out.components).toEqual([a, x, b, y]);
  });

  it("writes unknown values back while the field still holds the substituted default", () => {
    const p = newProject();
    const before = structuredClone(p);
    const out = toSerializable(p, {
      components: [],
      values: [
        { path: "/box/headroomCoverage", raw: "none" },
        { path: "/settings/leftover", raw: "hollow" },
      ],
    });
    expect(out.box).toEqual({ ...p.box, headroomCoverage: "none" });
    expect(out.settings).toEqual({ ...p.settings, leftover: "hollow" });
    expect(p).toEqual(before);
  });

  it("keeps the user's value when the field was changed after loading", () => {
    const p = newProject();
    p.settings = { ...p.settings, leftover: "solid" };
    const out = toSerializable(p, {
      components: [],
      values: [{ path: "/settings/leftover", raw: "hollow" }],
    });
    expect((out.settings as Record<string, unknown>).leftover).toBe("solid");
  });

  it("re-inserts unknown locks at their original indices", () => {
    const p = newProject();
    const a = { kind: "stack" as const, trayKeys: ["a:p0:0"] };
    const b = { kind: "stack" as const, trayKeys: ["b:p0:0"] };
    p.locks = [a, b];
    const x = { kind: "magnet", trayKey: "x" };
    const y = { kind: "glue", trayKey: "y" };
    const out = toSerializable(p, {
      components: [],
      values: [
        { path: "/locks/3", raw: y },
        { path: "/locks/1", raw: x },
      ],
    });
    expect(out.locks).toEqual([a, x, b, y]);
    expect(p.locks).toEqual([a, b]);
  });

  it("appends foreign components whose index is past the end", () => {
    const p = newProject();
    const out = toSerializable(p, { components: [{ index: 7, raw: { kind: "dial" } }] });
    expect(out.components).toEqual([{ kind: "dial" }]);
  });
});

describe("parseProject: not a project", () => {
  it.each([null, 42, "text", [1, 2]])("rejects %j", (input) => {
    expect(expectError(input)).toMatch(/not an insert generator project/);
  });

  it("rejects a missing or unreadable schemaVersion", () => {
    const input = raw(newProject());
    delete input.schemaVersion;
    expect(expectError(input)).toMatch(/no schemaVersion/);
    expect(expectError({ ...input, schemaVersion: "one" })).toMatch(
      /unreadable schema version "one"/,
    );
  });

  it("passes damaged-file errors through", () => {
    const input = raw(newProject());
    (input.box as Json).innerWidth = "wide";
    expect(expectError(input)).toMatch(/damaged: \/box\/innerWidth: expected a number/);
  });
});

describe("parseProject: spec §5 bounds", () => {
  it("refuses counts over 2000", () => {
    const input = raw(sampleProject());
    firstCards(input).decks = [{ name: "Huge", count: 5000 }];
    expect(expectError(input)).toMatch(/can't be opened: Card count must be at most 2000/);
  });

  it("refuses more than 100 components", () => {
    const input = raw(newProject());
    input.components = Array.from({ length: 101 }, (_, i) => ({
      id: `c${String(i).padStart(7, "0")}`,
      kind: "custom",
      w: 10,
      d: 10,
      h: 10,
      count: 1,
    }));
    expect(expectError(input)).toMatch(/Too many components \(101\)/);
  });

  it("still loads field-level problems, so a half-edited project can be fixed", () => {
    const input = raw(sampleProject());
    firstCards(input).decks = [{ name: "Empty", count: 0 }];
    expect(parseProject(input).ok).toBe(true);
  });

  it("uses the current schema version by default", () => {
    const result = parseProject(raw(newProject()));
    expect(result.ok && result.project.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
```

`src/model/schema-versions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sampleProject } from "../test-support/sample";
import type { Migration } from "./schema";
import { MIGRATIONS, noForeign, parseProject, parseProjectWith, serializeProject } from "./schema";
import { DEFAULT_SETTINGS } from "./settings";
import type { ParseResult } from "./types";
import { SCHEMA_VERSION, parseSemver } from "./version";

type Json = Record<string, unknown>;

/** The sample project as raw JSON, claiming to be schema `version`. */
function fileAt(version: string, createdWith = "9.9.9"): Json {
  const raw = JSON.parse(serializeProject(sampleProject(), noForeign())) as Json;
  return { ...raw, schemaVersion: version, createdWith };
}

function expectOk(result: ParseResult) {
  if (!result.ok) {
    throw new Error(`expected ok, got: ${result.error}`);
  }
  return result;
}

function expectError(result: ParseResult): string {
  if (result.ok) {
    throw new Error("expected an error");
  }
  return result.error;
}

describe("same line, older or equal minor", () => {
  it("loads an older minor, fills missing fields and upgrades the version", () => {
    const raw = fileAt("1.1.0");
    delete (raw.settings as Json).packingFactor;
    const result = expectOk(parseProject(raw, "1.3.0"));
    expect(result.project.settings.packingFactor).toBe(DEFAULT_SETTINGS.packingFactor);
    expect(result.project.schemaVersion).toBe("1.3.0");
    expect(result.notices).toEqual([]);
  });

  it("treats 0.MINOR as the line and PATCH as the minor before 1.0", () => {
    const result = expectOk(parseProject(fileAt("0.1.2"), "0.1.5"));
    expect(result.project.schemaVersion).toBe("0.1.5");
    expect(result.notices).toEqual([]);
  });
});

describe("same line, newer minor", () => {
  function newerFile(): Json {
    const raw = fileAt("1.2.0", "1.2.0");
    raw.theme = "dark";
    const comps = raw.components as Json[];
    comps.splice(1, 0, { id: "dial0001", name: "Dial", kind: "dial", diameter: 40 });
    (raw.box as Json).headroomCoverage = "none";
    (raw.settings as Json).leftover = "hollow";
    (raw.locks as Json[]).splice(1, 0, { kind: "magnet", trayKey: "x" });
    return raw;
  }

  it("loads with a 'made with a newer app' warning and keeps the file's version", () => {
    const result = expectOk(parseProject(newerFile(), "1.0.0"));
    expect(result.notices[0]).toMatchObject({ level: "warning", code: "schema.newerMinor" });
    expect(result.notices[0]?.message).toContain("1.2.0");
    expect(result.project.schemaVersion).toBe("1.2.0");
    expect(result.foreign.components.map((f) => f.index)).toEqual([1]);
  });

  it("saves unknown fields, values, locks and components back unchanged and in order", () => {
    const input = newerFile();
    const result = expectOk(parseProject(input, "1.0.0"));
    expect(result.project.settings.leftover).toBe("spare");
    const saved = JSON.parse(serializeProject(result.project, result.foreign)) as Json;
    expect(saved.theme).toBe("dark");
    expect(saved.schemaVersion).toBe("1.2.0");
    expect(saved.components).toEqual(input.components);
    expect(saved.locks).toEqual(input.locks);
    expect(saved.box).toEqual(input.box);
    expect(saved.settings).toEqual(input.settings);
  });

  it("saves the user's choice for a field changed after loading", () => {
    const result = expectOk(parseProject(newerFile(), "1.0.0"));
    const edited = {
      ...result.project,
      settings: { ...result.project.settings, leftover: "solid" as const },
    };
    const saved = JSON.parse(serializeProject(edited, result.foreign)) as Json;
    expect((saved.settings as Json).leftover).toBe("solid");
    expect((saved.box as Json).headroomCoverage).toBe("none");
  });

  it("treats a newer 0.MINOR.PATCH as a newer minor before 1.0", () => {
    const result = expectOk(parseProject(fileAt("0.1.3"), "0.1.0"));
    expect(result.notices.map((n) => n.code)).toEqual(["schema.newerMinor"]);
  });
});

describe("refused files", () => {
  it("refuses a newer major and names both versions", () => {
    const message = expectError(parseProject(fileAt("2.0.0", "2.1.0"), "1.4.0"));
    expect(message).toMatch(/made with app 2\.1\.0/);
    expect(message).toMatch(/Update the app/);
  });

  it("refuses a newer 0.MINOR before 1.0", () => {
    expect(expectError(parseProject(fileAt("0.2.0"), "0.1.0"))).toMatch(/Update the app/);
  });

  it("refuses 0.x files from 1.0 on", () => {
    expect(expectError(parseProject(fileAt("0.9.0", "0.9.3"), "1.0.0"))).toMatch(
      /preview version of the app \(0\.9\.3/,
    );
  });

  it("refuses an older line with no registered migration", () => {
    expect(expectError(parseProject(fileAt("0.0.9"), SCHEMA_VERSION))).toMatch(
      /no migration from schema line 0\.0/,
    );
  });
});

describe("migrations (fake registry)", () => {
  /** Schema 1 called the box fields width/depth/height; schema 2 renamed them; schema 3 changed nothing. */
  const fake: Migration[] = [
    {
      from: "1",
      to: "2.0.0",
      migrate: (raw) => {
        const { width, depth, height, ...rest } = raw.box as Json;
        return {
          ...raw,
          box: { ...rest, innerWidth: width, innerDepth: depth, innerHeight: height },
        };
      },
    },
    { from: "2", to: "3.0.0", migrate: (raw) => raw },
  ];

  function v1File(): Json {
    const raw = fileAt("1.4.0", "1.4.0");
    const { innerWidth, innerDepth, innerHeight, ...rest } = raw.box as Json;
    return { ...raw, box: { ...rest, width: innerWidth, depth: innerDepth, height: innerHeight } };
  }

  it("runs every step from the file's line to the app's line", () => {
    const input = v1File();
    const copy = structuredClone(input);
    const result = expectOk(
      parseProjectWith(input, { appSchemaVersion: "3.0.0", migrations: fake }),
    );
    expect(result.project.box).toEqual(sampleProject().box);
    expect(result.project.schemaVersion).toBe("3.0.0");
    expect(result.notices).toEqual([expect.objectContaining({ code: "schema.migrated" })]);
    expect(input).toEqual(copy);
  });

  it("refuses when a step is missing", () => {
    const result = parseProjectWith(v1File(), {
      appSchemaVersion: "3.0.0",
      migrations: fake.slice(1),
    });
    expect(expectError(result)).toMatch(/no migration from schema line 1/);
  });

  it("refuses a step that does not move to a later line instead of looping", () => {
    const stuck: Migration[] = [{ from: "1", to: "1.9.0", migrate: (raw) => raw }];
    const result = parseProjectWith(v1File(), { appSchemaVersion: "2.0.0", migrations: stuck });
    expect(expectError(result)).toMatch(/no migration from schema line 1/);
  });

  it("supports 0.MINOR lines", () => {
    const zero: Migration[] = [{ from: "0.1", to: "0.2.0", migrate: (raw) => raw }];
    const result = parseProjectWith(fileAt("0.1.4"), {
      appSchemaVersion: "0.2.1",
      migrations: zero,
    });
    expect(expectOk(result).project.schemaVersion).toBe("0.2.1");
  });
});

describe("the real registry", () => {
  it("is empty while the schema is 0.x (no compatibility promise)", () => {
    expect(parseSemver(SCHEMA_VERSION)?.major).toBe(0);
    expect(MIGRATIONS).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

From the repo root: `npx vitest run src/model/schema.test.ts src/model/schema-versions.test.ts`

Expected: FAIL with `Error: Cannot find module './schema'` in both files.

- [ ] **Step 3: Implement**

`src/model/schema.ts`:

```ts
import { DEFAULT_BOX, DEFAULT_PRINTER } from "./defaults";
import type { Json } from "./schema-read";
import { isRecord, pointerKeys, readProject, summarize, valueAt } from "./schema-read";
import { DEFAULT_SETTINGS } from "./settings";
import type { ForeignData, Notice, ParseResult, Project } from "./types";
import { isBlocking, validateProject } from "./validate";
import type { Semver } from "./version";
import { APP_VERSION, SCHEMA_VERSION, parseSemver } from "./version";

/**
 * A compatibility line groups versions that read each other's files (spec §9).
 * From 1.0 on it is the MAJOR ("1", "2") and MINOR is the additive part.
 * While MAJOR is 0 the spec promises nothing, so each 0.MINOR is its own line
 * ("0.1", "0.2") and PATCH plays the additive part: app 0.1.0 reads 0.1.x
 * (newer patches with a warning), refuses 0.2.0, and needs a migration for
 * 0.0.x. From 1.0 on, every 0.x file is refused outright.
 */
interface Compat {
  line: string;
  rank: [number, number];
  sub: number;
}

function compat(v: Semver): Compat {
  return v.major === 0
    ? { line: `0.${v.minor}`, rank: [0, v.minor], sub: v.patch }
    : { line: String(v.major), rank: [v.major, 0], sub: v.minor };
}

function compareRank(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

/** Upgrades raw project JSON from one compatibility line to a later one. */
export interface Migration {
  from: string; // compatibility line it reads, e.g. "1" or "0.1"
  to: string; // schema version its output conforms to, e.g. "2.0.0"
  migrate: (raw: Json) => Json;
}

/**
 * Registered migrations. Empty before 1.0 (0.x promises no compatibility).
 * From 1.0 on, every schema MAJOR bump adds one migration from the previous
 * line, and a saved file of the old MAJOR to test/fixtures/schema/.
 */
export const MIGRATIONS: Migration[] = [];

export interface ParseOptions {
  appSchemaVersion: string;
  migrations: readonly Migration[];
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}

/** parseProject with an injectable migration registry (tests use a fake one). */
export function parseProjectWith(raw: unknown, opts: ParseOptions): ParseResult {
  const app = parseSemver(opts.appSchemaVersion);
  if (!app) {
    throw new Error(`Invalid app schema version "${opts.appSchemaVersion}"`);
  }
  if (!isRecord(raw)) {
    return fail("This is not an insert generator project (expected a JSON object).");
  }
  const fileVersion = raw.schemaVersion;
  if (typeof fileVersion !== "string") {
    return fail("This is not an insert generator project (it has no schemaVersion).");
  }
  const file = parseSemver(fileVersion);
  if (!file) {
    return fail(`This project has an unreadable schema version "${fileVersion}".`);
  }
  const createdWith = typeof raw.createdWith === "string" ? raw.createdWith : "unknown";
  const appCompat = compat(app);

  if (app.major >= 1 && file.major === 0) {
    return fail(
      `This project was made with a preview version of the app (${createdWith}, schema ${fileVersion}). Preview projects can't be opened by app ${APP_VERSION}.`,
    );
  }

  const notices: Notice[] = [];
  let data: Json = raw;
  let version = file;
  while (compareRank(compat(version).rank, appCompat.rank) < 0) {
    const from = compat(version);
    const step = opts.migrations.find((m) => m.from === from.line);
    const to = step ? parseSemver(step.to) : null;
    // A step must move to a later line; anything else would loop forever.
    if (!step || !to || compareRank(compat(to).rank, from.rank) <= 0) {
      return fail(
        `This project uses schema ${fileVersion}, which app ${APP_VERSION} (schema ${opts.appSchemaVersion}) can no longer read: no migration from schema line ${from.line}.`,
      );
    }
    data = { ...step.migrate(structuredClone(data)), schemaVersion: step.to };
    version = to;
  }
  if (version !== file) {
    notices.push({
      level: "info",
      code: "schema.migrated",
      message: `Upgraded from schema ${fileVersion} to ${opts.appSchemaVersion}.`,
    });
  }

  const fileCompat = compat(version);
  if (compareRank(fileCompat.rank, appCompat.rank) > 0) {
    return fail(
      `This project was made with app ${createdWith} (schema ${fileVersion}); this is app ${APP_VERSION} (schema ${opts.appSchemaVersion}). Update the app to open it.`,
    );
  }
  const newer = fileCompat.sub > appCompat.sub;
  if (newer) {
    notices.push({
      level: "warning",
      code: "schema.newerMinor",
      message: `Made with app ${createdWith}, which is newer than this app (${APP_VERSION}). Parts this app doesn't know are kept but not laid out. Re-optimizing needs confirmation.`,
    });
  }

  // The file now conforms to this app's schema, unless it came from a newer
  // minor: then it keeps its version, so its preserved extras stay meaningful.
  const result = readProject(data, {
    newer,
    schemaVersion: newer
      ? `${version.major}.${version.minor}.${version.patch}`
      : opts.appSchemaVersion,
  });
  if (!result.ok) {
    return result;
  }
  const blocking = validateProject(result.project).filter(isBlocking);
  if (blocking.length > 0) {
    return fail(`This project can't be opened: ${summarize(blocking.map((n) => n.message))}`);
  }
  return { ...result, notices: [...notices, ...result.notices] };
}

/**
 * Reads untrusted project JSON (link, file, localStorage) per spec §9: fills
 * defaults, keeps newer-minor extras, migrates older lines, refuses newer
 * lines and (from 1.0 on) 0.x files, and refuses input over the spec §5 upper
 * bounds. Field-level problems don't block loading; call validateProject().
 */
export function parseProject(raw: unknown, appSchemaVersion = SCHEMA_VERSION): ParseResult {
  return parseProjectWith(raw, { appSchemaVersion, migrations: MIGRATIONS });
}

/** No foreign components (new projects, and projects from this app version). */
export function noForeign(): ForeignData {
  return { components: [] };
}

/** The defaults readProject substitutes for unknown box/printer/settings values. */
const SUBSTITUTED_DEFAULTS = {
  box: DEFAULT_BOX,
  printer: DEFAULT_PRINTER,
  settings: DEFAULT_SETTINGS,
};

type ForeignValue = NonNullable<ForeignData["values"]>[number];

/** Index of an array-element pointer such as "/locks/3", or null for an object field. */
function arrayIndex(out: Json, keys: string[]): number | null {
  const parent = valueAt(out, keys.slice(0, -1));
  const last = keys.at(-1) ?? "";
  return Array.isArray(parent) && /^\d+$/.test(last) ? Number(last) : null;
}

/**
 * Writes foreign values back (spec §9: unknown values are preserved on save).
 * - Array element (an unknown lock, "/locks/3"): re-inserted at its index,
 *   ascending, like foreign components.
 * - Object field ("/settings/leftover"): the project holds the default that
 *   readProject substituted. The raw value is written back only while the
 *   field still equals that default; any other value means the user changed
 *   the field, and their choice wins. (Re-selecting the default itself can't be
 *   told apart from "unchanged", so the original value is kept in that case.)
 */
function restoreValues(out: Json, values: readonly ForeignValue[]): void {
  const inserts: { keys: string[]; index: number; raw: unknown }[] = [];
  for (const v of values) {
    const keys = pointerKeys(v.path);
    const index = arrayIndex(out, keys);
    if (index !== null) {
      inserts.push({ keys, index, raw: v.raw });
      continue;
    }
    const parent = valueAt(out, keys.slice(0, -1));
    const last = keys.at(-1);
    const substituted = valueAt(SUBSTITUTED_DEFAULTS, keys);
    if (
      isRecord(parent) &&
      last !== undefined &&
      substituted !== undefined &&
      parent[last] === substituted
    ) {
      parent[last] = v.raw;
    }
  }
  for (const ins of inserts.sort((a, b) => a.index - b.index)) {
    const parent = valueAt(out, ins.keys.slice(0, -1));
    if (Array.isArray(parent)) {
      parent.splice(Math.min(ins.index, parent.length), 0, ins.raw);
    }
  }
}

/**
 * The object written to links, files and storage: the project with
 * createdWith set to this app (spec §5: "app version that last saved it"),
 * foreign components re-inserted at their original indices, and foreign
 * values written back (see restoreValues). Never modifies `p`.
 */
export function toSerializable(p: Project, foreign: ForeignData): Json {
  const components: unknown[] = [...p.components];
  for (const f of [...foreign.components].sort((a, b) => a.index - b.index)) {
    components.splice(Math.min(f.index, components.length), 0, f.raw);
  }
  const out: Json = { ...p, createdWith: APP_VERSION, components };
  const values = foreign.values ?? [];
  if (values.length === 0) {
    return out;
  }
  const copy = structuredClone(out);
  restoreValues(copy, values);
  return copy;
}

/** Compact JSON for links and storage. */
export function serializeProject(p: Project, foreign: ForeignData): string {
  return JSON.stringify(toSerializable(p, foreign));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/model && npx tsc --noEmit
```

Expected: every `src/model` test file passes (`Test Files  11 passed`); `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/model
git commit -m "Add schema versioning, migrations and serialization"
```

---

### Task 10: URL-hash link codec

**Files:**

- Create: `src/share/base64url.ts`, `src/share/link.ts`
- Test: `src/share/base64url.test.ts`, `src/share/link.test.ts`

**Interfaces:**

- Consumes: `serializeProject`, `parseProject`, `noForeign` (Task 9); `fflate` (`deflateSync`, `Inflate`, `strToU8`, `strFromU8`).
- Produces (roadmap §4.5, exact): `encodeHash(p: Project, foreign: ForeignData): string` (`"#1.<base64url(deflate(json))>"`), `decodeHash(hash: string): ParseResult` (never throws; accepts `#1.…`, `1.…`, or a whole URL).
- Produces (additional): `toBase64Url(bytes: Uint8Array): string`, `fromBase64Url(text: string): Uint8Array | null`, `HASH_FORMAT = 1`, `MAX_INFLATED_BYTES = 1048576`, `LINK_TARGET_CHARS = 1900` (hash budget for projects without a stored layout), `LINK_MAX_URL_CHARS = 2000` (Discord's message limit on the whole share URL; plan 5 warns above it), `inflateCapped(data: Uint8Array, cap: number): Uint8Array`, `class InflateLimitError extends Error`.

- [ ] **Step 1: Write the failing tests**

`src/share/base64url.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "./base64url";

const bytes = (...b: number[]) => new Uint8Array(b);

describe("base64url", () => {
  it("matches RFC 4648 test vectors (url alphabet, no padding)", () => {
    const enc = new TextEncoder();
    expect(toBase64Url(enc.encode(""))).toBe("");
    expect(toBase64Url(enc.encode("f"))).toBe("Zg");
    expect(toBase64Url(enc.encode("fo"))).toBe("Zm8");
    expect(toBase64Url(enc.encode("foo"))).toBe("Zm9v");
    expect(toBase64Url(enc.encode("foobar"))).toBe("Zm9vYmFy");
    expect(toBase64Url(bytes(0xfb, 0xff))).toBe("-_8");
  });

  it("round-trips any bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (data) => {
        expect(fromBase64Url(toBase64Url(data))).toEqual(data);
      }),
    );
  });

  it.each(["Zm9v!", "Zm9v=", "Zm 9v", "Z", "Zm9vY", "é"])("rejects %j", (text) => {
    expect(fromBase64Url(text)).toBeNull();
  });
});
```

`src/share/link.test.ts`:

```ts
import { deflateSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { newProject } from "../model/defaults";
import { noForeign, parseProject, serializeProject } from "../model/schema";
import type { CardsComponent, ParseResult } from "../model/types";
import { APP_VERSION } from "../model/version";
import { sampleProject } from "../test-support/sample";
import { toBase64Url } from "./base64url";
import { MAX_INFLATED_BYTES, decodeHash, encodeHash, inflateCapped } from "./link";

function expectOk(result: ParseResult) {
  if (!result.ok) {
    throw new Error(`expected ok, got: ${result.error}`);
  }
  return result;
}

function expectError(result: ParseResult): string {
  if (result.ok) {
    throw new Error("expected an error");
  }
  return result.error;
}

/** A link whose payload is `text` deflated, bypassing serializeProject. */
function linkOf(text: string): string {
  return `#1.${toBase64Url(deflateSync(strToU8(text)))}`;
}

describe("encodeHash / decodeHash", () => {
  it("round-trips a full project, including its stored layout", () => {
    const p = sampleProject();
    const hash = encodeHash(p, noForeign());
    expect(hash).toMatch(/^#1\.[A-Za-z0-9_-]+$/);
    expect(expectOk(decodeHash(hash)).project).toEqual({ ...p, createdWith: APP_VERSION });
  });

  it("round-trips a project with no components", () => {
    const p = newProject();
    expect(expectOk(decodeHash(encodeHash(p, noForeign()))).project).toEqual(p);
  });

  it("keeps foreign components from a newer-minor project", () => {
    const raw = JSON.parse(serializeProject(newProject(), noForeign())) as Record<string, unknown>;
    raw.schemaVersion = "0.1.9";
    raw.components = [{ id: "dial0001", kind: "dial", diameter: 40 }];
    const loaded = expectOk(parseProject(raw));
    const again = expectOk(decodeHash(encodeHash(loaded.project, loaded.foreign)));
    expect(again.foreign).toEqual(loaded.foreign);
  });

  it("accepts the hash without '#', and a whole URL", () => {
    const hash = encodeHash(sampleProject(), noForeign());
    expect(decodeHash(hash.slice(1)).ok).toBe(true);
    expect(decodeHash(`https://example.org/insert-generator/${hash}`).ok).toBe(true);
  });
});

describe("decodeHash: links damaged on the way", () => {
  const hash = encodeHash(sampleProject(), noForeign());

  it("rejects every truncation with a clear message", () => {
    for (let cut = 3; cut < hash.length; cut++) {
      expect(expectError(decodeHash(hash.slice(0, cut)))).toMatch(/incomplete or damaged/);
    }
  });

  it("ignores line breaks and spaces inserted by mail and chat apps", () => {
    const wrapped = hash.replace(/(.{60})/g, "$1\n ");
    expect(decodeHash(wrapped).ok).toBe(true);
  });

  it("ignores punctuation swallowed from the surrounding text", () => {
    expect(decodeHash(`${hash}).`).ok).toBe(true);
    expect(decodeHash(`${hash}>`).ok).toBe(true);
  });

  it("rejects characters outside base64url, and bytes that are not deflate or not JSON", () => {
    expect(expectError(decodeHash("#1.@@@@"))).toMatch(/incomplete or damaged/);
    expect(
      expectError(decodeHash(`#1.${toBase64Url(strToU8("plain text, not deflate"))}`)),
    ).toMatch(/incomplete or damaged/);
    expect(expectError(decodeHash(linkOf("{not json")))).toMatch(/incomplete or damaged/);
    expect(expectError(decodeHash("#1."))).toMatch(/incomplete or damaged/);
  });
});

describe("decodeHash: refused links", () => {
  it("rejects an unknown link format", () => {
    expect(expectError(decodeHash("#2.abcd"))).toMatch(/link format 2/);
  });

  it("rejects a hash that is not a project link", () => {
    expect(expectError(decodeHash(""))).toMatch(/doesn't contain an insert generator project/);
    expect(expectError(decodeHash("#section-3"))).toMatch(/doesn't contain/);
  });

  it("caps the inflated size at 1 MB", () => {
    const bomb = linkOf(`"${" ".repeat(MAX_INFLATED_BYTES + 10)}"`);
    expect(bomb.length).toBeLessThan(5000);
    expect(expectError(decodeHash(bomb))).toMatch(/more than 1 MB/);
  });

  it("applies the spec §5 bounds", () => {
    const p = sampleProject();
    const cards = p.components[0] as CardsComponent;
    p.components[0] = { ...cards, decks: [{ name: "Huge", count: 999_999 }] };
    expect(expectError(decodeHash(encodeHash(p, noForeign())))).toMatch(/at most 2000/);
  });
});

describe("inflateCapped", () => {
  it("returns data up to the cap exactly", () => {
    const data = strToU8("x".repeat(5000));
    expect(inflateCapped(deflateSync(data), 5000)).toEqual(data);
    expect(() => inflateCapped(deflateSync(data), 4999)).toThrow(/exceeds 4999 bytes/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

From the repo root: `npx vitest run src/share`

Expected: FAIL with `Error: Cannot find module './base64url'` and `Error: Cannot find module './link'`.

- [ ] **Step 3: Implement**

`src/share/base64url.ts`:

```ts
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const DECODE = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) {
  DECODE[ALPHABET.charCodeAt(i)] = i;
}

/** RFC 4648 §5 base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) {
      out += ALPHABET.charAt((n >> (18 - 6 * k)) & 63);
    }
  }
  return out;
}

/** Inverse of toBase64Url. Null on any character outside the alphabet or an impossible length. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) {
    return null;
  }
  const out = new Uint8Array(Math.floor((text.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const v = code < 128 ? (DECODE[code] ?? -1) : -1;
    if (v < 0) {
      return null;
    }
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}
```

`src/share/link.ts`:

```ts
import { Inflate, deflateSync, strFromU8, strToU8 } from "fflate";
import { parseProject, serializeProject } from "../model/schema";
import type { ForeignData, ParseResult, Project } from "../model/types";
import { fromBase64Url, toBase64Url } from "./base64url";

/** Version of the `#<format>.<payload>` link format (spec §8.4). */
export const HASH_FORMAT = 1;
/** Inflated JSON larger than this is refused (spec §8.4). */
export const MAX_INFLATED_BYTES = 1024 * 1024;
/** Hash budget for typical projects without a stored layout (fixtures test, spec §8.4). */
export const LINK_TARGET_CHARS = 1900;
/**
 * A whole share URL longer than this gets a "may be cut" warning (plan 5): Discord's
 * 2 000-character message limit. Fixtures with a stored layout stay under it on GitHub Pages.
 */
export const LINK_MAX_URL_CHARS = 2000;

const CHUNK_BYTES = 1024;

const DAMAGED =
  "This link is incomplete or damaged. It may have been cut off when it was copied or sent. Ask for the link again, or for the project file.";

/** `#1.<base64url(deflate(json))>` */
export function encodeHash(p: Project, foreign: ForeignData): string {
  const deflated = deflateSync(strToU8(serializeProject(p, foreign)), { level: 9 });
  return `#${HASH_FORMAT}.${toBase64Url(deflated)}`;
}

export class InflateLimitError extends Error {}

/**
 * Inflates raw DEFLATE data and throws InflateLimitError once the output
 * passes `cap` bytes. Input is fed 1 KB at a time, so a deflate bomb can't
 * allocate much beyond the cap (DEFLATE expands at most ≈ 1032:1).
 * Throws fflate's error on damaged or truncated data.
 */
export function inflateCapped(data: Uint8Array, cap: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let size = 0;
  const inflate = new Inflate((chunk) => {
    size += chunk.length;
    if (size > cap) {
      throw new InflateLimitError(`Inflated data exceeds ${cap} bytes`);
    }
    parts.push(chunk.slice());
  });
  for (let i = 0; i < data.length; i += CHUNK_BYTES) {
    inflate.push(data.subarray(i, i + CHUNK_BYTES), i + CHUNK_BYTES >= data.length);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}

/**
 * Reads a link hash (`#1.…`, `1.…`, or a whole URL containing one). Tolerates
 * what chat apps and mail clients do to links: inserted line breaks or spaces,
 * and trailing punctuation such as `).` swallowed from the surrounding text.
 * Never throws; the result says why a link can't be opened.
 */
export function decodeHash(hash: string): ParseResult {
  const fromHash = hash.includes("#") ? hash.slice(hash.indexOf("#") + 1) : hash;
  const text = fromHash.replace(/\s+/g, "");
  const m = /^(\d+)\.(.*)$/.exec(text);
  if (!m) {
    return fail("This link doesn't contain an insert generator project.");
  }
  const [, format = "", rest = ""] = m;
  if (format !== String(HASH_FORMAT)) {
    return fail(
      `This link uses link format ${format}, which this app version can't read. Update the app, or ask for the project file.`,
    );
  }
  const bytes = fromBase64Url(rest.replace(/[^A-Za-z0-9_-]+$/, ""));
  if (!bytes || bytes.length === 0) {
    return fail(DAMAGED);
  }
  let json: string;
  try {
    json = strFromU8(inflateCapped(bytes, MAX_INFLATED_BYTES));
  } catch (e) {
    if (e instanceof InflateLimitError) {
      return fail("This link holds more than 1 MB of project data, which is over the limit.");
    }
    return fail(DAMAGED);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return fail(DAMAGED);
  }
  return parseProject(raw);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/share && npx tsc --noEmit
```

Expected: `Tests  21 passed`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/share
git commit -m "Add URL-hash link codec with inflate cap"
```

---

### Task 11: Local project store

**Files:**

- Create: `src/share/store.ts`
- Create (test-only helper): `src/test-support/memory-storage.ts`
- Test: `src/share/store.test.ts`

**Interfaces:**

- Consumes: `serializeProject`, `parseProject`, `noForeign` (Task 9); `sampleProject()` (Task 8, tests only).
- Produces (roadmap §4.5): `interface ProjectStore { list(); load(id); save(p, foreign); remove(id); available }` exactly as in the roadmap; `createProjectStore(storage?: Storage | null): ProjectStore` (default: `globalThis.localStorage`, read inside `try/catch`).
- Produces (additional): `STORAGE_PREFIX = "insert-generator:"` (keys: `insert-generator:index`, `insert-generator:project:<id>`), `interface ProjectListEntry { id: string; name: string; updatedAt: number }`, `class StoreWriteError extends Error` — thrown by `save()` when the browser refuses the write; the previous state is restored first.
- Behaviour plan 5 relies on: `list()` is newest first; saving an existing id updates it in place and never touches other ids (opening a shared project whose id exists just opens/updates that project); a corrupt or missing index is rebuilt from the project keys; with no usable storage, `available` is `false`, `list()` is `[]`, `load()` is `null`, and `save`/`remove` do nothing.

- [ ] **Step 1: Write the test helper and the failing test**

`src/test-support/memory-storage.ts`:

```ts
/**
 * In-memory Storage for tests. `quotaChars` limits the total size of keys plus
 * values; `failOn` makes chosen keys throw on write (change it at any time).
 * Both throw the DOMException a browser throws when storage is full.
 */
export class MemoryStorage implements Storage {
  [name: string]: unknown;
  failOn: (key: string) => boolean = () => false;
  private readonly data = new Map<string, string>();
  private readonly quotaChars: number;

  constructor(quotaChars = Number.POSITIVE_INFINITY) {
    this.quotaChars = quotaChars;
  }

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    let used = key.length + value.length;
    for (const [k, v] of this.data) {
      if (k !== key) {
        used += k.length + v.length;
      }
    }
    if (this.failOn(key) || used > this.quotaChars) {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    }
    this.data.set(key, value);
  }
}
```

`src/share/store.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newProject } from "../model/defaults";
import { noForeign, serializeProject } from "../model/schema";
import type { Project } from "../model/types";
import { APP_VERSION } from "../model/version";
import { MemoryStorage } from "../test-support/memory-storage";
import { sampleProject } from "../test-support/sample";
import { STORAGE_PREFIX, StoreWriteError, createProjectStore } from "./store";

function named(name: string): Project {
  return { ...newProject(), name };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createProjectStore", () => {
  it("saves, lists and loads a project", () => {
    const store = createProjectStore(new MemoryStorage());
    const p = sampleProject();
    store.save(p, noForeign());
    expect(store.available).toBe(true);
    expect(store.list()).toEqual([{ id: p.id, name: p.name, updatedAt: 1_000 }]);
    const loaded = store.load(p.id);
    expect(loaded?.ok && loaded.project).toEqual({ ...p, createdWith: APP_VERSION });
  });

  it("lists the most recently saved first", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = named("A");
    const b = named("B");
    store.save(a, noForeign());
    vi.setSystemTime(2_000);
    store.save(b, noForeign());
    expect(store.list().map((e) => e.name)).toEqual(["B", "A"]);
    vi.setSystemTime(3_000);
    store.save(a, noForeign());
    expect(store.list().map((e) => e.name)).toEqual(["A", "B"]);
  });

  it("updates a project with the same id in place and never touches another id", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    const b = named("B");
    store.save(a, noForeign());
    store.save(b, noForeign());
    const aJson = storage.getItem(`${STORAGE_PREFIX}project:${a.id}`);
    store.save({ ...b, name: "B renamed" }, noForeign());
    expect(
      store
        .list()
        .map((e) => e.name)
        .sort(),
    ).toEqual(["A", "B renamed"]);
    expect(storage.getItem(`${STORAGE_PREFIX}project:${a.id}`)).toBe(aJson);
  });

  it("removes a project", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = named("A");
    store.save(a, noForeign());
    store.remove(a.id);
    expect(store.list()).toEqual([]);
    expect(store.load(a.id)).toBeNull();
  });

  it("returns null for an unknown id and an error for a damaged entry", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    expect(store.load("nope")).toBeNull();
    storage.setItem(`${STORAGE_PREFIX}project:bad`, "{oops");
    expect(store.load("bad")).toEqual({ ok: false, error: expect.stringMatching(/damaged/) });
  });

  it("rebuilds a missing or corrupt index from the saved projects", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    storage.setItem(`${STORAGE_PREFIX}index`, "garbage");
    expect(store.list()).toEqual([{ id: a.id, name: "A", updatedAt: 0 }]);
    storage.removeItem(`${STORAGE_PREFIX}index`);
    expect(store.list()).toEqual([{ id: a.id, name: "A", updatedAt: 0 }]);
  });

  it("only uses keys with its prefix and leaves other keys alone", () => {
    const storage = new MemoryStorage();
    storage.setItem("other-app:data", "keep");
    const store = createProjectStore(storage);
    store.save(named("A"), noForeign());
    store.remove(store.list()[0]?.id ?? "");
    expect(storage.getItem("other-app:data")).toBe("keep");
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i) ?? "";
      expect(key === "other-app:data" || key.startsWith(STORAGE_PREFIX)).toBe(true);
    }
  });
});

describe("createProjectStore when storage is full", () => {
  it("throws StoreWriteError and keeps the previous save intact", () => {
    const p = sampleProject();
    const size = serializeProject(p, noForeign()).length;
    const store = createProjectStore(new MemoryStorage(size + 500));
    store.save(p, noForeign());
    const bigger = { ...p, name: "x".repeat(1_000) };
    expect(() => {
      store.save(bigger, noForeign());
    }).toThrow(StoreWriteError);
    const loaded = store.load(p.id);
    expect(loaded?.ok && loaded.project.name).toBe("Sample");
    expect(store.list().map((e) => e.name)).toEqual(["Sample"]);
  });

  it("rolls the project back when only the index write fails", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const p = named("Before");
    store.save(p, noForeign());
    storage.failOn = (key) => key === `${STORAGE_PREFIX}index`;
    expect(() => {
      store.save({ ...p, name: "After" }, noForeign());
    }).toThrow(StoreWriteError);
    const loaded = store.load(p.id);
    expect(loaded?.ok && loaded.project.name).toBe("Before");
  });
});

describe("createProjectStore without usable storage", () => {
  it("is unavailable when there is no storage", () => {
    const store = createProjectStore(null);
    expect(store.available).toBe(false);
    expect(store.list()).toEqual([]);
    expect(store.load("x")).toBeNull();
    expect(() => {
      store.save(newProject(), noForeign());
      store.remove("x");
    }).not.toThrow();
  });

  it("is unavailable when every write throws (blocked or private-mode storage)", () => {
    const storage = new MemoryStorage();
    storage.failOn = () => true;
    const store = createProjectStore(storage);
    expect(store.available).toBe(false);
    expect(() => {
      store.save(newProject(), noForeign());
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

From the repo root: `npx vitest run src/share/store.test.ts`

Expected: FAIL with `Error: Cannot find module './store'`.

- [ ] **Step 3: Implement**

`src/share/store.ts`:

```ts
import { parseProject, serializeProject } from "../model/schema";
import type { ForeignData, ParseResult, Project } from "../model/types";

/** Every localStorage key this app uses starts with this. */
export const STORAGE_PREFIX = "insert-generator:";
const INDEX_KEY = `${STORAGE_PREFIX}index`;
const PROJECT_PREFIX = `${STORAGE_PREFIX}project:`;
const PROBE_KEY = `${STORAGE_PREFIX}probe`;

export interface ProjectListEntry {
  id: string;
  name: string;
  updatedAt: number;
}

export interface ProjectStore {
  list(): ProjectListEntry[];
  load(id: string): ParseResult | null;
  save(p: Project, foreign: ForeignData): void;
  remove(id: string): void;
  available: boolean;
}

/** Thrown by save() when the browser refuses the write (usually: storage full). Nothing is half-written. */
export class StoreWriteError extends Error {}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Some browsers throw on access when site data is blocked.
    return null;
  }
}

function probe(storage: Storage | null): storage is Storage {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(PROBE_KEY, "1");
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

function isEntry(x: unknown): x is ProjectListEntry {
  if (typeof x !== "object" || x === null) {
    return false;
  }
  const e = x as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.name === "string" && typeof e.updatedAt === "number";
}

const UNAVAILABLE: ProjectStore = {
  list: () => [],
  load: () => null,
  save: () => undefined,
  remove: () => undefined,
  available: false,
};

/**
 * The local project list (spec §8.4): one key per project plus an index of
 * { id, name, updatedAt }. Projects are keyed by id, so saving one project
 * never touches another; saving an existing id updates it in place.
 * Every storage call is wrapped: when storage is missing or blocked,
 * `available` is false and the store does nothing.
 */
export function createProjectStore(storage: Storage | null = defaultStorage()): ProjectStore {
  if (!probe(storage)) {
    return UNAVAILABLE;
  }
  const s = storage;

  function read(key: string): string | null {
    try {
      return s.getItem(key);
    } catch {
      return null;
    }
  }

  /** Rebuilds the index from the project keys when it is missing or corrupt. */
  function rebuildIndex(): ProjectListEntry[] {
    const entries: ProjectListEntry[] = [];
    try {
      for (let i = 0; i < s.length; i++) {
        const key = s.key(i);
        if (key?.startsWith(PROJECT_PREFIX)) {
          const id = key.slice(PROJECT_PREFIX.length);
          let name = id;
          try {
            const parsed = JSON.parse(read(key) ?? "null") as unknown;
            if (
              typeof parsed === "object" &&
              parsed !== null &&
              "name" in parsed &&
              typeof parsed.name === "string"
            ) {
              name = parsed.name;
            }
          } catch {
            // Unreadable project: keep it listed by id so it can be removed.
          }
          entries.push({ id, name, updatedAt: 0 });
        }
      }
    } catch {
      return [];
    }
    return entries;
  }

  function readIndex(): ProjectListEntry[] {
    const text = read(INDEX_KEY);
    if (text === null) {
      return rebuildIndex();
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isEntry) : rebuildIndex();
    } catch {
      return rebuildIndex();
    }
  }

  function restore(key: string, previous: string | null): void {
    try {
      if (previous === null) {
        s.removeItem(key);
      } else {
        s.setItem(key, previous);
      }
    } catch {
      // Best effort: the original write already failed.
    }
  }

  return {
    available: true,

    list() {
      return [...readIndex()].sort((a, b) => b.updatedAt - a.updatedAt);
    },

    load(id) {
      const text = read(PROJECT_PREFIX + id);
      if (text === null) {
        return null;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return { ok: false, error: "This saved project is damaged and can't be opened." };
      }
      return parseProject(raw);
    },

    save(p, foreign) {
      const key = PROJECT_PREFIX + p.id;
      const json = serializeProject(p, foreign);
      const index = readIndex().filter((e) => e.id !== p.id);
      index.push({ id: p.id, name: p.name, updatedAt: Date.now() });
      const previous = read(key);
      try {
        s.setItem(key, json);
      } catch (e) {
        throw new StoreWriteError(
          `Couldn't save "${p.name}": browser storage is full or blocked.`,
          {
            cause: e,
          },
        );
      }
      try {
        s.setItem(INDEX_KEY, JSON.stringify(index));
      } catch (e) {
        restore(key, previous);
        throw new StoreWriteError(
          `Couldn't save "${p.name}": browser storage is full or blocked.`,
          {
            cause: e,
          },
        );
      }
    },

    remove(id) {
      try {
        // Index first: if it fails, the project stays listed and loadable.
        s.setItem(INDEX_KEY, JSON.stringify(readIndex().filter((e) => e.id !== id)));
        s.removeItem(PROJECT_PREFIX + id);
      } catch {
        // Nothing else to do; the user can retry.
      }
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/share/store.test.ts && npx tsc --noEmit
```

Expected: `Tests  11 passed`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/share src/test-support
git commit -m "Add local project store with safe storage access"
```

---

### Task 12: JSON file export/import and the share/ entry point

**Files:**

- Create: `src/share/file.ts`, `src/share/index.ts`
- Test: `src/share/file.test.ts`

**Interfaces:**

- Consumes: `toSerializable`, `parseProject` (Task 9); `MAX_INFLATED_BYTES` (Task 10).
- Produces (roadmap §4.5, exact): `exportJsonFile(p: Project, foreign: ForeignData): Blob` (pretty JSON, `application/json`), `importJsonText(text: string): ParseResult` (1 MB cap, UTF-8 BOM ignored).
- Produces (additional): `jsonFileName(p: Project): string` (`"<name sanitized to [A-Za-z0-9._-]>.insert.json"`, `"insert.insert.json"` when nothing survives); `src/share/index.ts` re-exports the public `share/` API.

- [ ] **Step 1: Write the failing test**

`src/share/file.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newProject } from "../model/defaults";
import { noForeign, parseProject, serializeProject } from "../model/schema";
import { APP_VERSION } from "../model/version";
import { sampleProject } from "../test-support/sample";
import { exportJsonFile, importJsonText, jsonFileName } from "./file";

describe("exportJsonFile / importJsonText", () => {
  it("round-trips a project through a pretty-printed JSON file", async () => {
    const p = sampleProject();
    const blob = exportJsonFile(p, noForeign());
    expect(blob.type).toBe("application/json");
    const text = await blob.text();
    expect(text).toContain('\n  "box": {');
    const result = importJsonText(text);
    expect(result.ok && result.project).toEqual({ ...p, createdWith: APP_VERSION });
  });

  it("keeps foreign components in the file", async () => {
    const raw = JSON.parse(serializeProject(newProject(), noForeign())) as Record<string, unknown>;
    raw.schemaVersion = "0.1.9";
    raw.components = [{ id: "dial0001", kind: "dial" }];
    const loaded = parseProject(raw);
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const text = await exportJsonFile(loaded.project, loaded.foreign).text();
    expect(JSON.parse(text)).toMatchObject({ components: [{ id: "dial0001", kind: "dial" }] });
  });

  it("ignores a UTF-8 byte order mark", () => {
    const text = `\uFEFF${serializeProject(newProject(), noForeign())}`;
    expect(importJsonText(text).ok).toBe(true);
  });

  it("explains non-JSON and oversized files", () => {
    expect(importJsonText("<html>")).toEqual({
      ok: false,
      error: expect.stringMatching(/isn't valid JSON/),
    });
    expect(importJsonText(" ".repeat(1024 * 1024 + 1))).toEqual({
      ok: false,
      error: expect.stringMatching(/larger than 1 MB/),
    });
  });

  it("passes schema errors through", () => {
    expect(importJsonText("{}")).toEqual({
      ok: false,
      error: expect.stringMatching(/no schemaVersion/),
    });
  });
});

describe("jsonFileName", () => {
  it.each([
    ["My Game!", "My-Game.insert.json"],
    ["  Ark Nova: Marine Worlds ", "Ark-Nova-Marine-Worlds.insert.json"],
    ["Über-Spiel", "ber-Spiel.insert.json"],
    ["???", "insert.insert.json"],
    ["", "insert.insert.json"],
  ])("%j → %j", (name, expected) => {
    expect(jsonFileName({ ...newProject(), name })).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

From the repo root: `npx vitest run src/share/file.test.ts`

Expected: FAIL with `Error: Cannot find module './file'`.

- [ ] **Step 3: Implement**

`src/share/file.ts`:

```ts
import { parseProject, toSerializable } from "../model/schema";
import type { ForeignData, ParseResult, Project } from "../model/types";
import { MAX_INFLATED_BYTES } from "./link";

/** Project file contents: pretty-printed JSON, so people can read and diff it. */
export function exportJsonFile(p: Project, foreign: ForeignData): Blob {
  const json = `${JSON.stringify(toSerializable(p, foreign), null, 2)}\n`;
  return new Blob([json], { type: "application/json" });
}

/** "My Game!" → "My-Game.insert.json"; only [A-Za-z0-9._-] survive. */
export function jsonFileName(p: Project): string {
  const base = p.name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return `${base || "insert"}.insert.json`;
}

/**
 * Reads an imported file's text. Same 1 MB cap and bounds as links. A UTF-8
 * byte order mark (added by some Windows editors) is ignored.
 */
export function importJsonText(text: string): ParseResult {
  if (text.length > MAX_INFLATED_BYTES) {
    return { ok: false, error: "This file is larger than 1 MB, which is over the limit." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, error: "This file isn't valid JSON, so it can't be a project file." };
  }
  return parseProject(raw);
}
```

`src/share/index.ts`:

```ts
// Public surface of share/ (roadmap §4.5).
export {
  decodeHash,
  encodeHash,
  LINK_MAX_URL_CHARS,
  LINK_TARGET_CHARS,
  MAX_INFLATED_BYTES,
} from "./link";
export { createProjectStore, StoreWriteError, STORAGE_PREFIX } from "./store";
export type { ProjectListEntry, ProjectStore } from "./store";
export { exportJsonFile, importJsonText, jsonFileName } from "./file";
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/share && npx tsc --noEmit
```

Expected: `Test Files  4 passed`, `Tests  42 passed`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/share
git commit -m "Add JSON project file export and import"
```

---

### Task 13: Synthetic fixtures and schema-history file

**Files:**

- Create: `test/fixtures/cards-heavy.json`, `test/fixtures/bits-heavy.json`, `test/fixtures/tiles-minis.json`, `test/fixtures/tiny-box.json`, `test/fixtures/schema/0.1.0.json`
- Test: `src/model/fixtures.test.ts`

**Interfaces:**

- Consumes: `parseProject`, `noForeign` (Task 9), `validateProject` (Task 6), `encodeHash`, `decodeHash`, `LINK_TARGET_CHARS` (Task 10).
- Produces: roadmap §5 fixtures, valid at `SCHEMA_VERSION`, importable with `import x from "../../test/fixtures/<name>.json"` (plans 2–4 use them). `tiny-box.json` is valid input that cannot fit (plan 4's infeasible case). `test/fixtures/schema/<version>.json`: one saved file per schema line; the test loads every file there (spec §11).

- [ ] **Step 1: Write the failing test**

`src/model/fixtures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tinyBox from "../../test/fixtures/tiny-box.json";
import { LINK_TARGET_CHARS, decodeHash, encodeHash } from "../share/link";
import { noForeign, parseProject } from "./schema";
import { validateProject } from "./validate";
import { SCHEMA_VERSION } from "./version";

/** Synthetic games (roadmap §5) until real measured games exist (spec §12). */
const FIXTURES: Record<string, unknown> = {
  "cards-heavy": cardsHeavy,
  "bits-heavy": bitsHeavy,
  "tiles-minis": tilesMinis,
  "tiny-box": tinyBox,
};

/**
 * One saved file per historical schema line (spec §11). Add a file here
 * whenever SCHEMA_VERSION's line changes, and keep the old ones: they must
 * keep loading (through migrations from 1.0 on). The 0.x files are deleted
 * at 1.0, which refuses 0.x files by design.
 */
const HISTORY = import.meta.glob<unknown>("../../test/fixtures/schema/*.json", {
  eager: true,
  import: "default",
});

function load(raw: unknown) {
  const result = parseProject(raw);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

describe.each(Object.entries(FIXTURES))("fixture %s", (_name, raw) => {
  it("is at the current schema version", () => {
    expect((raw as { schemaVersion: string }).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("parses without notices and validates without errors", () => {
    const { project, foreign, notices } = load(raw);
    expect(notices).toEqual([]);
    expect(foreign.components).toEqual([]);
    expect(validateProject(project).filter((n) => n.level === "error")).toEqual([]);
  });

  it(`fits in a ${LINK_TARGET_CHARS}-character link and decodes back`, () => {
    const { project } = load(raw);
    const hash = encodeHash(project, noForeign());
    expect(hash.length).toBeLessThanOrEqual(LINK_TARGET_CHARS);
    const decoded = decodeHash(hash);
    expect(decoded.ok && decoded.project).toEqual(project);
  });
});

describe("schema history", () => {
  it("has a file for the current schema version", () => {
    expect(Object.keys(HISTORY)).toContain(`../../test/fixtures/schema/${SCHEMA_VERSION}.json`);
  });

  it.each(Object.entries(HISTORY))("%s still loads", (_path, raw) => {
    expect(parseProject(raw).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

From the repo root: `npx vitest run src/model/fixtures.test.ts`

Expected: FAIL with `Error: Cannot find module '../../test/fixtures/bits-heavy.json'`.

- [ ] **Step 3: Add the fixtures**

`cards-heavy.json` — 290 × 290 × 70 box, headroom 8, 6 decks of standard-sleeved Standard cards (40–90 cards each) in three components:

`test/fixtures/cards-heavy.json`:

```json
{
  "schemaVersion": "0.1.0",
  "createdWith": "0.1.0",
  "id": "fxcards1",
  "name": "Fixture: cards heavy",
  "box": {
    "innerWidth": 290,
    "innerDepth": 290,
    "innerHeight": 70,
    "headroom": 8,
    "headroomCoverage": "full",
    "storedOnSide": false
  },
  "printer": { "bedX": 256, "bedY": 256, "bedZ": 256, "bedMargin": 5, "layerHeight": 0.2 },
  "settings": {
    "wall": 1.6,
    "floor": 1.2,
    "divider": 1.2,
    "fit": 1,
    "cardClearance": 1.5,
    "cardStackClearance": 1,
    "cardStackClearancePct": 0.03,
    "cardThickness": 0.32,
    "pieceClearance": 1,
    "boxClearance": 0.5,
    "trayGap": 0.2,
    "bottomChamfer": 0.4,
    "cornerRadius": 3,
    "scoopRadius": 12,
    "fingerPocket": { "width": 22, "reach": 12 },
    "lip": {
      "enabled": true,
      "height": 2,
      "thickness": 1.2,
      "ledge": 1.7,
      "play": 0.25
    },
    "topPressFit": 0,
    "packingFactor": 0.5,
    "leftover": "spare"
  },
  "components": [
    {
      "id": "fxcrd001",
      "name": "Action cards",
      "access": "often",
      "kind": "cards",
      "shortSide": 63.5,
      "longSide": 88,
      "decks": [
        { "name": "Action", "count": 90 },
        { "name": "Bonus", "count": 40 }
      ],
      "sleeve": "standard",
      "thickness": { "mode": "preset" },
      "storage": "auto"
    },
    {
      "id": "fxcrd002",
      "name": "Market",
      "access": "often",
      "kind": "cards",
      "shortSide": 63.5,
      "longSide": 88,
      "decks": [
        { "name": "Market", "count": 80 },
        { "name": "Events", "count": 60 }
      ],
      "sleeve": "standard",
      "thickness": { "mode": "preset" },
      "storage": "auto"
    },
    {
      "id": "fxcrd003",
      "name": "Objectives",
      "access": "sometimes",
      "kind": "cards",
      "shortSide": 63.5,
      "longSide": 88,
      "decks": [
        { "name": "Goals", "count": 45 },
        { "name": "Starting hands", "count": 50 }
      ],
      "sleeve": "standard",
      "thickness": { "mode": "preset" },
      "storage": "auto"
    }
  ],
  "locks": []
}
```

`bits-heavy.json` — 300 × 220 × 60 box, headroom 4, four bulk components, one `perPlayer: 4`:

`test/fixtures/bits-heavy.json`:

```json
{
  "schemaVersion": "0.1.0",
  "createdWith": "0.1.0",
  "id": "fxbits01",
  "name": "Fixture: bits heavy",
  "box": {
    "innerWidth": 300,
    "innerDepth": 220,
    "innerHeight": 60,
    "headroom": 4,
    "headroomCoverage": "full",
    "storedOnSide": false
  },
  "printer": { "bedX": 256, "bedY": 256, "bedZ": 256, "bedMargin": 5, "layerHeight": 0.2 },
  "settings": {
    "wall": 1.6,
    "floor": 1.2,
    "divider": 1.2,
    "fit": 1,
    "cardClearance": 1.5,
    "cardStackClearance": 1,
    "cardStackClearancePct": 0.03,
    "cardThickness": 0.32,
    "pieceClearance": 1,
    "boxClearance": 0.5,
    "trayGap": 0.2,
    "bottomChamfer": 0.4,
    "cornerRadius": 3,
    "scoopRadius": 12,
    "fingerPocket": { "width": 22, "reach": 12 },
    "lip": {
      "enabled": true,
      "height": 2,
      "thickness": 1.2,
      "ledge": 1.7,
      "play": 0.25
    },
    "topPressFit": 0,
    "packingFactor": 0.5,
    "leftover": "spare"
  },
  "components": [
    {
      "id": "fxbit001",
      "name": "Resources",
      "access": "often",
      "kind": "bulk",
      "items": [
        { "name": "Wood cube", "count": 40, "w": 8, "d": 8, "h": 8 },
        { "name": "Stone cube", "count": 40, "w": 8, "d": 8, "h": 8 },
        { "name": "Coin", "count": 30, "w": 20, "d": 20, "h": 2 }
      ]
    },
    {
      "id": "fxbit002",
      "name": "Player pieces",
      "access": "sometimes",
      "kind": "bulk",
      "perPlayer": { "players": 4 },
      "items": [
        { "name": "Meeple", "count": 5, "w": 16, "d": 10, "h": 16 },
        { "name": "Disc", "count": 10, "w": 15, "d": 15, "h": 4 }
      ]
    },
    {
      "id": "fxbit003",
      "name": "Tokens",
      "access": "sometimes",
      "kind": "bulk",
      "items": [{ "name": "Cardboard tokens", "volumeMl": 150 }]
    },
    {
      "id": "fxbit004",
      "name": "Dice",
      "access": "often",
      "kind": "bulk",
      "items": [{ "name": "D6", "count": 10, "w": 16, "d": 16, "h": 16 }]
    }
  ],
  "locks": []
}
```

`tiles-minis.json` — 300 × 300 × 80 box, headroom 10, 60 hex tiles (flat-to-flat 40, 2 mm), 12 minis:

`test/fixtures/tiles-minis.json`:

```json
{
  "schemaVersion": "0.1.0",
  "createdWith": "0.1.0",
  "id": "fxtile01",
  "name": "Fixture: tiles and minis",
  "box": {
    "innerWidth": 300,
    "innerDepth": 300,
    "innerHeight": 80,
    "headroom": 10,
    "headroomCoverage": "full",
    "storedOnSide": false
  },
  "printer": { "bedX": 256, "bedY": 256, "bedZ": 256, "bedMargin": 5, "layerHeight": 0.2 },
  "settings": {
    "wall": 1.6,
    "floor": 1.2,
    "divider": 1.2,
    "fit": 1,
    "cardClearance": 1.5,
    "cardStackClearance": 1,
    "cardStackClearancePct": 0.03,
    "cardThickness": 0.32,
    "pieceClearance": 1,
    "boxClearance": 0.5,
    "trayGap": 0.2,
    "bottomChamfer": 0.4,
    "cornerRadius": 3,
    "scoopRadius": 12,
    "fingerPocket": { "width": 22, "reach": 12 },
    "lip": {
      "enabled": true,
      "height": 2,
      "thickness": 1.2,
      "ledge": 1.7,
      "play": 0.25
    },
    "topPressFit": 0,
    "packingFactor": 0.5,
    "leftover": "spare"
  },
  "components": [
    {
      "id": "fxtil001",
      "name": "Hex map tiles",
      "access": "setup",
      "kind": "tiles",
      "shape": { "type": "hex", "flatToFlat": 40, "orientation": "flat" },
      "thickness": 2,
      "count": 60,
      "storage": "auto"
    },
    {
      "id": "fxmin001",
      "name": "Miniatures",
      "access": "sometimes",
      "kind": "minis",
      "storage": "pockets",
      "figures": [
        { "name": "Hero", "w": 25, "d": 25, "h": 45, "count": 4 },
        { "name": "Monster", "w": 40, "d": 40, "h": 60, "count": 2 },
        { "name": "Minion", "w": 25, "d": 25, "h": 35, "count": 6 }
      ]
    }
  ],
  "locks": []
}
```

`tiny-box.json` — 150 × 100 × 40 box with 400 sleeved cards (valid input; it cannot fit: upright cards need ≈ 68 mm of height, a flat stack ≈ 170 mm):

`test/fixtures/tiny-box.json`:

```json
{
  "schemaVersion": "0.1.0",
  "createdWith": "0.1.0",
  "id": "fxtiny01",
  "name": "Fixture: tiny box (does not fit)",
  "box": {
    "innerWidth": 150,
    "innerDepth": 100,
    "innerHeight": 40,
    "headroom": 0,
    "headroomCoverage": "full",
    "storedOnSide": false
  },
  "printer": { "bedX": 256, "bedY": 256, "bedZ": 256, "bedMargin": 5, "layerHeight": 0.2 },
  "settings": {
    "wall": 1.6,
    "floor": 1.2,
    "divider": 1.2,
    "fit": 1,
    "cardClearance": 1.5,
    "cardStackClearance": 1,
    "cardStackClearancePct": 0.03,
    "cardThickness": 0.32,
    "pieceClearance": 1,
    "boxClearance": 0.5,
    "trayGap": 0.2,
    "bottomChamfer": 0.4,
    "cornerRadius": 3,
    "scoopRadius": 12,
    "fingerPocket": { "width": 22, "reach": 12 },
    "lip": {
      "enabled": true,
      "height": 2,
      "thickness": 1.2,
      "ledge": 1.7,
      "play": 0.25
    },
    "topPressFit": 0,
    "packingFactor": 0.5,
    "leftover": "spare"
  },
  "components": [
    {
      "id": "fxtny001",
      "name": "Far too many cards",
      "access": "sometimes",
      "kind": "cards",
      "shortSide": 63.5,
      "longSide": 88,
      "decks": [
        { "name": "Deck A", "count": 100 },
        { "name": "Deck B", "count": 100 },
        { "name": "Deck C", "count": 100 },
        { "name": "Deck D", "count": 100 }
      ],
      "sleeve": "standard",
      "thickness": { "mode": "preset" },
      "storage": "auto"
    }
  ],
  "locks": []
}
```

`schema/0.1.0.json` — the `sampleProject()` of Task 8 frozen as a file (every component kind, every lock kind, a stored layout). Never regenerate it from code: it records what schema 0.1.0 looked like.

`test/fixtures/schema/0.1.0.json`:

```json
{
  "schemaVersion": "0.1.0",
  "createdWith": "0.1.0",
  "id": "sample01",
  "name": "Sample",
  "box": {
    "innerWidth": 290,
    "innerDepth": 290,
    "innerHeight": 70,
    "headroom": 8,
    "headroomCoverage": "partial",
    "storedOnSide": false
  },
  "printer": { "bedX": 256, "bedY": 256, "bedZ": 256, "bedMargin": 5, "layerHeight": 0.2 },
  "settings": {
    "wall": 1.6,
    "floor": 1.2,
    "divider": 1.2,
    "fit": 1,
    "cardClearance": 1.5,
    "cardStackClearance": 1,
    "cardStackClearancePct": 0.03,
    "cardThickness": 0.32,
    "pieceClearance": 1,
    "boxClearance": 0.5,
    "trayGap": 0.2,
    "bottomChamfer": 0.4,
    "cornerRadius": 3,
    "scoopRadius": 12,
    "fingerPocket": { "width": 22, "reach": 12 },
    "lip": {
      "enabled": true,
      "height": 2,
      "thickness": 1.2,
      "ledge": 1.7,
      "play": 0.25
    },
    "topPressFit": 0,
    "packingFactor": 0.5,
    "leftover": "spare"
  },
  "components": [
    {
      "id": "cards001",
      "name": "Main deck",
      "access": "often",
      "kind": "cards",
      "shortSide": 63.5,
      "longSide": 88,
      "decks": [
        { "name": "Action", "count": 60 },
        { "name": "Event", "count": 40 }
      ],
      "sleeve": "standard",
      "thickness": { "mode": "preset" },
      "storage": "auto"
    },
    {
      "id": "cards002",
      "name": "Big cards",
      "access": "setup",
      "kind": "cards",
      "shortSide": 70,
      "longSide": 120,
      "decks": [{ "name": "Scenario", "count": 12 }],
      "sleeve": { "w": 73, "h": 123, "thickness": 0.15 },
      "thickness": { "mode": "measured", "cards": 12, "stackMm": 5.4 },
      "storage": "flat",
      "groupId": "setup",
      "clearance": 2
    },
    {
      "id": "bulk0001",
      "name": "Player bits",
      "access": "sometimes",
      "kind": "bulk",
      "perPlayer": { "players": 4 },
      "items": [
        { "name": "Meeple", "count": 5, "w": 16, "d": 10, "h": 16 },
        { "name": "Score marker", "volumeMl": 20 }
      ]
    },
    {
      "id": "tiles001",
      "name": "Map tiles",
      "access": "setup",
      "kind": "tiles",
      "shape": { "type": "hex", "flatToFlat": 40, "orientation": "pointy" },
      "thickness": 2,
      "count": 60,
      "storage": "auto",
      "groupId": "setup"
    },
    {
      "id": "minis001",
      "name": "Heroes",
      "access": "sometimes",
      "kind": "minis",
      "figures": [
        { "name": "Knight", "w": 25, "d": 25, "h": 45, "count": 2 },
        { "name": "Dragon", "w": 60, "d": 50, "h": 70, "count": 1 }
      ],
      "storage": "pockets"
    },
    {
      "id": "custom01",
      "name": "Score pad",
      "access": "setup",
      "kind": "custom",
      "w": 100,
      "d": 70,
      "h": 10,
      "count": 1
    }
  ],
  "locks": [
    { "kind": "position", "trayKey": "cards001:p0:0", "path": "01", "rotated": true },
    { "kind": "size", "trayKey": "minis001:p0:0", "w": 120, "d": 80, "h": 61.8 },
    { "kind": "stack", "trayKeys": ["setup:p0:0", "cards001:p0:0"] }
  ],
  "layout": {
    "createdWith": "0.1.0",
    "geometryVersion": "0.1.0",
    "inputsHash": "00000000000000",
    "seed": 42,
    "iterations": 3000,
    "capped": false,
    "trays": [
      {
        "key": "custom01:p0:0",
        "part": "tray",
        "path": "1",
        "stack": 0,
        "level": 0,
        "x": 0,
        "y": 0,
        "z": 0,
        "w": 104,
        "d": 74,
        "h": 62,
        "rotated": false,
        "wall": 1.6,
        "floor": 1.2,
        "lip": false,
        "solid": false,
        "compartments": [
          {
            "x": 1.6,
            "y": 1.6,
            "w": 100.8,
            "d": 70.8,
            "floorZ": 50,
            "kind": "well",
            "contents": "Score pad",
            "features": [
              {
                "type": "fingerPocket",
                "side": "front",
                "at": 50.4,
                "width": 22,
                "reach": 12,
                "depth": 12
              },
              { "type": "cornerRelief", "d": 3 }
            ]
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/model/fixtures.test.ts && npx tsc --noEmit
```

Expected: `Tests  14 passed`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add test src/model/fixtures.test.ts
git commit -m "Add synthetic fixtures and schema history file"
```

---

### Task 14: Full verification

**Files:**

- Modify: only files that the checks below flag.

**Interfaces:**

- Consumes: everything above. Produces: a green `npm run verify`.

- [ ] **Step 1: Run the whole app test suite and build**

From the repo root:

```bash
npm run build
```

Expected: `Test Files  17 passed`, `Tests  204 passed`; `tsc` silent; Vite `✓ built`.

- [ ] **Step 2: Run the repo gate**

From the repo root:

```bash
npm run verify
```

Expected: lint (ESLint, Stylelint, html-validate) clean, `All matched files use Prettier code style!`, and `Built 4 app(s).` (`build-app.mjs` runs `npm ci` and `npm run build` in `apps/insert-generator`, so the committed lockfile must match `package.json`).

If Prettier flags files, run `npx prettier --write <files>` from the root; if ESLint flags something, fix the code (never disable a rule) and re-run the owning task's tests. If `npm ci` fails with a lockfile mismatch, run `npm install` in `apps/insert-generator` and commit `package-lock.json`.

- [ ] **Step 3: Check that nothing unintended is tracked**

```bash
git status --short
```

Expected: clean, or only the fixes from Step 2. `node_modules/`, `dist/` and `_build/` must not appear (they are git-ignored).

- [ ] **Step 4: Commit any fixes**

Only if Step 2 changed files:

```bash
git add -A apps/insert-generator eslint.config.mjs renovate.json
git commit -m "Fix lint and formatting for insert-generator foundation"
```

---

## Additional exports for later plans (no contract change)

Beyond roadmap §4.5, this plan exports: `isPreview`, `Semver`, `UNKNOWN_APP_VERSION` (version.ts); `deepFreeze` (freeze.ts); `WALL_CHOICES`, `FIT_CHOICES` (settings.ts); `CardPreset`, `BedPreset`, `STANDARD_CARD`, `BAMBU_256_BED` (presets.ts); `DEFAULT_BOX`, `DEFAULT_PRINTER`, `DEFAULT_PROJECT_NAME`, `KIND_NAMES`, `COMPONENT_DEFAULTS`, `groupOf` (defaults.ts); `isBlocking`, `SETTING_RANGES`, `SettingRange`, `MAX_VOLUME_ML`, `LAYER_HEIGHT_MIN`, `LAYER_HEIGHT_MAX`, `VALIDATION_NOTICE_CODES` (validate.ts); `canonicalJson`, `cyrb53` (hash.ts); `Json`, `isRecord`, `isArrayIndex`, `pointerKeys`, `escapePointerKey`, `valueAt`, `MAX_JSON_DEPTH`, `jsonDepthExceeds`, `shorten`, `quote`, `summarize` (json.ts); `readProject` (callers must reject input deeper than `MAX_JSON_DEPTH` first; `parseProjectWith` does), `ReadOptions`, `ForeignValue`, `TOO_DEEP_ERROR` (schema-read.ts); `Migration`, `MIGRATIONS`, `ParseOptions` (with `enforceBounds?: boolean`, default true), `parseProjectWith`, `parseStoredProject` (enforceBounds false; used by `ProjectStore.load`, which first sets the id to the storage key's), `toSerializable`, `noForeign`, `SCHEMA_NOTICE_CODES` (schema.ts); `isBase64UrlChar`, `toBase64Url`, `fromBase64Url` (base64url.ts); `HASH_FORMAT`, `MAX_INFLATED_BYTES`, `LINK_TARGET_CHARS`, `LINK_MAX_URL_CHARS`, `inflateCapped`, `InflateLimitError` (link.ts); `STORAGE_PREFIX`, `ProjectListEntry`, `StoreWriteError` (store.ts); `jsonFileName` (file.ts). Internal to the reader (no other plan imports them): `schema-reader.ts` (`Reader`, `Ctx` and its helpers; `SCHEMA_NOTICE_CODES` is defined there and re-exported from schema.ts), `schema-read-components.ts`, `schema-read-layout.ts`. Test-only: `sampleProject()`, `MemoryStorage` in `src/test-support/`.

## Contract changes

All three were accepted, and the roadmap (§4.1 `ForeignData`, §4.5 `ProjectStore`) has been amended to match. This plan implements the amended contract:

1. **`ProjectStore.save()` may throw `StoreWriteError`** (exported from `src/share/store.ts` and `src/share/index.ts`) when the browser refuses the write (storage full), after restoring the previous state. It never throws for any other reason. Plan 5 must catch it and show "Autosave failed: browser storage is full".
2. **`createProjectStore(storage?: Storage | null)`**: `null` means "no storage".
3. **`ForeignData.values?: { path: string; raw: unknown }[]`** (JSON-pointer paths) holds unknown enum values from `box`/`printer`/`settings` and locks of unknown kinds from newer-minor files. `serializeProject` writes them back under the "changed since loading" rule described in "Decisions this plan makes".
4. **Two TypeScript projects (roadmap §2, §4.9).** `tsconfig.json` checks `src/` without Node types; `tsconfig.node.json` checks the Node-side config files with `@types/node ^22.0.0` (added to the roadmap §2 dependency list). `build` and `typecheck` run both. Plan 5 adds `licenses.config.ts` to `tsconfig.node.json` instead of using a program-wide `/// <reference types="node" />`.
