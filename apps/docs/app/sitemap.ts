import type { MetadataRoute } from "next";
import { getAllDocs } from "../src/docs/content";

export const dynamic = "force-static";

const routes = [
  "/",
  "/demo/",
  "/docs/",
  ...getAllDocs().map((page) => `/docs/${page.slug}/`),
  "/responsible-use/",
  "/privacy/",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: new URL(route, "https://glyphscramble.brip.io").href,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority:
      route === "/"
        ? 1
        : route === "/demo/"
          ? 0.9
          : route === "/docs/"
            ? 0.9
            : 0.8,
  }));
}
