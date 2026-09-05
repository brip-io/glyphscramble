import { fileURLToPath, URL } from "node:url";
import { writeFile } from "node:fs/promises";

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

await writeFile(
  fileURLToPath(new URL("../dist/woff2-worker.d.ts", import.meta.url)),
  "export {};\n",
);
