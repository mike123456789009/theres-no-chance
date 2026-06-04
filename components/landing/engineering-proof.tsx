import Link from "next/link";

export const ENGINEERING_PROOF_ITEMS = [
  {
    label: "Full-stack product",
    body: "Institution access, market creation, trading, wallet, admin review, and resolution flows live behind the landing page.",
  },
  {
    label: "AI agent work",
    body: "Market-research automation drafts candidate markets, applies quality gates, and separates public from institution-specific scans.",
  },
  {
    label: "Instrumentation",
    body: "Webhook events, wallet ledgers, admin health checks, and market-operation status views make regressions visible.",
  },
  {
    label: "Quality gates",
    body: "Focused Vitest coverage protects trade math, access rules, webhooks, deposits, withdrawals, and resolution behavior.",
  },
] as const;

export function EngineeringProof() {
  return (
    <section className="engineering-proof reveal-item" data-reveal-delay="3" aria-label="Engineering proof">
      <div className="engineering-proof-header">
        <p className="proof-kicker">Built as software, not a mockup</p>
        <h2>Public landing page backed by real product surfaces.</h2>
        <p>
          The marketing site links into a working Next.js app with backend routes, gated data access, wallet controls,
          AI-assisted market sourcing, and regression tests around the risky paths.
        </p>
      </div>
      <div className="engineering-proof-grid">
        {ENGINEERING_PROOF_ITEMS.map((item) => (
          <article key={item.label} className="engineering-proof-card">
            <h3>{item.label}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
      <p className="engineering-proof-links">
        <Link href="/markets">Browse markets</Link>
        <span aria-hidden="true"> / </span>
        <Link href="/community-resolve">Read resolution flow</Link>
      </p>
    </section>
  );
}
