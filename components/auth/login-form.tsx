"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

      setSuccessMessage("Logged in. Redirecting...");
      router.push("/");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to log in right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-stack" onSubmit={onSubmit}>
      <label className="auth-field">
        <span>Email</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      <label className="auth-field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>

      <button className="auth-submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "LOGGING IN..." : "LOG IN"}
      </button>

      {errorMessage ? <p className="auth-status auth-error">{errorMessage}</p> : null}
      {successMessage ? <p className="auth-status auth-success">{successMessage}</p> : null}
    </form>
  );
}
