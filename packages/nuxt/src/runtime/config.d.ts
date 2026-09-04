declare module "#glyphscramble/config.mjs" {
  import type { GlyphConfig, GlyphResponseFace } from "@brip/glyphscramble";

  const config: GlyphConfig;
  export default config;
  export const glyphscrambleRuntimeOptions: Readonly<{
    cwd: string;
    faces: readonly GlyphResponseFace[] | null;
    protectedRoutes: readonly string[];
    routePrefix: string;
    instanceKey: string;
  }>;
}
