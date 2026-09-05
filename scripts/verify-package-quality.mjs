import { execFile } from "node:child_process";
import { resolve } from "node:path";
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

async function run(args) {
  try {
    await execute("pnpm", args, { cwd: root });
  } catch (error) {
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw error;
  }
}

for (const directoryName of packageDirectories) {
  const packagePath = `packages/${directoryName}`;
  await run(["exec", "publint", packagePath, "--strict"]);
  const attw = [
    "exec",
    "attw",
    packagePath,
    "--pack",
    "--profile",
    "esm-only",
    "--quiet",
  ];
  // TypeScript's Node resolver does not model framework-source extensions.
  // Their actual bundler entrypoints are compiled by the framework fixtures.
  if (directoryName === "svelte")
    attw.push("--ignore-rules=internal-resolution-error");
  if (directoryName === "astro")
    attw.push("--exclude-entrypoints", "./GlyphScramble.astro");
  await run(attw);
}

process.stdout.write(
  `publint and Are the Types Wrong passed for ${packageDirectories.length} packages.\n`,
);
