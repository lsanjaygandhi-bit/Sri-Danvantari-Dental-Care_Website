# Admin Dashboard (CMS) — Setup, Deployment and Recovery

Sri Danvantari Dental Care · revised 10 Oct 2026

The website is still a static HTML/CSS/JS site. A small script (`js/cms.js`) loads the content published from the Admin Dashboard (`/admin/`) and applies it on top of the static pages. While the CMS is not configured, or if Supabase cannot be reached, visitors see the complete original pages.

The homepage hero is never touched. The script does not read or change `<section class="hero">`, and the database refuses any attempt to edit, hide or move it.

---

## 1. Which Supabase project?

The package does **not** contain any project credentials. `js/site-config.js` ships with empty values, so the CMS is switched off until you configure it (step 3).

For reference only: the previous build pointed at project ref `aywservzotejmoprxsir`. A **read-only** check on 10 Oct 2026 found the following in that project:
- the schema migration recorded as version `20261010142259 cms_schema`;
- 16 CMS tables, all with Row Level Security on and no policies, so nothing in them is readable or writable through the API;
- no policies, no API functions and no `media` storage bucket;
- no content, no admin users and no Auth users.

Confirm in your Supabase dashboard that this is the project you intend to use before running anything.

## 2. Database migrations: exact order

Run these in the **Supabase SQL Editor** of the intended project (Dashboard → SQL Editor → New query → paste the whole file → Run):

| # | File | Purpose | Re-run safe? |
|---|---|---|---|
| 0 | `supabase/checks/00_preflight_status.sql` | Read-only: shows what already exists | Yes (changes nothing) |
| 1 | `supabase/migrations/20261010000001_cms_schema.sql` | Tables, constraints, triggers, audit log | Yes: `IF NOT EXISTS` / `OR REPLACE` |
| 2 | `supabase/migrations/20261010000002_cms_security_and_api.sql` | RLS policies, grants, public API, admin functions, `media` bucket and storage policies | Yes: policies are dropped and re-created by name |
| 3 | `supabase/migrations/20261010000003_cms_seed_content.sql` | The site's current content | Yes: does nothing if content already exists, so dashboard edits are never overwritten |
| 4 | `supabase/checks/99_verify_after_migrations.sql` | Read-only: confirms visitors cannot read patient data, RLS is on, and content is present | Yes |

For the `aywservzotejmoprxsir` project, step 1 is already applied; running it again is harmless. Then run 2, 3 and 4.

Expected pre-flight results after step 3: 16 tables, 52 public policies, 4 storage policies, `media` bucket true, 8 API functions, 34 page sections, "none" for tables without RLS.

**Supabase CLI alternative:** `supabase link --project-ref <ref>` then `supabase db push`. Because the live history records the schema under a different version number, the CLI may run file 001 again. That is safe now.

None of these files deletes data. RLS is never disabled.

## 3. Connect the website to your project (public values only)

1. Supabase Dashboard → **Project Settings → API**. Copy:
   - **Project URL**, e.g. `https://abcdefghijklmnopqrst.supabase.co`;
   - the **publishable key** (`sb_publishable_…`) — or, if your project only shows legacy keys, the **anon** key.
2. In the project folder, copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`. `.env` is listed in `.gitignore`; never commit it.
3. Run (Node 18+, no installs needed):
   ```
   node tools/configure.mjs
   ```
   This writes the two values into `js/site-config.js` and narrows the Admin Dashboard's Content-Security-Policy to your project. It refuses a `service_role` key, an `sb_secret_` key, an anon key belonging to a different project, and non-https URLs.

   To produce a separate upload folder instead of editing in place: `node tools/configure.mjs --out ../site-upload`.

Never put the database password, the service-role/secret key or a personal access token in the website, in `.env` files you upload, or in Git. The website needs none of them.

## 4. Auth settings (Dashboard → Authentication)

- **Sign In / Providers → Email:** turn off "Allow new users to sign up". (A new sign-up would still have no dashboard access, because access requires a role.)
- **URL Configuration:** set the Site URL to `https://YOUR-DOMAIN/admin/`, and add `https://YOUR-DOMAIN/admin/**` to Redirect URLs. Password-reset links need this.
- **Emails → SMTP:** configure custom SMTP. The built-in sender is heavily rate-limited.
- **Policies:** set the minimum password length to 10. The dashboard also enforces 10 characters with a letter and a number.

