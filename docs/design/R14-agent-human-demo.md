# [R14] Raw-agent and human-rendering conceptual demo

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Proposed · **GitHub issue:** [#29](https://github.com/brip-io/glyphscramble/issues/29)
> **Blocked by:** R03, R05, R06 · **Blocks:** R12 public beta · **Host:** R13 documentation website

## Objective

Create an accurate, polished, accessible animation that shows which artifacts GlyphScramble emits, what a raw-fetch/DOM scraping agent receives, what a human sees after the browser loads the matching font, how rotation changes responses, and where a browser-capable attacker can still recover the content.

## Background

Glyph scrambling is hard to understand from prose because the same response is intentionally wrong at the Unicode layer and correct at the rendered-glyph layer. A conventional before/after screenshot hides the important mechanism and invites an overclaim: it can imply that all agents are blocked even though headless browsers, OCR, and font analysis remain effective.

The demo must therefore teach a pipeline and an attack boundary, not merely animate scrambled letters. It will use actual GlyphScramble output generated during the docs build so filenames, payload shapes, codepoints, family names, font bytes, and rendered result remain grounded in the library.

## Goals

- Make the trusted server boundary and emitted artifacts understandable in under one minute.
- Let a reader inspect the raw encoded response and matching font/CSS rather than trusting a visual trick.
- Demonstrate per-response rotation and static per-build reuse distinctly.
- Show pixel-equivalent human output from different encoded byte sequences.
- State and demonstrate the recoverability boundary for browser-capable automation.
- Work as a rich animation, a reduced-motion diagram, a keyboard-operated explorer, and a screen-reader narrative.

## Non-goals

- Pretending the demo's public sample is secret or protected.
- Building an adversarial bypass toolkit or publishing production token secrets.
- Claiming every AI agent is limited to raw HTTP/DOM access.
- Adding canvas-only rendering, 3D effects, video, heavy animation libraries, or autoplay-dependent information.
- Accepting arbitrary visitor text or fonts in the first release.
- Turning the demo into a hosted GlyphScramble dependency or telemetry surface.

## Terminology and claim boundary

The primary comparison is labelled precisely:

- **Raw-fetch agent:** reads HTML/RSC/JSON response strings without loading the matching font; it sees scrambled Unicode scalars.
- **Human in a browser:** the browser applies the response-specific font `cmap`; the intended glyphs are visible.
- **Browser-capable agent:** loads the same font and rendered page, or analyzes font outlines; it can recover the content.

The headline claim is “raises the cost of bulk DOM scraping.” The demo MUST never label the raw-fetch result as what every agent sees, and the recovery step is part of the main sequence rather than a footnote.

## Conceptual model

```text
                         trusted server/build boundary
plain high-value text ──▶ safe Unicode permutation ──┬─▶ encoded HTML/RSC/JSON
                                                    ├─▶ matching WOFF2 cmap
                                                    └─▶ CSS + small load guard

raw-fetch agent ───────────────────────────────────────▶ scrambled scalars
human browser ───── encoded scalars + matching font ──▶ intended glyphs
browser/OCR/font analysis ─────────────────────────────▶ recoverable content
```

The diagram identifies the artifacts explicitly: protected payload, opaque token (runtime mode), generated family name, font URL/WOFF2, CSS/font-face rule, load guard, coverage, and cache policy. It distinguishes coordination cryptography from content secrecy: the encrypted token protects expiry and authorized face coordination, while the downloaded font necessarily contains the mapping needed to render.

## Storyboard

The default sequence lasts about 12-15 seconds and plays once when deliberately started or when it first enters view with motion enabled:

1. **Input.** One small, clearly labelled high-value content block enters a server/build boundary. Supporting SEO metadata, navigation, forms, and headings remain outside the protected lane.
2. **Permutation.** A mapping indicator shuffles property-compatible codepoints. The animation shows structure preserved, not arbitrary byte corruption.
3. **Artifacts.** The lane splits into an encoded response, content-addressed WOFF2, CSS/load guard, and a runtime token only on the per-response tab.
4. **Raw fetch.** A compact response inspector reveals the encoded Unicode string and confirms the original sentence is absent from the supported protected surface.
5. **Human render.** The response and font converge in a browser frame; `document.fonts` succeeds and the intended sentence becomes visible.
6. **Recovery boundary.** A browser-capable/OCR/font-analysis lane reaches the readable result with a higher-cost marker and the explicit “recoverable” label.

Motion is choreography of real events: artifacts travel along connectors, response bytes change, the font attaches, and the reveal state changes. There are no particles, decorative scrambling loops, or ambient effects unrelated to the mechanism.

## Interactive states

The demo provides controls above the visualization:

- `Per response` / `Static build` mode tabs.
- `Response A` / `Response B` comparison in runtime mode.
- `Raw response` / `Human render` / `Recovery boundary` view controls.
- Play, pause, replay, previous step, next step, and a labelled step scrubber.

Per-response A/B proves:

- the intended visual sentence is the same;
- encoded Unicode differs;
- token, family, and font identity differ;
- cache policy is `private, no-store` for protected pages and private immutable for the validated font response.

The static tab proves:

- the mapping and content-addressed assets remain stable across requests for one build;
- a rebuild rotates the build identifier and encoded artifacts;
- static mode is labelled per-build, never per-response;
- HTML can be cached normally as an atomic deployment only while matching hashed assets remain available.

## Real fixture generation

A docs build script imports packed `@brip/glyphscramble` artifacts and generates a public, deterministic demonstration fixture:

- two runtime-mode payload/font pairs representing independent responses;
- one static build and one rotated rebuild;
- manifest metadata, cache headers, and a redacted token display;
- raw response strings and the exact generated WOFF2 files used by the browser panel.

The fixture sentence is repository-owned, deliberately public, non-sensitive, ASCII-first for immediate comprehension, and accompanied by one qualified non-Latin sample after R12 fixtures are available. Its fixed demo seeds are test inputs, never production defaults, and are not presented as secret. Generated assets are rebuilt in CI and drift-checked against the current package.

The human panel renders the encoded string with the actual generated family. It does not swap in plaintext after a timer. A DOM assertion proves the intended plaintext is absent from that protected text node while a screenshot comparison proves the visual result.

## Component architecture

Implement the demo in `apps/docs` as a small framework component with a serializable fixture model and a finite state machine:

```ts
type DemoStep =
  | "input"
  | "permutation"
  | "artifacts"
  | "raw-agent"
  | "human-browser"
  | "recovery";
```

The state machine is independent of animation timing so tests, reduced-motion mode, keyboard navigation, and deep links can set an exact step. The primary diagram uses semantic HTML and inline SVG connectors; core meaning is never painted only to canvas. CSS transitions or the Web Animations API handle transforms/opacity within reserved boxes. No new animation runtime is required unless implementation evidence shows the native approach cannot meet the interaction contract.

The same component embeds in `/docs/` in compact form and `/docs/how-it-works/` or `/demo/` in its full inspectable form. The compact embed links to the full explorer rather than hiding advanced controls.

## Accessibility and reduced motion

- The complete explanation exists as an adjacent ordered text narrative and artifact table.
- With `prefers-reduced-motion: reduce`, no animation runs; the final diagram is visible immediately and step controls update synchronously.
- Playback never starts with audio, never loops, and can be paused at any point.
- Each control has a visible label, keyboard behavior, focus state, and programmatic current-state announcement.
- Step changes use a restrained polite live region; rapidly changing byte strings are not announced character-by-character.
- The raw encoded sample has a readable textual label and copy action but is excluded from meaningless pronunciation where appropriate.
- Color is redundant with shape, headings, lane labels, and artifact names.
- At 200% zoom and narrow mobile widths, lanes stack in reading order with no horizontal dependency.

## Performance and resilience

- Reserve the visualization's dimensions to prevent layout shift.
- Load its interactive JavaScript only near the demo; the static narrative and final diagram are server-rendered.
- Do not fetch third-party assets, contact BRIP services, or require a live font-generation endpoint.
- Content-addressed demo fonts may be immutable-cached; the document and fixture manifest follow the docs build cache policy.
- If JavaScript is blocked, the static final diagram, artifact table, honest claim, and human-render sample remain available.
- If the demonstration font fails, the protected sample stays hidden and a visible generic failure state appears; the page narrative remains readable.

## Scope and deliverables

- Demo fixture generator using packed library output.
- Responsive semantic pipeline visualization and finite-state playback controller.
- Per-response A/B and static/rebuild modes.
- Inspectable raw response, artifact graph/table, cache labels, and human rendering.
- Main-sequence recoverability explanation for browser-capable automation, OCR, and font analysis.
- Compact docs-home embed and full demo route.
- Reduced-motion, no-JS, font-failure, and narrow-screen fallbacks.
- A BRIP provider CTA after the limitation section, using GlyphScramble UTM attribution and no runtime branding or telemetry.

## Testing strategy

- Unit tests validate state transitions, fixture schema, redaction, mode-specific artifacts, and cache-policy labels.
- Build tests regenerate fixtures with the packed package and fail on drift, missing assets, unhashed filenames, or plaintext leakage in the protected raw surface.
- Rotation tests assert A and B have different encoded scalars, token/family/font identities, and the same intended source sentence; static requests reuse one build and a rotated rebuild differs.
- Browser tests in Chromium, Firefox, and WebKit assert the human rendering is pixel-equivalent to the source within reviewed tolerances and that the protected DOM text remains encoded.
- Failure tests cover disabled JavaScript, missing/corrupt WOFF2, CSP refusal, slow font load, unsupported codepoint, and stale/mixed fixture assets.
- Accessibility tests cover keyboard-only controls, focus order, live-region output, high zoom, screen-reader narrative order, forced colors, contrast, and zero running animations under reduced motion.
- Performance tests enforce zero unexpected CLS, a separately declared hydrated-JavaScript budget, and no third-party network requests.
- Wording tests reject universal “agent sees” or “stops AI scraping” claims unless the raw-fetch qualifier and recovery boundary are present in the same component.

## Rollout and observability

1. Ship fixture generation and a static, non-animated diagram in the R13 preview site.
2. Add deterministic step controls and animation behind the same semantic DOM.
3. Run three-browser visual, failure, reduced-motion, keyboard, and performance qualification.
4. Enable the compact landing-page embed only after the full demo passes; R12 consumes its artifacts before public beta.

The demo records no events. Build logs record fixture/package digests, and synthetic checks validate the public font and fixture assets after deployment.

## Risks

- A polished animation can accidentally make a stronger security claim than the library supports. The recovery lane and wording checks are mandatory.
- Swapping plaintext into the visual panel would create a fake demo. Browser tests assert the actual protected node remains encoded.
- Unicode codepoints may render as tofu without the generated font, leaking confusing failure output. The protected node starts hidden and fails closed while the surrounding explanation remains visible.
- Side-by-side lanes can become unreadable on mobile. The mobile layout changes to an ordered vertical sequence instead of shrinking the desktop graph.
- Public deterministic fixtures are trivially reversible. They are educational samples and are labelled as such.

## Dependencies

- R03 supplies static manifests, hashed assets, and fail-closed loader behavior.
- R05 supplies runtime token/cache semantics and R06 supplies the browser font-load lifecycle.
- R12 supplies the final qualified non-Latin fixtures and consumes demo correctness evidence.
- R13 supplies the host, visual tokens, navigation, CSP, cache policy, and site-level accessibility/performance checks.

## Open questions

- Choose the first non-Latin fixture from the R12-qualified matrix based on visual clarity and reliable cross-browser baselines.
- Confirm whether the full explorer canonical URL is `/demo/` or `/docs/how-it-works/demo/`; the compact embed and navigation registry must point to one canonical route.
- Set the final hydrated JavaScript byte budget after a native state-machine prototype, before animation polish.

## Exit criteria

A reader can inspect real generated artifacts and correctly explain the raw-fetch, human-rendering, and recovery paths; runtime A/B and static/rebuild behavior match the library; the protected visual node never contains plaintext; all motion, no-motion, no-JS, font-failure, mobile, accessibility, browser, claim, and performance gates pass; and the demo has no telemetry, hosted dependency, or misleading universal-agent claim.
