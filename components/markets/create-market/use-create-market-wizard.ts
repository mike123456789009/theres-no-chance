"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildCreateMarketRequestPayload,
  toIsoDateTime,
  validateCreateMarketWizardForSubmit,
  validateCreateMarketWizardStep,
} from "@/lib/markets/create-market-client-validation";

import { type InstitutionAccessSnapshot, type SourceDraft, WIZARD_STEPS } from "./types";

function toLocalInputValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function makeSourceId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useCreateMarketWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [resolvesYesIf, setResolvesYesIf] = useState("");
  const [resolvesNoIf, setResolvesNoIf] = useState("");
  const [ideaInput, setIdeaInput] = useState("");
  const [closeTimeLocal, setCloseTimeLocal] = useState(() => toLocalInputValue(new Date(Date.now() + 86_400_000 * 7)));
  const [visibility, setVisibility] = useState("public");
  const [tagsInput, setTagsInput] = useState("");
  const [riskFlagsInput, setRiskFlagsInput] = useState("");
  const [sources, setSources] = useState<SourceDraft[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [institutionAccess, setInstitutionAccess] = useState<InstitutionAccessSnapshot | null>(null);

  const currentStep = WIZARD_STEPS[stepIndex]?.id ?? "rules";

  const institutionMarketSelected = visibility === "institution";
  const activeInstitution = institutionAccess?.activeMembership ?? null;
  const hasActiveInstitution = Boolean(activeInstitution?.organizationId);

  const completionPercent = useMemo(() => Math.round(((stepIndex + 1) / WIZARD_STEPS.length) * 100), [stepIndex]);
  const canGoBack = stepIndex > 0;
  const canGoNext = stepIndex < WIZARD_STEPS.length - 1;

  useEffect(() => {
    let cancelled = false;

    async function loadInstitutionAccess() {
      try {
        const response = await fetch("/api/account/institution-access", { method: "GET", cache: "no-store" });
        const result = (await response.json().catch(() => null)) as InstitutionAccessSnapshot | null;
        if (!response.ok || !result) return;
        if (!cancelled) {
          setInstitutionAccess(result);
        }
      } catch {
        if (!cancelled) {
          setInstitutionAccess(null);
        }
      }
    }

    void loadInstitutionAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSource = useCallback((id: string, key: keyof SourceDraft, value: string) => {
    setSources((current) =>
      current.map((source) =>
        source.id === id
          ? {
              ...source,
              [key]: value,
            }
          : source
      )
    );
  }, []);

  const addSource = useCallback(() => {
    if (sources.length >= 8) return;
    setSources((current) => [...current, { id: makeSourceId(), label: "", url: "", type: "official" }]);
  }, [sources.length]);

  const removeSource = useCallback((id: string) => {
    setSources((current) => current.filter((source) => source.id !== id));
  }, []);

  const goNext = useCallback(async () => {
    const validationError = validateCreateMarketWizardStep(currentStep, {
      question,
      description,
      resolvesYesIf,
      resolvesNoIf,
      closeTimeLocal,
      sources,
      institutionMarketSelected,
      hasActiveInstitution,
    });

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setStepIndex((current) => Math.min(WIZARD_STEPS.length - 1, current + 1));
  }, [
    closeTimeLocal,
    currentStep,
    description,
    hasActiveInstitution,
    institutionMarketSelected,
    question,
    resolvesNoIf,
    resolvesYesIf,
    sources,
  ]);

  const goPrevious = useCallback(() => {
    setErrorMessage("");
    setSuccessMessage("");
    setStepIndex((current) => Math.max(0, current - 1));
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        void goNext();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrevious]);

  const generateCriteria = useCallback(async () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (ideaInput.trim().length < 12) {
      setErrorMessage("Describe your market idea in at least 12 characters before generating criteria.");
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("/api/markets/criteria-suggestion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idea: ideaInput,
          question,
          closeTime: toIsoDateTime(closeTimeLocal),
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | {
            criteria?: {
              resolvesYesIf?: string;
              resolvesNoIf?: string;
            };
            error?: string;
            detail?: string;
          }
        | null;

      if (!response.ok || !result?.criteria) {
        setErrorMessage(result?.error ?? "Unable to generate criteria right now. You can still write criteria manually.");
        return;
      }

      setResolvesYesIf(result.criteria.resolvesYesIf ?? "");
      setResolvesNoIf(result.criteria.resolvesNoIf ?? "");
      setSuccessMessage("Suggested criteria generated. Review and edit before submission.");
      setStepIndex(WIZARD_STEPS.findIndex((step) => step.id === "criteria"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected network error while generating criteria.");
    } finally {
      setIsGenerating(false);
    }
  }, [closeTimeLocal, ideaInput, question]);

  const submitMarket = useCallback(
    async (submissionMode: "draft" | "review") => {
      setErrorMessage("");
      setSuccessMessage("");

      const validationError = validateCreateMarketWizardForSubmit({
        question,
        description,
        resolvesYesIf,
        resolvesNoIf,
        closeTimeLocal,
        sources,
        institutionMarketSelected,
        hasActiveInstitution,
      });
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }

      const payloadResult = buildCreateMarketRequestPayload({
        submissionMode,
        question,
        description,
        resolvesYesIf,
        resolvesNoIf,
        closeTimeLocal,
        visibility,
        institutionMarketSelected,
        activeInstitution,
        tagsInput,
        riskFlagsInput,
        sources,
      });

      if (!payloadResult.ok) {
        setErrorMessage(payloadResult.error);
        return;
      }

      setIsSubmitting(true);

      try {
        const response = await fetch("/api/markets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payloadResult.payload),
        });

        const result = (await response.json().catch(() => null)) as
          | { message?: string; error?: string; details?: string[] }
          | null;

        if (!response.ok) {
          if (result?.details?.length) {
            setErrorMessage(result.details.join(" "));
          } else if (result?.error) {
            setErrorMessage(result.error);
          } else {
            setErrorMessage("Unable to submit market right now.");
          }
          return;
        }

        setSuccessMessage(result?.message ?? "Market request saved.");
        setStepIndex(WIZARD_STEPS.length - 1);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unexpected network error.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      activeInstitution,
      closeTimeLocal,
      description,
      hasActiveInstitution,
      institutionMarketSelected,
      question,
      resolvesNoIf,
      resolvesYesIf,
      riskFlagsInput,
      sources,
      tagsInput,
      visibility,
    ]
  );

  return {
    stepIndex,
    currentStep,
    completionPercent,
    canGoBack,
    canGoNext,
    question,
    description,
    resolvesYesIf,
    resolvesNoIf,
    ideaInput,
    closeTimeLocal,
    visibility,
    tagsInput,
    riskFlagsInput,
    sources,
    isSubmitting,
    isGenerating,
    errorMessage,
    successMessage,
    institutionAccess,
    institutionMarketSelected,
    activeInstitution,
    hasActiveInstitution,
    setQuestion,
    setDescription,
    setResolvesYesIf,
    setResolvesNoIf,
    setIdeaInput,
    setCloseTimeLocal,
    setVisibility,
    setTagsInput,
    setRiskFlagsInput,
    updateSource,
    addSource,
    removeSource,
    goNext,
    goPrevious,
    generateCriteria,
    submitMarket,
  };
}
