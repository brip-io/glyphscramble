import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputRoot = path.join(appRoot, "out");
const headersPath = path.join(outputRoot, "_headers");
const marker = "  # __GLYPHSCRAMBLE_CSP__";

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory)) {
    const absolute = path.join(directory, entry);
    if ((await stat(absolute)).isDirectory())
      files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
}

function digest(value) {
  return `'sha256-${createHash("sha256").update(value).digest("base64")}'`;
}

function decodeAttribute(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function routeForHtml(file) {
  const relative = path.relative(outputRoot, file).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  if (relative === "404.html" || relative === "404/index.html") return "/404*";
  if (relative === "_not-found/index.html") return undefined;
  if (relative.endsWith("/index.html")) {
    return `/${relative.slice(0, -"index.html".length)}`;
  }
  return `/${relative}`;
}

function hashesForHtml(html) {
  const scriptHashes = new Set();
  const styleHashes = new Set();
  const styleAttributeHashes = new Set();
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1]) scriptHashes.add(digest(match[1]));
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (match[1]) styleHashes.add(digest(match[1]));
  }
  for (const match of html.matchAll(/\sstyle="([^"]*)"/gi)) {
    if (match[1]) styleAttributeHashes.add(digest(decodeAttribute(match[1])));
  }
  return { scriptHashes, styleHashes, styleAttributeHashes };
}

const values = (items) => [...items].sort().join(" ");
function cspFor({ scriptHashes, styleHashes, styleAttributeHashes }) {
  return [
    `script-src 'self' ${values(scriptHashes)}`.trim(),
    [
      `style-src 'self' ${values(styleHashes)}`.trim(),
      styleAttributeHashes.size
        ? `style-src-attr 'unsafe-hashes' ${values(styleAttributeHashes)}`
        : "style-src-attr 'none'",
    ].join("; "),
  ];
}

const routePolicies = new Map();
for (const file of (await walk(outputRoot)).filter((candidate) =>
  candidate.endsWith(".html"),
)) {
  const route = routeForHtml(file);
  if (!route) continue;
  const policy = cspFor(hashesForHtml(await readFile(file, "utf8")));
  const existing = routePolicies.get(route);
  if (existing && JSON.stringify(existing) !== JSON.stringify(policy)) {
    throw new Error(`Conflicting CSP policies generated for ${route}.`);
  }
  routePolicies.set(route, policy);
}

const routeRules = [...routePolicies]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(
    ([route, policies]) =>
      `${route}\n${policies.map((policy) => `  Content-Security-Policy: ${policy}`).join("\n")}`,
  )
  .join("\n\n");

const source = await readFile(headersPath, "utf8");
if (!source.includes(marker)) {
  throw new Error(`${headersPath} has no CSP insertion marker.`);
}
await writeFile(
  headersPath,
  `${source
    .replace(
      marker,
      "  Content-Security-Policy: base-uri 'self'; child-src 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; img-src 'self' data:; manifest-src 'self'; media-src 'self'; object-src 'none'; worker-src 'none'; upgrade-insecure-requests",
    )
    .trimEnd()}\n\n# Per-route hash policies keep each line below Cloudflare Pages' 2,000-character limit.\n${routeRules}\n`,
);

const longestLine = Math.max(
  ...(await readFile(headersPath, "utf8"))
    .split("\n")
    .map((line) => line.length),
);
if (longestLine > 2_000) {
  throw new Error(
    `Generated _headers line is ${longestLine} characters; Cloudflare Pages permits 2,000.`,
  );
}
const authoredRuleCount = source
  .split("\n")
  .filter((line) => line && !/^\s/.test(line) && !line.startsWith("#")).length;
if (routePolicies.size + authoredRuleCount > 100) {
  throw new Error(
    `Generated _headers has more than Cloudflare Pages' 100-rule limit.`,
  );
}

process.stdout.write(
  `Pinned ${routePolicies.size} route-scoped CSP policies (longest line: ${longestLine} characters).\n`,
);
