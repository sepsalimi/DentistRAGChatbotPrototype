// Combines entitlement-aware citation cards, document previews, and evidence inspection.
"use client";

import type { DemoAnswer, EvidenceSource, Persona } from "@/lib/types";
import { DocumentPreview } from "./DocumentPreview";
import { EvidenceInspector } from "./EvidenceInspector";

export type PanelTab = "sources" | "evidence";

export function SourcePanel({
  answer,
  sources,
  persona,
  selectedSourceId,
  onSelectSource,
  open,
  onClose,
  tab,
  onTabChange,
  previewLoading,
  previewError,
}: {
  answer: DemoAnswer;
  sources: EvidenceSource[];
  persona: Persona;
  selectedSourceId: string;
  onSelectSource: (sourceId: string) => void;
  open: boolean;
  onClose: () => void;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  previewLoading?: boolean;
  previewError?: string | null;
}) {
  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? sources[0];

  const inspectSource = (sourceId: string) => {
    onSelectSource(sourceId);
    onTabChange("sources");
  };

  return (
    <aside className={`source-panel ${open ? "panel-open" : ""}`}>
      <div className="panel-title">
        <div>
          <span className="eyebrow">Answer grounding</span>
          <h2>Evidence</h2>
        </div>
        <button className="icon-button" onClick={onClose} type="button" aria-label="Close evidence panel">×</button>
      </div>
      <div className="panel-tabs" role="tablist">
        <button className={tab === "sources" ? "active" : ""} onClick={() => onTabChange("sources")} type="button">
          Sources <span>{answer.citations.length}</span>
        </button>
        <button className={tab === "evidence" ? "active" : ""} onClick={() => onTabChange("evidence")} type="button">
          Evidence trace
        </button>
      </div>
      {tab === "sources" ? (
        <div className="panel-scroll">
          <div className="source-list">
            {[...sources].sort((left, right) => {
              const leftCited = answer.citations.some((citation) => citation.sourceId === left.id);
              const rightCited = answer.citations.some((citation) => citation.sourceId === right.id);
              return Number(rightCited) - Number(leftCited);
            }).map((source) => {
              const cited = answer.citations.some((citation) => citation.sourceId === source.id);
              const policy = source.access[persona] ?? source.currentAccess;
              const excluded = policy.scenario === "excluded";
              const accessAction = source.sourceAccessAction ?? (
                policy.entitlement === "not-entitled"
                  ? "Request entitlement"
                  : policy.preview === "metadata-only"
                    ? "Citation metadata"
                    : policy.preview === "watermarked"
                      ? "Licensed preview"
                      : policy.original === "open"
                        ? "Preview and original"
                        : "Source details"
              );
              return (
                <button
                  className={selectedSource?.id === source.id ? "selected" : ""}
                  key={source.id}
                  onClick={() => onSelectSource(source.id)}
                  type="button"
                >
                  <span className="source-index">
                    {excluded ? "Excluded" : cited ? "Cited" : "Available"}
                  </span>
                  <strong>{excluded ? "Restricted source excluded" : source.title}</strong>
                  {excluded ? (
                    <small>Details withheld · not retrieved</small>
                  ) : (
                    <>
                      <small>{source.publisher} · {source.edition}</small>
                      <small>{source.section} · {source.page}</small>
                      <span className="source-card-action">{accessAction}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          {previewLoading && <div className="panel-state">Loading authorized preview…</div>}
          {previewError && <div className="panel-state panel-state-error">{previewError}</div>}
          {selectedSource && <DocumentPreview source={selectedSource} persona={persona} />}
        </div>
      ) : (
        <div className="panel-scroll">
          <EvidenceInspector answer={answer} persona={persona} sources={sources} onSelectSource={inspectSource} />
        </div>
      )}
    </aside>
  );
}
