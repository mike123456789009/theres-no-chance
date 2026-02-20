"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const INTEREST_OPTIONS = ["Sports", "Politics", "Education", "Weather", "Local Economy", "Campus Life"];

export function OnboardingForm() {
  const [cityRegion, setCityRegion] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleInterest(label: string) {
    setSelectedInterests((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label]
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (selectedInterests.length === 0) {
      setErrorMessage("Select at least one interest to continue.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const payload = {
        onboarding_city_region: cityRegion.trim(),
        onboarding_interests: selectedInterests,
        onboarding_completed_at: new Date().toISOString(),
      };

      const { error } = await supabase.auth.updateUser({
        data: payload,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage("Onboarding saved. You can continue to market discovery as features launch.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save onboarding right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="onboarding-stack" onSubmit={onSubmit}>
      <label className="onboarding-field">
        <span>City or region</span>
        <input
          type="text"
          placeholder="Bozeman, MT"
          value={cityRegion}
          onChange={(event) => setCityRegion(event.target.value)}
          required
        />
      </label>

      <fieldset className="onboarding-interests">
        <legend>Interests</legend>
        <div className="onboarding-interest-grid">
          {INTEREST_OPTIONS.map((option) => {
            const active = selectedInterests.includes(option);
            return (
              <button
                key={option}
                type="button"
                className={active ? "interest-chip is-active" : "interest-chip"}
                onClick={() => toggleInterest(option)}
                aria-pressed={active}
              >
                {option}
              </button>
            );
          })}
        </div>
      </fieldset>

      <p className="onboarding-hint onboarding-hint-warn">
        Institution access now requires verified .edu email confirmation in <Link href="/account/settings">account settings</Link>.
      </p>

      <button className="onboarding-submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "SAVING..." : "SAVE ONBOARDING"}
      </button>

      {errorMessage ? <p className="onboarding-status onboarding-error">{errorMessage}</p> : null}
      {successMessage ? <p className="onboarding-status onboarding-success">{successMessage}</p> : null}
    </form>
  );
}
