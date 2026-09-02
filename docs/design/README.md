# Delivery map

## Active release-readiness track

The initial beta scaffold below is a proof of concept, not a qualified public beta. The release-readiness review is tracked by the L-sized parent [`R00`](R00-release-readiness.md) and twelve independently mergeable child issues. Public npm release is blocked until R12 and counsel/IP approval.

| ID      | Issue / design                                                                        | Size | Priority | GitHub issue |
| ------- | ------------------------------------------------------------------------------------- | ---: | -------: | ------------ |
| **R00** | [Beta release-readiness remediation (parent)](R00-release-readiness.md)               |    L |       P0 | pending      |
| **R01** | [Runtime font-generation architecture](R01-runtime-font-generation.md)                |    M |       P0 | pending      |
| **R02** | [Static transform safety](R02-static-transform-safety.md)                             |    M |       P0 | pending      |
| **R03** | [Static delivery, caching, CSP, and accessibility](R03-static-delivery-a11y-cache.md) |    M |       P1 | pending      |
| **R04** | [Font-face resolution, coverage, and licensing](R04-font-face-pipeline.md)            |    M |       P1 | pending      |
| **R05** | [Request-engine lifecycle and abuse boundaries](R05-request-engine-lifecycle.md)      |    M |       P1 | pending      |
| **R06** | [Client payload and font-load lifecycle](R06-client-runtime-contract.md)              |    M |       P1 | pending      |
| **R07** | [React and Next 16 integration](R07-react-next.md)                                    |    M |       P1 | pending      |
| **R08** | [Vue 3 and Nuxt 4 integration](R08-vue-nuxt.md)                                       |    M |       P1 | pending      |
| **R09** | [Svelte 5 and SvelteKit 2 integration](R09-svelte-sveltekit.md)                       |    M |       P1 | pending      |
| **R10** | [Astro 7, Vite, and vanilla integration](R10-astro-vite-vanilla.md)                   |    M |       P1 | pending      |
| **R11** | [Binary and Unicode hardening](R11-binary-unicode-hardening.md)                       |    M |       P1 | pending      |
| **R12** | [Cross-browser qualification and release gates](R12-qualification-release.md)         |    M |       P0 | pending      |

```text
R04 ─┬─▶ R01 ─▶ R05 ─┬─▶ R07 ─┐
     │                ├─▶ R08 ─┤
R11 ─┘                ├─▶ R09 ─┤
                      └─▶ R10 ─┤
R06 ─┬────────────────▶ adapters ├─▶ R12
     └─▶ R03 ────────────────▶ R10
R02 ───▶ R03
```

See [`R00 issue filing`](R00-issue-filing.md) for the GitHub metadata and exact commands to run after `gh` authentication is restored.

## Initial scaffold milestones

The parent initiative is split into independently reviewable milestones. Each milestone must keep the public payload contract compatible and add a Changeset when it changes a published package.

1. Font pipeline
2. Unicode mapping engine
3. Request engine
4. Complex-script and performance qualification
5. React and Next
6. Vue and Nuxt
7. Svelte and SvelteKit
8. Astro, Vite, and vanilla/static
9. Demo, benchmarks, and BRIP funnel
10. Public release hardening

Dependency order was font pipeline → Unicode engine → request engine → qualification/adapters → demo/docs → release. The scaffold established package boundaries across all ten surfaces; the R00 track now owns the corrections and evidence required before those surfaces may be called supported.
