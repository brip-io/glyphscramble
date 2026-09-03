import { writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

import { build } from "esbuild";

const result = await build({
  entryPoints: [
    fileURLToPath(new URL("../src/woff2-worker.mjs", import.meta.url)),
  ],
  bundle: true,
  minify: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  write: false,
});

const output = result.outputFiles?.[0];
if (!output)
  throw new Error("esbuild did not produce the WOFF2 worker payload.");

await writeFile(
  new URL("../dist/woff2-worker-source.js", import.meta.url),
  `export default ${JSON.stringify(output.text)};\n`,
);
