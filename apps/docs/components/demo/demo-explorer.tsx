"use client";

import { useDemoFixture } from "../../hooks/use-demo-fixture";
import { useGlyphSample } from "../../hooks/use-glyph-sample";
import { fontFaceCss } from "../../lib/demo-fixtures";
import { BrowserRenderPanel } from "./browser-render-panel";
import { DemoExplanation } from "./demo-explanation";
import { DemoToolbar } from "./demo-toolbar";
import { RawResponsePanel } from "./raw-response-panel";
import { SampleComposer } from "./sample-composer";
import { TechnicalDetails } from "./technical-details";

export function DemoExplorer() {
  const { mode, variant, fixture, alternate, selectMode, selectVariant } =
    useDemoFixture();
  const { draft, text, sample, alternateSample, isDefault, edit, reset } =
    useGlyphSample(fixture, alternate);

  return (
    <div className="demo-explorer">
      <style>{fontFaceCss(fixture)}</style>

      <DemoToolbar
        mode={mode}
        variant={variant}
        onSelectMode={selectMode}
        onSelectVariant={selectVariant}
      />

      <SampleComposer
        value={draft}
        isDefault={isDefault}
        onEdit={edit}
        onReset={reset}
      />

      <div className="demo-comparison">
        <RawResponsePanel label={fixture.label} sample={sample} />
        <BrowserRenderPanel fixture={fixture} sample={sample} text={text} />
      </div>

      <DemoExplanation sample={sample} alternateSample={alternateSample} />

      <TechnicalDetails fixture={fixture} encodedText={sample.encodedText} />
    </div>
  );
}
