import {
  getRequestURL,
  setResponseHeader,
  toWebRequest,
  type H3Event,
} from "h3";
import { glyphs, glyphscrambleRuntimeOptions } from "./engine.js";

interface GlyphNitroHookMap {
  request: (event: H3Event) => void | Promise<void>;
  beforeResponse: (
    event: H3Event,
    response: { body?: unknown },
  ) => void | Promise<void>;
  close: () => void | Promise<void>;
}

interface GlyphNitroApp {
  hooks: {
    hook<Name extends keyof GlyphNitroHookMap>(
      name: Name,
      handler: GlyphNitroHookMap[Name],
    ): void;
  };
}

function isProtectedRoute(pathname: string): boolean {
  return glyphscrambleRuntimeOptions.protectedRoutes.some(
    (route) =>
      route === "/" || pathname === route || pathname.startsWith(`${route}/`),
  );
}

function markProtected(event: Parameters<typeof toWebRequest>[0]): void {
  setResponseHeader(event, "cache-control", "private, no-store");
  setResponseHeader(event, "x-glyphscramble", "response-rotated");
}

const plugin = (nitroApp: GlyphNitroApp): void => {
  nitroApp.hooks.hook("request", async (event) => {
    const pathname = getRequestURL(event).pathname;
    if (pathname.startsWith(`${glyphscrambleRuntimeOptions.routePrefix}/font/`))
      return;
    event.context.glyphscramble = (await glyphs).beginResponse(
      toWebRequest(event),
    );
    if (isProtectedRoute(pathname)) markProtected(event);
  });

  nitroApp.hooks.hook("beforeResponse", (event) => {
    if (event.context.glyphscramble?.used) markProtected(event);
  });

  nitroApp.hooks.hook("close", async () => (await glyphs).close());
};

export default plugin;
