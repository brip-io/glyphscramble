import {
  ArrowLeftIcon,
  ArrowRightIcon,
  GithubLogoIcon,
} from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyMarkdown } from "../../../components/copy-markdown";
import { DocMarkdown } from "../../../components/doc-markdown";
import { getAdjacentDocs, getAllDocs, getDoc } from "../../../src/docs/content";

const SITE_URL = "https://glyphscramble.brip.io";

export function generateStaticParams() {
  return getAllDocs().map((page) => ({ slug: page.slug.split("/") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getDoc(slug.join("/"));
  if (!page) return {};
  const canonical = `/docs/${page.slug}/`;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical },
    openGraph: {
      title: page.title,
      description: page.description,
      url: canonical,
    },
  };
}

export default async function DocPageRoute({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const page = getDoc(slug.join("/"));
  if (!page) notFound();
  const adjacent = getAdjacentDocs(page.slug);
  const markdownHref = `/docs/${page.slug}.md`;
  const canonical = `${SITE_URL}/docs/${page.slug}/`;
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Documentation",
        item: `${SITE_URL}/docs/`,
      },
      { "@type": "ListItem", position: 2, name: page.title, item: canonical },
    ],
  };

  return (
    <div className="doc-page-grid">
      <article className="doc-article">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
        />
        <nav className="doc-breadcrumbs" aria-label="Breadcrumb">
          <a href="/docs/">Docs</a>
          <span aria-hidden="true">/</span>
          <span>{page.group}</span>
        </nav>
        <header className="doc-header">
          <div className="doc-status-row">
            <span className={`doc-status doc-status-${page.status}`}>
              {page.status === "available" ? "Available" : "Planned"}
            </span>
            {page.mode ? <span>{page.mode.replace("-", " ")}</span> : null}
          </div>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
          <div className="doc-tools">
            <CopyMarkdown href={markdownHref} />
            <a className="doc-tool" href={markdownHref}>
              View Markdown
            </a>
            <a
              className="doc-tool"
              href={`https://github.com/brip-io/glyphscramble/edit/main/apps/docs/content/${page.slug}.md`}
            >
              <GithubLogoIcon aria-hidden="true" size={15} />
              Edit this page
            </a>
          </div>
        </header>
        {page.status === "planned" ? (
          <aside className="doc-planned" role="note">
            This page describes an approved design, not a supported installation
            path. Planned pages are excluded from quickstart and compatibility
            claims.
          </aside>
        ) : null}
        <div className="doc-prose">
          <DocMarkdown markdown={page.markdown} />
        </div>
        <nav
          className="doc-pagination"
          aria-label="Documentation reading order"
        >
          {adjacent.previous ? (
            <a href={`/docs/${adjacent.previous.slug}/`}>
              <ArrowLeftIcon aria-hidden="true" size={17} />
              <span>
                <small>Previous</small>
                {adjacent.previous.title}
              </span>
            </a>
          ) : (
            <span />
          )}
          {adjacent.next ? (
            <a className="doc-next" href={`/docs/${adjacent.next.slug}/`}>
              <span>
                <small>Next</small>
                {adjacent.next.title}
              </span>
              <ArrowRightIcon aria-hidden="true" size={17} />
            </a>
          ) : null}
        </nav>
      </article>
      {page.headings.length ? (
        <aside className="doc-toc" aria-label="On this page">
          <strong>On this page</strong>
          <ul>
            {page.headings.map((heading) => (
              <li key={heading.id} className={`toc-depth-${heading.depth}`}>
                <a href={`#${heading.id}`}>{heading.text}</a>
              </li>
            ))}
          </ul>
          <a href={`${SITE_URL}${markdownHref}`}>Markdown source</a>
        </aside>
      ) : null}
    </div>
  );
}
