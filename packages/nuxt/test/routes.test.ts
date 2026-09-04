import { describe, expect, it } from "vitest";
import { normalizeProtectedRoutes } from "../src/routes.js";

describe("Nuxt early-header route configuration", () => {
  it("deduplicates and sorts canonical root-relative paths", () => {
    expect(normalizeProtectedRoutes(["/premium/z", "/", "/premium/z"])).toEqual(
      ["/", "/premium/z"],
    );
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
