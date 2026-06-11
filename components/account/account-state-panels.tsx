import Link from "next/link";

type AccountUnavailablePanelProps = {
  kicker: string;
  title: string;
  copy: string;
  missingEnv: string[];
  continueHref?: string;
  continueLabel?: string;
  ariaLabel: string;
};

type AccountLoginRequiredPanelProps = {
  kicker: string;
  title: string;
  copy: string;
  ariaLabel: string;
  showSignup?: boolean;
  showBackToMarkets?: boolean;
};

export function AccountUnavailablePanel({
  kicker,
  title,
  copy,
  missingEnv,
  continueHref,
  continueLabel,
  ariaLabel,
}: AccountUnavailablePanelProps) {
  return (
    <section className="account-panel account-panel-warning" aria-label={ariaLabel}>
      <p className="create-kicker">{kicker}</p>
      <h1 className="create-title">{title}</h1>
      <p className="create-copy">{copy}</p>
      <p className="create-copy">
        Missing env vars: <code>{missingEnv.join(", ")}</code>
      </p>
      {continueHref && continueLabel ? (
        <p className="create-copy">
          Continue to <Link href={continueHref}>{continueLabel}</Link>
        </p>
      ) : null}
    </section>
  );
}

export function AccountLoginRequiredPanel({
  kicker,
  title,
  copy,
  ariaLabel,
  showSignup = true,
  showBackToMarkets = true,
}: AccountLoginRequiredPanelProps) {
  return (
    <section className="account-panel" aria-label={ariaLabel}>
      <p className="create-kicker">{kicker}</p>
      <h1 className="create-title">{title}</h1>
      <p className="create-copy">{copy}</p>
      <div className="create-actions account-actions-top">
        <Link className="create-submit create-submit-muted" href="/login">
          Log in
        </Link>
        {showSignup ? (
          <Link className="create-submit" href="/signup">
            Create account
          </Link>
        ) : null}
        {showBackToMarkets ? (
          <Link className="create-submit create-submit-muted" href="/markets">
            Back to markets
          </Link>
        ) : null}
      </div>
    </section>
  );
}
