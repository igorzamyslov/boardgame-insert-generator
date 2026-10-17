// src/viewer/shotsScene.ts
// A read-only window onto the 3D scene for the screenshot harness (docs/design/README.md, "Shots
// mode"): the real-browser probe needs to know which trays glow, and a canvas cannot say. Like
// `shotsHold`, it exists only in a `--mode shots` build: Vite folds `import.meta.env.MODE` at
// build time, so a production build carries none of it and `scripts/smoke-dist.mjs` checks that.

export interface ShotsScene {
  /** Each tray's emissive colour (a number, 0 for none), by its key. */
  emissive(): Record<string, number>;
}

/** Offers `read` to the harness as `globalThis.__shotsScene`; the returned function takes it back. */
export function exposeShotsScene(read: ShotsScene["emissive"]): () => void {
  if (import.meta.env.MODE !== "shots") {
    return () => undefined;
  }
  const mine: ShotsScene = { emissive: read };
  globalThis.__shotsScene = mine;
  return () => {
    if (globalThis.__shotsScene === mine) {
      delete globalThis.__shotsScene;
    }
  };
}
