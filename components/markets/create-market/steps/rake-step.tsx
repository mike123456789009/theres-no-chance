export function RakeStep() {
  return (
    <>
      <h2>Market-maker rake</h2>
      <p className="create-copy">
        Market maker rake starts at <strong>0.5%</strong> for smaller markets and decreases as market size grows.
      </p>
      <p className="create-note">
        Creator payout is settled after final market resolution, never before adjudication/finalization.
      </p>
    </>
  );
}
