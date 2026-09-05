import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(appRoot, "../..");
const contentRoot = path.join(appRoot, "content");
const publicRoot = path.join(appRoot, "public");
const generatedPath = path.join(appRoot, "src/generated/docs-reference.json");
const siteUrl = "https://glyphscramble.brip.io";
const order = JSON.parse(
  await readFile(path.join(appRoot, "src/docs/docs-order.json"), "utf8"),
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stripMarkdown(value) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[|*_>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function packageMatrix(packages) {
  const rows = packages.map((manifest) => {
    const peers = Object.entries(manifest.peerDependencies ?? {})
      .map(([name, range]) => `${name} ${range}`)
      .join("; ");
    const compatibility = peers || `Node ${manifest.engines?.node ?? ">=22"}`;
    return `| \`${manifest.name}\` | ${compatibility} |`;
  });
  return ["| Package | Peer range |", "| --- | --- |", ...rows].join("\n");
}

function releaseNotes(changelog) {
  const match = changelog.match(/## 0\.1\.0-beta\.0\n([\s\S]*?)(?=\n## |$)/);
  if (!match)
    throw new Error("CHANGELOG.md has no 0.1.0-beta.0 release notes.");
  return `### 0.1.0-beta.0\n${match[1].trim()}`;
}

async function loadReferences() {
  const packageDirectories = [
    "core",
    "react",
    "next",
    "vue",
    "nuxt",
    "svelte",
    "sveltekit",
    "astro",
    "vite",
  ];
  const packages = await Promise.all(
    packageDirectories.map(async (directory) =>
      JSON.parse(
        await readFile(
          path.join(repositoryRoot, "packages", directory, "package.json"),
          "utf8",
        ),
      ),
    ),
  );
  const cliPath = path.join(repositoryRoot, "packages/core/dist/cli.js");
  let cliHelp;
  try {
    cliHelp = execFileSync(process.execPath, [cliPath, "--help"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    }).trim();
  } catch (error) {
    throw new Error(
      "The docs build requires packages/core/dist/cli.js. Build @brip/glyphscramble first.",
      { cause: error },
    );
  }
  return {
    cliHelp,
    coreQuickstart: (
      await readFile(path.join(appRoot, "examples/core-quickstart.ts"), "utf8")
    ).trim(),
    packageMatrix: packageMatrix(packages),
    releaseNotes: releaseNotes(
      await readFile(path.join(repositoryRoot, "CHANGELOG.md"), "utf8"),
    ),
  };
}

function expand(markdown, references) {
  return markdown
    .replace("{{CLI_HELP}}", references.cliHelp)
    .replace("{{CORE_QUICKSTART}}", references.coreQuickstart)
    .replace("{{PACKAGE_MATRIX}}", references.packageMatrix)
    .replace("{{RELEASE_NOTES}}", references.releaseNotes);
}

const references = await loadReferences();

const pages = [];
const seen = new Set();
for (const [groupIndex, group] of order.groups.entries()) {
  for (const [pageIndex, slug] of group.pages.entries()) {
    if (seen.has(slug))
      throw new Error(`Duplicate docs registry slug: ${slug}`);
    seen.add(slug);
    const source = path.join(contentRoot, `${slug}.md`);
    const parsed = matter(await readFile(source, "utf8"));
    const expectedOrder = groupIndex * 100 + (pageIndex + 1) * 10;
    if (
      parsed.data.order !== expectedOrder ||
      parsed.data.group !== group.label
    ) {
      throw new Error(
        `${slug}: frontmatter order/group does not match docs-order.json.`,
      );
    }
    if (!["available", "planned"].includes(parsed.data.status)) {
      throw new Error(`${slug}: status must be available or planned.`);
    }
    const markdown = expand(parsed.content.trim(), references);
    if (/{{[A-Z_]+}}/.test(markdown)) {
      throw new Error(`${slug}: unresolved generated documentation token.`);
    }
    pages.push({ slug, group: group.label, ...parsed.data, markdown });
  }
}

const docsPublicRoot = path.join(publicRoot, "docs");
await rm(docsPublicRoot, { recursive: true, force: true });
await mkdir(docsPublicRoot, { recursive: true });

for (const page of pages) {
  const target = path.join(docsPublicRoot, `${page.slug}.md`);
  await mkdir(path.dirname(target), { recursive: true });
  const source = `${siteUrl}/docs/${page.slug}/`;
  await writeFile(
    target,
    `# ${page.title}\n\n${page.description}\n\nSource: ${source}\n\n${page.markdown}\n`,
  );
}

const docsHome = [
  "# GlyphScramble documentation",
  "",
  "Choose a suitable high-value block and delivery mode before selecting a framework.",
  "",
  `Source: ${siteUrl}/docs/`,
  "",
  ...pages.map(
    (page) =>
      `- [${page.title}](${siteUrl}/docs/${page.slug}/): ${page.description}`,
  ),
  "",
].join("\n");
await writeFile(path.join(publicRoot, "docs.md"), docsHome);

const llms = [
  "# GlyphScramble by BRIP",
  "",
  "> GlyphScramble raises the cost of bulk DOM scraping with coordinated encoded text and generated fonts.",
  "",
  "It is not DRM and does not prevent headless browsers, OCR, font analysis, or plaintext side channels.",
  "",
  `Complete corpus: ${siteUrl}/llms-full.txt`,
  "",
];
for (const group of order.groups) {
  llms.push(`## ${group.label}`, "");
  for (const slug of group.pages) {
    const page = pages.find((entry) => entry.slug === slug);
    llms.push(
      `- [${page.title}](${siteUrl}/docs/${slug}/): ${page.description}`,
    );
    llms.push(`  - Markdown: ${siteUrl}/docs/${slug}.md`);
  }
  llms.push("");
}
await writeFile(
  path.join(publicRoot, "llms.txt"),
  `${llms.join("\n").trim()}\n`,
);

const full = [
  docsHome.trim(),
  ...pages.map((page) =>
    [
      `# ${page.title}`,
      "",
      page.description,
      "",
      `Source: ${siteUrl}/docs/${page.slug}/`,
      "",
      page.markdown,
    ].join("\n"),
  ),
].join("\n\n---\n\n");
await writeFile(path.join(publicRoot, "llms-full.txt"), `${full}\n`);

const search = pages.map((page) => ({
  slug: page.slug,
  title: page.title,
  description: page.description,
  group: page.group,
  text: stripMarkdown(page.markdown),
}));
const searchJson = `${JSON.stringify(search)}\n`;
const searchFile = `search-index.${sha256(searchJson).slice(0, 12)}.json`;
for (const entry of await readdir(publicRoot)) {
  if (
    /^search-index(?:\.[a-f0-9]+)?\.json$/.test(entry) &&
    entry !== searchFile
  ) {
    await rm(path.join(publicRoot, entry));
  }
}
await writeFile(path.join(publicRoot, searchFile), searchJson);
references.searchIndexPath = `/${searchFile}`;
await writeFile(generatedPath, `${JSON.stringify(references, null, 2)}\n`);

const manifest = {
  version: 1,
  packageVersion: pages[0]?.lastReviewedAgainst,
  registrySha256: sha256(JSON.stringify(order)),
  corpusSha256: sha256(full),
  searchIndex: references.searchIndexPath,
  pages: pages.map((page) => ({ slug: page.slug, status: page.status })),
};
await writeFile(
  path.join(publicRoot, "docs-build.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

process.stdout.write(
  `Generated ${pages.length} documentation pages and agent/search artifacts.\n`,
);
