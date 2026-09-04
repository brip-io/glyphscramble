<script lang="ts">
  import type { GlyphPayload } from "@brip/glyphscramble";
  import { glyphPayload } from "./action.js";
  import type { HTMLAttributes } from "svelte/elements";

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    payload: GlyphPayload;
    fontTimeoutMs?: number;
    errorText?: string;
  }

  let { payload, fontTimeoutMs, errorText, ...attributes }: Props = $props();
</script>

<span
  {...attributes}
  use:glyphPayload={{
    payload,
    ...(fontTimeoutMs === undefined ? {} : { timeoutMs: fontTimeoutMs }),
    ...(errorText === undefined ? {} : { errorText })
  }}
  lang={payload.lang}
  hidden
  aria-hidden="true">{payload.encodedText}</span
>
