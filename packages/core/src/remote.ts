import { lookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";
import type { GlyphConfig } from "./types.js";
import { assertTimerDelay } from "./limits.js";

const DEFAULT_REMOTE_BYTES = 8 * 1024 * 1024;
const DEFAULT_HOP_TIMEOUT_MS = 10_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 30_000;
const DEFAULT_REDIRECTS = 3;

export type HostResolver = (hostname: string) => Promise<readonly string[]>;

export interface BoundedFetchOptions {
  accept: string;
  config: GlyphConfig;
  fetcher: typeof fetch;
  kind: "css" | "font";
  resolver?: HostResolver;
  userAgent: string;
}

export interface FetchedResource {
  bytes: Uint8Array;
  contentType: string;
  url: string;
}

// Keep address families in separate lists. Node's BlockList normalizes IPv4
// addresses to IPv4-mapped IPv6 when families are mixed, which would make an
// `::ffff:0:0/96` rule deny every public IPv4 address as well.
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked4.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const)
  blocked6.addSubnet(network, prefix, "ipv6");

function parseIpv4(value: string): readonly number[] | undefined {
  const parts = value.split(".");
  if (parts.length !== 4) return undefined;
  const octets = parts.map(Number);
  return octets.every(
    (part, index) =>
      Number.isInteger(part) &&
      part >= 0 &&
      part <= 255 &&
      String(part) === parts[index],
  )
    ? octets
    : undefined;
}

