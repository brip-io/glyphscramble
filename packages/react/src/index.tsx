"use client";

import {
  createElement,
  useEffect,
  useRef,
  type ElementType,
  type HTMLAttributes,
} from "react";
import { revealGlyphPayload } from "@brip/glyphscramble/runtime";
import type { GlyphPayload } from "@brip/glyphscramble";

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
  useEffect(() => {
    if (ref.current)
      void revealGlyphPayload(ref.current, payload, {
        ...(fontTimeoutMs === undefined ? {} : { timeoutMs: fontTimeoutMs }),
      });
  }, [payload, fontTimeoutMs]);
  return createElement(
    as,
    { ...props, ref, hidden: true, "aria-hidden": true },
    payload.encodedText,
  );
}
