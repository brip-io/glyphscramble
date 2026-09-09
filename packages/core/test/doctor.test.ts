import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { doctorProject } from "../src/doctor.js";

const roots: string[] = [];

afterEach(async () => {
  delete process.env.GLYPH_DOCTOR_TEST_SECRET;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "glyphscramble-doctor-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  return root;
}

describe("doctor readiness", () => {
  it("warns about the accessibility and SEO cost of static boundaries", async () => {
    const cwd = await project();
    await writeFile(
      join(cwd, "src/card.tsx"),
      '<GlyphStaticBoundary font="body"><ResearchCard /></GlyphStaticBoundary>',
    );

    const findings = await doctorProject({ cwd });
    expect(findings.map((item) => item.code)).toEqual([
      "STATIC-BOUNDARY-A11Y",
      "STATIC-BOUNDARY-SEO",
      "CONFIG-MISSING",
    ]);
    expect(
      findings.slice(0, 2).every((item) => item.severity === "warning"),
    ).toBe(true);
  });

  it("reports independent source leakage and missing-config repairs", async () => {
    const cwd = await project();
    await writeFile(
      join(cwd, "src/client.tsx"),
      `'use client';\nconst payload = glyphs.scramble(secret);\n`,
    );

    const findings = await doctorProject({ cwd });
    expect(findings.map((item) => item.code)).toEqual([
      "CLIENT-PLAINTEXT",
      "CONFIG-MISSING",
    ]);
    expect(findings.every((item) => item.severity === "error")).toBe(true);
    expect(findings[1]?.message).toContain(
      "npx @brip/glyphscramble@beta init --dry-run",
    );
  });

  it("checks config, secret, prepared licences, adapter range, and sources", async () => {
    const cwd = await project();
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({
        dependencies: {
          next: "^16.3.0",
          "@brip/glyphscramble": "0.1.0-beta.0",
          "@brip/glyphscramble-next": "0.1.0-beta.0",
        },
      }),
    );
    await writeFile(
      join(cwd, "glyphscramble.config.mjs"),
      `export default {
  fonts: { body: { source: { kind: "file", path: "./body.woff2" }, license: { spdx: "OFL-1.1", file: "./OFL.txt" } } },
  rotation: { scope: "response", secretEnv: "GLYPH_DOCTOR_TEST_SECRET", tokenTtlSeconds: 600 },
  routePrefix: "/_glyphscramble",
  unsupported: "error",
  accessibilityRiskAcknowledged: true,
};\n`,
    );
    await mkdir(join(cwd, ".glyphscramble/licenses"), { recursive: true });
    await writeFile(
      join(cwd, ".glyphscramble/glyphscramble.lock.json"),
      JSON.stringify({
        version: 2,
        fonts: {
          body: { license: { noticeFile: "licenses/body.LICENSE.txt" } },
        },
      }),
    );
    await writeFile(
      join(cwd, ".glyphscramble/licenses/body.LICENSE.txt"),
      "fixture notice",
    );
    process.env.GLYPH_DOCTOR_TEST_SECRET = "x".repeat(48);

    const findings = await doctorProject({ cwd });
    expect(findings.map((item) => item.code)).toEqual([
      "CONFIG-READY",
      "SECRET-READY",
      "FONTS-READY",
      "ADAPTER-READY",
      "SOURCE-READY",
    ]);
    expect(findings.every((item) => item.severity === "info")).toBe(true);
  });

  it("reports cross-version packages with an exact repair command", async () => {
    const cwd = await project();
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({
        dependencies: {
          next: "16.3.4",
          "@brip/glyphscramble": "0.1.0-beta.0",
          "@brip/glyphscramble-next": "^0.1.0-beta.0",
        },
      }),
    );
    await writeFile(
      join(cwd, "glyphscramble.config.mjs"),
      "export default {};\n",
    );

    const findings = await doctorProject({ cwd });
    const mismatch = findings.find(
      (item) => item.code === "GLYPH-VERSION-MISMATCH",
    );
    expect(mismatch?.message).toContain(
      "npm install --save-exact @brip/glyphscramble@0.1.0-beta.0 @brip/glyphscramble-next@0.1.0-beta.0",
    );
    expect(mismatch?.message).not.toMatch(/@(?:beta|latest)\b/u);
  });
});
