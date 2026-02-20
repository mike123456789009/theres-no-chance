"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AccountNavItem = {
  label: string;
  href: string;
  description: string;
};

type AccountMode = "account" | "admin";

const ACCOUNT_NAV_ITEMS: AccountNavItem[] = [
  {
    label: "Overview",
    href: "/account/overview",
    description: "Snapshot and shortcuts",
  },
  {
    label: "Portfolio",
    href: "/account/portfolio",
    description: "Positions and P&L",
  },
  {
    label: "Wallet",
    href: "/account/wallet",
    description: "Balances and deposits",
  },
  {
    label: "Settings",
    href: "/account/settings",
    description: "Profile and preferences",
  },
  {
    label: "Activity",
    href: "/account/activity",
    description: "Recent ledger and fills",
  },
];

const ADMIN_NAV_ITEMS: AccountNavItem[] = [
  {
    label: "Market maker",
    href: "/account/admin/market-maker",
    description: "Proposals and run controls",
  },
  {
    label: "Users",
    href: "/account/admin/users",
    description: "Full account histories",
  },
  {
    label: "Moderation",
    href: "/account/admin/moderation",
    description: "Resolution and disputes",
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolveMode(pathname: string): AccountMode {
  return pathname.startsWith("/account/admin") ? "admin" : "account";
}

export function AccountNav({ canAccessAdmin }: Readonly<{ canAccessAdmin: boolean }>) {
  const pathname = usePathname();
  const mode = canAccessAdmin ? resolveMode(pathname) : "account";
  const navItems = mode === "admin" ? ADMIN_NAV_ITEMS : ACCOUNT_NAV_ITEMS;

  return (
    <div className="account-nav-stack">
      {canAccessAdmin ? (
        <section className="account-mode-pane" aria-label="Account mode">
          <p className="account-nav-kicker">Mode</p>
          <div className="account-mode-switch">
            <Link className={mode === "account" ? "account-mode-link is-active" : "account-mode-link"} href="/account/overview">
              <strong>Account</strong>
              <span>Profile and balances</span>
            </Link>
            <Link className={mode === "admin" ? "account-mode-link is-active" : "account-mode-link"} href="/account/admin/market-maker">
              <strong>Admin</strong>
              <span>Platform controls</span>
            </Link>
          </div>
        </section>
      ) : null}

      <section className="account-section-pane" aria-label={`${mode} pages`}>
        <p className="account-nav-kicker">{mode === "admin" ? "Admin pages" : "Account pages"}</p>
        <nav className="account-nav" aria-label={`${mode} sections`}>
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link key={item.href} className={active ? "account-nav-link is-active" : "account-nav-link"} href={item.href}>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </Link>
            );
          })}
        </nav>
      </section>
    </div>
  );
}
