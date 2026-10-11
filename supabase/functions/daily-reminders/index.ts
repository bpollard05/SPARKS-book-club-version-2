// daily-reminders — run once a day (Supabase Cron / pg_cron -> pg_net, or any scheduler).
// Section 6.6: "reminders if not ordered by the order-by date; escalating alert if the
// session is at risk". Also nudges directors about requests waiting > 3 days.
// Secured by the same shared secret as `notify`: header x-webhook-secret.
import { admin, bad, esc, json, SITE_URL } from "../_shared/supabase.ts";
import { button, sendEmail } from "../_shared/email.ts";

const SECRET = Deno.env.get("WEBHOOK_SECRET");
const day = 86400000;
const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-webhook-secret") !== SECRET) return bad("Unauthorized", 401);
  const db = admin();
  const today = new Date(); const todayStr = today.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD in ET
  const { data: dirs } = await db.from("user_roles").select("profiles!user_roles_user_id_fkey(email)").eq("role", "director");
  const directors = (dirs ?? []).map((d: any) => d.profiles?.email).filter(Boolean);

  const { data: sessions } = await db.from("sessions").select("id, title, status, session_at, order_by_date, submitted_at, club_id, clubs(name)")
    .in("status", ["submitted", "approved", "ordered", "shipped"]).gte("session_at", new Date(today.getTime() - 2 * day).toISOString());

  const waiting: string[] = [], dueSoon: string[] = [], overdue: string[] = [], atRisk: string[] = [], unshipped: string[] = [];
  for (const s of sessions ?? []) {
    const line = `<li><strong>${esc(s.title)}</strong> (${esc((s as any).clubs?.name ?? "")}) — session ${esc(fmt(s.session_at))}, order by ${esc(s.order_by_date ?? "—")}</li>`;
    const daysToSession = (new Date(s.session_at).getTime() - today.getTime()) / day;
    if (s.status === "submitted" && s.submitted_at && today.getTime() - new Date(s.submitted_at).getTime() > 3 * day) waiting.push(line);
    if (s.status === "approved" && s.order_by_date) {
      if (s.order_by_date < todayStr) (daysToSession <= 5 ? atRisk : overdue).push(line);
      else if ((new Date(s.order_by_date + "T12:00:00").getTime() - today.getTime()) / day <= 2) dueSoon.push(line);
    }
    if (s.status === "ordered" && daysToSession <= 3) {
      const { count } = await db.from("shipments").select("id", { count: "exact", head: true }).eq("session_id", s.id).eq("status", "pending");
      const { count: failed } = await db.from("shipments").select("id", { count: "exact", head: true }).eq("session_id", s.id).eq("status", "could_not_ship");
      if (count || failed) unshipped.push(line.replace("</li>", ` — ${count ?? 0} pending, ${failed ?? 0} could not ship</li>`));
    }
  }

  const sections: string[] = [];
  if (atRisk.length)  sections.push(`<h3 style="color:#B91C1C;">🚨 SESSION AT RISK — not ordered and the session is within 5 days</h3><ul>${atRisk.join("")}</ul>`);
  if (overdue.length) sections.push(`<h3 style="color:#B45309;">⚠️ Past the order-by date</h3><ul>${overdue.join("")}</ul>`);
  if (dueSoon.length) sections.push(`<h3>Order within 2 days</h3><ul>${dueSoon.join("")}</ul>`);
  if (unshipped.length) sections.push(`<h3>Ordered but not marked shipped (session within 3 days)</h3><ul>${unshipped.join("")}</ul>`);
  if (waiting.length) sections.push(`<h3>Waiting for approval more than 3 days</h3><ul>${waiting.join("")}</ul>`);

  let sent = false;
  if (sections.length) {
    const subject = atRisk.length ? `🚨 SPARKS: session at risk — order today` : overdue.length ? `⚠️ SPARKS: order overdue` : `SPARKS: ordering reminders`;
    sent = await sendEmail(directors, subject, sections.join("") + button(`${SITE_URL}/members/director.html#t-orders`, "Open orders & shipping"));
    await db.from("audit_log").insert({ actor_id: null, action: "daily_reminder_sent", entity: "system", entity_id: null,
      details: { at_risk: atRisk.length, overdue: overdue.length, due_soon: dueSoon.length, unshipped: unshipped.length, waiting: waiting.length, emailed: sent } });
  }
  return json({ ok: true, at_risk: atRisk.length, overdue: overdue.length, due_soon: dueSoon.length, unshipped: unshipped.length, waiting: waiting.length, emailed: sent });
});
