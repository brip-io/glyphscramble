"use client";

import { GithubLogoIcon, ListIcon } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { BripLockup } from "./brip-lockup";

const links = [
  { href: "/", label: "Overview" },
  { href: "/demo/", label: "Demo" },
  { href: "/docs/", label: "Docs" },
  { href: "/responsible-use/", label: "Responsible use" },
] as const;

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href.replace(/\/$/, ""));
}

function NavigationLinks({ pathname }: { pathname: string }) {
  return links.map(({ href, label }) => (
    <a
      key={href}
      href={href}
      aria-current={isCurrent(pathname, href) ? "page" : undefined}
    >
      {label}
    </a>
  ));
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <div className="identity-lockup">
          <a
            className="product-wordmark"
            href="/"
            aria-label="GlyphScramble home"
          >
            GlyphScramble
          </a>
          <a className="maker-endorsement" href="https://brip.io/">
            <span>by</span>
            <BripLockup />
          </a>
        </div>

        <nav className="site-nav" aria-label="Primary navigation">
          <NavigationLinks pathname={pathname} />
        </nav>

        <a
          className="header-action"
          href="https://github.com/brip-io/glyphscramble"
        >
          <GithubLogoIcon aria-hidden="true" size={18} />
          GitHub
        </a>

        <details className="mobile-menu">
          <summary>
            <ListIcon aria-hidden="true" size={19} />
            Menu
          </summary>
          <nav aria-label="Mobile navigation">
            <NavigationLinks pathname={pathname} />
            <a href="https://github.com/brip-io/glyphscramble">
              <GithubLogoIcon aria-hidden="true" size={18} />
              GitHub
            </a>
            <a className="mobile-maker" href="https://brip.io/">
              <span>Made by</span>
              <BripLockup />
            </a>
          </nav>
        </details>
      </div>
    </header>
  );
}
