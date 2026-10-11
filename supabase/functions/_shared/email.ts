// Transactional email via Resend (https://resend.com). Section 8: "reputable provider,
// reliable deliverability from our domain" — verify sparkslearning.org in Resend first.
// If RESEND_API_KEY is not set, emails are logged instead of sent (safe for staging).
import { esc, SITE_URL } from "./supabase.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "SPARKS Book Club <portal@sparkslearning.org>";

export async function sendEmail(to: string | string[], subject: string, bodyHtml: string): Promise<boolean> {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return false;
  const html = layout(subject, bodyHtml);
  if (!RESEND_API_KEY) {
    console.log(`[email not configured] to=${recipients.join(",")} subject="${subject}"`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: recipients, subject, html }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
  return res.ok;
}

function layout(title: string, inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#FDFAF5;font-family:Inter,Arial,sans-serif;color:#1C1040;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#4A1D8A;color:#fff;border-radius:14px 14px 0 0;padding:18px 22px;font-size:18px;font-weight:700;">SPARKS Book Club</div>
    <div style="background:#fff;border:1px solid #EDE4F7;border-top:0;border-radius:0 0 14px 14px;padding:22px;line-height:1.55;">
      <h2 style="margin:0 0 12px;font-size:20px;">${esc(title)}</h2>
      ${inner}
    </div>
    <p style="font-size:12px;color:#64748B;margin-top:14px;">You're receiving this because you have an account on the SPARKS member portal at ${esc(SITE_URL)}.</p>
  </div></body></html>`;
}

export const button = (href: string, label: string) =>
  `<p style="margin:18px 0;"><a href="${esc(href)}" style="background:#4A1D8A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:50px;font-weight:700;display:inline-block;">${esc(label)}</a></p>`;
