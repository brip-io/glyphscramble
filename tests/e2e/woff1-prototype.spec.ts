import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { inspectFont } from "../../packages/core/src/font-pipeline.js";
import {
  buildSfnt,
  parseSfnt,
  remapCmap,
} from "../../packages/core/src/sfnt.js";
import { createPermutation } from "../../packages/core/src/unicode.js";
import { buildPrototypeWoff1 } from "../../packages/core/src/woff1-prototype.js";

test("the WOFF 1.0 prototype loads in each qualified browser", async ({
  page,
}) => {
  const require = createRequire(resolve("packages/core/package.json"));
  const source =
    require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
  const prepared = await inspectFont(
    new Uint8Array(await readFile(source)),
    "inter",
  );
  const original = parseSfnt(prepared.sfnt);
  const permutation = createPermutation(
    prepared.metadata.codepoints,
    Buffer.alloc(32, 7).toString("base64url"),
    "woff1-browser-prototype",
  );
  const woff = buildPrototypeWoff1(
    parseSfnt(buildSfnt(remapCmap(original, permutation.decode))),
  );
  const encoded = Buffer.from(woff).toString("base64");
  await page.setContent("<p id=sample>GlyphScramble WOFF prototype</p>");
  const status = await page.evaluate(async (font) => {
    const face = new FontFace(
      "GlyphScramblePrototype",
      `url(data:font/woff;base64,${font}) format("woff")`,
    );
    await face.load();
    document.fonts.add(face);
    document.getElementById("sample")!.style.fontFamily =
      "GlyphScramblePrototype";
    await document.fonts.ready;
    return face.status;
  }, encoded);
  expect(status).toBe("loaded");
});
