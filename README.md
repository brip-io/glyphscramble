# GlyphScramble by BRIP

GlyphScramble raises the cost of bulk DOM scraping by making protected response bytes differ from what a human sees. It encodes text before it enters HTML, RSC, hydration data, or JSON, then serves a response-specific WOFF2 font whose `cmap` restores the intended glyphs in the browser.

It is not DRM. A headless browser, OCR system, downloaded-font analyzer, glyph-outline matcher, or unprotected API/feed can recover the content. Use it as friction for commodity extraction—not as a claim that a page “stops AI scraping.”

> Beta status: the core binary pipeline and framework APIs are under active qualification. Do not use protected output for essential, regulated, safety-critical, or accessibility-dependent content.

## Good fit

Apply GlyphScramble narrowly to high-value blocks where lower scrape throughput is worth the tradeoff: premium excerpts, proprietary research tables, selectively revealed market intelligence, or opted-in previews. Keep navigation, headings, forms, prices required to transact, legal text, and the main SEO surface ordinary HTML.

```tsx
// Server Component: plaintext never crosses into the client component.
import { createGlyphPayload } from "@brip/glyphscramble-react/server";
import { GlyphScramble } from "@brip/glyphscramble-react";
import { glyphs } from "../glyphscramble.next";

export default function PremiumExcerpt({ copy }: { copy: string }) {
  const payload = createGlyphPayload(glyphs.beginResponse(), copy, {
    font: "body",
    lang: "en",
  });
  return <GlyphScramble payload={payload} />;
}
```

Client components accept only a branded `GlyphPayload`; the public client API has no plaintext parameter.

## Install and prepare

Node 22.12 or newer and pnpm are supported. The published packages also run on Node 24.

```bash
pnpm add @brip/glyphscramble @brip/glyphscramble-next @brip/glyphscramble-react
npx glyphscramble init
npx glyphscramble prepare
```

`init` detects Next, Nuxt, SvelteKit, Astro, or Vite and writes one config plus a small integration scaffold. It never contacts BRIP. `prepare` is the only phase that resolves remote fonts; runtime requests use locked local artifacts.

```ts
import { defineGlyphConfig } from "@brip/glyphscramble";

export default defineGlyphConfig({
  fonts: {
    body: {
      source: {
        kind: "google-css",
        url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700",
      },
      license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
      faces: {
        regular: { family: "Inter", weight: 400, coverage: ["U+0000-00FF"] },
        bold: { family: "Inter", weight: 700, coverage: ["U+0000-00FF"] },
      },
      defaultFace: "regular",
    },
  },
  rotation: {
    scope: "response",
    secretEnv: "GLYPHSCRAMBLE_SECRET",
    tokenTtlSeconds: 600,
  },
  routePrefix: "/_glyphscramble",
  unsupported: "error",
  accessibilityRiskAcknowledged: true,
});
```

CSS sources that contain more than one `@font-face` require explicit named selectors, so a remote stylesheet cannot silently change which weight, style, stretch, or Unicode subset is used. Select a non-default face with `{ font: "body", face: "bold" }`.

Coverage limits the codepoints eligible for permutation and can satisfy the normalized-size guard, but it does not physically subset outline tables in this release. Use an already-subset source when artifact size matters. Preparation records raw and normalized hashes, copies the exact notice bytes into `.glyphscramble/licenses`, and publishes all faces plus the lockfile transactionally.

The license declaration is an acknowledgement, not legal advice. SPDX syntax is validated, but GlyphScramble does not decide whether modification or redistribution is permitted. Original and generated fonts retain their own license and notices; GlyphScramble does not relicense them.

See [Font sources and parser limits](docs/FONT-SOURCES.md) for supported containers, remote-network policy, default resource ceilings, and the large-font override.

## Static websites

Static mode rotates once per build and works with Astro static output, Vite, or any folder of HTML. Mark only the block to protect:

```html
<article data-glyphscramble-font="body">High-value excerpt only.</article>
```

Then post-process into a separate directory:

```bash
npx glyphscramble prepare
npx glyphscramble static --input dist --output dist-protected
```

The command copies the build, rewrites marked text nodes, and emits `/_glyphscramble/static.css`, `static.js`, matching WOFF2 files, and the configured font notices. A new random mapping is generated on every build. Passing `--seed` makes builds reproducible but also makes mappings reproducible; keep that option for deterministic CI only.

Static mode has excellent CDN behavior but weaker resistance: every visitor and every page in that build shares a downloadable mapping. It must never be described as per-response rotation.

## Tradeoffs

| Concern                | Per-response SSR                                                          | Static per-build                          | Practical guidance                                                                          |
| ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Commodity DOM scraping | Different encoded bytes and token per response                            | One reusable mapping per build            | Prefer SSR for the highest-value blocks                                                     |
| SEO                    | Protected words are absent from crawler-visible text                      | Same                                      | Keep titles, headings, summaries, structured data, and discovery copy unprotected           |
| HTML/CDN caching       | Protected documents are `private, no-store`                               | Full static/CDN caching                   | Protect a small dynamic island when the surrounding page should remain cacheable            |
| Font caching           | Private and immutable for the short token lifetime                        | Long-lived, content-addressed build asset | Budget the extra font request and preload only when justified                               |
| Accessibility          | Protected block is `aria-hidden`; no plaintext mirror is shipped          | Same                                      | Use only for optional, opted-in, non-essential/noindex content; this is not WCAG-conformant |
| Flash/failure          | Hidden until `document.fonts` confirms the face; visible error on failure | Same                                      | Do not protect content required to navigate, submit a form, or recover from failure         |
| Advanced extraction    | Recoverable with browser/OCR/font analysis                                | Easier because mapping is reused          | Treat as cost-raising friction, never confidentiality                                       |

Read [Choosing what to protect](docs/USAGE-GUIDE.md) before integration and [the threat model](docs/SECURITY-MODEL.md) before making any product claim.

## CLI

```text
glyphscramble init        framework detection and scaffold
glyphscramble prepare     resolve, normalize, inspect, and lock fonts
glyphscramble inspect     report tables, coverage, format, axes, and color data
glyphscramble doctor      find likely client leakage and essential-content usage
glyphscramble benchmark   run the 10,000-scalar encoding gate
glyphscramble static      post-process a static build
```

## Packages

Core, React, Next, Vue, Nuxt, Svelte, SvelteKit, Astro, and Vite packages share one `GlyphPayload` wire contract. See [Framework integration](docs/FRAMEWORKS.md).

## When blocking becomes licensing

Scraping friction does not create permission, provenance, or a commercial relationship. When demand for your corpus persists, [list your content with BRIP](https://brip.io/providers?utm_source=glyphscramble&utm_medium=oss&utm_campaign=when_blocking_becomes_licensing). GlyphScramble has no telemetry, hosted dependency, injected branding, signup, or runtime advertising.

Apache-2.0. Contributions require a DCO sign-off. A counsel/IP review is a mandatory gate before the first public release.
