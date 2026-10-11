# SPARKS Member Portal — setup & operations guide

This folder adds a **members area** to sparkslearning.org that implements Phase 1 of
`SPARKS_Portal_Requirements.docx` (v1.0, Sept 8 2026): parent-first accounts (COPPA),
student logins, the leader session planner with validation, director approval,
order-package generation with manual purchase, shipment tracking, the student
book/countdown/feedback view, and the parent calendar feed.

The public site stays plain HTML (no build step). The portal pages in this folder
talk directly to a **Supabase** project (Postgres database + logins + row-level
security + edge functions). Email goes through **Resend**; address checks use the
**USPS** API. All three have free tiers that cover SPARKS at 50–200 families.

```
members/
  index.html      sign in (adults: email+password; students: username+secret word)
  signup.html     parent account creation + consent (version + timestamp recorded)
  reset.html      password reset
  parent.html     Family account: students, logins, address (USPS), schedule, iCal, consents, data export
  student.html    My Book Club: this month's book, countdown, pacing helper, feedback form
  leader.html     Leader planner: sessions/requests, submit for approval, roster, feedback digest
  director.html   Director dashboard: approvals, order packages + manifest, shipping, people, clubs, settings, reports, audit
  legal/          Terms, Privacy, Program consent (DRAFT placeholders — SPARKS supplies final text)
  app.js          shared client code      config.js  project URL + anon key      members.css  portal styles
../../supabase/
  migrations/20261011120000_member_portal.sql   the whole database: tables, roles, RLS, pipeline functions
  functions/      student-login, validate-address, fetch-product, ical, notify, daily-reminders
```

---

## 0. Try it first: demo mode (no setup)
Open `members/index.html?demo=1` (locally or on the live site). `members/demo.js` stands in for the
backend with sample data stored only in that browser, so every role can be explored:

| Sign in as | Email / username | Password |
|---|---|---|
| Director (also a parent) | `director@demo.sparks` | `demo1234` |
| Leader (also a parent) | `leader@demo.sparks` | `demo1234` |
| Parent of Maya + Ava | `parent@demo.sparks` | `demo1234` |
| Parent of Zoe | `quinn@demo.sparks` | `demo1234` |
| Student | `maya_reads` (Student tab) | `demo1234` |

"Reset demo data" in the banner restores the sample data; "Exit demo" turns it off. Demo mode
switches itself off automatically once `config.js` points at a real Supabase project.

## 1. One-time setup (about 45 minutes)

### 1.1 Create the Supabase project
1. Go to https://supabase.com → **New project**. Name: `sparks-portal`. Region: **US East**.
   Save the database password somewhere safe (you rarely need it).
2. **Project Settings → API** (newer dashboards: **API Keys**): copy the **Project URL** and the
   **anon public** key (newer dashboards call it the **publishable** key) into `members/config.js`.
   (This key is safe to publish; every table is protected by RLS.)
3. **Authentication → URL Configuration**:
   - Site URL: `https://sparkslearning.org/members/index.html`
   - Redirect URLs: add `https://sparkslearning.org/members/**` (and `http://localhost:*/members/**` for testing).
4. **Authentication → Providers → Email**: keep **Confirm email** ON for parents.
   Set *Minimum password length* to 8 (parent passwords and student secret words are both 8+).
   Optional but recommended (PRD §8 "account lockout"): **Authentication → Attack Protection →
   enable CAPTCHA (Cloudflare Turnstile)**; then add the Turnstile widget to `members/index.html`.
5. **Authentication → Email Templates**: optional, but change "Confirm your signup" wording to
   mention SPARKS. Later, point SMTP at Resend (Settings → Auth → SMTP) so these come from
   `@sparkslearning.org` instead of Supabase's shared sender.

### 1.2 Create the database
Pick **one** of these (not both — the CLI tracks which migrations ran):
- **Dashboard:** SQL Editor → New query → paste the entire contents of
  `supabase/migrations/20261011120000_member_portal.sql` → Run. It should finish with no errors.
- **CLI:** `npx supabase link --project-ref <ref>` then `npx supabase db push`.

### 1.3 Make yourself a director
1. Open `https://sparkslearning.org/members/signup.html` (or the Netlify preview URL), create
   your parent account, confirm the email.
