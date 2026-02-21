import type { Dispatch, SetStateAction } from "react";

import type { EmailDraft, InstitutionEmailIdentity, InstitutionSummary } from "../types";
import { formatDate, shortId } from "../utils";

type EmailIdentitiesTabProps = {
  institutions: InstitutionSummary[];
  emailIdentities: InstitutionEmailIdentity[];
  emailDrafts: Record<string, EmailDraft>;
  setEmailDrafts: Dispatch<SetStateAction<Record<string, EmailDraft>>>;
  isLoadingEmails: boolean;
  pendingActionKey: string | null;
  onSaveEmailIdentity: (identityId: string) => Promise<void>;
};

export function EmailIdentitiesTab({
  institutions,
  emailIdentities,
  emailDrafts,
  setEmailDrafts,
  isLoadingEmails,
  pendingActionKey,
  onSaveEmailIdentity,
}: EmailIdentitiesTabProps) {
  return (
    <div className="institution-tab-panel" role="tabpanel" aria-label="Institution email identities">
      <p className="create-note">Edit specific institution emails and reassign them to another institution when needed.</p>

      {isLoadingEmails ? <p className="create-note">Loading identities...</p> : null}

      {!isLoadingEmails && emailIdentities.length === 0 ? (
        <p className="create-note">No institution email identities are linked to this institution yet.</p>
      ) : null}

      {emailIdentities.length > 0 ? (
        <div className="tnc-table-wrap">
          <table className="tnc-data-table tnc-data-table--wide">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Mapped institution</th>
                <th>User id</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {emailIdentities.map((identity) => {
                const draft = emailDrafts[identity.id] ?? {
                  email: identity.email,
                  organizationId: identity.organizationId,
                  status: identity.status,
                };

                return (
                  <tr key={identity.id}>
                    <td>
                      <input
                        type="email"
                        value={draft.email}
                        onChange={(event) =>
                          setEmailDrafts((current) => ({
                            ...current,
                            [identity.id]: {
                              ...draft,
                              email: event.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          setEmailDrafts((current) => ({
                            ...current,
                            [identity.id]: {
                              ...draft,
                              status: event.target.value as InstitutionEmailIdentity["status"],
                            },
                          }))
                        }
                      >
                        <option value="pending_verification">pending_verification</option>
                        <option value="verified">verified</option>
                        <option value="revoked">revoked</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={draft.organizationId}
                        onChange={(event) =>
                          setEmailDrafts((current) => ({
                            ...current,
                            [identity.id]: {
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
                      <code title={identity.userId}>{shortId(identity.userId)}</code>
                    </td>
                    <td>{formatDate(identity.updatedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="create-submit create-submit-muted"
                        disabled={Boolean(pendingActionKey)}
                        onClick={() => void onSaveEmailIdentity(identity.id)}
                      >
                        {pendingActionKey === `identity:${identity.id}` ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
