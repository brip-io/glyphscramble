---
title: Configuration
description: Configure licensed font faces, rotation, capacity, remote sources, and static limits.
order: 310
status: available
group: Reference
mode: both
packages:
  - "@brip/glyphscramble"
symbols:
  - defineGlyphConfig
lastReviewedAgainst: 0.1.0-beta.0
---

`defineGlyphConfig()` validates public input and normalizes bounded defaults. A minimal configuration must still identify the font source and license and record the accessibility-risk acknowledgement.

## Minimal configuration

```ts
{
  {
    CORE_QUICKSTART;
  }
}
```

Remote fonts resolve only during setup or build. Runtime rendering uses prepared local assets.

## Defaults

| Setting                    | Default                | Meaning                                                |
| -------------------------- | ---------------------- | ------------------------------------------------------ |
| `rotation.scope`           | `response`             | A fresh variant is acquired for a protected response   |
| `rotation.secretEnv`       | `GLYPHSCRAMBLE_SECRET` | Environment variable containing at least 32 characters |
| `rotation.tokenTtlSeconds` | `600`                  | Token and font authorization lifetime                  |
| `routePrefix`              | `/_glyphscramble`      | Same-origin font route prefix                          |
| `unsupported`              | `error`                | Fail before returning plaintext                        |
| Remote timeout             | bounded                | Setup fetches cannot wait indefinitely                 |
| Remote size                | bounded                | Oversized CSS and font bodies fail                     |
| Runtime pool               | bounded                | Variant count and bytes cannot grow without limit      |

Capacity, remote fetch, key rotation, static limits, and custom route settings are typed advanced options. Keep them absent until a measured deployment requires a change.

## Multiple faces

```ts
import type { FontConfig } from "@brip/glyphscramble";

const bodyFont: FontConfig = {
  source: { kind: "file", path: "./fonts/source-sans.css" },
  license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
  faces: {
    regular: { family: "Source Sans 3", weight: 400, style: "normal" },
    bold: { family: "Source Sans 3", weight: 700, style: "normal" },
  },
  defaultFace: "regular",
};
```

Use `{ font: "body", face: "bold" }` at the server boundary. CSS selectors must match exactly one face. Ambiguous or missing faces fail and list candidates.

Coverage is a runtime allowlist, not a font subsetter. A face above the normalized size ceiling needs explicit coverage or `allowLargeFont: true`. Use a separately subsetted font when download size matters.

## Key rotation

Change both the active key ID and environment variable. Retain the previous pair for at least the token lifetime:

```ts
import type { GlyphConfigInput } from "@brip/glyphscramble";

const rotation: GlyphConfigInput["rotation"] = {
  keyId: "2026-09",
  secretEnv: "GLYPHSCRAMBLE_SECRET_2026_09",
  previousKeys: [{ id: "2026-08", secretEnv: "GLYPHSCRAMBLE_SECRET_2026_08" }],
};
```

At most three previous keys are accepted. Never commit secret values.
