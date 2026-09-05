import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Run against `npm start` to check the actual Next.js output, not just exports.
const baseUrl = new URL(process.env.TNC_VERIFY_BASE_URL || "http://127.0.0.1:3000");
const siteUrl = "https://theres-no-chance.com";
const siteName = "Theres No Chance";
const siteDescription =
  "Campus-gated prediction markets with institution access, wallet flows, AI-assisted market research, and community resolution.";

async function readRoute(path, contentType) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "Twitterbot/1.0" },
  });
  assert.equal(response.status, 200, `${path} must return 200`);
  assert.match(response.headers.get("content-type") || "", contentType, `${path} content type`);
  return response.text();
}

const [html, robots, sitemap] = await Promise.all([
  readRoute("/", /text\/html/),
  readRoute("/robots.txt", /text\/plain/),
  readRoute("/sitemap.xml", /(?:application|text)\/xml/),
]);

const document = new JSDOM(html).window.document;
assert.equal(document.title, siteName);
assert.equal(document.querySelector('link[rel="canonical"]')?.href, `${siteUrl}/`);
for (const [attribute, name, expected] of [
  ["name", "description", siteDescription],
  ["property", "og:type", "website"],
  ["property", "og:url", siteUrl],
  ["property", "og:site_name", siteName],
  ["property", "og:title", siteName],
  ["property", "og:description", siteDescription],
  ["name", "twitter:card", "summary"],
  ["name", "twitter:title", siteName],
  ["name", "twitter:description", siteDescription],
]) {
  assert.equal(document.querySelector(`meta[${attribute}="${name}"]`)?.content, expected, name);
}

assert.match(robots, /^User-Agent: \*$/im);
assert.match(robots, /^Allow: \/$/im);
assert.ok(robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`));

const sitemapDocument = new JSDOM(sitemap, { contentType: "application/xml" }).window.document;
assert.equal(sitemapDocument.documentElement.localName, "urlset");
const locations = [...sitemapDocument.querySelectorAll("url > loc")].map((node) => node.textContent);
assert.deepEqual(locations.sort(), [`${siteUrl}/`, `${siteUrl}/markets`, `${siteUrl}/community-resolve`].sort());

console.log("Public metadata verified: crawler HTML, robots.txt, and public-content sitemap.");
