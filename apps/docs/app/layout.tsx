import "@fontsource-variable/instrument-sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BripLockup } from "../components/brip-lockup";
import { SiteHeader } from "../components/site-header";
import "./globals.css";

const title = "GlyphScramble by BRIP";
const description =
  "Raise the cost of bulk DOM scraping with response-specific glyph scrambling.";
const projectUrl = "https://glyphscramble.brip.io";

export const metadata: Metadata = {
  metadataBase: new URL("https://glyphscramble.brip.io"),
  title: { default: title, template: "%s | GlyphScramble" },
  description,
  openGraph: {
    type: "website",
    siteName: title,
    title,
    description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: "GlyphScramble by BRIP",
    codeRepository: "https://github.com/brip-io/glyphscramble",
    license: "https://www.apache.org/licenses/LICENSE-2.0",
    programmingLanguage: "TypeScript",
    url: projectUrl,
    description,
  };
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div>
            <a className="footer-product" href="/">
              GlyphScramble
            </a>
            <p>
              Open-source scraping friction from{" "}
              <a className="footer-maker" href="https://brip.io/">
                <BripLockup />
              </a>
            </p>
          </div>
          <div className="footer-links">
            <a href="/demo/">Demo</a>
            <a href="/docs/">Documentation</a>
            <a href="/responsible-use/">Responsible use</a>
            <a href="/privacy/">Privacy</a>
            <a href="https://github.com/brip-io/glyphscramble">GitHub</a>
            <a href="https://brip.io/providers?utm_source=glyphscramble&utm_medium=oss&utm_campaign=site-footer">
              When blocking becomes licensing
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
