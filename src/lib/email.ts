import { Resend } from "resend";
import { MagicLinkEmail } from "@/emails/MagicLinkEmail";
import { AbsentAlertEmail } from "@/emails/AbsentAlertEmail";
import { ArrivalConfirmEmail } from "@/emails/ArrivalConfirmEmail";
import { WelcomeEmail } from "@/emails/WelcomeEmail";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL ?? "no-reply@bendersaas.ai";

// ── Magic link (Supabase sends its own, but we can send a branded version) ────
export async function sendMagicLinkEmail(to: string, magicLink: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: "Your Herder sign-in link",
    react: MagicLinkEmail({ magicLink, email: to }),
  });
}

// ── Welcome new user ──────────────────────────────────────────────────────────
export async function sendWelcomeEmail(to: string, name: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: "Welcome to Herder 🐑",
    react: WelcomeEmail({ name }),
  });
}

// ── Guardian: student checked in ─────────────────────────────────────────────
export async function sendArrivalEmail(opts: {
  to: string;
  guardianName: string;
  studentName: string;
  className: string;
  sessionDate: string;
}) {
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `${opts.studentName} has arrived at ${opts.className}`,
    react: ArrivalConfirmEmail(opts),
  });
}

// ── Guardian: student absent ──────────────────────────────────────────────────
export async function sendAbsentEmail(opts: {
  to: string;
  guardianName: string;
  studentName: string;
  className: string;
  sessionDate: string;
  adminContact?: string;
}) {
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `Absence notice: ${opts.studentName} — ${opts.className}`,
    react: AbsentAlertEmail(opts),
  });
}

export { resend };
