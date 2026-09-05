import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputRoot = path.join(appRoot, "out");
const port = Number(process.env.PORT ?? 4178);
const host = process.env.HOST ?? "127.0.0.1";

function parseHeaders(source) {
  const rules = [];
  let current;
  for (const rawLine of source.split("\n")) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(rawLine)) {
      current = { pattern: rawLine.trim(), headers: [] };
      rules.push(current);
      continue;
    }
    const separator = rawLine.indexOf(":");
    if (!current || separator < 0) continue;
    current.headers.push([
      rawLine.slice(0, separator).trim(),
      rawLine.slice(separator + 1).trim(),
    ]);
  }
  return rules;
}

function matches(pattern, pathname) {
  if (pattern.startsWith("https://")) return false;
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`).test(pathname);
}

const rules = parseHeaders(
  await readFile(path.join(outputRoot, "_headers"), "utf8"),
);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

function headersFor(pathname) {
  const headers = new Map();
  for (const rule of rules) {
    if (!matches(rule.pattern, pathname)) continue;
    for (const [name, value] of rule.headers) {
      const key = name.toLowerCase();
      const localValue =
        key === "content-security-policy"
          ? value.replace(/;?\s*upgrade-insecure-requests/g, "")
          : value;
      headers.set(
        key,
        headers.has(key) ? `${headers.get(key)}, ${localValue}` : localValue,
      );
    }
  }
  return headers;
}

async function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded.replace(/^\/+/, "");
  const candidates = decoded.endsWith("/")
    ? [path.join(outputRoot, relative, "index.html")]
    : [
        path.join(outputRoot, relative),
        path.join(outputRoot, relative, "index.html"),
      ];
  for (const candidate of candidates) {
    if (
      !candidate.startsWith(`${outputRoot}${path.sep}`) &&
      candidate !== outputRoot
    )
      continue;
    try {
      if ((await stat(candidate)).isFile())
        return { file: candidate, status: 200 };
    } catch {
      continue;
    }
  }
  return { file: path.join(outputRoot, "404.html"), status: 404 };
}

createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", `http://${request.headers.host}`)
    .pathname;
  const { file, status } = await resolveFile(pathname);
  for (const [name, value] of headersFor(pathname))
    response.setHeader(name, value);
  response.setHeader(
    "content-type",
    contentTypes.get(path.extname(file)) ?? "application/octet-stream",
  );
  response.writeHead(status);
  createReadStream(file).pipe(response);
}).listen(port, host, () => {
  process.stdout.write(
    `GlyphScramble docs fixture listening at http://${host}:${port}\n`,
  );
});
