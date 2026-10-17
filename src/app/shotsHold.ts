// src/app/shotsHold.ts
// A pause the screenshot harness can hold open (docs/design/README.md, "Shots mode"): the build
// of a download or a longer search must stay mid-way for a screenshot, and a timed screenshot
// would race a fast machine. `npm run shots` serves the app with `--mode shots` and sets
// `globalThis.__shotsHold[point]` to a promise that never settles. Vite folds
// `import.meta.env.MODE` at build time, so a production build carries none of this and
// `scripts/smoke-dist.mjs` checks that.

export type ShotsHoldPoint = "export" | "search";

/** Resolves at once, unless this is a shots-mode build and the harness holds `point`. */
export function shotsHold(point: ShotsHoldPoint): Promise<void> {
  if (import.meta.env.MODE !== "shots") {
    return Promise.resolve();
  }
  return globalThis.__shotsHold?.[point] ?? Promise.resolve();
}
