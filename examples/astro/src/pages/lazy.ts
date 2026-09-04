import type { APIRoute } from "astro";

export const GET: APIRoute = ({ locals }) => {
  const context = locals.glyphscramble;
  if (!context) throw new Error("GlyphScramble middleware is not installed.");
  let rendered = false;
  return new Response(
    new ReadableStream({
      async pull(controller) {
        if (rendered) return;
        rendered = true;
        const payload = await context.scrambleAsync("Lazy Astro stream value", {
          font: "body",
          lang: "en",
        });
        controller.enqueue(new TextEncoder().encode(JSON.stringify(payload)));
        controller.close();
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
};
