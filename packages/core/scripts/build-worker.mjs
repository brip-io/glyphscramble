import { fileURLToPath, URL } from "node:url";

import { build } from "esbuild";

await build({
  entryPoints: [
    fileURLToPath(new URL("../src/woff2-worker.mjs", import.meta.url)),
  ],
  bundle: true,
  minify: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: fileURLToPath(new URL("../dist/woff2-worker.mjs", import.meta.url)),
});
