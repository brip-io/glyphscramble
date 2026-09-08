import { describe, expect, test } from "vitest";
import fixtures from "../src/generated/demo-fixtures.json";
import ogSource from "../src/generated/og-source.json";

/* `public/og.png` is a committed image, rendered by
 * scripts/generate-brand-assets.mjs and not by the build — it needs a
 * browser, and the deploy is a plain static export. That makes it the one
 * artifact here that can fall out of step with the site silently, and it
 * already did once: the previous card was drawn by hand and showed two
 * strings of invented glyphs, so the picture most people saw before reaching
 * the site demonstrated nothing the product does.
 *
 * The generator records what it drew. This asserts the recording still
 * matches the fixtures the page itself renders from, so regenerating the
 * demo without regenerating the card fails here rather than in a feed.
 */
describe("share card", () => {
  test("is drawn from the current demo fixtures", () => {
    expect(ogSource.encodedText).toBe(fixtures.runtime.a.encodedText);
    expect(ogSource.family).toBe(fixtures.runtime.a.family);
    /* Never typed on the card — it is what the right pane's font renders the
       encoded text as. A fixture regenerated against a new sentence has
       changed the card whether or not the encoded string moved with it. */
    expect(ogSource.sentence).toBe(fixtures.sentence);
  });

  test("shows the encoded text, never the plaintext", () => {
    /* Both panes carry these bytes and only the font differs. A card that
       typed out the sentence would be a card that had decoded it. */
    expect(ogSource.encodedText).not.toBe(ogSource.sentence);
  });
});
