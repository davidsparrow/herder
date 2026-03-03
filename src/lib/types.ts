import type { PlanTier } from "./plans";

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
  plan_tier: PlanTier;
  plan_overrides: Record<string, unknown> | null;
  created_at: string;
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
  version: number;
  parent_list_id: string | null; // for recurring copies
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

export interface GeminiExtractResult {
  names: string[];
  detected_columns: DetectedColumn[];
  raw_text: string;
}

export interface DetectedColumn {
  header: string;
  sample_values: string[];
  suggested_mapping: string;
  confidence: number;
}
