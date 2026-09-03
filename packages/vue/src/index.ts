import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
} from "vue";
import {
  mountGlyphPayload,
  type GlyphMountHandle,
} from "@brip/glyphscramble/runtime";
import type { GlyphPayload } from "@brip/glyphscramble";

export const GlyphScramble = defineComponent({
  name: "GlyphScramble",
  props: {
    payload: { type: Object as PropType<GlyphPayload>, required: true },
    as: { type: String, default: "span" },
    fontTimeoutMs: { type: Number, required: false },
  },
  setup(props) {
    const element = ref<HTMLElement>();
    let mount: GlyphMountHandle | undefined;
    onMounted(() => {
      if (element.value)
        mount = mountGlyphPayload(element.value, props.payload, {
          ...(props.fontTimeoutMs === undefined
            ? {}
            : { timeoutMs: props.fontTimeoutMs }),
        });
    });
    watch(
      [() => props.payload, () => props.fontTimeoutMs],
      ([payload, timeoutMs], [, previousTimeoutMs]) => {
        if (!mount || !element.value) return;
        if (timeoutMs !== previousTimeoutMs) {
          mount.destroy();
          mount = mountGlyphPayload(element.value, payload, {
            ...(timeoutMs === undefined ? {} : { timeoutMs }),
          });
        } else {
          void mount.update(payload);
        }
      },
    );
    onBeforeUnmount(() => mount?.destroy());
    return () =>
      h(
        props.as,
        {
          ref: element,
          hidden: true,
          "aria-hidden": "true",
          ...(props.payload.lang ? { lang: props.payload.lang } : {}),
        },
        props.payload.encodedText,
      );
  },
});
