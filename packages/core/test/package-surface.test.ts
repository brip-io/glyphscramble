import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GLYPH_INSTALLATION_PROFILES,
  GLYPH_PACKAGE_NAMES,
  GLYPH_PUBLIC_PACKAGE_NAMES,
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
      "astro-static": ["@brip/glyphscramble"],
      vite: ["@brip/glyphscramble", "@brip/glyphscramble-vite"],
    });
    expect(glyphPackagesFor("astro", "static")).toEqual([
      "@brip/glyphscramble",
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
});
