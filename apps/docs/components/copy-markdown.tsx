"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

export function CopyMarkdown({ href }: { href: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      const response = await fetch(href, {
        headers: { Accept: "text/markdown" },
      });
      if (!response.ok)
        throw new Error(`Markdown request failed: ${response.status}`);
      await navigator.clipboard.writeText(await response.text());
      setState("copied");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1800);
  }

  return (
    <>
      <button className="doc-tool" type="button" onClick={copy}>
        {state === "copied" ? (
          <CheckIcon aria-hidden="true" size={15} />
        ) : (
          <CopyIcon aria-hidden="true" size={15} />
        )}
        {state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Try again"
            : "Copy as Markdown"}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied"
          ? "Page Markdown copied to clipboard."
          : state === "failed"
            ? "Copy failed. Open the Markdown version instead."
            : ""}
      </span>
    </>
  );
}
