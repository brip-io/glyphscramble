import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("WOFF2 worker publication", () => {
  it("uses a file-backed package export without eval", async () => {
    const source = await readFile(
      new URL("../src/worker-compressor.ts", import.meta.url),
      "utf8",
    );
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(source).not.toMatch(/\beval\s*:/);
    expect(manifest.exports?.["./woff2-worker"]).toEqual({
      types: "./dist/woff2-worker.d.ts",
      import: "./dist/woff2-worker.mjs",
      default: "./dist/woff2-worker.mjs",
    });
  });
});
