# Font sources and parser limits

GlyphScramble 0.1 accepts a local TTF, OTF, WOFF, or WOFF2 file; a direct HTTPS URL returning one of those containers; or an HTTPS CSS response containing one or more `@font-face` declarations. TTC collections are rejected. Remote resolution happens only during `glyphscramble prepare`, and the resulting normalized faces are locked locally for runtime use.

## Defaults

| Boundary                                    |    Default |
| ------------------------------------------- | ---------: |
| Remote response                             |      8 MiB |
| Remote hop timeout                          | 10 seconds |
| Whole remote operation                      | 30 seconds |
| Redirects                                   |          3 |
| Normalized parser hard input/output ceiling |     16 MiB |
| Normalized face policy threshold            |      2 MiB |
| Individual OpenType table                   |      8 MiB |
| OpenType tables                             |        128 |
| `cmap` encoding records                     |         64 |
| Format-12 groups                            |    100,000 |
| Decoded mappings                            |    250,000 |
| Payload coverage ranges                     |      1,024 |
| Bytes per payload coverage range            |         32 |

Set `remote.maxBytes`, `remote.timeoutMs`, `remote.totalTimeoutMs`, or `remote.maxRedirects` to make the transport policy stricter. `maxRedirects: 0` disables redirects. A normalized face above the 2 MiB policy threshold requires explicit coverage or `allowLargeFont: true`; `maxNormalizedBytes` changes that policy threshold but cannot raise the 16 MiB parser ceiling in 0.1. Prefer a licensed upstream subset over raising these limits.

## Remote-source policy

Remote URLs must remain HTTPS through every redirect and may not include credentials. GlyphScramble rejects literal or resolved loopback, private, link-local, multicast, documentation, benchmarking, and reserved IP ranges. Hostnames under `.localhost`, `.local`, `.internal`, and `.home.arpa` are denied as well.

The built-in transport pins a validated DNS answer to the actual connection. `remote.allowPrivateHosts: true` disables the destination restriction for a controlled build network. It should not be enabled in a build service that accepts untrusted configuration. If an application injects a custom `fetch` implementation, that transport is responsible for connection binding, resisting DNS rebinding, and honoring the supplied abort signal and stream cancellation.

CSS must return `text/css`. Direct font responses must use a recognized font media type (or `application/octet-stream`) and have matching SFNT, WOFF, or WOFF2 magic. Downloads are streamed and canceled immediately when the configured byte ceiling is exceeded, including when no `Content-Length` is present.

## Binary behavior

Preparation validates container headers, table-directory ordering and search fields, duplicate tags, aligned bounded ranges, overlap, per-table checksums, the SFNT whole-font checksum, required `head` state, and bounded WOFF decompression. `cmap` format 4, 12, and 14 parsing rejects malformed ordering, non-scalar ranges, invalid glyph IDs, and oversized collections.

The transformer preserves every table except `cmap` and the required `head.checkSumAdjustment`. It does not repair a malformed font. Format-12 selection follows a documented preference for Windows full-repertoire, Unicode full-repertoire, Windows BMP, then Unicode BMP records. A format-4 compatibility table is omitted if the complete BMP mapping cannot fit; it is never silently truncated.

Every configured font needs an SPDX license expression and a notice file. Those fields record the publisher's acknowledgement; GlyphScramble does not determine whether a font may legally be modified or redistributed.

## Repairing rejected fonts

`GlyphFontError` reports a stable rejection code, the configured `family.face`,
the underlying bounded parser reason, and this repair section. GlyphScramble
does not silently repair input because doing so would change publisher-provided
font bytes and could hide compatibility or licensing problems.

Work on a copy and retain the source license and notices. Use
[`ots-sanitize`](https://github.com/khaledhosny/ots) to validate/sanitize an
OpenType input, and use [fonttools](https://fonttools.readthedocs.io/) to inspect
or deliberately convert/subset it:

```bash
ots-sanitize copy-of-input.ttf
fonttools ttLib.woff2 decompress copy-of-input.woff2
pyftsubset copy-of-input.ttf --unicodes=U+0000-00FF --flavor=woff2 --output-file=subset.woff2
```

Then inspect and prepare the resulting copy again:

```bash
npm exec glyphscramble -- inspect subset.woff2
npm exec glyphscramble -- prepare
```

A repaired file is still untrusted input and must pass the same checks. Confirm
that subsetting preserves the scripts, variation axes, color tables, and layout
features your protected block needs. Confirm separately that the font license
permits modification and redistribution. TTC collections remain unsupported;
extract a licensed individual face rather than raising a parser limit.
