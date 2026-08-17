// Renders source identity, rights, full text with exact passage marks, and access actions.
import type { EvidenceSource, Persona } from "@/lib/types";
import { PdfEvidenceViewer } from "./PdfEvidenceViewer";

const scenarioCopy = {
  public: {
    title: "Public source",
    detail: "Full registered text is available here and the publisher page can be opened.",
  },
  "licensed-preview": {
    title: "Licensed in-app preview",
    detail: "A watermarked preview is allowed. External open and download remain disabled.",
  },
  "citation-only": {
    title: "Citation-only source",
    detail: "Source identity and location are available, but document text is not stored.",
  },
  entitled: {
    title: "Entitlement-controlled source",
    detail: "Content is available only when the active role has the required entitlement.",
  },
  excluded: {
    title: "Excluded before retrieval",
    detail: "A restricted item was excluded. No identifying metadata or content is disclosed.",
  },
};

function MarkedPassage({ text, exactPassage }: { text: string; exactPassage: string }) {
  const passageStart = exactPassage ? text.indexOf(exactPassage) : -1;
  if (passageStart === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, passageStart)}
      <mark>{exactPassage}</mark>
      {text.slice(passageStart + exactPassage.length)}
    </>
  );
}

export function DocumentPreview({
  source,
  persona,
}: {
  source: EvidenceSource;
  persona: Persona;
}) {
  const policy = source.access[persona] ?? source.currentAccess;
  const state = scenarioCopy[policy.scenario];
  const excluded = policy.scenario === "excluded";
  const canPreview = policy.retrieved && (policy.preview === "full" || policy.preview === "watermarked");
  const canOpenOriginal = policy.original === "open" && source.originalUrl;
  const title = excluded ? "Source withheld by access policy" : source.title;
  const kind = excluded ? "Retrieval boundary" : source.kind;
  const previewText = source.fullText || source.excerpt;

  return (
    <section className="document-preview" aria-label={`Preview of ${title}`}>
      <div className="preview-header">
        <div>
          <span className="eyebrow">{kind}</span>
          <h3>{title}</h3>
          {!excluded && <small>{source.publisher} · {source.edition}</small>}
        </div>
        <span className={`access-badge access-${policy.scenario}`}>
          {policy.scenario.replace("-", " ")}
        </span>
      </div>
      <div className={`access-notice access-${policy.scenario}`}>
        <strong>{state.title}</strong>
        <span>{state.detail}</span>
      </div>

      {!excluded && (
        <dl className="source-identity">
          <div><dt>Publisher</dt><dd>{source.publisher}</dd></div>
          <div><dt>Authors</dt><dd>{source.authors.join(", ") || "Not supplied"}</dd></div>
          <div><dt>Edition</dt><dd>{source.edition}</dd></div>
          <div><dt>Published</dt><dd>{source.publicationDate}</dd></div>
          <div><dt>Identifier</dt><dd>{source.identifier}</dd></div>
          <div><dt>Location</dt><dd>{source.section} · {source.page}</dd></div>
          {(source.startOffset !== undefined || source.pdfBBox) && (
            <div>
              <dt>Exact locator</dt>
              <dd>
                {source.startOffset !== undefined ? `Characters ${source.startOffset}–${source.endOffset}` : ""}
                {source.pdfBBox ? ` · PDF bbox [${source.pdfBBox.join(", ")}]` : ""}
              </dd>
            </div>
          )}
          <div><dt>Jurisdiction</dt><dd>{source.jurisdiction}</dd></div>
        </dl>
      )}

      {canPreview && source.mediaType === "application/pdf" && source.pdfUrl ? (
        <>
          <div className="passage-key"><span /> Exact cited passage on {source.page}</div>
          <PdfEvidenceViewer
            documentUrl={source.pdfUrl}
            exactQuote={source.exactPassage}
            pageNumber={source.pdfPage ?? 1}
            pdfBBox={source.pdfBBox}
          />
        </>
      ) : canPreview && previewText ? (
        <>
          <div className="passage-key"><span /> Exact cited passage</div>
          <div className={`document-page full-text-preview ${policy.preview === "watermarked" ? "watermarked-preview" : ""}`}>
            {policy.preview === "watermarked" && (
              <div className="preview-watermark" aria-hidden="true">Licensed preview</div>
            )}
            <span className="document-section">{source.section} · {source.page}</span>
            {previewText.split("\n\n").map((paragraph) => (
              <p key={paragraph}>
                <MarkedPassage text={paragraph} exactPassage={source.exactPassage} />
              </p>
            ))}
          </div>
        </>
      ) : canPreview && source.live ? (
        <div className="metadata-preview">
          <span>Authorized preview</span>
          <strong>Preview text has not been loaded</strong>
          <p>Select this source to request its authorized preview from the backend. Restricted text is not cached as a fallback.</p>
        </div>
      ) : policy.preview === "metadata-only" ? (
        <div className="metadata-preview">
          <span>Rights boundary</span>
          <strong>Document text is not hosted</strong>
          <p>The registry retains source identity, edition, section, page, and rights metadata only.</p>
        </div>
      ) : (
        <div className="restricted-preview" aria-hidden="true">
          <div />
          <div />
          <div className="short" />
        </div>
      )}

      {!excluded && (
        <section className="rights-metadata">
          <span className="eyebrow">Rights and hosting</span>
          <dl>
            <div><dt>Rights holder</dt><dd>{source.rights.holder}</dd></div>
            <div><dt>License</dt><dd>{source.rights.license}</dd></div>
            <div><dt>Allowed use</dt><dd>{source.rights.allowedUse}</dd></div>
            <div><dt>Hosting</dt><dd>{source.rights.hosting.replaceAll("-", " ")}</dd></div>
            <div><dt>Retention</dt><dd>{source.rights.retention}</dd></div>
          </dl>
        </section>
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
            {policy.preview === "full" && "Full text preview"}
            {policy.preview === "watermarked" && "Licensed preview"}
            {policy.preview === "metadata-only" && "Citation metadata"}
            {policy.preview === "none" && "Preview locked"}
          </button>
          {canOpenOriginal ? (
            <a href={source.originalUrl} rel="noreferrer" target="_blank">
              {source.sourceAccessAction ?? "Open source"}
            </a>
          ) : (
            <button disabled type="button">
              {policy.original === "blocked-license" && "Original blocked by license"}
              {policy.original === "blocked-entitlement" && "Request entitlement"}
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
              ? `The ${persona} role has source access.`
              : "Request access from the source owner or switch to an entitled role."}
          </span>
        </div>
      )}
      <footer>
        {excluded ? (
          <span>No source metadata retained in this answer</span>
        ) : (
          <>
            <span>{source.registry.owner}</span>
            <span>Registry status: {source.registry.status.replace("-", " ")}</span>
          </>
        )}
      </footer>
    </section>
  );
}
