export const FLOW_ID_HEADER = "x-upload-flow-id";

const FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

export type SchemaDriftDiagnostic = {
  suspectedMigration: string | null;
  reason: string | null;
};

export function getSchemaDriftUserMessage(area: string, diagnostic: SchemaDriftDiagnostic) {
  if (!diagnostic.suspectedMigration) {
    return null;
  }

  return `${area} is blocked because the deployed database appears to be missing ${diagnostic.suspectedMigration}. Apply that migration in production and retry.`;
}

export function normalizeFlowId(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return FLOW_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function appendFlowIdToPath(path: string, flowId: string) {
  if (!path) {
    return path;
  }

  const [beforeHash, hash = ""] = path.split("#", 2);
  const separator = beforeHash.includes("?") ? "&" : "?";
  const withFlowId = `${beforeHash}${separator}flowId=${encodeURIComponent(flowId)}`;
  return hash ? `${withFlowId}#${hash}` : withFlowId;
}

export function getSchemaDriftDiagnosticFromStrings(...parts: Array<string | null | undefined>): SchemaDriftDiagnostic {
  const combined = parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .toLowerCase();

  if (!combined) {
    return { suspectedMigration: null, reason: null };
  }

  if (
    combined.includes("orgs.phone")
    || combined.includes("orgs.email")
    || (combined.includes('relation "orgs"') && (combined.includes('"phone"') || combined.includes('"email"')))
    || (combined.includes(" relation orgs ") && (combined.includes(" phone ") || combined.includes(" email ")))
  ) {
    return {
      suspectedMigration: "0004_add_org_contact_fields.sql",
      reason: "Current code expects orgs.phone and orgs.email.",
    };
  }

  if (
    combined.includes("first_name")
    || combined.includes("last_name")
    || combined.includes("source_metadata")
  ) {
    return {
      suspectedMigration: "0005_student_name_parts_and_list_source_metadata.sql",
      reason: "Current code expects students.first_name/last_name plus checkin_lists.source_metadata.",
    };
  }

  if (
    combined.includes("original_teacher_id")
    || combined.includes("substitute_teacher_id")
    || combined.includes("public.teachers")
    || combined.includes('"teachers"')
    || combined.includes(" relation teachers ")
  ) {
    return {
      suspectedMigration: "0006_teacher_directory_and_list_assignments.sql",
      reason: "Current code expects the teachers table plus checkin_lists original/substitute teacher columns.",
    };
  }

  return { suspectedMigration: null, reason: null };
}