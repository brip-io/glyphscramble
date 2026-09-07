"use client";

import { useCallback, useMemo, useState } from "react";
import { demoData, passthroughCharacters } from "../lib/demo-fixtures";
import type { DemoFixture } from "../lib/demo-fixtures";
import { encodeSample, type EncodedSample } from "../lib/glyph-encoding";

/** Long enough to paste a paragraph, short enough to stay readable at display size. */
export const MAX_SAMPLE_LENGTH = 240;

export interface GlyphSample {
  readonly draft: string;
  /** NFC-normalized draft, matching what the engine would accept. */
  readonly text: string;
  readonly sample: EncodedSample;
  /** The same text under the other variant, to show the mapping rotating. */
  readonly alternateSample: EncodedSample;
  readonly isDefault: boolean;
  edit(draft: string): void;
  reset(): void;
}

/**
 * Encodes the visitor's own text against the selected fixture. The prepared
 * face covers all of U+0020-007E, so every fixture font already renders
 * arbitrary input and nothing has to be regenerated per keystroke.
 */
export function useGlyphSample(
  fixture: DemoFixture,
  alternate: DemoFixture,
): GlyphSample {
  const [draft, setDraft] = useState(demoData.sentence);

  const text = useMemo(() => draft.normalize("NFC"), [draft]);
  const sample = useMemo(
    () => encodeSample(text, fixture.encodeMap, passthroughCharacters),
    [text, fixture],
  );
  const alternateSample = useMemo(
    () => encodeSample(text, alternate.encodeMap, passthroughCharacters),
    [text, alternate],
  );

  const edit = useCallback(
    (next: string) => setDraft(next.slice(0, MAX_SAMPLE_LENGTH)),
    [],
  );
  const reset = useCallback(() => setDraft(demoData.sentence), []);

  return {
    draft,
    text,
    sample,
    alternateSample,
    isDefault: draft === demoData.sentence,
    edit,
    reset,
  };
}
