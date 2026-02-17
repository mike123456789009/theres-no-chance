"use client";

import Link from "next/link";
import { MouseEvent, useRef } from "react";
import { useRouter } from "next/navigation";

function buildAuthHref(pathname: string, email: string): string {
  const normalized = email.trim();
  if (!normalized) return pathname;

  const params = new URLSearchParams({ email: normalized });
  return `${pathname}?${params.toString()}`;
}

export function LandingAuthRow() {
  const router = useRouter();
  const emailInputRef = useRef<HTMLInputElement>(null);

  function onAuthLinkClick(pathname: string) {
    return (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      const email = emailInputRef.current?.value ?? "";
      router.push(buildAuthHref(pathname, email));
    };
  }

  return (
    <div className="auth-row-shell">
      <div className="auth-row">
        <Link className="auth-btn auth-btn-login" href="/login" onClick={onAuthLinkClick("/login")}>
          LOGIN
        </Link>
        <Link className="auth-btn auth-btn-signup" href="/signup" onClick={onAuthLinkClick("/signup")}>
          SIGN UP
        </Link>
        <label className="sr-only" htmlFor="email-input">
          Enter email
        </label>
        <input
          id="email-input"
          className="auth-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Enter email"
          ref={emailInputRef}
        />
      </div>

      <p className="auth-row-note">
        Exploring first? <Link href="/markets">Browse public markets</Link>. Institution markets require login and
        actions require an account.
      </p>
    </div>
  );
}
