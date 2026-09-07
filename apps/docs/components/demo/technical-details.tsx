import { CaretDownIcon } from "@phosphor-icons/react";
import type { DemoFixture } from "../../lib/demo-fixtures";

interface TechnicalDetailsProps {
  fixture: DemoFixture;
  encodedText: string;
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export function TechnicalDetails({
  fixture,
  encodedText,
}: TechnicalDetailsProps) {
  const rows = [
    ["Encoded Unicode", encodedText ? shortHash(encodedText) : "empty"],
    ["Font identity", shortHash(fixture.fontIdentity)],
    ...(fixture.token ? [["Opaque token", fixture.token]] : []),
    ...(fixture.buildId ? [["Build ID", shortHash(fixture.buildId)]] : []),
    ["Permuted code points", `${Object.keys(fixture.encodeMap).length}`],
    ["Document cache", fixture.documentCache],
    ["Font cache", fixture.fontCache],
  ] as const;

  return (
    <details className="technical-details">
      <summary>
        View technical details
        <CaretDownIcon aria-hidden="true" size={17} />
      </summary>
      <dl>
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
