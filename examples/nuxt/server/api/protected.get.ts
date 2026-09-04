import { useGlyphScramble } from "@brip/glyphscramble-nuxt/context";

const FIRST = "Sensitive analyst note alpha.";
const SECOND = "Sensitive analyst note beta.";

export default defineEventHandler(async (event) => {
  const glyphs = useGlyphScramble(event);
  const [first, second] = await Promise.all([
    glyphs.scrambleAsync(FIRST, { font: "body", lang: "en" }),
    glyphs.scrambleAsync(SECOND, { font: "body", lang: "en" }),
  ]);
  return { first, second };
});
