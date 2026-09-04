import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initProject } from "../src/init.js";

const roots: string[] = [];

async function project(layout: "root" | "src" | "pages" = "root") {
  const cwd = await mkdtemp(join(tmpdir(), "glyphscramble-init-"));
  roots.push(cwd);
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ dependencies: { next: "16.3.4" } }),
  );
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
  return cwd;
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
      notes: [],
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
    ).toContain('config from "../glyphscramble.config"');
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
    expect(result.notes).toEqual([
      "Left existing src/proxy.ts unchanged; Next's request-time rendering contract means GlyphScramble does not require Proxy.",
    ]);
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
});
