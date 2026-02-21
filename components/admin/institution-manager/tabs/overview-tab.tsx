import type { InstitutionSummary } from "../types";

type InstitutionOverviewTabProps = {
  selectedInstitution: InstitutionSummary | null;
  renameName: string;
  onRenameNameChange: (value: string) => void;
  pendingActionKey: string | null;
  onRenameInstitution: () => Promise<void>;
  pickerInstitutions: InstitutionSummary[];
};

export function InstitutionOverviewTab({
  selectedInstitution,
  renameName,
  onRenameNameChange,
  pendingActionKey,
  onRenameInstitution,
  pickerInstitutions,
}: InstitutionOverviewTabProps) {
  return (
    <div className="institution-tab-panel" role="tabpanel" aria-label="Institution overview">
      <p className="create-note">Rename the selected institution and review all institution records.</p>

      {selectedInstitution ? (
        <>
          <label className="create-field">
            <span>Institution name</span>
            <input
              type="text"
              value={renameName}
              onChange={(event) => onRenameNameChange(event.target.value)}
              minLength={2}
              maxLength={120}
            />
          </label>

          <button type="button" className="create-submit" disabled={Boolean(pendingActionKey)} onClick={() => void onRenameInstitution()}>
            {pendingActionKey === "rename" ? "Saving..." : "Save institution name"}
          </button>
        </>
      ) : null}

      <div className="tnc-table-wrap">
        <table className="tnc-data-table tnc-data-table--wide">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Domains</th>
              <th>Members</th>
              <th>Emails</th>
            </tr>
          </thead>
          <tbody>
            {pickerInstitutions.map((institution) => (
              <tr key={institution.id}>
                <td>{institution.name}</td>
                <td>{institution.slug}</td>
                <td>{institution.domains.map((domain) => domain.domain).join(", ") || "No domains"}</td>
                <td>
                  {institution.counts.activeMembers} active / {institution.counts.totalMembers} total
                </td>
                <td>
                  {institution.counts.verifiedEmails} verified / {institution.counts.pendingEmails} pending
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
