"use client";

import { ListIcon, XIcon } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DocsSearch } from "./docs-search";

export interface DocsNavGroup {
  label: string;
  pages: Array<{
    slug: string;
    title: string;
    status: "available" | "planned";
  }>;
}

function normalized(pathname: string): string {
  return pathname.replace(/^\/docs\/?/, "").replace(/\/$/, "");
}

export function DocsNav({
  groups,
  searchPath,
}: {
  groups: DocsNavGroup[];
  searchPath: string;
}) {
  const pathname = usePathname();
  const current = normalized(pathname);
  const mobileDialog = useRef<HTMLDialogElement>(null);
  const mobileOpener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const currentPage = groups
    .flatMap((group) => group.pages)
    .find((page) => page.slug === current);

  useEffect(() => {
    mobileDialog.current?.close();
    setOpen(false);
  }, [pathname]);

  function closeMobile({ restoreFocus = true } = {}) {
    mobileDialog.current?.close();
    setOpen(false);
    if (restoreFocus) mobileOpener.current?.focus();
  }

  function openMobile() {
    mobileDialog.current?.showModal();
    setOpen(true);
  }

  const tree = (suffix: string) => (
    <div className="docs-nav-tree">
      <a className={current === "" ? "is-current" : undefined} href="/docs/">
        Documentation home
      </a>
      {groups.map((group) => (
        <section
          key={group.label}
          aria-labelledby={`docs-group-${suffix}-${group.label.replace(/\s+/g, "-")}`}
        >
          <h2 id={`docs-group-${suffix}-${group.label.replace(/\s+/g, "-")}`}>
            {group.label}
          </h2>
          <ul>
            {group.pages.map((page) => (
              <li key={page.slug}>
                <a
                  className={current === page.slug ? "is-current" : undefined}
                  href={`/docs/${page.slug}/`}
                  aria-current={current === page.slug ? "page" : undefined}
                >
                  <span>{page.title}</span>
                  {page.status === "planned" ? <small>Planned</small> : null}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );

  return (
    <aside className="docs-nav" aria-label="Documentation navigation">
      <div className="docs-nav-tools">
        <DocsSearch searchPath={searchPath} />
        <button
          ref={mobileOpener}
          className="docs-mobile-toggle"
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls="docs-mobile-dialog"
          onClick={openMobile}
        >
          <span>{currentPage?.title ?? "Documentation"}</span>
          <ListIcon aria-hidden="true" size={17} />
        </button>
      </div>
      <dialog
        ref={mobileDialog}
        id="docs-mobile-dialog"
        className="docs-mobile-dialog"
        aria-labelledby="docs-mobile-title"
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          event.preventDefault();
          closeMobile();
        }}
      >
        <header>
          <h2 id="docs-mobile-title">Documentation</h2>
          <button
            type="button"
            onClick={() => closeMobile()}
            aria-label="Close navigation"
          >
            <XIcon aria-hidden="true" size={19} />
          </button>
        </header>
        <div className="docs-nav-scroll">{tree("mobile")}</div>
      </dialog>
      <div className="docs-desktop-tree">{tree("desktop")}</div>
    </aside>
  );
}
