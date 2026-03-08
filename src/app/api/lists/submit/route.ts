import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendArrivalEmail, sendAbsentEmail } from "@/lib/email";
import { hasFeature } from "@/lib/plans";
import type {
  CheckinSubmitAttendanceRow,
  CheckinSubmitNotificationSummary,
  CheckinSubmitRequest,
  CheckinSubmitResponse,
} from "@/lib/types";

type EmailSendResult = Awaited<ReturnType<typeof sendArrivalEmail>>;

function getOptionalTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeAttendanceRows(value: unknown): CheckinSubmitAttendanceRow[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const seenStudentIds = new Set<string>();
  const normalizedRows: CheckinSubmitAttendanceRow[] = [];

  for (const row of value) {
    if (!row || typeof row !== "object") {
      return null;
    }

    const candidate = row as Partial<CheckinSubmitAttendanceRow>;
    const studentId = getOptionalTrimmedString(candidate.student_id);

    if (!studentId || (candidate.status !== "present" && candidate.status !== "absent")) {
      return null;
    }

    if (seenStudentIds.has(studentId)) {
      continue;
    }

    seenStudentIds.add(studentId);
    normalizedRows.push({
      student_id: studentId,
      status: candidate.status,
      checkin_type: candidate.checkin_type === "qr" || candidate.checkin_type === "group"
        ? candidate.checkin_type
        : "manual",
    });
  }

  return normalizedRows;
}

function didSendEmail(result: EmailSendResult) {
  return !result.error && Boolean(result.data?.id);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("org_id, plan_tier")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const body = await req.json() as Partial<CheckinSubmitRequest>;
  const sessionId = getOptionalTrimmedString(body.session_id);
  const attendance = normalizeAttendanceRows(body.attendance);

  if (!sessionId) {
    return NextResponse.json({ error: "A real session_id is required." }, { status: 400 });
  }

  if (!attendance || attendance.length === 0) {
    return NextResponse.json({ error: "At least one real attendance row is required." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("checkin_sessions")
    .select("id, list_id, session_date, submitted_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: "Check-in session not found." }, { status: 404 });
  }

  const { data: list, error: listError } = await supabase
    .from("checkin_lists")
    .select("id, org_id, name")
    .eq("id", session.list_id)
    .eq("org_id", profile.org_id)
    .eq("archived", false)
    .maybeSingle();

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  if (!list) {
    return NextResponse.json({ error: "This session does not belong to your organization." }, { status: 404 });
  }

  if (session.submitted_at) {
    return NextResponse.json(
      { error: `This session was already submitted at ${session.submitted_at}.` },
      { status: 409 }
    );
  }

  const studentIds = attendance.map((row) => row.student_id);
  const [{ data: students, error: studentsError }, { data: org, error: orgError }] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, custom_data")
      .eq("list_id", session.list_id)
      .in("id", studentIds),
    supabase
      .from("orgs")
      .select("id, name, email, phone")
      .eq("id", profile.org_id)
      .single(),
  ]);

  if (studentsError) {
    return NextResponse.json({ error: studentsError.message }, { status: 500 });
  }

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  if (!students || students.length !== studentIds.length) {
    return NextResponse.json(
      { error: "Some submitted attendance rows do not belong to the real roster for this session." },
      { status: 400 }
    );
  }

  // Upsert all attendance rows
  const submittedAt = new Date().toISOString();
  const rows = attendance.map((a) => ({
    session_id: sessionId,
    student_id: a.student_id,
    status: a.status,
    checkin_type: a.checkin_type ?? "manual",
    checked_at: submittedAt,
  }));

  const { error: attError } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "session_id,student_id" });

  if (attError) return NextResponse.json({ error: attError.message }, { status: 500 });

  // Mark session as submitted
  const { data: updatedSession, error: submittedSessionError } = await supabase
    .from("checkin_sessions")
    .update({ submitted_at: submittedAt, submitted_by: user.id })
    .eq("id", sessionId)
    .select("id, submitted_at")
    .single();

  if (submittedSessionError || !updatedSession) {
    return NextResponse.json(
      { error: submittedSessionError?.message ?? "Attendance was saved but the session could not be marked submitted." },
      { status: 500 }
    );
  }

  // ── Notifications (Pro only) ───────────────────────────────────────────────
  const notificationsEnabled = hasFeature(profile.plan_tier, "notifications");
  const notificationResults: CheckinSubmitNotificationSummary = {
    enabled: notificationsEnabled,
    sent: 0,
    failed: 0,
    skipped: notificationsEnabled ? 0 : attendance.length,
    missing_guardian_email: 0,
    skipped_reason: notificationsEnabled ? null : "Notifications require Pro plan",
    org_contact: getOptionalTrimmedString(org?.email) ?? getOptionalTrimmedString(org?.phone),
  };

  if (notificationsEnabled) {
    const studentById = new Map(students.map((student) => [student.id, student]));

    for (const att of attendance) {
      const student = studentById.get(att.student_id);
      if (!student) {
        notificationResults.skipped++;
        continue;
      }

      const guardianEmail = getOptionalTrimmedString(student.custom_data?.guardian_email);
      if (!guardianEmail) {
        notificationResults.skipped++;
        notificationResults.missing_guardian_email++;
        continue;
      }

      const guardianName = getOptionalTrimmedString(student.custom_data?.guardian_name) ?? "there";

      try {
        const emailResult = att.status === "present"
          ? await sendArrivalEmail({
            to: guardianEmail,
            guardianName,
            studentName: student.name,
            className: list.name,
            sessionDate: session.session_date,
          })
          : await sendAbsentEmail({
            to: guardianEmail,
            guardianName,
            studentName: student.name,
            className: list.name,
            sessionDate: session.session_date,
            adminContact: notificationResults.org_contact ?? undefined,
          });

        if (!didSendEmail(emailResult)) {
          notificationResults.failed++;
          console.error("Email send failed", emailResult.error ?? new Error("Email provider returned no id."));
          continue;
        }

        notificationResults.sent++;
      } catch (error) {
        notificationResults.failed++;
        console.error("Email send failed", error);
      }
    }
  }

  return NextResponse.json<CheckinSubmitResponse>({
    success: true,
    data: {
      session: updatedSession,
      attendance_count: rows.length,
      notifications: notificationResults,
    },
  });
}
