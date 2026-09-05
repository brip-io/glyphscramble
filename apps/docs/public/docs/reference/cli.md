# CLI

Initialize, prepare, inspect, diagnose, benchmark, and build static output.

Source: https://glyphscramble.brip.io/docs/reference/cli/

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
GlyphScramble by BRIP

Usage:
  glyphscramble init --mode response|static --font <file|https-url> --license-spdx <id> --license-file <path> --acknowledge-accessibility-risk [--framework next|nuxt|sveltekit|astro|vite] [--package-manager npm|pnpm|yarn|bun] [--yes] [--no-install] [--dry-run] [--json]
  glyphscramble prepare [--config <path>]
  glyphscramble inspect <font-file>
  glyphscramble doctor [--root src] [--static-output dist-protected] [--capacity] [--target-rps 10]
  glyphscramble benchmark [--config <path>] [--target-rps 10]
  glyphscramble static --input dist --output dist-protected [--public-base-path /] [--font-timeout-ms 8000] [--concurrency 8] [--existing-output replace|reject] [--config <path>]

GlyphScramble raises the cost of bulk DOM scraping. It is not DRM and does not
stop headless browsers, OCR, font analysis, plaintext APIs, feeds, or metadata.
```

## Automation

Use `init --dry-run` to preview a plan and `init --yes` only after supplying every safety decision as a flag. Non-interactive initialization never infers license approval or accessibility acknowledgement.

Use `--json` where supported for machine-readable results. Human diagnostics name the failing file, boundary, or code point and give a repair command without echoing protected source text.
