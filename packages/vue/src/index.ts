import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type HTMLAttributes,
  type PropType,
  type SlotsType,
} from "vue";
import {
  mountGlyphPayload,
  type GlyphMountHandle,
} from "@brip/glyphscramble/runtime";
import type { GlyphPayload } from "@brip/glyphscramble";

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
] as const;

export type GlyphTextElement = (typeof GLYPH_TEXT_ELEMENTS)[number];

function isGlyphTextElement(value: unknown): value is GlyphTextElement {
  return (
    typeof value === "string" &&
    (GLYPH_TEXT_ELEMENTS as readonly string[]).includes(value)
  );
}

const LIFECYCLE_ATTRIBUTES = new Set([
  "aria-hidden",
  "children",
  "hidden",
  "innerHTML",
  "lang",
  "textContent",
]);

function forwardedAttributes(
  attrs: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attrs).filter(([name]) => !LIFECYCLE_ATTRIBUTES.has(name)),
  );
}

type GlyphTextSlots = SlotsType<{ default?: never }>;

type GlyphLifecycleAttribute =
  "aria-hidden" | "children" | "hidden" | "innerHTML" | "lang" | "textContent";

export type GlyphTextProps = Omit<HTMLAttributes, GlyphLifecycleAttribute> & {
  payload: GlyphPayload;
  as?: GlyphTextElement;
  fontTimeoutMs?: number;
  errorText?: string;
  /** GlyphText is payload-only. Use GlyphStaticBoundary for safe subtrees. */
  children?: never;
};

export const GlyphText = defineComponent<
  GlyphTextProps,
  Record<never, never>,
  string,
  GlyphTextSlots
>(
  (props, { attrs, slots }) => {
    if (slots.default)
      throw new TypeError(
        "GlyphText is payload-only and does not accept children or slots. Use GlyphStaticBoundary for a compiler-validated subtree once available.",
      );
    const element = ref<HTMLElement>();
    let mount: GlyphMountHandle | undefined;
    onMounted(() => {
      if (element.value)
        mount = mountGlyphPayload(element.value, props.payload, {
          ...(props.fontTimeoutMs === undefined
            ? {}
            : { timeoutMs: props.fontTimeoutMs }),
          ...(props.errorText === undefined
            ? {}
            : { errorText: props.errorText }),
        });
    });
    watch(
      [() => props.payload, () => props.fontTimeoutMs, () => props.errorText],
      (
        [payload, timeoutMs, errorText],
        [, previousTimeoutMs, previousError],
      ) => {
        if (!mount || !element.value) return;
        if (timeoutMs !== previousTimeoutMs || errorText !== previousError) {
          mount.destroy();
          mount = mountGlyphPayload(element.value, payload, {
            ...(timeoutMs === undefined ? {} : { timeoutMs }),
            ...(errorText === undefined ? {} : { errorText }),
          });
        } else {
          void mount.update(payload);
        }
      },
    );
    onBeforeUnmount(() => mount?.destroy());
    return () => {
      const tag = props.as ?? "span";
      if (!isGlyphTextElement(tag))
        throw new TypeError(
          "GlyphText `as` must be a supported native text container; custom components and void elements cannot own the required font lifecycle.",
        );
      return h(
        tag,
        {
          ...forwardedAttributes(attrs),
          ref: element,
          hidden: true,
          "aria-hidden": "true",
          ...(props.payload.lang ? { lang: props.payload.lang } : {}),
        },
        props.payload.encodedText,
      );
    };
  },
  {
    name: "GlyphText",
    inheritAttrs: false,
    props: {
      payload: { type: Object as PropType<GlyphPayload>, required: true },
      as: {
        type: String as PropType<GlyphTextElement>,
        default: "span",
        validator: isGlyphTextElement,
      },
      fontTimeoutMs: { type: Number, required: false },
      errorText: { type: String, required: false },
    },
    slots: Object as GlyphTextSlots,
  },
);

/** @deprecated Use GlyphText. The alias remains available throughout beta. */
export const GlyphScramble: typeof GlyphText = GlyphText;
