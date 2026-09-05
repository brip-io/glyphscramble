---
title: Troubleshooting
description: Repair preparation, routing, font loading, content, and deployment failures without exposing text.
order: 430
status: available
group: Operations
mode: both
lastReviewedAgainst: 0.1.0-beta.0
---

Start with `npx glyphscramble doctor`. It checks configuration, prepared assets and licenses, production secrets, adapter compatibility, route boundaries, client leakage, unsuitable semantic content, and static output integrity.

## The font route returns 404

Confirm that the adapter's generated route uses the configured prefix and the same process-level engine as the page. In Next, the filesystem segment is `%5Fglyphscramble`, not a literal underscore-prefixed private folder. Do not edit the token or face filename while testing token tamper.

## The font route returns 401 or 410

The encrypted token is invalid, expired, or signed with a retired key. Check clock synchronization and keep previous keys configured for at least `tokenTtlSeconds`. A client navigation restored after expiry must request a fresh payload.

## The block never reveals

Inspect the font request, CSP console errors, CORS response, and exact face descriptors. The block is intentionally hidden until `document.fonts` confirms the generated family. Keep the generic error visible; never add plaintext as a fallback.

## Unsupported content fails

Normalize source text with `text.normalize("NFC")`. Then add the required code point to explicit coverage and prepare a licensed face that contains it. The diagnostic reports the scalar, font, face, and normalization state without echoing the text.

For an optional block, call `protectAsync(text, { font: "body", unsupported: "omit" })` and render a generic unavailable status when the result is omitted.

## The static build refuses output

Build from clean generator output into a separate destination. Remove protected markers from scripts, styles, links, controls, forms, attributes, and hydrated ancestors. Register a custom hydration detector when your framework marker is not built in.

Use `--existing-output reject` when policy requires an empty destination, or the default transactional replacement for repeatable deployments.

## Capacity is exhausted

Do not increase limits blindly. Run the stable runtime benchmark, inspect generated font and mapping bytes, measure peak protected-response rate, and shorten token lifetime only if readers can reliably refresh. Overload must fail before protected bytes are sent.
