---
title: CLI
description: Initialize, prepare, inspect, diagnose, benchmark, and build static output.
order: 320
status: available
group: Reference
mode: both
packages:
  - "@brip/glyphscramble"
symbols:
  - defineGlyphConfig
lastReviewedAgainst: 0.1.0-beta.0
---

The `glyphscramble` binary belongs to `@brip/glyphscramble`. Run it through your package manager so the command version matches the installed library.

## Command summary

| Command     | Purpose                                                                | Writes files       |
| ----------- | ---------------------------------------------------------------------- | ------------------ |
| `init`      | Detect a framework and preview safe scaffolding                        | After confirmation |
| `prepare`   | Resolve, inspect, validate, and lock configured fonts                  | Yes                |
| `inspect`   | Report face metadata and Unicode coverage                              | No                 |
| `doctor`    | Check config, assets, secrets, framework boundaries, and leakage risks | No                 |
| `benchmark` | Measure already-prepared runtime assets                                | No                 |
| `static`    | Produce an atomic protected static directory                           | Yes                |

`benchmark` never downloads or prepares fonts. This keeps measurements from hiding setup work or modifying the repository.

## Generated help

The following output is generated from the built CLI during the docs build. A drift check fails if the command surface changes without regenerating this page.

```text
{{CLI_HELP}}
```

## Automation

Use `init --dry-run` to preview a plan and `init --yes` only after supplying every safety decision as a flag. Non-interactive initialization never infers license approval or accessibility acknowledgement.

Use `--json` where supported for machine-readable results. Human diagnostics name the failing file, boundary, or code point and give a repair command without echoing protected source text.
