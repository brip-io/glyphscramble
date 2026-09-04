import config from "../../../glyphscramble.config";
import { createGlyphHandle } from "@brip/glyphscramble-sveltekit";

export const glyphHandle = await createGlyphHandle(config, {
  streaming: { protectedRoutes: ["/protected", "/streamed"] },
});
