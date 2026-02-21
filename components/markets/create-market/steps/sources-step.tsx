import type { ChangeEvent } from "react";

import { SOURCE_TYPE_OPTIONS, type SourceDraft } from "@/components/markets/create-market/types";

type SourcesStepProps = {
  sources: SourceDraft[];
  onAddSource: () => void;
  onUpdateSource: (id: string, key: keyof SourceDraft, value: string) => void;
  onRemoveSource: (id: string) => void;
};

export function SourcesStep(props: SourcesStepProps) {
  const { sources, onAddSource, onUpdateSource, onRemoveSource } = props;

  return (
    <>
      <div className="create-source-header">
        <h2>Optional references</h2>
        <button className="create-source-add" type="button" onClick={onAddSource} disabled={sources.length >= 8}>
          + Add reference
        </button>
      </div>
      <p className="create-note">References are optional. If provided, each entry must include a label and https URL.</p>

      <div className="create-source-list">
        {sources.length === 0 ? <p className="create-note">No references added yet.</p> : null}
        {sources.map((source, index) => (
          <article className="create-source-item" key={source.id}>
            <p className="create-source-index">Reference {index + 1}</p>

            <label className="create-field">
              <span>Label</span>
              <input
                type="text"
                value={source.label}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdateSource(source.id, "label", event.target.value)}
                minLength={2}
                maxLength={80}
              />
            </label>

            <label className="create-field">
              <span>URL</span>
              <input
                type="url"
                placeholder="https://example.com/source"
                value={source.url}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdateSource(source.id, "url", event.target.value)}
              />
            </label>

            <label className="create-field">
              <span>Type</span>
              <select
                value={source.type}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => onUpdateSource(source.id, "type", event.target.value)}
              >
                {SOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button className="create-source-remove" type="button" onClick={() => onRemoveSource(source.id)}>
              Remove reference
            </button>
          </article>
        ))}
      </div>
    </>
  );
}
