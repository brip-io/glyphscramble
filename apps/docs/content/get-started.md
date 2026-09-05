---
title: Get started
description: Initialize GlyphScramble and protect one non-essential, high-value block.
order: 10
status: available
group: Start
mode: both
packages:
  - "@brip/glyphscramble"
symbols:
  - defineGlyphConfig
lastReviewedAgainst: 0.1.0-beta.0
---

GlyphScramble raises the cost of bulk DOM scraping by sending encoded Unicode and a matching generated font. Start with one optional block whose value justifies the SEO, accessibility, and caching trade-offs.

## Before you install

You need Node 22 or 24, a font license that permits your intended modification and redistribution, and an explicit acknowledgement that protected output is hidden from assistive technology. GlyphScramble does not contact BRIP during setup or at runtime.

Choose [per-response delivery](/docs/delivery/per-response/) for a server-rendered application that can keep response-local font state. Choose [static delivery](/docs/delivery/static/) for non-hydrated HTML where one mapping may remain valid until the next atomic build.

## Run the initializer

Run one command from the application root:

```bash
npx @brip/glyphscramble init
```

Equivalent commands are available for pnpm, Yarn, and Bun:

```bash
pnpm dlx @brip/glyphscramble init
yarn dlx @brip/glyphscramble init
bunx @brip/glyphscramble init
```

The guided flow detects the framework, package manager, workspace root, source layout, and TypeScript use. It asks for the delivery mode, font source, SPDX expression, license file, and accessibility acknowledgement. It previews every file and dependency change before writing.

Use `--dry-run` to inspect the plan without installing or writing. Existing middleware, hooks, routes, and configs are never overwritten.

## Minimal configuration

The generated configuration keeps safe defaults implicit:

```ts
{
  {
    CORE_QUICKSTART;
  }
}
```

Response rotation, `GLYPHSCRAMBLE_SECRET`, a ten-minute token lifetime, `/_glyphscramble`, bounded capacity, and fail-closed content handling are defaults. Override them only when your deployment requires it.

## Finish the integration

The initializer installs the appropriate adapter and prints the exact generated files, the font-preparation command, and one server-only example. Set a production secret before starting a per-response deployment:

```bash
export GLYPHSCRAMBLE_SECRET="$(openssl rand -base64 48)"
npx glyphscramble prepare
npx glyphscramble doctor
```

Keep source text in the server or static build boundary. Render only the returned `GlyphPayload`. Never copy plaintext into client props, hidden DOM, JSON-LD, OpenGraph, feeds, source maps, or error telemetry.

## Verify the result

Inspect the raw HTML or protected JSON and confirm the original sentence is absent. Then load the page with fonts enabled and confirm the intended text renders. Test font failure as well: the protected block must remain hidden and show only a generic error.

Continue with [Choose content](/docs/choose-content/) before broadening protection.
