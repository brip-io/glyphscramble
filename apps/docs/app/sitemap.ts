import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const routes = ["", "/demo", "/docs", "/responsible-use", "/privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `https://glyphscramble.brip.io${route}`,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/demo" ? 0.9 : 0.8,
  }));
}
