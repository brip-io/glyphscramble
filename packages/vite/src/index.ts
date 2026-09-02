import {
  buildStaticSite,
  createGlyphEngine,
  type GlyphConfig,
} from "@brip/glyphscramble";

export interface GlyphVitePlugin {
  name: string;
  apply: "build";
  closeBundle(this: { warn(message: string): void }): Promise<void>;
}

export function glyphscrambleStatic(
  config: GlyphConfig,
  options: { inputDir?: string; outputDir?: string; seed?: string } = {},
): GlyphVitePlugin {
  return {
    name: "@brip/glyphscramble-vite/static",
    apply: "build",
    async closeBundle() {
      const result = await buildStaticSite(config, {
        inputDir: options.inputDir ?? "dist-unprotected",
        outputDir: options.outputDir ?? "dist",
        ...(options.seed ? { seed: options.seed } : {}),
      });
      this.warn(result.warning);
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
