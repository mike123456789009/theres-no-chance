import type { ChangeEvent } from "react";

type ReviewStepProps = {
  question: string;
  closeTimeLocal: string;
  tagsInput: string;
  riskFlagsInput: string;
  isSubmitting: boolean;
  onTagsInputChange: (value: string) => void;
  onRiskFlagsInputChange: (value: string) => void;
  onSaveDraft: () => void;
  onSubmitForReview: () => void;
};

export function ReviewStep(props: ReviewStepProps) {
  const {
    question,
    closeTimeLocal,
    tagsInput,
    riskFlagsInput,
    isSubmitting,
    onTagsInputChange,
    onRiskFlagsInputChange,
    onSaveDraft,
    onSubmitForReview,
  } = props;

  return (
    <>
      <h2>Review and submit</h2>
      <p className="create-note">
        Resolution mode: <strong>Community</strong>
      </p>
      <p className="create-note">
        Listing fee: <strong>$0.50</strong>
      </p>
      <p className="create-note">
        Market-maker rake: <strong>dynamic</strong> (starts 0.5%)
      </p>
      <p className="create-note">
        Question: <strong>{question || "Not set"}</strong>
      </p>
      <p className="create-note">
        Close: <strong>{closeTimeLocal || "Not set"}</strong>
      </p>
      <label className="create-field">
        <span>Tags (comma-separated)</span>
        <input
          type="text"
          value={tagsInput}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onTagsInputChange(event.target.value)}
          placeholder="event, local, nightlife"
        />
      </label>
      <label className="create-field">
        <span>Risk flags (comma-separated, optional)</span>
        <input
          type="text"
          value={riskFlagsInput}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onRiskFlagsInputChange(event.target.value)}
          placeholder="attendance-estimate"
        />
      </label>

      <div className="create-actions">
        <button className="create-submit create-submit-muted" type="button" onClick={onSaveDraft} disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save draft"}
        </button>
        <button className="create-submit" type="button" onClick={onSubmitForReview} disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit for review"}
        </button>
      </div>
    </>
  );
}
