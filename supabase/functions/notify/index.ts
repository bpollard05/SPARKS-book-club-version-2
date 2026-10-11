// notify — Database Webhook target. Fires on UPDATE of public.sessions; when the status
// changes it emails the right people (Sections 4.3 / 6.3 / 7 "Approval requests: email + in-app").
//   submitted          -> all directors (approval link)
//   approved / changes_requested / ordered / shipped / delivered / cancelled -> the club's leaders
// Secured by a shared secret: set WEBHOOK_SECRET and send it as header x-webhook-secret
// from the Database Webhook config (Dashboard -> Database -> Webhooks).
import { admin, bad, esc, json, SITE_URL } from "../_shared/supabase.ts";
import { button, sendEmail } from "../_shared/email.ts";

const SECRET = Deno.env.get("WEBHOOK_SECRET");
const money = (c: number | null) => c == null ? "—" : "$" + (c / 100).toFixed(2);
const when = (d: string) => new Date(d).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

Deno.serve(async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);
  if (!SECRET || req.headers.get("x-webhook-secret") !== SECRET) return bad("Unauthorized", 401);

  const payload = await req.json().catch(() => null);
  if (!payload || payload.table !== "sessions" || payload.type !== "UPDATE") return json({ ignored: true });
  const rec = payload.record, old = payload.old_record ?? {};
  if (!rec || rec.status === old.status) return json({ ignored: "no status change" });

  const db = admin();
  const { data: club } = await db.from("clubs").select("name").eq("id", rec.club_id).maybeSingle();
  const { data: items } = await db.from("session_items").select("kind, title, unit_price_cents").eq("session_id", rec.id);
  const itemList = (items ?? []).map((i) => `<li>${i.kind === "book" ? "📚" : "🔬"} ${esc(i.title)} — ${money(i.unit_price_cents)} each</li>`).join("");
  const summary = `<p><strong>${esc(rec.title)}</strong> · ${esc(club?.name ?? "")}<br>Session: ${esc(when(rec.session_at))}<br>` +
    `Copies: ${rec.required_qty ?? "—"} · Estimated: ${money(rec.estimated_cost_cents)} · Order by: ${esc(rec.order_by_date ?? "—")}</p><ul>${itemList}</ul>`;

  let sent = 0;
  if (rec.status === "submitted") {
    const { data: dirs } = await db.from("user_roles").select("profiles!user_roles_user_id_fkey(email)").eq("role", "director");
    const to = (dirs ?? []).map((d: any) => d.profiles?.email).filter(Boolean);
    const { data: leader } = await db.from("profiles").select("full_name").eq("user_id", rec.created_by).maybeSingle();
    if (await sendEmail(to, `Materials request needs approval: ${rec.title}`,
      `<p>${esc(leader?.full_name ?? "A leader")} submitted a session for approval.</p>${summary}` +
      (rec.notes_for_director ? `<p><em>Leader's note:</em> ${esc(rec.notes_for_director)}</p>` : "") +
      button(`${SITE_URL}/members/director.html?session=${rec.id}`, "Review & approve"))) sent++;
  } else {
    const { data: leaders } = await db.from("club_leaders").select("user_id, profiles(email)").eq("club_id", rec.club_id);
    const ids = (leaders ?? []).map((l: any) => l.user_id);
    const { data: withRole } = ids.length ? await db.from("user_roles").select("user_id").eq("role", "leader").in("user_id", ids) : { data: [] };
    const ok = new Set((withRole ?? []).map((r: any) => r.user_id));
    const to = (leaders ?? []).filter((l: any) => ok.has(l.user_id)).map((l: any) => l.profiles?.email).filter(Boolean);
    const subject: Record<string, string> = {
      approved: `Approved: ${rec.title}`, changes_requested: `Changes requested: ${rec.title}`, ordered: `Ordered: ${rec.title}`,
      shipped: `Shipped: ${rec.title}`, delivered: `Delivered: ${rec.title}`, cancelled: `Cancelled: ${rec.title}`,
    };
    const blurb: Record<string, string> = {
      approved: "Your request was approved. The director will place the order and you'll get updates here.",
      changes_requested: "The director asked for some changes before this can be ordered. Open the planner, update the session, and resubmit.",
      ordered: "The order has been placed.", shipped: "Packages are on their way to students.", delivered: "All packages have been delivered. 🎉",
      cancelled: "This session was cancelled by a director.",
    };
    if (subject[rec.status] && await sendEmail(to, subject[rec.status],
      `<p>${esc(blurb[rec.status])}</p>${rec.decision_comment ? `<p><strong>Director's comment:</strong> ${esc(rec.decision_comment)}</p>` : ""}${summary}` +
      button(`${SITE_URL}/members/leader.html`, "Open the planner"))) sent++;
  }
  return json({ ok: true, status: rec.status, emails_sent: sent });
});
