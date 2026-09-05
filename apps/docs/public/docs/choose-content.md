# Choose content

Decide whether a content block is valuable enough to justify reduced discovery and accessibility.

Source: https://glyphscramble.brip.io/docs/choose-content/

Apply GlyphScramble mainly to high-value blocks, not whole pages. The right block remains optional when its font fails, does not carry a critical interaction, and can be described by ordinary surrounding HTML without revealing the protected text.

## Good candidates

- Premium article excerpts behind an explicit reader choice
- Proprietary tables or research snippets for signed-in users
- Optional analysis whose loss does not block navigation or a transaction
- Non-essential, normally noindex material with a visible acquisition path

## Keep these unprotected

- Page titles, primary headings, navigation, breadcrumbs, link labels, and search snippets
- Forms, buttons, validation messages, account recovery, and transaction-critical prices
- Legal notices, regulated disclosures, educational accommodations, and safety information
- Content whose confidentiality matters, because a browser can recover the mapping
- OpenGraph, JSON-LD, RSS, Atom, sitemaps, email, print, and APIs unless each channel has its own reviewed integration

## Trade-off matrix

| Concern            | Benefit                                          | Cost                                                         | Required response                                                                     |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Commodity scraping | Raw parsers receive encoded Unicode              | Browser-capable automation can recover it                    | Describe this as friction, not prevention                                             |
| SEO                | An unprotected summary can remain discoverable   | Protected words are not meaningful index terms               | Keep titles, descriptions, headings, links, and structured data ordinary              |
| Caching            | Static mode keeps global immutable asset caching | Per-response HTML, RSC, and JSON are private and dynamic     | Isolate a small dynamic boundary or choose per-build rotation                         |
| Accessibility      | No plaintext mirror leaks the protected text     | The protected block is `aria-hidden` and not WCAG-conformant | Protect only opted-in, non-essential content and offer an accessible acquisition path |
| Failure handling   | Fail-closed output avoids plaintext fallback     | A font, CSP, or route failure hides the block                | Show a visible generic status and test the failure path                               |

## A practical test

Ask four questions before marking a block:

1. Can the page still be understood and operated if this block never appears?
2. Can the title, summary, and internal links stay useful without repeating the protected copy?
3. Is reduced indexing acceptable for these exact words?
4. Has an accessibility or legal reviewer accepted the user impact?

If any answer is no, leave the block as ordinary HTML. GlyphScramble is a selective publishing control, not a default text renderer.
