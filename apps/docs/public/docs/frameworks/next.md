# Next.js 16

Add request-scoped App Router scrambling and a matching Node font route.

Source: https://glyphscramble.brip.io/docs/frameworks/next/

Run the initializer in a Next.js 16 App Router project. It installs the core and Next packages, creates a process-level helper, and adds the GET/HEAD font route without generating Proxy.

## Server helper

```ts
import "server-only";
import { createNextGlyphs } from "@brip/glyphscramble-next/server";
import config from "./glyphscramble.config";

export const glyphs = await createNextGlyphs(config);
```

The helper uses Next's request-time boundary and React request cache. All protected blocks in one RSC render share a context; different responses rotate.

## Server Component

```tsx
import { GlyphScramble } from "@brip/glyphscramble-next";
import { glyphs } from "@/glyphscramble.next";

export default async function PremiumExcerpt() {
  const payload = await glyphs.scramble(
    "Optional server-only research excerpt.",
    { font: "body", lang: "en" },
  );
  return <GlyphScramble payload={payload} />;
}
```

## Font route

The generated filesystem route is `app/%5Fglyphscramble/font/[token]/[face]/route.ts`, or the equivalent under `src/app`. Its public URL is still `/_glyphscramble/...`.

```ts
import { glyphs } from "@/glyphscramble.next";

export const GET = glyphs.fontRoute;
export const HEAD = glyphs.fontRoute;
```

A literal `_glyphscramble` folder is private to Next and will not route. Keep the default Node runtime. Self-hosted single-process Next is supported; serverless functions, multiple instances, and process restarts need an external variant provider and are not supported in v0.1.
