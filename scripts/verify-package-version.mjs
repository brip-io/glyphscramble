import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const core = join(root, "packages/core");
const temporary = await mkdtemp(join(tmpdir(), "glyphscramble-pack-"));

try {
  const { stdout } = await execute(
    "pnpm",
    ["pack", "--pack-destination", temporary],
    { cwd: core },
  );
  const archiveName = stdout.trim().split("\n").at(-1);
  if (!archiveName) throw new Error("pnpm pack did not report an artifact.");
  const archive = archiveName.startsWith("/")
    ? archiveName
    : join(temporary, archiveName);
  const extracted = join(temporary, "extracted");
  await mkdir(extracted);
  await execute("tar", ["-xzf", archive, "-C", extracted]);

  const packedRoot = join(extracted, "package");
  const manifest = JSON.parse(
    await readFile(join(packedRoot, "package.json"), "utf8"),
  );
  const generated = await import(
    `${pathToFileURL(join(packedRoot, "dist/generated/version.js")).href}?verify=${Date.now()}`
  );
  const browserRuntime = await readFile(
    join(packedRoot, "dist/browser.js"),
    "utf8",
  );
  const browserBytes = await readFile(join(packedRoot, "dist/browser.js"));
  const browserSri = JSON.parse(
    await readFile(join(packedRoot, "dist/browser.sri.json"), "utf8"),
  );
  const { stdout: cliOutput } = await execute(
    process.execPath,
    [join(core, "dist/cli.js"), "--version"],
    { cwd: core },
  );

  if (generated.PACKAGE_VERSION !== manifest.version)
    throw new Error(
      `Packed generated version ${generated.PACKAGE_VERSION} does not match manifest ${manifest.version}.`,
    );
  if (cliOutput.trim() !== manifest.version)
    throw new Error(
      `CLI version ${cliOutput.trim()} does not match manifest ${manifest.version}.`,
    );
  if (/\b(?:import|export)\s[^;]*?\sfrom\s+["']\.\//u.test(browserRuntime))
    throw new Error(
      "Packed browser runtime contains a relative module dependency instead of one self-contained artifact.",
    );
  const expectedIntegrity = `sha384-${createHash("sha384").update(browserBytes).digest("base64")}`;
  if (
    browserSri.package !== manifest.name ||
    browserSri.version !== manifest.version ||
    browserSri.path !== "dist/browser.js" ||
    browserSri.integrity !== expectedIntegrity
  )
    throw new Error(
      "Packed browser SRI manifest does not match the published browser runtime.",
    );
  process.stdout.write(
    `Verified packed GlyphScramble version ${manifest.version}.\n`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
