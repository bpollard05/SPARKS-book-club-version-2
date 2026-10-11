// student-login — a PARENT (or director) creates or resets a child's login.
// COPPA 3.1: the parent picks the username; no student email is collected.
// The auth account uses a synthetic, never-delivered address <username>@<STUDENT_EMAIL_DOMAIN>.
import { admin, audit, bad, caller, CORS, isDirector, json, STUDENT_EMAIL_DOMAIN } from "../_shared/supabase.ts";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return bad("POST only", 405);

  const user = await caller(req);
  if (!user) return bad("Please sign in.", 401);

  let body: { action?: string; student_id?: string; username?: string; secret?: string };
  try { body = await req.json(); } catch { return bad("Invalid JSON"); }
  const { action, student_id } = body;
  const username = (body.username ?? "").trim().toLowerCase();
  const secret = body.secret ?? "";
  if (!student_id || !["create", "reset"].includes(action ?? "")) return bad("Missing action or student_id");
  if (secret.length < 8 || secret.length > 72) return bad("The secret word must be at least 8 characters.");

  const db = admin();
  const { data: student } = await db.from("students").select("id, first_name, username, auth_user_id, family_id, families(parent_user_id)").eq("id", student_id).maybeSingle();
  if (!student) return bad("Student not found", 404);
  const ownsIt = (student as any).families?.parent_user_id === user.id;
  if (!ownsIt && !(await isDirector(db, user.id))) return bad("Not allowed", 403);

  if (action === "create") {
    if (student.auth_user_id) return bad("This student already has a login. Use reset instead.");
    if (!USERNAME_RE.test(username)) return bad("Usernames are 3–20 lowercase letters, numbers, or underscores.");
    const { data: taken } = await db.from("students").select("id").eq("username", username).maybeSingle();
    if (taken) return bad("That username is taken — try another.");

    const { data: created, error } = await db.auth.admin.createUser({
      email: `${username}@${STUDENT_EMAIL_DOMAIN}`,
      password: secret,
      email_confirm: true,
      user_metadata: { kind: "student", student_id },
    });
    if (error || !created.user) return bad(error?.message ?? "Could not create login", 500);

    const { error: linkErr } = await db.from("students").update({ username, auth_user_id: created.user.id }).eq("id", student_id);
    if (linkErr) { await db.auth.admin.deleteUser(created.user.id); return bad(linkErr.message, 500); }
    await audit(db, user.id, "student_login_created", "student", student_id, { username });
    return json({ ok: true, username });
  }

  // reset
  if (!student.auth_user_id) return bad("This student has no login yet. Create one first.");
  const { error } = await db.auth.admin.updateUserById(student.auth_user_id, { password: secret });
  if (error) return bad(error.message, 500);
  await audit(db, user.id, "student_secret_reset", "student", student_id);
  return json({ ok: true, username: student.username });
});
