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
  // Short only so the browser fixture can prove expiry-driven RSC refresh
  // while leaving enough time for a production build's streamed font fetch.
  rotation: { tokenTtlSeconds: 8 },
  // The fixture intentionally bursts raw HTML, RSC, navigation, and reloads.
  runtime: {
    poolLowWatermark: 8,
    poolHighWatermark: 12,
    generationConcurrency: 4,
  },
  accessibilityRiskAcknowledged: true,
});
