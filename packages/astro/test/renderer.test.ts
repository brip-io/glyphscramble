import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const fixture = join(import.meta.dirname, "fixtures/children");
const astroCli = join(
  import.meta.dirname,
  "../node_modules/astro/bin/astro.mjs",
);

afterEach(async () => {
  await Promise.all([
    rm(join(fixture, ".astro"), { recursive: true, force: true }),
    rm(join(fixture, "dist"), { recursive: true, force: true }),
  ]);
});

describe("GlyphText.astro", () => {
  it("fails the build when a default slot carries plaintext", async () => {
    let output = "";
    try {
      await execute(process.execPath, [astroCli, "build", "--root", fixture], {
        env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
      });
    } catch (error) {
      const result = error as { stdout?: string; stderr?: string };
      output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    }

    expect(output).toMatch(/GlyphText is payload-only.*GlyphStaticBoundary/);
  });
});
