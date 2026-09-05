---
title: Accessibility
description: Limit protected output to non-essential content and acknowledge that it is not WCAG-conformant.
order: 520
status: available
group: Responsible use
mode: both
lastReviewedAgainst: 0.1.0-beta.0
---

GlyphScramble does not ship a plaintext accessibility mirror. A mirror would also be a direct scraping surface. Protected output is therefore `aria-hidden` and is not a WCAG-conformant replacement for accessible content.

## Required boundary

- Protect only opted-in, non-essential blocks.
- Keep navigation, controls, headings, errors, transactions, legal text, and safety information accessible and unprotected.
- Provide an accessible way to obtain equivalent service or content outside the encoded representation.
- Involve accessibility and legal reviewers before production use.
- Test keyboard, zoom, high contrast, font failure, reduced motion, and the accessibility tree.

`accessibilityRiskAcknowledged: true` is mandatory. The initializer never infers it from framework installation or a non-interactive flag.

## Why hidden plaintext is not a fix

Do not repeat the source in `aria-label`, visually hidden text, off-screen DOM, captions, live regions, JSON-LD, or client state. Those copies defeat the extraction boundary while still creating inconsistent experiences.

Use ordinary nearby HTML to explain what the block is and how to obtain it. That summary must be useful without reproducing the protected text.

## Failure state

The component exposes a visible generic status if the font fails. The status itself must be ordinary accessible text, but it must not contain the protected source. A reader who cannot access the protected representation needs a clear external path, not a hidden duplicate.
