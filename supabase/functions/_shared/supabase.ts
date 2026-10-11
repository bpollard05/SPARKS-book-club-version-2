// Shared helpers for SPARKS edge functions (Deno / Supabase Edge Runtime)
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.49.1";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
export const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://sparkslearning.org").replace(/\/$/, "");
export const STUDENT_EMAIL_DOMAIN = Deno.env.get("STUDENT_EMAIL_DOMAIN") ?? "students.sparkslearning.org";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });
}
export const bad = (error: string, status = 400) => json({ error }, status);

/** Service-role client: bypasses RLS. Use only after you've checked who the caller is. */
export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** Resolve the signed-in user from the request's Authorization header. */
export async function caller(req: Request): Promise<User | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function isDirector(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "director").maybeSingle();
  return !!data;
}

export async function audit(db: SupabaseClient, actorId: string | null, action: string, entity: string, entityId: string | null, details: Record<string, unknown> | null = null) {
  await db.from("audit_log").insert({ actor_id: actorId, action, entity, entity_id: entityId, details });
}

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
