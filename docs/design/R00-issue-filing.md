# R00 GitHub issue filing manifest

GitHub CLI authentication was unavailable when these designs were prepared. No partial issue set was created. Run the commands below from the repository root after `gh auth login -h github.com` succeeds.

## One-time labels and milestone

```bash
gh label create design --repo brip-io/glyphscramble --color 1D76DB --description "Issue has a repository design document" --force
gh label create parent --repo brip-io/glyphscramble --color 5319E7 --description "Tracks independently mergeable child issues" --force
gh label create priority:P0 --repo brip-io/glyphscramble --color B60205 --description "Release blocker" --force
gh label create priority:P1 --repo brip-io/glyphscramble --color D93F0B --description "Required for supported beta" --force
gh label create size:M --repo brip-io/glyphscramble --color FBCA04 --description "Approximately one independently mergeable week" --force
gh label create size:L --repo brip-io/glyphscramble --color E99695 --description "Parent initiative; must be decomposed" --force
gh api --method POST repos/brip-io/glyphscramble/milestones -f title='Beta release readiness' -f description='R00 remediation and qualification gate'
```

If the milestone already exists, omit the final command.

## Parent and children

```bash
gh issue create --repo brip-io/glyphscramble --title '[R00] Beta release-readiness remediation' --body-file docs/design/R00-release-readiness.md --label 'design,parent,priority:P0,size:L' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R01] Runtime font-generation architecture' --body-file docs/design/R01-runtime-font-generation.md --label 'design,priority:P0,size:M' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R02] Static transform safety' --body-file docs/design/R02-static-transform-safety.md --label 'design,priority:P0,size:M' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R03] Static delivery, caching, CSP, and accessibility' --body-file docs/design/R03-static-delivery-a11y-cache.md --label 'design,priority:P1,size:M' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R04] Font-face resolution, coverage, and licensing' --body-file docs/design/R04-font-face-pipeline.md --label 'design,priority:P1,size:M' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R05] Request-engine lifecycle and abuse boundaries' --body-file docs/design/R05-request-engine-lifecycle.md --label 'design,priority:P1,size:M' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R06] Client payload and font-load lifecycle' --body-file docs/design/R06-client-runtime-contract.md --label 'design,priority:P1,size:M' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R07] React and Next 16 integration' --body-file docs/design/R07-react-next.md --label 'design,priority:P1,size:M' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R08] Vue 3 and Nuxt 4 integration' --body-file docs/design/R08-vue-nuxt.md --label 'design,priority:P1,size:M' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R09] Svelte 5 and SvelteKit 2 integration' --body-file docs/design/R09-svelte-sveltekit.md --label 'design,priority:P1,size:M' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R10] Astro 7, Vite, and vanilla integration' --body-file docs/design/R10-astro-vite-vanilla.md --label 'design,priority:P1,size:M' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R11] Binary and Unicode hardening' --body-file docs/design/R11-binary-unicode-hardening.md --label 'design,priority:P1,size:M' --milestone 'Beta release readiness'
gh issue create --repo brip-io/glyphscramble --title '[R12] Cross-browser qualification and release gates' --body-file docs/design/R12-qualification-release.md --label 'design,priority:P0,size:M' --milestone 'Beta release readiness'
```

## Backfill

After creation:

1. Replace each design's `GitHub issue: pending` value and every `pending` row in `docs/design/README.md` and `R00-release-readiness.md` with its issue number/link.
2. Edit the R00 GitHub issue body from the backfilled parent file:

```bash
gh issue edit <R00-number> --repo brip-io/glyphscramble --body-file docs/design/R00-release-readiness.md
```

3. Verify every issue:

```bash
gh issue list --repo brip-io/glyphscramble --milestone 'Beta release readiness' --limit 20
rg -n 'GitHub issue: pending|\| pending \|' docs/design/R*.md
```

The final `rg` command must return no output after backfill.
