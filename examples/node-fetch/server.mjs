import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import {
  createGlyphEngine,
  responseHeadersForContext,
} from "@brip/glyphscramble";
import config from "./glyphscramble.config.mjs";

const cwd = dirname(fileURLToPath(import.meta.url));
const engine = await createGlyphEngine(config, { cwd });
const runtime = await readFile(
  join(cwd, "../../packages/core/dist/browser.js"),
);
const client = await readFile(join(cwd, "client.js"));
let abortedRequests = 0;

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

async function writeResponse(response, outgoing) {
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) outgoing.setHeader(name, value);
  if (!response.body) return outgoing.end();
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://${incoming.headers.host ?? "127.0.0.1:3211"}`;
    const abort = new globalThis.AbortController();
    incoming.once("aborted", () => abort.abort());
    outgoing.once("close", () => {
      if (!outgoing.writableFinished) abort.abort();
    });
    const request = new globalThis.Request(
      new URL(incoming.url ?? "/", origin),
      {
        method: incoming.method,
        headers: incoming.headers,
        signal: abort.signal,
      },
    );
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith(`${config.routePrefix}/font/`))
      return await writeResponse(await engine.fontResponse(request), outgoing);
    if (pathname === "/glyph-runtime.js")
      return await writeResponse(
        new globalThis.Response(runtime, {
          headers: { "content-type": "text/javascript" },
        }),
        outgoing,
      );
    if (pathname === "/client.js")
      return await writeResponse(
        new globalThis.Response(client, {
          headers: { "content-type": "text/javascript" },
        }),
        outgoing,
      );
    if (pathname === "/plain")
      return await writeResponse(
        new globalThis.Response("Ordinary cacheable Node content.", {
          headers: { "cache-control": "public, max-age=3600" },
        }),
        outgoing,
      );
    if (pathname === "/abort-count")
      return await writeResponse(
        new globalThis.Response(String(abortedRequests), {
          headers: { "cache-control": "private, no-store" },
        }),
        outgoing,
      );
    if (pathname === "/wait-for-abort") {
      await new Promise((resolve) => {
        const timeout = globalThis.setTimeout(resolve, 5_000);
        request.signal.addEventListener(
          "abort",
          () => {
            globalThis.clearTimeout(timeout);
            abortedRequests += 1;
            resolve();
          },
          { once: true },
        );
      });
      if (request.signal.aborted) return;
      return await writeResponse(
        new globalThis.Response("Abort was not propagated.", { status: 504 }),
        outgoing,
      );
    }
    if (pathname !== "/")
      return await writeResponse(
        new globalThis.Response("Not found", { status: 404 }),
        outgoing,
      );

    // Render fully before committing headers. A genuinely streamed route must
    // opt in up front and set protected headers before its first body byte.
    const context = engine.beginResponse({ signal: request.signal });
    const payload = await context.scrambleAsync("Node Fetch protected value", {
      font: "body",
      lang: "en",
    });
    const serialized = escapeAttribute(JSON.stringify(payload));
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Node Fetch GlyphScramble</title><script type="module" src="/client.js"></script></head><body><h1>Indexable Node heading</h1><span hidden aria-hidden="true" data-glyphscramble-node data-payload="${serialized}">${payload.encodedText}</span></body></html>`;
    return await writeResponse(
      new globalThis.Response(html, {
        headers: responseHeadersForContext(context, {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy":
            "default-src 'self'; font-src 'self'; script-src 'self'; style-src-attr 'unsafe-inline'",
        }),
      }),
      outgoing,
    );
  } catch {
    if (!outgoing.headersSent)
      outgoing.writeHead(500, { "cache-control": "private, no-store" });
    outgoing.end("Protected content unavailable.");
  }
});

server.listen(Number(process.env.PORT ?? 3211), "127.0.0.1");

async function shutdown() {
  await engine.drain();
  await new Promise((resolve) => server.close(resolve));
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
