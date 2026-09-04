import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const TOKEN_VERSION = 2;
const TOKEN_MAX_BYTES = 4_096;
export const MAX_TOKEN_FACES = 64;
const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const FACE_ID = /^[a-z][a-z0-9_-]*@[a-z][a-z0-9_-]*$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface TokenKey {
  readonly id: string;
  readonly secret: string;
}

export interface TokenKeyRing {
  readonly current: TokenKey;
  readonly previous?: readonly TokenKey[];
}

export interface TokenClaims {
  readonly v: 2;
  readonly kid: string;
  readonly seed: string;
  readonly iat: number;
  readonly exp: number;
  readonly variant: string;
  readonly variantMode: "response-pool";
  readonly faces: readonly string[];
}

export interface TokenCoordination {
  readonly seed: string;
  readonly variant: string;
  readonly variantMode: "response-pool";
  readonly faces: readonly string[];
}

export interface TokenValidationOptions {
  readonly now?: number;
  readonly maxLifetimeSeconds: number;
  readonly maxClockSkewSeconds?: number;
  readonly maxFaces?: number;
}

function validateKey(key: TokenKey): void {
  if (!KEY_ID.test(key.id)) throw new Error(`Invalid token key id: ${key.id}`);
  if (key.secret.length < 32)
    throw new Error(
      `GlyphScramble token key ${key.id} must contain at least 32 characters.`,
    );
}

function keyFromSecret(key: TokenKey): Buffer {
  validateKey(key);
  return createHmac("sha256", key.secret)
    .update("glyphscramble:token-key:v2\0", "utf8")
    .update(key.id, "utf8")
    .digest();
}

function decodeBase64Url(value: string, label: string): Buffer {
  if (!BASE64URL.test(value)) throw new Error(`Malformed ${label}.`);
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length === 0 || decoded.toString("base64url") !== value)
    throw new Error(`Malformed ${label}.`);
  return decoded;
}

function validateCoordination(coordination: TokenCoordination): void {
  if (decodeBase64Url(coordination.seed, "token seed").length !== 32)
    throw new Error("GlyphScramble token seed must be 32 bytes.");
  if (decodeBase64Url(coordination.variant, "variant id").length !== 16)
    throw new Error("GlyphScramble variant id must be 16 bytes.");
  if (coordination.variantMode !== "response-pool")
    throw new Error("Unsupported GlyphScramble token mode.");
  if (
    !Array.isArray(coordination.faces) ||
    coordination.faces.length > MAX_TOKEN_FACES ||
    coordination.faces.some((face) => !FACE_ID.test(face)) ||
    new Set(coordination.faces).size !== coordination.faces.length
  )
    throw new Error(
      "GlyphScramble token faces must be unique prepared face ids.",
    );
}

export function issueToken(
  key: TokenKey,
  ttlSeconds: number,
  coordination: TokenCoordination,
  now = Date.now(),
): TokenClaims & { token: string } {
  validateKey(key);
  validateCoordination(coordination);
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1)
    throw new Error("GlyphScramble token lifetime must be a positive integer.");
  const iat = Math.floor(now / 1_000);
  const claims: TokenClaims = {
    v: TOKEN_VERSION,
    kid: key.id,
    seed: coordination.seed,
    iat,
    exp: iat + ttlSeconds,
    variant: coordination.variant,
    variantMode: coordination.variantMode,
    faces: [...coordination.faces].sort(),
  };
  const keyId = Buffer.from(key.id, "utf8");
  const header = Buffer.concat([
    Buffer.from([TOKEN_VERSION, keyId.length]),
    keyId,
  ]);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(key), iv);
  cipher.setAAD(header);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(claims)),
    cipher.final(),
  ]);
  const packed = Buffer.concat([header, iv, cipher.getAuthTag(), body]);
  if (packed.length > TOKEN_MAX_BYTES)
    throw new Error(
      "GlyphScramble token scope exceeds the encrypted token byte limit. Predeclare a smaller response face set.",
    );
  return {
    ...claims,
    token: packed.toString("base64url"),
  };
}

function keyMap(keyRing: TokenKeyRing): ReadonlyMap<string, TokenKey> {
  const keys = [keyRing.current, ...(keyRing.previous ?? [])];
  if (keys.length > 4)
    throw new Error("GlyphScramble accepts at most three previous token keys.");
  const result = new Map<string, TokenKey>();
  for (const key of keys) {
    validateKey(key);
    if (result.has(key.id))
      throw new Error(`Duplicate GlyphScramble token key id: ${key.id}`);
    result.set(key.id, key);
  }
  return result;
}

export function readToken(
  token: string,
  keyRing: TokenKeyRing,
  options: TokenValidationOptions,
): TokenClaims {
  let packed: Buffer;
  try {
    packed = decodeBase64Url(token, "GlyphScramble token");
  } catch {
    throw new Error("Malformed GlyphScramble token.");
  }
  if (packed.length > TOKEN_MAX_BYTES)
    throw new Error("Malformed GlyphScramble token.");
  if (packed.length < 31 || packed[0] !== TOKEN_VERSION)
    throw new Error("Unsupported GlyphScramble token.");
  const keyIdLength = packed[1]!;
  const headerLength = 2 + keyIdLength;
  if (keyIdLength < 1 || packed.length < headerLength + 29)
    throw new Error("Malformed GlyphScramble token.");
  const keyId = packed.subarray(2, headerLength).toString("utf8");
  if (!KEY_ID.test(keyId)) throw new Error("Malformed GlyphScramble token.");
  const key = keyMap(keyRing).get(keyId);
  if (!key) throw new Error("Unknown GlyphScramble token key.");
  const header = packed.subarray(0, headerLength);
  const iv = packed.subarray(headerLength, headerLength + 12);
  const tag = packed.subarray(headerLength + 12, headerLength + 28);
  const body = packed.subarray(headerLength + 28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(key), iv);
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    const claims = JSON.parse(
      Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"),
    ) as TokenClaims;
    const nowSeconds = Math.floor((options.now ?? Date.now()) / 1_000);
    const skew = options.maxClockSkewSeconds ?? 30;
    if (
      claims.v !== TOKEN_VERSION ||
      claims.kid !== keyId ||
      !Number.isSafeInteger(claims.iat) ||
      !Number.isSafeInteger(claims.exp) ||
      claims.iat < 0 ||
      claims.iat > nowSeconds + skew ||
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > options.maxLifetimeSeconds ||
      typeof claims.seed !== "string" ||
      typeof claims.variant !== "string" ||
      claims.variantMode !== "response-pool" ||
      !Array.isArray(claims.faces) ||
      claims.faces.length > (options.maxFaces ?? MAX_TOKEN_FACES)
    )
      throw new Error("Invalid GlyphScramble token claims.");
    validateCoordination(claims);
    if (claims.exp <= nowSeconds)
      throw new Error("Expired GlyphScramble token.");
    return claims;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("Expired") ||
        error.message.startsWith("Invalid GlyphScramble token claims"))
    )
      throw error;
    throw new Error("Invalid or tampered GlyphScramble token.");
  }
}
