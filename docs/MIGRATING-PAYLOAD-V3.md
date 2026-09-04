# Migrating to payload v3

Payload v3 is a deliberate breaking wire change. Upgrade the core server and
every browser/framework adapter together; the runtime rejects v2 and v3 mixing
with an explicit version diagnostic.

The v3 payload removes three exact duplicates from every protected block:

- `fontToken`; the opaque token already appears inside `fontUrl`.
- `coverage.ranges`; the exact ranges already appear in
  `face.unicodeRange`, while `coverage` is now the 64-character identity.
- `rotation`; response-pool, per-response rotation is part of the v3 contract.

Custom renderers should read `payload.coverage` instead of
`payload.coverage.identity`, keep using `payload.fontUrl`, and stop inspecting
the token or rotation metadata. Treat the complete value as opaque whenever
possible and pass it to `mountGlyphPayload()`.

Response authorization also changes. One token is now issued once against the
prepared face set fixed by `beginResponse()`. The no-argument form uses every
configured prepared face, up to the token bounds. Routes with a large font
configuration or a known smaller scope should predeclare it:

```ts
const context = engine.beginResponse({
  faces: [{ font: "body", face: "regular" }],
});
```

A later attempt to scramble with an undeclared face fails closed; it never
reissues the token or invalidates an earlier URL.

`context.usage().authorizedFaces` now reports the fixed token scope after the
first payload is emitted. Use the new `usedFaces` field when diagnostics need
the smaller set actually referenced by blocks. Both arrays remain empty for an
unused context.
