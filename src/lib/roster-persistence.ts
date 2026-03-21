import type {
  CheckinListSourceMetadata,
  CustomColumn,
  DetectedColumn,
  GeminiExtractResult,
  GeminiRosterRow,
  UploadFieldMapping,
} from "@/lib/types";

export const STUDENT_CUSTOM_FIELD_DEFINITIONS = {
  child_sheet_number: { label: "Sheet #", type: "text" },
  guardian_name: { label: "Guardian Name", type: "text" },
  guardian_phone: { label: "Guardian Phone", type: "phone" },
  guardian_email: { label: "Guardian Email", type: "text" },
  short_code: { label: "Short Code", type: "text" },
  pickup_notes_pre: { label: "Pickup Notes-pre", type: "text" },
  pickup_notes_post: { label: "Pickup Notes-post", type: "text" },
  allergies: { label: "Allergies", type: "text" },
  special_needs: { label: "Special Needs", type: "text" },
  notes: { label: "Pre-class Notes", type: "text" },
  post_class_notes: { label: "Post-class Notes", type: "text" },
  age: { label: "Age", type: "text" },
  primary_contact_name: { label: "Primary Contact Name", type: "text" },
  primary_contact_relation: { label: "Primary Contact Relation", type: "text" },
  primary_contact_phone: { label: "Primary Contact Phone", type: "phone" },
  primary_contact_email: { label: "Primary Contact Email", type: "text" },
} as const satisfies Record<string, { label: string; type: CustomColumn["type"] }>;

export const STUDENT_CUSTOM_FIELD_LABELS = Object.fromEntries(
  Object.entries(STUDENT_CUSTOM_FIELD_DEFINITIONS).map(([key, value]) => [key, value.label])
) as Record<string, string>;

const MAPPING_FIELD_KEYS: Partial<Record<UploadFieldMapping, keyof typeof STUDENT_CUSTOM_FIELD_DEFINITIONS>> = {
  "Guardian Name": "guardian_name",
  "Guardian Phone": "guardian_phone",
  "Guardian Email": "guardian_email",
  "Age (calculate)": "age",
  Allergies: "allergies",
  "Pickup Notes-pre": "pickup_notes_pre",
  "Pickup Notes-post": "pickup_notes_post",
  "Special Needs": "special_needs",
  Notes: "notes",
};

export interface PersistedStudentDraft {
  name: string;
  first_name: string;
  last_name: string;
  custom_data: Record<string, string | boolean | null>;
}

type MergeConflict = { key: string; existingValue: string; incomingValue: string };

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDisplayName(value: string) {
  const cleaned = value.replace(/^\s*\d+[.)\-:\s]*/, "").replace(/^\s*[-*•]+\s*/, "").replace(/\s+/g, " ").trim();
  if (!cleaned.includes(",")) {
    return cleaned;
  }

  const [lastName, ...rest] = cleaned.split(",");
  const trailing = rest.join(" ").trim();
  return trailing ? `${trailing} ${lastName.trim()}`.replace(/\s+/g, " ").trim() : cleaned;
}

