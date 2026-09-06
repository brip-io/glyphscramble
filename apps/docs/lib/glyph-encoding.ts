export interface EncodedSample {
  readonly encodedText: string;
  /**
   * Characters the face cannot permute, unique and in first-seen order. These
   * survive into the response verbatim, which is exactly what a reader of the
   * raw bytes recovers for free.
   */
  readonly unsupported: readonly string[];
}

/**
 * Mirrors the engine's `encodeText` for a single prepared face: permuted
 * characters are substituted, structural characters pass through, and anything
 * else is reported so the caller can surface the `unsupported` policy.
 *
 * Input is normalized to NFC because the engine rejects text that is not.
 */
export function encodeSample(
  text: string,
  encodeMap: Readonly<Record<string, string>>,
  passthrough: ReadonlySet<string>,
): EncodedSample {
  const unsupported = new Set<string>();
  let encodedText = "";

  for (const character of text.normalize("NFC")) {
    const permuted = encodeMap[character];
    if (permuted !== undefined) {
      encodedText += permuted;
      continue;
    }
    encodedText += character;
    if (!passthrough.has(character)) unsupported.add(character);
  }

  return { encodedText, unsupported: [...unsupported] };
}
