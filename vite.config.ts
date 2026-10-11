import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import pkg from "./package.json";

// `base: "./"` keeps every asset URL relative, so the built app works from any
// subpath (e.g. /<repo>/insert-generator/).
export default defineConfig({
  base: "./",
  plugins: [preact()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    // Pure modules run in Node. Component tests opt in to a DOM with a
    // `// @vitest-environment jsdom` comment on their first line.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
