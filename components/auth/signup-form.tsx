"use client";

import { FormEvent, useEffect, useState } from "react";

import { resolveAppBaseUrl } from "@/lib/app/base-url";
import { storePasswordCredential } from "@/lib/auth/password-credential";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const prefilled = new URLSearchParams(window.location.search).get("email")?.trim() ?? "";
    if (!prefilled) return;
    setEmail((current) => (current ? current : prefilled));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setPendingConfirmationEmail("");

    const normalizedEmail = email.trim();

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const redirectBaseUrl = resolveAppBaseUrl();
      const loginRedirectUrl = new URL("/login", redirectBaseUrl);
      loginRedirectUrl.searchParams.set("email", normalizedEmail);
      loginRedirectUrl.searchParams.set("confirmed", "1");
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: loginRedirectUrl.toString(),
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      await storePasswordCredential({ email: normalizedEmail, password });

      if (data.session) {
        setSuccessMessage("Account created. Redirecting to markets...");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        window.location.assign("/markets");
        return;
      }

      setPendingConfirmationEmail(normalizedEmail);
      setSuccessMessage("Account created. Check your inbox, confirm your email, then log in.");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create account right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-stack" onSubmit={onSubmit} autoComplete="on">
      <label className="auth-field">
        <span>Email</span>
        <input
          id="signup-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      <label className="auth-field">
        <span>Password</span>
        <div className="auth-password-row">
          <input
            id="signup-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            type="button"
            className="auth-password-toggle"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "HIDE" : "SHOW"}
          </button>
        </div>
      </label>

      <label className="auth-field">
        <span>Confirm password</span>
        <input
          id="signup-confirm-password"
          name="confirm-password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </label>

      <button className="auth-submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "CREATING ACCOUNT..." : "SIGN UP"}
      </button>

      {errorMessage ? <p className="auth-status auth-error">{errorMessage}</p> : null}
      {successMessage ? <p className="auth-status auth-success">{successMessage}</p> : null}
      {pendingConfirmationEmail ? (
        <p className="auth-status">
          Confirmation email sent to <strong>{pendingConfirmationEmail}</strong>. After confirming,{" "}
          <a href={`/login?email=${encodeURIComponent(pendingConfirmationEmail)}&confirmed=1`}>log in here</a>.
        </p>
      ) : null}
    </form>
  );
}
