import type { GlyphPayload } from "@brip/glyphscramble";
import type { HTMLAttributes } from "svelte/elements";

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
