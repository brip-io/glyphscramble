import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));

await build({
  entryPoints: [`${root}/src/browser.ts`],
  outfile: `${root}/dist/browser.js`,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: false,
  legalComments: "none",
});

const artifactPath = `${root}/dist/browser.js`;
const bytes = await readFile(artifactPath);
const manifest = JSON.parse(await readFile(`${root}/package.json`, "utf8"));
const integrity = `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
await writeFile(
  `${root}/dist/browser.sri.json`,
  `${JSON.stringify(
    {
      package: manifest.name,
      version: manifest.version,
      export: "./runtime",
      path: "dist/browser.js",
      integrity,
    },
    null,
    2,
  )}\n`,
);
