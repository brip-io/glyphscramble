import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import matter from "gray-matter";
import ts from "typescript";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(appRoot, "../..");
const contentRoot = path.join(appRoot, "content");
const publicRoot = path.join(appRoot, "public");
const outputRoot = path.join(appRoot, "out");
const order = JSON.parse(
  await readFile(path.join(appRoot, "src/docs/docs-order.json"), "utf8"),
);
const generated = JSON.parse(
  await readFile(
    path.join(appRoot, "src/generated/docs-reference.json"),
    "utf8",
  ),
);

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

function headingId(value) {
  return value
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function fail(message) {
  throw new Error(`Documentation contract failed: ${message}`);
}

function expandGenerated(markdown) {
  return markdown
    .replace("{{CLI_HELP}}", generated.cliHelp.trim())
    .replace("{{CORE_QUICKSTART}}", generated.coreQuickstart.trim())
    .replace("{{PACKAGE_MATRIX}}", generated.packageMatrix.trim())
    .replace("{{RELEASE_NOTES}}", generated.releaseNotes.trim());
}

const registered = order.groups.flatMap((group) => group.pages);
const contentFiles = (await walk(contentRoot))
  .filter((file) => file.endsWith(".md"))
  .map((file) =>
    path
      .relative(contentRoot, file)
      .replace(/\.md$/, "")
      .split(path.sep)
      .join("/"),
  )
  .sort();
if (new Set(registered).size !== registered.length)
  fail("docs-order.json contains a duplicate slug.");
if (JSON.stringify([...registered].sort()) !== JSON.stringify(contentFiles)) {
  fail(
    "docs-order.json and apps/docs/content do not have identical inventories.",
  );
}

const packageManifests = await Promise.all(
  (await readdir(path.join(repositoryRoot, "packages"))).map(
    async (directory) => ({
      directory,
      manifest: JSON.parse(
        await readFile(
          path.join(repositoryRoot, "packages", directory, "package.json"),
          "utf8",
        ),
      ),
    }),
  ),
);
const packageNames = new Set(
  packageManifests.map(({ manifest }) => manifest.name),
);
const packageSources = new Map(
  await Promise.all(
    packageManifests.map(async ({ directory, manifest }) => [
      manifest.name,
      (
        await Promise.all(
          (await walk(path.join(repositoryRoot, "packages", directory, "src")))
            .filter(
              (file) =>
                file.endsWith(".ts") ||
                file.endsWith(".tsx") ||
                file.endsWith(".svelte") ||
                file.endsWith(".astro"),
            )
            .map((file) => readFile(file, "utf8")),
        )
      ).join("\n"),
    ]),
  ),
);

const anchors = new Map();
const pages = [];
for (const [groupIndex, group] of order.groups.entries()) {
  for (const [pageIndex, slug] of group.pages.entries()) {
    const source = await readFile(path.join(contentRoot, `${slug}.md`), "utf8");
    const parsed = matter(source);
    const expectedOrder = groupIndex * 100 + (pageIndex + 1) * 10;
    if (parsed.data.order !== expectedOrder)
      fail(`${slug} has the wrong order.`);
    if (parsed.data.group !== group.label) fail(`${slug} has the wrong group.`);
    if (!["available", "planned"].includes(parsed.data.status))
      fail(`${slug} has an invalid status.`);
    if (parsed.data.lastReviewedAgainst !== "0.1.0-beta.0") {
      fail(`${slug} is not reviewed against 0.1.0-beta.0.`);
    }
    for (const packageName of parsed.data.packages ?? []) {
      if (!packageNames.has(packageName))
        fail(`${slug} names unknown package ${packageName}.`);
    }
    const declaredPackages = parsed.data.packages ?? [];
    for (const symbol of parsed.data.symbols ?? []) {
      if (
        !declaredPackages.some((packageName) =>
          new RegExp(`\\b${symbol}\\b`).test(
            packageSources.get(packageName) ?? "",
          ),
        )
      ) {
        fail(`${slug} names unknown public symbol ${symbol}.`);
      }
    }
    for (const token of parsed.content.match(/{{[A-Z_]+}}/g) ?? []) {
      if (
        ![
          "{{CLI_HELP}}",
          "{{CORE_QUICKSTART}}",
          "{{PACKAGE_MATRIX}}",
          "{{RELEASE_NOTES}}",
        ].includes(token)
      ) {
        fail(`${slug} contains unknown generated token ${token}.`);
      }
    }
    const markdown = expandGenerated(parsed.content.trim());
    if (/[—–]/.test(markdown)) fail(`${slug} contains an em or en dash.`);
    for (const block of markdown.matchAll(/```(ts|tsx)\n([\s\S]*?)```/g)) {
      if (block[2].includes("..."))
        fail(`${slug} contains an unexplained code ellipsis.`);
      const compiled = ts.transpileModule(block[2], {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: `${slug}.${block[1]}`,
        reportDiagnostics: true,
      });
      const errors = (compiled.diagnostics ?? []).filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      );
      if (errors.length)
        fail(`${slug} contains invalid ${block[1]} example syntax.`);
    }
    for (const kind of markdown.matchAll(/kind:\s*["']([^"']+)["']/g)) {
      if (!["file", "url", "google-css"].includes(kind[1])) {
        fail(`${slug} uses unsupported font source kind ${kind[1]}.`);
      }
    }
    const ids = new Set(
      [...markdown.matchAll(/^#{2,3}\s+(.+)$/gm)].map((match) =>
        headingId(match[1]),
      ),
    );
    anchors.set(slug, ids);
    pages.push({
      slug,
      title: parsed.data.title,
      description: parsed.data.description,
      markdown,
    });
  }
}

for (const page of pages) {
  for (const match of page.markdown.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (/^(https?:|mailto:)/.test(href)) continue;
    if (href.startsWith("#")) {
      if (!anchors.get(page.slug).has(href.slice(1)))
        fail(`${page.slug} links to missing ${href}.`);
      continue;
    }
    const internal = href.match(/^\/docs\/([^#]*?)(?:\/)?(?:#(.+))?$/);
    if (!internal) continue;
    if (!internal[1]) continue;
    const target = internal[1].replace(/\.md$/, "");
    if (!anchors.has(target))
      fail(`${page.slug} links to missing page ${href}.`);
    if (internal[2] && !anchors.get(target).has(internal[2])) {
      fail(`${page.slug} links to missing anchor ${href}.`);
    }
  }
}

const corpus = pages.map((page) => page.markdown).join("\n");
if (!/raises the cost of bulk DOM scraping/i.test(corpus))
  fail("approved positioning is absent.");
if (!/not DRM/i.test(corpus)) fail("the DRM limitation is absent.");
for (const term of ["SEO", "caching", "accessibility", "high-value"]) {
  if (!corpus.includes(term)) fail(`the ${term} adoption warning is absent.`);
}

if (!/^\/search-index\.[a-f0-9]{12}\.json$/.test(generated.searchIndexPath)) {
  fail("generated search path is not content-addressed.");
}
const search = JSON.parse(
  await readFile(
    path.join(publicRoot, generated.searchIndexPath.slice(1)),
    "utf8",
  ),
);
const searchBytes = await readFile(
  path.join(publicRoot, generated.searchIndexPath.slice(1)),
);
const expectedSearchHash = createHash("sha256")
  .update(searchBytes)
  .digest("hex")
  .slice(0, 12);
if (!generated.searchIndexPath.includes(`.${expectedSearchHash}.json`)) {
  fail("content-addressed search filename does not match its bytes.");
}
const manifest = JSON.parse(
  await readFile(path.join(publicRoot, "docs-build.json"), "utf8"),
);
if (
  search.length !== registered.length ||
  manifest.pages.length !== registered.length
) {
  fail("generated search or build manifest inventory is incomplete.");
}
for (const slug of registered) {
  const page = pages.find((entry) => entry.slug === slug);
  const markdownTwin = await readFile(
    path.join(publicRoot, "docs", `${slug}.md`),
    "utf8",
  );
  const expectedTwin = `# ${page.title}\n\n${page.description}\n\nSource: https://glyphscramble.brip.io/docs/${slug}/\n\n${page.markdown}\n`;
  if (markdownTwin !== expectedTwin) fail(`${slug}.md is stale.`);
  if (/{{[A-Z_]+}}/.test(markdownTwin))
    fail(`${slug}.md contains an unresolved generated token.`);
  await stat(path.join(outputRoot, "docs", slug, "index.html"));
}
for (const artifact of ["docs.md", "llms.txt", "llms-full.txt"]) {
  const value = await readFile(path.join(publicRoot, artifact), "utf8");
  for (const slug of registered) {
    if (!value.includes(`/docs/${slug}`)) fail(`${artifact} omits ${slug}.`);
  }
}
if ((await stat(path.join(publicRoot, "llms-full.txt"))).size > 500_000) {
  fail("llms-full.txt exceeds the 500 KB uncompressed budget.");
}

const htmlFiles = (await walk(outputRoot)).filter((file) =>
  file.endsWith(".html"),
);
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  for (const link of html.matchAll(/\shref="(\/[^"]*)"/g)) {
    const targetUrl = new URL(link[1], "https://glyphscramble.brip.io");
    const pathname = targetUrl.pathname;
    const fragment = targetUrl.hash.slice(1);
    if (!pathname || pathname.startsWith("/_next/")) continue;
    const relative = pathname.replace(/^\//, "");
    const target = pathname.endsWith("/")
      ? path.join(outputRoot, relative, "index.html")
      : path.join(outputRoot, relative);
    try {
      await stat(target);
    } catch {
      fail(`${path.relative(outputRoot, file)} links to missing ${link[1]}.`);
    }
    if (fragment && target.endsWith(".html")) {
      const targetHtml = await readFile(target, "utf8");
      if (!targetHtml.includes(`id="${fragment}"`)) {
        fail(
          `${path.relative(outputRoot, file)} links to missing fragment ${link[1]}.`,
        );
      }
    }
  }
}

const sitemap = await readFile(path.join(outputRoot, "sitemap.xml"), "utf8");
for (const slug of registered) {
  if (!sitemap.includes(`https://glyphscramble.brip.io/docs/${slug}/`)) {
    fail(`sitemap.xml omits ${slug}.`);
  }
}

const headers = await readFile(path.join(outputRoot, "_headers"), "utf8");
const headerLines = headers.split("\n");
const longestLine = Math.max(...headerLines.map((line) => line.length));
const ruleCount = headerLines.filter(
  (line) => line && !/^\s/.test(line) && !line.startsWith("#"),
).length;
if (longestLine > 1_900)
  fail(`_headers has a ${longestLine}-character line (1,900 budget).`);
if (ruleCount > 100)
  fail(`_headers has ${ruleCount} rules (100 platform limit).`);
if (headers.includes("'unsafe-inline'")) fail("CSP permits unsafe-inline.");
if (!headers.includes("/docs/get-started/\n  Content-Security-Policy:")) {
  fail("route-scoped CSP policies are absent.");
}

const representativeHtml = await readFile(
  path.join(outputRoot, "docs", "reference", "configuration", "index.html"),
  "utf8",
);
const scriptSources = [
  ...representativeHtml.matchAll(/<script[^>]+src="([^"]+)"/g),
].map((match) => match[1]);
let compressedJavaScript = 0;
for (const source of new Set(scriptSources)) {
  if (!source.startsWith("/_next/static/")) continue;
  compressedJavaScript += gzipSync(
    await readFile(path.join(outputRoot, source.replace(/^\//, ""))),
  ).byteLength;
}
if (compressedJavaScript > 220_000) {
  fail(
    `representative docs JavaScript is ${compressedJavaScript} compressed bytes (220 KB budget).`,
  );
}

process.stdout.write(
  `Documentation contract passed: ${registered.length} pages, ${ruleCount} header rules, ${compressedJavaScript} compressed JS bytes.\n`,
);
