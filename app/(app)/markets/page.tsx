import {
  MarketsDiscoveryHeaderSection,
  MarketsDiscoveryResultsSection,
} from "@/components/markets/page-sections";
import { loadDiscoveryPageData, type SearchParamsInput } from "@/lib/markets/pages/discovery";

export const dynamic = "force-dynamic";

export default async function MarketsPage({
  searchParams,
}: Readonly<{ searchParams?: SearchParamsInput }>) {
  const pageData = await loadDiscoveryPageData({ searchParams });

  if (pageData.kind === "env_missing") {
    return (
      <main className="markets-product-page">
        <section className="markets-product-alert" aria-label="Market discovery configuration error">
          <h1>Market discovery unavailable</h1>
          <p>
            Missing environment values: <code>{pageData.missingEnv.join(", ")}</code>
          </p>
          <p>
            Return to <a href="/">landing</a>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="markets-product-page">
      <MarketsDiscoveryHeaderSection
        query={pageData.query}
        viewer={pageData.viewer}
        accountSummary={pageData.accountSummary}
      />
      <MarketsDiscoveryResultsSection viewer={pageData.viewer} result={pageData.result} loadError={pageData.loadError} />
    </main>
  );
}
