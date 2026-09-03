# GlyphScramble public site

This private workspace package builds the public GlyphScramble product site,
interactive demo, and documentation. The canonical production host is planned
as `glyphscramble.brip.io`.

The site is owned by the public GlyphScramble repository. brip's main website
and editorial channels promote it and receive the commercial handoff when a
publisher is ready to move from scraping friction to licensed delivery.

## Local development

```bash
pnpm --filter @brip/glyphscramble-demo dev
```

The `predev` and `prebuild` scripts compile the core package and generate four
real public demo fixtures: two isolated runtime responses and two static builds.
The browser visualization uses their actual encoded Unicode and generated WOFF2
files.

## Static output

```bash
pnpm --filter @brip/glyphscramble-demo build
```

The deployable static artifact is written to `apps/docs/out`. Production DNS,
headers, CSP, cache rules, and deployment credentials remain a brip
infrastructure decision and are intentionally not embedded in this repository.
