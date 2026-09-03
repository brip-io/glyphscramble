import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "./woff2-worker-source.js": fileURLToPath(
        new URL("./packages/core/dist/woff2-worker-source.js", import.meta.url),
      ),
    },
  },
  test: {
    coverage: { reporter: ["text", "lcov"] },
    include: ["packages/*/test/**/*.test.ts"],
  },
});
