export interface CodePointRange {
  start: number;
  end: number;
}

function parsePart(value: string, wildcard: "0" | "F"): number {
  return Number.parseInt(value.replaceAll("?", wildcard), 16);
}

export function parseCoverage(values: readonly string[]): CodePointRange[] {
  const ranges: CodePointRange[] = [];
  for (const raw of values.flatMap((value) => value.split(","))) {
    const value = raw.trim().toUpperCase();
    const match = /^U\+([0-9A-F?]{1,6})(?:-([0-9A-F]{1,6}))?$/.exec(value);
    if (!match)
      throw new Error(
        `Invalid Unicode coverage range ${JSON.stringify(raw)}; expected U+XXXX, U+XXXX-YYYY, or U+XX??.`,
      );
    if (match[1]!.includes("?") && match[2])
      throw new Error(
        `Invalid Unicode coverage wildcard range ${JSON.stringify(raw)}.`,
      );
    const start = parsePart(match[1]!, "0");
    const end = match[2]
      ? Number.parseInt(match[2], 16)
      : parsePart(match[1]!, "F");
    if (start > end || end > 0x10ffff)
      throw new Error(`Invalid Unicode coverage range ${JSON.stringify(raw)}.`);
    ranges.push({ start, end });
  }
  return ranges.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function codepointInCoverage(
  codepoint: number,
  coverage: readonly CodePointRange[],
): boolean {
  return coverage.some(
    (range) => codepoint >= range.start && codepoint <= range.end,
  );
}

export function coverageContains(
  candidate: readonly CodePointRange[],
  requested: readonly CodePointRange[],
): boolean {
  return requested.every((wanted) => {
    let cursor = wanted.start;
    for (const available of candidate) {
      if (available.end < cursor) continue;
      if (available.start > cursor) return false;
      cursor = available.end + 1;
      if (cursor > wanted.end) return true;
    }
    return false;
  });
}

export function normalizeCoverage(values: readonly string[]): string[] {
  return parseCoverage(values).map(({ start, end }) =>
    start === end
      ? `U+${start.toString(16).toUpperCase()}`
      : `U+${start.toString(16).toUpperCase()}-${end.toString(16).toUpperCase()}`,
  );
}
