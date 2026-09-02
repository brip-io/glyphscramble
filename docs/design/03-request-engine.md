# 03 · Request engine

Status: beta implementation. Response contexts use CSPRNG seeds and versioned AES-256-GCM tokens; the Fetch font route validates expiry and face identity, emits private immutable WOFF2 responses, and never stores plaintext. Remaining release gate: distributed cold-start and concurrent-stream stress tests.
