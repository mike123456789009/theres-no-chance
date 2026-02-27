import type { ChangeEvent } from "react";

type CriteriaStepProps = {
  resolvesYesIf: string;
  resolvesNoIf: string;
  isGenerating: boolean;
  onGenerateCriteria: () => void;
  onResolvesYesIfChange: (value: string) => void;
  onResolvesNoIfChange: (value: string) => void;
};

export function CriteriaStep(props: CriteriaStepProps) {
  const { resolvesYesIf, resolvesNoIf, isGenerating, onGenerateCriteria, onResolvesYesIfChange, onResolvesNoIfChange } = props;

  return (
    <>
      <h2>Edit resolution criteria</h2>
      <p className="create-note">Generate a draft from your market basics (question, description, close time, visibility).</p>
      <div className="create-actions">
        <button className="create-submit" type="button" onClick={onGenerateCriteria} disabled={isGenerating}>
          {isGenerating ? "Generating..." : "Generate binary criteria"}
        </button>
      </div>

      <label className="create-field">
        <span>Resolves YES if</span>
        <textarea
          value={resolvesYesIf}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onResolvesYesIfChange(event.target.value)}
          minLength={12}
          maxLength={1500}
          required
          rows={3}
        />
      </label>

      <label className="create-field">
        <span>Resolves NO if</span>
        <textarea
          value={resolvesNoIf}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onResolvesNoIfChange(event.target.value)}
          minLength={12}
          maxLength={1500}
          required
          rows={3}
        />
      </label>
    </>
  );
}
