export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: Readonly<{
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}>) {
  return (
    <section className="auth-card" aria-label={`${title} form`}>
      <h1 className="auth-title">{title}</h1>
      <p className="auth-subtitle">{subtitle}</p>
      {children}
      {footer}
    </section>
  );
}
