import { SYSTEM_DISPUTE_RULES, SYSTEM_EVIDENCE_RULES } from "@/lib/markets/create-market";

export function EvidenceStep() {
  return (
    <>
      <h2>Platform evidence policy</h2>
      <p className="create-copy">Evidence requirements are system-owned and cannot be customized per market.</p>
      <p className="create-note">{SYSTEM_EVIDENCE_RULES}</p>
      <p className="create-note">{SYSTEM_DISPUTE_RULES}</p>
    </>
  );
}
