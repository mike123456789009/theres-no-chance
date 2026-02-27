import { SYSTEM_DISPUTE_RULES, SYSTEM_EVIDENCE_RULES } from "@/lib/markets/create-market";

export function EvidenceStep() {
  return (
    <>
      <h2>Fees and platform policy</h2>
      <p className="create-copy">
        Submitting for review charges a fixed <strong>$0.50</strong> listing fee from your wallet.
      </p>
      <p className="create-copy">
        Market maker rake starts at <strong>0.5%</strong> for smaller markets and decreases as market size grows.
      </p>
      <p className="create-copy">Evidence requirements are system-owned and cannot be customized per market.</p>
      <p className="create-note">
        Creator payout is settled after final market resolution, never before adjudication/finalization.
      </p>
      <p className="create-note">{SYSTEM_EVIDENCE_RULES}</p>
      <p className="create-note">{SYSTEM_DISPUTE_RULES}</p>
    </>
  );
}
