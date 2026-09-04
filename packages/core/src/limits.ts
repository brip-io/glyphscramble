export const MAX_TIMER_DELAY_MS = 2_147_483_647;
export const MAX_GLYPH_PAYLOAD_BYTES = 1024 * 1024;
export const MAX_COVERAGE_RANGES = 1024;
export const MAX_COVERAGE_RANGE_BYTES = 32;
export const MAX_STATIC_ERROR_TEXT_BYTES = 512;

const encoder = new TextEncoder();

export function assertTimerDelay(
  value: number,
  option: string,
  maximum = MAX_TIMER_DELAY_MS,
): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new TypeError(
      `${option} must be a positive integer no greater than ${maximum}.`,
    );
}

export function assertCoverageWireBounds(
  ranges: readonly string[],
  target: string,
): void {
  if (ranges.length === 0)
    throw new TypeError(`${target} must contain at least one Unicode range.`);
  if (ranges.length > MAX_COVERAGE_RANGES)
    throw new TypeError(
      `${target} contains ${ranges.length} Unicode ranges; the client limit is ${MAX_COVERAGE_RANGES}. Subset the font or configure narrower contiguous coverage.`,
    );
  const oversized = ranges.findIndex(
    (range) => encoder.encode(range).byteLength > MAX_COVERAGE_RANGE_BYTES,
  );
  if (oversized >= 0)
    throw new TypeError(
      `${target}[${oversized}] exceeds ${MAX_COVERAGE_RANGE_BYTES} bytes. Subset the font or configure canonical Unicode ranges.`,
    );
}

export function assertPayloadWireSize(
  value: unknown,
  maximum = MAX_GLYPH_PAYLOAD_BYTES,
): void {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new TypeError("maxBytes must be a positive safe integer.");
  if (encoder.encode(JSON.stringify(value)).byteLength > maximum)
    throw new TypeError(`payload exceeds the ${maximum} byte limit.`);
}

export function assertStaticErrorText(
  value: string,
  option = "static.errorText",
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    encoder.encode(value).byteLength > MAX_STATIC_ERROR_TEXT_BYTES
  )
    throw new TypeError(
      `${option} must be non-empty and no greater than ${MAX_STATIC_ERROR_TEXT_BYTES} UTF-8 bytes.`,
    );
}
