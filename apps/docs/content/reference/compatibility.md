---
title: Compatibility
description: Check the declared Node, framework, browser, and deployment boundaries.
order: 340
status: available
group: Reference
mode: both
lastReviewedAgainst: 0.1.0-beta.0
---

An `available` page describes code that exists and is exercised by repository consumer fixtures. Public beta support still requires the final R12 qualification manifest and counsel/IP approval.

## Package and peer ranges

This table is generated from the nine package manifests during the docs build:

{{PACKAGE_MATRIX}}

## Runtime and browsers

- Node 22.13 or newer in the Node 22 line, and Node 24
- Chromium, Firefox, and WebKit for the shared browser payload lifecycle
- Modern browsers with `FontFace`, `document.fonts`, Web Crypto, and ES modules
- WOFF2 is the v0.1 generated-font format; WOFF 1.0 remains a measured contingency, not an enabled fallback

## Deployment support

Per-response mode currently requires a long-lived Node process whose later font request reaches the issuing engine. Single-process self-hosted Next, Nitro `node-server`, SvelteKit Node, Astro Node, and generic Fetch/Node boundaries are supported by their consumer fixtures.

Edge functions, serverless function isolation, clusters, horizontal scaling without affinity, and process restarts during token life require an external variant provider. They are not supported by v0.1.

Static mode supports non-hydrated HTML and explicit framework integrations that preserve that boundary. It is per-build rotation, not per-response rotation.
