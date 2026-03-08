import type { PlanTier } from "./plans";

export const UPLOAD_FIELD_MAPPINGS = [
  "Name",
  "Guardian Phone",
  "Guardian Email",
  "Age (calculate)",
  "Allergies",
  "Pickup Location",
  "Drop-off Location",
  "Special Needs",
  "Notes",
  "(Ignore)",
] as const;

export type UploadFieldMapping = typeof UPLOAD_FIELD_MAPPINGS[number];

// ── Database row shapes ───────────────────────────────────────────────────────

export interface Profile {
  id: string;                  // = auth.users.id
  email: string;
  full_name: string | null;
  role: "admin" | "teacher";
  org_id: string;
  plan_tier: PlanTier;
  created_at: string;
}

export interface Org {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  plan_tier: PlanTier;
  plan_overrides: Record<string, unknown> | null;
  created_at: string;
}

export interface Teacher {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface CheckinListSourceMetadata {
  class_list_title: string;
  start_time: string;
  stop_time: string;
  room_location: string;
  teacher_name: string;
  default_pickup_drop_location: string;
}

export interface CheckinList {
  id: string;
  org_id: string;
  name: string;
  created_by: string;
  source_image_url: string | null;
  recurring_days: number[];      // 0=Sun … 6=Sat
  recurring_time: string | null; // "HH:MM"
  custom_columns: CustomColumn[];
  source_metadata: CheckinListSourceMetadata;
  version: number;
  parent_list_id: string | null; // for recurring copies
  original_teacher_id: string | null;
  substitute_teacher_id: string | null;
  created_at: string;
  archived: boolean;
}

export interface CustomColumn {
  id: string;
  name: string;
  type: "text" | "phone" | "select" | "boolean";
  options?: string[];            // for select type
  required: boolean;
  global: boolean;               // admin-defined vs list-specific
}

export interface Student {
  id: string;
  list_id: string;
  uid: string;                   // CW001 style
  name: string;
  first_name: string;
  last_name: string;
  custom_data: Record<string, string | boolean | null>;
  qr_code_url: string | null;
  created_at: string;
}

export interface CheckinSession {
  id: string;
  list_id: string;
  session_date: string;          // ISO date
  submitted_at: string | null;
  submitted_by: string | null;
  sub_teacher_name: string | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  session_id: string;
  student_id: string;
  status: "present" | "absent" | null;
  checkin_type: "manual" | "qr" | "group";
  checked_at: string | null;
}

export interface NotificationLog {
  id: string;
  org_id: string;
  session_id: string | null;
  type: "arrival" | "absent" | "emergency" | "sub_assigned" | "magic_link";
  channel: "sms" | "email";
  recipient: string;
  status: "sent" | "failed" | "queued";
  created_at: string;
}

// ── App-level types ───────────────────────────────────────────────────────────

export interface StudentWithStatus extends Student {
  status: "present" | "absent" | null;
  checkin_type?: "manual" | "qr" | "group";
}

export type SubmittedAttendanceStatus = Exclude<Attendance["status"], null>;

export interface CheckinSubmitAttendanceRow {
  student_id: string;
  status: SubmittedAttendanceStatus;
  checkin_type: Attendance["checkin_type"];
}

export interface CheckinSubmitRequest {
  session_id: string;
  attendance: CheckinSubmitAttendanceRow[];
}

export interface CheckinSubmitNotificationSummary {
  enabled: boolean;
  sent: number;
  failed: number;
  skipped: number;
  missing_guardian_email: number;
  skipped_reason: string | null;
  org_contact: string | null;
}

export interface CheckinSubmitResponse {
  success: true;
  data: {
    session: Pick<CheckinSession, "id" | "submitted_at">;
    attendance_count: number;
    notifications: CheckinSubmitNotificationSummary;
  };
}

export interface GeminiExtractResult {
  names: string[];
  detected_columns: DetectedColumn[];
  raw_text: string;
  primary_block?: GeminiPrimaryBlock;
  metadata_suggestions?: GeminiMetadataSuggestion[];
  overflow_blocks?: GeminiOverflowBlock[];
  manual_review?: GeminiManualReviewState;
}

export interface DetectedColumn {
  header: string;
  sample_values: string[];
  suggested_mapping: string;
  confidence: number;
  values?: string[];
}

export interface GeminiPrimaryBlock {
  status: "selected" | "manual_review";
  selection_reason: string;
  rows: GeminiRosterRow[];
  metadata: GeminiRosterMetadata;
  raw_text: string;
}

export interface GeminiRosterRow {
  child_display_name: string;
  child_first_name: string;
  child_last_name: string;
  child_sheet_number: string;
  guardian_full_name: string;
  guardian_phone: string;
  guardian_email: string;
  short_code: string;
  pickup_drop_location: string;
  allergies: string;
  special_needs: string;
  raw_row_text: string;
}

export interface GeminiRosterMetadata {
  class_list_title: string;
  start_time: string;
  stop_time: string;
  room_location: string;
  teacher_name: string;
}

export interface GeminiMetadataSuggestion {
  field: keyof GeminiRosterMetadata;
  value: string;
  confidence: number;
  reason: string;
}

export interface GeminiOverflowBlock {
  label: string;
  kind: "secondary_roster" | "ambiguous_row_data" | "legend" | "footer" | "other";
  raw_text: string;
}

export interface GeminiManualReviewState {
  required: boolean;
  reason: string;
  candidate_block_labels: string[];
}
