"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  GlyphText as ReactGlyphText,
  type GlyphTextElement,
  type GlyphTextProps,
} from "@brip/glyphscramble-react";

const REFRESH_SAFETY_MS = 250;

/**
 * Next-aware payload component. The core mount fails closed at expiry; this
 * wrapper refreshes the current RSC route just before then so back/forward
 * restoration cannot leave an expired mapping readable indefinitely.
 */
export function GlyphText<Element extends GlyphTextElement = "span">(
  props: GlyphTextProps<Element>,
) {
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

  return <ReactGlyphText {...props} />;
}

/** @deprecated Use GlyphText. The alias remains available throughout beta. */
export const GlyphScramble: typeof GlyphText = GlyphText;

export type {
  GlyphTextElement,
  GlyphTextProps,
  GlyphScrambleProps,
} from "@brip/glyphscramble-react";
export type {
  GlyphConfig,
  GlyphPayload,
  GlyphResponseFace,
  ResponseContext,
} from "@brip/glyphscramble";
