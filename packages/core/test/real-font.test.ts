import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { checksum } from "../src/binary.js";
import { inspectFont, toWoff2 } from "../src/font-pipeline.js";
import { buildSfnt, parseSfnt, remapCmap } from "../src/sfnt.js";

const interFixture = createRequire(import.meta.url).resolve(
  "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
);

describe("redistributable real-font smoke fixture", () => {
  it("round trips a pinned OFL variable face without changing non-cmap tables", async () => {
    const source = new Uint8Array(await readFile(interFixture));
    const inspected = await inspectFont(source, "inter-smoke");
    expect(inspected.metadata.container).toBe("woff2");
    expect(inspected.metadata.variable).toBe(true);
    expect(inspected.metadata.codepoints).toContain(0x41);
    expect(inspected.metadata.codepoints).toContain(0x42);

    const original = parseSfnt(inspected.sfnt);
    const patched = remapCmap(
      original,
      new Map([
        [0x41, 0x42],
        [0x42, 0x41],
      ]),
    );
    for (const [name, bytes] of original.tables) {
      if (name !== "cmap" && name !== "head")
        expect(patched.tables.get(name)).toEqual(bytes);
    }

    const sfnt = buildSfnt(patched);
    expect(checksum(sfnt)).toBe(0xb1b0afba);
    const roundTripped = await inspectFont(await toWoff2(patched), "patched");
    expect(roundTripped.metadata.variable).toBe(true);
    expect(roundTripped.metadata.axes).toEqual(inspected.metadata.axes);
    expect(roundTripped.metadata.features).toEqual(inspected.metadata.features);
  });
});
