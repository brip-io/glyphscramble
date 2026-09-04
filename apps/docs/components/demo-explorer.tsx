"use client";

import {
  BracketsCurlyIcon,
  BrowserIcon,
  CaretDownIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import fixtureData from "../src/generated/demo-fixtures.json";

type Mode = "runtime" | "static";
type Variant = "a" | "b";

interface DemoFixture {
  label: string;
  encodedText: string;
  family: string;
  fontFile: string;
  fontIdentity: string;
  token?: string;
  documentCache: string;
  fontCache: string;
  buildId?: string;
}

interface DemoData {
  sentence: string;
  runtime: { a: DemoFixture; b: DemoFixture };
  static: { a: DemoFixture; b: DemoFixture };
}

const data = fixtureData as DemoData;

function shortHash(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export function DemoExplorer() {
  const [mode, setMode] = useState<Mode>("runtime");
  const [variant, setVariant] = useState<Variant>("a");

  const fixture = data[mode][variant];
  const alternate = data[mode][variant === "a" ? "b" : "a"];
  const fontCss = useMemo(
    () =>
      `@font-face{font-family:"${fixture.family}";src:url("${fixture.fontFile}") format("woff2");font-weight:400;font-style:normal;font-display:block;}`,
    [fixture],
  );

  return (
    <div className="demo-explorer">
      <style>{fontCss}</style>

      <div className="demo-toolbar">
        <div className="demo-control">
          <span>Delivery</span>
          <div className="segmented" role="group" aria-label="Delivery mode">
            <button
              type="button"
              aria-pressed={mode === "runtime"}
              onClick={() => {
                setMode("runtime");
                setVariant("a");
              }}
            >
              Per response
            </button>
            <button
              type="button"
              aria-pressed={mode === "static"}
              onClick={() => {
                setMode("static");
                setVariant("a");
              }}
            >
              Static build
            </button>
          </div>
        </div>

        <div className="demo-control">
          <span>{mode === "runtime" ? "Response" : "Build"}</span>
          <div
            className="variant-switch"
            role="group"
            aria-label={mode === "runtime" ? "Response" : "Build"}
          >
            <button
              type="button"
              aria-pressed={variant === "a"}
              onClick={() => setVariant("a")}
            >
              A
            </button>
            <button
              type="button"
              aria-pressed={variant === "b"}
              onClick={() => setVariant("b")}
            >
              B
            </button>
          </div>
        </div>
      </div>

      <div className="demo-comparison">
        <section className="demo-output raw-output">
          <header>
            <h2>
              <BracketsCurlyIcon aria-hidden="true" size={19} />
              Raw response
            </h2>
            <span>{fixture.label}</span>
          </header>
          <code aria-label="Encoded Unicode sample">{fixture.encodedText}</code>
        </section>

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
            {fixture.encodedText}
          </div>
          <span className="sr-only">{data.sentence}</span>
        </section>
      </div>

      <div className="demo-explanation">
        <div>
          <strong>
            {fixture.encodedText === alternate.encodedText
              ? "The mapping is reused."
              : `${fixture.label} uses different encoded bytes.`}
          </strong>
          <span>The rendered sentence remains unchanged.</span>
        </div>
        <p className="demo-caveat">
          <InfoIcon aria-hidden="true" size={18} />
          <span>
            Browser-capable automation can still recover the text. GlyphScramble
            adds friction; it is not DRM.
          </span>
        </p>
      </div>

      <details className="technical-details">
        <summary>
          View technical details
          <CaretDownIcon aria-hidden="true" size={17} />
        </summary>
        <dl>
          <div>
            <dt>Encoded Unicode</dt>
            <dd>{shortHash(fixture.encodedText)}</dd>
          </div>
          <div>
            <dt>Font identity</dt>
            <dd>{shortHash(fixture.fontIdentity)}</dd>
          </div>
          {fixture.token && (
            <div>
              <dt>Opaque token</dt>
              <dd>{fixture.token}</dd>
            </div>
          )}
          {fixture.buildId && (
            <div>
              <dt>Build ID</dt>
              <dd>{shortHash(fixture.buildId)}</dd>
            </div>
          )}
          <div>
            <dt>Document cache</dt>
            <dd>{fixture.documentCache}</dd>
          </div>
          <div>
            <dt>Font cache</dt>
            <dd>{fixture.fontCache}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
