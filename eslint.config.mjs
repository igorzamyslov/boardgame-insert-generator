import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier";

// test-only helpers (test-*.ts) stay out of production code, so the app
// bundle never pulls in vitest or fixtures.
const TEST_HELPER_IMPORTS = {
  group: ["**/test-*"],
  message: "Production code must not import test-only helpers (test-*.ts).",
};

export default tseslint.config(
  // Never lint build output or dependencies, nor the agent worktrees under .claude (each is a
  // whole checkout of the repo; prettier skips them too, see .prettierignore).
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "_build/**",
      "_site/**",
      "**/*.min.js",
      ".claude/**",
    ],
  },

  // Baseline: recommended JS + strict TypeScript (non-type-checked).
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

  // Extra strictness applied everywhere.
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "no-implicit-coercion": "error",
      "no-param-reassign": "error",
      "prefer-template": "error",
      "object-shorthand": "error",
      curly: ["error", "all"],
    },
  },

  // Tooling that runs in Node (build scripts, config files): allow console,
  // provide Node globals.
  {
    files: ["scripts/**", "**/*.config.{js,mjs,ts}", "**/build.mjs"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-console": "off" },
  },

  // the layout optimizer must be deterministic (spec §7.2),
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

  // the main thread must not pull the geometry kernel (and
  // manifold-3d with its WASM) into the app bundle. Outside geometry/ it may
  // import only geometry/types, geometry/version, geometry/engraves and geometry/buildable (pure
  // planning, no kernel: whether a name fits on a part, whether planTray accepts a part) and
  // geometry/client, which talks to the kernel through a Web Worker (roadmap section 4.6). Tests,
  // test-only helpers (test-*.ts) and geometry/ itself are exempt. The pattern group is an
  // allowlist: every geometry/* module except those five is restricted, new ones included.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/geometry/**", "src/**/*.test.{ts,tsx}", "src/**/test-*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "manifold-3d",
              message:
                "manifold-3d belongs in the geometry worker; the main thread uses geometry/client (roadmap 4.6).",
            },
          ],
          patterns: [
            {
              group: [
                "manifold-3d/*",
                "**/geometry/*",
                "!**/geometry/types",
                "!**/geometry/version",
                "!**/geometry/engraves",
                "!**/geometry/buildable",
                "!**/geometry/client",
              ],
              message:
                "The main thread may import only geometry/types, geometry/version, geometry/engraves, geometry/buildable and geometry/client (roadmap 4.6).",
            },
            {
              regex: "(^|/)geometry/?$",
              message:
                "A directory import resolves to geometry/index, the kernel: import geometry/types, geometry/version or geometry/client (roadmap 4.6).",
            },
            TEST_HELPER_IMPORTS,
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportExpression[source.value=/manifold-3d|geometry(\\/(?!(types|version|client)$).*)?$/]",
          message:
            "Do not import the geometry kernel dynamically on the main thread (roadmap 4.6): use geometry/client.",
        },
      ],
    },
  },

  // production code under geometry/ must not import test-only helpers either
  // (the block above covers the rest of src/ and does not apply here).
  {
    files: ["src/geometry/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}", "src/**/test-*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [TEST_HELPER_IMPORTS] }],
    },
  },

  // Turn off stylistic rules that Prettier owns. Keep this last.
  prettier,
);
