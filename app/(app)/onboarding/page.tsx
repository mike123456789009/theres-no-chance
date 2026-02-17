import { OnboardingForm } from "@/components/onboarding/onboarding-form";

export default function OnboardingPage() {
  return (
    <main className="onboarding-page">
      <section className="onboarding-card" aria-label="Onboarding form">
        <p className="onboarding-kicker">Profile setup</p>
        <h1 className="onboarding-title">Tell us your local context</h1>
        <p className="onboarding-subtitle">
          This helps personalize market discovery, onboarding recommendations, and institution access controls.
        </p>

        <OnboardingForm />

        <p className="onboarding-meta-links">
          Already set? Continue to <a href="/">home</a>
        </p>
      </section>
    </main>
  );
}
