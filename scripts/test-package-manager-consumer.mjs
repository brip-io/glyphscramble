import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL, URL } from "node:url";
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
if (!inventory.installationProfiles)
  throw new Error("Release inventory has no canonical installation profiles.");
const typeScriptCli = resolve(
  import.meta.dirname,
  "../node_modules/typescript/bin/tsc",
);
const yarnCli = resolve(
  import.meta.dirname,
  "../node_modules/@yarnpkg/cli-dist/bin/yarn.js",
);

function consumerSource(profile) {
  switch (profile) {
    case "generic-node":
      return 'import { defineGlyphConfig } from "@brip/glyphscramble";\nimport { GLYPH_BETA_CHANNEL, glyphCliCommand } from "@brip/glyphscramble/package-surface";\nvoid defineGlyphConfig;\nvoid glyphCliCommand("npm", GLYPH_BETA_CHANNEL, ["init"]);\n';
    case "astro-static":
      return 'import { glyphStaticBoundaryAttributes } from "@brip/glyphscramble";\nimport type { GlyphConfig } from "@brip/glyphscramble-astro";\nvoid glyphStaticBoundaryAttributes("body");\nlet config!: GlyphConfig;\nvoid config;\n';
    case "react":
      return 'import { GlyphText, GlyphScramble, type GlyphTextProps, type GlyphScrambleProps } from "@brip/glyphscramble-react";\nimport { GlyphStaticBoundary, type GlyphStaticBoundaryProps } from "@brip/glyphscramble-react/static";\nvoid (GlyphText satisfies unknown);\nvoid (GlyphScramble satisfies typeof GlyphText);\nvoid GlyphStaticBoundary;\nlet props!: GlyphTextProps;\nlet compatibilityProps!: GlyphScrambleProps;\nlet staticProps!: GlyphStaticBoundaryProps;\nvoid props;\nvoid compatibilityProps;\nvoid staticProps;\n';
    case "vue":
      return 'import { GlyphText, GlyphScramble } from "@brip/glyphscramble-vue";\nimport { GlyphStaticBoundary } from "@brip/glyphscramble-vue/static";\nvoid GlyphText;\nvoid (GlyphScramble satisfies typeof GlyphText);\nvoid GlyphStaticBoundary;\n';
    case "svelte":
      return 'import { GlyphText, GlyphScramble, type GlyphStaticBoundaryProps } from "@brip/glyphscramble-svelte";\nvoid GlyphText;\nvoid (GlyphScramble satisfies typeof GlyphText);\nlet staticProps!: GlyphStaticBoundaryProps;\nvoid staticProps;\n';
    case "next":
    case "nuxt":
    case "sveltekit":
      return `import { GlyphText, GlyphScramble, type GlyphPayload } from "@brip/glyphscramble-${profile}";\nvoid GlyphText;\nvoid (GlyphScramble satisfies typeof GlyphText);\nlet payload!: GlyphPayload;\nvoid payload;\n`;
    case "astro":
      return 'import type { GlyphPayload } from "@brip/glyphscramble-astro";\nlet payload!: GlyphPayload;\nvoid payload;\n';
    case "vite":
      return 'import { glyphscrambleStatic } from "@brip/glyphscramble-vite";\nvoid glyphscrambleStatic;\n';
    default:
      throw new Error(`Unknown installation profile ${profile}.`);
  }
}

async function registryPackages() {
  const packages = new Map();
  for (const item of inventory.packages) {
    const archive = join(artifacts, item.file);
    const bytes = await readFile(archive);
    const { stdout } = await execute("tar", [
      "-xOzf",
      archive,
      "package/package.json",
    ]);
    packages.set(item.name, {
      item,
      bytes,
      manifest: JSON.parse(stdout),
      shasum: createHash("sha1").update(bytes).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    });
  }
  return packages;
}

function listen(server) {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
}

function close(server) {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

const packages = await registryPackages();
let registryUrl;
const server = createServer((request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, registryUrl).pathname);
    if (path.startsWith("/tarballs/")) {
      const file = path.slice("/tarballs/".length);
      const entry = [...packages.values()].find(
        ({ item }) => item.file === file,
      );
      if (!entry) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(entry.bytes);
      return;
    }

    const name = path.slice(1);
    const entry = packages.get(name);
    if (!entry) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: `Unknown fixture package ${name}` }),
      );
      return;
    }
    const version = entry.item.version;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        name,
        "dist-tags": { beta: version },
        versions: {
          [version]: {
            ...entry.manifest,
            dist: {
              tarball: `${registryUrl}tarballs/${entry.item.file}`,
              shasum: entry.shasum,
              integrity: entry.integrity,
            },
          },
        },
      }),
    );
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: String(error) }));
  }
});

