<script lang="ts">
  import { glyphPayload } from "./action.js";
  import type { GlyphTextProps } from "./types.js";

  let { payload, fontTimeoutMs, errorText, ...attributes }: GlyphTextProps =
    $props();
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
