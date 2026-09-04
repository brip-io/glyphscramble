import {
  mountGlyphPayload,
  type GlyphMountHandle,
} from "@brip/glyphscramble/runtime";
import type { GlyphPayload } from "@brip/glyphscramble";
import type { Action } from "svelte/action";

export interface GlyphActionOptions {
  payload: GlyphPayload;
  timeoutMs?: number;
  errorText?: string;
}

function actionOptions(
  value: GlyphPayload | GlyphActionOptions,
): GlyphActionOptions {
  return "payload" in value ? value : { payload: value };
}

export const glyphPayload: Action<
  HTMLElement,
  GlyphPayload | GlyphActionOptions
> = (node, value) => {
  const initial = actionOptions(value);
  let timeoutMs = initial.timeoutMs;
  let errorText = initial.errorText;
  let mount: GlyphMountHandle = mountGlyphPayload(node, initial.payload, {
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(errorText === undefined ? {} : { errorText }),
  });
  return {
    update(next) {
      const options = actionOptions(next);
      if (options.timeoutMs !== timeoutMs || options.errorText !== errorText) {
        mount.destroy();
        timeoutMs = options.timeoutMs;
        errorText = options.errorText;
        mount = mountGlyphPayload(node, options.payload, {
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
          ...(errorText === undefined ? {} : { errorText }),
        });
      } else {
        void mount.update(options.payload);
      }
    },
    destroy() {
      mount.destroy();
    },
  };
};
