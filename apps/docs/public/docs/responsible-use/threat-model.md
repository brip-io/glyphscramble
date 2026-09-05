# Threat model

Understand the scraper GlyphScramble inconveniences and the recovery paths it cannot prevent.

Source: https://glyphscramble.brip.io/docs/responsible-use/threat-model/

GlyphScramble raises the cost of bulk DOM scraping. It is not DRM, access control, encryption of public content, or a confidentiality boundary.

## What becomes harder

A commodity HTTP client, DOM parser, or extraction script receives encoded Unicode that does not contain the protected words. Reusing a fixed character substitution across pages is less useful in per-response mode because each protected response receives a fresh mapping.

## What still works

| Recovery path          | Why it works                                                                    |
| ---------------------- | ------------------------------------------------------------------------------- |
| Headless browser       | It can load the same font and observe rendered output                           |
| Font analysis          | The downloaded font contains the mapping needed to render                       |
| OCR                    | Pixels remain readable to the human reader and therefore to image recognition   |
| Outline matching       | Glyph shapes can be compared with known source fonts                            |
| Plaintext side channel | Feeds, APIs, metadata, bundles, source maps, and hidden DOM bypass the encoding |
| Authorized reader      | A person or browser that can view content can record or redistribute it         |

The encrypted font token protects coordination, expiry, face authorization, and abuse boundaries. It does not make the content secret.

## Operational boundary

Per-response mappings are short-lived and private to one engine instance. Static mappings are shared for a complete build. Both modes fail closed when the font, token, route, or mapping cannot be used.

Do not claim that GlyphScramble stops AI scraping. Describe the observed outcome, test raw-parser friction, and demonstrate recovery by browser-capable automation in the same review.

When a reader needs deliberate machine access, use a licensed delivery path rather than trying to turn the public page into a vault.
