"use client";

import { FormEvent, useEffect, useState } from "react";

import { resolveAppBaseUrl } from "@/lib/app/base-url";
import { storePasswordCredential } from "@/lib/auth/password-credential";
import { createClient } from "@/lib/supabase/client";

export function ResetForm() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPreparingRecovery, setIsPreparingRecovery] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepareRecoverySession() {
      setIsPreparingRecovery(true);

      try {
        const supabase = createClient();
        const url = new URL(window.location.href);
        const queryParams = url.searchParams;
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

        const code = queryParams.get("code") ?? hashParams.get("code");
        const tokenHash = queryParams.get("token_hash") ?? hashParams.get("token_hash");
        const type = (queryParams.get("type") ?? hashParams.get("type")) as
          | "signup"
          | "invite"
          | "magiclink"
          | "recovery"
          | "email_change"
          | null;
        const accessToken = queryParams.get("access_token") ?? hashParams.get("access_token");
        const refreshToken = queryParams.get("refresh_token") ?? hashParams.get("refresh_token");
        const authErrorDescription =
          queryParams.get("error_description") ?? hashParams.get("error_description");

        if (authErrorDescription) {
          if (!cancelled) {
            setErrorMessage(decodeURIComponent(authErrorDescription));
            setHasRecoverySession(false);
          }
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (!cancelled) {
              setErrorMessage(error.message);
              setHasRecoverySession(false);
            }
            return;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            if (!cancelled) {
              setErrorMessage(error.message);
              setHasRecoverySession(false);
            }
            return;
          }
        } else if (tokenHash && type === "recovery") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error) {
            if (!cancelled) {
              setErrorMessage(error.message);
              setHasRecoverySession(false);
            }
            return;
          }
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!cancelled) {
          if (sessionError) {
            setErrorMessage(sessionError.message);
            setHasRecoverySession(false);
          } else {
            setHasRecoverySession(Boolean(session));
            if (session) {
              const sessionEmail = session.user.email?.trim();
              if (sessionEmail) {
                setEmail(sessionEmail);
              }
              setSuccessMessage("Reset link verified. Enter your new password below.");
            }
          }
        }

        // Remove one-time auth tokens from URL after they are consumed.
        queryParams.delete("code");
        queryParams.delete("token_hash");
        queryParams.delete("access_token");
        queryParams.delete("refresh_token");
        queryParams.delete("type");
        queryParams.delete("error");
        queryParams.delete("error_description");
        hashParams.delete("code");
        hashParams.delete("token_hash");
        hashParams.delete("access_token");
        hashParams.delete("refresh_token");
        hashParams.delete("type");
        hashParams.delete("error");
        hashParams.delete("error_description");

        const cleanedQuery = queryParams.toString();
        const cleanedHash = hashParams.toString();
        const cleanedUrl = `${url.pathname}${cleanedQuery ? `?${cleanedQuery}` : ""}${cleanedHash ? `#${cleanedHash}` : ""}`;
        window.history.replaceState(window.history.state, "", cleanedUrl);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to verify reset link right now.");
          setHasRecoverySession(false);
        }
      } finally {
        if (!cancelled) {
          setIsPreparingRecovery(false);
        }
      }
    }

    void prepareRecoverySession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSendReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSending(true);

    try {
      const supabase = createClient();
      const redirectBaseUrl = resolveAppBaseUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${redirectBaseUrl}/reset`,
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

    if (newPassword !== confirmNewPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsUpdating(true);

    try {
      const supabase = createClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        setErrorMessage(sessionError.message);
        setHasRecoverySession(false);
        return;
      }

      if (!session) {
        setHasRecoverySession(false);
        setErrorMessage("Auth session missing. Open your password reset email link and try again.");
        return;
      }

      const sessionEmail = session.user.email?.trim() ?? email.trim();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      await storePasswordCredential({ email: sessionEmail, password: newPassword });
      setSuccessMessage("Password updated. You can now log in with the new password.");
      setNewPassword("");
      setConfirmNewPassword("");
      setHasRecoverySession(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update password right now.");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="auth-dual-stack">
      <form className="auth-stack" onSubmit={onSendReset} autoComplete="on">
        <h2 className="auth-section-title">Send reset link</h2>
        <label className="auth-field">
          <span>Email</span>
          <input
            id="reset-request-email"
            name="email"
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

      <form className="auth-stack" onSubmit={onUpdatePassword} autoComplete="on">
        <h2 className="auth-section-title">Set new password</h2>
        <input
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
        <label className="auth-field">
          <span>New password</span>
          <div className="auth-password-row">
            <input
              id="reset-new-password"
              name="new-password"
              type={showNewPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowNewPassword((current) => !current)}
              aria-label={showNewPassword ? "Hide password" : "Show password"}
            >
              {showNewPassword ? "HIDE" : "SHOW"}
            </button>
          </div>
        </label>
        <label className="auth-field">
          <span>Confirm new password</span>
          <input
            id="reset-confirm-new-password"
            name="confirm-new-password"
            type={showNewPassword ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            value={confirmNewPassword}
            onChange={(event) => setConfirmNewPassword(event.target.value)}
            required
          />
        </label>
        <button className="auth-submit" type="submit" disabled={isUpdating || isPreparingRecovery || !hasRecoverySession}>
          {isUpdating ? "UPDATING..." : isPreparingRecovery ? "VERIFYING LINK..." : "UPDATE PASSWORD"}
        </button>
      </form>

      {!isPreparingRecovery && !hasRecoverySession && !errorMessage ? (
        <p className="auth-status">Use your password-reset email link to enable the update form.</p>
      ) : null}
      {errorMessage ? <p className="auth-status auth-error">{errorMessage}</p> : null}
      {successMessage ? <p className="auth-status auth-success">{successMessage}</p> : null}
    </div>
  );
}
