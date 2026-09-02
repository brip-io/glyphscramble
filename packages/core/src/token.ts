import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export interface TokenClaims {
  readonly v: 1;
  readonly seed: string;
  readonly iat: number;
  readonly exp: number;
}

function keyFromSecret(secret: string): Buffer {
  if (secret.length < 32)
    throw new Error(
      "GLYPHSCRAMBLE_SECRET must contain at least 32 characters.",
    );
  return createHash("sha256").update(secret, "utf8").digest();
}

export function issueToken(
  secret: string,
  ttlSeconds: number,
  now = Date.now(),
): TokenClaims & { token: string } {
  const iat = Math.floor(now / 1000);
  const claims: TokenClaims = {
    v: 1,
    seed: randomBytes(32).toString("base64url"),
    iat,
    exp: iat + ttlSeconds,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  cipher.setAAD(Buffer.from("glyphscramble:v1"));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(claims)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ...claims,
    token: Buffer.concat([Buffer.from([1]), iv, tag, body]).toString(
      "base64url",
    ),
  };
}

export function readToken(
  token: string,
  secret: string,
  now = Date.now(),
): TokenClaims {
  let packed: Buffer;
  try {
    packed = Buffer.from(token, "base64url");
  } catch {
    throw new Error("Malformed GlyphScramble token.");
  }
  if (
    packed.length < 30 ||
    !timingSafeEqual(packed.subarray(0, 1), Buffer.from([1]))
  ) {
    throw new Error("Unsupported GlyphScramble token.");
  }
  const iv = packed.subarray(1, 13);
  const tag = packed.subarray(13, 29);
  const body = packed.subarray(29);
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv);
    decipher.setAAD(Buffer.from("glyphscramble:v1"));
    decipher.setAuthTag(tag);
    const claims = JSON.parse(
      Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"),
    ) as TokenClaims;
    if (
      claims.v !== 1 ||
      typeof claims.seed !== "string" ||
      !Number.isInteger(claims.exp)
    )
      throw new Error();
    if (claims.exp <= Math.floor(now / 1000))
      throw new Error("Expired GlyphScramble token.");
    return claims;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expired"))
      throw error;
    throw new Error("Invalid or tampered GlyphScramble token.");
  }
}
