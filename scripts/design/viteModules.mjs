// scripts/design/viteModules.mjs
// Loads the app's TypeScript in Node through Vite (ssrLoadModule), with the project's own
// config, so `define`s, `import.meta.glob` and the `@/`-free relative imports all work.
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Starts a middleware-mode Vite server; `load("src/x.ts")` returns the module, `close()` stops it. */
export async function createModuleLoader() {
  const server = await createServer({
    root: ROOT,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  return {
    load: (path) => server.ssrLoadModule(`/${path}`),
    close: () => server.close(),
  };
}
