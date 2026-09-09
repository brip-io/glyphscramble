# @brip/glyphscramble-react

Payload-only React component and server helper for GlyphScramble by BRIP.

```bash
npm install --save-exact @brip/glyphscramble@beta @brip/glyphscramble-react@beta
```

Render with `GlyphText`; `GlyphScramble` remains a deprecated beta alias.
Plaintext belongs in the server helper, and the renderer accepts only a
`GlyphPayload`—never children or an arbitrary custom component through `as`.
For non-hydrated static React output only, import `GlyphStaticBoundary` from
`@brip/glyphscramble-react/static`, wrap the existing presentational component,
and publish the post-build compiler output. Never hydrate that boundary.
Read the [React integration guide](https://github.com/brip-io/glyphscramble/blob/main/docs/FRAMEWORKS.md#react-and-next-16)
and [responsible-use boundary](https://github.com/brip-io/glyphscramble#good-fit).

GlyphScramble raises the cost of bulk DOM scraping; it is not DRM. Apache-2.0.
