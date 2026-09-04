import config, { glyphscrambleRuntimeOptions } from "#glyphscramble/config.mjs";
import { createNuxtGlyphs } from "../index.js";

export const glyphs = createNuxtGlyphs(config, {
  cwd: glyphscrambleRuntimeOptions.cwd,
  ...(glyphscrambleRuntimeOptions.faces === null
    ? {}
    : { faces: glyphscrambleRuntimeOptions.faces }),
  instanceKey: glyphscrambleRuntimeOptions.instanceKey,
});

export { glyphscrambleRuntimeOptions };
