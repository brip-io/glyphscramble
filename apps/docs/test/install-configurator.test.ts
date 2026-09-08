import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { GLYPH_INSTALLATION_PROFILES } from "@brip/glyphscramble";
import {
  FRAMEWORK_OPTIONS,
  initCommand,
  installCommand,
  modeForFramework,
  packagesForSelection,
} from "../src/install-configurator";

const BRAND_ICON_FILES = [
  "astro.svg",
  "bun.svg",
  "nextdotjs.svg",
  "npm.svg",
  "nuxt.svg",
  "pnpm.svg",
  "svelte.svg",
  "vite.svg",
  "yarn.svg",
] as const;

describe("installation configurator", () => {
  it("covers every website framework and allowed delivery mode with a canonical profile", () => {
    for (const framework of FRAMEWORK_OPTIONS) {
      for (const mode of framework.modes) {
        expect(() =>
          packagesForSelection(GLYPH_INSTALLATION_PROFILES, framework.id, mode),
        ).not.toThrow();
      }
    }
  });

  it("moves invalid mode selections to the framework default", () => {
    expect(modeForFramework("next", "static")).toBe("response");
    expect(modeForFramework("vite", "response")).toBe("static");
    expect(modeForFramework("astro", "static")).toBe("static");
  });

  it("generates beta install commands for each package manager", () => {
    const packages = ["@brip/glyphscramble", "@brip/glyphscramble-next"];
    expect(installCommand("npm", packages)).toBe(
      "npm install @brip/glyphscramble@beta @brip/glyphscramble-next@beta",
    );
    expect(installCommand("pnpm", packages)).toBe(
      "pnpm add @brip/glyphscramble@beta @brip/glyphscramble-next@beta",
    );
    expect(installCommand("yarn", packages)).toBe(
      "yarn add @brip/glyphscramble@beta @brip/glyphscramble-next@beta",
    );
    expect(installCommand("bun", packages)).toBe(
      "bun add @brip/glyphscramble@beta @brip/glyphscramble-next@beta",
    );
  });

  it("uses the package manager's executable convention for local init", () => {
    expect(initCommand("npm", "next", "response")).toBe(
      "npm exec glyphscramble -- init --framework next --mode response --package-manager npm --no-install",
    );
    expect(initCommand("pnpm", "astro", "static")).toBe(
      "pnpm exec glyphscramble init --framework astro --mode static --package-manager pnpm --no-install",
    );
    expect(initCommand("yarn", "nuxt", "response")).toBe(
      "yarn exec glyphscramble init --framework nuxt --mode response --package-manager yarn --no-install",
    );
    expect(initCommand("bun", "vite", "static")).toBe(
      "bun run glyphscramble init --framework vite --mode static --package-manager bun --no-install",
    );
  });

  it("uses core only for the Astro static transform", () => {
    expect(
      packagesForSelection(GLYPH_INSTALLATION_PROFILES, "astro", "static"),
    ).toEqual(["@brip/glyphscramble"]);
  });

  it("ships local brand marks without a runtime icon dependency", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies).not.toHaveProperty(
      "@icons-pack/react-simple-icons",
    );
    await Promise.all(
      BRAND_ICON_FILES.map((file) =>
        access(new URL(`../public/brand-icons/${file}`, import.meta.url)),
      ),
    );
  });
});
