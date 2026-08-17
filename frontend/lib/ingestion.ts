// Derives transparent storage outcomes from the backend ingestion gate inputs.
import type {
  AIUsageRights,
  AccessType,
  HostingPermission,
  Persona,
} from "./types";

const optionalUploadFields = [
  "required_entitlement",
  "publisher",
  "edition",
  "publication_date",
  "effective_date",
  "applicability",
  "source_uri",
  "supersedes_source_id",
] as const;

export const prepareRegistryUploadFormData = (
  formData: FormData,
  scope: {
    userId: string;
    accessType: AccessType;
    rights: AIUsageRights;
    hosting: HostingPermission;
    allowedRoles: Persona[];
    passageStoragePermitted: boolean;
    patientContextId?: string;
  },
) => {
  formData.set("user_id", scope.userId);
  formData.set("access_type", scope.accessType);
  formData.set("ai_usage_rights", scope.rights);
  formData.set("hosting_permission", scope.hosting);
  formData.set("allowed_roles", scope.allowedRoles.join(","));
  formData.set("passage_storage_permitted", String(scope.passageStoragePermitted));
  if (scope.patientContextId) formData.set("patient_context_id", scope.patientContextId);
  else formData.delete("patient_context_id");
  for (const field of optionalUploadFields) {
    if (!String(formData.get(field) ?? "").trim()) formData.delete(field);
  }
  return formData;
};

export const rightsDecision = (
  rights: AIUsageRights,
  hosting: HostingPermission,
  passageStoragePermitted: boolean,
) => {
  if (rights !== "approved") {
    return {
      status: "Metadata only",
      detail: `${rights === "unknown" ? "Unknown" : "Prohibited"} AI rights: no file bytes, passages, chunks, or embeddings are stored.`,
    };
  }
  if (hosting === "permitted") {
    return {
      status: "Original and passages stored",
      detail: "Approved AI use and hosting permission allow the original file and parsed passages to be stored.",
    };
  }
  if (passageStoragePermitted) {
    return {
      status: "Passages stored; original discarded",
      detail: "Hosting is not permitted, but explicit passage storage permission allows approved passages and chunks.",
    };
  }
  return {
    status: "Metadata only",
    detail: "Hosting is not permitted. Approved AI use requires explicit passage storage permission before passages or chunks can be retained.",
  };
};
