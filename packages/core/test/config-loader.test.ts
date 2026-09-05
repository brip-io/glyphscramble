import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverGlyphConfigPath,
  loadGlyphConfig,
} from "../src/config-loader.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("config loader", () => {
  it("discovers JavaScript configs created for JavaScript-native projects", async () => {
    const root = await mkdtemp(join(tmpdir(), "glyphscramble-config-"));
    roots.push(root);
    const path = join(root, "glyphscramble.config.mjs");
    await writeFile(path, "export default {};\n");

    expect(discoverGlyphConfigPath(root)).toBe(path);
  });

  it("rejects ambiguous implicit config discovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "glyphscramble-config-"));
    roots.push(root);
    await Promise.all([
      writeFile(join(root, "glyphscramble.config.ts"), "export default {};\n"),
      writeFile(join(root, "glyphscramble.config.mjs"), "export default {};\n"),
    ]);

    expect(() => discoverGlyphConfigPath(root)).toThrow(
      /Multiple GlyphScramble configs/,
    );
  });

  it("loads TypeScript syntax without relying on host Node type stripping", async () => {
    const root = await mkdtemp(join(tmpdir(), "glyphscramble-config-"));
    roots.push(root);
    const path = join(root, "glyphscramble.config.ts");
    await writeFile(
      path,
      `const acknowledged: true = true;
export default {
  fonts: { body: { source: { kind: "file", path: "./body.ttf" }, license: { spdx: "OFL-1.1", file: "./OFL.txt" } } },
  rotation: { scope: "response", secretEnv: "GLYPHSCRAMBLE_SECRET", tokenTtlSeconds: 600 },
  routePrefix: "/_glyphscramble",
  unsupported: "error",
  accessibilityRiskAcknowledged: acknowledged,
};
`,
    );

    await expect(loadGlyphConfig(path)).resolves.toMatchObject({
      accessibilityRiskAcknowledged: true,
      routePrefix: "/_glyphscramble",
    });
  });

  it("rejects a config with no default export", async () => {
    const root = await mkdtemp(join(tmpdir(), "glyphscramble-config-"));
    roots.push(root);
    const path = join(root, "glyphscramble.config.ts");
    await writeFile(path, "export const config: unknown = {};\n");
    await expect(loadGlyphConfig(path)).rejects.toThrow(/default export/);
  });
});
