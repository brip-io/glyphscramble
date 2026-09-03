import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How the GlyphScramble site handles technical request data without cookies or analytics.",
};

export default function PrivacyPage() {
  return (
    <div className="inner-page shell privacy-page">
      <header className="page-intro privacy-intro">
        <h1>Privacy, without the ceremony.</h1>
        <p>
          This site does not use cookies, analytics, advertising, forms, or
          browser storage. The only personal data involved is the ordinary
          technical information needed to deliver and secure a website.
        </p>
        <p className="privacy-updated">Last updated 4 September 2026</p>
      </header>

      <article className="privacy-content">
        <section>
          <h2>Who is responsible</h2>
          <p>
            brip is a Swiss company and the controller for the personal data
            described here. Email{" "}
            <a href="mailto:hello@brip.io">hello@brip.io</a> with a privacy
            question or rights request.
          </p>
        </section>

        <section>
          <h2>What is processed</h2>
          <p>
            Cloudflare hosts this static site. Serving a page creates an
            ordinary request log containing the IP address the request came
            from, the page requested, the time, and the browser string.
          </p>
          <p>
            GlyphScramble does not add cookies, local storage, session storage,
            tracking pixels, analytics scripts, advertising, or visitor
            profiles.
          </p>
        </section>

        <section>
          <h2>Why it is processed</h2>
          <p>
            Request information is used only to deliver the site, keep it
            reliable, and respond to abuse. The legal basis is brip&apos;s
            legitimate interest in operating a secure website that works.
          </p>
        </section>

        <section>
          <h2>Who sees it and where it goes</h2>
          <p>
            Cloudflare processes request information under brip&apos;s
            instructions and serves pages from the location nearest the reader.
            Where processing takes place outside Switzerland or the EEA,
            transfers rely on an adequacy decision or standard contractual
            clauses.
          </p>
          <p>
            If you choose a link to brip or GitHub, that destination receives
            your request and its own privacy terms apply.
          </p>
        </section>

        <section>
          <h2>How long it is kept</h2>
          <p>
            Ordinary request logs are retained for 30 days, then deleted. This
            site does not create a separate analytics history.
          </p>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>
            You can ask for access to your personal data, correction, deletion,
            restriction, portability where applicable, or object to processing.
            Write to <a href="mailto:hello@brip.io">hello@brip.io</a> and brip
            will respond within one month.
          </p>
          <p>
            You can also complain to the Federal Data Protection and Information
            Commissioner in Switzerland or the data protection authority in your
            country.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            If this site starts using analytics, cookies, forms, or another kind
            of data collection, this notice and the site&apos;s consent controls
            will be updated before that processing begins.
          </p>
          <p>
            The broader brip platform has a separate, more detailed{" "}
            <a href="https://brip.io/privacy">privacy policy</a>.
          </p>
        </section>
      </article>
    </div>
  );
}
