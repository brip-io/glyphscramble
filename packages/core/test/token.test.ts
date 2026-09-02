import { describe, expect, it } from "vitest";
import { issueToken, readToken } from "../src/token.js";

const secret = "correct horse battery staple plus sufficient entropy";

describe("response tokens", () => {
  it("encrypts a fresh seed and validates expiration", () => {
    const first = issueToken(secret, 60, 1_000_000);
    const second = issueToken(secret, 60, 1_000_000);
    expect(first.token).not.toBe(second.token);
    expect(first.token).not.toContain(first.seed);
    expect(readToken(first.token, secret, 1_000_000).seed).toBe(first.seed);
    expect(() => readToken(first.token, secret, 1_061_000)).toThrow(/Expired/);
  });

  it("rejects tampering and weak secrets", () => {
    const issued = issueToken(secret, 60);
    const middle = Math.floor(issued.token.length / 2);
    const replacement = issued.token[middle] === "A" ? "B" : "A";
    const tampered =
      issued.token.slice(0, middle) +
      replacement +
      issued.token.slice(middle + 1);
    expect(() => readToken(tampered, secret)).toThrow(/Invalid|tampered/);
    expect(() => issueToken("weak", 60)).toThrow(/at least 32/);
  });
});
