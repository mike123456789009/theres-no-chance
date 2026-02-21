import type { Dispatch, SetStateAction } from "react";

import type { DomainDraft, InstitutionSummary } from "../types";

type DomainMappingsTabProps = {
  institutions: InstitutionSummary[];
  selectedInstitution: InstitutionSummary;
  newDomain: string;
  onNewDomainChange: (value: string) => void;
  newDomainAllowSubdomains: boolean;
  onNewDomainAllowSubdomainsChange: (value: boolean) => void;
  pendingActionKey: string | null;
  onAddDomain: () => Promise<void>;
  domainDrafts: Record<string, DomainDraft>;
  setDomainDrafts: Dispatch<SetStateAction<Record<string, DomainDraft>>>;
  onSaveDomain: (domainId: string) => Promise<void>;
};

export function DomainMappingsTab({
  institutions,
  selectedInstitution,
  newDomain,
  onNewDomainChange,
  newDomainAllowSubdomains,
  onNewDomainAllowSubdomainsChange,
  pendingActionKey,
  onAddDomain,
  domainDrafts,
  setDomainDrafts,
  onSaveDomain,
}: DomainMappingsTabProps) {
  return (
    <div className="institution-tab-panel" role="tabpanel" aria-label="Domain mappings">
      <p className="create-note">Add and edit every accepted .edu domain variant for this institution.</p>

      <div className="create-grid-two">
        <label className="create-field">
          <span>Add domain</span>
          <input type="text" placeholder="students.school.edu" value={newDomain} onChange={(event) => onNewDomainChange(event.target.value)} />
        </label>
        <label className="create-field">
          <span>Allow subdomains</span>
          <select value={newDomainAllowSubdomains ? "yes" : "no"} onChange={(event) => onNewDomainAllowSubdomainsChange(event.target.value === "yes") }>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>

      <button type="button" className="create-submit" disabled={Boolean(pendingActionKey)} onClick={() => void onAddDomain()}>
        {pendingActionKey === "add-domain" ? "Adding..." : "Add domain mapping"}
      </button>

      {selectedInstitution.domains.length === 0 ? (
        <p className="create-note">No domain mappings yet for this institution.</p>
      ) : (
        <div className="tnc-table-wrap">
          <table className="tnc-data-table tnc-data-table--wide">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Allow subdomains</th>
                <th>Mapped institution</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {selectedInstitution.domains.map((domain) => {
                const draft = domainDrafts[domain.id] ?? {
                  domain: domain.domain,
                  allowSubdomains: domain.allowSubdomains,
                  organizationId: domain.organizationId,
                };

                return (
                  <tr key={domain.id}>
                    <td>
                      <input
                        type="text"
                        value={draft.domain}
                        onChange={(event) =>
                          setDomainDrafts((current) => ({
                            ...current,
                            [domain.id]: {
                              ...draft,
                              domain: event.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={draft.allowSubdomains ? "yes" : "no"}
                        onChange={(event) =>
                          setDomainDrafts((current) => ({
                            ...current,
                            [domain.id]: {
                              ...draft,
                              allowSubdomains: event.target.value === "yes",
                            },
                          }))
                        }
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={draft.organizationId}
                        onChange={(event) =>
                          setDomainDrafts((current) => ({
                            ...current,
                            [domain.id]: {
                              ...draft,
                              organizationId: event.target.value,
                            },
                          }))
                        }
                      >
                        {institutions.map((institution) => (
                          <option key={institution.id} value={institution.id}>
                            {institution.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="create-submit create-submit-muted"
                        disabled={Boolean(pendingActionKey)}
                        onClick={() => void onSaveDomain(domain.id)}
                      >
                        {pendingActionKey === `domain:${domain.id}` ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
