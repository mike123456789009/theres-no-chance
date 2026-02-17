import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthShell
      title="Sign Up"
      subtitle="Create your account to start trading prediction markets."
      footer={
        <p className="auth-meta-links">
          Already have an account? <Link href="/login">Log in</Link> · <Link href="/markets">Browse public markets</Link>
        </p>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
