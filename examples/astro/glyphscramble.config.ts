import { defineGlyphConfig } from "@brip/glyphscramble";

export default defineGlyphConfig({
  fonts: {
    body: {
      source: {
        kind: "file",
        path: "./node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
      },
      license: {
        spdx: "OFL-1.1",
        file: "./node_modules/@fontsource-variable/inter/LICENSE",
      },
    },
  },
  runtime: {
    poolLowWatermark: 6,
    poolHighWatermark: 8,
    generationConcurrency: 4,
  },
  static: { publicBasePath: "/astro-static" },
  accessibilityRiskAcknowledged: true,
});
