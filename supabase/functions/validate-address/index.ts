// validate-address — parent saves their mailing address; we standardise + verify it
// with the USPS Addresses 3.0 API (free; needs a USPS developer account:
// https://developers.usps.com). Section 5.2.1: "a bad address means a child gets no book".
// If USPS credentials are not configured, the address is saved UNVERIFIED and flagged.
import { admin, audit, bad, caller, CORS, json } from "../_shared/supabase.ts";

const USPS_CLIENT_ID = Deno.env.get("USPS_CLIENT_ID");
const USPS_CLIENT_SECRET = Deno.env.get("USPS_CLIENT_SECRET");
const USPS_BASE = Deno.env.get("USPS_BASE_URL") ?? "https://apis.usps.com";

type Addr = { address_line1: string; address_line2: string | null; city: string; state: string; zip: string };

async function uspsToken(): Promise<string | null> {
  const res = await fetch(`${USPS_BASE}/oauth2/v3/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: USPS_CLIENT_ID, client_secret: USPS_CLIENT_SECRET, scope: "addresses" }),
  });
  if (!res.ok) { console.error("USPS token error", res.status, await res.text()); return null; }
  return (await res.json()).access_token ?? null;
}

async function uspsValidate(a: Addr): Promise<{ validated: boolean; normalized?: Addr; message?: string }> {
  const token = await uspsToken();
  if (!token) return { validated: false, message: "USPS check is temporarily unavailable. Saved unverified." };
  const p = new URLSearchParams({ streetAddress: a.address_line1, city: a.city, state: a.state, ZIPCode: a.zip });
  if (a.address_line2) p.set("secondaryAddress", a.address_line2);
  const res = await fetch(`${USPS_BASE}/addresses/v3/address?${p}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 400 || res.status === 404) return { validated: false, message: "USPS could not find that address. Please double-check the street, city and ZIP." };
  if (!res.ok) { console.error("USPS validate error", res.status, await res.text()); return { validated: false, message: "USPS check is temporarily unavailable. Saved unverified." }; }
  const j = await res.json();
  const dpv = j?.additionalInfo?.DPVConfirmation; // Y = deliverable, D/S = deliverable but unit missing/unknown, N = not deliverable
  const r = j?.address ?? {};
  const normalized: Addr = {
    address_line1: r.streetAddress ?? a.address_line1,
    address_line2: r.secondaryAddress || null,
    city: r.city ?? a.city, state: r.state ?? a.state,
    zip: r.ZIPCode ? (r.ZIPPlus4 ? `${r.ZIPCode}-${r.ZIPPlus4}` : r.ZIPCode) : a.zip,
  };
  if (dpv === "Y") return { validated: true, normalized };
  if (dpv === "D" || dpv === "S") return { validated: true, normalized, message: "USPS found the building but not the apartment/unit — please make sure the unit number is right." };
  return { validated: false, normalized, message: "USPS says mail may not be deliverable to that address. Please double-check it." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return bad("POST only", 405);
  const user = await caller(req);
  if (!user) return bad("Please sign in.", 401);

  let b: Record<string, string>;
  try { b = await req.json(); } catch { return bad("Invalid JSON"); }
  const a: Addr = {
    address_line1: (b.address_line1 ?? "").trim(), address_line2: (b.address_line2 ?? "").trim() || null,
    city: (b.city ?? "").trim(), state: (b.state ?? "").trim().toUpperCase(), zip: (b.zip ?? "").trim(),
  };
  if (!a.address_line1 || !a.city) return bad("Street address and city are required.");
  if (!/^[A-Z]{2}$/.test(a.state)) return bad("State should be a 2-letter code, e.g. MD.");
  if (!/^\d{5}(-\d{4})?$/.test(a.zip)) return bad("ZIP should be 5 digits (or ZIP+4).");

  const db = admin();
  const { data: fam } = await db.from("families").select("id, address_line1, address_line2, city, state, zip").eq("parent_user_id", user.id).maybeSingle();
  if (!fam) return bad("No family record for this account.", 404);

  let result: { validated: boolean; normalized?: Addr; message?: string };
  if (USPS_CLIENT_ID && USPS_CLIENT_SECRET) {
    try { result = await uspsValidate(a); } catch (e) { console.error(e); result = { validated: false, message: "USPS check failed. Saved unverified." }; }
  } else {
    result = { validated: false, message: "Saved. (Automatic USPS verification is not set up yet — a director will double-check it.)" };
  }
  const save = result.validated && result.normalized ? result.normalized : a;
  const changed = result.validated && JSON.stringify(save) !== JSON.stringify(a);

  const { error } = await db.from("families").update({
    ...save,
    address_validated: result.validated,
    address_validated_at: result.validated ? new Date().toISOString() : null,
  }).eq("id", fam.id);
  if (error) return bad(error.message, 500);
  await audit(db, user.id, result.validated ? "address_validated" : "address_saved_unverified", "family", fam.id);
  return json({ validated: result.validated, changed, normalized: save, message: result.message ?? null });
});
