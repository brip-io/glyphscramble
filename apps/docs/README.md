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

The `predev` script compiles the core package before generating four real public
demo fixtures: two isolated runtime responses and two static builds. The browser
visualization uses their actual encoded Unicode and generated WOFF2 files.

## Static output

```bash
pnpm --filter @brip/glyphscramble-demo... build
```

The dependency-inclusive filter builds the core package first, then generates
the demo fixtures and site without rebuilding core alongside its other
dependents. The deployable static artifact is written to `apps/docs/out`.

## Deployment

The site is a pure static export — `next.config.ts` sets `output: "export"`, so
the build emits plain files and needs no SSR runtime, adapter, or server code.
It is deployed with Cloudflare Pages using Cloudflare's Git integration, which
pulls from GitHub directly. That keeps a deploy credential out of this public
repository entirely: there is no `CLOUDFLARE_API_TOKEN` in the Actions secrets
and no wrangler workflow to leak one. Pages' Git integration also declines to
build pull requests from forks, so untrusted contributor code never runs in the
build environment.

Project settings, configured in the Cloudflare dashboard rather than committed
here:

| Setting          | Value                                             |
| ---------------- | ------------------------------------------------- |
| Root directory   | repository root (required for the pnpm workspace) |
| Build command    | `pnpm --filter @brip/glyphscramble-demo... build` |
| Output directory | `apps/docs/out`                                   |

Two things the repository does pin, because they are correctness rather than
infrastructure preference:

- `.node-version` at the repository root pins the build to Node 24, matching
  the CI leg that already validates this build. Cloudflare's build image
  updates its default Node minor version without notice, so an unpinned build
  can drift away from anything CI has tested.
- `public/_headers` is copied into `out/` by the export and read by Cloudflare.
  It fingerprint-caches `/_next/static/*`, adds baseline security headers, and
  marks `*.pages.dev` preview hosts `noindex` so they cannot compete with the
  production domain in search results — previews serve the same hardcoded
  canonical URLs and sitemap. It also deliberately holds `/demo-fixtures/*` at
  the revalidating default: those WOFF2 files have stable, unhashed names but
  changing bytes, and a stale font paired with freshly encoded text renders the
  demo as garbage.

Production DNS, Content-Security-Policy, and deployment credentials remain a
brip infrastructure decision and are intentionally not embedded in this
repository.
