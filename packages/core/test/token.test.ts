import { describe, expect, it } from "vitest";
import {
  issueToken,
  readToken,
  type TokenCoordination,
  type TokenKey,
} from "../src/token.js";

const current: TokenKey = {
  id: "2026-09",
  secret: "correct horse battery staple plus sufficient entropy",
};
const previous: TokenKey = {
  id: "2026-08",
  secret: "previous horse battery staple plus sufficient entropy",
};
const coordination: TokenCoordination = {
  seed: Buffer.alloc(32, 1).toString("base64url"),
  variant: Buffer.alloc(16, 2).toString("base64url"),
  variantMode: "response-pool",
  faces: ["body@regular", "body@bold"],
};
const validation = (now: number, maxLifetimeSeconds = 60) => ({
  now,
  maxLifetimeSeconds,
  maxFaces: 4,
});

describe("response tokens", () => {
  it("encrypts coordination claims and validates expiration", () => {
    const first = issueToken(current, 60, coordination, 1_000_000);
    const second = issueToken(current, 60, coordination, 1_000_000);
    expect(first.token).not.toBe(second.token);
    expect(first.token).not.toContain(first.seed);
    expect(
      readToken(first.token, { current }, validation(1_000_000)),
    ).toMatchObject({
      v: 2,
      kid: current.id,
      seed: coordination.seed,
      variant: coordination.variant,
      faces: ["body@bold", "body@regular"],
    });
    expect(() =>
      readToken(first.token, { current }, validation(1_061_000)),
    ).toThrow(/Expired|claims/);
  });

  it("supports bounded previous keys without accepting unknown key ids", () => {
    const issued = issueToken(previous, 60, coordination, 1_000_000);
    expect(
      readToken(
        issued.token,
        { current, previous: [previous] },
        validation(1_000_000),
      ).kid,
    ).toBe(previous.id);
    expect(() =>
      readToken(issued.token, { current }, validation(1_000_000)),
    ).toThrow(/Unknown/);
  });

  it("rejects future, excessive-lifetime, malformed, and tampered claims", () => {
    const future = issueToken(current, 60, coordination, 1_100_000);
    expect(() =>
      readToken(future.token, { current }, validation(1_000_000)),
    ).toThrow(/claims/);
    const excessive = issueToken(current, 61, coordination, 1_000_000);
    expect(() =>
      readToken(excessive.token, { current }, validation(1_000_000)),
    ).toThrow(/claims/);
    expect(() =>
      issueToken(current, 60, { ...coordination, seed: "short" }),
    ).toThrow(/seed/);

    const issued = issueToken(current, 60, coordination);
    const middle = Math.floor(issued.token.length / 2);
    const replacement = issued.token[middle] === "A" ? "B" : "A";
    const tampered =
      issued.token.slice(0, middle) +
      replacement +
      issued.token.slice(middle + 1);
    expect(() =>
      readToken(tampered, { current }, validation(Date.now())),
    ).toThrow(/Invalid|tampered/);
    expect(() =>
      issueToken({ ...current, secret: "weak" }, 60, coordination),
    ).toThrow(/at least 32/);
    expect(() =>
      issueToken(current, 60, {
        ...coordination,
        faces: Array.from({ length: 65 }, (_, index) => `body@face${index}`),
      }),
    ).toThrow(/faces/);
  });
});
