import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GlyphStaticBoundary } from "../src/static.js";

function ResearchCard() {
  return createElement(
    "div",
    { className: "card" },
    createElement("p", null, "Protected research detail"),
    createElement(
      "table",
      null,
      createElement(
        "tbody",
        null,
        createElement(
          "tr",
          null,
          createElement("th", null, "Metric"),
          createElement("td", null, "Seven"),
        ),
      ),
    ),
  );
}

describe("GlyphStaticBoundary", () => {
  it("marks a real nested server-rendered component without changing it", () => {
    const html = renderToStaticMarkup(
      createElement(
        GlyphStaticBoundary,
        { font: "body", as: "article", className: "research" },
        createElement(ResearchCard),
      ),
    );
    expect(html).toContain(
      '<article class="research" data-glyphscramble-font="body" data-glyphscramble-source="static-boundary-v1">',
    );
    expect(html).toContain("<p>Protected research detail</p>");
    expect(html).not.toContain("hidden");
  });

  it("rejects interactive wrappers and invalid font IDs at runtime", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(GlyphStaticBoundary, {
          font: "body",
          as: "button" as "div",
          children: "Secret",
        }),
      ),
    ).toThrow(/non-interactive intrinsic/);
    expect(() =>
      renderToStaticMarkup(
        createElement(GlyphStaticBoundary, {
          font: "body font",
          children: "Secret",
        }),
      ),
    ).toThrow(/font id/);
  });
});
