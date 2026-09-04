# Delivery map

## Active release-readiness track

The initial beta scaffold below is a proof of concept, not a qualified public beta. The release-readiness review is tracked by the L-sized parent [`R00`](R00-release-readiness.md) and twenty independently mergeable child issues. Public npm release is blocked until R12 and counsel/IP approval.

R01-R11 and R16-R20 are implemented. Issue state and
implementation evidence remain canonical in each linked design.

| ID      | Issue / design                                                                        | Size | Priority | GitHub issue                                              |
| ------- | ------------------------------------------------------------------------------------- | ---: | -------: | --------------------------------------------------------- |
| **R00** | [Beta release-readiness remediation (parent)](R00-release-readiness.md)               |    L |       P0 | [#1](https://github.com/brip-io/glyphscramble/issues/1)   |
| **R01** | [Runtime font-generation architecture](R01-runtime-font-generation.md)                |    M |       P0 | [#2](https://github.com/brip-io/glyphscramble/issues/2)   |
| **R02** | [Static transform safety](R02-static-transform-safety.md)                             |    M |       P0 | [#3](https://github.com/brip-io/glyphscramble/issues/3)   |
| **R03** | [Static delivery, caching, CSP, and accessibility](R03-static-delivery-a11y-cache.md) |    M |       P1 | [#4](https://github.com/brip-io/glyphscramble/issues/4)   |
| **R04** | [Font-face resolution, coverage, and licensing](R04-font-face-pipeline.md)            |    M |       P1 | [#5](https://github.com/brip-io/glyphscramble/issues/5)   |
| **R05** | [Request-engine lifecycle and abuse boundaries](R05-request-engine-lifecycle.md)      |    M |       P1 | [#6](https://github.com/brip-io/glyphscramble/issues/6)   |
| **R06** | [Client payload and font-load lifecycle](R06-client-runtime-contract.md)              |    M |       P1 | [#7](https://github.com/brip-io/glyphscramble/issues/7)   |
| **R07** | [React and Next 16 integration](R07-react-next.md)                                    |    M |       P1 | [#8](https://github.com/brip-io/glyphscramble/issues/8)   |
| **R08** | [Vue 3 and Nuxt 4 integration](R08-vue-nuxt.md)                                       |    M |       P1 | [#9](https://github.com/brip-io/glyphscramble/issues/9)   |
| **R09** | [Svelte 5 and SvelteKit 2 integration](R09-svelte-sveltekit.md)                       |    M |       P1 | [#10](https://github.com/brip-io/glyphscramble/issues/10) |
| **R10** | [Astro 7, Vite, and vanilla integration](R10-astro-vite-vanilla.md)                   |    M |       P1 | [#11](https://github.com/brip-io/glyphscramble/issues/11) |
| **R11** | [Binary and Unicode hardening](R11-binary-unicode-hardening.md)                       |    M |       P1 | [#12](https://github.com/brip-io/glyphscramble/issues/12) |
| **R12** | [Cross-browser qualification and release gates](R12-qualification-release.md)         |    M |       P0 | [#13](https://github.com/brip-io/glyphscramble/issues/13) |
| **R13** | [Developer documentation website](R13-documentation-website.md)                       |    M |       P1 | [#28](https://github.com/brip-io/glyphscramble/issues/28) |
| **R14** | [Raw-agent and human-rendering conceptual demo](R14-agent-human-demo.md)              |    M |       P1 | [#29](https://github.com/brip-io/glyphscramble/issues/29) |
| **R15** | [Developer experience and distribution](R15-developer-experience-distribution.md)     |    M |       P1 | [#31](https://github.com/brip-io/glyphscramble/issues/31) |
| **R16** | [Permutation and request-path efficiency](R16-permutation-request-path.md)            |    M |       P0 | [#33](https://github.com/brip-io/glyphscramble/issues/33) |
| **R17** | [Runtime capacity, lifecycle, and observability](R17-runtime-capacity-lifecycle.md)   |    M |       P0 | [#34](https://github.com/brip-io/glyphscramble/issues/34) |
| **R18** | [Multi-face payload and client efficiency](R18-multiface-payload-efficiency.md)       |    M |       P1 | [#35](https://github.com/brip-io/glyphscramble/issues/35) |
| **R19** | [Static compiler scale and diagnostics](R19-static-scale-diagnostics.md)              |    M |       P1 | [#36](https://github.com/brip-io/glyphscramble/issues/36) |
| **R20** | [Core contract and operator hardening](R20-core-operator-hardening.md)                |    M |       P1 | [#37](https://github.com/brip-io/glyphscramble/issues/37) |

```text
R04 ─▶ R11 ─▶ R01 ─▶ R05 ─┬─▶ R07 ─┐
                           ├─▶ R08 ─┤
                           ├─▶ R09 ─┤
                           └─▶ R10 ─┤
R06 ─┬────────────────▶ adapters ├─▶ R13 ─┐
     ├─▶ R03 ────────────────▶ R10       ├─▶ R12
     └────────────────────────▶ R14 ──────┘
R02 ───▶ R03
R03/R05 ───────────────────────▶ R14
R07-R10 ───────────────────────▶ R15 ─▶ R13/R12
R11 ─▶ R16 ─▶ R17 ────────────────▶ R12
R06/R16 ─▶ R18 ───────────────────▶ R12
R02/R03 ─▶ R19 ───────────────────▶ R12
R04-R06/R11 ─▶ R20 ───────────────▶ R12
```

See [`R00 issue filing`](R00-issue-filing.md) for the GitHub metadata and exact commands to run after `gh` authentication is restored.

The complete disposition of the 2026-09-03 repository review is recorded in [`R00 review triage`](R00-review-triage-2026-09-03.md); every numbered finding is fixed, assigned to an open designed issue, or rejected with evidence.

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
