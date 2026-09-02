import { defineComponent, h, onMounted, ref, type PropType } from "vue";
import { revealGlyphPayload } from "@brip/glyphscramble/runtime";
import type { GlyphPayload } from "@brip/glyphscramble";

export const GlyphScramble = defineComponent({
  name: "GlyphScramble",
  props: {
    payload: { type: Object as PropType<GlyphPayload>, required: true },
    as: { type: String, default: "span" },
  },
  setup(props) {
    const element = ref<HTMLElement>();
    onMounted(() => {
      if (element.value) void revealGlyphPayload(element.value, props.payload);
    });
    return () =>
      h(
        props.as,
        { ref: element, hidden: true, "aria-hidden": "true" },
        props.payload.encodedText,
      );
  },
});
