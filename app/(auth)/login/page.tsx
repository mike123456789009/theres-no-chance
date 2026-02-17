import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthShell
      title="Log In"
      subtitle="Access your markets, positions, and account settings."
      footer={
        <p className="auth-meta-links">
          New here? <Link href="/signup">Create an account</Link> · <Link href="/reset">Reset password</Link> ·{" "}
          <Link href="/markets">Browse public markets</Link>
        </p>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
