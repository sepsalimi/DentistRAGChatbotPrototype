// Explains claim support, structured retrieval stages, and role-specific access impact.
import type { DemoAnswer, EvidenceSource, Persona } from "@/lib/types";

const roleLabels: Record<Persona, string> = {
  student: "Student",
  dentist: "Dentist",
  hygienist: "Hygienist",
  reception: "Reception",
};

const accessLabel = (source: EvidenceSource, role: Persona) => {
  const policy = source.access[role];
  if (!policy) return "not evaluated";
  if (policy.scenario !== "entitled") return policy.scenario.replace("-", " ");
  return policy.entitlement === "entitled" ? "entitled" : "locked";
};

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
  const changedSources = sources.filter((source) => {
    const states = new Set(
      (Object.keys(roleLabels) as Persona[])
        .map((role) => source.access[role])
        .filter((policy) => Boolean(policy))
        .map((policy) => `${policy!.scenario}:${policy!.entitlement}`),
    );
    return states.size > 1;
  });
  const currentRoleOnly = sources.some((source) => Object.keys(source.access).length < 4);

  return (
    <div className="inspector">
      <section className="evidence-trace">
        <div className="inspector-intro">
          <strong>Evidence trace</strong>
          <span>Observable retrieval stages and policy outcomes, not private model reasoning</span>
        </div>
        <ol>
          {answer.evidenceTrace.map((step, index) => (
            <li key={`${step.stage}-${step.detail}`}>
              <span>{index + 1}</span>
              <div>
                <small>{step.stage}</small>
                <strong>{step.detail}</strong>
              </div>
              <b>{step.result}</b>
            </li>
          ))}
        </ol>
      </section>

      {answer.registryTrace && (
        <section className="access-impact">
          <span className="eyebrow">Registry authorization</span>
          <h4>Passage IDs and exclusions</h4>
          <dl className="trace-identifiers">
            <div><dt>Candidate sources</dt><dd>{answer.registryTrace.candidateSourceIds.join(", ") || "None"}</dd></div>
            <div><dt>Candidate passages</dt><dd>{answer.registryTrace.candidatePassageIds.join(", ") || "None"}</dd></div>
            <div><dt>Authorized passages</dt><dd>{answer.registryTrace.authorizedPassageIds.join(", ") || "None"}</dd></div>
            <div><dt>Ranked passages</dt><dd>{answer.registryTrace.rankedPassageIds.join(", ") || "None"}</dd></div>
          </dl>
          {Object.entries(answer.registryTrace.exclusionReasons).map(([id, reason]) => (
            <div className="trace-exclusion" key={id}>
              <strong>{id}</strong>
              <span>{reason.replaceAll("_", " ")}</span>
            </div>
          ))}
        </section>
      )}

      <div className="inspector-intro">
        <strong>Claim coverage</strong>
        <span>Answer statements mapped to accessible evidence</span>
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
                    {source.publisher} · {source.section} · {source.page}
                  </button>
                ) : null;
              }) : <span>No entitled source mapped</span>}
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
                <button onClick={() => onSelectSource(item.preferredSourceId)} type="button">Preferred source</button>
                <button onClick={() => onSelectSource(item.conflictingSourceId)} type="button">Conflicting source</button>
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
        {changedSources.length === 0 ? (
          <p className="access-impact-empty">
            {currentRoleOnly
              ? `Live capabilities were evaluated only for ${roleLabels[persona]}; other roles are intentionally not inferred.`
              : "These cited sources have the same access policy for every role."}
          </p>
        ) : changedSources.map((source) => (
          <div className="access-matrix-row" key={source.id}>
            <span>{source.title}</span>
            <div>
              {(Object.keys(roleLabels) as Persona[]).map((role) => (
                <span className={role === persona ? "active" : ""} key={role}>
                  <small>{roleLabels[role]}</small>
                  <strong>{accessLabel(source, role)}</strong>
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
