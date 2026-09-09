import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GLYPH_BETA_CHANNEL,
  GLYPH_INSTALLATION_PROFILES,
  GLYPH_PACKAGE_NAMES,
  GLYPH_PUBLIC_PACKAGE_NAMES,
  GLYPH_STABLE_CHANNEL,
  glyphCliCommand,
  glyphExactChannel,
  glyphInstallCommand,
  glyphLocalCliCommand,
  glyphPackageSpecifier,
  glyphPackagesFor,
} from "../src/package-surface.js";

const root = resolve(import.meta.dirname, "../../..");

describe("canonical package surface", () => {
  it("defines the minimal direct package set for every application shape", () => {
    expect(GLYPH_INSTALLATION_PROFILES).toEqual({
      "generic-node": ["@brip/glyphscramble"],
      react: ["@brip/glyphscramble", "@brip/glyphscramble-react"],
      vue: ["@brip/glyphscramble", "@brip/glyphscramble-vue"],
      svelte: ["@brip/glyphscramble", "@brip/glyphscramble-svelte"],
      next: ["@brip/glyphscramble", "@brip/glyphscramble-next"],
      nuxt: ["@brip/glyphscramble", "@brip/glyphscramble-nuxt"],
      sveltekit: ["@brip/glyphscramble", "@brip/glyphscramble-sveltekit"],
      astro: ["@brip/glyphscramble", "@brip/glyphscramble-astro"],
      "astro-static": ["@brip/glyphscramble", "@brip/glyphscramble-astro"],
      vite: ["@brip/glyphscramble", "@brip/glyphscramble-vite"],
    });
    expect(glyphPackagesFor("astro", "static")).toEqual([
      "@brip/glyphscramble",
      "@brip/glyphscramble-astro",
    ]);
    expect(glyphPackagesFor("astro", "response")).toEqual([
      "@brip/glyphscramble",
      "@brip/glyphscramble-astro",
    ]);
    expect(Object.isFrozen(GLYPH_INSTALLATION_PROFILES)).toBe(true);
    for (const names of Object.values(GLYPH_INSTALLATION_PROFILES))
      expect(Object.isFrozen(names)).toBe(true);
  });

  it("keeps every public package in one fixed Changesets group", async () => {
    const config = JSON.parse(
      await readFile(join(root, ".changeset/config.json"), "utf8"),
    ) as { fixed: string[][] };
    expect(config.fixed).toHaveLength(1);
    expect(new Set(config.fixed[0])).toEqual(
      new Set(GLYPH_PUBLIC_PACKAGE_NAMES),
    );
  });

  it("keeps the distribution guide aligned with the typed profiles", async () => {
    const guide = await readFile(join(root, "docs/DISTRIBUTION.md"), "utf8");
    for (const [profile, packages] of Object.entries(
      GLYPH_INSTALLATION_PROFILES,
    )) {
      const row = guide
        .split("\n")
        .find((line) => line.startsWith(`| \`${profile}\``));
      expect(row, `missing distribution row for ${profile}`).toBeDefined();
      expect(row?.match(/`@brip\/glyphscramble[^`]*`/gu) ?? []).toEqual(
        packages.map((name) => `\`${name}\``),
      );
    }
  });

  it("keeps governed beta commands explicit and exact-saving", async () => {
    const files = [
      "README.md",
      "apps/docs/app/docs/page.tsx",
      "apps/docs/components/copy-command.tsx",
      "docs/DISTRIBUTION.md",
      "docs/FRAMEWORKS.md",
      ...Object.keys(GLYPH_PACKAGE_NAMES).map(
        (directory) => `packages/${directory}/README.md`,
      ),
    ];
    const violations: string[] = [];
    const command =
      /(?:npx|bunx|(?:npm|pnpm|yarn|bun)\s+(?:install|add|dlx))\b/u;
    const unqualified =
      /@brip\/glyphscramble(?:-(?:react|next|vue|nuxt|svelte|sveltekit|astro|vite))?(?=[\s`\\]|$)/u;
    const packageInstall = /(?:npm\s+install|(?:pnpm|yarn|bun)\s+add)\b/u;

    for (const file of files) {
      const source = await readFile(join(root, file), "utf8");
      for (const [index, line] of source.split("\n").entries()) {
        if (command.test(line) && unqualified.test(line))
          violations.push(`${file}:${index + 1}: unqualified package`);
        if (
          packageInstall.test(line) &&
          line.includes("@brip/glyphscramble") &&
          !/(?:--save-exact|--exact)\b/u.test(line)
        )
          violations.push(`${file}:${index + 1}: floating install`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("packs every internal runtime dependency at the exact release version", async () => {
    for (const [directory, name] of Object.entries(GLYPH_PACKAGE_NAMES)) {
      const packageDirectory = directory === "core" ? "core" : directory;
      const manifest = JSON.parse(
        await readFile(
          join(root, "packages", packageDirectory, "package.json"),
          "utf8",
        ),
      ) as {
        name: string;
        dependencies?: Record<string, string>;
      };
      expect(manifest.name).toBe(name);
      for (const [dependency, range] of Object.entries(
        manifest.dependencies ?? {},
      ))
        if (
          GLYPH_PUBLIC_PACKAGE_NAMES.includes(
            dependency as (typeof GLYPH_PUBLIC_PACKAGE_NAMES)[number],
          )
        )
          expect(range).toBe("workspace:*");
    }
  });

  it("renders beta, exact, and stable package specifiers explicitly", () => {
    const exact = glyphExactChannel("0.1.0-beta.7");
    expect(
      [GLYPH_BETA_CHANNEL, exact, GLYPH_STABLE_CHANNEL].map((channel) =>
        glyphPackageSpecifier(GLYPH_PACKAGE_NAMES.core, channel),
      ),
    ).toEqual([
      "@brip/glyphscramble@beta",
      "@brip/glyphscramble@0.1.0-beta.7",
      "@brip/glyphscramble",
    ]);
    expect(() => glyphExactChannel("beta")).toThrow(/exact package version/i);
    expect(() =>
      glyphPackageSpecifier(GLYPH_PACKAGE_NAMES.core, {
        kind: "exact",
        version: "latest",
      }),
    ).toThrow(/exact package version/i);
  });

  it.each([
    [
      "npm",
      "npm install --save-exact @brip/glyphscramble@beta @brip/glyphscramble-next@beta",
      "npx @brip/glyphscramble@beta init",
      "npm exec glyphscramble -- doctor",
    ],
    [
      "pnpm",
      "pnpm add --save-exact @brip/glyphscramble@beta @brip/glyphscramble-next@beta",
      "pnpm dlx @brip/glyphscramble@beta init",
      "pnpm exec glyphscramble doctor",
    ],
    [
      "yarn",
      "yarn add --exact @brip/glyphscramble@beta @brip/glyphscramble-next@beta",
      "yarn dlx @brip/glyphscramble@beta init",
      "yarn exec glyphscramble doctor",
    ],
    [
      "bun",
      "bun add --exact @brip/glyphscramble@beta @brip/glyphscramble-next@beta",
      "bunx @brip/glyphscramble@beta init",
      "bun run glyphscramble doctor",
    ],
  ] as const)(
    "generates channel-safe %s commands",
    (manager, install, discovery, local) => {
      expect(
        glyphInstallCommand(
          manager,
          GLYPH_INSTALLATION_PROFILES.next,
          GLYPH_BETA_CHANNEL,
        ),
      ).toBe(install);
      expect(glyphCliCommand(manager, GLYPH_BETA_CHANNEL, ["init"])).toBe(
        discovery,
      );
      expect(glyphLocalCliCommand(manager, ["doctor"])).toBe(local);
    },
  );

  it("covers every package manager, channel, and installation profile", () => {
    const managers = ["npm", "pnpm", "yarn", "bun"] as const;
    const channels = [
      GLYPH_BETA_CHANNEL,
      glyphExactChannel("0.1.0-beta.7"),
      GLYPH_STABLE_CHANNEL,
    ] as const;

    for (const manager of managers) {
      for (const channel of channels) {
        for (const packages of Object.values(GLYPH_INSTALLATION_PROFILES)) {
          const install = glyphInstallCommand(manager, packages, channel);
          for (const name of packages)
            expect(install).toContain(glyphPackageSpecifier(name, channel));
          expect(install).toMatch(/--(?:save-)?exact\b/u);
        }
        const discovery = glyphCliCommand(manager, channel, ["init"]);
        expect(discovery).toContain(
          glyphPackageSpecifier(GLYPH_PACKAGE_NAMES.core, channel),
        );
      }
    }
  });
});
