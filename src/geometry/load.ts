import Module from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";

let cached: Promise<ManifoldToplevel> | null = null;

// Loads and initialises the single-threaded manifold WASM module once.
// - Node (vitest): call without arguments; manifold.js finds manifold.wasm
//   next to itself.
// - Browser/worker: pass the URL from `import wasmUrl from
//   "manifold-3d/manifold.wasm?url"` so Vite emits the asset and the
//   relative base works under any subpath.
// The first call wins; a failed load is forgotten so the next call retries.
export function loadManifold(wasmUrl?: string): Promise<ManifoldToplevel> {
  if (cached === null) {
    const config = wasmUrl === undefined ? undefined : { locateFile: () => wasmUrl };
    const loading = Module(config).then((m) => {
      m.setup();
      return m;
    });
    loading.catch(() => {
      if (cached === loading) {
        cached = null;
      }
    });
    cached = loading;
  }
  return cached;
}
