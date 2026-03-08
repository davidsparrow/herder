import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildCustomColumnsFromKeys,
  getNextStudentUid,
  mergeSourceMetadata,
  normalizeStudentNameKey,
  splitStudentNameParts,
} from "@/lib/roster-persistence";
import type { CustomColumn } from "@/lib/types";

type RouteContext = { params: { listId: string } };

type AddStudentRequestBody = {
  name?: string;
  firstName?: string;
  lastName?: string;
  childSheetNumber?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  shortCode?: string;
  pickupDropLocation?: string;
  allergies?: string;
  specialNeeds?: string;
};

function normalizeTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCustomColumns(value: unknown): CustomColumn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((column) => {
    if (!column || typeof column !== "object") {
      return [];
    }

    const record = column as Record<string, unknown>;
    const id = normalizeTrimmedString(record.id);
    const name = normalizeTrimmedString(record.name);
    const type = record.type;
    if (!id || !name || (type !== "text" && type !== "phone" && type !== "select" && type !== "boolean")) {
      return [];
    }

    return [{
      id,
      name,
      type,
      required: Boolean(record.required),
      global: Boolean(record.global),
      options: Array.isArray(record.options) ? record.options.filter((option): option is string => typeof option === "string") : undefined,
    } satisfies CustomColumn];
  });
}

function mergeCustomColumns(existing: CustomColumn[], incomingKeys: Iterable<string>) {
  const merged = [...existing];
  const seen = new Set(existing.map((column) => column.id));
  buildCustomColumnsFromKeys(incomingKeys).forEach((column) => {
    if (!seen.has(column.id)) {
      seen.add(column.id);
      merged.push(column);
    }
  });
  return merged;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const listId = normalizeTrimmedString(params.listId);
  if (!listId) {
    return NextResponse.json({ error: "A list ID is required." }, { status: 400 });
  }

  const { data: list, error: listError } = await supabase
    .from("checkin_lists")
    .select("id, custom_columns, source_metadata")
    .eq("id", listId)
    .eq("org_id", profile.org_id)
    .eq("archived", false)
    .maybeSingle();

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  if (!list) {
    return NextResponse.json({ error: "The selected list could not be found." }, { status: 404 });
  }

  const body = await req.json() as AddStudentRequestBody;
  const explicitName = normalizeTrimmedString(body.name);
  const firstName = normalizeTrimmedString(body.firstName);
  const lastName = normalizeTrimmedString(body.lastName);
  const derivedName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const nameParts = splitStudentNameParts(explicitName || derivedName);

  if (!nameParts.displayName) {
    return NextResponse.json({ error: "A student name is required." }, { status: 400 });
  }

  const customData = {
    child_sheet_number: normalizeTrimmedString(body.childSheetNumber) || null,
    guardian_name: normalizeTrimmedString(body.guardianName) || null,
    guardian_phone: normalizeTrimmedString(body.guardianPhone) || null,
    guardian_email: normalizeTrimmedString(body.guardianEmail) || null,
    short_code: normalizeTrimmedString(body.shortCode) || null,
    pickup_drop_location: normalizeTrimmedString(body.pickupDropLocation) || null,
    allergies: normalizeTrimmedString(body.allergies) || null,
    special_needs: normalizeTrimmedString(body.specialNeeds) || null,
  } satisfies Record<string, string | null>;

  const { data: existingStudents, error: existingStudentsError } = await supabase
    .from("students")
    .select("uid, name")
    .eq("list_id", list.id)
    .order("uid");

  if (existingStudentsError) {
    return NextResponse.json({ error: existingStudentsError.message }, { status: 500 });
  }

  const nextNameKey = normalizeStudentNameKey(nameParts.displayName);
  if ((existingStudents ?? []).some((student) => normalizeStudentNameKey(student.name) === nextNameKey)) {
    return NextResponse.json({ error: `A student named ${nameParts.displayName} already exists on this list.` }, { status: 409 });
  }

  const uid = getNextStudentUid((existingStudents ?? []).map((student) => student.uid));
  const { data: createdStudent, error: createdStudentError } = await supabase
    .from("students")
    .insert({
      list_id: list.id,
      uid,
      name: nameParts.displayName,
      first_name: firstName || nameParts.firstName,
      last_name: lastName || nameParts.lastName,
      custom_data: customData,
    })
    .select("id, list_id, uid, name, first_name, last_name, custom_data, qr_code_url, created_at")
    .single();

  if (createdStudentError || !createdStudent) {
    return NextResponse.json({ error: createdStudentError?.message ?? "Failed to add the student." }, { status: 500 });
  }

  const nextCustomColumns = mergeCustomColumns(
    normalizeCustomColumns(list.custom_columns),
    Object.entries(customData).flatMap(([key, value]) => (value ? [key] : []))
  );

  const { error: updateListError } = await supabase
    .from("checkin_lists")
    .update({
      custom_columns: nextCustomColumns,
      source_metadata: mergeSourceMetadata(list.source_metadata, {
        class_list_title: "",
        start_time: "",
        stop_time: "",
        room_location: "",
        teacher_name: "",
        default_pickup_drop_location: normalizeTrimmedString(body.pickupDropLocation),
      }),
    })
    .eq("id", list.id)
    .eq("org_id", profile.org_id);

  if (updateListError) {
    return NextResponse.json({ error: updateListError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: createdStudent });
}