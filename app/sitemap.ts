import type { MetadataRoute } from "next";

const SITE_URL = "https://theres-no-chance.com";

// Static public routes. (Dynamic market pages could be appended here later by
// reading the public markets barrel; kept static to avoid build-time DB calls.)
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/markets", "/login"];
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "daily",
    priority: path === "" ? 1 : 0.7,
  }));
}
