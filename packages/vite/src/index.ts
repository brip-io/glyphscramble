import { rm } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { Plugin, ResolvedConfig, UserConfig } from "vite";
import {
  buildStaticSite,
  createGlyphEngine,
  type GlyphConfig,
} from "@brip/glyphscramble";

const RAW_OUT_DIR = ".glyphscramble/vite-input";

export interface GlyphViteStaticOptions {
  /** Final protected output, relative to Vite's resolved root by default. */
  outputDir?: string;
  /** Override Vite's root-relative base for static asset URLs. */
  publicBasePath?: string;
  /** Stable seed for deterministic CI only; omit in production. */
  seed?: string;
}

export function glyphscrambleStatic(
  config: GlyphConfig,
  options: GlyphViteStaticOptions = {},
): Plugin {
  let requestedOutputDir = options.outputDir;
  let resolvedConfig: ResolvedConfig | undefined;
  let rawOutputDir: string | undefined;
  let protectedOutputDir: string | undefined;
  let bundleWritten = false;

  return {
    name: "@brip/glyphscramble-vite/static",
    apply: "build",
    enforce: "post",
    config(userConfig: UserConfig) {
      if (userConfig.build?.ssr)
        throw new Error(
          "glyphscrambleStatic() supports client static builds only. Use a Fetch/Node server boundary for Vite SSR.",
        );
      requestedOutputDir ??= userConfig.build?.outDir ?? "dist";
      return {
        build: {
          outDir: RAW_OUT_DIR,
          emptyOutDir: true,
        },
      };
    },
    configResolved(value) {
      if (value.build.ssr)
        throw new Error(
          "glyphscrambleStatic() cannot post-process an SSR bundle. Use createGlyphEngine() at the server boundary.",
        );
      resolvedConfig = value;
      rawOutputDir = resolve(value.root, value.build.outDir);
      const output = requestedOutputDir ?? "dist";
      protectedOutputDir = isAbsolute(output)
        ? resolve(output)
        : resolve(value.root, output);
      if (protectedOutputDir === rawOutputDir)
        throw new Error(
          "GlyphScramble's protected output must differ from its fresh Vite staging directory.",
        );
      if (!options.publicBasePath && !value.base.startsWith("/"))
        throw new Error(
          `Vite base ${JSON.stringify(value.base)} is not root-relative. Set glyphscrambleStatic(config, { publicBasePath: "/your-base" }) explicitly.`,
        );
    },
    writeBundle() {
      bundleWritten = true;
    },
    async closeBundle() {
      if (!bundleWritten) return;
      if (!resolvedConfig || !rawOutputDir || !protectedOutputDir)
        throw new Error(
          "GlyphScramble did not receive Vite's resolved build configuration.",
        );
      const publicBasePath =
        options.publicBasePath ??
        (resolvedConfig.base === "/"
          ? "/"
          : resolvedConfig.base.replace(/\/$/, ""));
      const result = await buildStaticSite(config, {
        cwd: resolvedConfig.root,
        inputDir: rawOutputDir,
        outputDir: protectedOutputDir,
        existingOutput: "replace",
        publicBasePath,
        ...(options.seed ? { seed: options.seed } : {}),
      });
      this.warn(result.warning);
      await rm(rawOutputDir, { recursive: true, force: true });
    },
  };
}

/** Vite SSR still needs a real Fetch/Node server boundary to rotate per response. */
export async function createGlyphFetchHandler(
  config: GlyphConfig,
  options: { cwd?: string } = {},
) {
  const engine = await createGlyphEngine(config, options);
  return {
    engine,
    font: (request: Request) => engine.fontResponse(request),
  } as const;
}
