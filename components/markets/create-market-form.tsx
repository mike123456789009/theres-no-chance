"use client";

import {
  BasicsStep,
  CriteriaStep,
  EvidenceStep,
  ReviewStep,
  RulesStep,
  SourcesStep,
} from "@/components/markets/create-market/steps";
import { useCreateMarketWizard } from "@/components/markets/create-market/use-create-market-wizard";
import { WIZARD_STEPS } from "@/components/markets/create-market/types";

export function CreateMarketForm() {
  const wizard = useCreateMarketWizard();

  return (
    <div className="create-wizard" role="region" aria-label="Market creator wizard">
      <div className="create-wizard-progress" aria-label="Wizard progress">
        <p>
          Step {wizard.stepIndex + 1} of {WIZARD_STEPS.length}: <strong>{WIZARD_STEPS[wizard.stepIndex]?.label}</strong>
        </p>
        <div className="create-wizard-progress-track" aria-hidden="true">
          <div className="create-wizard-progress-fill" style={{ width: `${wizard.completionPercent}%` }} />
        </div>
      </div>

      <section className="create-section create-wizard-card" aria-label={`Wizard step ${wizard.stepIndex + 1}`}>
        {wizard.currentStep === "rules" ? <RulesStep /> : null}
        {wizard.currentStep === "evidence" ? <EvidenceStep /> : null}

        {wizard.currentStep === "basics" ? (
          <BasicsStep
            question={wizard.question}
            description={wizard.description}
            visibility={wizard.visibility}
            closeTimeLocal={wizard.closeTimeLocal}
            institutionMarketSelected={wizard.institutionMarketSelected}
            hasActiveInstitution={wizard.hasActiveInstitution}
            activeInstitution={wizard.activeInstitution}
            onQuestionChange={wizard.setQuestion}
            onDescriptionChange={wizard.setDescription}
            onVisibilityChange={wizard.setVisibility}
            onCloseTimeChange={wizard.setCloseTimeLocal}
          />
        ) : null}

        {wizard.currentStep === "criteria" ? (
          <CriteriaStep
            resolvesYesIf={wizard.resolvesYesIf}
            resolvesNoIf={wizard.resolvesNoIf}
            isGenerating={wizard.isGenerating}
            onGenerateCriteria={() => {
              void wizard.generateCriteria();
            }}
            onResolvesYesIfChange={wizard.setResolvesYesIf}
            onResolvesNoIfChange={wizard.setResolvesNoIf}
          />
        ) : null}

        {wizard.currentStep === "sources" ? (
          <SourcesStep
            sources={wizard.sources}
            onAddSource={wizard.addSource}
            onUpdateSource={wizard.updateSource}
            onRemoveSource={wizard.removeSource}
          />
        ) : null}

        {wizard.currentStep === "review" ? (
          <ReviewStep
            question={wizard.question}
            closeTimeLocal={wizard.closeTimeLocal}
            tagsInput={wizard.tagsInput}
            riskFlagsInput={wizard.riskFlagsInput}
            isSubmitting={wizard.isSubmitting}
            onTagsInputChange={wizard.setTagsInput}
            onRiskFlagsInputChange={wizard.setRiskFlagsInput}
            onSaveDraft={() => {
              void wizard.submitMarket("draft");
            }}
            onSubmitForReview={() => {
              void wizard.submitMarket("review");
            }}
          />
        ) : null}
      </section>

      <div className="create-actions create-wizard-nav">
        <button
          className="create-submit create-submit-muted"
          type="button"
          onClick={wizard.goPrevious}
          disabled={!wizard.canGoBack || wizard.isSubmitting || wizard.isGenerating}
        >
          Previous
        </button>
        {wizard.canGoNext ? (
          <button
            className="create-submit"
            type="button"
            onClick={() => {
              void wizard.goNext();
            }}
            disabled={wizard.isSubmitting || wizard.isGenerating}
          >
            Next
          </button>
        ) : null}
      </div>

      {wizard.errorMessage ? <p className="create-status create-status-error">{wizard.errorMessage}</p> : null}
      {wizard.successMessage ? <p className="create-status create-status-success">{wizard.successMessage}</p> : null}
    </div>
  );
}
