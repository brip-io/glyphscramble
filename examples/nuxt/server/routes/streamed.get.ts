import { useGlyphScramble } from "@brip/glyphscramble-nuxt/context";

const STREAMED = "Delayed protected stream content.";

export default defineEventHandler((event) => {
  const glyphs = useGlyphScramble(event);
  setResponseHeader(event, "content-type", "application/json; charset=utf-8");
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const payload = await glyphs.scrambleAsync(STREAMED, {
        font: "body",
        lang: "en",
      });
      controller.enqueue(encoder.encode(JSON.stringify(payload)));
      controller.close();
    },
  });
});
