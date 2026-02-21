"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InstitutionDomainSummary = {
  id: string;
  organizationId: string;
  domain: string;
  allowSubdomains: boolean;
};

type InstitutionSummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  domains: InstitutionDomainSummary[];
  counts: {
    activeMembers: number;
    totalMembers: number;
    verifiedEmails: number;
    pendingEmails: number;
  };
};

type InstitutionEmailIdentity = {
  id: string;
  userId: string;
  email: string;
  domain: string;
  organizationId: string;
  status: "pending_verification" | "verified" | "revoked";
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StatusMessage = {
  kind: "success" | "error";
  text: string;
} | null;

type DomainDraft = {
  domain: string;
  allowSubdomains: boolean;
  organizationId: string;
};

type EmailDraft = {
  email: string;
  organizationId: string;
  status: InstitutionEmailIdentity["status"];
};

type AdminInstitutionTab = "overview" | "domains" | "emails" | "merge";

const MERGE_CONFIRM_PHRASE = "MERGE INSTITUTIONS";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value: string | null | undefined): string {
  const normalized = clean(value);
  if (!normalized) return "N/A";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function toErrorMessage(payload: { error?: string; detail?: string } | null, fallback: string): string {
  const detail = clean(payload?.detail);
  const error = clean(payload?.error);
  if (detail) return detail;
  if (error) return error;
  return fallback;
}

function normalizeDomainDraft(value: string): string {
  return value.trim().toLowerCase();
}

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function AdminInstitutionManager() {
  const router = useRouter();
  const [institutions, setInstitutions] = useState<InstitutionSummary[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [institutionQuery, setInstitutionQuery] = useState("");
  const [activeTab, setActiveTab] = useState<AdminInstitutionTab>("overview");
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null);

  const [renameName, setRenameName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newDomainAllowSubdomains, setNewDomainAllowSubdomains] = useState(true);
  const [domainDrafts, setDomainDrafts] = useState<Record<string, DomainDraft>>({});

  const [emailIdentities, setEmailIdentities] = useState<InstitutionEmailIdentity[]>([]);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, EmailDraft>>({});

  const [mergeSourceOrganizationId, setMergeSourceOrganizationId] = useState("");
  const [mergeTargetOrganizationId, setMergeTargetOrganizationId] = useState("");
  const [mergeConfirmPhrase, setMergeConfirmPhrase] = useState("");
  const [mergeDeleteSource, setMergeDeleteSource] = useState(true);

  const selectedInstitution = useMemo(
    () => institutions.find((institution) => institution.id === selectedInstitutionId) ?? null,
    [institutions, selectedInstitutionId]
  );

  const filteredInstitutions = useMemo(() => {
    const query = clean(institutionQuery).toLowerCase();
    if (!query) return institutions;

    return institutions.filter((institution) => {
      const haystack = [
        institution.name,
        institution.slug,
        ...institution.domains.map((domain) => domain.domain),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [institutionQuery, institutions]);

  const pickerInstitutions = filteredInstitutions.length > 0 ? filteredInstitutions : institutions;

  const mergeSourceInstitution = useMemo(
    () => institutions.find((institution) => institution.id === mergeSourceOrganizationId) ?? null,
    [institutions, mergeSourceOrganizationId]
  );

  const mergeTargetInstitution = useMemo(
    () => institutions.find((institution) => institution.id === mergeTargetOrganizationId) ?? null,
    [institutions, mergeTargetOrganizationId]
  );

  async function loadInstitutions(options?: { preferredInstitutionId?: string }) {
    setIsLoadingInstitutions(true);

    try {
      const response = await fetch("/api/admin/institutions", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            institutions?: InstitutionSummary[];
            error?: string;
            detail?: string;
          }
        | null;

      if (!response.ok || !payload) {
        throw new Error(toErrorMessage(payload, "Unable to load institution directory."));
      }

      const nextInstitutions = Array.isArray(payload.institutions) ? payload.institutions : [];
      setInstitutions(nextInstitutions);

      setDomainDrafts(() => {
        const nextDrafts: Record<string, DomainDraft> = {};
        for (const institution of nextInstitutions) {
          for (const domain of institution.domains) {
            nextDrafts[domain.id] = {
              domain: domain.domain,
              allowSubdomains: domain.allowSubdomains,
              organizationId: domain.organizationId,
            };
          }
        }
        return nextDrafts;
      });

      setSelectedInstitutionId((current) => {
        const preferred = clean(options?.preferredInstitutionId);
        if (preferred && nextInstitutions.some((institution) => institution.id === preferred)) {
          return preferred;
        }
        if (current && nextInstitutions.some((institution) => institution.id === current)) {
          return current;
        }
        return nextInstitutions[0]?.id ?? "";
      });

      setMergeSourceOrganizationId((current) => {
        if (current && nextInstitutions.some((institution) => institution.id === current)) {
          return current;
        }
        return nextInstitutions[0]?.id ?? "";
      });

      setMergeTargetOrganizationId((current) => {
        if (current && nextInstitutions.some((institution) => institution.id === current)) {
          return current;
        }
        return nextInstitutions[1]?.id ?? nextInstitutions[0]?.id ?? "";
      });
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to load institution directory.",
      });
    } finally {
      setIsLoadingInstitutions(false);
    }
  }

  async function loadEmailIdentities(organizationId: string) {
    if (!organizationId) {
      setEmailIdentities([]);
      setEmailDrafts({});
      return;
    }

    setIsLoadingEmails(true);
    try {
      const response = await fetch(`/api/admin/institutions/${organizationId}/emails?limit=250`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            identities?: InstitutionEmailIdentity[];
            error?: string;
            detail?: string;
          }
        | null;

      if (!response.ok || !payload) {
        throw new Error(toErrorMessage(payload, "Unable to load institution email identities."));
      }

      const identities = Array.isArray(payload.identities) ? payload.identities : [];
      setEmailIdentities(identities);
      setEmailDrafts(() => {
        const nextDrafts: Record<string, EmailDraft> = {};
        for (const identity of identities) {
          nextDrafts[identity.id] = {
            email: identity.email,
            organizationId: identity.organizationId,
            status: identity.status,
          };
        }
        return nextDrafts;
      });
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to load institution email identities.",
      });
    } finally {
      setIsLoadingEmails(false);
    }
  }

  useEffect(() => {
    void loadInstitutions();
  }, []);

  useEffect(() => {
    if (!selectedInstitutionId) {
      setRenameName("");
      setEmailIdentities([]);
      setEmailDrafts({});
      return;
    }

    const institution = institutions.find((item) => item.id === selectedInstitutionId);
    setRenameName(institution?.name ?? "");
    void loadEmailIdentities(selectedInstitutionId);
  }, [selectedInstitutionId, institutions]);

  async function handleRenameInstitution() {
    if (!selectedInstitution) return;

    const nextName = clean(renameName).replace(/\s+/g, " ");
    if (nextName.length < 2) {
      setStatusMessage({
        kind: "error",
        text: "Institution name must be at least 2 characters.",
      });
      return;
    }

    setPendingActionKey("rename");
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/admin/institutions/${selectedInstitution.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: nextName,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; detail?: string; message?: string } | null;
      if (!response.ok || !payload) {
        throw new Error(toErrorMessage(payload, "Unable to rename institution."));
      }

      await loadInstitutions({
        preferredInstitutionId: selectedInstitution.id,
      });
      router.refresh();
      setStatusMessage({
        kind: "success",
        text: payload.message ?? "Institution renamed.",
      });
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to rename institution.",
      });
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleAddDomain() {
    if (!selectedInstitution) return;

    const normalizedDomain = normalizeDomainDraft(newDomain);
    if (!normalizedDomain) {
      setStatusMessage({
        kind: "error",
        text: "Domain is required.",
      });
      return;
    }

    setPendingActionKey("add-domain");
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/admin/institutions/${selectedInstitution.id}/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domain: normalizedDomain,
          allowSubdomains: newDomainAllowSubdomains,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; detail?: string; message?: string } | null;
      if (!response.ok || !payload) {
        throw new Error(toErrorMessage(payload, "Unable to add institution domain."));
      }

      setNewDomain("");
      setNewDomainAllowSubdomains(true);
      await loadInstitutions({
        preferredInstitutionId: selectedInstitution.id,
      });
      setStatusMessage({
        kind: "success",
        text: payload.message ?? "Institution domain added.",
      });
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to add institution domain.",
      });
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleSaveDomain(domainId: string) {
    const draft = domainDrafts[domainId];
    if (!draft) return;

    setPendingActionKey(`domain:${domainId}`);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/admin/institutions/domains/${domainId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domain: normalizeDomainDraft(draft.domain),
          allowSubdomains: draft.allowSubdomains,
          organizationId: draft.organizationId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; detail?: string; message?: string } | null;
      if (!response.ok || !payload) {
        throw new Error(toErrorMessage(payload, "Unable to update institution domain."));
      }

      await loadInstitutions({
        preferredInstitutionId: draft.organizationId || selectedInstitutionId,
      });
      setStatusMessage({
        kind: "success",
        text: payload.message ?? "Institution domain updated.",
      });
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to update institution domain.",
      });
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleSaveEmailIdentity(identityId: string) {
    const draft = emailDrafts[identityId];
    if (!draft) return;

    setPendingActionKey(`identity:${identityId}`);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/admin/institutions/emails/${identityId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: clean(draft.email).toLowerCase(),
          organizationId: draft.organizationId,
          status: draft.status,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; detail?: string; message?: string } | null;
      if (!response.ok || !payload) {
        throw new Error(toErrorMessage(payload, "Unable to update institution email identity."));
      }

      await loadInstitutions({
        preferredInstitutionId: draft.organizationId || selectedInstitutionId,
      });
      await loadEmailIdentities(draft.organizationId || selectedInstitutionId);
      setStatusMessage({
        kind: "success",
        text: payload.message ?? "Institution email identity updated.",
      });
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to update institution email identity.",
      });
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleMergeInstitutions() {
    if (!mergeSourceOrganizationId || !mergeTargetOrganizationId) {
      setStatusMessage({
        kind: "error",
        text: "Source and target institutions are required.",
      });
      return;
    }

    if (mergeSourceOrganizationId === mergeTargetOrganizationId) {
      setStatusMessage({
        kind: "error",
        text: "Source and target institutions must differ.",
      });
      return;
    }

    if (clean(mergeConfirmPhrase).toUpperCase() !== MERGE_CONFIRM_PHRASE) {
      setStatusMessage({
        kind: "error",
        text: `Type ${MERGE_CONFIRM_PHRASE} to confirm merge.`,
      });
      return;
    }

    setPendingActionKey("merge");
    setStatusMessage(null);

    try {
      const response = await fetch("/api/admin/institutions/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceOrganizationId: mergeSourceOrganizationId,
          targetOrganizationId: mergeTargetOrganizationId,
          deleteSource: mergeDeleteSource,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; detail?: string; message?: string } | null;
      if (!response.ok || !payload) {
        throw new Error(toErrorMessage(payload, "Unable to merge institutions."));
      }

      setMergeConfirmPhrase("");
      await loadInstitutions({
        preferredInstitutionId: mergeTargetOrganizationId,
      });
      await loadEmailIdentities(mergeTargetOrganizationId);
      router.refresh();
      setStatusMessage({
        kind: "success",
        text: payload.message ?? "Institution merge completed.",
      });
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to merge institutions.",
      });
    } finally {
      setPendingActionKey(null);
    }
  }

  return (
    <div className="account-institutions-stack">
      {statusMessage ? (
        <p className={statusMessage.kind === "error" ? "create-note tnc-error-text" : "create-note"}>{statusMessage.text}</p>
      ) : null}

      <section className="create-section" aria-label="Institution manager guide">
        <h2>How to use this tool</h2>
        <ol className="institution-guide-list">
          <li>Pick or search the institution you want to clean up.</li>
          <li>Use the tabs to rename, fix domains, or reassign email identities.</li>
          <li>Use Merge only after selecting a source and a canonical target.</li>
        </ol>
      </section>

      <section className="create-section" aria-label="Institution selection">
        <h2>1. Select institution</h2>
        <div className="create-grid-two institution-picker-grid">
          <label className="create-field">
            <span>Search institution or domain</span>
            <input
              type="text"
              value={institutionQuery}
              onChange={(event) => setInstitutionQuery(event.target.value)}
              placeholder="CMC, claremont, students.school.edu"
            />
          </label>

          <label className="create-field">
            <span>Selected institution</span>
            <select value={selectedInstitutionId} onChange={(event) => setSelectedInstitutionId(event.target.value)}>
              {pickerInstitutions.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.name} ({institution.slug})
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoadingInstitutions ? <p className="create-note">Loading institution directory...</p> : null}

        {!isLoadingInstitutions && institutions.length === 0 ? (
          <p className="create-note">No institutions are currently available.</p>
        ) : null}

        {selectedInstitution ? (
          <article className="institution-focus-card" aria-label="Selected institution summary">
            <p>
              <strong>{selectedInstitution.name}</strong> · slug <code>{selectedInstitution.slug}</code>
            </p>
            <p>
              Created {formatDate(selectedInstitution.createdAt)} · Domains {selectedInstitution.domains.length}
            </p>
            <p>
              Active members {selectedInstitution.counts.activeMembers} · total members {selectedInstitution.counts.totalMembers} ·
              verified emails {selectedInstitution.counts.verifiedEmails} · pending emails {selectedInstitution.counts.pendingEmails}
            </p>
          </article>
        ) : null}
      </section>

      <section className="create-section" aria-label="Institution actions">
        <h2>2. Run actions</h2>
        <div className="institution-tab-row" role="tablist" aria-label="Institution admin actions">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            className={activeTab === "overview" ? "institution-tab-button is-active" : "institution-tab-button"}
            onClick={() => setActiveTab("overview")}
          >
            Overview + rename
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "domains"}
            className={activeTab === "domains" ? "institution-tab-button is-active" : "institution-tab-button"}
            onClick={() => setActiveTab("domains")}
          >
            Domain mappings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "emails"}
            className={activeTab === "emails" ? "institution-tab-button is-active" : "institution-tab-button"}
            onClick={() => setActiveTab("emails")}
          >
            Email identities
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "merge"}
            className={activeTab === "merge" ? "institution-tab-button is-active" : "institution-tab-button"}
            onClick={() => setActiveTab("merge")}
          >
            Merge institutions
          </button>
        </div>

        {activeTab === "overview" ? (
          <div className="institution-tab-panel" role="tabpanel" aria-label="Institution overview">
            <p className="create-note">Rename the selected institution and review all institution records.</p>

            {selectedInstitution ? (
              <>
                <label className="create-field">
                  <span>Institution name</span>
                  <input
                    type="text"
                    value={renameName}
                    onChange={(event) => setRenameName(event.target.value)}
                    minLength={2}
                    maxLength={120}
                  />
                </label>

                <button type="button" className="create-submit" disabled={Boolean(pendingActionKey)} onClick={handleRenameInstitution}>
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
        ) : null}

        {activeTab === "domains" && selectedInstitution ? (
          <div className="institution-tab-panel" role="tabpanel" aria-label="Domain mappings">
            <p className="create-note">Add and edit every accepted .edu domain variant for this institution.</p>

            <div className="create-grid-two">
              <label className="create-field">
                <span>Add domain</span>
                <input
                  type="text"
                  placeholder="students.school.edu"
                  value={newDomain}
                  onChange={(event) => setNewDomain(event.target.value)}
                />
              </label>
              <label className="create-field">
                <span>Allow subdomains</span>
                <select
                  value={newDomainAllowSubdomains ? "yes" : "no"}
                  onChange={(event) => setNewDomainAllowSubdomains(event.target.value === "yes")}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>

            <button type="button" className="create-submit" disabled={Boolean(pendingActionKey)} onClick={handleAddDomain}>
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
                              onClick={() => void handleSaveDomain(domain.id)}
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
        ) : null}

        {activeTab === "emails" && selectedInstitution ? (
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
                              onClick={() => void handleSaveEmailIdentity(identity.id)}
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
        ) : null}

        {activeTab === "merge" ? (
          <div className="institution-tab-panel" role="tabpanel" aria-label="Merge institutions">
            <p className="create-note">
              Danger zone. This combines institution records into one canonical institution and updates linked data.
            </p>

            <div className="create-grid-two">
              <label className="create-field">
                <span>Source institution (merged from)</span>
                <select value={mergeSourceOrganizationId} onChange={(event) => setMergeSourceOrganizationId(event.target.value)}>
                  {institutions.map((institution) => (
                    <option key={institution.id} value={institution.id}>
                      {institution.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="create-field">
                <span>Target institution (merged into)</span>
                <select value={mergeTargetOrganizationId} onChange={(event) => setMergeTargetOrganizationId(event.target.value)}>
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
              <select value={mergeDeleteSource ? "yes" : "no"} onChange={(event) => setMergeDeleteSource(event.target.value === "yes")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>

            <label className="create-field">
              <span>Type {MERGE_CONFIRM_PHRASE} to confirm</span>
              <input
                type="text"
                value={mergeConfirmPhrase}
                onChange={(event) => setMergeConfirmPhrase(event.target.value)}
                placeholder={MERGE_CONFIRM_PHRASE}
              />
            </label>

            <button type="button" className="create-submit" disabled={Boolean(pendingActionKey)} onClick={handleMergeInstitutions}>
              {pendingActionKey === "merge" ? "Merging..." : "Merge institutions"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
