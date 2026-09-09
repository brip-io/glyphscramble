import type { ResponseContext } from "./types.js";

/** Headers for any HTML, RSC, or JSON response containing protected output. */
export function protectedResponseHeaders(headers: HeadersInit = {}): Headers {
  const result = new Headers(headers);
  result.set("cache-control", "private, no-store");
  result.set("x-glyphscramble", "response-rotated");
  return result;
}

/** Preserve the original cache policy unless this context emitted protection. */
export function responseHeadersForContext(
  context: ResponseContext,
  headers: HeadersInit = {},
): Headers {
  return context.used
    ? protectedResponseHeaders(headers)
    : new Headers(headers);
}