await listen(server);
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Fixture registry did not bind a TCP port.");
registryUrl = `http://127.0.0.1:${address.port}/`;

const root = await mkdtemp(
  join(tmpdir(), `glyphscramble-${manager}-consumers-`),
);
const installs = {
  npm: [
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--legacy-peer-deps",
      "--no-audit",
      "--no-fund",
    ],
  ],
  pnpm: [
    "pnpm",
    ["install", "--ignore-scripts", "--strict-peer-dependencies=false"],
  ],
  yarn: [process.execPath, [yarnCli, "install", "--mode=skip-build"]],
  bun: ["bun", ["install", "--ignore-scripts"]],
};

const betaAdds = {
  npm: [
    "npm",
    [
      "install",
      "--save-exact",
      "--ignore-scripts",
      "--legacy-peer-deps",
      "--no-audit",
      "--no-fund",
      "@brip/glyphscramble@beta",
    ],
  ],
  pnpm: [
    "pnpm",
    [
      "add",
      "--save-exact",
      "--ignore-scripts",
      "--strict-peer-dependencies=false",
      "@brip/glyphscramble@beta",
    ],
  ],
  yarn: [
    process.execPath,
    [yarnCli, "add", "--exact", "@brip/glyphscramble@beta"],
  ],
  bun: [
    "bun",
    ["add", "--exact", "--ignore-scripts", "@brip/glyphscramble@beta"],
  ],
};

async function writeRegistryConfiguration(consumer) {
  await writeFile(
    join(consumer, ".npmrc"),
    `@brip:registry=${registryUrl}\nauto-install-peers=false\n`,
  );
  if (manager === "yarn")
    await writeFile(
      join(consumer, ".yarnrc.yml"),
      `nodeLinker: node-modules\nenableGlobalCache: false\nenableMirror: false\ncacheFolder: ${JSON.stringify(join(root, ".yarn-cache"))}\nglobalFolder: ${JSON.stringify(join(root, ".yarn-global"))}\nunsafeHttpWhitelist:\n  - 127.0.0.1\nnpmScopes:\n  brip:\n    npmRegistryServer: ${JSON.stringify(registryUrl)}\n`,
    );
}

