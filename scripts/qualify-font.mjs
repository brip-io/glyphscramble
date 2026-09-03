import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";
import { inspectFont } from "../packages/core/dist/font-pipeline.js";
import { buildSfnt, parseSfnt, remapCmap } from "../packages/core/dist/sfnt.js";

const require = createRequire(
  new URL("../packages/core/package.json", import.meta.url),
);
const fixture =
  require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8" });
}

function version(command, args = ["--version"]) {
  const result = run(command, args);
  if (result.error?.code === "ENOENT") return undefined;
  return (result.stdout || result.stderr).trim().split(/\r?\n/, 1)[0];
}

const report = {
  fixture: {
    package: "@fontsource-variable/inter@5.3.0",
    license: "OFL-1.1",
    file: "inter-latin-wght-normal.woff2",
  },
  tools: {},
};
let failed = false;
const temporary = await mkdtemp(join(tmpdir(), "glyphscramble-qualification-"));
try {
  const source = new Uint8Array(await readFile(fixture));
  const inspected = await inspectFont(source, "inter-smoke");
  const original = parseSfnt(inspected.sfnt);
  const patched = remapCmap(
    original,
    new Map([
      [0x41, 0x42],
      [0x42, 0x41],
    ]),
  );
  const originalPath = join(temporary, "original.ttf");
  const patchedPath = join(temporary, "patched.ttf");
  await writeFile(originalPath, inspected.sfnt);
  await writeFile(patchedPath, buildSfnt(patched));

  const harfbuzzVersion = version("hb-shape");
  if (!harfbuzzVersion) report.tools.harfbuzz = { status: "skipped" };
  else {
    const args = ["--no-glyph-names", "--output-format=json"];
    const originalShape = run("hb-shape", [...args, originalPath, "AB"]);
    const patchedShape = run("hb-shape", [...args, patchedPath, "BA"]);
    const passed =
      originalShape.status === 0 &&
      patchedShape.status === 0 &&
      originalShape.stdout === patchedShape.stdout;
    report.tools.harfbuzz = {
      status: passed ? "passed" : "failed",
      version: harfbuzzVersion,
      original: originalShape.stdout.trim(),
      patched: patchedShape.stdout.trim(),
    };
    failed ||= !passed;
  }

  const otsVersion = version("ots-sanitize");
  if (!otsVersion) report.tools.ots = { status: "skipped" };
  else {
    const result = run("ots-sanitize", [
      join(temporary, "sanitized.ttf"),
      patchedPath,
    ]);
    const passed = result.status === 0;
    report.tools.ots = {
      status: passed ? "passed" : "failed",
      version: otsVersion,
      stderr: result.stderr.trim(),
    };
    failed ||= !passed;
  }

  const fontToolsVersion = version("fonttools");
  if (!fontToolsVersion) report.tools.fonttools = { status: "skipped" };
  else {
    const result = run("fonttools", ["ttx", "-l", patchedPath]);
    const passed = result.status === 0;
    report.tools.fonttools = {
      status: passed ? "passed" : "failed",
      version: fontToolsVersion,
      stderr: result.stderr.trim(),
    };
    failed ||= !passed;
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failed) process.exitCode = 1;
