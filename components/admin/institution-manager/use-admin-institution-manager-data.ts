import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  AdminInstitutionTab,
  DomainDraft,
  EmailDraft,
  InstitutionEmailIdentity,
  InstitutionSummary,
  StatusMessage,
} from "./types";
import { MERGE_CONFIRM_PHRASE } from "./types";
import { clean, normalizeDomainDraft, toErrorMessage } from "./utils";

type UseAdminInstitutionManagerDataResult = {
  institutions: InstitutionSummary[];
  selectedInstitutionId: string;
  setSelectedInstitutionId: (value: string) => void;
  institutionQuery: string;
  setInstitutionQuery: (value: string) => void;
  activeTab: AdminInstitutionTab;
  setActiveTab: (value: AdminInstitutionTab) => void;
  isLoadingInstitutions: boolean;
  isLoadingEmails: boolean;
  pendingActionKey: string | null;
  statusMessage: StatusMessage;
  selectedInstitution: InstitutionSummary | null;
  pickerInstitutions: InstitutionSummary[];
  renameName: string;
  setRenameName: (value: string) => void;
  newDomain: string;
  setNewDomain: (value: string) => void;
  newDomainAllowSubdomains: boolean;
  setNewDomainAllowSubdomains: (value: boolean) => void;
  domainDrafts: Record<string, DomainDraft>;
  setDomainDrafts: React.Dispatch<React.SetStateAction<Record<string, DomainDraft>>>;
  emailIdentities: InstitutionEmailIdentity[];
  emailDrafts: Record<string, EmailDraft>;
  setEmailDrafts: React.Dispatch<React.SetStateAction<Record<string, EmailDraft>>>;
  mergeSourceOrganizationId: string;
  setMergeSourceOrganizationId: (value: string) => void;
  mergeTargetOrganizationId: string;
  setMergeTargetOrganizationId: (value: string) => void;
  mergeConfirmPhrase: string;
  setMergeConfirmPhrase: (value: string) => void;
  mergeDeleteSource: boolean;
  setMergeDeleteSource: (value: boolean) => void;
  mergeSourceInstitution: InstitutionSummary | null;
  mergeTargetInstitution: InstitutionSummary | null;
  handleRenameInstitution: () => Promise<void>;
  handleAddDomain: () => Promise<void>;
  handleSaveDomain: (domainId: string) => Promise<void>;
  handleSaveEmailIdentity: (identityId: string) => Promise<void>;
  handleMergeInstitutions: () => Promise<void>;
};

export function useAdminInstitutionManagerData(): UseAdminInstitutionManagerDataResult {
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
  const renameHydratedInstitutionIdRef = useRef("");

  const selectedInstitution = useMemo(
    () => institutions.find((institution) => institution.id === selectedInstitutionId) ?? null,
    [institutions, selectedInstitutionId]
  );

  const filteredInstitutions = useMemo(() => {
    const query = clean(institutionQuery).toLowerCase();
    if (!query) return institutions;

    return institutions.filter((institution) => {
      const haystack = [institution.name, institution.slug, ...institution.domains.map((domain) => domain.domain)]
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
      renameHydratedInstitutionIdRef.current = "";
      return;
    }

    const institution = institutions.find((item) => item.id === selectedInstitutionId);
    if (institution && renameHydratedInstitutionIdRef.current !== selectedInstitutionId) {
      setRenameName(institution.name);
      renameHydratedInstitutionIdRef.current = selectedInstitutionId;
    }
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

  return {
    institutions,
    selectedInstitutionId,
    setSelectedInstitutionId,
    institutionQuery,
    setInstitutionQuery,
    activeTab,
    setActiveTab,
    isLoadingInstitutions,
    isLoadingEmails,
    pendingActionKey,
    statusMessage,
    selectedInstitution,
    pickerInstitutions,
    renameName,
    setRenameName,
    newDomain,
    setNewDomain,
    newDomainAllowSubdomains,
    setNewDomainAllowSubdomains,
    domainDrafts,
    setDomainDrafts,
    emailIdentities,
    emailDrafts,
    setEmailDrafts,
    mergeSourceOrganizationId,
    setMergeSourceOrganizationId,
    mergeTargetOrganizationId,
    setMergeTargetOrganizationId,
    mergeConfirmPhrase,
    setMergeConfirmPhrase,
    mergeDeleteSource,
    setMergeDeleteSource,
    mergeSourceInstitution,
    mergeTargetInstitution,
    handleRenameInstitution,
    handleAddDomain,
    handleSaveDomain,
    handleSaveEmailIdentity,
    handleMergeInstitutions,
  };
}
