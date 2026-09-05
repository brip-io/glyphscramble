import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const packageDirectories = [
  "core",
  "react",
  "next",
  "vue",
  "nuxt",
  "svelte",
  "sveltekit",
  "astro",
  "vite",
];
const outputArgument = process.argv.indexOf("--output");
const requestedOutput =
  outputArgument >= 0 ? process.argv[outputArgument + 1] : undefined;
if (outputArgument >= 0 && !requestedOutput)
  throw new Error("--output requires a directory.");
const temporary = requestedOutput
  ? undefined
  : await mkdtemp(join(tmpdir(), "glyphscramble-release-"));
const output = resolve(requestedOutput ?? temporary);

async function ensureEmptyOutput() {
  await mkdir(output, { recursive: true });
  const entries = await readdir(output);
  if (entries.length > 0)
    throw new Error(
      `Release artifact directory must be empty: ${output}. Refusing to delete existing files.`,
    );
}

function requiredMetadata(manifest, directory) {
  const failures = [];
  for (const field of [
    "description",
    "keywords",
    "author",
    "homepage",
    "bugs",
    "repository",
    "license",
    "type",
    "exports",
    "files",
    "sideEffects",
    "engines",
    "publishConfig",
  ])
    if (manifest[field] === undefined) failures.push(field);
  if (failures.length)
    throw new Error(
      `${manifest.name} is missing metadata: ${failures.join(", ")}.`,
    );
  if (manifest.private)
    throw new Error(`${manifest.name} is unexpectedly private.`);
  if (
    manifest.repository?.url !==
    "git+https://github.com/brip-io/glyphscramble.git"
  )
    throw new Error(`${manifest.name} has a non-canonical repository URL.`);
  if (manifest.repository?.directory !== `packages/${directory}`)
    throw new Error(`${manifest.name} has the wrong repository directory.`);
  if (manifest.engines?.node !== ">=22")
    throw new Error(`${manifest.name} must enforce the Node >=22 floor.`);
  if (manifest.publishConfig?.access !== "public")
    throw new Error(`${manifest.name} must publish publicly.`);
  if (!manifest.files.includes("README.md"))
    throw new Error(`${manifest.name} does not publish its package README.`);
}

async function archiveEntries(archive) {
  const { stdout } = await execute("tar", ["-tzf", archive]);
  return stdout.trim().split("\n").filter(Boolean);
}

async function packedManifest(archive) {
  const { stdout } = await execute("tar", [
    "-xOzf",
    archive,
    "package/package.json",
  ]);
  return JSON.parse(stdout);
}

function exportedPaths(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(exportedPaths);
}

