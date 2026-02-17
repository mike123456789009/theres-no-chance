import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/reset-form";

export default function ResetPage() {
  return (
    <AuthShell
      title="Reset Password"
      subtitle="Request a reset link and set a new password from your secure email flow."
      footer={
        <p className="auth-meta-links">
          Return to <Link href="/login">Log in</Link>
        </p>
      }
    >
      <ResetForm />
    </AuthShell>
  );
}
