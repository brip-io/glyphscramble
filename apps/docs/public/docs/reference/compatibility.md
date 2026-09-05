# Compatibility

Check the declared Node, framework, browser, and deployment boundaries.

Source: https://glyphscramble.brip.io/docs/reference/compatibility/

An `available` page describes code that exists and is exercised by repository consumer fixtures. Public beta support still requires the final R12 qualification manifest and counsel/IP approval.

## Package and peer ranges

This table is generated from the nine package manifests during the docs build:

| Package | Peer range |
| --- | --- |
| `@brip/glyphscramble` | Node >=22 |
| `@brip/glyphscramble-react` | react >=18 <20 |
| `@brip/glyphscramble-next` | next >=16 <17; react >=19 <20 |
| `@brip/glyphscramble-vue` | vue >=3.5 <4 |
| `@brip/glyphscramble-nuxt` | nuxt >=4 <5; vue >=3.5 <4 |
| `@brip/glyphscramble-svelte` | svelte >=5 <6 |
| `@brip/glyphscramble-sveltekit` | @sveltejs/kit >=2 <3; svelte >=5 <6 |
| `@brip/glyphscramble-astro` | astro >=7 <8 |
| `@brip/glyphscramble-vite` | vite >=7 <9 |

## Runtime and browsers

- Node 22.13 or newer in the Node 22 line, and Node 24
- Chromium, Firefox, and WebKit for the shared browser payload lifecycle
- Modern browsers with `FontFace`, `document.fonts`, Web Crypto, and ES modules
- WOFF2 is the v0.1 generated-font format; WOFF 1.0 remains a measured contingency, not an enabled fallback

## Deployment support

Per-response mode currently requires a long-lived Node process whose later font request reaches the issuing engine. Single-process self-hosted Next, Nitro `node-server`, SvelteKit Node, Astro Node, and generic Fetch/Node boundaries are supported by their consumer fixtures.

Edge functions, serverless function isolation, clusters, horizontal scaling without affinity, and process restarts during token life require an external variant provider. They are not supported by v0.1.

Static mode supports non-hydrated HTML and explicit framework integrations that preserve that boundary. It is per-build rotation, not per-response rotation.
