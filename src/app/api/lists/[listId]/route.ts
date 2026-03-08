import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: {
    listId: string;
  };
};

type UpdateListTeacherBody = {
  originalTeacherId?: string | null;
  substituteTeacherId?: string | null;
};

function normalizeTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableTrimmedString(value: unknown) {
  const trimmed = normalizeTrimmedString(value);
  return trimmed || null;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
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

  if (!profile?.org_id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const listId = normalizeTrimmedString(params.listId);
  if (!listId) {
    return NextResponse.json({ error: "A list ID is required." }, { status: 400 });
  }

  const body = await req.json() as UpdateListTeacherBody;
  const originalTeacherId = normalizeNullableTrimmedString(body.originalTeacherId);
  const substituteTeacherId = normalizeNullableTrimmedString(body.substituteTeacherId);

  if (substituteTeacherId && !originalTeacherId) {
    return NextResponse.json({ error: "Select an original teacher before assigning a substitute." }, { status: 400 });
  }

  if (originalTeacherId && substituteTeacherId && originalTeacherId === substituteTeacherId) {
    return NextResponse.json({ error: "Original teacher and substitute teacher must be different people." }, { status: 400 });
  }

  const { data: list, error: listError } = await supabase
    .from("checkin_lists")
    .select("id")
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

  const teacherIds = [originalTeacherId, substituteTeacherId].filter((value): value is string => Boolean(value));
  if (teacherIds.length > 0) {
    const { data: teachers, error: teacherError } = await supabase
      .from("teachers")
      .select("id")
      .eq("org_id", profile.org_id)
      .in("id", teacherIds);

    if (teacherError) {
      return NextResponse.json({ error: teacherError.message }, { status: 500 });
    }

    const validIds = new Set((teachers ?? []).map((teacher) => String(teacher.id)));
    if (teacherIds.some((teacherId) => !validIds.has(teacherId))) {
      return NextResponse.json({ error: "Choose teachers from your organization directory only." }, { status: 400 });
    }
  }

  const { data: updatedList, error: updateError } = await supabase
    .from("checkin_lists")
    .update({
      original_teacher_id: originalTeacherId,
      substitute_teacher_id: substituteTeacherId,
    })
    .eq("id", list.id)
    .eq("org_id", profile.org_id)
    .select("id, original_teacher_id, substitute_teacher_id")
    .single();

  if (updateError || !updatedList) {
    return NextResponse.json({ error: updateError?.message ?? "Could not update this list." }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: updatedList });
}