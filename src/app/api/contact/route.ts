import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { name, email, notes } = await req.json();

    if (!name || !email || !notes) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    await resend.emails.send({
      from: "Herder <up@bendersaas.ai>",
      to: "spasta+herder@gmail.com",
      reply_to: email,
      subject: `Herder message from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${notes}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact] Resend error:", err);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
