import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectPackageManager,
  initProject as runInitProject,
  type InitProjectOptions,
} from "../src/init.js";

const roots: string[] = [];

async function project(layout: "root" | "src" | "pages" = "root") {
  const cwd = await mkdtemp(join(tmpdir(), "glyphscramble-init-"));
  roots.push(cwd);
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ dependencies: { next: "16.3.4" } }),
  );
  await writeFile(join(cwd, "tsconfig.json"), "{}\n");
  await mkdir(join(cwd, "fonts"));
  await mkdir(join(cwd, "licenses"));
  await writeFile(join(cwd, "fonts/body.woff2"), "font fixture");
  await writeFile(join(cwd, "licenses/OFL.txt"), "license fixture");
  const directory =
    layout === "src"
      ? join(cwd, "src", "app")
      : layout === "pages"
        ? join(cwd, "pages")
        : join(cwd, "app");
  await mkdir(directory, { recursive: true });
  return cwd;
}

async function frameworkProject(dependencies: Record<string, string>) {
  const cwd = await mkdtemp(join(tmpdir(), "glyphscramble-init-"));
  roots.push(cwd);
  await writeFile(join(cwd, "package.json"), JSON.stringify({ dependencies }));
  await writeFile(join(cwd, "tsconfig.json"), "{}\n");
  await mkdir(join(cwd, "fonts"));
  await mkdir(join(cwd, "licenses"));
  await writeFile(join(cwd, "fonts/body.woff2"), "font fixture");
  await writeFile(join(cwd, "licenses/OFL.txt"), "license fixture");
  return cwd;
}

