import { BrowserIcon } from "@phosphor-icons/react";
import type { DemoFixture } from "../../lib/demo-fixtures";
import type { EncodedSample } from "../../lib/glyph-encoding";

interface BrowserRenderPanelProps {
  fixture: DemoFixture;
  sample: EncodedSample;
  /** The plain text, exposed to assistive technology in place of the scramble. */
  text: string;
}

export function BrowserRenderPanel({
  fixture,
  sample,
  text,
}: BrowserRenderPanelProps) {
  return (
    <section className="demo-output human-output">
      <header>
        <h2>
          <BrowserIcon aria-hidden="true" size={19} />
          Browser render
        </h2>
        <span>What the reader sees</span>
      </header>
      <div
        className="protected-visual"
        style={{ fontFamily: `"${fixture.family}"` }}
        aria-hidden="true"
      >
        {sample.encodedText}
      </div>
      <span className="sr-only">{text}</span>
    </section>
  );
}
