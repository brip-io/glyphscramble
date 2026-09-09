import {
  createElement,
  type ComponentPropsWithoutRef,
  type JSX,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  glyphStaticBoundaryAttributes,
  isGlyphStaticBoundaryElement,
  type GlyphStaticBoundaryElement,
} from "@brip/glyphscramble";

type BoundaryAttribute =
  | "children"
  | "dangerouslySetInnerHTML"
  | "data-glyphscramble-font"
  | "data-glyphscramble-source";

interface GlyphStaticBoundaryOwnProps<Tag extends GlyphStaticBoundaryElement> {
  /** One prepared font owns the complete non-hydrated subtree. */
  font: string;
  as?: Tag;
  children: ReactNode;
}

export type GlyphStaticBoundaryProps<
  Tag extends GlyphStaticBoundaryElement = "div",
> = GlyphStaticBoundaryOwnProps<Tag> &
  Omit<
    ComponentPropsWithoutRef<Tag>,
    BoundaryAttribute | keyof GlyphStaticBoundaryOwnProps<Tag>
  >;

/**
 * Marks descendants for the post-build static compiler. Import this server-only
 * surface from `@brip/glyphscramble-react/static`; never hydrate its output.
 */
export function GlyphStaticBoundary<
  Tag extends GlyphStaticBoundaryElement = "div",
>({
  font,
  as,
  children,
  ...attributes
}: GlyphStaticBoundaryProps<Tag>): ReactElement {
  const element = as ?? "div";
  if (!isGlyphStaticBoundaryElement(element))
    throw new TypeError(
      "GlyphStaticBoundary `as` must be a supported non-interactive intrinsic element.",
    );
  return createElement(
    element as keyof JSX.IntrinsicElements,
    { ...attributes, ...glyphStaticBoundaryAttributes(font) },
    children,
  );
}

export type { GlyphStaticBoundaryElement } from "@brip/glyphscramble";
