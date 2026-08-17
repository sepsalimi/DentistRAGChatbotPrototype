// Renders explicit preview, original-open, entitlement, and exclusion behaviors.
import type { EvidenceSource, Persona } from "@/lib/types";

const scenarioCopy = {
  public: {
    title: "Public source",
    detail: "Preview is available here and the original can be opened externally.",
  },
  "licensed-preview": {
    title: "Licensed in-app preview",
    detail: "A watermarked preview is allowed here. External open and download are disabled.",
  },
  "citation-only": {
    title: "Citation-only source",
    detail: "Only citation metadata is available. Document text and the original are unavailable.",
  },
  entitled: {
    title: "Entitlement-controlled source",
    detail: "Full content is available only when the active persona has the required entitlement.",
  },
  excluded: {
    title: "Excluded before retrieval",
    detail: "A restricted item was excluded. No title, provider, dates, or content are disclosed.",
  },
};

export function DocumentPreview({
  source,
  persona,
}: {
  source: EvidenceSource;
  persona: Persona;
}) {
  const policy = source.access[persona];
  const state = scenarioCopy[policy.scenario];
  const excluded = policy.scenario === "excluded";
  const canPreview = policy.retrieved && (
    policy.preview === "full" || policy.preview === "watermarked"
  );
  const canOpenOriginal = policy.original === "open" && source.originalUrl;
  const title = excluded ? "Source withheld by access policy" : source.title;
  const kind = excluded ? "Retrieval boundary" : source.kind;

  return (
    <section className="document-preview" aria-label={`Preview of ${title}`}>
      <div className="preview-header">
        <div>
          <span className="eyebrow">{kind}</span>
          <h3>{title}</h3>
        </div>
        <span className={`access-badge access-${policy.scenario}`}>
          {policy.scenario.replace("-", " ")}
        </span>
      </div>
      <div className={`access-notice access-${policy.scenario}`}>
        <strong>{state.title}</strong>
        <span>{state.detail}</span>
      </div>
      {canPreview && (!source.live || source.excerpt) ? (
        <div className={`document-page ${policy.preview === "watermarked" ? "watermarked-preview" : ""}`}>
          {policy.preview === "watermarked" && (
            <div className="preview-watermark" aria-hidden="true">Licensed preview</div>
          )}
          <span className="document-section">{source.section}</span>
          <p>{source.excerpt}</p>
          <div className="tag-row">
            {source.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </div>
      ) : canPreview && source.live ? (
        <div className="metadata-preview">
          <span>Authorized preview</span>
          <strong>Preview text has not been loaded</strong>
          <p>Selecting this source requests its authorized preview from the backend. Restricted text is never cached as a fallback.</p>
        </div>
      ) : policy.preview === "metadata-only" ? (
        <div className="metadata-preview">
          <span>Source</span>
          <strong>{source.title}</strong>
          <dl>
            <div><dt>Provider</dt><dd>{source.origin}</dd></div>
            <div><dt>Updated</dt><dd>{source.updatedAt}</dd></div>
            <div><dt>Section</dt><dd>{source.section}</dd></div>
          </dl>
          <p>Document text is not provided under citation-only access.</p>
        </div>
      ) : (
        <div className="restricted-preview" aria-hidden="true">
          <div />
          <div />
          <div className="short" />
        </div>
      )}
      <div className="capability-grid" aria-label="Source capabilities">
        <div><span>Retrieve</span><strong>{policy.retrieved ? "Allowed" : "Blocked"}</strong></div>
        <div><span>Preview</span><strong>{policy.preview.replace("-", " ")}</strong></div>
        <div><span>Original</span><strong>{policy.original.replaceAll("-", " ")}</strong></div>
        <div><span>Entitlement</span><strong>{policy.entitlement.replaceAll("-", " ")}</strong></div>
      </div>
      {!excluded && (
        <div className="preview-actions">
          <button disabled type="button">
            {policy.preview === "full" && "Preview available"}
            {policy.preview === "watermarked" && "Watermarked preview"}
            {policy.preview === "metadata-only" && "Metadata only"}
            {policy.preview === "none" && "Preview locked"}
          </button>
          {canOpenOriginal ? (
            <a href={source.originalUrl} rel="noreferrer" target="_blank">Open original</a>
          ) : (
            <button disabled type="button">
              {policy.original === "blocked-license" && "Original blocked by license"}
              {policy.original === "blocked-entitlement" && "Entitlement required"}
              {policy.original === "hidden" && "Original unavailable"}
            </button>
          )}
        </div>
      )}
      {policy.scenario === "entitled" && (
        <div className={`entitlement-state entitlement-${policy.entitlement}`}>
          <strong>{policy.entitlement === "entitled" ? "Entitlement verified" : "Entitlement not granted"}</strong>
          <span>
            {policy.entitlement === "entitled"
              ? `The ${persona === "dentist" ? "dentist" : "front desk"} persona has full source access.`
              : `Switch persona or request access from the source owner.`}
          </span>
        </div>
      )}
      <footer>
        {excluded ? (
          <span>No source metadata retained in this answer</span>
        ) : (
          <>
            <span>{source.origin}</span>
            <span>Updated {source.updatedAt}</span>
          </>
        )}
      </footer>
    </section>
  );
}
