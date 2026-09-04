# R00 GitHub issue filing manifest

> **Status:** Filed 2026-09-03 · **Repository:** [`brip-io/glyphscramble`](https://github.com/brip-io/glyphscramble) · **Milestone:** [Beta release readiness](https://github.com/brip-io/glyphscramble/milestone/1)

The complete release-readiness backlog has been filed. Do not rerun the original creation commands; issue links are canonical below and are backfilled into every design document and index row.

| ID  | GitHub issue                                              |
| --- | --------------------------------------------------------- |
| R00 | [#1](https://github.com/brip-io/glyphscramble/issues/1)   |
| R01 | [#2](https://github.com/brip-io/glyphscramble/issues/2)   |
| R02 | [#3](https://github.com/brip-io/glyphscramble/issues/3)   |
| R03 | [#4](https://github.com/brip-io/glyphscramble/issues/4)   |
| R04 | [#5](https://github.com/brip-io/glyphscramble/issues/5)   |
| R05 | [#6](https://github.com/brip-io/glyphscramble/issues/6)   |
| R06 | [#7](https://github.com/brip-io/glyphscramble/issues/7)   |
| R07 | [#8](https://github.com/brip-io/glyphscramble/issues/8)   |
| R08 | [#9](https://github.com/brip-io/glyphscramble/issues/9)   |
| R09 | [#10](https://github.com/brip-io/glyphscramble/issues/10) |
| R10 | [#11](https://github.com/brip-io/glyphscramble/issues/11) |
| R11 | [#12](https://github.com/brip-io/glyphscramble/issues/12) |
| R12 | [#13](https://github.com/brip-io/glyphscramble/issues/13) |
| R13 | [#28](https://github.com/brip-io/glyphscramble/issues/28) |
| R14 | [#29](https://github.com/brip-io/glyphscramble/issues/29) |
| R15 | [#31](https://github.com/brip-io/glyphscramble/issues/31) |
| R16 | [#33](https://github.com/brip-io/glyphscramble/issues/33) |
| R17 | [#34](https://github.com/brip-io/glyphscramble/issues/34) |
| R18 | [#35](https://github.com/brip-io/glyphscramble/issues/35) |
| R19 | [#36](https://github.com/brip-io/glyphscramble/issues/36) |
| R20 | [#37](https://github.com/brip-io/glyphscramble/issues/37) |

## Repository metadata

The milestone uses the repository labels `design`, `parent`, `priority:P0`, `priority:P1`, `size:M`, and `size:L`. R00 carries `parent`; every issue carries `design`, exactly one priority, exactly one size, and the beta-readiness milestone.

R01-R11 and R16-R20 are implemented. With the adapters complete, R15 can now consume their final contracts;
R13-R14 and R12 close public documentation, demo, and release qualification.

## Verification

```bash
gh issue list --repo brip-io/glyphscramble --milestone "Beta release readiness" --limit 20
rg -n "GitHub issue:\*\* pending|\| pending +\|" docs/design/R*.md docs/design/README.md
```

The final command must return no output.
