import Link from "next/link";

export function RulesStep() {
  return (
    <>
      <h2>Market maker rules</h2>
      <p className="create-copy">
        Every market must be objective, verifiable, and written so independent resolvers can determine the same answer.
      </p>
      <p className="create-copy">
        Your market needs clear YES/NO outcomes, objective evidence sources, and a finite close time.
      </p>
      <p className="create-note">You will provide market basics, binary criteria, and optional references across the next cards.</p>
      <p className="create-note">
        Learn the full lifecycle in <Link href="/community-resolve">Community Resolve</Link>.
      </p>
    </>
  );
}
