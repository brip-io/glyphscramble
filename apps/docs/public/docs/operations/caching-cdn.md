# Caching and CDNs

Keep response-specific documents private and static build assets coherent.

Source: https://glyphscramble.brip.io/docs/operations/caching-cdn/

Caching policy follows mapping lifetime. A cache must never pair encoded text with a font from another response or build.

## Per-response mode

- Protected HTML, RSC, and JSON: `Cache-Control: private, no-store`
- Matching font: `Cache-Control: private, max-age=<remaining>, immutable`
- Both responses: `Vary: Cookie, Authorization` when application identity affects content
- Unprotected responses: retain the application's existing cache policy

Use adapter helpers that apply headers after observing `ResponseContext.used`. Creating an unused context is not a reason to disable caching.

For mostly static pages, isolate the protected block behind a small dynamic server boundary. Do not turn an entire public route dynamic when only one optional excerpt needs response rotation.

## Static mode

Generated fonts, CSS, JavaScript, and manifests use byte-derived names under one build identity. They may be cached publicly for one year with `immutable`. HTML must revalidate so it receives current asset references. The manifest should use `no-cache`.

Deploy one generated tree atomically. Never upload new HTML before its font assets or retain stale HTML that refers to removed build assets.

## Loader CDN

Only the dependency-free browser payload loader is documented for CDN use. Pin an exact package version and use the SRI value emitted as `dist/browser.sri.json`. The loader renders an existing payload; it does not create scrambling or replace a server/static boundary.

Do not use `latest`, an unversioned URL, or CDN imports for server core and framework adapters.
