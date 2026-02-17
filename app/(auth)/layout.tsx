import { AuthBackNavFlag } from "@/components/auth/auth-back-nav-flag";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="auth-page">
      <div className="auth-page-inner">
        <AuthBackNavFlag />
        <a href="/" className="auth-home-link">
          ← Back to landing
        </a>
        {children}
      </div>
    </main>
  );
}
