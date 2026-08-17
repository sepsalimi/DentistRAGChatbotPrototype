// Verifies rights-first upload decisions before multipart submission.
import { describe, expect, it } from "vitest";
import { prepareRegistryUploadFormData, rightsDecision } from "./ingestion";

describe("source ingestion rights decisions", () => {
  it("keeps unknown and prohibited sources metadata-only", () => {
    expect(rightsDecision("unknown", "permitted", true)).toMatchObject({
      status: "Metadata only",
    });
    expect(rightsDecision("prohibited", "permitted", true).detail).toContain(
      "no file bytes, passages, chunks, or embeddings are stored",
    );
  });

  it("requires explicit passage permission when hosting is not permitted", () => {
    expect(rightsDecision("approved", "not_permitted", false)).toMatchObject({
      status: "Metadata only",
    });
    expect(rightsDecision("approved", "not_permitted", true)).toMatchObject({
      status: "Passages stored; original discarded",
    });
  });

  it("stores the original only when hosting is permitted", () => {
    expect(rightsDecision("approved", "permitted", false)).toMatchObject({
      status: "Original and passages stored",
    });
  });

  it("builds the exact backend multipart scope and removes empty optionals", () => {
    const formData = new FormData();
    formData.set("title", "Guideline");
    formData.set("document_identity", "DOI 10/example");
    formData.set("publisher", "");
    const prepared = prepareRegistryUploadFormData(formData, {
      userId: "user-hygienist",
      accessType: "licensed",
      rights: "approved",
      hosting: "not_permitted",
      allowedRoles: ["dentist", "hygienist"],
      passageStoragePermitted: true,
      patientContextId: "patient-maya",
    });
    expect(Object.fromEntries(prepared.entries())).toEqual({
      title: "Guideline",
      document_identity: "DOI 10/example",
      user_id: "user-hygienist",
      access_type: "licensed",
      ai_usage_rights: "approved",
      hosting_permission: "not_permitted",
      allowed_roles: "dentist,hygienist",
      passage_storage_permitted: "true",
      patient_context_id: "patient-maya",
    });
  });
});
