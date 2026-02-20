"use client";

import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { PIXEL_AVATAR_OPTIONS, isPixelAvatarUrl } from "@/components/account/avatar-options";
import { useUiStyle } from "@/components/theme/ui-style-sync";

type ProfileEditorProps = {
  initialDisplayName: string;
  initialAvatarUrl: string;
};

function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function ProfileEditor({ initialDisplayName, initialAvatarUrl }: ProfileEditorProps) {
  const { uiStyle } = useUiStyle();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedAvatar = useMemo(
    () => PIXEL_AVATAR_OPTIONS.find((option) => option.url === avatarUrl) ?? PIXEL_AVATAR_OPTIONS[0],
    [avatarUrl]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const name = normalizeName(displayName);

    if (name.length < 2) {
      setErrorMessage("Display name must be at least 2 characters.");
      return;
    }

    if (name.length > 48) {
      setErrorMessage("Display name must be 48 characters or fewer.");
      return;
    }

    if (!isPixelAvatarUrl(avatarUrl)) {
      setErrorMessage("Select one of the built-in avatar options.");
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setErrorMessage("Session expired. Please log in again.");
        return;
      }

      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          display_name: name,
          avatar_url: avatarUrl,
          ui_style: uiStyle,
        },
        {
          onConflict: "id",
        }
      );

      if (profileError) {
        setErrorMessage(profileError.message);
        return;
      }

      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          display_name: name,
          avatar_url: avatarUrl,
          ui_style: uiStyle,
        },
      });

      if (metadataError) {
        setErrorMessage(`Profile saved, but auth metadata failed to sync: ${metadataError.message}`);
        return;
      }

      setSuccessMessage("Profile updated.");
      setDisplayName(name);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save profile right now.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="account-profile-form" onSubmit={onSubmit}>
      <label className="create-field" htmlFor="profile-display-name">
        <span>Display name</span>
        <input
          id="profile-display-name"
          type="text"
          maxLength={48}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </label>

      <fieldset className="account-avatar-fieldset">
        <legend>Profile picture</legend>
        <div className="account-avatar-grid">
          {PIXEL_AVATAR_OPTIONS.map((option) => {
            const selected = option.url === avatarUrl;
            return (
              <button
                key={option.id}
                className={selected ? "account-avatar-option is-selected" : "account-avatar-option"}
                style={{ "--avatar-accent": option.accent } as CSSProperties}
                type="button"
                onClick={() => setAvatarUrl(option.url)}
                aria-pressed={selected}
              >
                <img src={option.url} alt={`${option.label} pixel avatar`} width={80} height={80} loading="lazy" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <section className="account-profile-preview" aria-label="Profile preview">
        <img src={selectedAvatar.url} alt="Selected avatar preview" width={72} height={72} />
        <div>
          <p className="create-note">Preview</p>
          <strong>{normalizeName(displayName) || "Your name"}</strong>
        </div>
      </section>

      <button className="create-submit" type="submit" disabled={isSaving}>
        {isSaving ? "Saving..." : "Save profile"}
      </button>

      {errorMessage ? <p className="create-status create-status-error">{errorMessage}</p> : null}
      {successMessage ? <p className="create-status create-status-success">{successMessage}</p> : null}
    </form>
  );
}
