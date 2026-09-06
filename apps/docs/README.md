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

## Interactive demo encoding

The demo lets a visitor type their own text. That works without regenerating
anything because the prepared face covers all of `U+0020-007E` rather than just
the sample sentence, so every fixture WOFF2 already renders arbitrary printable
ASCII.

`generate-demo-fixtures.mjs` therefore emits each fixture's `encodeMap` — the
permutation as a plain character lookup — plus an `alphabet` block splitting the
coverage into the three outcomes the engine produces: permuted characters,
structural characters that pass through, and characters with no mapping at all.
The generator refuses to write a fixture whose lookup disagrees with the
engine's own `encodeText`, so the shipped tables cannot drift from the bytes
they explain.

`lib/glyph-encoding.ts` reimplements the per-character substitution for the
browser. It deliberately does not import the core package: `unicode.ts` pulls in
`node:crypto`, and the page needs no permutation generation, only the lookup.

**This is a demo-only concession.** A real response ships `encodedText`, the
font URL, and the coverage identity — `GlyphPayload` carries no mapping. The
page says so under the editor; keep that disclosure if you change the copy.

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
It is deployed as a Cloudflare Worker with static assets, using Cloudflare's
Git integration, which pulls from GitHub directly. That keeps a deploy
credential out of this public repository entirely: there is no
`CLOUDFLARE_API_TOKEN` in the Actions secrets and no GitHub Actions workflow to
leak one.

`wrangler.jsonc` sits at the repository root rather than beside the site here.
Workers Builds resolves the Worker name against the configuration file in the
build's root directory, and the build has to run from the root for the pnpm
workspace filter to resolve, so the two have to agree. It has no `main` entry
point, so no Worker script runs and no server-side code is deployed: Cloudflare
serves the `out/` export as static assets and nothing else. Workers Static Assets is
Cloudflare's recommended target for new projects; Pages remains supported but
no longer receives new features.

Project settings, configured in the Cloudflare dashboard rather than committed
here:

| Setting        | Value                                             |
| -------------- | ------------------------------------------------- |
| Root directory | repository root (required for the pnpm workspace) |
| Build command  | `pnpm build:site`                                 |
| Deploy command | `npx wrangler deploy` (the default)               |

Set the build variable `SKIP_DEPENDENCY_INSTALL=1` alongside them. Cloudflare
otherwise installs the whole workspace before the build command runs, which
pulls in Playwright and the Astro, Vite, Nuxt, SvelteKit, Vue, and Next
packages that the site never imports. `build:site` does its own filtered
install instead, so the deployment resolves only what `@brip/glyphscramble-demo`
and its dependencies need -- locally that is 380 installed package directories
rather than 1015.

Keeping the install inside a repository script rather than the dashboard means
it is versioned and reviewable with the rest of the build, and the dashboard
holds one short command.

The asset directory is set by `assets.directory` in `wrangler.jsonc` --
resolved relative to that file -- not as a dashboard output directory. The
`name` there must keep matching the Worker it deploys to, or `wrangler deploy`
silently creates a second Worker beside it.

If non-production branch builds are enabled, they use a separate **preview
deploy command**, defaulting to `npx wrangler versions upload`. It reads the
same root configuration file, so it needs no flag either.

### Connecting the repository

Creating the Worker and pointing its builds at _this_ repository are separate
steps, and only the second one makes pushes here build.

A Worker provisioned through the Deploy to Cloudflare flow does get a Git
connection, but not to this repository. That flow clones the source repository
into the operator's own GitHub account and wires Workers Builds to the clone, so
the build trigger watches `<operator>/glyphscramble`, not `brip-io/glyphscramble`.
Pushes here then produce no build at all -- not a failing one -- and the seed
build the flow runs at creation time cannot be retried. If that is the state,
the build settings in this repository are not what is wrong.

Fix it on the existing Worker rather than by deleting and recreating it:
**Settings > Builds** shows the connected repository, and reconnecting under
**Connect** rebinds it to `brip-io/glyphscramble` with `main` as the production
branch. Recreating the Worker through the deploy button instead just repeats the
clone. The Worker name in the dashboard has to match `name` in the root
`wrangler.jsonc` before the connection will succeed.

Builds trigger on push events, not on pull requests. A pull request against
`main` builds nothing by itself; merging it pushes to `main` and that is what
builds. To get preview builds and preview-URL comments on pull requests, enable
**Builds for non-production branches** under **Settings > Build > Branch
control** -- every push to a non-production branch then runs the build command
followed by the preview deploy command.

Two things the repository does pin, because they are correctness rather than
infrastructure preference:

- `.node-version` at the repository root pins the build to Node 24, matching
  the CI leg that already validates this build. Cloudflare's build image
  updates its default Node minor version without notice, so an unpinned build
  can drift away from anything CI has tested.
- `public/_headers` is copied into `out/` by the export and read by Cloudflare.
  It fingerprint-caches `/_next/static/*`, adds baseline security headers, and
  marks every `*.workers.dev` host `noindex` so it cannot compete with the
  production domain in search results — the workers.dev route and preview URLs
  both serve the same hardcoded canonical URLs and sitemap. It also deliberately holds `/demo-fixtures/*` at
  the revalidating default: those WOFF2 files have stable, unhashed names but
  changing bytes, and a stale font paired with freshly encoded text renders the
  demo as garbage.

Production DNS, Content-Security-Policy, and deployment credentials remain a
brip infrastructure decision and are intentionally not embedded in this
repository.