function embeddedIpv4(address: string): string | undefined {
  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const octets = parseIpv4(normalized.slice(separator + 1));
    if (separator < 0 || !octets) return undefined;
    normalized = `${normalized.slice(0, separator + 1)}${(
      octets[0]! * 256 +
      octets[1]!
    ).toString(16)}:${(octets[2]! * 256 + octets[3]!).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const compressed = halves.length === 2;
  const missing = compressed ? 8 - left.length - right.length : 0;
  const parts =
    halves.length === 2
      ? [...left, ...Array.from({ length: missing }, () => "0"), ...right]
      : left;
  if (
    (compressed ? missing < 1 : left.length !== 8) ||
    parts.length !== 8 ||
    parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))
  )
    return undefined;
  const words = parts.map((part) => Number.parseInt(part, 16));
  const compatible = words.slice(0, 6).every((word) => word === 0);
  const mapped =
    words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (!compatible && !mapped) return undefined;
  return [
    words[6]! >>> 8,
    words[6]! & 0xff,
    words[7]! >>> 8,
    words[7]! & 0xff,
  ].join(".");
}

function assertPublicAddress(address: string): void {
  const version = isIP(address);
  if (!version) throw new Error(`DNS returned an invalid address: ${address}`);
  const embedded = version === 6 ? embeddedIpv4(address) : undefined;
  const denied =
    version === 4 || embedded
      ? blocked4.check(embedded ?? address, "ipv4")
      : blocked6.check(address, "ipv6");
  if (denied)
    throw new Error(`Remote source resolves to a denied address: ${address}`);
}

async function defaultResolver(hostname: string): Promise<readonly string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map(
    (item) => item.address,
  );
}

async function resolveRemoteDestination(
  url: URL,
  options: {
    allowPrivateHosts?: boolean;
    resolver?: HostResolver;
    resolveHostname?: boolean;
  } = {},
): Promise<readonly string[] | undefined> {
  if (url.protocol !== "https:")
    throw new Error(`Remote source must remain HTTPS: ${url}`);
  if (url.username || url.password)
    throw new Error("Remote source URLs must not contain credentials.");
  const rawHostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const hostname =
    rawHostname.startsWith("[") && rawHostname.endsWith("]")
      ? rawHostname.slice(1, -1)
      : rawHostname;
  if (
    !options.allowPrivateHosts &&
    (hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".home.arpa"))
  )
    throw new Error(`Remote source hostname is denied: ${hostname}`);
  if (isIP(hostname)) {
    if (!options.allowPrivateHosts) assertPublicAddress(hostname);
    return [hostname];
  }
  if (options.resolveHostname === false && !options.resolver) return undefined;
  const addresses = await (options.resolver ?? defaultResolver)(hostname);
  if (!addresses.length)
    throw new Error(`Remote source hostname has no addresses: ${hostname}`);
  for (const address of addresses) {
    if (!isIP(address))
      throw new Error(`DNS returned an invalid address: ${address}`);
    if (!options.allowPrivateHosts) assertPublicAddress(address);
  }
  return addresses;
}

export async function assertRemoteDestination(
  url: URL,
  options: {
    allowPrivateHosts?: boolean;
    resolver?: HostResolver;
    resolveHostname?: boolean;
  } = {},
): Promise<void> {
  await resolveRemoteDestination(url, options);
}

function pinnedAgent(addresses: readonly string[], maxBytes: number): Agent {
  const records = addresses.map((address) => ({
    address,
    family: isIP(address),
  }));
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    const requestedFamily =
      options.family === "IPv4"
        ? 4
        : options.family === "IPv6"
          ? 6
          : options.family;
    const matching = requestedFamily
      ? records.filter((record) => record.family === requestedFamily)
      : records;
    if (!matching.length) {
      const error = new Error(
        "No validated address matches the requested family.",
      ) as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "");
    } else if (options.all) callback(null, matching);
    else callback(null, matching[0]!.address, matching[0]!.family);
  };
  return new Agent({
    connect: { lookup: pinnedLookup },
    maxResponseSize: maxBytes,
  });
}

async function withTimeout<T>(
  operation: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  assertTimerDelay(milliseconds, "Remote timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredHeader = response.headers.get("content-length");
  if (declaredHeader !== null) {
    const declared = Number(declaredHeader);
    if (!Number.isSafeInteger(declared) || declared < 0) {
      await response.body?.cancel("Invalid Content-Length");
      throw new Error("Remote source has an invalid Content-Length header.");
    }
    if (declared > maxBytes) {
      await response.body?.cancel("GlyphScramble remote size limit exceeded");
      throw new Error(`Remote source exceeds ${maxBytes} bytes.`);
    }
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel("GlyphScramble remote size limit exceeded");
        throw new Error(`Remote source exceeds ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function mediaType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

function assertMediaType(kind: "css" | "font", value: string): void {
  const type = mediaType(value);
  const allowed =
    kind === "css"
      ? new Set(["text/css"])
      : new Set([
          "application/font-sfnt",
          "application/font-woff",
          "application/octet-stream",
          "application/vnd.ms-fontobject",
          "font/collection",
          "font/otf",
          "font/sfnt",
          "font/ttf",
          "font/woff",
          "font/woff2",
        ]);
  if (!allowed.has(type))
    throw new Error(
      `Remote ${kind} source returned unsupported Content-Type ${JSON.stringify(value)}.`,
    );
}

function assertFontMagic(bytes: Uint8Array): void {
  if (bytes.length < 4) throw new Error("Remote font source is truncated.");
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  const valid =
    magic === "OTTO" ||
    magic === "true" ||
    magic === "wOFF" ||
    magic === "wOF2" ||
    (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0);
  if (!valid)
    throw new Error("Remote font source has unsupported magic bytes.");
}

export async function fetchBounded(
  initialUrl: string,
  options: BoundedFetchOptions,
): Promise<FetchedResource> {
  let url = new URL(initialUrl);
  const redirects = options.config.remote?.maxRedirects ?? DEFAULT_REDIRECTS;
  const maxBytes = options.config.remote?.maxBytes ?? DEFAULT_REMOTE_BYTES;
  const hopTimeout = options.config.remote?.timeoutMs ?? DEFAULT_HOP_TIMEOUT_MS;
  const deadline =
    Date.now() +
    (options.config.remote?.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS);
  for (let redirect = 0; redirect <= redirects; redirect++) {
    let remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error("Remote source total timeout exceeded.");
    const addresses = await withTimeout(
      resolveRemoteDestination(url, {
        ...(options.config.remote?.allowPrivateHosts
          ? { allowPrivateHosts: true }
          : {}),
        ...(options.resolver ? { resolver: options.resolver } : {}),
        // Injected transports (tests and controlled enterprise clients) own
        // DNS connection binding unless they also provide a resolver.
        resolveHostname: options.fetcher === globalThis.fetch,
      }),
      Math.min(hopTimeout, remaining),
      "Remote source DNS timeout exceeded.",
    );
    remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error("Remote source total timeout exceeded.");
    const dispatcher =
      options.fetcher === globalThis.fetch && addresses
        ? pinnedAgent(addresses, maxBytes)
        : undefined;
    try {
      const requestTimeout = Math.min(hopTimeout, remaining);
      const response = await withTimeout(
        options.fetcher(url, {
          headers: { accept: options.accept, "user-agent": options.userAgent },
          redirect: "manual",
          signal: AbortSignal.timeout(requestTimeout),
          ...(dispatcher ? { dispatcher } : {}),
        } as RequestInit),
        requestTimeout,
        "Remote source hop timeout exceeded.",
      );
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location)
          throw new Error(
            `Remote source ${url} returned redirect ${response.status} without a Location header.`,
          );
        if (redirect === redirects)
          throw new Error(`Too many redirects while fetching ${initialUrl}`);
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Remote source ${url} returned ${response.status}.`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      try {
        assertMediaType(options.kind, contentType);
      } catch (error) {
        await response.body?.cancel();
        throw error;
      }
      const bytes = await readBoundedBody(response, maxBytes);
      if (options.kind === "font") assertFontMagic(bytes);
      return { bytes, url: url.href, contentType };
    } finally {
      await dispatcher?.close();
    }
  }
  throw new Error(`Unable to fetch ${initialUrl}`);
}
