# insert-generator

Built app: **Vite + TypeScript + Preact**. Turns a board game box and its
components into a 3D-printable insert (trays that fill the box, stack, and fit
the print bed). Design: [`docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md`](docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md).

Status: **preview (0.x)**: saved projects and shared links may break between
versions.

```bash
npm install
npm run dev        # dev server
npm test           # vitest run
npm run verify     # lint + format check + build (what CI runs)
npm run build      # vitest run && tsc (app + node configs) && vite build → dist/
npm run preview    # serve the production build
```

Tests run inside `npm run build`, because the quality gate only runs
lint, format and build. Pure modules test in Node; component tests opt in to
jsdom with `// @vitest-environment jsdom` on their first line.

`vite.config.ts` sets `base: "./"` for subpath hosting and defines
`__APP_VERSION__` from `package.json`. TypeScript strictness comes from
[`tsconfig.base.json`](tsconfig.base.json). `tsconfig.json`
checks the browser code in `src/` (no Node types); `tsconfig.node.json` checks
the config files that run in Node. `npm run typecheck` runs both.

## Publishing

This app is published to GitHub Pages through
[igorzamyslov/static-web-apps](https://github.com/igorzamyslov/static-web-apps),
where it is a git submodule at `apps/insert-generator`. A new version goes live
when that repo's submodule pointer is bumped to a commit of this one.
