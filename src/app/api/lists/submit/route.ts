import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendArrivalEmail, sendAbsentEmail } from "@/lib/email";
import { hasFeature } from "@/lib/plans";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, plan_tier")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const body = await req.json();
  const { session_id, attendance } = body as {
    session_id: string;
    attendance: Array<{ student_id: string; status: "present" | "absent"; checkin_type: string }>;
  };

  // Upsert all attendance rows
  const rows = attendance.map(a => ({
    session_id,
    student_id: a.student_id,
    status: a.status,
    checkin_type: a.checkin_type ?? "manual",
    checked_at: new Date().toISOString(),
  }));

  const { error: attError } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "session_id,student_id" });

  if (attError) return NextResponse.json({ error: attError.message }, { status: 500 });

  // Mark session as submitted
  await supabase
    .from("checkin_sessions")
    .update({ submitted_at: new Date().toISOString(), submitted_by: user.id })
    .eq("id", session_id);

  // ── Notifications (Pro only) ───────────────────────────────────────────────
  const notificationsEnabled = hasFeature(profile.plan_tier, "notifications");
  const notificationResults: { sent: number; skipped: string } = {
    sent: 0,
    skipped: notificationsEnabled ? "" : "Notifications require Pro plan",
  };

  if (notificationsEnabled) {
    // Fetch session + list info
    const { data: session } = await supabase
      .from("checkin_sessions")
      .select("session_date, checkin_lists(name)")
      .eq("id", session_id)
      .single();

    const lists = session?.checkin_lists as any;
    const className = (Array.isArray(lists) ? lists[0]?.name : lists?.name) || "class";
    const sessionDate = session?.session_date ?? new Date().toLocaleDateString();

    // Fetch students with guardian email from custom_data
    const studentIds = attendance.map(a => a.student_id);
    const { data: students } = await supabase
      .from("students")
      .select("id, name, custom_data")
      .in("id", studentIds);

    if (students) {
      for (const att of attendance) {
        const student = students.find((s: any) => s.id === att.student_id);
        if (!student) continue;

        const guardianEmail = student.custom_data?.guardian_email as string | undefined;
        const guardianName = student.custom_data?.guardian_name as string | undefined ?? "Guardian";

        if (!guardianEmail) continue;

        try {
          if (att.status === "present") {
            await sendArrivalEmail({
              to: guardianEmail,
              guardianName,
              studentName: student.name,
              className,
              sessionDate,
            });
          } else if (att.status === "absent") {
            await sendAbsentEmail({
              to: guardianEmail,
              guardianName,
              studentName: student.name,
              className,
              sessionDate,
            });
          }
          notificationResults.sent++;
        } catch (e) {
          console.error("Email send failed", e);
        }
      }
    }
  }

  return NextResponse.json({ success: true, notifications: notificationResults });
}