## 5. Create the first Super Admin (secure procedure)

1. Go to Authentication → Users → **Add user → Create new user**. Enter the owner's email and a strong password, and tick *Auto confirm*. Or use **Invite** so the owner sets their own password.
2. In the SQL Editor, run:
   ```sql
   select app.bootstrap_super_admin('owner@example.com', 'Clinic Owner');
   ```
   This works only while no Super Admin exists, and it cannot be called from the website or the API.
3. Sign in at `https://YOUR-DOMAIN/admin/index.html` (`/admin/` also works on most hosts). Every page has a purple **Admin Login** button in the header, right after Contact (on phones it is the last item in the ☰ menu), and a small "Staff login" link in the footer.
4. To add other staff, create or invite them in Authentication → Users first. Then go to **Admin users → Give access** in the dashboard and choose a role.

## 6. Roles (enforced by database policies, not by hiding buttons)

| | Super Admin | Editor | Front Desk |
|---|---|---|---|
| Pages, doctors, treatments, testimonials, gallery, FAQs, media, SEO | ✔ | ✔ | — |
| Appointment requests and internal notes | ✔ | — | ✔ |
| Export appointments to CSV (audited) | ✔ | — | — |
| Website settings, navigation and footer | ✔ | — | — |
| Admin users, audit log | ✔ | — | — |

At least one active Super Admin must always remain, and nobody can change their own role. A deactivated admin loses access immediately, even with an open session.

## 7. Deploy

There is no build step beyond `node tools/configure.mjs`. Upload the contents of `Sri_Danvantari_Dental_Care/` to your existing host exactly as before. You may skip the `supabase/` folder, since the site does not use it at runtime.

- `_headers` adds security headers on Netlify and Cloudflare Pages. On other hosts, set the equivalent headers there.
- After setting the website address (Website settings → Site), download `sitemap.xml` and `robots.txt` from the dashboard's **SEO** page and upload them to the site root.

### Post-deployment checklist
1. Open the home page. It should look the same as before; the browser console should show no errors.
2. Click **Admin Login** in the header (or open `/admin/index.html`) and sign in as the Super Admin.
3. In Pages & sections → Home → Welcome, change the heading, Save draft, then Preview. The draft should show only in the preview. Publish it, check that it appears on the site within about a minute, then change it back.
4. Submit a test booking. It should appear in Appointments. Delete it afterwards (Super Admin).
5. From any computer, run `curl -s "https://<ref>.supabase.co/rest/v1/appointments?select=*" -H "apikey: <publishable key>"`. Expect a `permission denied` error, never patient data.
6. Run `supabase/checks/99_verify_after_migrations.sql`. Every line should read "ok" or "none".
7. Check Supabase → Advisors → Security Advisor for errors.

## 8. Recovery

- **Website problem:** re-upload the previous site files. The original static pages work without the CMS.
- **Switch the CMS off without touching the database:** empty the two values in `js/site-config.js` and upload that file. The site shows its built-in content and the booking form returns to WhatsApp only.
- **Content mistake:** edit or unpublish it in the dashboard. The Audit log shows the previous values of every change.
- **Database:** Supabase → Database → Backups (daily backups on paid plans).
- **Full removal (destructive):** `supabase/rollback/rollback_cms_DESTRUCTIVE.sql`. It deletes appointments, notes, the audit log and all CMS content. Run it only after exporting what you need, and only with explicit approval.

## 9. Booking form behaviour

Website settings → Booking form → mode:
- **Save in dashboard and open WhatsApp** (default): the request is validated, rate-limited and spam-checked, then stored, and WhatsApp opens as before.
- **WhatsApp only:** exactly the previous behaviour; nothing is stored.
- **Dashboard only:** WhatsApp does not open, and the patient sees a reference number.

The form never says an appointment is confirmed. Patient details are read-only once submitted, are never copied into the audit log, and are visible only to the Super Admin and Front Desk roles.

## 10. Editing workflow and text format

Draft → **Preview** (the real page with your unpublished changes, visible only to you) → **Publish** → Edit (kept as unpublished changes until published) → **Unpublish** or **Archive**. If two people edit the same item at once, the second save is refused with a message rather than silently overwriting the first.

Text fields accept plain text only, and HTML is rejected. Links are written as `[text](page.html)`. Long fields also accept `## Heading` and `- list item`.
