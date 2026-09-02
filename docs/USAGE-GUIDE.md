# Choosing what to protect

GlyphScramble is most useful when a publisher can isolate a high-value block from the page’s public discovery and interaction surfaces.

## Protect selectively

Good candidates are optional premium excerpts, proprietary tables, post-login research snippets, and other blocks where a human reader can tolerate a font-loading boundary. Keep an ordinary HTML summary near the block so the page remains understandable when the font is unavailable.

Do not protect:

- page titles, primary headings, navigation, breadcrumbs, link labels, or search snippets;
- forms, buttons, validation messages, prices required for a transaction, or account recovery;
- legal notices, emergency or safety information, educational accommodations, or regulated disclosures;
- OpenGraph, JSON-LD, RSS, Atom, sitemaps, email, print output, clipboard workflows, or API fields unless each channel is separately designed and tested;
- content whose confidentiality matters. A browser can recover the mapping.

## Choose and prepare font faces

Local files and direct HTTPS font URLs prepare one face. TTF, OTF, WOFF, and WOFF2 containers are accepted; TTC collections are rejected. A Google Fonts CSS source may describe several weights, styles, stretches, and Unicode subsets, so configure every intended face explicitly:

```ts
body: {
  source: {
    kind: "google-css",
    url: "https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,700;1,700",
  },
  license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
  faces: {
    regular: { family: "Inter", weight: 400, style: "normal", coverage: ["U+0000-00FF"] },
    bold: { family: "Inter", weight: 700, style: "normal", coverage: ["U+0000-00FF"] },
    boldItalic: { family: "Inter", weight: 700, style: "italic", coverage: ["U+0000-00FF"] },
  },
  defaultFace: "regular",
}
```

If a selector matches zero or several CSS faces, preparation fails and lists the available candidates. CSS is fetched with a pinned WOFF2-capable request profile, and the resulting lock records that profile, original and final URLs, raw and normalized SHA-256 hashes, inferred names, axes, layout features, source descriptors, effective descriptors, and Unicode coverage. Runtime calls select a named face with `{ font: "body", face: "bold" }`.

`coverage` is a strict runtime allowlist: only source codepoints inside the configured ranges enter the permutation. It does not physically remove unselected outlines or shaping tables, so use a pre-subset font when download size matters. A large face must have effective coverage or `allowLargeFont: true`.

`prepare` validates the SPDX expression and copies the license or notice bytes to `.glyphscramble/licenses`. Static builds copy those notices beside generated assets. This preserves notices; it does not establish that the font license permits modification or redistribution. Review the font license yourself.

## SEO

Search crawlers receive encoded Unicode values. Even when the browser paints the right outlines, those values do not become meaningful indexable words. Keep canonical titles, descriptions, headings, internal-link context, structured data, and enough unprotected summary copy for discovery. Protected blocks should usually be `noindex` or live behind authentication.

Do not put plaintext into JSON-LD, `aria-label`, hidden DOM nodes, comments, hydration props, source maps, OpenGraph descriptions, or client bundles to compensate. That defeats the extraction boundary.

## Caching

Per-response payloads make the containing HTML/RSC/JSON dynamic and `private, no-store`. The matching font is private and immutable for the token lifetime. A mostly static page should isolate the protected block behind a small dynamic server boundary rather than disabling caching for the whole site.

Static mode is the opposite trade: output can be cached globally, but the mapping is reused until the next build. Cache its content-addressed font and CSS for a long time and rotate by rebuilding. Do not mix static pages from one build with assets from another.

## Accessibility

There is no honest plaintext accessibility mirror: any mirror is also a plaintext scraping surface. GlyphScramble therefore marks protected output `aria-hidden` and requires `accessibilityRiskAcknowledged: true`.

This means the protected block is not WCAG-conformant. Limit it to opted-in, non-essential content, give users an accessible acquisition path outside the protected representation, and involve accessibility and legal reviewers. Never infer acknowledgement merely because a framework integration was installed.

## Failure behavior

Protected elements stay hidden until `document.fonts` confirms the generated face. A timeout or CSP/CORS/font error produces a visible generic error, never plaintext. Monitor failures in your own application without sending content or mapping data to BRIP.
