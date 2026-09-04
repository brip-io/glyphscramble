"use client";

import {
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  type ElementType,
  type HTMLAttributes,
} from "react";
import {
  glyphPayloadIdentity,
  mountGlyphPayload,
} from "@brip/glyphscramble/runtime";
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
  errorText?: string;
}

export function GlyphScramble({
  payload,
  as = "span",
  fontTimeoutMs,
  errorText,
  ...props
}: GlyphScrambleProps) {
  const ref = useRef<HTMLElement>(null);
  const mountKey = glyphPayloadIdentity(payload);
  useBrowserLayoutEffect(() => {
    if (!ref.current) return;
    const mount = mountGlyphPayload(ref.current, payload, {
      ...(fontTimeoutMs === undefined ? {} : { timeoutMs: fontTimeoutMs }),
      ...(errorText === undefined ? {} : { errorText }),
    });
    return () => mount.destroy();
  }, [mountKey, fontTimeoutMs, errorText]);
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
