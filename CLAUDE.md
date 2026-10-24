# Insert Generator

A browser app that plans and builds 3D-printable board-game box inserts (Vite, TypeScript,
Preact 11 with signals; layout optimizer and manifold geometry in Web Workers).

## Read before changing anything

- **[docs/DESIGN.md](docs/DESIGN.md)**: design rules. Hard rules (MUST) and soft principles
  (SHOULD) for how the app looks, speaks and behaves, plus engine limits and the decision log.
  Read it before any UI or copy change.
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**: development guidelines. Architecture, rules by
  area, gotchas learned the hard way, and recipes (new setting, dialog, notice, string).
  Read it before writing code.
- **[README.md](README.md)**: what the app does, and the versioning rules under
  "How to add a kind of item".

- **UI work** (anything visual): follow DEVELOPMENT.md → "UI work". Briefs carry the design
  boards, layout comes first, every task passes a screenshot-vs-board check, and the owner sees
  the running app early. Why: [docs/retros/2026-10-16-ux-redesign.md](docs/retros/2026-10-16-ux-redesign.md).

If a rule in those documents is wrong, change the document on purpose in the same commit as the
code and record why (DESIGN.md has a decision log). Don't work around it silently.

## Working here

- `npm test` for the unit tests; `npm run verify` is the gate (lint, format, tests, typecheck,
  build, dist smoke check). It takes several minutes.
- Every PR bumps the version in `package.json` (CI checks it).
- Every PR adds its entry to `CHANGELOG.md` under "Unreleased" (or under its own version); an
  integrating PR moves them under the new version (CI checks it; see DEVELOPMENT.md →
  "Write a changelog entry and cut a release"). Merging to main tags and releases the version.
- Never add `Co-Authored-By:` or any other trailer to commit messages.
