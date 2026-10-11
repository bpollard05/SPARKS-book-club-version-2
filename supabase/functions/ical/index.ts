// ical — subscribable calendar feed for one family (Section 5.2.3).
// GET /functions/v1/ical?token=<family.calendar_token>
// Deploy with --no-verify-jwt (calendar apps can't send a login). The token is a random
// 64-hex capability, rotatable from the parent page; the feed contains no addresses.
import { admin, bad, CORS } from "../_shared/supabase.ts";

const VISIBLE = ["approved", "ordered", "shipped", "delivered"];
const stamp = (d: string | Date) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escIcs = (s: unknown) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => line.match(/.{1,72}/gu)?.join("\r\n ") ?? line; // RFC 5545 line folding

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return bad("Invalid calendar link", 404);

  const db = admin();
  const { data: fam } = await db.from("families").select("id").eq("calendar_token", token).maybeSingle();
  if (!fam) return bad("Calendar link not found", 404);

  const { data: kids } = await db.from("students").select("club_id, first_name").eq("family_id", fam.id).eq("enrolled", true).not("club_id", "is", null);
  const clubIds = [...new Set((kids ?? []).map((k) => k.club_id))];
  let events: any[] = [];
  if (clubIds.length) {
    const { data } = await db.from("sessions")
      .select("id, title, session_at, duration_min, intro, status, updated_at, club_id, clubs(name, meeting_url), session_items(kind, title, author)")
      .in("club_id", clubIds).in("status", VISIBLE).order("session_at");
    events = data ?? [];
  }

  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SPARKS Book Club//Member Portal//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:SPARKS Book Club", "X-WR-TIMEZONE:America/New_York", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of events) {
    const start = new Date(e.session_at); const end = new Date(start.getTime() + (e.duration_min ?? 60) * 60000);
    const book = (e.session_items ?? []).find((i: any) => i.kind === "book");
    const who = (kids ?? []).filter((k) => k.club_id === e.club_id).map((k) => k.first_name).join(", ");
    const desc = [book ? `Book: ${book.title}${book.author ? " by " + book.author : ""}` : "", e.intro ?? "", who ? `For: ${who}` : "", e.clubs?.meeting_url ? `Join: ${e.clubs.meeting_url}` : ""].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:${e.id}@sparkslearning.org`, `DTSTAMP:${stamp(e.updated_at ?? e.session_at)}`, `SEQUENCE:${Math.floor(new Date(e.updated_at ?? 0).getTime() / 1000)}`,
      `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      fold(`SUMMARY:${escIcs(`SPARKS Book Club: ${e.title}`)}`), fold(`DESCRIPTION:${escIcs(desc)}`),
      fold(`LOCATION:${escIcs(e.clubs?.meeting_url ?? "Online (Zoom)")}`), ...(e.clubs?.meeting_url ? [fold(`URL:${e.clubs.meeting_url}`)] : []),
      "STATUS:CONFIRMED", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { ...CORS, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="sparks-book-club.ics"', "Cache-Control": "private, max-age=900" },
  });
});