async function initProject(options: InitProjectOptions = {}) {
  return runInitProject({
    font: "./fonts/body.woff2",
    licenseSpdx: "OFL-1.1",
    licenseFile: "./licenses/OFL.txt",
    acknowledgeAccessibilityRisk: true,
    ...options,
  });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("framework initializer", () => {
  it("creates an idempotent two-file root App Router integration", async () => {
    const cwd = await project();
    const result = await initProject({ cwd });
    expect(result).toMatchObject({
      framework: "next",
      packageName: "@brip/glyphscramble-next",
      created: [
        "glyphscramble.config.ts",
        "glyphscramble.next.ts",
        "app/%5Fglyphscramble/font/[token]/[face]/route.ts",
      ],
      notes: expect.arrayContaining([expect.stringMatching(/openssl rand/)]),
    });
    expect(
      await readFile(join(cwd, "glyphscramble.next.ts"), "utf8"),
    ).toContain('from "@brip/glyphscramble-next/server"');
    const route = await readFile(
      join(cwd, "app/%5Fglyphscramble/font/[token]/[face]/route.ts"),
      "utf8",
    );
    expect(route).toContain("requires Next's default Node runtime");
    expect(route).not.toContain('runtime = "edge"');
    expect(route).toContain('from "../../../../../glyphscramble.next"');
    await expect(initProject({ cwd })).resolves.toMatchObject({
      created: [],
      existing: [
        "glyphscramble.config.ts",
        "glyphscramble.next.ts",
        "app/%5Fglyphscramble/font/[token]/[face]/route.ts",
      ],
    });
  });

  it("places integration files beside a src/app router", async () => {
    const cwd = await project("src");
    const result = await initProject({ cwd, framework: "next" });
    expect(result.created).toEqual([
      "glyphscramble.config.ts",
      "src/glyphscramble.next.ts",
      "src/app/%5Fglyphscramble/font/[token]/[face]/route.ts",
    ]);
    expect(
      await readFile(join(cwd, "src/glyphscramble.next.ts"), "utf8"),
    ).toContain('config from "../glyphscramble.config.ts"');
    expect(
      await readFile(
        join(cwd, "src/app/%5Fglyphscramble/font/[token]/[face]/route.ts"),
        "utf8",
      ),
    ).toContain('from "../../../../../glyphscramble.next"');
  });

  it("leaves an existing Proxy unchanged because request rendering owns caching", async () => {
    const cwd = await project("src");
    const proxyPath = join(cwd, "src/proxy.ts");
    await writeFile(proxyPath, "export function proxy() {}\n");
    const result = await initProject({ cwd });
    expect(result.notes).toEqual(
      expect.arrayContaining([
        "Left existing src/proxy.ts unchanged; Next's request-time rendering contract means GlyphScramble does not require Proxy.",
      ]),
    );
    expect(await readFile(proxyPath, "utf8")).toBe(
      "export function proxy() {}\n",
    );
  });

  it("detects every collision before making partial writes", async () => {
    const cwd = await project();
    const routePath = join(
      cwd,
      "app/%5Fglyphscramble/font/[token]/[face]/route.ts",
    );
    await mkdir(join(routePath, ".."), { recursive: true });
    await writeFile(routePath, "export const GET = customHandler;\n");

    await expect(initProject({ cwd })).rejects.toThrow(
      /will not overwrite.*No files were changed/,
    );
    await expect(
      readFile(join(cwd, "glyphscramble.config.ts")),
    ).rejects.toThrow();
    await expect(
      readFile(join(cwd, "glyphscramble.next.ts")),
    ).rejects.toThrow();
    expect(await readFile(routePath, "utf8")).toBe(
      "export const GET = customHandler;\n",
    );
  });

  it("rejects a Pages Router-only project without writing files", async () => {
    const cwd = await project("pages");
    await expect(initProject({ cwd })).rejects.toThrow(
      /Pages Router is not supported/,
    );
    await expect(
      readFile(join(cwd, "glyphscramble.config.ts")),
    ).rejects.toThrow();
  });

  it("creates typed Astro middleware and locals scaffolding", async () => {
    const cwd = await frameworkProject({ astro: "7.3.1" });
    await mkdir(join(cwd, "src"), { recursive: true });
    const result = await initProject({ cwd });
    expect(result).toMatchObject({
      framework: "astro",
      packageName: "@brip/glyphscramble-astro",
      created: [
        "glyphscramble.config.ts",
        "src/middleware.ts",
        "src/glyphscramble.d.ts",
      ],
      modified: [],
    });
    expect(result.notes.join(" ")).toMatch(/bounded response buffer/);
    expect(
      await readFile(join(cwd, "src/glyphscramble.d.ts"), "utf8"),
    ).toContain('import type { ResponseContext } from "@brip/glyphscramble"');
  });

  it("creates a Nuxt config that installs the package module without boilerplate", async () => {
    const cwd = await frameworkProject({ nuxt: "4.5.2" });
    const result = await initProject({ cwd });
    expect(result).toMatchObject({
      framework: "nuxt",
      packageName: "@brip/glyphscramble-nuxt",
      created: ["glyphscramble.config.ts", "nuxt.config.ts"],
      modified: [],
      notes: expect.arrayContaining([expect.stringMatching(/openssl rand/)]),
    });
    expect(await readFile(join(cwd, "nuxt.config.ts"), "utf8")).toContain(
      'modules: ["@brip/glyphscramble-nuxt/module"]',
    );
    await expect(initProject({ cwd })).resolves.toMatchObject({
      created: [],
      modified: [],
      existing: ["glyphscramble.config.ts", "nuxt.config.ts"],
    });
  });

  it("patches an existing simple Nuxt modules array once", async () => {
    const cwd = await frameworkProject({ nuxt: "4.5.2" });
    const path = join(cwd, "nuxt.config.ts");
    await writeFile(
      path,
      'export default defineNuxtConfig({\n  modules: ["@nuxt/test-utils/module"],\n  devtools: { enabled: false },\n});\n',
    );
    const first = await initProject({ cwd });
    expect(first.modified).toEqual(["nuxt.config.ts"]);
    const patched = await readFile(path, "utf8");
    expect(patched).toContain('"@brip/glyphscramble-nuxt/module"');
    expect(patched).toContain('"@nuxt/test-utils/module"');
    const second = await initProject({ cwd });
    expect(second.modified).toEqual([]);
    expect(second.existing).toContain("nuxt.config.ts");
  });

  it("refuses a dynamic Nuxt config atomically and leaves middleware alone", async () => {
    const cwd = await frameworkProject({ nuxt: "4.5.2" });
    const path = join(cwd, "nuxt.config.ts");
    const middlewarePath = join(cwd, "server", "middleware", "custom.ts");
    const source =
      "export default defineNuxtConfig(() => ({ modules: customModules }))\n";
    await mkdir(join(middlewarePath, ".."), { recursive: true });
    await writeFile(path, source);
    await writeFile(
      middlewarePath,
      "export default defineEventHandler(() => {})\n",
    );
    await expect(initProject({ cwd })).rejects.toThrow(
      /Add.*glyphscramble-nuxt\/module.*No files were changed/,
    );
    expect(await readFile(path, "utf8")).toBe(source);
    expect(await readFile(middlewarePath, "utf8")).toContain(
      "defineEventHandler",
    );
    await expect(
      readFile(join(cwd, "glyphscramble.config.ts"), "utf8"),
    ).rejects.toThrow();
  });

  it("creates a typed three-file SvelteKit integration", async () => {
    const cwd = await frameworkProject({ "@sveltejs/kit": "2.70.3" });
    const result = await initProject({ cwd });
    expect(result).toMatchObject({
      framework: "sveltekit",
      packageName: "@brip/glyphscramble-sveltekit",
      created: [
        "glyphscramble.config.ts",
        "src/lib/server/glyphscramble.ts",
        "src/glyphscramble.d.ts",
        "src/hooks.server.ts",
      ],
      notes: expect.arrayContaining([expect.stringMatching(/openssl rand/)]),
    });
    expect(
      await readFile(join(cwd, "src/lib/server/glyphscramble.ts"), "utf8"),
    ).toContain("await createGlyphHandle(config)");
    expect(
      await readFile(join(cwd, "src/glyphscramble.d.ts"), "utf8"),
    ).toContain("glyphscramble?: ResponseContext");
    await expect(initProject({ cwd })).resolves.toMatchObject({
      created: [],
      existing: [
        "glyphscramble.config.ts",
        "src/lib/server/glyphscramble.ts",
        "src/glyphscramble.d.ts",
        "src/hooks.server.ts",
      ],
    });
  });

  it("preserves an existing SvelteKit hook and gives exact sequence instructions", async () => {
    const cwd = await frameworkProject({ "@sveltejs/kit": "2.70.3" });
    const hookPath = join(cwd, "src", "hooks.server.ts");
    await mkdir(dirname(hookPath), { recursive: true });
    const source =
      "export const handle = async ({ event, resolve }) => resolve(event);\n";
    await writeFile(hookPath, source);
    const result = await initProject({ cwd });
    expect(result.created).toEqual([
      "glyphscramble.config.ts",
      "src/lib/server/glyphscramble.ts",
      "src/glyphscramble.d.ts",
    ]);
    expect(result.notes.join("\n")).toMatch(
      /sequence\(glyphHandle, appHandle\)/,
    );
    expect(await readFile(hookPath, "utf8")).toBe(source);
  });

  it("rejects ambiguous SvelteKit server hook files before writing", async () => {
    const cwd = await frameworkProject({ "@sveltejs/kit": "2.70.3" });
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(join(cwd, "src/hooks.server.ts"), "export {};\n");
    await writeFile(join(cwd, "src/hooks.server.js"), "export {};\n");
    await expect(initProject({ cwd })).rejects.toThrow(
      /Multiple SvelteKit server hook files.*No files were changed/,
    );
    await expect(
      readFile(join(cwd, "glyphscramble.config.ts")),
    ).rejects.toThrow();
  });

  it("creates a registered Vite plugin when no config exists", async () => {
    const cwd = await frameworkProject({ vite: "8.2.2" });
    const result = await initProject({ cwd });
    expect(result).toMatchObject({
      framework: "vite",
      created: ["glyphscramble.config.ts", "vite.config.ts"],
      modified: [],
    });
    const source = await readFile(join(cwd, "vite.config.ts"), "utf8");
    expect(source).toContain("plugins: [glyphscrambleStatic(glyphConfig)]");
    expect(result.notes.join(" ")).toMatch(/per-build protection/);
  });

  it("patches a simple Vite plugins array once", async () => {
    const cwd = await frameworkProject({ vite: "8.2.2" });
    const path = join(cwd, "vite.config.ts");
    await writeFile(
      path,
      'import { defineConfig } from "vite";\nimport example from "./example";\n\nexport default defineConfig({\n  plugins: [example()],\n});\n',
    );
    const first = await initProject({ cwd });
    expect(first.modified).toEqual(["vite.config.ts"]);
    expect(await readFile(path, "utf8")).toContain(
      "plugins: [glyphscrambleStatic(glyphConfig), example()]",
    );
    const second = await initProject({ cwd });
    expect(second.modified).toEqual([]);
    expect(second.existing).toContain("vite.config.ts");
  });

  it("refuses a dynamic Vite config atomically with manual instructions", async () => {
    const cwd = await frameworkProject({ vite: "8.2.2" });
    const path = join(cwd, "vite.config.ts");
    const source =
      'import { defineConfig } from "vite";\nexport default defineConfig(() => ({ plugins: [] }));\n';
    await writeFile(path, source);
    await expect(initProject({ cwd })).rejects.toThrow(
      /Add these imports and plugin entry manually.*No files were changed/s,
    );
    expect(await readFile(path, "utf8")).toBe(source);
    await expect(
      readFile(join(cwd, "glyphscramble.config.ts"), "utf8"),
    ).rejects.toThrow();
  });

  it("requires font, license, and accessibility input for a new config", async () => {
    const cwd = await frameworkProject({ next: "16.3.4" });
    await mkdir(join(cwd, "app"));
    await expect(
      runInitProject({ cwd, framework: "next", mode: "response" }),
    ).rejects.toThrow(
      /--font, --license-spdx, --license-file, --acknowledge-accessibility-risk/,
    );
    await expect(
      readFile(join(cwd, "glyphscramble.config.ts")),
    ).rejects.toThrow();
  });

  it("previews an atomic dry run without touching dependencies or files", async () => {
    const cwd = await project();
    let commands = 0;
    const result = await initProject({
      cwd,
      mode: "response",
      dryRun: true,
      install: true,
      commandRunner: async () => {
        commands++;
      },
    });
    expect(result).toMatchObject({
      dryRun: true,
      created: [],
      modified: [],
      installed: false,
      prepared: false,
      packageManager: "npm",
      dependencies: ["@brip/glyphscramble", "@brip/glyphscramble-next"],
    });
    expect(result.planned.map((change) => change.action)).toEqual([
      "create",
      "create",
      "create",
    ]);
    expect(commands).toBe(0);
    await expect(
      readFile(join(cwd, "glyphscramble.config.ts")),
    ).rejects.toThrow();
  });

  it("installs with the detected package manager before writing files", async () => {
    const cwd = await project();
    await writeFile(join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const seen: Array<{ command: string; args: readonly string[] }> = [];
    const result = await initProject({
      cwd,
      mode: "response",
      install: true,
      commandRunner: async (command) => {
        await expect(
          readFile(join(cwd, "glyphscramble.config.ts")),
        ).rejects.toThrow();
        seen.push(command);
      },
    });
    expect(seen).toEqual([
      {
        command: "pnpm",
        args: ["add", "@brip/glyphscramble", "@brip/glyphscramble-next"],
        cwd,
      },
    ]);
    expect(result).toMatchObject({ packageManager: "pnpm", installed: true });
  });

  it("leaves integration files untouched when dependency installation fails", async () => {
    const cwd = await project();
    await expect(
      initProject({
        cwd,
        mode: "response",
        install: true,
        commandRunner: async () => {
          throw new Error("offline fixture");
        },
      }),
    ).rejects.toThrow(
      /failed before integration files were written.*--no-install/i,
    );
    await expect(
      readFile(join(cwd, "glyphscramble.config.ts")),
    ).rejects.toThrow();
  });

  it("detects a workspace lock and honors an explicit packageManager field", async () => {
    const cwd = await frameworkProject({ vite: "8.2.2" });
    await writeFile(join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    expect(detectPackageManager(cwd, {})).toEqual({
      packageManager: "pnpm",
      workspaceRoot: cwd,
    });
    expect(detectPackageManager(cwd, { packageManager: "yarn@4.9.2" })).toEqual(
      { packageManager: "yarn", workspaceRoot: cwd },
    );
  });

  it("detects a pnpm workspace root even before its first lockfile exists", async () => {
    const workspace = await frameworkProject({});
    await writeFile(
      join(workspace, "pnpm-workspace.yaml"),
      "packages:\n  - apps/*\n",
    );
    const cwd = join(workspace, "apps", "site");
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, "package.json"), JSON.stringify({}));

    expect(detectPackageManager(cwd, {})).toEqual({
      packageManager: "pnpm",
      workspaceRoot: workspace,
    });
  });

  it.each([
    ["npm", "npm exec glyphscramble -- prepare"],
    ["pnpm", "pnpm exec glyphscramble prepare"],
    ["yarn", "yarn exec glyphscramble prepare"],
    ["bun", "bun run glyphscramble prepare"],
  ] as const)(
    "uses the installed local CLI for %s follow-up commands",
    async (packageManager, expected) => {
      const cwd = await frameworkProject({ vite: "8.2.2" });
      const result = await initProject({
        cwd,
        framework: "vite",
        mode: "static",
        packageManager,
      });

      expect(result.commands).toContain(expected);
      expect(result.commands.join(" ")).not.toContain("bunx glyphscramble");
    },
  );

  it("generates JavaScript-native files when TypeScript is absent", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "glyphscramble-init-js-"));
    roots.push(cwd);
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ dependencies: { next: "16.3.4" } }),
    );
    await mkdir(join(cwd, "app"));
    await mkdir(join(cwd, "fonts"));
    await mkdir(join(cwd, "licenses"));
    await writeFile(join(cwd, "fonts/body.woff2"), "font fixture");
    await writeFile(join(cwd, "licenses/OFL.txt"), "license fixture");
    const result = await initProject({ cwd, mode: "response" });
    expect(result).toMatchObject({ typescript: false });
    expect(result.created).toEqual([
      "glyphscramble.config.mjs",
      "glyphscramble.next.mjs",
      "app/%5Fglyphscramble/font/[token]/[face]/route.js",
    ]);
    expect(
      await readFile(join(cwd, "glyphscramble.next.mjs"), "utf8"),
    ).toContain('from "./glyphscramble.config.mjs"');
  });

  it("refuses unsupported delivery-mode downgrades", async () => {
    const next = await project();
    await expect(initProject({ cwd: next, mode: "static" })).rejects.toThrow(
      /never silently downgrades/,
    );
    const vite = await frameworkProject({ vite: "8.2.2" });
    await expect(initProject({ cwd: vite, mode: "response" })).rejects.toThrow(
      /generic Node\/Fetch server boundary/,
    );
  });

  it("keeps Astro static setup to one config and an explicit compiler flow", async () => {
    const cwd = await frameworkProject({ astro: "7.3.1" });
    const result = await initProject({ cwd, mode: "static" });
    expect(result).toMatchObject({
      mode: "static",
      packageName: "@brip/glyphscramble",
      created: ["glyphscramble.config.ts"],
    });
    expect(result.notes.join(" ")).toMatch(/rotates once per build/);
  });
});
