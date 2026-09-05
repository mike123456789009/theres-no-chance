import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-metadata";

// Only public content routes: generating this file never requires database access.
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/markets", "/community-resolve"].map((path) => ({
    url: new URL(path, SITE_URL).href,
  }));
}
