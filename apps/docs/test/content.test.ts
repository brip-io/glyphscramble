import { describe, expect, it } from "vitest";
import {
  getAdjacentDocs,
  getAllDocs,
  getDoc,
  getDocGroups,
  headingId,
} from "../src/docs/content";

describe("documentation registry", () => {
  it("loads the complete ordered corpus", () => {
    const pages = getAllDocs();
    expect(pages).toHaveLength(26);
    expect(pages[0]?.slug).toBe("get-started");
    expect(pages.at(-1)?.slug).toBe("release-notes");
    expect(new Set(pages.map((page) => page.slug)).size).toBe(26);
  });

  it("groups every page exactly once", () => {
    const grouped = getDocGroups().flatMap((group) => group.pages);
    expect(grouped.map((page) => page.slug)).toEqual(
      getAllDocs().map((page) => page.slug),
    );
  });

  it("resolves pages and ordered neighbors", () => {
    expect(getDoc("frameworks/react")?.title).toBe("React");
    expect(getAdjacentDocs("frameworks/react").previous?.slug).toBe(
      "frameworks/fetch-node",
    );
    expect(getAdjacentDocs("frameworks/react").next?.slug).toBe(
      "frameworks/next",
    );
  });

  it("uses the same heading identifiers as the rendered pages", () => {
    expect(headingId("CSP, CORS & nonces")).toBe("csp-cors-nonces");
    expect(headingId("`GlyphPayload` wire shape")).toBe(
      "glyphpayload-wire-shape",
    );
  });
});
