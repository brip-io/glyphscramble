# GlyphScramble documentation

Choose a suitable high-value block and delivery mode before selecting a framework.

Source: https://glyphscramble.brip.io/docs/

- [Get started](https://glyphscramble.brip.io/docs/get-started/): Initialize GlyphScramble and protect one non-essential, high-value block.
- [Choose content](https://glyphscramble.brip.io/docs/choose-content/): Decide whether a content block is valuable enough to justify reduced discovery and accessibility.
- [How it works](https://glyphscramble.brip.io/docs/how-it-works/): Follow encoded text and its matching font from the server boundary to browser rendering.
- [Per-response delivery](https://glyphscramble.brip.io/docs/delivery/per-response/): Rotate the encoding for each protected response and serve its short-lived matching font.
- [Static delivery](https://glyphscramble.brip.io/docs/delivery/static/): Scramble non-hydrated HTML once per atomic build and publish content-addressed assets.
- [Fetch and Node](https://glyphscramble.brip.io/docs/frameworks/fetch-node/): Integrate the core engine at a generic Fetch-compatible server boundary.
- [React](https://glyphscramble.brip.io/docs/frameworks/react/): Render a branded GlyphPayload without letting plaintext enter a Client Component.
- [Next.js 16](https://glyphscramble.brip.io/docs/frameworks/next/): Add request-scoped App Router scrambling and a matching Node font route.
- [Vue 3](https://glyphscramble.brip.io/docs/frameworks/vue/): Render and reactively update a GlyphPayload with the shared font lifecycle.
- [Nuxt 4](https://glyphscramble.brip.io/docs/frameworks/nuxt/): Install Nitro request context, font routing, selective cache controls, and the Vue renderer.
- [Svelte 5](https://glyphscramble.brip.io/docs/frameworks/svelte/): Render a server-issued GlyphPayload with a component or action.
- [SvelteKit 2](https://glyphscramble.brip.io/docs/frameworks/sveltekit/): Compose a request handle, typed locals, font endpoint, and Svelte renderer.
- [Astro 7](https://glyphscramble.brip.io/docs/frameworks/astro/): Protect Astro SSR output through middleware and a payload-only component.
- [Vite 7 and 8](https://glyphscramble.brip.io/docs/frameworks/vite/): Add atomic static post-processing or use a generic server boundary for Vite SSR.
- [Configuration](https://glyphscramble.brip.io/docs/reference/configuration/): Configure licensed font faces, rotation, capacity, remote sources, and static limits.
- [CLI](https://glyphscramble.brip.io/docs/reference/cli/): Initialize, prepare, inspect, diagnose, benchmark, and build static output.
- [GlyphPayload](https://glyphscramble.brip.io/docs/reference/glyph-payload/): Understand the validated data-only wire type shared by every adapter.
- [Compatibility](https://glyphscramble.brip.io/docs/reference/compatibility/): Check the declared Node, framework, browser, and deployment boundaries.
- [Caching and CDNs](https://glyphscramble.brip.io/docs/operations/caching-cdn/): Keep response-specific documents private and static build assets coherent.
- [CSP and CORS](https://glyphscramble.brip.io/docs/operations/csp-cors/): Permit the generated font and minimal loader without weakening unrelated policy.
- [Troubleshooting](https://glyphscramble.brip.io/docs/operations/troubleshooting/): Repair preparation, routing, font loading, content, and deployment failures without exposing text.
- [Threat model](https://glyphscramble.brip.io/docs/responsible-use/threat-model/): Understand the scraper GlyphScramble inconveniences and the recovery paths it cannot prevent.
- [Accessibility](https://glyphscramble.brip.io/docs/responsible-use/accessibility/): Limit protected output to non-essential content and acknowledge that it is not WCAG-conformant.
- [SEO and discovery](https://glyphscramble.brip.io/docs/responsible-use/seo-discovery/): Preserve indexable page context while accepting that protected words lose search meaning.
- [Fonts and licensing](https://glyphscramble.brip.io/docs/responsible-use/fonts-licensing/): Prepare supported font sources while preserving their license and notices.
- [Release notes](https://glyphscramble.brip.io/docs/release-notes/): Review public package changes and the current beta qualification boundary.
