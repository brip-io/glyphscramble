"use client";

import { useState } from "react";
import type { GlyphPayload } from "@brip/glyphscramble";
import { GlyphScramble } from "@brip/glyphscramble-next";

export function ClonedPayload({ payload }: { payload: GlyphPayload }) {
  const [, setRenderCount] = useState(0);
  const clonedPayload: GlyphPayload = {
    ...payload,
    face: { ...payload.face, unicodeRange: [...payload.face.unicodeRange] },
  };

  return (
    <>
      <GlyphScramble
        className="protected"
        data-testid="protected-first"
        data-font-url={clonedPayload.fontUrl}
        errorText="Protected fixture unavailable."
        payload={clonedPayload}
      />
      <button
        data-testid="clone-rerender"
        onClick={() => setRenderCount((value) => value + 1)}
        type="button"
      >
        Rerender equivalent payload
      </button>
    </>
  );
}
