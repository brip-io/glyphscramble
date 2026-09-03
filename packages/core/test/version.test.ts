import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { PACKAGE_VERSION } from "../src/generated/version.js";

const execute = promisify(execFile);

describe("generated package version", () => {
  it("matches the source package manifest", async () => {
    const manifest = JSON.parse(
      await readFile(
        fileURLToPath(new URL("../package.json", import.meta.url)),
        "utf8",
      ),
    ) as { version: string };
    expect(PACKAGE_VERSION).toBe(manifest.version);
  });

  it("derives a synthetic release version instead of retaining a literal", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "glyph-version-"));
    const packagePath = join(cwd, "package.json");
    const outputPath = join(cwd, "version.ts");
    await writeFile(packagePath, '{"version":"9.8.7-beta.6"}\n');
    await execute(process.execPath, [
      fileURLToPath(
        new URL("../scripts/generate-version.mjs", import.meta.url),
      ),
      "--package",
      packagePath,
      "--output",
      outputPath,
    ]);
    expect(await readFile(outputPath, "utf8")).toContain(
      'PACKAGE_VERSION = "9.8.7-beta.6"',
    );
  });
});
