import {
  mountGlyphPayload,
  type GlyphMountHandle,
} from "@brip/glyphscramble/runtime";
import type { GlyphPayload } from "@brip/glyphscramble";

export interface GlyphActionOptions {
  payload: GlyphPayload;
  timeoutMs?: number;
}

function actionOptions(value: GlyphPayload | GlyphActionOptions) {
  return "payload" in value ? value : { payload: value };
}

export function glyphPayload(
  node: HTMLElement,
  value: GlyphPayload | GlyphActionOptions,
) {
  const initial = actionOptions(value);
  let timeoutMs = initial.timeoutMs;
  let mount: GlyphMountHandle = mountGlyphPayload(node, initial.payload, {
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  return {
    update(next: GlyphPayload | GlyphActionOptions) {
      const options = actionOptions(next);
      if (options.timeoutMs !== timeoutMs) {
        mount.destroy();
        timeoutMs = options.timeoutMs;
        mount = mountGlyphPayload(node, options.payload, {
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
        });
      } else {
        void mount.update(options.payload);
      }
    },
    destroy() {
      mount.destroy();
    },
  };
}
