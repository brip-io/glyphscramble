import config from "../glyphscramble.config";
import { createAstroGlyphMiddleware } from "@brip/glyphscramble-astro";

export const onRequest = await createAstroGlyphMiddleware(config, {
  streaming: { strategy: "buffer", maxBytes: 1024 * 1024 },
});
