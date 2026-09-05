# GlyphPayload

Understand the validated data-only wire type shared by every adapter.

Source: https://glyphscramble.brip.io/docs/reference/glyph-payload/

Every adapter consumes the same branded `GlyphPayload`. It contains encoded text and the information required to load one exact generated face. It never contains plaintext or executable CSS.

## Wire shape

```ts
interface GlyphPayload {
  readonly version: 3;
  readonly encodedText: string;
  readonly font: string;
  readonly fontUrl: string;
  readonly face: {
    readonly id: string;
    readonly family: string;
    readonly style: string;
    readonly weight: string;
    readonly stretch: string;
    readonly unicodeRange: readonly string[];
  };
  readonly coverage: string;
  readonly expiresAt: number;
  readonly lang?: string;
  readonly cspNonce?: string;
}
```

The token is carried only inside `fontUrl`. Coverage ranges exist only in `face.unicodeRange`; `coverage` is an immutable identity. The payload is capped at 1 MiB after serialization, and coverage has bounded range count and entry size.

## Vanilla browser lifecycle

```ts
import { mountGlyphPayload } from "@brip/glyphscramble/runtime";

const element = document.querySelector<HTMLElement>("[data-protected]");
if (!element) throw new Error("Protected element is missing.");

const mount = mountGlyphPayload(element, payload, {
  timeoutMs: 4000,
  errorText: "This protected excerpt could not be displayed.",
});

await mount.ready;
mount.destroy();
```

The runtime validates exact keys, same-origin root-relative URLs, descriptors, expiry, and size before touching the document. It reference-counts equivalent face loads, keeps the element hidden until the exact face succeeds, and removes failed or expired registrations.

Do not construct payload objects by hand. Create them through a response context or static compiler and treat the serialized contract as untrusted input in the browser.
