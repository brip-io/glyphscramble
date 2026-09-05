import {
  ArrowRightIcon,
  CodeIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { CopyCommand } from "../../components/copy-command";
import { getDocGroups } from "../../src/docs/content";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Choose a suitable content block and delivery mode, then integrate GlyphScramble with a supported framework.",
  alternates: { canonical: "/docs/" },
};

export default function DocsPage() {
  const groups = getDocGroups();
  return (
    <article className="docs-home">
      <header className="docs-home-hero">
        <p className="docs-kicker">Developer documentation</p>
        <h1>Protect the block, not the whole page.</h1>
        <p>
          Choose an appropriate content boundary, then add response-specific or
          per-build scraping friction without hiding the trade-offs.
        </p>
        <div className="docs-home-actions">
          <a className="button button-primary" href="/docs/get-started/">
            Get started
            <ArrowRightIcon aria-hidden="true" size={17} />
          </a>
          <a className="button button-secondary" href="/docs/choose-content/">
            Choose content first
          </a>
        </div>
      </header>

      <section className="docs-command" aria-labelledby="docs-command-title">
        <div>
          <CodeIcon aria-hidden="true" size={22} />
          <h2 id="docs-command-title">Initialize from your application root</h2>
          <p>
            The guided initializer detects the framework and installs one
            adapter.
          </p>
        </div>
        <CopyCommand commands={["npx @brip/glyphscramble init"]} />
      </section>

      <section className="docs-mode-choice" aria-labelledby="docs-mode-title">
        <div>
          <ShieldCheckIcon aria-hidden="true" size={24} />
          <h2 id="docs-mode-title">
            Choose the delivery model before the framework.
          </h2>
          <p>
            Rotation and cache behavior are deployment decisions, not UI-library
            details.
          </p>
        </div>
        <div className="docs-mode-links">
          <a href="/docs/delivery/per-response/">
            <strong>Per response</strong>
            <span>
              Fresh mapping, private dynamic document, stateful font service.
            </span>
            <ArrowRightIcon aria-hidden="true" size={17} />
          </a>
          <a href="/docs/delivery/static/">
            <strong>Static build</strong>
            <span>
              Per-build mapping, immutable assets, globally cacheable output.
            </span>
            <ArrowRightIcon aria-hidden="true" size={17} />
          </a>
        </div>
      </section>

      <section
        className="docs-directory"
        aria-labelledby="docs-directory-title"
      >
        <h2 id="docs-directory-title">Browse by task</h2>
        <div className="docs-directory-grid">
          {groups.map((group) => (
            <section key={group.label}>
              <h3>{group.label}</h3>
              <ul>
                {group.pages.map((page) => (
                  <li key={page.slug}>
                    <a href={`/docs/${page.slug}/`}>
                      <span>{page.title}</span>
                      <small>{page.description}</small>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </article>
  );
}
