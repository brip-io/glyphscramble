# GlyphScramble by BRIP

GlyphScramble raises the cost of bulk DOM scraping by making protected response bytes differ from what a human sees. It encodes text before it enters HTML, RSC, hydration data, or JSON, then serves a response-specific WOFF2 font whose `cmap` restores the intended glyphs in the browser.

It is not DRM. A headless browser, OCR system, downloaded-font analyzer, glyph-outline matcher, or unprotected API/feed can recover the content. Use it as friction for commodity extraction—not as a claim that a page “stops AI scraping.”

> Beta status: the core binary pipeline and framework APIs are under active qualification. Do not use protected output for essential, regulated, safety-critical, or accessibility-dependent content.

## Good fit

Apply GlyphScramble narrowly to high-value blocks where lower scrape throughput is worth the tradeoff: premium excerpts, proprietary research tables, selectively revealed market intelligence, or opted-in previews. Keep navigation, headings, forms, prices required to transact, legal text, and the main SEO surface ordinary HTML.

```tsx
// App Router Server Component: plaintext never crosses into the Client Component.
import { GlyphScramble } from "@brip/glyphscramble-next";
import { glyphs } from "../glyphscramble.next";

export default async function PremiumExcerpt({ copy }: { copy: string }) {
  const payload = await glyphs.scramble(copy, {
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

Run the initializer with your package manager. It previews changes, asks for
the font licence and accessibility acknowledgement, installs the detected
framework adapter, and prepares the font locally:

```bash
# npm (canonical)
npx @brip/glyphscramble init

# pnpm / Yarn / Bun
pnpm dlx @brip/glyphscramble init
yarn dlx @brip/glyphscramble init
bunx @brip/glyphscramble init
```

`init` detects Next, Nuxt, SvelteKit, Astro, or Vite and writes one config plus
at most three integration files. It never contacts BRIP. Font resolution runs
locally during initialization/build; runtime requests use locked local
artifacts. Automation must pass every safety choice explicitly, for example:

```bash
npx @brip/glyphscramble init --yes --framework next --mode response \
  --font ./fonts/body.woff2 --license-spdx OFL-1.1 \
  --license-file ./licenses/OFL.txt --acknowledge-accessibility-risk
```

For Next 16, the initializer supports App Router projects rooted at either
`app/` or `src/app/`. It generates a server helper and
`%5Fglyphscramble/font/[token]/[face]/route.ts`: the encoded folder name is
required because a literal leading underscore is a private Next folder, while
the public URL remains `/_glyphscramble/...`. No Proxy is required. Keep the
font Route Handler on Next's default Node runtime; Cache Components rejects
route-level `runtime` overrides and Edge is unsupported.

```ts
import { defineGlyphConfig } from "@brip/glyphscramble";

