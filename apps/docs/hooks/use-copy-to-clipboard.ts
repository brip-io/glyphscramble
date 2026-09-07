"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ClipboardState {
  readonly copied: boolean;
  copy(value: string): Promise<void>;
}

/** Copies text and reports success briefly, clearing its timer on unmount. */
export function useCopyToClipboard(resetAfterMs = 1800): ClipboardState {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (value: string) => {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), resetAfterMs);
    },
    [resetAfterMs],
  );

  return { copied, copy };
}
