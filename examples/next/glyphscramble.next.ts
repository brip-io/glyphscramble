import config from "./glyphscramble.config";
import { createNextGlyphs } from "@brip/glyphscramble-next/server";

export const glyphs = await createNextGlyphs(config);
