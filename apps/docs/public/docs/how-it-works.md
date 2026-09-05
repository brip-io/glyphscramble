# How it works

Follow encoded text and its matching font from the server boundary to browser rendering.

Source: https://glyphscramble.brip.io/docs/how-it-works/

GlyphScramble changes the Unicode values a parser receives while preserving what a browser paints. It coordinates two artifacts: encoded text and a font whose `cmap` maps those encoded values back to the intended glyphs.

## Per-response sequence

1. A process-level engine loads prepared, licensed font faces and keeps a bounded pool of one-use variants.
2. `beginResponse()` creates a request-local context and authorization scope.
3. `scrambleAsync()` selects a fresh variant and encodes only the protected text.
4. The application serializes a data-only `GlyphPayload`, never the plaintext.
5. The font URL carries an encrypted, expiring token bound to the authorized face.
6. The browser runtime registers the exact WOFF2 face, waits for `document.fonts`, then reveals the block.

The containing HTML, RSC, or JSON response becomes `private, no-store` only after a protected payload is used. The font response is private and immutable for the token's remaining lifetime.

## Static sequence

1. A build reads a clean, non-hydrated HTML tree.
2. It validates every marked block before changing output.
3. One seeded mapping encodes the build and patches matching fonts.
4. Content-addressed HTML references, CSS, JavaScript, fonts, notices, and a manifest are staged together.
5. The destination is replaced atomically only after independent verification succeeds.

The mapping is reused until the next build. Static mode is per-build rotation, never per-response rotation.

## Why the page still looks right

The patcher preserves outlines, variation, color, GSUB, and GPOS data while changing Unicode-to-glyph lookup tables and required checksums. Unicode-safe groups preserve properties browsers use for segmentation, direction, and shaping. Structural controls such as newlines, bidi controls, ZWJ, variation selectors, and default ignorables remain unchanged.

If a source scalar has no safe covered mapping, protection fails before plaintext is emitted.

## What this does not prevent

A headless browser can load the font and read rendered output. OCR can inspect pixels. A font analyzer can recover mappings or match outlines. Plaintext feeds, metadata, APIs, source maps, client bundles, and hidden DOM remain direct side channels.

The approved claim is precise: GlyphScramble raises the cost of bulk DOM scraping. It is not DRM and does not make public content confidential.
