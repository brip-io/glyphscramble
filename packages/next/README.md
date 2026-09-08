# @brip/glyphscramble-next

Next.js 16 App Router integration for GlyphScramble by BRIP.

```bash
npm install --save-exact @brip/glyphscramble@beta @brip/glyphscramble-next@beta
npm exec glyphscramble -- init
```

The generated Node-runtime route and request-local helper keep plaintext out of
Client Components and apply private caching only after protected output is
used. The adapter exports the React renderer and common payload/config types;
applications do not install `@brip/glyphscramble-react` directly. Read the
[Next.js guide](https://github.com/brip-io/glyphscramble/blob/main/docs/FRAMEWORKS.md#react-and-next-16).

GlyphScramble raises the cost of bulk DOM scraping; it is not DRM. Apache-2.0.
