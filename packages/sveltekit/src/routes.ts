export function normalizeProtectedRoutes(
  routes: readonly `/${string}`[] | undefined,
): readonly string[] {
  const normalized = [...new Set(routes ?? [])].sort();
  for (const route of normalized) {
    const canonical = new URL(route, "https://glyphscramble.invalid").pathname;
    if (
      route !== "/" &&
      (!/^\/[a-z0-9._~%/-]*[a-z0-9._~%-]$/i.test(route) ||
        /%(?:2f|5c)/i.test(route) ||
        /%(?![0-9a-f]{2})/i.test(route) ||
        route.includes("//") ||
        canonical !== route)
    )
      throw new TypeError(
        `GlyphScramble protected route ${JSON.stringify(route)} must be a canonical root-relative path with no trailing slash, query, fragment, repeated slash, dot segment, or encoded separator.`,
      );
  }
  return normalized;
}

export function matchesProtectedRoute(
  pathname: string,
  routes: readonly string[],
): boolean {
  return routes.some(
    (route) =>
      route === "/" || pathname === route || pathname.startsWith(`${route}/`),
  );
}
