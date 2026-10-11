// SPARKS Member Portal — public configuration.
//
// These two values come from your Supabase project:
//   Dashboard → Project Settings → API → "Project URL" and "anon public" key.
// The anon key is SAFE to publish: every table is protected by row-level
// security, so it only lets a visitor do what their login allows.
//
// See members/README.md for the full setup checklist.
window.SPARKS_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",

  // Student logins are username + secret word. Supabase needs an email
  // behind every account, so we build one that is never delivered to.
  // Must match the STUDENT_EMAIL_DOMAIN secret used by supabase/functions/student-login.
  STUDENT_EMAIL_DOMAIN: "students.sparkslearning.org",

  // Shown in page titles / emails
  ORG_NAME: "SPARKS Book Club",

  // Amazon's pre-filled cart link only works with an AssociateTag present. Any tag works;
  // if SPARKS joins Amazon Associates, put the real one here to earn referral credit.
  AMAZON_ASSOCIATE_TAG: "sparkslearning-20",

  // Public base URL of the live site (used for calendar links)
  SITE_URL: "https://sparkslearning.org",
};
