import type { InstitutionSummary } from "../types";
import { MERGE_CONFIRM_PHRASE } from "../types";

type MergeInstitutionsTabProps = {
  institutions: InstitutionSummary[];
  mergeSourceOrganizationId: string;
  onMergeSourceOrganizationIdChange: (value: string) => void;
  mergeTargetOrganizationId: string;
  onMergeTargetOrganizationIdChange: (value: string) => void;
  mergeSourceInstitution: InstitutionSummary | null;
  mergeTargetInstitution: InstitutionSummary | null;
  mergeDeleteSource: boolean;
  onMergeDeleteSourceChange: (value: boolean) => void;
  mergeConfirmPhrase: string;
  onMergeConfirmPhraseChange: (value: string) => void;
  pendingActionKey: string | null;
  onMergeInstitutions: () => Promise<void>;
};

export function MergeInstitutionsTab({
  institutions,
  mergeSourceOrganizationId,
  onMergeSourceOrganizationIdChange,
  mergeTargetOrganizationId,
  onMergeTargetOrganizationIdChange,
  mergeSourceInstitution,
  mergeTargetInstitution,
  mergeDeleteSource,
  onMergeDeleteSourceChange,
  mergeConfirmPhrase,
  onMergeConfirmPhraseChange,
  pendingActionKey,
  onMergeInstitutions,
}: MergeInstitutionsTabProps) {
  return (
    <div className="institution-tab-panel" role="tabpanel" aria-label="Merge institutions">
      <p className="create-note">Danger zone. This combines institution records into one canonical institution and updates linked data.</p>

      <div className="create-grid-two">
        <label className="create-field">
          <span>Source institution (merged from)</span>
          <select value={mergeSourceOrganizationId} onChange={(event) => onMergeSourceOrganizationIdChange(event.target.value)}>
            {institutions.map((institution) => (
              <option key={institution.id} value={institution.id}>
                {institution.name}
              </option>
            ))}
          </select>
        </label>

        <label className="create-field">
          <span>Target institution (merged into)</span>
          <select value={mergeTargetOrganizationId} onChange={(event) => onMergeTargetOrganizationIdChange(event.target.value)}>
            {institutions.map((institution) => (
              <option key={institution.id} value={institution.id}>
                {institution.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <article className="institution-merge-preview" aria-label="Merge preview">
        <p>
          <strong>From:</strong> {mergeSourceInstitution?.name ?? "Select source"}
        </p>
        <p>
          <strong>Into:</strong> {mergeTargetInstitution?.name ?? "Select target"}
        </p>
        {mergeSourceOrganizationId && mergeSourceOrganizationId === mergeTargetOrganizationId ? (
          <p className="tnc-error-text">Source and target cannot be the same institution.</p>
        ) : null}
      </article>

      <label className="create-field">
        <span>Delete source institution after merge</span>
        <select value={mergeDeleteSource ? "yes" : "no"} onChange={(event) => onMergeDeleteSourceChange(event.target.value === "yes") }>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>

      <label className="create-field">
        <span>Type {MERGE_CONFIRM_PHRASE} to confirm</span>
        <input
          type="text"
          value={mergeConfirmPhrase}
          onChange={(event) => onMergeConfirmPhraseChange(event.target.value)}
          placeholder={MERGE_CONFIRM_PHRASE}
        />
      </label>

      <button type="button" className="create-submit" disabled={Boolean(pendingActionKey)} onClick={() => void onMergeInstitutions()}>
        {pendingActionKey === "merge" ? "Merging..." : "Merge institutions"}
      </button>
    </div>
  );
}
