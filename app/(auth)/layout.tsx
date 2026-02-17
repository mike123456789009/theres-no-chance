import Link from "next/link";

import { AuthBackNavFlag } from "@/components/auth/auth-back-nav-flag";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="auth-page">
      <div className="auth-page-inner">
        <AuthBackNavFlag />
        <Link href="/" className="auth-home-link">
          ← Back to landing
        </Link>
        {children}
      </div>
    </main>
  );
}
