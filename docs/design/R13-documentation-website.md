# [R13] Developer documentation website

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Proposed · **GitHub issue:** [#28](https://github.com/brip-io/glyphscramble/issues/28)
> **Blocked by:** none; final framework quickstarts consume R03, R05-R10, and R15 · **Blocks:** R12 public beta

## Objective

Build a fast, public documentation website that lets a developer evaluate GlyphScramble, choose the correct delivery mode, complete an integration, and understand its limitations without creating an account or trusting marketing claims.

## Background

The repository currently has useful Markdown in `README.md` and `docs/`, but no coherent developer journey, site search, stable information architecture, agent-readable corpus, or automated contract tying published guidance to package exports and qualified behavior.

David's BRIP documentation work established the right maintenance discipline even though GlyphScramble needs a different implementation stack:

- one canonical ordered page registry drives sidebar navigation, reading order, sitemap coverage, and docs validation;
- public pages distinguish behavior that is available from behavior that is only planned;
- complete examples and error guidance are first-class content;
- every page has a source Markdown representation, edit link, and machine-readable discovery path;
- generated reference material reads canonical product constants instead of retyping them into prose.

For GlyphScramble, repository-authored Markdown/MDX is the natural source and a dedicated public site is justified. The site uses the Next.js App Router with static export, matching the main BRIP site's frontend conventions while retaining a deployment artifact that needs no server runtime. The site reuses BRIP's architectural lessons and copied, versioned visual tokens without importing the private BRIP application or coupling either deployment.

## Goals

- Give a developer a working path from first visit to protected high-value block.
- Explain per-response and static/per-build modes with their different security and caching properties.
- Make limitations around SEO, accessibility, caching, and recoverability impossible to miss.
- Publish docs in formats usable by humans, search engines, and coding agents.
- Keep navigation, examples, reference data, status labels, and release claims mechanically aligned with the repository.
- Preserve the community-first funnel: no signup wall, telemetry, hosted runtime dependency, or injected advertising.

## Non-goals

- Building a second marketing site or copying the main BRIP site wholesale.
- Publishing documentation for adapters that have not passed their qualification gates.
- Adding documentation versioning before a stable 1.x line needs multiple maintained versions.
- Building a CMS, authenticated portal, support forum, or runtime analytics pipeline.
- Claiming GlyphScramble stops AI scraping, headless browsers, OCR, or font analysis.
- Protecting the documentation site's own prose with GlyphScramble.

## Audience and jobs

The primary reader is a frontend or platform developer with roughly ninety seconds to decide whether the project fits. The secondary reader is a security, SEO, legal, or accessibility reviewer validating the trade-off. A coding agent is a supported reader of the same public material, not a separate hidden corpus.

The site MUST let those readers answer:

1. What does GlyphScramble do, and what does it not do?
2. Which content is appropriate to protect?
3. Should this deployment use per-response or per-build rotation?
4. What reaches the browser and what remains recoverable?
5. How do I install, configure, integrate, test, and operate it?
6. What happens to SEO, caches, accessibility, CSP, and failure behavior?
7. Which runtime/framework/version combinations are actually qualified?

## Information architecture

The initial public tree is deliberately task-oriented:

```text
/docs/
  get-started/
  choose-content/
  how-it-works/
  delivery/
    per-response/
    static/
  frameworks/
    fetch-node/
    react/
    next/
    vue/
    nuxt/
    svelte/
    sveltekit/
    astro/
    vite/
  reference/
    configuration/
    cli/
    glyph-payload/
    compatibility/
  operations/
    caching-cdn/
    csp-cors/
    troubleshooting/
  responsible-use/
    threat-model/
    accessibility/
    seo-discovery/
    fonts-licensing/
  release-notes/
/demo/
```

The landing page leads with an honest one-sentence claim, a runnable minimal example, mode chooser, support status, and the R14 conceptual demo. Framework choice comes after the delivery-mode and content-suitability decisions so a user cannot accidentally treat a static fallback as per-response rotation.

## Content contract

Every page has typed frontmatter:

```yaml
title: Static delivery
description: Build-time scrambling with a mapping that rotates on rebuild.
order: 20
status: available
mode: static
lastReviewedAgainst: 0.1.0-beta.1
```

Only two public status values are allowed:

- `available`: the documented path exists and its examples pass against packed packages;
- `planned`: a design contract, rendered with a persistent warning and excluded from quickstart and compatibility claims.

There is no vague `coming soon`, `experimental`, or `beta` page status. Package prerelease state is shown separately.

Every page MUST:

- use a unique canonical URL, title, description, and stable heading anchors;
- appear exactly once in the canonical ordered registry;
- render previous/next links from that order;
- provide `Copy as Markdown` and `Edit this page on GitHub` actions;
- expose an equivalent `.md` URL without navigation chrome;
- declare the package/version or qualification fact that supports any compatibility claim;
- use complete, copyable examples with no unexplained ellipses or fake secrets;
- link limitations at the decision point, not only in a remote threat-model page.

## Platform architecture

Create `apps/docs` as a private pnpm workspace package using the Next.js App Router and `output: "export"`. Update `pnpm-workspace.yaml` to include `apps/*`. The site builds to static files and has no required server runtime.

Repository Markdown/MDX under `apps/docs/content` is canonical public prose. Existing end-user documents are migrated rather than duplicated; `docs/design/` remains internal engineering material. A typed content schema validates frontmatter and a checked `docs-order.ts` registry defines the public sequence and grouping.

The registry is the single input for:

- desktop and mobile navigation;
- breadcrumbs and previous/next links;
- sitemap and canonical URL checks;
- `/llms.txt` page inventory and `/llms-full.txt` concatenation order;
- `.md` twin generation;
- claim/status validation;
- broken-link and orphan-page checks.

Next.js owns routing, rendering, metadata, and static export, while repository components own the accessible documentation shell and local search integration. A repository check owns completeness. No page can exist only in the filesystem or only in the navigation.

## Search and agent-readable output

Production builds create a local search index; search requires no hosted vendor or tracking. Keyboard access, focus restoration, current-page orientation, and mobile disclosure behavior are covered by browser tests.

Following the public conventions documented by [Fumadocs](https://www.fumadocs.dev/docs/integrations/llms), the build emits:

- `/llms.txt`, a compact ordered index with page descriptions;
- `/llms-full.txt`, the complete public corpus in canonical order;
- `/<page>.md`, the source-equivalent Markdown for each public page;
- a visible `Copy as Markdown` action.

Markdown responses use explicit content types and deterministic caching. If content negotiation is later added, caches MUST vary on `Accept`; the first release avoids that cache-key risk by using distinct `.md` paths.

## Reference and example integrity

Hand-copied API surfaces drift, so the docs build adds three checks:

1. Public-symbol references in frontmatter MUST resolve against each built package's exports and declaration files.
2. CLI reference output is generated from the built CLI's help/command metadata and compared to committed docs output.
3. Quickstart examples are real TypeScript fixture files included into MDX and compiled against `npm pack` tarballs for the relevant package.

The qualification manifest introduced by R12 supplies support statuses. A page cannot label a framework/version `available` unless a matching qualified consumer fixture exists. Planned pages remain useful design documentation but never enter install recommendations or the primary quickstart.

## Visual and interaction direction

The site uses the “GlyphScramble by BRIP” identity with an editorial developer-tool aesthetic: restrained ink/paper surfaces, strong monospace artifact labels, precise rules, and one functional accent. It may reuse design tokens and principles from the main BRIP site, but shares no runtime CSS or components across repositories.

Motion obeys the BRIP motion contract:

- motion communicates a product event rather than decorating empty space;
- the resting DOM is already complete and readable;
- reduced motion means no animation runs;
- animation does not shift layout;
- effects play once unless the user explicitly replays them;
- selectors bind narrowly to the element they animate.

The R14 demo is the one prominent animated surface. Routine documentation navigation remains still and fast.

## SEO, accessibility, and performance

- The public docs are indexable, server-rendered static HTML with canonical metadata, structured breadcrumbs, sitemap inclusion, and social metadata.
- Examples and diagrams use semantic HTML; essential meaning is never available only through color, hover, or motion.
- WCAG 2.2 AA keyboard, focus, contrast, zoom, and reduced-motion checks are release gates for the site itself.
- The docs clearly state that protected blocks are `aria-hidden`, should be non-essential/noindex, and are not a WCAG-conformant replacement for accessible content.
- Static pages target zero framework JavaScript by default. Only search, copy controls, and the demo may hydrate.
- Initial documentation pages target Lighthouse performance/accessibility/SEO scores of at least 95 in CI, zero unexpected layout shift, and a documented JavaScript budget. The demo is measured separately so it cannot hide site-shell regressions.

## Deployment, caching, and security

The recommended canonical host is `glyphscramble.brip.io`, subject to final DNS/deployment approval. Deployment is an atomic static artifact from the repository's default branch. Preview builds are `noindex`; only the canonical production host emits indexable metadata.

HTML and Markdown receive short revalidation caching. Content-addressed JS, CSS, fonts, and search indexes receive long immutable caching. A build identifier is exposed in a response header or small build manifest for support diagnostics, without collecting client data.

The site ships a strict CSP, no third-party scripts, no analytics by default, no cookies, and no remote font dependency. The only outbound product conversion is a clearly labelled documentation/demo link to `https://brip.io/providers` with GlyphScramble UTM attribution.

## Scope and deliverables

- `apps/docs` Next.js static-export application and repository workspace integration.
- Canonical public information architecture and migrated public Markdown/MDX.
- Search, deep links, breadcrumbs, previous/next, mobile navigation, copy, and edit actions.
- Per-page Markdown, `llms.txt`, and `llms-full.txt` outputs.
- Generated/checked CLI, package-export, compatibility, and example references.
- SEO metadata, sitemap, robots policy, CSP, cache policy, 404, and preview noindex behavior.
- Framework quickstarts, static/per-response decision guidance, and responsible-use material.
- Deployment workflow and documented ownership/review process.

## Testing strategy

- Unit tests validate content schemas, registry order, unique routes, status values, and generated references.
- Build tests crawl every internal link and heading fragment, prove every nav page is emitted, assert unknown routes return the production 404, and compare sitemap/Markdown/LLM inventories to the registry.
- Packed-package example fixtures compile on Node 22 and 24; framework examples run in their corresponding R07-R10 consumer fixtures.
- Playwright covers desktop and narrow mobile widths, keyboard-only search/navigation, focus restoration, copy behavior, reduced motion, high zoom, and no horizontal overflow in Chromium, Firefox, and WebKit.
- Automated accessibility checks and a manual screen-reader pass cover the docs shell and demo fallback narrative.
- CI enforces performance budgets, CSP/no-third-party requests, canonical/robots behavior, and zero broken public links.
- A terminology scan rejects “stops AI scraping” and requires the approved “raises the cost of bulk DOM scraping” boundary near security-sensitive claims.

## Rollout and observability

1. Land the shell, registry, validation, and core decision/threat-model pages behind preview `noindex`.
2. Add only quickstarts whose adapters are qualified; planned integrations remain visibly planned.
3. Integrate R14 and complete accessibility, browser, link, and performance review.
4. Enable the canonical host only after R12 accepts the docs qualification artifact.

The site records no new user events. Operational observability is build/deploy status, synthetic uptime, response headers, and privacy-preserving server/CDN request logs governed by the host's existing policy.

## Risks

- A custom documentation shell can drift from the main BRIP experience. Keep copied brand tokens versioned, preserve conventional documentation navigation, and test accessibility behavior directly.
- A generated full-corpus endpoint can become large. Emit deterministic text, compression, and a size gate; split by section later only if measured need justifies it.
- Premature versioning duplicates maintenance. As [Docusaurus notes](https://docusaurus.io/docs/versioning), versioned docs add complexity and are usually unnecessary when readers should use the latest release; defer until the first incompatible stable line is actually maintained.
- Public example prose can outrun implementation. Packed-package compilation and qualification-manifest checks fail closed.
- Search or the demo can inflate client JavaScript. Budget them independently and keep the content path useful without either.

## Dependencies

- R03 supplies the final static/per-build delivery contract.
- R05 and R06 supply the request and client lifecycle contracts.
- R07-R10 supply qualified framework examples and support statuses.
- R12 consumes the site's machine-readable qualification evidence and blocks public indexing/release until it passes.
- R14 supplies the reusable conceptual demo.
- R15 supplies the canonical onboarding flow, package-manager commands, compatibility rubric, and distribution policy.

## Open questions

- Confirm `glyphscramble.brip.io` versus GitHub Pages as the canonical host before deployment configuration lands.
- Decide whether localization is a post-1.0 requirement; the content model must allow locale segments without publishing empty locale navigation now.
- Decide whether release notes should be rendered from Changesets or a curated changelog once the first public package is released.

## Exit criteria

A fresh developer can select a safe content block, choose the correct mode, and run a qualified integration from the public site; every page, link, example, claim, Markdown/LLM artifact, SEO directive, accessibility check, and performance budget passes in CI; preview output remains noindex; and no runtime telemetry, hosted dependency, misleading protection claim, or unqualified framework recommendation ships.
