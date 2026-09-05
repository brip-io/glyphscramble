import type { ReactNode } from "react";
import { DocsNav, type DocsNavGroup } from "../../components/docs-nav";
import { docsSearchPath, getDocGroups } from "../../src/docs/content";

export default function DocsLayout({ children }: { children: ReactNode }) {
  const groups: DocsNavGroup[] = getDocGroups().map((group) => ({
    label: group.label,
    pages: group.pages.map(({ slug, title, status }) => ({
      slug,
      title,
      status,
    })),
  }));

  return (
    <div className="docs-shell shell">
      <DocsNav groups={groups} searchPath={docsSearchPath} />
      <div className="docs-stage">{children}</div>
    </div>
  );
}
