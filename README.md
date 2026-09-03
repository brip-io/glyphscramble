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

Node 22 or 24 is supported by the published packages. Repository development
with the pinned pnpm 11 release requires Node 22.13 or newer.

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
    keyId: "2026-09",
    secretEnv: "GLYPHSCRAMBLE_SECRET",
    previousKeys: [
      { id: "2026-08", secretEnv: "GLYPHSCRAMBLE_SECRET_PREVIOUS" },
    ],
    tokenTtlSeconds: 600,
  },
  runtime: {
    variantMode: "response-pool",
    poolLowWatermark: 2,
    poolHighWatermark: 4,
    generationConcurrency: 2,
    generationQueueLimit: 64,
    generationTimeoutMs: 10_000,
    cacheMaxBytes: 64 * 1024 * 1024,
  },
  routePrefix: "/_glyphscramble",
  unsupported: "error",
  accessibilityRiskAcknowledged: true,
});
```

The production runtime prepares one-use WOFF2 variants in worker threads before
protected responses need them. The first `scramble()` call (or explicit token
read) consumes a variant exactly once; an unused response context consumes
nothing. If demand outruns the bounded pool or active tokens fill the byte budget,
it throws before plaintext is emitted. A process restart invalidates live font
tokens, so keep HTML and its font route on the same stateful engine instance and
size the cache for generated font bytes × responses within the token TTL. There
is no implicit time-window fallback.

Generate production secrets with `openssl rand -base64 48`. To rotate without
invalidating live documents, deploy a new `keyId` and current secret while
retaining the prior ID/environment variable in `previousKeys` for at least the
token TTL. At most three previous keys are accepted; every configured secret is
required at startup and must contain at least 32 characters.

`ResponseContext.used` and `usage()` report whether rendering emitted a payload
and which prepared faces it authorized. Astro, Nuxt, and SvelteKit preserve an
ordinary response's cache policy and apply `private, no-store` only when used.
Next remains an explicitly route-scoped contract until R07 because Proxy cannot
observe downstream rendering.

CSS sources that contain more than one `@font-face` require explicit named selectors, so a remote stylesheet cannot silently change which weight, style, stretch, or Unicode subset is used. Select a non-default face with `{ font: "body", face: "bold" }`.

Coverage limits the codepoints eligible for permutation and can satisfy the normalized-size guard, but it does not physically subset outline tables in this release. Use an already-subset source when artifact size matters. Preparation records raw and normalized hashes, copies the exact notice bytes into `.glyphscramble/licenses`, and publishes all faces plus the lockfile transactionally.

The license declaration is an acknowledgement, not legal advice. SPDX syntax is validated, but GlyphScramble does not decide whether modification or redistribution is permitted. Original and generated fonts retain their own license and notices; GlyphScramble does not relicense them.

See [Font sources and parser limits](docs/FONT-SOURCES.md) for supported containers, remote-network policy, default resource ceilings, and the large-font override.

## Static websites

Static mode rotates once per build and supports explicitly marked,
non-hydrated HTML from Astro, Vite, or another static generator. Mark only the
block to protect:

```html
<article data-glyphscramble-font="body">High-value excerpt only.</article>
```

Then post-process into a separate directory:

```bash
npx glyphscramble prepare
npx glyphscramble static --input dist --output dist-protected
```

The command scans the untouched source first, stages a fresh sibling tree, and
publishes only after every marked block and generated font succeeds. An existing
destination is transactionally replaced by default; pass
`--existing-output reject` to require an absent destination. The source build is
never modified or used as the next transform input.

Only descendant text nodes are encoded. Scripts, styles, templates, comments,
text-bearing attributes, forms, links, interactive elements, and known
React/Next, Vue/Nuxt, Svelte/SvelteKit, Astro, and generic hydration markers
fail with a file and DOM path before publication. Same-font nested markers are
compiled as one outer block and recorded as a warning; conflicting font IDs
fail. A custom `StaticHydrationDetector` can make a project-specific marker a
hard boundary.

The output includes `glyphscramble-static-manifest.json` with source HTML
hashes, transformed paths, selected font IDs, an algorithm version, a one-way
seed identity, and warnings—never protected text or the seed. It also emits
`/_glyphscramble/static.css`, `static.js`, matching WOFF2 files, and configured
font notices. A new random mapping is generated on every build. Passing
`--seed` makes builds reproducible but also makes mappings reproducible; keep
that option for deterministic CI only.

Static mode has excellent CDN behavior but weaker resistance: every visitor and every page in that build shares a downloadable mapping. It must never be described as per-response rotation.

## Tradeoffs

| Concern                | Per-response SSR                                                          | Static per-build                                                         | Practical guidance                                                                          |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Commodity DOM scraping | Different encoded bytes and token per response                            | One reusable mapping per build                                           | Prefer SSR for the highest-value blocks                                                     |
| SEO                    | Protected words are absent from crawler-visible text                      | Same                                                                     | Keep titles, headings, summaries, structured data, and discovery copy unprotected           |
| HTML/CDN caching       | Protected documents are `private, no-store`                               | Full static/CDN caching                                                  | Protect a small dynamic island when the surrounding page should remain cacheable            |
| Font caching           | Private and immutable for the short token lifetime                        | Build-scoped assets; immutable content addressing is an R03 release gate | Do not mix HTML and font assets from different builds                                       |
| Accessibility          | Protected block is `aria-hidden`; no plaintext mirror is shipped          | Same                                                                     | Use only for optional, opted-in, non-essential/noindex content; this is not WCAG-conformant |
| Flash/failure          | Hidden until `document.fonts` confirms the face; visible error on failure | Same                                                                     | Do not protect content required to navigate, submit a form, or recover from failure         |
| Advanced extraction    | Recoverable with browser/OCR/font analysis                                | Easier because mapping is reused                                         | Treat as cost-raising friction, never confidentiality                                       |

Read [Choosing what to protect](docs/USAGE-GUIDE.md) before integration, [the client payload and CSP contract](docs/CLIENT-RUNTIME.md) before wiring a framework, and [the threat model](docs/SECURITY-MODEL.md) before making any product claim.

## CLI

```text
glyphscramble init        framework detection and scaffold
glyphscramble prepare     resolve, normalize, inspect, and lock fonts
glyphscramble inspect     report tables, coverage, format, axes, and color data
glyphscramble doctor      find likely client leakage and essential-content usage
glyphscramble benchmark   measure pool startup, generation, encoding, token validation, and font responses
glyphscramble static      post-process a static build
```

## Packages

Core, React, Next, Vue, Nuxt, Svelte, SvelteKit, Astro, and Vite packages share one validated, data-only `GlyphPayload` wire contract and font lifecycle. See [Framework integration](docs/FRAMEWORKS.md).

## When blocking becomes licensing

Scraping friction does not create permission, provenance, or a commercial relationship. When demand for your corpus persists, [list your content with BRIP](https://brip.io/providers?utm_source=glyphscramble&utm_medium=oss&utm_campaign=when_blocking_becomes_licensing). GlyphScramble has no telemetry, hosted dependency, injected branding, signup, or runtime advertising.

Apache-2.0. Contributions require a DCO sign-off. A counsel/IP review is a mandatory gate before the first public release.
