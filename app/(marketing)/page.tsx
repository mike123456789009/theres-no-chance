const threeImportMap = {
  imports: {
    three: "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/",
  },
};

export default function MarketingPage() {
  return (
    <>
      <a className="sr-only" href="#main">
        Skip to content
      </a>

      <script
        type="importmap"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(threeImportMap),
        }}
      />

      <div className="tnc-logo" aria-hidden="true">
        <span className="logo-letter red">T</span>
        <span className="logo-letter gold">N</span>
        <span className="logo-letter red">C</span>
      </div>

      <div className="scroll-cue" aria-hidden="true">
        <span className="scroll-cue-text">SCROLL</span>
        <span className="scroll-cue-arrow">↓</span>
      </div>

      <main id="main">
        <section className="scroll-stage" data-stage>
          <div className="stage-pin">
            <h1 className="sr-only">There&apos;s No Chance</h1>

            <div className="hero-3d-wrap" id="hero3d">
              <canvas id="hero-canvas" aria-hidden="true"></canvas>

              <div className="fallback-words" aria-hidden="true">
                <div className="w red">THERE&apos;S</div>
                <div className="w gold w-no">NO</div>
                <div className="w slash w-slash">/</div>
                <div className="w gold w-a">A</div>
                <div className="w red">CHANCE</div>
              </div>
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
                Fund your account two ways: subscribe for the best token value each month, or buy one-time token
                packs whenever you need them.
              </p>

              <div className="payment-grid">
                <article className="payment-card">
                  <h3 className="payment-title">Subscription tiers (best deal)</h3>
                  <p className="payment-note">Each tier lowers your cost per token.</p>
                  <ul className="plan-list">
                    <li>
                      <span className="plan-name">Starter</span>
                      <span>$29/mo · 260 tokens · $0.11/token</span>
                    </li>
                    <li>
                      <span className="plan-name">Pro</span>
                      <span>$79/mo · 830 tokens · $0.095/token</span>
                    </li>
                    <li>
                      <span className="plan-name">Premium</span>
                      <span>$179/mo · 2,060 tokens · $0.087/token</span>
                    </li>
                  </ul>
                </article>

                <article className="payment-card">
                  <h3 className="payment-title">One-time token purchases</h3>
                  <p className="payment-note">Pay once with no recurring commitment.</p>
                  <ul className="plan-list">
                    <li>
                      <span className="plan-name">Quick Start</span>
                      <span>$20 · 120 tokens · $0.167/token</span>
                    </li>
                    <li>
                      <span className="plan-name">Standard</span>
                      <span>$50 · 330 tokens · $0.152/token</span>
                    </li>
                    <li>
                      <span className="plan-name">Large</span>
                      <span>$100 · 700 tokens · $0.143/token</span>
                    </li>
                  </ul>
                </article>
              </div>

              <p className="redeem-note">
                Tokens are redeemable and withdrawable. When markets settle, winnings and unused token value can be
                converted and withdrawn from your account.
              </p>
            </section>

            <section className="auth-row-wrap reveal-item" data-reveal-delay="3" aria-label="Login and signup">
              <div className="auth-row">
                <button type="button" className="auth-btn auth-btn-login">
                  LOGIN
                </button>
                <button type="button" className="auth-btn auth-btn-signup">
                  SIGN UP
                </button>
                <label className="sr-only" htmlFor="email-input">
                  Enter email
                </label>
                <input
                  id="email-input"
                  className="auth-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Enter email"
                />
              </div>
            </section>
          </div>
        </section>
      </main>

      <script type="module" src="/script.js"></script>
    </>
  );
}