function validateEntries(manifest, entries) {
  const name = manifest.name;
  const forbidden = entries.filter(
    (entry) =>
      entry.endsWith(".map") ||
      /\/(?:test|tests|fixtures)(?:\/|$)/u.test(entry) ||
      /\/(?:\.env(?:\.|$)|\.npmrc$)/u.test(entry),
  );
  if (forbidden.length)
    throw new Error(
      `${name} contains forbidden files: ${forbidden.join(", ")}.`,
    );
  if (!entries.includes("package/package.json"))
    throw new Error(`${name} has no packed package.json.`);
  if (!entries.includes("package/README.md"))
    throw new Error(`${name} has no packed README.md.`);
  if (!entries.includes("package/LICENSE"))
    throw new Error(`${name} has no packed Apache-2.0 licence text.`);
  const automatic = new Set(["package.json", "README.md", "LICENSE"]);
  const outsideAllowlist = entries
    .map((entry) => entry.replace(/^package\//u, "").replace(/\/$/u, ""))
    .filter(Boolean)
    .filter(
      (entry) =>
        !automatic.has(entry) &&
        !manifest.files.some(
          (allowed) => entry === allowed || entry.startsWith(`${allowed}/`),
        ),
    );
  if (outsideAllowlist.length)
    throw new Error(
      `${name} packed files outside its files allowlist: ${outsideAllowlist.join(", ")}.`,
    );
  for (const path of exportedPaths(manifest.exports)) {
    if (!path.startsWith("./") || path.includes("*")) continue;
    const entry = `package/${path.slice(2)}`;
    if (!entries.includes(entry))
      throw new Error(`${name} export ${path} is absent from its tarball.`);
  }
}

function validatePackedManifest(manifest) {
  const serialized = JSON.stringify(manifest);
  if (serialized.includes("workspace:"))
    throw new Error(`${manifest.name} retained a workspace: dependency.`);
  for (const [command, path] of Object.entries(manifest.bin ?? {})) {
    if (command !== "glyphscramble" || path !== "./dist/cli.js")
      throw new Error(`${manifest.name} contains an undeclared executable.`);
  }
  if (manifest.dependencies?.["@unicode/unicode-17.0.0"])
    throw new Error(
      `${manifest.name} ships generation-only Unicode data to consumers.`,
    );
}

async function validateChangesetIgnores() {
  const workspace = new Map();
  for (const parent of ["apps", "examples", "packages"]) {
    for (const entry of await readdir(join(root, parent), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const path = join(root, parent, entry.name, "package.json");
      try {
        const manifest = JSON.parse(await readFile(path, "utf8"));
        workspace.set(manifest.name, manifest);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  const config = JSON.parse(
    await readFile(join(root, ".changeset", "config.json"), "utf8"),
  );
  for (const name of config.ignore ?? []) {
    const manifest = workspace.get(name);
    if (!manifest)
      throw new Error(`Changesets ignores orphaned workspace package ${name}.`);
    if (!manifest.private)
      throw new Error(
        `Changesets ignores publishable workspace package ${name}.`,
      );
  }
}

await validateChangesetIgnores();
await ensureEmptyOutput();
try {
  const inventory = [];
  for (const directory of packageDirectories) {
    const packageRoot = join(root, "packages", directory);
    const manifest = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    );
    requiredMetadata(manifest, directory);
    await access(join(packageRoot, "README.md"));
    const { stdout } = await execute(
      "pnpm",
      ["pack", "--pack-destination", output],
      { cwd: packageRoot },
    );
    const archive = resolve(
      output,
      basename(stdout.trim().split("\n").at(-1) ?? ""),
    );
    const entries = await archiveEntries(archive);
    validateEntries(manifest, entries);
    const packed = await packedManifest(archive);
    validatePackedManifest(packed);
    if (packed.name !== manifest.name || packed.version !== manifest.version)
      throw new Error(`${manifest.name} changed identity while packing.`);
    const bytes = await readFile(archive);
    inventory.push({
      name: manifest.name,
      version: manifest.version,
      file: basename(archive),
      bytes: (await stat(archive)).size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  const versions = new Set(inventory.map((item) => item.version));
  if (versions.size !== 1)
    throw new Error(
      `One release must use one package version; found ${[...versions].join(", ")}.`,
    );
  const [version] = versions;
  const distTag = version.includes("-") ? "beta" : "latest";
  const checksums = inventory
    .map((item) => `${item.sha256}  ${item.file}`)
    .join("\n");
  await writeFile(join(output, "checksums.txt"), `${checksums}\n`);
  await writeFile(join(output, "dist-tag.txt"), `${distTag}\n`);
  await writeFile(
    join(output, "package-inventory.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        version,
        distTag,
        qualificationManifestSha256: null,
        packages: inventory,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(output, "sbom.spdx.json"),
    `${JSON.stringify(
      {
        spdxVersion: "SPDX-2.3",
        dataLicense: "CC0-1.0",
        SPDXID: "SPDXRef-DOCUMENT",
        name: `GlyphScramble-${version}`,
        documentNamespace: `https://github.com/brip-io/glyphscramble/releases/tag/v${version}/sbom`,
        creationInfo: {
          created: new Date().toISOString(),
          creators: ["Organization: BRIP Engineering"],
        },
        packages: inventory.map((item, index) => ({
          name: item.name,
          SPDXID: `SPDXRef-Package-${index + 1}`,
          versionInfo: item.version,
          downloadLocation: `https://registry.npmjs.org/${item.name}/-/${item.name.split("/").at(-1)}-${item.version}.tgz`,
          filesAnalyzed: false,
          licenseConcluded: "Apache-2.0",
          licenseDeclared: "Apache-2.0",
          externalRefs: [
            {
              referenceCategory: "PACKAGE-MANAGER",
              referenceType: "purl",
              referenceLocator: `pkg:npm/${item.name.replace(/^@/u, "%40")}@${item.version}`,
            },
          ],
        })),
        relationships: inventory.map((_, index) => ({
          spdxElementId: "SPDXRef-DOCUMENT",
          relationshipType: "DESCRIBES",
          relatedSpdxElement: `SPDXRef-Package-${index + 1}`,
        })),
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(
    `Verified and packed ${inventory.length} packages at ${version} for the ${distTag} channel in ${output}.\n`,
  );
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
