import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import pkg from "./package.json";
import { licensePlugin } from "./licenses.config";

// `base: "./"` keeps every asset URL relative, so the built app works from any
// subpath (e.g. /<repo>/insert-generator/).
export default defineConfig({
  base: "./",
  plugins: [preact(), licensePlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Geometry worker: an ES module worker (spec §4). manifold-3d ships its own
  // WASM loader, so keep it out of dependency pre-bundling; the worker passes
  // the `?url`-imported WASM to locateFile.
  worker: { format: "es" },
  optimizeDeps: { exclude: ["manifold-3d"] },
  build: {
    // The 3D view's chunk (three.js, ~550 kB) is loaded lazily, only when WebGL is there, and the
    // main chunk stays near 200 kB; the default 500 kB warning would only repeat that on every build.
    chunkSizeWarningLimit: 600,
  },
  test: {
    // Pure modules run in Node. Component tests opt in to a DOM with a
    // `// @vitest-environment jsdom` comment in the header comment at the top of the file.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    // Vitest stubs CSS imports to ""; PlanView.test.tsx reads plan.css and style.test.ts reads
    // style.css as `?raw` to check their rules, so those files are passed through.
    css: { include: [/plan\.css/, /style\.css/] },
  },
});
