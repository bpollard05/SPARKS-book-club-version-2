// fetch-product — best-effort lookup of title / author / image / price for a product link
// (Section 4.1: "fetches/stores title, image, and price for each link where possible,
// else the leader enters them manually"). Amazon frequently blocks automated fetches;
// when that happens we return what we can and the leader fills in the rest.
import { admin, bad, caller, CORS, json } from "../_shared/supabase.ts";

// Only known retailers (Section 3.3 vendors). Anything else must be typed in by hand.
const ALLOWED_HOSTS = ["amazon.com", "a.co", "amzn.to", "amzn.com", "bookshop.org", "barnesandnoble.com", "scholastic.com", "target.com", "walmart.com", "lakeshorelearning.com"];
const hostAllowed = (h: string) => ALLOWED_HOSTS.some((d) => h === d || h.endsWith("." + d));
function okUrl(u: URL): boolean { return /^https:$/.test(u.protocol) && hostAllowed(u.hostname.toLowerCase()); }

function pick(html: string, re: RegExp): string | null {
  const m = html.match(re); return m ? decode(m[1].trim()) : null;
}
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return bad("POST only", 405);
  const user = await caller(req);
  if (!user) return bad("Please sign in.", 401);
  const { data: role } = await admin().from("user_roles").select("role").eq("user_id", user.id).in("role", ["leader", "director"]).limit(1).maybeSingle();
  if (!role) return bad("Leaders and directors only.", 403);

  let url: URL;
  try { url = new URL((await req.json()).url); } catch { return bad("Invalid URL"); }
  if (!okUrl(url)) return json({ title: null, author: null, image_url: null, price_cents: null, error: "Automatic lookup only works for Amazon, bookshop.org and a few other stores; please fill in the details by hand." });

  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  let html = "";
  try {
    // Follow redirects by hand so every hop is re-checked against the allowlist (no SSRF via 3xx).
    let current = url, res: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(current.toString(), {
        signal: ctrl.signal, redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9", Accept: "text/html" },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        await res.body?.cancel();
        current = new URL(loc, current);
        if (!okUrl(current)) return json({ title: null, author: null, image_url: null, price_cents: null, error: "That link redirects somewhere we don't fetch from." });
        continue;
      }
      break;
    }
    html = (await res!.text()).slice(0, 1_500_000);
  } catch (e) {
    return json({ title: null, author: null, image_url: null, price_cents: null, error: "Could not fetch that page." });
  } finally { clearTimeout(t); }

  let title = pick(html, /<span[^>]+id="productTitle"[^>]*>([^<]+)</i)
           ?? pick(html, /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
           ?? pick(html, /<title>([^<]+)<\/title>/i);
  if (title) title = title.replace(/\s*[:|-]\s*Amazon\.com.*$/i, "").replace(/^Amazon\.com\s*[:|-]\s*/i, "").slice(0, 200);

  const author = pick(html, /<span[^>]+class="author[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i)
              ?? pick(html, /<a[^>]+class="contributorNameID"[^>]*>([^<]+)<\/a>/i)
              ?? pick(html, /\bby\s+<a[^>]*>([^<]{2,80})<\/a>/i);

  const image = pick(html, /<img[^>]+id="landingImage"[^>]+src="([^"]+)"/i)
             ?? pick(html, /"hiRes":"(https:[^"]+)"/i)
             ?? pick(html, /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);

  const priceStr = pick(html, /<span[^>]+class="a-offscreen"[^>]*>\$([\d,]+\.\d{2})<\/span>/i)
                ?? pick(html, /"priceAmount":\s*([\d.]+)/i)
                ?? pick(html, /<meta[^>]+property="(?:product:price:amount|og:price:amount)"[^>]+content="([\d.]+)"/i)
                ?? pick(html, /itemprop="price"[^>]+content="([\d.]+)"/i);
  const price_cents = priceStr ? Math.round(parseFloat(priceStr.replace(/,/g, "")) * 100) : null;

  return json({ title, author: author?.slice(0, 120) ?? null, image_url: image, price_cents: Number.isFinite(price_cents as number) ? price_cents : null });
});