2. In **SQL Editor** run (with your email):
   ```sql
   insert into user_roles (user_id, role)
   select user_id, 'director' from profiles where email = 'becca@pollard.us';
   ```
3. Sign in → because you are both a parent and a director you'll see a chooser; pick
   **Director dashboard**. From **People** you can grant `director`/`leader` to anyone else
   *after they've created an account*.

### 1.4 Deploy the edge functions
Requires Node (installed) — the Supabase CLI runs through `npx`, no install needed.
```bash
cd "SPARKS-book-club-version-2"           # repo root (where supabase/ lives)
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase functions deploy student-login validate-address fetch-product
npx supabase functions deploy ical notify daily-reminders --no-verify-jwt
```
Then set the secrets (**Edge Functions → Secrets**, or the CLI):
```bash
npx supabase secrets set \
  SITE_URL=https://sparkslearning.org \
  STUDENT_EMAIL_DOMAIN=students.sparkslearning.org \
  WEBHOOK_SECRET=$(openssl rand -hex 24) \
  RESEND_API_KEY=re_xxx \
  EMAIL_FROM="SPARKS Book Club <portal@sparkslearning.org>" \
  USPS_CLIENT_ID=xxx USPS_CLIENT_SECRET=xxx
```
| Secret | Where to get it | If missing |
|---|---|---|
| `RESEND_API_KEY` | https://resend.com → add + verify domain `sparkslearning.org` (DNS records at GoDaddy) → API key. Free: 3,000 emails/mo. | Emails are logged, not sent. |
| `USPS_CLIENT_ID/SECRET` | https://developers.usps.com → create app → enable **Addresses 3.0** (free). | Addresses save as "unverified"; directors see a flag. |
| `WEBHOOK_SECRET` | any random string (command above makes one) | notify + reminders refuse to run. |

### 1.5 Wire up notifications
1. **Database → Webhooks → Create**: table `sessions`, event **Update**, type *Supabase Edge Function*
   → `notify`. Add HTTP header `x-webhook-secret` = the `WEBHOOK_SECRET` value.
   This sends the approval email to directors on submit and status emails to leaders.
