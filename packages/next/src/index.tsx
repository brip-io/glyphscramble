"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  GlyphScramble as ReactGlyphScramble,
  type GlyphScrambleProps,
} from "@brip/glyphscramble-react";

const REFRESH_SAFETY_MS = 250;

/**
 * Next-aware payload component. The core mount fails closed at expiry; this
 * wrapper refreshes the current RSC route just before then so back/forward
 * restoration cannot leave an expired mapping readable indefinitely.
 */
export function GlyphScramble(props: GlyphScrambleProps) {
  const router = useRouter();
  const { expiresAt } = props.payload;

  useEffect(() => {
    let refreshRequested = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshIfRequired = () => {
      if (
        refreshRequested ||
        Date.now() < expiresAt * 1_000 - REFRESH_SAFETY_MS
      )
        return;
      refreshRequested = true;
      router.refresh();
    };
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      const delay = Math.max(
        0,
        expiresAt * 1_000 - Date.now() - REFRESH_SAFETY_MS,
      );
      timer = setTimeout(refreshIfRequired, delay);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfRequired();
    };

    schedule();
    window.addEventListener("pageshow", refreshIfRequired);
    window.addEventListener("focus", refreshIfRequired);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("pageshow", refreshIfRequired);
      window.removeEventListener("focus", refreshIfRequired);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [expiresAt, router]);

  return <ReactGlyphScramble {...props} />;
}

export type { GlyphScrambleProps } from "@brip/glyphscramble-react";
