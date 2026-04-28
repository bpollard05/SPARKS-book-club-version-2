# SPARKS Book Club — Website

## Project Overview
A static multi-page website for SPARKS Book Club, a community book club for 3rd–5th grade girls at a local Title I school. Founded in 2020 (during the pandemic) by two sisters to give girls a social outlet and complement their English / classroom learning.

## Current Status
Initial build complete. All pages exist and link to each other. Several placeholders remain for the owner to fill in.

## Pages
| File | Purpose |
|------|---------|
| `index.html` | Home / Mission page |
| `about.html` | Founders + values + 501(c)(3) info |
| `activities.html` | What we do + photo gallery |
| `join.html` | Sign-up page (links to Google Form) |
| `donate.html` | Donations page with giving tiers |
| `styles.css` | All shared styles |
| `nav.js` | Mobile nav toggle + active link highlighting |

## Design
- **Colors:** Purple (`#5B2D8E`) primary, Gold (`#F5A623`) accent, Pink (`#E8708A`) accent
- **Fonts:** Playfair Display (headings) + Inter (body) — loaded from Google Fonts
- **Style:** Nonprofit / community feel — warm, empowering, professional but accessible

## Things Still Needed (TODOs)
1. **Google Form link** — Replace `href="#"` on the join page button (`join.html` line ~45) with the real Google Form URL
2. **Donation link** — Replace all `href="#"` on donation buttons (`donate.html`) with the real donation processor URL (e.g., Social Good Fund donate page, PayPal, Stripe, etc.)
3. **Photos** — Create an `images/` folder and replace gallery placeholders in `activities.html` with real `<img>` tags pointing to photos of sessions, slides, activities
4. **Founder photos / bios** — Add real photos and bios to `about.html` (placeholder image div is there)
5. **Home page photo** — Replace the placeholder div in `index.html` (origin story section) with a real photo
6. **Email address** — Replace `hello@sparklarning.org` in `about.html` with the real contact email
7. **Social Good Fund EIN** — Replace "available upon request" in `donate.html` with the real EIN if desired
8. **Year** — Footer says © 2024 — update if needed

## Deployment (Next Steps)
The site is plain HTML/CSS/JS — no build step needed. Options for free hosting:
- **GitHub Pages** — push the folder to a GitHub repo, enable Pages in Settings
- **Netlify** — drag and drop the folder at netlify.com/drop
- **Vercel** — similar drag-and-drop or Git-connected deploy

A custom domain (e.g., sparklarning.org) can be pointed at any of these.

## Organization Context
- In the process of becoming an independent 501(c)(3)
- Serves girls at a Title I / borderline Title I school
- Program runs after school, in person
