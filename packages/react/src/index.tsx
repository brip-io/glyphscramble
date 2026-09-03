"use client";

import {
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  type ElementType,
  type HTMLAttributes,
} from "react";
import { mountGlyphPayload } from "@brip/glyphscramble/runtime";
import type { GlyphPayload } from "@brip/glyphscramble";

const useBrowserLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

export interface GlyphScrambleProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "children"
> {
  payload: GlyphPayload;
  as?: ElementType;
  fontTimeoutMs?: number;
}

export function GlyphScramble({
  payload,
  as = "span",
  fontTimeoutMs,
  ...props
}: GlyphScrambleProps) {
  const ref = useRef<HTMLElement>(null);
  useBrowserLayoutEffect(() => {
    if (!ref.current) return;
    const mount = mountGlyphPayload(ref.current, payload, {
      ...(fontTimeoutMs === undefined ? {} : { timeoutMs: fontTimeoutMs }),
    });
    return () => mount.destroy();
  }, [payload, fontTimeoutMs]);
  return createElement(
    as,
    {
      ...props,
      ref,
      hidden: true,
      "aria-hidden": true,
      ...(payload.lang ? { lang: payload.lang } : {}),
    },
    payload.encodedText,
  );
}
