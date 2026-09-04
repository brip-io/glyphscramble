import { describe, expect, it } from "vitest";
import { assertSupportedNitroPreset } from "../src/preset.js";

describe("Nuxt Nitro preset qualification", () => {
  it.each([undefined, "node", "node-server"])(
    "accepts the qualified Node preset %s",
    (preset) => expect(() => assertSupportedNitroPreset(preset)).not.toThrow(),
  );

  it.each(["cloudflare_module", "vercel", "aws-lambda"])(
    "fails closed for the unqualified preset %s",
    (preset) =>
      expect(() => assertSupportedNitroPreset(preset)).toThrow(
        /supports Nitro's node-server preset.*external FontVariantProvider/,
      ),
  );
});