export function splitStudentNameParts(value: string) {
  const displayName = normalizeDisplayName(value);
  const parts = displayName.split(/\s+/).filter(Boolean);

  return {
    displayName,
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

export function normalizeStudentNameKey(value: string) {
  return normalizeDisplayName(value).toLowerCase();
}

function normalizeComparableValue(key: string, value: string) {
  if (key === "guardian_phone") {
    return value.replace(/[^0-9]/g, "");
  }

  if (key === "guardian_email") {
    return value.toLowerCase();
  }

  return value.toLowerCase().replace(/\s+/g, " ");
}

function setIfPresent(target: Record<string, string | boolean | null>, key: keyof typeof STUDENT_CUSTOM_FIELD_DEFINITIONS, value: unknown) {
  const normalized = normalizeString(value);
  if (normalized) {
    target[key] = normalized;
  }
}

function buildDraftFromStructuredRow(row: GeminiRosterRow, fallbackName: string) {
  const nameParts = splitStudentNameParts(normalizeString(row.child_display_name) || fallbackName);
  if (!nameParts.displayName) {
    return null;
  }

  const customData: Record<string, string | boolean | null> = {};
  setIfPresent(customData, "child_sheet_number", row.child_sheet_number);
  setIfPresent(customData, "guardian_name", row.guardian_full_name);
  setIfPresent(customData, "guardian_phone", row.guardian_phone);
  setIfPresent(customData, "guardian_email", row.guardian_email);
  setIfPresent(customData, "short_code", row.short_code);
  setIfPresent(customData, "pickup_notes_pre", row.pickup_drop_location);
  setIfPresent(customData, "allergies", row.allergies);
  setIfPresent(customData, "special_needs", row.special_needs);

  return {
    name: nameParts.displayName,
    first_name: normalizeString(row.child_first_name) || nameParts.firstName,
    last_name: normalizeString(row.child_last_name) || nameParts.lastName,
    custom_data: customData,
  } satisfies PersistedStudentDraft;
}

function buildDraftFromLegacyName(name: string) {
  const nameParts = splitStudentNameParts(name);
  if (!nameParts.displayName) {
    return null;
  }

  return {
    name: nameParts.displayName,
    first_name: nameParts.firstName,
    last_name: nameParts.lastName,
    custom_data: {},
  } satisfies PersistedStudentDraft;
}

export function buildStudentDraftsFromExtraction(
  extracted: GeminiExtractResult,
  detectedColumns: DetectedColumn[],
  mappings: UploadFieldMapping[]
) {
  const primaryRows = Array.isArray(extracted.primary_block?.rows) ? extracted.primary_block.rows : [];
  const baseDrafts = (primaryRows.length ? primaryRows.map((row, rowIndex) => buildDraftFromStructuredRow(row, extracted.names[rowIndex] ?? "")) : extracted.names.map(buildDraftFromLegacyName))
    .filter((student): student is PersistedStudentDraft => Boolean(student));

  detectedColumns.forEach((column, columnIndex) => {
    const mapping = mappings[columnIndex];
    const fieldKey = mapping ? MAPPING_FIELD_KEYS[mapping] : undefined;
    if (!fieldKey) {
      return;
    }

    baseDrafts.forEach((student, rowIndex) => {
      const value = normalizeString(column.values?.[rowIndex]);
      if (value && !student.custom_data[fieldKey]) {
        student.custom_data[fieldKey] = value;
      }
    });
  });

  return baseDrafts;
}

export function buildMappedCustomFieldKeys(mappings: UploadFieldMapping[]) {
  const keys = new Set<string>();

  mappings.forEach((mapping) => {
    const fieldKey = MAPPING_FIELD_KEYS[mapping];
    if (fieldKey) {
      keys.add(fieldKey);
    }
  });

  return keys;
}

export function buildCustomColumnsFromKeys(keys: Iterable<string>) {
  const seen = new Set<string>();
  const columns: CustomColumn[] = [];

  for (const key of Array.from(keys)) {
    const definition = STUDENT_CUSTOM_FIELD_DEFINITIONS[key as keyof typeof STUDENT_CUSTOM_FIELD_DEFINITIONS];
    if (!definition || seen.has(key)) {
      continue;
    }

    seen.add(key);
    columns.push({ id: key, name: definition.label, type: definition.type, required: false, global: false });
  }

  return columns;
}

export function buildSourceMetadataFromExtraction(extracted: GeminiExtractResult): CheckinListSourceMetadata {
  const metadata = extracted.primary_block?.metadata;
  const pickupDropValues = (extracted.primary_block?.rows ?? []).map((row) => normalizeString(row.pickup_drop_location)).filter(Boolean);
  const uniquePickupDropValues = Array.from(new Set(pickupDropValues.map((value) => value.toLowerCase())));

  return {
    class_list_title: normalizeString(metadata?.class_list_title),
    start_time: normalizeString(metadata?.start_time),
    stop_time: normalizeString(metadata?.stop_time),
    room_location: normalizeString(metadata?.room_location),
    teacher_name: normalizeString(metadata?.teacher_name),
    default_pickup_drop_location: uniquePickupDropValues.length === 1 ? pickupDropValues[0] ?? "" : "",
  };
}

export function normalizeSourceMetadata(value: unknown): CheckinListSourceMetadata {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    class_list_title: normalizeString(record.class_list_title),
    start_time: normalizeString(record.start_time),
    stop_time: normalizeString(record.stop_time),
    room_location: normalizeString(record.room_location),
    teacher_name: normalizeString(record.teacher_name),
    default_pickup_drop_location: normalizeString(record.default_pickup_drop_location),
  };
}

export function mergeSourceMetadata(existing: unknown, incoming: CheckinListSourceMetadata) {
  const current = normalizeSourceMetadata(existing);
  return {
    class_list_title: current.class_list_title || incoming.class_list_title,
    start_time: current.start_time || incoming.start_time,
    stop_time: current.stop_time || incoming.stop_time,
    room_location: current.room_location || incoming.room_location,
    teacher_name: current.teacher_name || incoming.teacher_name,
    default_pickup_drop_location: current.default_pickup_drop_location || incoming.default_pickup_drop_location,
  } satisfies CheckinListSourceMetadata;
}

export function mergeStudentDrafts(existing: PersistedStudentDraft, incoming: PersistedStudentDraft) {
  const conflicts: MergeConflict[] = [];
  const merged: PersistedStudentDraft = {
    name: existing.name || incoming.name,
    first_name: existing.first_name || incoming.first_name,
    last_name: existing.last_name || incoming.last_name,
    custom_data: { ...existing.custom_data },
  };

  (["first_name", "last_name"] as const).forEach((key) => {
    const existingValue = normalizeString(existing[key]);
    const incomingValue = normalizeString(incoming[key]);
    if (!existingValue || !incomingValue) {
      merged[key] = existingValue || incomingValue;
      return;
    }

    if (normalizeComparableValue(key, existingValue) !== normalizeComparableValue(key, incomingValue)) {
      conflicts.push({ key, existingValue, incomingValue });
    }
  });

  const customKeys = new Set([...Object.keys(existing.custom_data), ...Object.keys(incoming.custom_data)]);
  customKeys.forEach((key) => {
    const existingValue = normalizeString(existing.custom_data[key]);
    const incomingValue = normalizeString(incoming.custom_data[key]);
    if (!existingValue || !incomingValue) {
      const nextValue = existingValue || incomingValue;
      if (nextValue) {
        merged.custom_data[key] = nextValue;
      }
      return;
    }

    if (normalizeComparableValue(key, existingValue) !== normalizeComparableValue(key, incomingValue)) {
      conflicts.push({ key, existingValue, incomingValue });
      return;
    }

    merged.custom_data[key] = existingValue.length >= incomingValue.length ? existingValue : incomingValue;
  });

  return { merged, conflicts };
}

export function getNextStudentUid(existingUids: string[]) {
  const maxNumber = existingUids.reduce((highest, uid) => {
    const match = uid.match(/(\d+)$/);
    const value = match ? Number.parseInt(match[1] ?? "0", 10) : 0;
    return Number.isFinite(value) ? Math.max(highest, value) : highest;
  }, 0);

  return `STU${String(maxNumber + 1).padStart(3, "0")}`;
}