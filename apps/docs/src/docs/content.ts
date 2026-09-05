import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import generated from "../generated/docs-reference.json";
import order from "./docs-order.json";
import type {
  DeliveryMode,
  DocFrontmatter,
  DocGroup,
  DocHeading,
  DocPage,
  DocStatus,
} from "./types";

const CONTENT_ROOT = existsSync(path.join(process.cwd(), "content"))
  ? path.join(process.cwd(), "content")
  : path.join(process.cwd(), "apps", "docs", "content");

const VERSION = "0.1.0-beta.0";
const STATUSES = new Set<DocStatus>(["available", "planned"]);
const MODES = new Set<DeliveryMode>(["per-response", "static", "both"]);

export const docsSearchPath = generated.searchIndexPath;

function assertString(value: unknown, field: string, slug: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${slug}: frontmatter.${field} must be a non-empty string.`,
    );
  }
  return value;
}

function assertStringArray(
  value: unknown,
  field: string,
  slug: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.trim() === "")
  ) {
    throw new Error(`${slug}: frontmatter.${field} must be a string array.`);
  }
  return value;
}

function parseFrontmatter(
  value: Record<string, unknown>,
  slug: string,
): DocFrontmatter {
  const status = assertString(value.status, "status", slug) as DocStatus;
  if (!STATUSES.has(status)) {
    throw new Error(`${slug}: status must be available or planned.`);
  }

  const mode = value.mode as DeliveryMode | undefined;
  if (mode !== undefined && !MODES.has(mode)) {
    throw new Error(`${slug}: mode must be per-response, static, or both.`);
  }

  if (!Number.isInteger(value.order) || (value.order as number) < 1) {
    throw new Error(`${slug}: frontmatter.order must be a positive integer.`);
  }

  const reviewed = assertString(
    value.lastReviewedAgainst,
    "lastReviewedAgainst",
    slug,
  );
  if (reviewed !== VERSION) {
    throw new Error(
      `${slug}: lastReviewedAgainst must match the package version ${VERSION}.`,
    );
  }
  const packages = assertStringArray(value.packages, "packages", slug);
  const symbols = assertStringArray(value.symbols, "symbols", slug);

  return {
    title: assertString(value.title, "title", slug),
    description: assertString(value.description, "description", slug),
    order: value.order as number,
    status,
    group: assertString(value.group, "group", slug),
    ...(mode === undefined ? {} : { mode }),
    ...(packages === undefined ? {} : { packages }),
    ...(symbols === undefined ? {} : { symbols }),
    lastReviewedAgainst: reviewed,
  };
}

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function headings(markdown: string): DocHeading[] {
  return [...markdown.matchAll(/^(##|###)\s+(.+)$/gm)].map((match) => ({
    depth: match[1]!.length as 2 | 3,
    id: headingId(match[2]!),
    text: match[2]!.replace(/[`*_]/g, ""),
  }));
}

export function expandGeneratedReferences(markdown: string): string {
  return markdown
    .replace("{{CLI_HELP}}", generated.cliHelp.trim())
    .replace("{{CORE_QUICKSTART}}", generated.coreQuickstart.trim())
    .replace("{{PACKAGE_MATRIX}}", generated.packageMatrix.trim())
    .replace("{{RELEASE_NOTES}}", generated.releaseNotes.trim());
}

let cache: DocPage[] | undefined;

export function getAllDocs(): DocPage[] {
  if (cache) return cache;

  const seen = new Set<string>();
  const pages: DocPage[] = [];

  order.groups.forEach((group, groupIndex) => {
    group.pages.forEach((slug, pageIndex) => {
      if (seen.has(slug))
        throw new Error(`Duplicate docs registry slug: ${slug}`);
      seen.add(slug);

      const sourcePath = path.join(CONTENT_ROOT, `${slug}.md`);
      if (!existsSync(sourcePath)) {
        throw new Error(`Docs registry entry ${slug} has no content file.`);
      }

      const parsed = matter(readFileSync(sourcePath, "utf8"));
      const frontmatter = parseFrontmatter(parsed.data, slug);
      const expectedOrder = groupIndex * 100 + (pageIndex + 1) * 10;
      if (frontmatter.order !== expectedOrder) {
        throw new Error(
          `${slug}: order ${frontmatter.order} does not match registry order ${expectedOrder}.`,
        );
      }
      if (frontmatter.group !== group.label) {
        throw new Error(
          `${slug}: group ${frontmatter.group} does not match registry group ${group.label}.`,
        );
      }

      const markdown = expandGeneratedReferences(parsed.content.trim());
      pages.push({
        ...frontmatter,
        slug,
        sourcePath,
        markdown,
        headings: headings(markdown),
      });
    });
  });

  cache = pages;
  return pages;
}

export function getDoc(slug: string): DocPage | undefined {
  return getAllDocs().find((page) => page.slug === slug);
}

export function getDocGroups(): DocGroup[] {
  const bySlug = new Map(getAllDocs().map((page) => [page.slug, page]));
  return order.groups.map((group) => ({
    label: group.label,
    pages: group.pages.map((slug) => bySlug.get(slug)!),
  }));
}

export function getAdjacentDocs(slug: string): {
  previous?: DocPage;
  next?: DocPage;
} {
  const pages = getAllDocs();
  const index = pages.findIndex((page) => page.slug === slug);
  return {
    ...(index > 0 ? { previous: pages[index - 1] } : {}),
    ...(index >= 0 && index < pages.length - 1
      ? { next: pages[index + 1] }
      : {}),
  };
}
