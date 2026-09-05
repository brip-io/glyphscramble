# Static delivery

Scramble non-hydrated HTML once per atomic build and publish content-addressed assets.

Source: https://glyphscramble.brip.io/docs/delivery/static/

Static mode keeps ordinary CDN delivery by generating one mapping for a complete deployment. It rotates on rebuild, not per response.

## Build into a separate directory

```bash
npx glyphscramble static \
  --input ./dist-plain \
  --output ./dist-protected \
  --config ./glyphscramble.config.ts
```

The input must be clean generator output. The output must be a separate sibling directory. GlyphScramble plans the whole transformation, stages a fresh tree, verifies the published bytes independently, then swaps the destination. A failure leaves the source and prior publication untouched.

Mark a block with the configured static attribute:

```html
<article data-glyphscramble="body">
  This optional high-value excerpt is encoded during the build.
</article>
```

## Supported boundary

The supported boundary is non-hydrated HTML. Protected trees reject scripts, styles, templates, comments, forms, links, interactive controls, text-bearing attributes, and known hydration markers. A protected block inside a hydrated or interactive ancestor also fails.

Do not post-process Next, Nuxt, SvelteKit, Astro island, or other hydrated output unless a framework-aware integration explicitly establishes the boundary. Never protect navigation, controls, or content required for accessibility.

## Deploy one atomic artifact

Publish the complete destination tree together. Generated font, CSS, JavaScript, and manifest names contain byte digests and may use long-lived immutable caching. HTML should revalidate, and the manifest should use `no-cache`. Never mix HTML and assets from different builds.

Run verification before upload:

```bash
npx glyphscramble doctor --static-output ./dist-protected
```

The doctor rejects missing or changed assets, stale references, protected plaintext, and directories containing more than one build manifest.

## Know the downgrade

A raw parser still receives encoded text, but every visitor to one build shares the same mapping. Once recovered, that mapping remains useful until the next deployment. Static mode favors global caching and operational simplicity over response isolation. Document it as per-build scraping friction.
