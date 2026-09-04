import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Install GlyphScramble and protect one appropriate content block.",
};

const frameworks = [
  ["Next.js", "Per response", "@brip/glyphscramble-next"],
  ["React", "Client renderer", "@brip/glyphscramble-react"],
  ["Astro", "SSR and static", "@brip/glyphscramble-astro"],
  ["Vue / Nuxt", "Per response", "@brip/glyphscramble-nuxt"],
  ["SvelteKit", "Per response", "@brip/glyphscramble-sveltekit"],
  ["Vite", "Server primitives and static", "@brip/glyphscramble-vite"],
] as const;

export default function DocsPage() {
  return (
    <div className="inner-page shell docs-layout">
      <aside className="docs-sidebar" aria-label="Documentation sections">
        <strong>Start</strong>
        <a href="#install">Install</a>
        <a href="#first-block">First block</a>
        <a href="#frameworks">Frameworks</a>
        <a href="/responsible-use/">Responsible use</a>
      </aside>
      <article className="docs-content">
        <header className="page-intro docs-intro">
          <h1>Protect one appropriate block.</h1>
          <p>
            Start with optional, high-value content. Keep discovery,
            accessibility, navigation, and transactions outside the boundary.
          </p>
        </header>

        <section id="install" className="doc-section">
          <h2>Install</h2>
          <pre>
            <code>
              pnpm add @brip/glyphscramble @brip/glyphscramble-next
              @brip/glyphscramble-react
            </code>
          </pre>
          <pre>
            <code>npx glyphscramble init{"\n"}npx glyphscramble prepare</code>
          </pre>
        </section>

        <section id="first-block" className="doc-section">
          <h2>Your first protected block</h2>
          <p>
            Create the payload in a Server Component so plaintext never crosses
            into client code.
          </p>
          <pre>
            <code>{`import { createGlyphPayload } from "@brip/glyphscramble-react/server";
import { GlyphScramble } from "@brip/glyphscramble-react";
import { glyphs } from "../glyphscramble.next";

export default function PremiumExcerpt({ copy }: { copy: string }) {
  const payload = createGlyphPayload(glyphs.beginResponse(), copy, {
    font: "body",
    lang: "en",
  });
  return <GlyphScramble payload={payload} />;
}`}</code>
          </pre>
        </section>

        <section id="frameworks" className="doc-section">
          <h2>Framework packages</h2>
          <div className="framework-list">
            {frameworks.map(([name, mode, packageName]) => (
              <div key={name}>
                <strong>{name}</strong>
                <span>{mode}</span>
                <code>{packageName}</code>
              </div>
            ))}
          </div>
        </section>

        <aside className="doc-callout">
          <strong>Beta boundary</strong>
          <p>
            GlyphScramble raises scraping cost. It is not DRM and must not hold
            essential, regulated, safety-critical, or accessibility-dependent
            content.
          </p>
          <a href="/responsible-use/">Read the responsible-use guide</a>
        </aside>
      </article>
    </div>
  );
}
