import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const manager = process.argv[2];
const artifacts = resolve(process.argv[3] ?? "release-artifacts");
if (!["npm", "pnpm", "yarn", "bun"].includes(manager))
  throw new Error(
    "Usage: test-package-manager-consumer.mjs npm|pnpm|yarn|bun [artifacts]",
  );
const inventory = JSON.parse(
  await readFile(join(artifacts, "package-inventory.json"), "utf8"),
);
const root = await mkdtemp(
  join(tmpdir(), `glyphscramble-${manager}-consumer-`),
);

try {
  const dependencies = Object.fromEntries(
    inventory.packages.map((item) => [
      item.name,
      `file:${join(artifacts, item.file)}`,
    ]),
  );
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: `glyphscramble-${manager}-consumer`,
        private: true,
        type: "module",
        ...(manager === "yarn" ? { packageManager: "yarn@4.9.2" } : {}),
        dependencies,
        ...(manager === "yarn" ? { resolutions: dependencies } : {}),
        ...(manager === "bun" ? { overrides: dependencies } : {}),
      },
      null,
      2,
    )}\n`,
  );
  if (manager === "pnpm")
    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      `overrides:\n${Object.entries(dependencies)
        .map(([name, path]) => `  '${name}': '${path}'`)
        .join("\n")}\n`,
    );
  if (manager === "yarn")
    await writeFile(join(root, ".yarnrc.yml"), "nodeLinker: node-modules\n");
  const installs = {
    npm: ["npm", ["install", "--ignore-scripts", "--legacy-peer-deps"]],
    pnpm: [
      "pnpm",
      ["install", "--ignore-scripts", "--strict-peer-dependencies=false"],
    ],
    yarn: ["yarn", ["install", "--mode=skip-build"]],
    bun: ["bun", ["install", "--ignore-scripts"]],
  };
  const [command, args] = installs[manager];
  await execute(command, args, {
    cwd: root,
    env: {
      ...process.env,
      // Yarn defaults to immutable installs in public-PR CI, but this
      // disposable consumer deliberately starts without a lockfile.
      ...(manager === "yarn"
        ? { YARN_ENABLE_IMMUTABLE_INSTALLS: "false" }
        : {}),
    },
  });

  for (const item of inventory.packages) {
    const installed = JSON.parse(
      await readFile(
        join(root, "node_modules", item.name, "package.json"),
        "utf8",
      ),
    );
    if (installed.version !== item.version)
      throw new Error(
        `${manager} resolved ${item.name}@${installed.version}, expected ${item.version}.`,
      );
  }
  const core = await import(
    `${pathToFileURL(join(root, "node_modules/@brip/glyphscramble/dist/index.js")).href}?manager=${manager}`
  );
  if (typeof core.defineGlyphConfig !== "function")
    throw new Error(
      `${manager} consumer could not import the core public entry point.`,
    );
  process.stdout.write(
    `${manager} installed all ${inventory.packages.length} packed packages at ${inventory.version}.\n`,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
