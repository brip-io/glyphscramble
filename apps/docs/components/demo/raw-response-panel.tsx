import { BracketsCurlyIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useCopyToClipboard } from "../../hooks/use-copy-to-clipboard";
import type { EncodedSample } from "../../lib/glyph-encoding";

interface RawResponsePanelProps {
  label: string;
  sample: EncodedSample;
}

export function RawResponsePanel({ label, sample }: RawResponsePanelProps) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <section className="demo-output raw-output">
      <header>
        <h2>
          <BracketsCurlyIcon aria-hidden="true" size={19} />
          Raw response
        </h2>
        <span>{label}</span>
      </header>
      <code aria-hidden="true">{sample.encodedText}</code>
      <p className="sr-only">
        The raw response carries {sample.encodedText.length} scrambled
        characters in place of the text above.
      </p>
      <div className="demo-output-footer">
        <button
          type="button"
          className="demo-copy"
          disabled={sample.encodedText.length === 0}
          onClick={() => copy(sample.encodedText)}
        >
          {copied ? (
            <CheckIcon aria-hidden="true" size={15} />
          ) : (
            <CopyIcon aria-hidden="true" size={15} />
          )}
          {copied ? "Copied" : "Copy what a scraper gets"}
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? "Encoded response copied to clipboard." : ""}
        </span>
      </div>
    </section>
  );
}
