import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "web",
  // Relative asset URLs so the site works from a subpath (GitHub Pages project site).
  base: "./",
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    // The polyfill would call fetch() for preloaded modules; the CSP forbids it.
    modulePreload: false,
    // Readable output: the deployed bundle stays auditable and keeps export names.
    minify: false,
    rollupOptions: {
      input: {
        index: "index.html",
        ko: "ko/index.html",
        core: "core.ts",
        verification: "verification.html",
      },
      output: {
        // `core.ts` is both an entry and the app's dependency; keep its export names.
        minifyInternalExports: false,
        entryFileNames: "[name].js",
      },
    },
  },
  // The playground is built from `web/`, but the test suite lives at the repo root.
  test: { root: ".", exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"] },
});
