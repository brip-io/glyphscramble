export type DocStatus = "available" | "planned";
export type DeliveryMode = "per-response" | "static" | "both";

export interface DocFrontmatter {
  title: string;
  description: string;
  order: number;
  status: DocStatus;
  group: string;
  mode?: DeliveryMode;
  packages?: string[];
  symbols?: string[];
  lastReviewedAgainst: string;
}

export interface DocHeading {
  depth: 2 | 3;
  id: string;
  text: string;
}

export interface DocPage extends DocFrontmatter {
  slug: string;
  sourcePath: string;
  markdown: string;
  headings: DocHeading[];
}

export interface DocGroup {
  label: string;
  pages: DocPage[];
}
