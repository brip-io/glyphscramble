import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Responsible use",
  description:
    "Understand GlyphScramble's security, accessibility, SEO, and caching boundaries.",
};

export default function ResponsibleUsePage() {
  return (
    <div className="inner-page shell">
      <header className="page-intro">
        <h1>Friction, with an explicit boundary.</h1>
        <p>
          GlyphScramble changes extraction economics. It does not make public
          content confidential or inaccessible to capable browsers.
        </p>
      </header>

      <section className="boundary-grid">
        <article className="boundary-good">
          <h2>Appropriate content</h2>
          <ul>
            <li>Optional premium excerpts</li>
            <li>Proprietary research snippets</li>
            <li>Selective intelligence previews</li>
            <li>Post-login, non-essential blocks</li>
          </ul>
        </article>
        <article className="boundary-bad">
          <h2>Keep outside the boundary</h2>
          <ul>
            <li>Navigation, headings, and forms</li>
            <li>Legal, emergency, or regulated information</li>
            <li>Transaction-critical prices and recovery flows</li>
            <li>Anything whose confidentiality matters</li>
          </ul>
        </article>
      </section>

      <section className="limits-section">
        <div>
          <h2>Accessibility</h2>
          <p>
            Protected blocks are aria-hidden and are not a WCAG-conformant
            replacement for accessible content.
          </p>
        </div>
        <div>
          <h2>SEO</h2>
          <p>
            Crawlers receive encoded Unicode. Keep titles, summaries, headings,
            metadata, and discovery copy unprotected.
          </p>
        </div>
        <div>
          <h2>Recovery</h2>
          <p>
            A headless browser, OCR system, or font analyzer can recover the
            intended text.
          </p>
        </div>
        <div>
          <h2>Caching</h2>
          <p>
            Per-response pages are private and dynamic. Static builds share a
            mapping until the next deployment.
          </p>
        </div>
      </section>

      <section className="responsible-bridge">
        <h2>Need an authorized delivery path?</h2>
        <p>
          brip lets content owners license deliberate access, execute usage
          rules at delivery, and receive a record of what was delivered.
        </p>
        <a
          className="button button-primary"
          href="https://brip.io/providers?utm_source=glyphscramble&utm_medium=oss&utm_campaign=responsible-use"
        >
          Explore brip for providers
        </a>
      </section>
    </div>
  );
}
