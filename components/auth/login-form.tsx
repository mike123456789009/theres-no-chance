"use client";

import { FormEvent, useEffect, useState } from "react";

import { storePasswordCredential } from "@/lib/auth/password-credential";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
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
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      await storePasswordCredential({ email, password });
      setSuccessMessage("Logged in. Redirecting to markets...");
      window.location.assign("/markets");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to log in right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-stack" onSubmit={onSubmit} autoComplete="on">
      <label className="auth-field">
        <span>Email</span>
        <input
          id="login-email"
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
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
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

      <button className="auth-submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "LOGGING IN..." : "LOG IN"}
      </button>

      {errorMessage ? <p className="auth-status auth-error">{errorMessage}</p> : null}
      {successMessage ? <p className="auth-status auth-success">{successMessage}</p> : null}
    </form>
  );
}
