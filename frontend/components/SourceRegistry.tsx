// Loads and filters the live Source Registry while preserving safe static fixtures.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchRegistrySources, PATIENT_CONTEXT_ID } from "@/lib/api";
import { sources as fixtureSources } from "@/lib/demo-data";
import type {
  AIUsageRights,
  AccessType,
  EvidenceSource,
  IngestionStatus,
  Persona,
} from "@/lib/types";

const staticDeployment = process.env.NEXT_PUBLIC_STATIC_DEMO === "true";
const roles: Array<{ value: Persona; label: string }> = [
  { value: "student", label: "Student" },
  { value: "dentist", label: "Dentist" },
  { value: "hygienist", label: "Hygienist" },
  { value: "reception", label: "Reception" },
];

export function SourceRegistry() {
  const [sources, setSources] = useState<EvidenceSource[]>(staticDeployment ? fixtureSources : []);
  const [persona, setPersona] = useState<Persona>("dentist");
  const [patientContext, setPatientContext] = useState(false);
  const [query, setQuery] = useState("");
  const [rights, setRights] = useState<AIUsageRights | "all">("all");
  const [accessType, setAccessType] = useState<AccessType | "all">("all");
  const [status, setStatus] = useState<IngestionStatus | "all">("all");
  const [version, setVersion] = useState<"all" | "current" | "superseded">("current");
  const [loading, setLoading] = useState(!staticDeployment);
  const [error, setError] = useState<string | null>(null);

  const patientContextAllowed = persona === "dentist" || persona === "hygienist";
  const patientContextId = patientContext ? PATIENT_CONTEXT_ID : undefined;

  const refresh = useCallback(async () => {
    if (staticDeployment) {
      setSources(fixtureSources);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSources(await fetchRegistrySources(persona, patientContextId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Registry request failed.");
    } finally {
      setLoading(false);
    }
  }, [patientContextId, persona]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const changePersona = (nextPersona: Persona) => {
    setPersona(nextPersona);
    if (nextPersona === "student" || nextPersona === "reception") setPatientContext(false);
  };

  const filteredSources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sources.filter((source) => {
      const matchesQuery = !normalizedQuery || [
        source.title,
        source.publisher,
        source.identifier,
        source.tags.join(" "),
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
      const sourceRights = source.aiUsageRights ?? "approved";
      const sourceAccess = source.accessType ?? "public";
      const sourceStatus = source.passageStatus;
      const isSuperseded = Boolean(source.supersededBySourceId);
      return matchesQuery
        && (rights === "all" || sourceRights === rights)
        && (accessType === "all" || sourceAccess === accessType)
        && (status === "all" || sourceStatus === status)
        && (version === "all" || (version === "superseded" ? isSuperseded : !isSuperseded));
    });
  }, [accessType, query, rights, sources, status, version]);

  return (
    <section className="source-registry" aria-label="Source registry">
      <div className="registry-scope">
        <div>
          <span className="eyebrow">Request scope</span>
          <div className="registry-role-buttons">
            {roles.map((role) => (
              <button
                className={role.value === persona ? "active" : ""}
                key={role.value}
                onClick={() => changePersona(role.value)}
                type="button"
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>
        <label className={!patientContextAllowed ? "disabled" : ""}>
          <input
            checked={patientContext}
            disabled={!patientContextAllowed}
            onChange={(event) => setPatientContext(event.target.checked)}
            type="checkbox"
          />
          Include patient-maya
        </label>
        <button className="secondary-button" disabled={loading} onClick={() => void refresh()} type="button">
          {loading ? "Loading…" : "Refresh registry"}
        </button>
      </div>

      {staticDeployment && (
        <div className="panel-state">Static Pages uses safe registry fixtures. Run locally for live registry data.</div>
      )}
      {error && <div className="panel-state panel-state-error" role="alert">{error}</div>}

      <div className="registry-summary">
        <div><strong>{sources.length}</strong><span>Visible sources</span></div>
        <div><strong>{sources.filter((source) => (source.aiUsageRights ?? "approved") === "approved").length}</strong><span>AI use approved</span></div>
        <div><strong>{sources.filter((source) => source.passageStatus === "metadata_only").length}</strong><span>Metadata only</span></div>
        <div><strong>{sources.filter((source) => source.supersededBySourceId).length}</strong><span>Superseded</span></div>
      </div>

      <div className="registry-filters">
        <label className="registry-search">
          <span>Search</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Title, publisher, identity, or tag" type="search" value={query} />
        </label>
        <label>
          <span>AI rights</span>
          <select onChange={(event) => setRights(event.target.value as AIUsageRights | "all")} value={rights}>
            <option value="all">All rights</option>
            <option value="approved">Approved</option>
            <option value="unknown">Unknown</option>
            <option value="prohibited">Prohibited</option>
          </select>
        </label>
        <label>
          <span>Access</span>
          <select onChange={(event) => setAccessType(event.target.value as AccessType | "all")} value={accessType}>
            <option value="all">All access types</option>
            <option value="public">Public</option>
            <option value="internal">Internal</option>
            <option value="licensed">Licensed</option>
            <option value="restricted">Restricted</option>
            <option value="user_provided">User provided</option>
          </select>
        </label>
        <label>
          <span>Passage status</span>
          <select onChange={(event) => setStatus(event.target.value as IngestionStatus | "all")} value={status}>
            <option value="all">All statuses</option>
            <option value="metadata_only">Metadata only</option>
            <option value="passages_stored">Passages stored</option>
            <option value="original_and_passages_stored">Original and passages</option>
          </select>
        </label>
        <label>
          <span>Version</span>
          <select onChange={(event) => setVersion(event.target.value as typeof version)} value={version}>
            <option value="current">Current</option>
            <option value="superseded">Superseded</option>
            <option value="all">All versions</option>
          </select>
        </label>
      </div>

      <div className="registry-result-heading">
        <strong>{loading ? "Loading sources…" : `${filteredSources.length} sources`}</strong>
        <span>Capabilities are current-request results; other roles are not inferred.</span>
      </div>
      <div className="registry-list">
        {filteredSources.map((source) => (
          <article key={source.id}>
            <header>
              <div>
                <span className="eyebrow">{source.accessType?.replaceAll("_", " ") ?? source.kind}</span>
                <h3>{source.title}</h3>
                <p>{source.publisher} · {source.edition}</p>
              </div>
              <span className={`registry-status registry-status-${source.aiUsageRights ?? "approved"}`}>
                {source.aiUsageRights ?? "approved"}
              </span>
            </header>
            <dl>
              <div><dt>Document identity</dt><dd>{source.identifier}</dd></div>
              <div><dt>Effective</dt><dd>{source.effectiveDate ?? "Not supplied"}</dd></div>
              <div><dt>Hosting</dt><dd>{source.hostingPermission?.replaceAll("_", " ") ?? source.rights.hosting.replaceAll("-", " ")}</dd></div>
              <div><dt>Passage status</dt><dd>{source.passageStatus?.replaceAll("_", " ") ?? source.registry.status.replace("-", " ")}</dd></div>
              <div><dt>Capability</dt><dd>{source.capabilityReason?.replaceAll("_", " ") ?? "Fixture policy"}</dd></div>
              <div><dt>Publisher action</dt><dd>{source.sourceAccessAction ?? "View source details"}</dd></div>
              <div><dt>Allowed roles</dt><dd>{source.allowedRoles?.join(", ") ?? "Fixture roles"}</dd></div>
              <div><dt>Supersession</dt><dd>{source.supersededBySourceId ? `Superseded by ${source.supersededBySourceId}` : source.supersedesSourceId ? `Supersedes ${source.supersedesSourceId}` : "Current"}</dd></div>
            </dl>
            <footer>
              <span>{source.applicability ?? source.jurisdiction}</span>
              <span>{source.rights.allowedUse.replaceAll("_", " ")}</span>
            </footer>
          </article>
        ))}
        {!loading && filteredSources.length === 0 && <div className="registry-empty">No sources match this request scope and filters.</div>}
      </div>
    </section>
  );
}
