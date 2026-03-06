import Link from "next/link";

import { LandingAuthRow } from "@/components/landing/auth-row";
import { TncLogo } from "@/components/branding/tnc-logo";
import { StyleToggle } from "@/components/theme/style-toggle";

export default function MarketingPage() {
  return (
    <>
      <a className="sr-only" href="#main">
        Skip to content
      </a>

      <TncLogo className="tnc-logo" decorative />

      <div className="style-toggle-floating style-toggle-floating-marketing">
        <StyleToggle />
      </div>

      <div className="scroll-cue" aria-hidden="true">
        <span className="scroll-cue-text">SCROLL</span>
        <span className="scroll-cue-arrow">↓</span>
      </div>

      <main id="main" className="landing-page">
        <section className="scroll-stage" data-stage>
          <div className="stage-pin">
            <h1 className="sr-only">There&apos;s No Chance</h1>

            <div className="hero-3d-wrap" id="hero3d">
              <canvas id="hero-canvas" aria-hidden="true"></canvas>
            </div>

            <p className="after-box after-box-primary hero-transition-cta" aria-hidden="true">
              BET ON REALITY
            </p>
          </div>
        </section>

        <section className="after-scroll">
          <div className="after-content">
            <p className="after-box after-box-secondary reveal-item" data-reveal-delay="0">
              A local-first prediction market
            </p>

            <div className="feature-columns reveal-item" data-reveal-delay="1" aria-label="Platform features">
              <ul className="feature-list">
                <li>Create clear yes/no markets in minutes.</li>
                <li>Forecast local sports outcomes and season milestones.</li>
                <li>Track city council votes, zoning approvals, and project timelines.</li>
                <li>Run private, institution-gated markets for your community.</li>
              </ul>
              <ul className="feature-list">
                <li>Predict average test results by grade, class, or term.</li>
                <li>Build markets for hedging against poor academic performance.</li>
                <li>Forecast faculty retirement dates and staffing transitions.</li>
                <li>Estimate how many classes will be offered next semester.</li>
                <li>Model class attendance on specific days tied to weather or events.</li>
              </ul>
            </div>

            <section className="token-economy reveal-item" data-reveal-delay="2" aria-label="Payments and token economy">
              <h2 className="token-title">Payments &amp; Token Economy</h2>
              <p className="token-copy">Fund your account in USD through Venmo and trade with wallet balance.</p>

              <div className="payment-grid">
                <article className="payment-card">
                  <h3 className="payment-title">Venmo deposits (manual reconciliation)</h3>
                  <p className="payment-note">Each Venmo deposit requires a generated invoice code in the payment note.</p>
                  <ul className="plan-list">
                    <li>
                      <span className="plan-name">You pay</span>
                      <span>Enter any amount within wallet limits.</span>
                    </li>
                    <li>
                      <span className="plan-name">Required note</span>
                      <span>Use the invoice code exactly as shown in wallet.</span>
                    </li>
                    <li>
                      <span className="plan-name">Deposit credit</span>
                      <span>Wallet credit is posted at gross amount.</span>
                    </li>
                    <li>
                      <span className="plan-name">Withdrawal fee</span>
                      <span>Venmo processing fee is applied when cashing out.</span>
                    </li>
                  </ul>
                </article>

                <article className="payment-card">
                  <h3 className="payment-title">Wallet credit timing</h3>
                  <p className="payment-note">Venmo payments are matched against your invoice code and posted into wallet.</p>
                  <ul className="plan-list">
                    <li>
                      <span className="plan-name">Auto match</span>
                      <span>Exact note and amount matches are credited directly into your wallet.</span>
                    </li>
                    <li>
                      <span className="plan-name">Manual review</span>
                      <span>Missing or edited codes can send a payment into the admin review queue.</span>
                    </li>
                    <li>
                      <span className="plan-name">Ledger visibility</span>
                      <span>Gross deposits and withdrawal fees are visible in wallet and admin history.</span>
                    </li>
                  </ul>
                </article>
              </div>

              <p className="redeem-note">
                Wallet and admin reconciliation views track gross deposit amounts while withdrawal flows apply Venmo fee
                policy.
              </p>
            </section>

            <section className="auth-row-wrap reveal-item" data-reveal-delay="3" aria-label="Login and signup">
              <LandingAuthRow />
            </section>

            <section className="faq-wrap reveal-item" data-reveal-delay="4" aria-label="Frequently asked questions">
              <details className="faq-expander">
                <summary className="faq-trigger" aria-controls="faq-content">
                  <span className="faq-plus" aria-hidden="true">
                    +
                  </span>
                  <span className="faq-label">FAQ</span>
                </summary>

                <div id="faq-content" className="faq-content">
                  <article className="faq-item">
                    <h3>How do markets resolve?</h3>
                    <p>
                      Markets use community resolution by default with a fixed vote window, challenge window, and
                      adjudication rules for ties/challenges. See the full flow on the Community Resolve page.
                    </p>
                    <p>
                      <Link href="/community-resolve">Open community resolve explainer</Link>
                    </p>
                  </article>

                  <article className="faq-item">
                    <h3>What is the dispute process and timing?</h3>
                    <p>
                      After provisional outcome, eligible out-voted resolvers can challenge by doubling their original
                      stake. No challenge means automatic finalization to vote outcome; challenged markets go to human
                      adjudication.
                    </p>
                  </article>

                  <article className="faq-item">
                    <h3>How are fees handled?</h3>
                    <p>
                      Trading and payout fees are shown in quote/checkout flows before execution. Fee policy is set per
                      market or platform rules and is recorded in the ledger.
                    </p>
                  </article>

                  <article className="faq-item">
                    <h3>How do withdrawals work?</h3>
                    <p>
                      Withdrawals require eligibility checks including KYC status, risk controls, and minimum
                      thresholds. Requests move through pending, completed, or failed states with reason tracking.
                    </p>
                  </article>

                  <article className="faq-item">
                    <h3>Can I run private or institution-only markets?</h3>
                    <p>
                      Yes. v1 supports gated access using approved organization and domain rules so only verified
                      members can discover or trade selected markets.
                    </p>
                  </article>
                </div>
              </details>
            </section>
          </div>
        </section>
      </main>

      <script type="module" src="/script.js"></script>
    </>
  );
}
