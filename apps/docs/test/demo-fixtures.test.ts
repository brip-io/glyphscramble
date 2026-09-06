import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import fixtures from "../src/generated/demo-fixtures.json";

function sha256(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("public demo fixtures", () => {
  test("runtime responses rotate without exposing plaintext", () => {
    expect(fixtures.runtime.a.encodedText).not.toBe(fixtures.sentence);
    expect(fixtures.runtime.b.encodedText).not.toBe(fixtures.sentence);
    expect(fixtures.runtime.a.encodedText).not.toBe(
      fixtures.runtime.b.encodedText,
    );
    expect(fixtures.runtime.a.fontIdentity).not.toBe(
      fixtures.runtime.b.fontIdentity,
    );
    expect(fixtures.runtime.a.documentCache).toBe("private, no-store");
  });

  test("static rebuild rotates its mapping and build identity", () => {
    expect(fixtures.static.a.encodedText).not.toBe(fixtures.sentence);
    expect(fixtures.static.b.encodedText).not.toBe(fixtures.sentence);
    expect(fixtures.static.a.encodedText).not.toBe(
      fixtures.static.b.encodedText,
    );
    expect(fixtures.static.a.fontIdentity).not.toBe(
      fixtures.static.b.fontIdentity,
    );
    expect(fixtures.static.a.buildId).not.toBe(fixtures.static.b.buildId);
  });

  test("the alphabet partitions the prepared coverage exactly once", () => {
    const { coverage, mapped, passthrough, unmappable } = fixtures.alphabet;
    expect(coverage).toBe("U+0020-007E");

    const partition = [...mapped, ...passthrough, ...unmappable].sort();
    const expected = Array.from({ length: 0x7e - 0x20 + 1 }, (_, index) =>
      String.fromCodePoint(0x20 + index),
    ).sort();
    expect(partition).toEqual(expected);
  });

  test("every fixture permutes the same code points", () => {
    for (const fixture of [
      fixtures.runtime.a,
      fixtures.runtime.b,
      fixtures.static.a,
      fixtures.static.b,
    ]) {
      expect(Object.keys(fixture.encodeMap).join("")).toBe(
        fixtures.alphabet.mapped,
      );
    }
  });

  test("every displayed font identity matches the emitted WOFF2", async () => {
    for (const fixture of [
      fixtures.runtime.a,
      fixtures.runtime.b,
      fixtures.static.a,
      fixtures.static.b,
    ]) {
      const bytes = new Uint8Array(
        await readFile(
          join(
            process.cwd(),
            "apps/docs/public",
            fixture.fontFile.replace(/^\//u, ""),
          ),
        ),
      );
      expect(sha256(bytes)).toBe(fixture.fontIdentity);
    }
  });
});
