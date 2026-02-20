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
              <p className="token-copy">
                Fund your account in USD and trade with wallet balance. Current funding methods are Venmo and Coinbase
                Commerce.
              </p>

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
                      <span className="plan-name">Fee-aware credit</span>
                      <span>Wallet credit is posted at gross minus Venmo fee.</span>
                    </li>
                  </ul>
                </article>

                <article className="payment-card">
                  <h3 className="payment-title">Coinbase Commerce (USDC on Base)</h3>
                  <p className="payment-note">Hosted checkout for fixed USD wallet topups.</p>
                  <ul className="plan-list">
                    <li>
                      <span className="plan-name">USD funding</span>
                      <span>Choose your amount and complete hosted payment.</span>
                    </li>
                    <li>
                      <span className="plan-name">Crediting</span>
                      <span>Coinbase deposits are credited at gross amount.</span>
                    </li>
                  </ul>
                </article>
              </div>

              <p className="redeem-note">
                Wallet and admin reconciliation views display gross payment, fee, and net credit details for deposit
                transparency.
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
                      Every market includes explicit yes/no resolution criteria, an expected resolution window, and
                      official source guidance. Markets can use admin resolution or community resolution with admin
                      adjudication before finalization.
                    </p>
                  </article>

                  <article className="faq-item">
                    <h3>What is the dispute process and timing?</h3>
                    <p>
                      After resolution, disputes can be filed during a configurable review window (default 48 hours).
                      If you successfully challenge an incorrect resolution, you share a Successful Challenge Bonus paid
                      from the same resolver reward pool used for settlement work.
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
