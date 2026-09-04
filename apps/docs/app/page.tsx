import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CodeIcon,
  EyeIcon,
  FilesIcon,
  ShuffleAngularIcon,
} from "@phosphor-icons/react/ssr";
import { BripLockup } from "../components/brip-lockup";
import { CopyCommand } from "../components/copy-command";
import fixtureData from "../src/generated/demo-fixtures.json";

const comparisonFixture = fixtureData.runtime.a;

export default function HomePage() {
  return (
    <>
      <style>{`@font-face{font-family:"${comparisonFixture.family}";src:url("${comparisonFixture.fontFile}") format("woff2");font-weight:400;font-style:normal;font-display:block;}`}</style>
      <section className="hero shell">
        <div className="hero-copy">
          <p className="maker-line">
            <span>Open source by</span>
            <BripLockup />
          </p>
          <h1>Make bulk DOM scraping cost more.</h1>
          <p className="hero-summary">
            Scramble response text, ship the matching font, and keep the limits
            explicit.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="/demo/">
              Explore demo
              <ArrowRightIcon aria-hidden="true" size={18} />
            </a>
            <a className="button button-secondary" href="/docs/">
              <BookOpenIcon aria-hidden="true" size={18} />
              Documentation
            </a>
          </div>
        </div>
      </section>

      <section className="section shell" id="how-it-works">
        <div className="section-heading">
          <h2>The response is wrong. The rendering is right.</h2>
          <p>
            GlyphScramble changes the Unicode a raw parser receives. The browser
            restores the intended glyphs with a matching WOFF2 font.
          </p>
        </div>
        <ol className="mechanism-list">
          <li>
            <span className="mechanism-icon" aria-hidden="true">
              <ShuffleAngularIcon size={25} />
            </span>
            <div>
              <h3>Scramble on the server</h3>
              <p>Plaintext stays behind the server boundary.</p>
            </div>
          </li>
          <li>
            <span className="mechanism-icon" aria-hidden="true">
              <FilesIcon size={25} />
            </span>
            <div>
              <h3>Emit two coordinated artifacts</h3>
              <p>Encoded text and its matching font travel separately.</p>
            </div>
          </li>
          <li>
            <span className="mechanism-icon" aria-hidden="true">
              <EyeIcon size={25} />
            </span>
            <div>
              <h3>Render, then state the limit</h3>
              <p>Humans read it. Browsers, OCR, and font analysis can too.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="comparison-section shell">
        <div className="section-heading comparison-heading">
          <h2>What a raw scraper gets. What a reader sees.</h2>
          <p>
            The same encoded text becomes readable only after the browser loads
            its matching generated font.
          </p>
        </div>
        <div className="landing-comparison">
          <article className="comparison-pane raw-pane">
            <p className="comparison-label">
              <CodeIcon aria-hidden="true" size={17} />
              Raw scraper receives
            </p>
            <code aria-label="Encoded Unicode sample">
              {comparisonFixture.encodedText}
            </code>
          </article>
          <article className="comparison-pane human-pane">
            <p className="comparison-label">
              <EyeIcon aria-hidden="true" size={17} />
              Human sees
            </p>
            <div
              className="comparison-render"
              style={{ fontFamily: `"${comparisonFixture.family}"` }}
              aria-hidden="true"
            >
              {comparisonFixture.encodedText}
            </div>
            <span className="sr-only">{fixtureData.sentence}</span>
          </article>
        </div>
        <div className="comparison-footer">
          <p>
            Browser-capable automation can still recover the text. This is
            friction, not DRM.
          </p>
          <a className="button button-primary" href="/demo/">
            View demo
            <ArrowRightIcon aria-hidden="true" size={18} />
          </a>
        </div>
      </section>

      <section className="section shell mode-section">
        <div className="mode-copy">
          <h2>Choose the friction that fits.</h2>
          <p>
            Per-response rotation increases isolation. Static builds preserve
            CDN delivery with a mapping shared until the next build.
          </p>
        </div>
        <div className="mode-comparison">
          <article>
            <p className="mode-title">Per response</p>
            <strong>Different mapping for every protected response.</strong>
            <p>Stateful runtime, one-use variants, private response caching.</p>
          </article>
          <article>
            <p className="mode-title">Static build</p>
            <strong>One mapping shared by an atomic deployment.</strong>
            <p>Immutable assets, CDN-friendly output, weaker resistance.</p>
          </article>
        </div>
      </section>

      <section className="section shell install-section">
        <div>
          <h2>Protect one appropriate block.</h2>
          <p>
            Keep headings, navigation, forms, legal text, and essential content
            ordinary HTML.
          </p>
        </div>
        <div className="install-action">
          <div className="install-command">
            <CopyCommand />
          </div>
          <a className="install-link" href="/docs/">
            Open the quickstart
            <ArrowRightIcon aria-hidden="true" size={17} />
          </a>
        </div>
      </section>

      <section className="brip-bridge">
        <div className="shell bridge-grid">
          <div>
            <p className="maker-line bridge-maker-line">
              <span>An open-source project from</span>
              <BripLockup />
            </p>
            <h2>Friction here. Permission when access is intentional.</h2>
          </div>
          <div className="bridge-copy">
            <p>
              GlyphScramble protects a public surface without pretending it is a
              vault. brip is the broader system for licensing deliberate access,
              applying usage rules, and keeping a delivery record.
            </p>
            <div className="bridge-actions">
              <a
                className="button button-light"
                href="https://brip.io/?utm_source=glyphscramble&utm_medium=oss&utm_campaign=project-bridge"
              >
                Visit brip
                <ArrowUpRightIcon aria-hidden="true" size={18} />
              </a>
              <a className="text-link-light" href="/responsible-use/">
                Understand the boundary
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
