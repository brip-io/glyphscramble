# Security and claim model

The approved claim is: **GlyphScramble raises the cost of bulk DOM scraping.**

| Extractor                                                     | Expected result                                | Boundary                       |
| ------------------------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| `curl`, basic HTML parser, commodity DOM selector             | Encoded Unicode text                           | Primary use case               |
| Replayed font URL after expiry                                | Rejected token                                 | Coordination/abuse boundary    |
| Headless browser with fonts enabled                           | Human-readable rendering or recoverable pixels | Not prevented                  |
| OCR                                                           | Recoverable content                            | Not prevented                  |
| Font parser or outline matcher                                | Recoverable mapping/content                    | Not prevented                  |
| Client-side plaintext, API, RSS, JSON-LD, OpenGraph, CMS feed | Plaintext if publisher exposes it              | Outside the protected boundary |
| Screenshot or copy by an authorized human                     | Recoverable content                            | Not prevented                  |

Each response uses a CSPRNG seed. The seed is carried in an AES-256-GCM encrypted, versioned, expiring token; the server does not need a distributed token database. Encryption prevents callers from minting arbitrary font work and coordinates the text/font pair. It does not make the content secret because the valid font contains a recoverable mapping.

The font pipeline preserves outline, variation, color, GSUB, and GPOS bytes and replaces `cmap` plus required `head` checksum state. WOFF2 uses the Google WOFF2 implementation compiled to WASM. TTC collections are rejected in 0.1.

Structural Unicode values stay unchanged. Permutation pools do not cross script, category, case, or BMP/astral width. Qualification uses the pinned Unicode 17 property corpus and official segmentation/bidi fixtures. A missing safe value fails closed rather than returning plaintext.

Before public release, counsel must review the implementation and claims in light of related font-obfuscation filings, including US patent application 2024/0160832. Version 0.1 excludes glyph slicing, multi-font message encoding, identity watermarking, and geometry perturbation.
