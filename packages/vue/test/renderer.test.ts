import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import type { GlyphPayload } from "@brip/glyphscramble";
import { GlyphText, GlyphScramble } from "../src/index.js";

const payload = {
  version: 3,
  encodedText: "Hqfrghg",
  font: "body",
  face: {
    id: "regular",
    family: "GlyphScramble-body-regular-0123456789abcdef",
    weight: "400",
    style: "normal",
    stretch: "normal",
    unicodeRange: ["U+0020-007E"],
  },
  fontUrl:
    "/_glyphscramble/font/v2.current.0123456789abcdef/body%40regular.woff2",
  expiresAt: 2_000_000_000,
  coverage: "0123456789abcdef".repeat(4),
  lang: "en",
} satisfies GlyphPayload;

describe("GlyphText", () => {
  it("keeps GlyphScramble as the same beta compatibility component", () => {
    expect(GlyphScramble).toBe(GlyphText);
  });

  it("fails closed when a template supplies a default slot", async () => {
    const app = createSSRApp({
      render: () => h(GlyphText, { payload }, { default: () => "plaintext" }),
    });
    app.config.warnHandler = () => {};

    await expect(renderToString(app)).rejects.toThrow(
      /GlyphText is payload-only.*GlyphStaticBoundary/,
    );
  });

  it("rejects opaque component polymorphism at runtime", async () => {
    const CustomComponent = defineComponent(() => () => h("p", "plaintext"));
    const app = createSSRApp({
      render: () =>
        h(GlyphText, {
          payload,
          as: CustomComponent as unknown as "p",
        }),
    });
    app.config.warnHandler = () => {};

    await expect(renderToString(app)).rejects.toThrow(
      /GlyphText `as` must be a supported native text container/,
    );
  });
});
