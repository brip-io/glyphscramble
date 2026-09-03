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
});
