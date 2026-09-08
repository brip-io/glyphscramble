# @brip/glyphscramble

Core engine, CLI, static compiler, and Fetch/Node primitives for GlyphScramble
by BRIP. It raises the cost of bulk DOM scraping; it is not DRM and does not
stop headless browsers, OCR, font analysis, or plaintext side channels.

```bash
npm install --save-exact @brip/glyphscramble@beta
npm exec glyphscramble -- init
```

Use it only for optional, high-value blocks. Protected output is `aria-hidden`
and is not WCAG-conformant. Start with the [mode chooser and responsible-use
guide](https://github.com/brip-io/glyphscramble#good-fit), then see the
[framework matrix](https://github.com/brip-io/glyphscramble/blob/main/docs/FRAMEWORKS.md).

The `./runtime` export is a dependency-free browser loader for an
already-issued `GlyphPayload`; it does not scramble plaintext by itself.
`GLYPH_INSTALLATION_PROFILES` exposes the canonical minimal package set used by
the initializer and release qualification.

Apache-2.0. Font files retain their own licences and notices.
