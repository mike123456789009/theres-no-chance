"use client";

export default function MarketsErrorPage({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <main className="markets-product-page">
      <section className="markets-product-alert" aria-label="Markets load error">
        <h1>Markets temporarily unavailable</h1>
        <p>
          We hit a server-side issue while loading market discovery. Please retry, or return to the landing page.
        </p>
        {error.digest ? (
          <p>
            Error digest: <code>{error.digest}</code>
          </p>
        ) : null}
        <p>
          <button type="button" className="markets-toolbar-apply" onClick={reset}>
            Retry
          </button>
        </p>
        <p>
          <a href="/">Back to landing</a>
        </p>
      </section>
    </main>
  );
}
