"use client";

import { DomainMappingsTab } from "./institution-manager/tabs/domain-mappings-tab";
import { EmailIdentitiesTab } from "./institution-manager/tabs/email-identities-tab";
import { MergeInstitutionsTab } from "./institution-manager/tabs/merge-institutions-tab";
import { InstitutionOverviewTab } from "./institution-manager/tabs/overview-tab";
import { useAdminInstitutionManagerData } from "./institution-manager/use-admin-institution-manager-data";
import { formatDate } from "./institution-manager/utils";

export function AdminInstitutionManager() {
  const {
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
  } = useAdminInstitutionManagerData();

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

        {!isLoadingInstitutions && institutions.length === 0 ? <p className="create-note">No institutions are currently available.</p> : null}

        {selectedInstitution ? (
          <article className="institution-focus-card" aria-label="Selected institution summary">
            <p>
              <strong>{selectedInstitution.name}</strong> · slug <code>{selectedInstitution.slug}</code>
            </p>
            <p>
              Created {formatDate(selectedInstitution.createdAt)} · Domains {selectedInstitution.domains.length}
            </p>
            <p>
              Active members {selectedInstitution.counts.activeMembers} · total members {selectedInstitution.counts.totalMembers} · verified
              emails {selectedInstitution.counts.verifiedEmails} · pending emails {selectedInstitution.counts.pendingEmails}
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
          <InstitutionOverviewTab
            selectedInstitution={selectedInstitution}
            renameName={renameName}
            onRenameNameChange={setRenameName}
            pendingActionKey={pendingActionKey}
            onRenameInstitution={handleRenameInstitution}
            pickerInstitutions={pickerInstitutions}
          />
        ) : null}

        {activeTab === "domains" && selectedInstitution ? (
          <DomainMappingsTab
            institutions={institutions}
            selectedInstitution={selectedInstitution}
            newDomain={newDomain}
            onNewDomainChange={setNewDomain}
            newDomainAllowSubdomains={newDomainAllowSubdomains}
            onNewDomainAllowSubdomainsChange={setNewDomainAllowSubdomains}
            pendingActionKey={pendingActionKey}
            onAddDomain={handleAddDomain}
            domainDrafts={domainDrafts}
            setDomainDrafts={setDomainDrafts}
            onSaveDomain={handleSaveDomain}
          />
        ) : null}

        {activeTab === "emails" && selectedInstitution ? (
          <EmailIdentitiesTab
            institutions={institutions}
            emailIdentities={emailIdentities}
            emailDrafts={emailDrafts}
            setEmailDrafts={setEmailDrafts}
            isLoadingEmails={isLoadingEmails}
            pendingActionKey={pendingActionKey}
            onSaveEmailIdentity={handleSaveEmailIdentity}
          />
        ) : null}

        {activeTab === "merge" ? (
          <MergeInstitutionsTab
            institutions={institutions}
            mergeSourceOrganizationId={mergeSourceOrganizationId}
            onMergeSourceOrganizationIdChange={setMergeSourceOrganizationId}
            mergeTargetOrganizationId={mergeTargetOrganizationId}
            onMergeTargetOrganizationIdChange={setMergeTargetOrganizationId}
            mergeSourceInstitution={mergeSourceInstitution}
            mergeTargetInstitution={mergeTargetInstitution}
            mergeDeleteSource={mergeDeleteSource}
            onMergeDeleteSourceChange={setMergeDeleteSource}
            mergeConfirmPhrase={mergeConfirmPhrase}
            onMergeConfirmPhraseChange={setMergeConfirmPhrase}
            pendingActionKey={pendingActionKey}
            onMergeInstitutions={handleMergeInstitutions}
          />
        ) : null}
      </section>
    </div>
  );
}
