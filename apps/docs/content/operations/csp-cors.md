---
title: CSP and CORS
description: Permit the generated font and minimal loader without weakening unrelated policy.
order: 420
status: available
group: Operations
mode: both
lastReviewedAgainst: 0.1.0-beta.0
---

Generated font URLs are same-origin and root-relative. Keep them same-origin unless you have designed and tested a separate font origin, CORS policy, token-log policy, and cache key.

## Recommended response policy

```text
default-src 'self';
font-src 'self';
script-src 'self';
style-src 'self' 'nonce-<per-response-value>';
style-src-attr 'none';
object-src 'none';
base-uri 'self';
frame-ancestors 'self'
```

Pass the same nonce in the `GlyphPayload` so the browser runtime can register the generated `@font-face` rule. Generate a new nonce for each document and never place a secret or mapping seed in it.

Without a nonce, the runtime needs `style-src-attr 'unsafe-inline'` for the element's generated font family. Treat that as a deliberate downgrade and keep every other directive strict.

## Failure behavior

A blocked font or style must keep the encoded block hidden and show a generic status. Test the page with `font-src 'none'`, an invalid route, and a mismatched nonce. Never relax the policy by adding broad third-party origins merely to make the block appear.

If fonts are moved cross-origin, return an exact `Access-Control-Allow-Origin` for the document origin and validate CDN caching by origin. Wildcard credentials and reusable public token URLs are not acceptable.
