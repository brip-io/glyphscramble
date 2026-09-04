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
    errorText: { type: String, required: false },
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
