# Client payload and font lifecycle

The server returns a branded, data-only `GlyphPayload`. Version 2 contains the
encoded text, logical font ID, exact face descriptors, coverage identity,
same-origin font path, opaque response token, optional language, and optional
CSP nonce. It never contains plaintext or serialized CSS.

Treat the payload as untrusted after any JSON, RSC, HTML-attribute, or other
serialization boundary. `assertGlyphPayload(value)` rejects unknown fields,
legacy payload versions, malformed descriptors, mismatched coverage, unsafe or
cross-origin font URLs, inconsistent tokens and IDs, invalid Unicode scalar
text, invalid nonces, and payloads above 1 MiB. The built-in adapters all pass
their payload through this validation.

## Vanilla lifecycle

```ts
import { mountGlyphPayload } from "@brip/glyphscramble/runtime";

const mount = mountGlyphPayload(element, serializedPayload, {
  timeoutMs: 8_000,
});

await mount.ready; // "ready", "error", or "aborted"
await mount.update(nextSerializedPayload);
mount.destroy();
```

The runtime registers a `FontFace`, waits for the exact style, weight, stretch,
family, and representative encoded text, verifies that the registered face was
returned and applied, then reveals the block. Duplicate components using the
same immutable face share one load. `update()` aborts the superseded operation;
`destroy()` clears its timer and releases the face, style rule, and registry
entry after the final reference.

The element remains `aria-hidden="true"` in loading, ready, and error states.
Failure replaces encoded text with a generic visible message and never restores
plaintext. This behavior is intentionally not WCAG-conformant; use it only for
opted-in, non-essential, high-value blocks.

## Content Security Policy

Prefer the nonce mode. Pass the response's style nonce to `scramble()` as
`cspNonce`; the runtime generates a narrowly scoped style rule under that nonce
and never evaluates CSS from the payload. Its script should be bundled or served
from the application origin, and the generated font route is same-origin.

```ts
import { glyphCspDirectives } from "@brip/glyphscramble/runtime";

glyphCspDirectives(payload.cspNonce);
// {
//   "font-src": ["'self'"],
//   "style-src": ["'self'", "'nonce-…'"],
//   "style-src-elem": ["'self'", "'nonce-…'"],
//   "style-src-attr": ["'none'"],
//   "script-src": ["'self'"]
// }
```

Merge these sources into the application's existing policy; the helper does not
replace unrelated directives. Without a nonce the fallback applies face
descriptors through element styles and therefore requires
`style-src-attr 'unsafe-inline'`. A CSP hash is practical only for a fixed
external runtime bundle; per-response face rules vary and should use a nonce.
Astro's component uses a bundled external script rather than an inline loader.

The runtime has no telemetry, logging, hosted dependency, injected branding, or
network destination other than the validated same-origin `fontUrl` in the
payload.
