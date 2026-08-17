// Posts the backend's exact governed-source multipart contract and previews rights outcomes.
"use client";

import { FormEvent, useState } from "react";
import {
  fetchRegistrySources,
  PATIENT_CONTEXT_ID,
  personaToUserId,
  uploadRegistrySource,
} from "@/lib/api";
import { prepareRegistryUploadFormData, rightsDecision } from "@/lib/ingestion";
import type {
  AIUsageRights,
  AccessType,
  HostingPermission,
  Persona,
} from "@/lib/types";

const staticDeployment = process.env.NEXT_PUBLIC_STATIC_DEMO === "true";
const roleLabels: Record<Persona, string> = {
  student: "Student",
  dentist: "Dentist",
  hygienist: "Hygienist",
  reception: "Reception",
};

export function SourceIngestionWizard() {
  const [uploaderRole, setUploaderRole] = useState<Extract<Persona, "dentist" | "hygienist">>("dentist");
  const [accessType, setAccessType] = useState<AccessType>("public");
  const [rights, setRights] = useState<AIUsageRights>("approved");
  const [hosting, setHosting] = useState<HostingPermission>("not_permitted");
  const [passageStoragePermitted, setPassageStoragePermitted] = useState(false);
  const [allowedRoles, setAllowedRoles] = useState<Persona[]>(["dentist", "hygienist"]);
  const [patientContext, setPatientContext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decision = rightsDecision(rights, hosting, passageStoragePermitted);

  const toggleRole = (role: Persona) => {
    setAllowedRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(null);
    setError(null);
    if (staticDeployment) {
      setResult("Static Pages did not upload or store any data.");
      return;
    }
    if (allowedRoles.length === 0) {
      setError("Select at least one allowed role.");
      return;
    }

    const form = event.currentTarget;
    const formData = prepareRegistryUploadFormData(new FormData(form), {
      userId: personaToUserId(uploaderRole),
      accessType,
      rights,
      hosting,
      allowedRoles,
      passageStoragePermitted,
      patientContextId: patientContext ? PATIENT_CONTEXT_ID : undefined,
    });

    setSubmitting(true);
    try {
      const upload = await uploadRegistrySource(formData);
      const refreshed = await fetchRegistrySources(
        uploaderRole,
        patientContext ? PATIENT_CONTEXT_ID : undefined,
      );
      setResult(
        `${upload.source.title} registered as ${upload.source.status.replaceAll("_", " ")}. `
        + `${upload.passage_count} passages; original ${upload.original_stored ? "stored" : "not stored"}. `
        + `Registry refreshed with ${refreshed.length} visible sources.`,
      );
      form.reset();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="ingestion-layout" onSubmit={submit}>
      <div className="wizard-fields">
        {staticDeployment && (
          <div className="static-upload-notice">
            <strong>Static Pages: uploads are disabled</strong>
            <span>Run locally with the API service to submit PDF or UTF-8 TXT files. Decision fields remain interactive.</span>
          </div>
        )}

        <fieldset>
          <legend><span>1</span> Source identity</legend>
          <div className="form-grid">
            <label>Uploader role
              <select onChange={(event) => setUploaderRole(event.target.value as typeof uploaderRole)} value={uploaderRole}>
                <option value="dentist">Dentist</option>
                <option value="hygienist">Hygienist</option>
              </select>
            </label>
            <label>Title<input name="title" placeholder="Clinical guideline title" required /></label>
            <label>Publisher<input name="publisher" placeholder="Publishing organization" /></label>
            <label>Document identity<input name="document_identity" placeholder="DOI, ISBN, or governed internal ID" required /></label>
            <label>Edition<input name="edition" placeholder="Edition or version" /></label>
            <label>Publication date<input name="publication_date" type="date" /></label>
            <label>Effective date<input name="effective_date" type="date" /></label>
            <label>Applicability<input name="applicability" placeholder="Jurisdiction or clinical scope" /></label>
            <label>Publisher URL<input name="source_uri" placeholder="https://publisher.example/source" type="url" /></label>
            <label>Supersedes source ID<input name="supersedes_source_id" placeholder="source-…" /></label>
          </div>
        </fieldset>

        <fieldset>
          <legend><span>2</span> File, access, and rights</legend>
          <div className="form-grid">
            <label className="wide-label">PDF or UTF-8 TXT file
              <input accept=".pdf,.txt,application/pdf,text/plain" disabled={staticDeployment} name="file" required={!staticDeployment} type="file" />
              <small>{staticDeployment ? "Disabled on GitHub Pages." : "Maximum 10 MB. Other file types are rejected by the backend."}</small>
            </label>
            <label>Access type
              <select onChange={(event) => setAccessType(event.target.value as AccessType)} value={accessType}>
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="licensed">Licensed</option>
                <option value="restricted">Restricted</option>
                <option value="user_provided">User provided</option>
              </select>
            </label>
            <label>AI usage rights
              <select onChange={(event) => setRights(event.target.value as AIUsageRights)} value={rights}>
                <option value="approved">Approved</option>
                <option value="unknown">Unknown</option>
                <option value="prohibited">Prohibited</option>
              </select>
            </label>
            <label>Hosting permission
              <select onChange={(event) => setHosting(event.target.value as HostingPermission)} value={hosting}>
                <option value="permitted">Permitted</option>
                <option value="not_permitted">Not permitted</option>
              </select>
            </label>
            <label>Required entitlement<input name="required_entitlement" placeholder="Optional entitlement key" /></label>
            <label className="wide-label checkbox-field">
              <input
                checked={passageStoragePermitted}
                onChange={(event) => setPassageStoragePermitted(event.target.checked)}
                type="checkbox"
              />
              Explicitly permit passage and chunk storage when hosting is not permitted
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend><span>3</span> Roles and patient scope</legend>
          <p className="fieldset-help">Allowed roles are sent as the backend comma-list. Patient context is optional and clinical-role only.</p>
          <div className="role-checkboxes">
            {(Object.keys(roleLabels) as Persona[]).map((role) => (
              <label key={role}>
                <input checked={allowedRoles.includes(role)} onChange={() => toggleRole(role)} type="checkbox" />
                <span>{roleLabels[role]}</span>
              </label>
            ))}
          </div>
          <label className="checkbox-field patient-upload-scope">
            <input checked={patientContext} onChange={(event) => setPatientContext(event.target.checked)} type="checkbox" />
            Restrict this source to patient-maya
          </label>
        </fieldset>
      </div>

      <aside className="decision-preview">
        <span className="eyebrow">Rights decision preview</span>
        <h2>{decision.status}</h2>
        <p>{decision.detail}</p>
        <dl>
          <div><dt>AI usage</dt><dd>{rights}</dd></div>
          <div><dt>Hosting</dt><dd>{hosting.replaceAll("_", " ")}</dd></div>
          <div><dt>Access</dt><dd>{accessType.replaceAll("_", " ")}</dd></div>
          <div><dt>Passage storage</dt><dd>{passageStoragePermitted ? "Explicitly permitted" : "Not permitted"}</dd></div>
          <div><dt>Patient context</dt><dd>{patientContext ? PATIENT_CONTEXT_ID : "None"}</dd></div>
        </dl>
        <button className="primary-button" disabled={submitting} type="submit">
          {staticDeployment ? "Check static decision" : submitting ? "Uploading…" : "Upload source"}
        </button>
        {result && <div className="decision-saved" role="status">{result}</div>}
        {error && <div className="panel-state panel-state-error" role="alert">{error}</div>}
      </aside>
    </form>
  );
}
