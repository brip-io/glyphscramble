# [DX-INSTRUMENTATION] Package and component instrumentation experience

> **Size:** L · **Priority:** P1 · **Status:** Proposed (parent — tracks #79, #82, #78, #80, and #81) · **GitHub issue:** [#77](https://github.com/brip-io/glyphscramble/issues/77)
> **Owner:** BRIP Engineering · **Reviewers:** framework, runtime, security, accessibility, and developer experience

> **This is a parent project.** It is delivered through five independently mergeable child issues. This document owns the package model, public API, instrumentation boundary, and cross-cutting safety rules; each child owns its implementation and tests.

## Objective

Make GlyphScramble easy to install and apply to existing high-value presentation code without weakening its defining guarantee: protected plaintext is transformed before it reaches HTML, RSC, hydration data, browser JavaScript, or protected JSON.

The desired experience is a small, predictable package surface and, where technically honest, a component boundary that can protect descendant text from an existing presentational component.

## Background and current state

### Package inventory

The repository contains nine public packages at `0.1.0-beta.0`; none is available from npm as of 2026-09-07.

| Layer               | Packages                                                             | Current responsibility                                                                                                         |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Core                | `@brip/glyphscramble`                                                | Config, CLI, font preparation, request engine, static compiler, browser runtime, and Fetch/Node primitives                     |
| UI renderers        | `@brip/glyphscramble-react`, `-vue`, `-svelte`                       | Render a server-produced `GlyphPayload` and own font-load lifecycle                                                            |
| Full-stack adapters | `@brip/glyphscramble-next`, `-nuxt`, `-sveltekit`, `-astro`, `-vite` | Framework request context, font endpoint, cache integration, scaffolding, and framework-native renderer exposure where present |

The layering is sound, but the public installation contract is inconsistent:

- `packages/core/src/init.ts:819-829` installs core plus one detected platform adapter;
- SvelteKit examples import `@brip/glyphscramble-svelte` directly even though the initializer installs only core and `@brip/glyphscramble-sveltekit`;
- package-manager qualification installs all nine tarballs into one consumer (`scripts/test-package-manager-consumer.mjs:23-98`), masking missing direct dependencies and re-exports;
- every internal package dependency uses `workspace:^`, while `.changeset/config.json` has no fixed or linked group even though release preparation requires one coordinated version;
- beta-facing commands are handled by [DIST-INSTALL-DX](DIST-INSTALL-DX-channel-safe-onboarding.md), but it needs a final package/install matrix to generate correct commands;
- `docs/USAGE-GUIDE.md:154` still calls the current version-3 payload “v2”.

### Current component contract

The React, Vue, Svelte, and Astro `GlyphScramble` components are intentionally payload-only leaf renderers:

```tsx
const payload = await glyphs.scramble(copy, { font: "body", lang: "en" });
return <GlyphScramble payload={payload} />;
```

They render only `payload.encodedText`, keep it hidden while the exact response font loads, reveal it on success, and replace it with a generic error on failure. They never accept plaintext fallback content.

React explicitly omits `children` (`packages/react/src/index.tsx:20-28`), Vue exposes no slot (`packages/vue/src/index.ts:16-67`), Svelte renders a fixed span (`packages/svelte/src/GlyphScramble.svelte:6-25`), and Astro renders a single payload span (`packages/astro/src/GlyphScramble.astro:4-21`). Consequently, wrapping an existing component does not protect its internals today.

React's current `as?: ElementType` is too broad. A custom component may not forward the DOM ref, `hidden`, `aria-hidden`, or style properties required by `mountGlyphPayload()`, leaving an encoded block incorrectly visible or permanently hidden.

### Existing subtree instrumentation

Static mode already contains most of a safe descendant transformer. Authors mark an HTML element with `data-glyphscramble-font`; the compiler finds top-level marked blocks and recursively encodes descendant text nodes (`packages/core/src/static-output.ts:162-213`). The planner rejects scripts, templates, forms, links, interactive roles, text-bearing attributes, and known hydration boundaries (`packages/core/src/static-plan.ts:97-155`).

That capability is not yet presented as a framework component. It also applies the generated font only to the marked root. An existing component can override `font-family`, weight, style, or stretch on descendants and accidentally reveal scrambled glyphs or select an incompatible face. Arbitrary subtree wrapping therefore needs an explicit typography contract, not only JSX/Vue/Svelte syntax sugar.

## Problem statement

Developers naturally expect this to work:

```tsx
<GlyphBoundary font="body">
  <ExistingResearchCard />
</GlyphBoundary>
```

There is no universal implementation behind that syntax:

- A browser DOM walker is easy but useless for response-byte protection because plaintext has already reached the scraper.
- A normal React wrapper receives an opaque element, not the fully rendered descendants of nested components.
- Rewriting final HTML can protect non-hydrated output, but hydrated frameworks may also serialize plaintext into RSC, hydration state, client props, scripts, or APIs and may reject changed DOM during hydration.
- Different descendant faces can use different permutations today because response variant generation is namespaced per prepared face (`packages/core/src/variant-provider.ts:801-805`). A single automatic text encoding cannot safely follow unknown computed typography.
- Attributes, accessible names, metadata, event payloads, and application state are separate plaintext channels and cannot be repaired by changing visible text nodes.

The product must provide the convenient boundary only where it can prove these conditions, and fail closed everywhere else.

## Goals

- Establish one documented package and installation model across package managers and frameworks.
- Make core plus one platform adapter sufficient for every full-stack framework.
- Keep all release-coupled packages on an enforced compatible version set during beta.
- Preserve the payload-only renderer as the universal hydrated-framework primitive.
- Add a component-shaped boundary for existing static or server-rendered, non-hydrated presentation trees.
- Reuse one conservative HTML safety planner for static and per-response subtree instrumentation.
- Explore compiler instrumentation for source-owned server components without promising unsupported generic wrapping.
- Make mode, caching, SEO, accessibility, typography, and failure trade-offs visible in types, generated code, and documentation.

## Non-goals

- Client-side DOM mutation, Shadow DOM, CSS pseudo-content, canvas rendering, or any mechanism that receives plaintext before scrambling.
- Transparently protecting arbitrary Client Components, interactive controls, third-party components, or hydrated application subtrees.
- Protecting attributes, JSON-LD, OpenGraph, feeds, APIs, clipboard content, or accessibility mirrors merely because their visible element is inside a boundary.
- Preserving arbitrary mixed-font component styling in the first boundary release.
- Claiming that instrumentation prevents headless-browser, OCR, font-analysis, or authorized-reader recovery.
- Replacing the explicit high-value-block selection and accessibility-risk acknowledgement.

## Design principles

1. **Transform before delivery.** A convenience API may reduce boilerplate but cannot move scrambling into the browser.
2. **Mode is part of the name.** Static or inert boundaries must be visibly distinct from per-response payload renderers.
3. **Opaque means refuse.** An instrumenter that cannot inspect a component, data channel, or typography boundary fails instead of assuming safety.
4. **One package path per platform.** Full-stack users install core plus one adapter and import the adapter's renderer and types from that adapter.
5. **One source of install truth.** Generated commands, package readmes, diagnostics, docs, and release evidence consume the same channel-aware matrix.
6. **One parser policy.** Static build and server-response instrumentation share structural safety rules and diagnostic codes.
7. **No implicit accessibility mirror.** Protected visual text remains unavailable to assistive technology; boundary convenience does not change that limitation.

## Public package and installation contract

The recommended beta entry is the initializer; no package is installed first:

```bash
npx @brip/glyphscramble@beta init
```

Equivalent `pnpm dlx`, `yarn dlx`, and `bunx` commands come from DIST-INSTALL-DX. The initializer detects the platform and installs an exact compatible set:

| Application                                 | Direct application dependencies after initialization |
| ------------------------------------------- | ---------------------------------------------------- |
| Next                                        | core + `@brip/glyphscramble-next`                    |
| Nuxt                                        | core + `@brip/glyphscramble-nuxt`                    |
| SvelteKit                                   | core + `@brip/glyphscramble-sveltekit`               |
| Astro SSR                                   | core + `@brip/glyphscramble-astro`                   |
| Vite static                                 | core + `@brip/glyphscramble-vite`                    |
| Plain React, Vue, or Svelte                 | core + the corresponding UI renderer                 |
| Generic Node/Fetch or CLI-only static build | core only                                            |

Platform adapters re-export the renderer and shared public types developers use directly. They may depend internally on the UI renderer, but examples never ask an application to import an undeclared transitive dependency. The local core installation owns `glyphscramble prepare`, `doctor`, and `benchmark` after initialization.

During beta, all nine packages form one Changesets fixed group and internal runtime dependencies publish at the exact coordinated version. This deliberately favors compatibility and comprehensible support over independent patch releases. Stable independent versioning may be reconsidered only with a wire-compatibility matrix and release-tool changes.

## Public component model

### `GlyphText` — universal leaf renderer

`GlyphText` becomes the descriptive canonical name for the existing payload-only component. `GlyphScramble` remains a compatibility alias through beta unless a Changeset and migration decide otherwise.

```tsx
<GlyphText payload={payload} as="p" />
```

The component:

- accepts a branded `GlyphPayload`, never plaintext children;
- permits only framework-native intrinsic element names in `as`;
- exposes consistent `fontTimeoutMs` and `errorText` options;
- owns hidden/loading/ready/error lifecycle and cleanup;
- cannot be mistaken for a subtree instrumenter.

### `GlyphStaticBoundary` — existing-component wrapper

Static and non-hydrated framework output may use:

```tsx
<GlyphStaticBoundary font="body" as="section">
  <ExistingResearchCard />
</GlyphStaticBoundary>
```

The boundary itself does not mutate text. It emits the compiler marker and source metadata; the post-build compiler transforms final HTML before publication. It accepts children because plaintext remains inside the build input and never reaches the published tree.

The first release supports one prepared face for the complete subtree. Generated styles force the mapped family across descendants so local component CSS cannot select an ordinary font. The planner rejects inline font-family overrides, interactive/hydrated structures, text-bearing attributes, nested different-font boundaries, and unsupported content. Documentation states that mixed typography may be synthesized or flattened and must pass screenshot qualification.

### `GlyphResponseBoundary` — buffered inert SSR

For Astro SSR, generic Fetch/Node servers, and other complete non-hydrated HTML responses, a server adapter may expose the same authoring shape while transforming the final buffered response with a per-response mapping.

The response transformer:

1. buffers within an explicit byte and time ceiling;
2. parses and validates the complete HTML before issuing a payload or changing headers;
3. obtains one request-local variant and transforms all safe descendant text nodes;
4. injects only data needed for the matching font lifecycle;
5. applies `private, no-store` only after successful transformation;
6. returns a generic closed failure on overflow, unsafe content, font exhaustion, or transformation error.

Next RSC, Nuxt hydration, SvelteKit hydration, client-rendered Vite, and any response with a client island are excluded until a separate compiler design proves every plaintext channel and hydration invariant.

### Explicit structured content remains the hydrated path

Existing interactive components must continue to place payload renderers at protected fields:

```tsx
<ResearchCard
  title={<GlyphText payload={protectedFields.title} />}
  excerpt={<GlyphText payload={protectedFields.excerpt} />}
/>
```

A later `scrambleFields()` helper may preserve object keys and return same-shaped payloads, but it cannot infer which component props are presentation text or safe to hide.

## Instrumentation approaches considered

| Approach                                                        | Decision                                 | Reason                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Browser TreeWalker or MutationObserver                          | Rejected                                 | Plaintext already exists in response and hydration surfaces                                |
| Shadow DOM or CSS generated content                             | Rejected                                 | Changes presentation, not delivered bytes                                                  |
| Canvas/image rendering                                          | Rejected                                 | Loses semantics and selection while remaining OCR/headless recoverable                     |
| Calling a component manually or nested `renderToStaticMarkup()` | Rejected as general API                  | Breaks framework render context, async components, hooks, streaming, events, and hydration |
| Final HTML response transformation                              | Adopt for bounded non-hydrated responses | Sees final descendants and can change bytes before delivery                                |
| Post-build HTML transformation                                  | Adopt                                    | Already implemented conservatively in static mode                                          |
| Build/compiler transformation of source-owned server components | Research only                            | Potentially safe but framework-specific, graph-aware, and high maintenance                 |

## Cross-cutting requirements

1. Published or transmitted protected output MUST contain no source text in visible text, comments, attributes, scripts, framework data, source maps, or error content owned by the integration.
2. Payload renderers MUST reject plaintext children and custom component polymorphism that cannot guarantee a real DOM ref.
3. Boundary modes MUST reject hydration markers, interactive descendants, plaintext attributes, and unsupported fonts/content before output publication.
4. A boundary MUST NOT silently fall back to browser-time mutation, ordinary plaintext, a shared static mapping, or a different font.
5. Full-stack initializer output MUST install and import only declared direct dependencies at one coordinated version.
6. Beta internal package dependencies MUST resolve exactly, and Changesets MUST enforce the same release group expected by artifact preparation.
7. Static boundary assets retain content-addressed public caching; response boundaries make only the containing response private/no-store and retain token-bounded private font caching.
8. Every boundary remains `aria-hidden` and unsuitable for essential content. Surrounding headings, summaries, links, and SEO metadata stay ordinary HTML.
9. Generated diagnostics MUST identify the component/file/DOM path and unsafe reason without echoing protected text.
10. Compiler instrumentation, if pursued, MUST prove source ownership, server-only execution, component-graph closure, and every framework serialization path before becoming supported.

## Milestones and task breakdown

### Release A — Coherent install and explicit primitives

#### M1 · DX-PACKAGE-SURFACE · **M**

Enforce the two-package full-stack installation model, compatible lockstep beta versions, platform re-exports, and minimal packed-consumer tests.

**Exit criterion:** each framework builds from only its documented direct packages under npm, pnpm, Yarn, and Bun, and release tooling cannot create a mixed beta set.

#### M2 · DX-PAYLOAD-RENDERERS · **S**

Name and align the safe leaf renderer across React, Vue, Svelte, Astro, and platform adapters while closing misleading polymorphism.

**Exit criterion:** every adapter exposes the same payload-only `GlyphText` contract, rejects plaintext children at type/build time, and passes the shared lifecycle suite.

Existing [DIST-INSTALL-DX #68](https://github.com/brip-io/glyphscramble/issues/68) consumes M1's installation matrix and remains the owner of prerelease command generation and channel-safe docs.

### Release B — Honest existing-component boundaries

#### M3 · DX-STATIC-BOUNDARY · **M**

Expose the existing static descendant compiler through framework-native `GlyphStaticBoundary` components and close typography-cascade gaps.

**Exit criterion:** a non-hydrated existing component can be wrapped, published without plaintext, and rendered equivalently with one configured face; unsafe or typography-incompatible trees fail before publication.

#### M4 · DX-RESPONSE-BOUNDARY · **M**

Reuse the validated subtree planner in a bounded per-response HTML transformer for non-hydrated Astro and generic server output.

**Exit criterion:** two requests for the same wrapped server component emit different encoded bytes and tokens, render equivalently, and contain no source text or hydration path.

### Release C — Instrumentation research

#### M5 · DX-COMPILER-SPIKE · **M** · **Deferred**

Prototype source transforms for explicitly annotated, source-owned server component graphs and issue a go/no-go decision per framework.

**Exit criterion:** the spike either proves a bounded implementation with leakage and hydration tests or records a rejection with reproducible counterexamples; it does not create a support claim by itself.

### Dependency order

```text
DX-PACKAGE-SURFACE ──▶ DX-PAYLOAD-RENDERERS ──▶ DX-STATIC-BOUNDARY
          │                                             │
          └──▶ DIST-INSTALL-DX (#68)                    ├──▶ DX-RESPONSE-BOUNDARY
                                                        └──▶ DX-COMPILER-SPIKE (deferred)
```

Package topology precedes generated installation commands because the command generator must encode the final direct-dependency matrix. The payload renderer naming precedes boundary components so “text” and “subtree” cannot acquire conflicting APIs. Static boundary work precedes response instrumentation because both must use the same parser policy, typography rules, and diagnostics.

## Testing strategy

### Package and installation

- Replace the all-nine-package smoke as the decisive test with one minimal packed consumer per documented application shape and package manager.
- Run `init`, `prepare`, typecheck/build, `doctor`, and representative import tests from exact tarballs with no workspace links or undeclared packages available.
- Assert Changesets calculates one version for all nine release packages and packed internal dependencies use that exact version.
- Scan beta docs and generated diagnostics for unqualified or mixed-channel commands through DIST-INSTALL-DX.

### Payload renderers

- Shared type fixtures reject children, plaintext, arbitrary custom `as` components, and mismatched payload versions.
- Browser lifecycle tests cover loading, success, timeout, expiry, updates, remounts, cleanup, CSP nonce, and generic errors across adapters.
- Correct the v2/v3 documentation drift and compile every canonical example.

### Static and response boundaries

- Wrap real nested presentational components containing paragraphs, tables, combining marks, RTL content, emoji, nested styling, comments, and whitespace.
- Assert plaintext absence in final HTML, attributes, scripts, manifests, framework payloads, source maps, errors, and generated CSS.
- Reject links, forms, controls, client islands, known hydration markers, custom event attributes, plaintext attributes, nested different fonts, and descendant font-family overrides.
- Cross-browser screenshot comparison covers original versus scrambled output, one configured face, synthesized emphasis, vertical text where supported, failure state, and reduced motion.
- Rotation tests prove per-build reuse for static output and per-response variation for server output.
- Fuzz malformed HTML and deeply nested trees under explicit parse, byte, time, and memory ceilings.

### Compiler spike

- Use small representative component graphs with direct text, prop text, slots/children, async server components, third-party components, client boundaries, suspense/streaming, and generated metadata.
- Record every plaintext serialization point and require a closed build error for opaque or client-owned nodes.
- Measure transformed bundle/build cost and maintenance surface before any implementation recommendation.

## Performance budgets

- Payload-only rendering adds no new synchronous work beyond current validation and mount lifecycle.
- Static boundary planning remains within existing near-linear tree and bounded-I/O gates.
- Response instrumentation defaults to a 2 MiB buffer, configurable only up to the existing 16 MiB parser ceiling, and adds no more than 10 ms p95 excluding font-variant acquisition for a 100 KB HTML response on the qualification runner.
- Boundary transformation leases at most one response variant and reuses it across eligible nodes of the selected face.
- Compiler instrumentation, if accepted, adds less than 10% to representative production build time and zero client runtime code beyond the existing loader.

## SEO, caching, and accessibility

Convenience does not improve these trade-offs:

- Search engines receive encoded scalars. Keep titles, primary headings, canonical summaries, link context, OpenGraph, JSON-LD, and discovery copy unprotected.
- Static boundaries preserve public content-addressed caching but rotate only per build.
- Response boundaries make their containing response dynamic and `private, no-store`; isolate them behind a small server boundary where possible.
- Protected content remains `aria-hidden` and is not WCAG-conformant. Use only opted-in, non-essential high-value blocks and provide an accessible acquisition path outside the protected representation.
- Wrapping a large component can accidentally hide more content than intended, so `doctor` reports protected text-node counts, descendant element counts, interactive refusals, and SEO/a11y warnings.

## Rollout and compatibility

1. Ship M1 and M2 before npm bootstrap; update #68 to generate the resulting exact installation contract.
2. Preserve `GlyphScramble` as a deprecated or documented alias while examples move to `GlyphText`; do not silently change its payload-only meaning.
3. Introduce `GlyphStaticBoundary` behind explicit static-mode exports and qualify Astro plus one framework-neutral HTML fixture before adding convenience exports elsewhere.
4. Add `GlyphResponseBoundary` only to adapters that own the full non-hydrated HTML response and can enforce buffering limits.
5. Keep compiler instrumentation experimental and undocumented as supported until the spike's go/no-go review.

## Risks

- A convenient wrapper can imply protection of channels it cannot see. Names, compile-time refusals, `doctor`, and leakage tests must make the boundary explicit.
- Forcing a mapped font across descendants can flatten or synthesize component typography. Start with one face, expose the limitation, and require visual qualification.
- Lockstep packages create more version bumps. During beta this is less costly than cross-package protocol drift and ambiguous support.
- Response buffering can increase latency and memory. Bound it, preserve streaming elsewhere, and restrict support to small high-value blocks.
- Framework compiler hooks are unstable and expensive to maintain. Treat the spike as optional research, not a release promise.
- Existing R13/site work may touch examples concurrently. Generate documentation from shared contracts after those branches merge rather than copying prose into the site.

## Open questions

- Should the canonical leaf name be `GlyphText`, `ProtectedText`, or remain `GlyphScramble` with only a separate boundary name?
- Is single-face typography sufficient for the first subtree boundary, or must a family-level shared permutation across several faces precede it?
- Should response instrumentation accept only marked final HTML, or also a trusted HTML fragment API for CMS/Markdown renderers?
- Which non-hydrated server adapter beyond Astro and generic Fetch/Node has enough real demand to qualify in v0.1?
- After stable wire compatibility exists, should UI renderers regain independent versions or remain in one fixed release group?

## Child issue ledger

| Milestone | ID                                              | Size | Priority | GitHub issue                                              |
| --------- | ----------------------------------------------- | ---: | -------: | --------------------------------------------------------- |
| M1        | [DX-PACKAGE-SURFACE](DX-PACKAGE-SURFACE.md)     |    M |       P0 | [#79](https://github.com/brip-io/glyphscramble/issues/79) |
| M2        | [DX-PAYLOAD-RENDERERS](DX-PAYLOAD-RENDERERS.md) |    S |       P1 | [#82](https://github.com/brip-io/glyphscramble/issues/82) |
| M3        | [DX-STATIC-BOUNDARY](DX-STATIC-BOUNDARY.md)     |    M |       P1 | [#78](https://github.com/brip-io/glyphscramble/issues/78) |
| M4        | [DX-RESPONSE-BOUNDARY](DX-RESPONSE-BOUNDARY.md) |    M |       P1 | [#80](https://github.com/brip-io/glyphscramble/issues/80) |
| M5        | [DX-COMPILER-SPIKE](DX-COMPILER-SPIKE.md)       |    M |       P1 | [#81](https://github.com/brip-io/glyphscramble/issues/81) |

Each child carries its own design and issue. This parent holds architecture, decisions, and cross-cutting requirements; children hold bounded scope, deliverables, and tests.
