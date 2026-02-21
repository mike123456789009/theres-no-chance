import type { ChangeEvent } from "react";

import type { ActiveInstitutionSnapshot } from "@/lib/markets/create-market-client-validation";

type BasicsStepProps = {
  question: string;
  description: string;
  visibility: string;
  closeTimeLocal: string;
  institutionMarketSelected: boolean;
  hasActiveInstitution: boolean;
  activeInstitution: ActiveInstitutionSnapshot | null;
  onQuestionChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onVisibilityChange: (value: string) => void;
  onCloseTimeChange: (value: string) => void;
};

export function BasicsStep(props: BasicsStepProps) {
  const {
    question,
    description,
    visibility,
    closeTimeLocal,
    institutionMarketSelected,
    hasActiveInstitution,
    activeInstitution,
    onQuestionChange,
    onDescriptionChange,
    onVisibilityChange,
    onCloseTimeChange,
  } = props;

  return (
    <>
      <h2>Market basics</h2>

      <label className="create-field">
        <span>Question</span>
        <input
          type="text"
          placeholder="Will more than 100 people attend the TN fraternity party on March 8, 2026?"
          value={question}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onQuestionChange(event.target.value)}
          required
          minLength={12}
          maxLength={180}
        />
      </label>

      <label className="create-field">
        <span>Description</span>
        <textarea
          placeholder="Context, scope, and boundaries. Define exactly what counts."
          value={description}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onDescriptionChange(event.target.value)}
          required
          minLength={30}
          maxLength={5000}
          rows={5}
        />
      </label>

      <div className="create-grid-two">
        <label className="create-field">
          <span>Visibility</span>
          <select value={visibility} onChange={(event: ChangeEvent<HTMLSelectElement>) => onVisibilityChange(event.target.value)}>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
            <option value="institution" disabled={!hasActiveInstitution}>
              Institution
            </option>
          </select>
        </label>

        <label className="create-field">
          <span>Close time</span>
          <input
            type="datetime-local"
            value={closeTimeLocal}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onCloseTimeChange(event.target.value)}
            required
          />
        </label>
      </div>

      {institutionMarketSelected ? (
        hasActiveInstitution && activeInstitution ? (
          <p className="create-note">
            Institution binding: <strong>{activeInstitution.organizationName}</strong>
          </p>
        ) : (
          <p className="create-note tnc-error-text">Institution markets require an active verified institution membership.</p>
        )
      ) : null}
    </>
  );
}
