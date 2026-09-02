# Contributing

Use Node 22.12+ and pnpm. Run `pnpm install`, `pnpm check`, and `pnpm build` before opening a pull request. Add a Changeset for every published-package behavior change.

Commits must include a Developer Certificate of Origin sign-off:

```bash
git commit -s -m "Describe the change"
```

By signing off, you certify the [Developer Certificate of Origin 1.1](https://developercertificate.org/). Do not contribute fonts unless their license permits modification and redistribution; include the exact notice and SPDX expression in fixtures.

Security-sensitive changes to tokens, font parsing, Unicode grouping, CSP, or plaintext leakage require adversarial tests and two maintainers.
