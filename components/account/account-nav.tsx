"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AccountNavItem = {
  label: string;
  href: string;
  description: string;
};

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

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav className="account-nav" aria-label="Account sections">
      {ACCOUNT_NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);

        return (
          <Link key={item.href} className={active ? "account-nav-link is-active" : "account-nav-link"} href={item.href}>
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}
