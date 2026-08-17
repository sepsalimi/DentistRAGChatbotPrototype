// Explains fixture or live claim support and access impact without reasoning traces.
import type { DemoAnswer, EvidenceSource, Persona } from "@/lib/types";

export function EvidenceInspector({
  answer,
  persona,
  sources,
  onSelectSource,
}: {
  answer: DemoAnswer;
  persona: Persona;
  sources: EvidenceSource[];
  onSelectSource: (sourceId: string) => void;
}) {
  const otherPersona = persona === "dentist" ? "frontDesk" : "dentist";
  const changedSources = sources.filter(
    (source) =>
      source.access[persona].scenario !== source.access[otherPersona].scenario ||
      source.access[persona].entitlement !== source.access[otherPersona].entitlement,
  );
  const accessLabel = (source: EvidenceSource, role: Persona) => {
    const policy = source.access[role];
    if (policy.scenario !== "entitled") return policy.scenario.replace("-", " ");
    return policy.entitlement === "entitled" ? "entitled" : "locked";
  };

  return (
    <div className="inspector">
      <div className="inspector-intro">
        <strong>Why this answer</strong>
        <span>Evidence coverage, not private model reasoning</span>
      </div>
      <div className="claim-list">
        {answer.claims.map((claim, index) => (
          <article className="claim-card" key={claim.claim}>
            <div className="claim-heading">
              <span className="claim-number">{index + 1}</span>
              <p>{claim.claim}</p>
              <span className={`strength strength-${claim.strength}`}>{claim.strength}</span>
            </div>
            <div className="claim-meta">
              <span>{claim.recency}</span>
              {claim.flag && <span className={`flag flag-${claim.flag}`}>{claim.flag}</span>}
            </div>
            <div className="mapped-sources">
              {claim.sourceIds.length > 0 ? claim.sourceIds.map((id) => {
                const source = sources.find((item) => item.id === id);
                return source ? (
                  <button key={id} onClick={() => onSelectSource(id)} type="button">
                    {source.title}
                  </button>
                ) : null;
              }) : <span>No accessible source mapped</span>}
            </div>
            {claim.note && <p className="claim-note">{claim.note}</p>}
          </article>
        ))}
      </div>
      {answer.disagreements && answer.disagreements.length > 0 && (
        <section className="disagreement-list">
          <span className="eyebrow">Source disagreements</span>
          {answer.disagreements.map((item) => (
            <article key={`${item.topic}-${item.preferredSourceId}`}>
              <strong>{item.topic}</strong>
              <p>{item.explanation}</p>
              <div>
                <button onClick={() => onSelectSource(item.preferredSourceId)} type="button">
                  Preferred source
                </button>
                <button onClick={() => onSelectSource(item.conflictingSourceId)} type="button">
                  Conflicting source
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      <section className="access-impact">
        <div>
          <span className="eyebrow">Access impact</span>
          <h4>What changes by role</h4>
        </div>
        {changedSources.map((source) => (
          <div className="access-row" key={source.id}>
            <span>
              {source.access[persona].scenario === "excluded"
                ? "Restricted source"
                : source.title}
            </span>
            <div>
              <small>Dentist</small>
              <strong>{accessLabel(source, "dentist")}</strong>
            </div>
            <div>
              <small>Front desk</small>
              <strong>{accessLabel(source, "frontDesk")}</strong>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
