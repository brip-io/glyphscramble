import { InfoIcon } from "@phosphor-icons/react";
import { demoData } from "../../lib/demo-fixtures";
import type { EncodedSample } from "../../lib/glyph-encoding";
import { CoverageNotice } from "./coverage-notice";

interface DemoExplanationProps {
  sample: EncodedSample;
  /** The same text under the other variant, which should differ byte for byte. */
  alternateSample: EncodedSample;
}

export function DemoExplanation({
  sample,
  alternateSample,
}: DemoExplanationProps) {
  const rotated = sample.encodedText !== alternateSample.encodedText;

  return (
    <div className="demo-explanation">
      <div>
        <strong>
          {rotated
            ? "Same text, different bytes."
            : "Nothing in this text can be permuted."}
        </strong>
        <span>
          {rotated
            ? `Letters and digits are permuted within their own Unicode class. Spaces and punctuation (${demoData.alphabet.passthrough.trim()}) are structural, so they pass through and word shape survives.`
            : "Every character here is structural or outside coverage, so both variants emit identical bytes."}
        </span>
      </div>
      <p className="demo-caveat">
        <InfoIcon aria-hidden="true" size={18} />
        <span>
          Browser-capable automation can still recover the text. GlyphScramble
          adds friction; it is not DRM.
        </span>
      </p>
      <CoverageNotice unsupported={sample.unsupported} />
    </div>
  );
}
