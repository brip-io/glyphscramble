import type { GlyphPayload } from "@brip/glyphscramble";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import type { GlyphStaticBoundaryElement } from "@brip/glyphscramble";

type GlyphLifecycleAttribute =
  | "aria-hidden"
  | "bind:innerHTML"
  | "bind:innerText"
  | "bind:textContent"
  | "children"
  | "contenteditable"
  | "hidden"
  | "lang";

export type GlyphTextProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  GlyphLifecycleAttribute
> & {
  payload: GlyphPayload;
  fontTimeoutMs?: number;
  errorText?: string;
  /** GlyphText is payload-only. Use GlyphStaticBoundary for safe subtrees. */
  children?: never;
};

/** @deprecated Use GlyphTextProps. */
export type GlyphScrambleProps = GlyphTextProps;

export type GlyphStaticBoundaryProps = Omit<
  HTMLAttributes<HTMLElement>,
  | "children"
  | "data-glyphscramble-font"
  | "data-glyphscramble-source"
  | "innerHTML"
  | "textContent"
> & {
  font: string;
  as?: GlyphStaticBoundaryElement;
  children: Snippet;
};
