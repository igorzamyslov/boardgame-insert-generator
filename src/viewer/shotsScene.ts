// src/viewer/shotsScene.ts
// A read-only window onto the 3D scene for the screenshot harness (docs/design/README.md, "Shots
// mode"): the real-browser probe needs to know which trays glow, and a canvas cannot say. Like
// `shotsHold`, it exists only in a `--mode shots` build: Vite folds `import.meta.env.MODE` at
// build time, so a production build carries none of it and `scripts/smoke-dist.mjs` checks that.

export interface ShotsScene {
  /** Each tray's emissive colour (a number, 0 for none), by its key. */
  emissive(): Record<string, number>;
  /**
   * Each tray's colour now and its own colour at full strength (hex), and how opaque it is drawn
   * (1, but for the trays an edited item fades), and the colours its wells are drawn in inside (full
   * strength, none for a part drawn in one colour), by its key, and the page's colour a faded tray
   * moves toward.
   */
  tints(): {
    page: string;
    trays: Record<string, { color: string; base: string; opacity: number; wells: string[] }>;
  };
  /**
   * How far the model is from being cut off by the frame now: the largest x or y of any corner of
   * the box or of a part shown, in the frame's own -1..1 (a value over 1 is a part outside the frame).
   */
  framing(): { overflow: number };
}

/** Offers `scene` to the harness as `globalThis.__shotsScene`; the returned function takes it back. */
export function exposeShotsScene(scene: ShotsScene): () => void {
  if (import.meta.env.MODE !== "shots") {
    return () => undefined;
  }
  const mine = scene;
  globalThis.__shotsScene = mine;
  return () => {
    if (globalThis.__shotsScene === mine) {
      delete globalThis.__shotsScene;
    }
  };
}
