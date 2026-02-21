import type { ChangeEvent } from "react";

type IdeaStepProps = {
  ideaInput: string;
  isGenerating: boolean;
  onIdeaInputChange: (value: string) => void;
  onGenerateCriteria: () => void;
};

export function IdeaStep(props: IdeaStepProps) {
  const { ideaInput, isGenerating, onIdeaInputChange, onGenerateCriteria } = props;

  return (
    <>
      <h2>Describe your market idea</h2>
      <label className="create-field">
        <span>Idea prompt</span>
        <textarea
          value={ideaInput}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onIdeaInputChange(event.target.value)}
          rows={5}
          placeholder="Describe the event, outcome threshold, and what concrete evidence should prove YES or NO."
        />
      </label>
      <div className="create-actions">
        <button className="create-submit" type="button" onClick={onGenerateCriteria} disabled={isGenerating}>
          {isGenerating ? "Generating..." : "Generate binary criteria"}
        </button>
      </div>
    </>
  );
}
