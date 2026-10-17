import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import pkg from "./package.json";
import { licensePlugin } from "./licenses.config";
import { resolveBuildId } from "./build-id.config";

// `base: "./"` keeps every asset URL relative, so the built app works from any
// subpath (e.g. /<repo>/insert-generator/).
export default defineConfig({
  base: "./",
  plugins: [preact(), licensePlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Display only (footer): never part of createdWith or the inputs hash.
    __BUILD_ID__: JSON.stringify(resolveBuildId()),
  },
  // Geometry worker: an ES module worker (spec §4). manifold-3d ships its own
  // WASM loader, so keep it out of dependency pre-bundling; the worker passes
  // the `?url`-imported WASM to locateFile.
  worker: { format: "es" },
  optimizeDeps: { exclude: ["manifold-3d"] },
  build: {
    // The 3D view's chunk (three.js, ~550 kB) is loaded lazily, only when WebGL is there, so the
    // main chunk stays well under it; the default 500 kB warning would only repeat that on every build.
    chunkSizeWarningLimit: 600,
  },
  test: {
    // Pure modules run in Node. Component tests opt in to a DOM with a
    // `// @vitest-environment jsdom` comment in the header comment at the top of the file.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    // Vitest stubs CSS imports to ""; PlanView.test.tsx reads plan.css, AssemblyPage.test.tsx
    // assembly.css, ExportPanel.test.tsx export.css, style.test.ts style.css, base.css, fonts.css and tokens.css (tokens also read by identity.test.ts), the kit's tests kit.css, Workspace's style tests workspace.css, the header's header.css, the rail's rail.css, the stage's stage.css and the first visit's firstVisit.css, the tray bar's trayBar.css, the editors' editor.css, the editor stage's editorStage.css and the box's boxPanel.css and boxStage.css and the fit problems' fitProblem.css and the settings drawer's settings.css, as `?raw` to check their rules, so those files are
    // passed through.
    css: {
      include: [
        /plan\.css/,
        /assembly\.css/,
        /export\.css/,
        /style\.css/,
        /base\.css/,
        /fonts\.css/,
        /tokens\.css/,
        /kit\.css/,
        /workspace\.css/,
        /header\.css/,
        /rail\.css/,
        /stage\.css/,
        /firstVisit\.css/,
        /trayBar\.css/,
        /editor\.css/,
        /editorStage\.css/,
        /boxStage\.css/,
        /boxPanel\.css/,
        /fitProblem\.css/,
        /settings\.css/,
      ],
    },
  },
});
