"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function ResetForm() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  async function onSendReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSending(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset`,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage("Reset link sent. Check your email inbox.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to send reset email right now.");
    } finally {
      setIsSending(false);
    }
  }

  async function onUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsUpdating(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage("Password updated. You can now log in with the new password.");
      setNewPassword("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update password right now.");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="auth-dual-stack">
      <form className="auth-stack" onSubmit={onSendReset}>
        <h2 className="auth-section-title">Send reset link</h2>
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
        <button className="auth-submit" type="submit" disabled={isSending}>
          {isSending ? "SENDING..." : "SEND RESET LINK"}
        </button>
      </form>

      <form className="auth-stack" onSubmit={onUpdatePassword}>
        <h2 className="auth-section-title">Set new password</h2>
        <label className="auth-field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </label>
        <button className="auth-submit" type="submit" disabled={isUpdating}>
          {isUpdating ? "UPDATING..." : "UPDATE PASSWORD"}
        </button>
      </form>

      {errorMessage ? <p className="auth-status auth-error">{errorMessage}</p> : null}
      {successMessage ? <p className="auth-status auth-success">{successMessage}</p> : null}
    </div>
  );
}
