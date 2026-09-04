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
  rotation: { tokenTtlSeconds: 8 },
  runtime: {
    // The fixture deliberately bursts HTML, JSON, navigation, streaming, and
    // concurrent requests before earlier one-use mappings expire.
    poolLowWatermark: 16,
    poolHighWatermark: 20,
    generationConcurrency: 4,
    acquisitionTimeoutMs: 1_000,
  },
  accessibilityRiskAcknowledged: true,
});
