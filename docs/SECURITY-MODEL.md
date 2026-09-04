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

Each protected response consumes one CSPRNG-seeded font variant from a bounded pre-generation pool. The AES-256-GCM encrypted, versioned, expiring token carries a key ID, random seed, random variant ID, the bounded prepared face set declared before output, issuance/expiry times, and explicit `response-pool` mode. `beginResponse()` defaults to the configured prepared set; route code can predeclare a smaller set. Domain-separated active and previous keys support bounded zero-downtime rotation. Encryption prevents callers from minting arbitrary font work and coordinates the text/font pair. It does not make the content secret because the valid font contains a recoverable mapping.

The browser accepts only the compact data-only v3 payload contract. Runtime validation rejects serialized CSS, unknown fields, oversized values, malformed face descriptors, coverage identities or Unicode text, cross-origin/path-confused font URLs, and inconsistent face paths before registering a font. A shared reference-counted registry deduplicates exact face loads; its bounded zero-reference cache expires entries with their token and eagerly removes failed or abandoned work. The only runtime request is the validated same-origin font URL; there is no telemetry or content logging.

The font handler validates method, path encoding, token version/key/lifetime,
face authorization, and variant availability before provider lookup. Invalid
requests return controlled 4xx responses. `HEAD` reads only prepared bytes, and
successful font cache lifetime never exceeds the remaining token lifetime.

The encrypted token is a bearer coordination value, not a secret-content
boundary, and it appears in the font URL path. That path is visible in browser
developer tools and resource timing, can enter browser history when navigated
or copied, and is commonly captured by reverse-proxy, CDN, load-balancer,
application, tracing, and access logs. Redact the token path segment before
logging (for example, normalize `/_glyphscramble/font/<token>/<face>` to
`/_glyphscramble/font/[redacted]/<face>`), disable request-target capture for
the route where practical, and never attach full font URLs to errors or traces.
Keep protected documents `private, no-store`; cache successful fonts only as
the handler specifies (`private`, immutable, and no longer than the remaining
token lifetime). Do not promote these URLs into shared caches, analytics,
referrer-bearing links, or monitoring labels.

The variant bytes are process state and are retained only until token expiry. A process restart, request routed to the wrong instance, expired variant, generation timeout, full queue, or exhausted byte budget fails closed; the font endpoint never reconstructs the WOFF2 on its request path and never reassigns a consumed mapping. Deployments need affinity or a future external provider if documents and fonts can reach different instances. Metrics contain only counters, byte/queue gauges, and timings—never content, seeds, tokens, mappings, or variant ids.

The font pipeline preserves outline, variation, color, GSUB, and GPOS bytes and replaces `cmap` plus required `head` checksum state. WOFF2 uses the Google WOFF2 implementation compiled to WASM in bounded worker jobs before a response consumes the variant. TTC collections are rejected in 0.1.

Font preparation treats local and remote font bytes as untrusted. Remote fetches are HTTPS-only, validate every redirect, reject credentials and private/reserved destinations by default, pin validated DNS results to the built-in HTTPS connection, stream through a byte ceiling, and enforce both per-hop and total deadlines. MIME type and font magic must agree with the requested resource kind. `remote.allowPrivateHosts` is an explicit escape hatch for controlled build networks; enabling it removes the SSRF destination guard. An injected custom fetch transport owns DNS-to-connection binding and must honor the supplied abort signal and stream cancellation, so callers that supply one must enforce those boundaries themselves.

SFNT, WOFF, WOFF2 declarations, and `cmap` subtables are checked before their collections are expanded. The default parser ceilings are 16 MiB input/output, 8 MiB per table, 128 tables, 64 `cmap` encoding records, 100,000 format-12 groups, and 250,000 decoded mappings. Passing a larger configured normalized-font allowance is an informed opt-in, not evidence that an arbitrary font is safe.

Structural Unicode values stay unchanged. Permutation pools do not cross script, category, case, or BMP/astral width. Runtime classification and its exhaustive invariant use the pinned Unicode 17 property corpus; the manifest records the official segmentation and bidi fixtures that R12 must execute for release qualification. A missing safe value fails closed rather than returning plaintext.

Static transformation is a two-phase compiler over an untouched source tree,
not an in-place HTML rewrite. It refuses protected raw-text, template, comment,
attribute, interactive, and known hydrated boundaries before publication,
copies unmarked files byte-for-byte, and swaps a complete staged directory into
place. The static manifest records only hashes, paths, font IDs, algorithm/seed
identities, and warnings. This boundary does not inspect arbitrary client
bundles or prove an unknown framework is non-hydrated.

`pnpm qualify:font` runs the pinned OFL Inter variable-font smoke face through the binary round trip and reports HarfBuzz, OTS, and fontTools results as machine-readable JSON. A missing optional system tool is reported as `skipped`, never confused with a pass; the release qualification environment must provide the pinned toolchain.

Before public release, counsel must review the implementation and claims in light of related font-obfuscation filings, including US patent application 2024/0160832. Version 0.1 excludes glyph slicing, multi-font message encoding, identity watermarking, and geometry perturbation.
