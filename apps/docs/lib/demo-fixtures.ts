import fixtureData from "../src/generated/demo-fixtures.json";

export type DeliveryMode = "runtime" | "static";
export type VariantKey = "a" | "b";

export interface DemoFixture {
  readonly id: string;
  readonly label: string;
  /** The generator's own encoding of `sentence`, kept as a build-time proof. */
  readonly encodedText: string;
  /** Source character to permuted character, for the whole prepared coverage. */
  readonly encodeMap: Readonly<Record<string, string>>;
  readonly family: string;
  readonly fontFile: string;
  readonly fontIdentity: string;
  readonly token?: string;
  readonly documentCache: string;
  readonly fontCache: string;
  readonly buildId?: string;
}

/** How the prepared coverage splits across the three outcomes the engine has. */
export interface DemoAlphabet {
  readonly coverage: string;
  readonly mapped: string;
  readonly passthrough: string;
  readonly unmappable: string;
}

export interface DemoData {
  readonly sentence: string;
  readonly alphabet: DemoAlphabet;
  readonly runtime: Readonly<Record<VariantKey, DemoFixture>>;
  readonly static: Readonly<Record<VariantKey, DemoFixture>>;
}

export const demoData = fixtureData as DemoData;

/**
 * Unicode treats these as structural, so the engine forwards them untouched
 * and word shape survives scrambling.
 */
export const passthroughCharacters: ReadonlySet<string> = new Set(
  demoData.alphabet.passthrough,
);

export const deliveryModes = [
  { id: "runtime", label: "Per response", variantNoun: "Response" },
  { id: "static", label: "Static build", variantNoun: "Build" },
] as const satisfies readonly {
  id: DeliveryMode;
  label: string;
  variantNoun: string;
}[];

export const variantKeys = ["a", "b"] as const;

export function fontFaceCss(fixture: DemoFixture): string {
  return `@font-face{font-family:"${fixture.family}";src:url("${fixture.fontFile}") format("woff2");font-weight:400;font-style:normal;font-display:block;}`;
}
