---
title: Fonts and licensing
description: Prepare supported font sources while preserving their license and notices.
order: 540
status: available
group: Responsible use
mode: both
packages:
  - "@brip/glyphscramble"
symbols:
  - prepareGlyphFonts
  - inspectFont
lastReviewedAgainst: 0.1.0-beta.0
---

GlyphScramble can prepare TTF, OTF, WOFF, and WOFF2 files from local paths, direct HTTPS URLs, Google Fonts CSS URLs, or CSS with one or more `@font-face` declarations. TTC collections are rejected in v0.1.

## License acknowledgement

Every configured family needs an SPDX expression and a local license or notice file. Preparation validates the expression, copies the notice into `.glyphscramble/licenses`, and records its digest in the lock. Static builds copy notices into the deployment.

This preserves evidence. It does not decide whether a license permits modification, generated-font redistribution, embedding, commercial use, or your chosen deployment. You own that review. GlyphScramble does not relicense user-provided or generated fonts.

## Remote sources

Remote input is allowed only during setup or build. Resolution enforces HTTPS, redirect count, timeout, protocol, address, MIME, and size limits. The lock records original and final URLs, request profile, raw and normalized SHA-256, face descriptors, axes, layout features, and Unicode coverage.

Commit the lock and required notices. Do not depend on a remote font URL at request time.

## Coverage and font size

Coverage controls which source code points may enter a permutation. It does not remove unused outlines or layout tables. Use a properly licensed pre-subset font to reduce download size.

Faces above the normalized default limit require explicit coverage or `allowLargeFont: true`. Inspect the face first:

```bash
npx glyphscramble inspect ./fonts/SourceSans3-Regular.woff2
npx glyphscramble prepare
```

The patcher preserves outlines, variation, color, GSUB, and GPOS tables while replacing `cmap` and required checksums.
