"use client";

import {
  type ComponentPropsWithoutRef,
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  type JSX,
  type ReactElement,
} from "react";
import {
  glyphPayloadIdentity,
  mountGlyphPayload,
} from "@brip/glyphscramble/runtime";
import type { GlyphPayload } from "@brip/glyphscramble";

const useBrowserLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

export const GLYPH_TEXT_ELEMENTS = [
  "article",
  "aside",
  "blockquote",
  "caption",
  "code",
  "dd",
  "div",
  "dt",
  "em",
  "figcaption",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "mark",
  "p",
  "pre",
  "q",
  "s",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "td",
  "th",
] as const satisfies readonly (keyof JSX.IntrinsicElements)[];

export type GlyphTextElement = (typeof GLYPH_TEXT_ELEMENTS)[number];

function resolveGlyphTextElement(value: unknown): GlyphTextElement {
  if (
    typeof value === "string" &&
    (GLYPH_TEXT_ELEMENTS as readonly string[]).includes(value)
  )
    return value as GlyphTextElement;
  throw new TypeError(
    "GlyphText `as` must be a supported intrinsic text container; custom components and void elements cannot own the required font lifecycle.",
  );
}

type GlyphLifecycleAttribute =
  | "aria-hidden"
  | "children"
  | "dangerouslySetInnerHTML"
  | "hidden"
  | "lang"
  | "ref";

interface GlyphTextOwnProps<Tag extends GlyphTextElement> {
  payload: GlyphPayload;
  as?: Tag;
  fontTimeoutMs?: number;
  errorText?: string;
  /**
   * GlyphText is payload-only. Use GlyphStaticBoundary for a safe subtree
   * once that compiler-backed API is available.
   */
  children?: never;
}

export type GlyphTextProps<Tag extends GlyphTextElement = "span"> =
  GlyphTextOwnProps<Tag> &
    Omit<
      ComponentPropsWithoutRef<Tag>,
      GlyphLifecycleAttribute | keyof GlyphTextOwnProps<Tag>
    >;

/** @deprecated Use GlyphText. The alias remains available throughout beta. */
export type GlyphScrambleProps<Tag extends GlyphTextElement = "span"> =
  GlyphTextProps<Tag>;

export function GlyphText<Tag extends GlyphTextElement = "span">({
  payload,
  as,
  fontTimeoutMs,
  errorText,
  ...props
}: GlyphTextProps<Tag>): ReactElement {
  const ref = useRef<HTMLElement>(null);
  const element = resolveGlyphTextElement(as ?? "span");
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
    element,
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

/** @deprecated Use GlyphText. The alias remains available throughout beta. */
export const GlyphScramble: typeof GlyphText = GlyphText;