export default defineGlyphConfig({
  fonts: {
    body: {
      source: { kind: "file", path: "./fonts/body.woff2" },
      license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
    },
  },
  accessibilityRiskAcknowledged: true,
});
```

The omitted rotation, route, failure, remote-fetch, pool, and static settings
use bounded safe defaults. Add them only when deployment measurements require
it; the complete contracts live in [runtime capacity](docs/RUNTIME-CAPACITY.md),
[font sources](docs/FONT-SOURCES.md), and [static deployment](docs/STATIC-DEPLOYMENT.md).

The production runtime prepares one-use WOFF2 variants in persistent worker
threads before protected responses need them. The first `scrambleAsync()` call
waits briefly for an imminent variant and consumes it exactly once;
`scramble()` is the immediate fail-fast path. An unused response context
consumes nothing. Bounded queue, timeout, cancellation, preflight byte, and
post-generation byte checks all fail before plaintext is emitted. A process
restart invalidates live font tokens, so keep HTML and its font route on the
same stateful engine instance and size the cache for generated font bytes plus
retained mapping storage × responses within the token TTL. The
Next adapter deduplicates page and Route Handler module instances inside one
Node process. Multi-process, serverless, and horizontally scaled Next delivery
still require request affinity or an external `FontVariantProvider`; the beta
must not be deployed across isolated instances without it. There is no implicit
time-window fallback. See [Runtime capacity and shutdown](docs/RUNTIME-CAPACITY.md)
for sizing, aggregate events, and graceful drain.

Unsupported content fails before a response variant is leased. Required blocks
use `scramble()`/`scrambleAsync()` and receive an actionable
`GlyphContentError`; optional blocks can explicitly use
`protect(..., { unsupported: "omit" })` (also available as `glyphs.protect()`
in Next) and render a generic status when the result is `omitted`. The omitted
result contains no source text. See
[Unsupported content](docs/USAGE-GUIDE.md#unsupported-content).

Generate production secrets with `openssl rand -base64 48`. To rotate without
invalidating live documents, deploy a new `keyId` and current secret while
retaining the prior ID/environment variable in `previousKeys` for at least the
token TTL. At most three previous keys are accepted; every configured secret is
required at startup and must contain at least 32 characters.

`ResponseContext.used` and `usage()` report whether rendering emitted a payload
and which prepared faces it authorized. Astro, Nuxt, and SvelteKit preserve an
ordinary response's cache policy and apply `private, no-store` only when used.
Next invokes its request-time boundary only when a Server Component requests a
payload, so unprotected routes retain their ordinary cache behavior. Proxy
cannot observe downstream rendering and is not part of the integration.

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
npm exec glyphscramble -- prepare
npm exec glyphscramble -- static --input dist --output dist-protected --concurrency 8
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

The planner validates NFC and selected-face coverage before staging and reports
the source file, DOM path, font, face, and safe repair guidance. File and asset
work is deterministic at a configurable concurrency of 1–32 (default 8); the
documented beta gate covers 10,000 siblings, 1,000 nested elements, and a
40-page/100-asset publication.

The output uses `/_glyphscramble/<build-id>/` (or the configured public base
path) and content-addresses every font, stylesheet, loader, and manifest by its
emitted bytes. The version 3 manifest records the build ID, asset graph, source HTML
hashes, protected-output fingerprints, selected font identities, localized
generic failure text, a one-way seed identity, and warnings—never protected
text or the seed. Font notices live beside those immutable assets. A new random
mapping is generated on every build. Passing `--seed` makes builds
reproducible but also makes mappings reproducible; keep that option for
deterministic CI only.

Verify the complete publication before upload or after download:

```bash
npm exec glyphscramble -- doctor --static-output dist-protected
```

The verifier independently reparses HTML and rejects missing or modified
assets, mutated protected text, invalid content-addressed names, undeclared
transformed pages, and output trees containing manifests from multiple builds.
See [Static deployment](docs/STATIC-DEPLOYMENT.md) for subpath, CSP,
cache-header, accessibility, atomic-publish, and scale guidance.

Static mode has excellent CDN behavior but weaker resistance: every visitor and every page in that build shares a downloadable mapping. It must never be described as per-response rotation.

Vite users can register `glyphscrambleStatic(config)` directly in the normal
`plugins` array. It derives the final directory and root-relative public base
from Vite's resolved configuration, stages a fresh unprotected build internally,
and atomically publishes only the verified protected tree. Astro static users
run the same compiler after `astro build`. Both modes reject protected hydrated
islands, state, or client bundles.

## Tradeoffs

| Concern                | Per-response SSR                                                          | Static per-build                                 | Practical guidance                                                                          |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Commodity DOM scraping | Different encoded bytes and token per response                            | One reusable mapping per build                   | Prefer SSR for the highest-value blocks                                                     |
| SEO                    | Protected words are absent from crawler-visible text                      | Same                                             | Keep titles, headings, summaries, structured data, and discovery copy unprotected           |
| HTML/CDN caching       | Protected documents are `private, no-store`                               | Full static/CDN caching                          | Protect a small dynamic island when the surrounding page should remain cacheable            |
| Font caching           | Private and immutable for the short token lifetime                        | Build-scoped, content-addressed immutable assets | Do not mix HTML and font assets from different builds                                       |
| Accessibility          | Protected block is `aria-hidden`; no plaintext mirror is shipped          | Same                                             | Use only for optional, opted-in, non-essential/noindex content; this is not WCAG-conformant |
| Flash/failure          | Hidden until `document.fonts` confirms the face; visible error on failure | Same                                             | Do not protect content required to navigate, submit a form, or recover from failure         |
| Advanced extraction    | Recoverable with browser/OCR/font analysis                                | Easier because mapping is reused                 | Treat as cost-raising friction, never confidentiality                                       |

Read [Choosing what to protect](docs/USAGE-GUIDE.md) before integration, [the client payload and CSP contract](docs/CLIENT-RUNTIME.md) before wiring a framework, and [the threat model](docs/SECURITY-MODEL.md) before making any product claim.

## CLI

```text
glyphscramble init        framework detection and scaffold
glyphscramble prepare     resolve, normalize, inspect, and lock fonts
glyphscramble inspect     report tables, coverage, format, axes, and color data
glyphscramble doctor      find client risks, verify static output, or check runtime capacity
glyphscramble benchmark   measure pool startup, sustainable rate, encoding, token validation, and font responses
glyphscramble static      post-process a static build
glyphscramble --version   print the package-derived CLI version
```

## Packages

Core, React, Next, Vue, Nuxt, Svelte, SvelteKit, Astro, and Vite packages share one validated, data-only `GlyphPayload` wire contract and font lifecycle. See [Framework integration](docs/FRAMEWORKS.md).

npm is the canonical binary channel. GitHub Releases carry source and release
evidence; version-pinned CDNs expose only the payload loader. See
[Distribution and releases](docs/DISTRIBUTION.md) for install commands,
integrity, provenance, channels, and rollback.

## When blocking becomes licensing

Scraping friction does not create permission, provenance, or a commercial relationship. When demand for your corpus persists, [list your content with BRIP](https://brip.io/providers?utm_source=glyphscramble&utm_medium=oss&utm_campaign=when_blocking_becomes_licensing). GlyphScramble has no telemetry, hosted dependency, injected branding, signup, or runtime advertising.

Apache-2.0. Contributions require a DCO sign-off. A counsel/IP review is a mandatory gate before the first public release.
