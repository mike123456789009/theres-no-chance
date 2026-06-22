import Link from "next/link";

export function ResolvableStep() {
  return (
    <>
      <h2>Must be resolvable</h2>
      <p className="create-copy">Your market needs clear YES/NO outcomes, objective evidence, and a finite close time.</p>
      <p className="create-note">
        Learn the full lifecycle in <Link href="/community-resolve">Community Resolve</Link>.
      </p>
    </>
  );
}
