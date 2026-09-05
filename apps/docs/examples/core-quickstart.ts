import { defineGlyphConfig } from "@brip/glyphscramble";

export default defineGlyphConfig({
  fonts: {
    body: {
      source: { kind: "file", path: "./fonts/SourceSans3-Regular.woff2" },
      license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
    },
  },
  accessibilityRiskAcknowledged: true,
});
