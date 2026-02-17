import Link from "next/link";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="auth-page">
      <div className="auth-page-inner">
        <Link href="/" className="auth-home-link">
          ← Back to landing
        </Link>
        {children}
      </div>
    </main>
  );
}
