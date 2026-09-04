import { describe, expect, it } from "vitest";
import {
  matchesProtectedRoute,
  normalizeProtectedRoutes,
} from "../src/routes.js";

describe("SvelteKit early-header routes", () => {
  it("deduplicates, sorts, and matches only exact routes or descendants", () => {
    const routes = normalizeProtectedRoutes([
      "/premium/z",
      "/premium",
      "/premium",
    ]);
    expect(routes).toEqual(["/premium", "/premium/z"]);
    expect(matchesProtectedRoute("/premium", routes)).toBe(true);
    expect(matchesProtectedRoute("/premium/story", routes)).toBe(true);
    expect(matchesProtectedRoute("/premium-plus", routes)).toBe(false);
  });

  it.each([
    "premium",
    "/premium/",
    "/premium?view=full",
    "/premium#excerpt",
    "/premium//excerpt",
    "/premium/../public",
    "/premium/%2e%2e/public",
    "/premium%2fexcerpt",
    "/premium/%",
  ])("rejects the ambiguous route %s", (route) => {
    expect(() => normalizeProtectedRoutes([route as `/${string}`])).toThrow(
      /canonical root-relative path/,
    );
  });
});