try {
  for (const [profile, directPackages] of Object.entries(
    inventory.installationProfiles,
  )) {
    const consumer = join(root, profile);
    await mkdir(consumer);
    const dependencies = Object.fromEntries(
      directPackages.map((name) => [name, inventory.version]),
    );
    await writeFile(
      join(consumer, "package.json"),
      `${JSON.stringify(
        {
          name: `glyphscramble-${manager}-${profile}`,
          private: true,
          type: "module",
          ...(manager === "yarn" ? { packageManager: "yarn@4.9.2" } : {}),
          dependencies,
        },
        null,
        2,
      )}\n`,
    );
    await writeRegistryConfiguration(consumer);

    const [command, args] = installs[manager];
    await execute(
      command,
      manager === "bun"
        ? [...args, "--cache-dir", join(root, ".bun-cache")]
        : args,
      {
        cwd: consumer,
        env: {
          ...process.env,
          ...(manager === "yarn"
            ? {
                YARN_ENABLE_GLOBAL_CACHE: "false",
                YARN_ENABLE_IMMUTABLE_INSTALLS: "false",
                YARN_ENABLE_MIRROR: "false",
                YARN_GLOBAL_FOLDER: join(root, ".yarn-global"),
              }
            : {}),
        },
      },
    );

    const installedManifest = JSON.parse(
      await readFile(join(consumer, "package.json"), "utf8"),
    );
    if (
      JSON.stringify(installedManifest.dependencies) !==
      JSON.stringify(dependencies)
    )
      throw new Error(
        `${manager}/${profile} changed its canonical direct dependency set.`,
      );
    for (const name of directPackages) {
      const installed = JSON.parse(
        await readFile(
          join(consumer, "node_modules", name, "package.json"),
          "utf8",
        ),
      );
      if (installed.version !== inventory.version)
        throw new Error(
          `${manager}/${profile} resolved ${name}@${installed.version}, expected ${inventory.version}.`,
        );
    }

    const sourcePath = join(consumer, "consumer.mts");
    await writeFile(sourcePath, consumerSource(profile));
    await execute(
      process.execPath,
      [
        typeScriptCli,
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--target",
        "ES2022",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        sourcePath,
      ],
      { cwd: consumer },
    );

    if (profile === "generic-node") {
      const core = await import(
        `${pathToFileURL(join(consumer, "node_modules/@brip/glyphscramble/dist/index.js")).href}?manager=${manager}`
      );
      if (
        typeof core.defineGlyphConfig !== "function" ||
        JSON.stringify(core.GLYPH_INSTALLATION_PROFILES) !==
          JSON.stringify(inventory.installationProfiles)
      )
        throw new Error(
          `${manager} could not import the canonical core package surface.`,
        );
    }
  }

  const betaConsumer = join(root, "beta-init");
  await mkdir(betaConsumer);
  await writeFile(
    join(betaConsumer, "package.json"),
    `${JSON.stringify(
      {
        name: `glyphscramble-${manager}-beta-init`,
        private: true,
        type: "module",
        ...(manager === "yarn" ? { packageManager: "yarn@4.9.2" } : {}),
      },
      null,
      2,
    )}\n`,
  );
  await writeRegistryConfiguration(betaConsumer);
  const [betaCommand, betaArgs] = betaAdds[manager];
  await execute(
    betaCommand,
    manager === "bun"
      ? [...betaArgs, "--cache-dir", join(root, ".bun-cache")]
      : betaArgs,
    {
      cwd: betaConsumer,
      env: {
        ...process.env,
        ...(manager === "yarn"
          ? {
              YARN_ENABLE_GLOBAL_CACHE: "false",
              YARN_ENABLE_IMMUTABLE_INSTALLS: "false",
              YARN_ENABLE_MIRROR: "false",
              YARN_GLOBAL_FOLDER: join(root, ".yarn-global"),
            }
          : {}),
      },
    },
  );
  const betaManifestPath = join(betaConsumer, "package.json");
  const betaManifest = JSON.parse(await readFile(betaManifestPath, "utf8"));
  if (betaManifest.dependencies?.["@brip/glyphscramble"] !== inventory.version)
    throw new Error(
      `${manager} did not exact-save @brip/glyphscramble@beta as ${inventory.version}.`,
    );
  betaManifest.dependencies.next = "16.3.4";
  await writeFile(
    betaManifestPath,
    `${JSON.stringify(betaManifest, null, 2)}\n`,
  );
  await mkdir(join(betaConsumer, "app"));
  await mkdir(join(betaConsumer, "fonts"));
  await mkdir(join(betaConsumer, "licenses"));
  await writeFile(join(betaConsumer, "fonts/body.woff2"), "font fixture");
  await writeFile(join(betaConsumer, "licenses/OFL.txt"), "license fixture");
  const { stdout: initOutput } = await execute(
    process.execPath,
    [
      join(betaConsumer, "node_modules/@brip/glyphscramble/dist/cli.js"),
      "init",
      "--framework",
      "next",
      "--mode",
      "response",
      "--package-manager",
      manager,
      "--font",
      "./fonts/body.woff2",
      "--license-spdx",
      "OFL-1.1",
      "--license-file",
      "./licenses/OFL.txt",
      "--acknowledge-accessibility-risk",
      "--dry-run",
      "--json",
    ],
    { cwd: betaConsumer },
  );
  const initResult = JSON.parse(initOutput);
  const expectedAdapter = `@brip/glyphscramble-next@${inventory.version}`;
  if (
    JSON.stringify(initResult.dependencySpecifiers) !==
      JSON.stringify([expectedAdapter]) ||
    !initResult.commands[0]?.includes(expectedAdapter) ||
    initResult.commands[0]?.includes("@latest") ||
    initResult.commands[0]?.includes("@beta")
  )
    throw new Error(
      `${manager} initializer did not pin the adapter to the exact beta CLI version: ${JSON.stringify({ dependencySpecifiers: initResult.dependencySpecifiers, command: initResult.commands[0] })}.`,
    );
  process.stdout.write(
    `${manager} installed ${Object.keys(inventory.installationProfiles).length} minimal package profiles and pinned beta init at ${inventory.version}.\n`,
  );
} finally {
  await close(server);
  await rm(root, { recursive: true, force: true });
}
