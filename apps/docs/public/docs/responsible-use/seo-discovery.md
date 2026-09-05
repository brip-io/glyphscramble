# SEO and discovery

Preserve indexable page context while accepting that protected words lose search meaning.

Source: https://glyphscramble.brip.io/docs/responsible-use/seo-discovery/

Search crawlers receive encoded Unicode. A browser may paint the intended outlines, but those code points do not become meaningful index terms. Protecting a block reduces discovery for its exact words.

## Keep discovery surfaces ordinary

- Canonical title and meta description
- Primary heading and page introduction
- Internal-link labels and surrounding context
- OpenGraph and social descriptions
- JSON-LD and other structured data
- RSS, Atom, sitemaps, email, and print summaries

Do not copy protected text into those channels. Write a separate public summary that explains the page without disclosing the protected block.

Protected content should usually be normally noindex, post-login, or otherwise outside the page's acquisition-critical copy. If organic search for the exact text matters, GlyphScramble is the wrong tool for that block.

## Static and dynamic caching

Static delivery keeps indexable HTML and CDN behavior, but the protected words remain encoded and one mapping is reused per build. Per-response delivery also makes the containing document dynamic and private. Isolate a small protected server boundary where the framework allows it.

Measure real crawl and acquisition effects before expanding protection. Do not infer SEO safety from a visually correct browser screenshot.
