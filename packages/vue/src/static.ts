import {
  defineComponent,
  h,
  type HTMLAttributes,
  type PropType,
  type SlotsType,
  type VNodeArrayChildren,
} from "vue";
import {
  glyphStaticBoundaryAttributes,
  isGlyphStaticBoundaryElement,
  type GlyphStaticBoundaryElement,
} from "@brip/glyphscramble";

type BoundaryAttribute =
  | "children"
  | "data-glyphscramble-font"
  | "data-glyphscramble-source"
  | "innerHTML"
  | "textContent";

export type GlyphStaticBoundaryProps = Omit<
  HTMLAttributes,
  BoundaryAttribute
> & {
  font: string;
  as?: GlyphStaticBoundaryElement;
  children?: never;
};

type GlyphStaticBoundarySlots = SlotsType<{
  default: () => VNodeArrayChildren;
}>;

export const GlyphStaticBoundary = defineComponent<
  GlyphStaticBoundaryProps,
  Record<never, never>,
  string,
  GlyphStaticBoundarySlots
>(
  (props, { attrs, slots }) => {
    if (!slots.default)
      throw new TypeError("GlyphStaticBoundary requires a default slot.");
    return () => {
      const element = props.as ?? "div";
      if (!isGlyphStaticBoundaryElement(element))
        throw new TypeError(
          "GlyphStaticBoundary `as` must be a supported non-interactive native element.",
        );
      const forwarded = Object.fromEntries(
        Object.entries(attrs).filter(
          ([name]) =>
            ![
              "children",
              "data-glyphscramble-font",
              "data-glyphscramble-source",
              "innerHTML",
              "textContent",
            ].includes(name),
        ),
      );
      return h(
        element,
        { ...forwarded, ...glyphStaticBoundaryAttributes(props.font) },
        slots.default?.(),
      );
    };
  },
  {
    name: "GlyphStaticBoundary",
    inheritAttrs: false,
    props: {
      font: { type: String, required: true },
      as: {
        type: String as PropType<GlyphStaticBoundaryElement>,
        default: "div",
        validator: isGlyphStaticBoundaryElement,
      },
    },
    slots: Object as GlyphStaticBoundarySlots,
  },
);

export type { GlyphStaticBoundaryElement } from "@brip/glyphscramble";