2. **Daily reminders** — Dashboard → **Integrations → Cron** (enables `pg_cron`), then schedule
   (replace the two placeholders):
   ```sql
   select cron.schedule('sparks-daily-reminders', '0 12 * * *',   -- 12:00 UTC = 8 AM EDT / 7 AM EST
     $$ select net.http_post(
          url := 'https://<project-ref>.supabase.co/functions/v1/daily-reminders',
          headers := '{"x-webhook-secret": "<WEBHOOK_SECRET>"}'::jsonb) $$);
   ```
   (Also enable the `pg_net` extension under Database → Extensions if the Cron integration didn't.)

### 1.6 Publish the site
Merge the `member-portal` branch; Netlify redeploys automatically. `_headers` already tells
Netlify to mark `/members/*` as no-index, no-frame, no-referrer. Nothing else to configure:
the portal lives at **sparkslearning.org/members/**.

### 1.7 Legal text
Replace the DRAFT content in `members/legal/*.html` with the real Terms, Privacy Policy and
Program Consent. When you change them later, publish a new version from
**Director → Settings → Agreements** so families are prompted to re-accept.

---

## 2. How the pieces map to the PRD

| PRD | Where |
|---|---|
| 3.1 COPPA parent-first accounts, minimal student data, consent version+timestamp | `signup.html` (consents stored in signup metadata → `consents` rows by trigger), `students` table holds only first name / grade / club; `student-login` function creates the child login from the parent page |
| 3.2 Safeguarding: no adult↔child DM, no student↔student | There are **no** messaging tables at all; `feedback` is insert-only, student → leader, visible to parent + director |
| 3.3 Assisted ordering, pluggable vendor | `orders.vendor` column; `record_order()`; the manifest/package is generated, the purchase is manual |
| 4.1–4.3 Planner, validation, approval, status | `leader.html` + `submit_session()` (qty, lead time, budget, duplicate-book) + `decide_session()`; status timeline on every request |
| 4.4 Roster w/o addresses | `club_roster` view (first name, grade only); leaders have **no** read access to `families`/`profiles` |
| 4.5 Feedback digest | `feedback_digest()` |
| 5.1 Student view | `student.html`: book hero, countdown, pacing helper, star feedback form |
| 5.2 Parent view | `parent.html`: USPS-validated address (`validate-address`), post-order change warning, schedule, Add-to-Google + iCal (`ical`), consents, enroll/withdraw, student login, data export + deletion request |
| 6 Pipeline | `submit_session → decide_session → order_package → record_order → set_shipment_status` (auto rolls to shipped/delivered) → `set_actual_cost` → `spend_report()` CSV |
| 6.6 Reminders / at-risk | `daily-reminders` function + at-risk banner on the director Orders tab |
| 8 Audit, least privilege | `audit_log` (every state change; address views logged; no addresses in log); addresses readable only by the owning parent + directors; column-level grants stop clients from changing status/validation/club fields |

Phase 2 items (parent↔leader messaging, announcements, multi-school admin UI, Spanish) are
**not** built; the schema has `schools` ready for multi-school and the pacing helper (listed
as Phase 2) is included because it was trivial.

---

## 2.1 Ordering on Amazon in three clicks
Amazon has no public ordering API for small organisations, so the portal does everything around the
purchase (PRD §3.3). On the order package, directors get:

1. **Open Amazon cart** – a pre-filled cart link (Amazon's `cart/add` URL with each item's ASIN and
   the computed quantity; Amazon shows a confirmation page, then *Add To Cart*). Sign in to the
   SPARKS Amazon Business account first. The link needs an `AMAZON_ASSOCIATE_TAG` in `config.js`
   (any value works; a real Associates tag would earn referral credit).
2. **Deliver to multiple addresses** – at Amazon checkout, choose this option and pick each family.
3. **Download Amazon address-book file** – the manifest in address-book columns. Upload it once per
   year via *Business Settings → Addresses → Add an address → Upload* (Amazon provides an Excel
   template there; paste these columns into it, up to 1,000 rows). Re-export when families change.
4. Paste the order number back into the portal; shipping tracking and reminders take over.

Items that are not Amazon links (bookshop.org, local store) are listed as "add by hand". A local
bookstore or distributor can also drop-ship directly from the **manifest CSV**; set the vendor
accordingly when recording the order.

## 3. Day-to-day

- **New family**: parent signs up → adds student → **you** assign the student to a club
  (Director → People → Students). Until then the family sees "not assigned yet".
- **New leader**: they sign up like a parent → Director → People → *Grant role: Leader* → use
  the "assign to club" dropdown.
- **Monthly**: leader plans session → you get an email → approve → open the **order package** →
  buy on Amazon Business → paste order number → update shipments as tracking arrives →
  after the session, enter the actual cost (Reports tab shows spend; CSV export).
- **Deletion request**: shows on the Director KPI strip and on the student table. Delete the
  family row (Database → families), then in **Authentication → Users** delete the parent **and each
  student login** (`<username>@students.sparkslearning.org`) — student auth users are not removed
  by the cascade. Note the audit log keeps only ids, never names or addresses.
- **Student forgot secret word**: parent resets it from the Family page.
- **A student whose book could not ship** stays flagged on the order package and in the daily reminder until you resolve it (re-ship after the parent fixes the address, or mark delivered).
- **Times are Eastern.** Leaders enter session times in their own browser's timezone; everything
  is displayed in America/New_York. Fine while everyone is in Maryland.
- **Re-accepting agreements**: when you publish a new version, parents see a prompt on their next
  visit (the Consents tab opens automatically); it is a prompt, not a hard block.
- **Support impersonation** (PRD §8): not built; use the Supabase dashboard's table view, which
  is itself audited by Supabase. Treat this as a Phase 2 item.

## 4. Costs at current scale
Supabase Free (500 MB DB, 50k monthly active users) · Netlify Free · Resend Free (3k emails/mo) ·
USPS API Free → **$0/month**. Supabase Pro ($25/mo) adds daily backups and no project pausing;
recommended once real families are on it (PRD §8 "automated backups").

## 5. Local testing without touching production
`npx supabase start` (needs Docker Desktop) spins up the same database locally and applies the
migration; point `config.js` at `http://127.0.0.1:54321` with the local anon key it prints.
