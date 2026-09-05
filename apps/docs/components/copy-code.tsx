"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

export function CopyCode({ value }: { value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1800);
  }

  return (
    <>
      <button className="code-copy" type="button" onClick={copy}>
        {state === "copied" ? (
          <CheckIcon aria-hidden="true" size={15} />
        ) : (
          <CopyIcon aria-hidden="true" size={15} />
        )}
        {state === "copied" ? "Copied" : state === "failed" ? "Retry" : "Copy"}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied"
          ? "Code copied to clipboard."
          : state === "failed"
            ? "Copy failed. Select the code and copy it manually."
            : ""}
      </span>
    </>
  );
}
