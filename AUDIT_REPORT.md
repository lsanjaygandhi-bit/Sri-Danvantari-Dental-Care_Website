# Audit Report — Sri Danvantari Dental Care Admin CMS

Audited 10 Oct 2026. The audit covered `Sri_Danvantari_Dental_Care_Admin_CMS.zip` as previously delivered, which is byte-identical to the working copy. Every finding below comes from inspecting the files or from running tests; nothing is assumed.

## Project map
- **Website:** static HTML/CSS/JS with no build step. Entry point `index.html`; 9 original pages plus two templates, `treatment.html` and `doctor.html`.
- **CMS loader:** `js/cms.js` reads published content through the `get_site_content` database function and applies it to elements marked `data-cms-*`. It never touches `<section class="hero">`.
- **Admin Dashboard:** `admin/index.html` (the Admin Login page; reached from the **Admin Login** button in every page header) plus ES modules in `admin/js/` (16 routes: overview, appointments, pages, doctors, treatments, categories, testimonials, gallery, faqs, media, navigation, seo, settings, users, audit, account). It uses the vendored `@supabase/supabase-js` UMD build.
- **Auth:** Supabase Auth (email and password). There is no public sign-up path in the UI. Access requires a row in `admin_users`, and every check is made by database functions and RLS.
- **Database:** 3 migrations, which must run in order (001 schema → 002 security and API → 003 seed). There are 16 tables in `public` plus `app.rate_limits`, with 17 primary keys, 8 foreign keys, 10 unique constraints, 94 check constraints and 38 indexes, including one on every foreign key (counted on the migrated test database).
- **Storage:** a public `media` bucket (5 MB limit, raster images only) with 4 policies: admins read, content editors upload, update and delete, and only generated paths are allowed.
- **Roles:** Super Admin, Editor and Front Desk. The first admin is created with `app.bootstrap_super_admin()`, which is callable only from the SQL editor.
- **Deployment:** upload the static files. `_headers` holds security headers for Netlify and Cloudflare Pages.
- **Tests:** a local Supabase-equivalent stack (real Auth and PostgREST) plus Playwright suites in `tools/localstack/`.

## Supabase project reference
The previous build hard-coded `aywservzotejmoprxsir` in `js/site-config.js` and in the Admin CSP. A read-only check found:
- only the schema migration applied, recorded as `20261010142259 cms_schema`;
- no policies, functions, bucket, content or users.

Following your instruction, this package no longer points at any project. You configure it with your own values (`.env` plus `node tools/configure.mjs`).

## Confirmed working (tested; see ADMIN_TEST_REPORT.md)
- Public site text, header, footer and titles are identical after the CMS loads, on all 9 pages, desktop and mobile. The hero is byte-identical and pixel-identical.
- CRUD and the Draft → Preview → Publish → Unpublish/Archive workflow for page sections, doctors and staff, treatments, categories, testimonials, gallery and FAQs. Slug redirects and collision checks work.
- Media library: validation, resize and compression, alt text, replace-everywhere, usage lookup, and delete blocked while an image is in use. Original photographs cannot be deleted.
- Appointments: validated and rate-limited submission with a honeypot; status changes, internal notes, search and filters; CSV export restricted to the Super Admin, audited and protected against spreadsheet formulas.
- RLS and permissions: 99 API-level checks for anonymous, signed-in-without-role, Editor, Front Desk and Super Admin, made by calling the API directly, not through the UI.

## Code defects found and fixed in this revision
| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | None of the 3 migrations could be re-run (second run failed on "already exists"). The live history records 001 under a different version, so `supabase db push` would have re-run it and failed. | Blocked deployment | All three are now idempotent. The seed skips itself if content exists, so it never overwrites dashboard edits. Tested fresh, re-run, and from the live project's actual state. |
| 2 | Stray "null"/"nullnull" text rendered on several dashboard screens, such as section editors and list fields | Visible UI bug | Fixed centrally in `admin/js/ui.js`. A new test scans all 33 dashboard screens. |
| 3 | Router race: a slow page could finish loading after you had moved on and overwrite the current screen; the sidebar showed one page and the content another | Wrong screen, risk of editing the wrong item | Each navigation now renders into its own view. Regression test added. |
| 4 | Appointment date filter and CSV export used UTC day boundaries. In IST, filtering "to 10 Oct" excluded requests received on 10 Oct. | Wrong results for the clinic | Filters and export now use whole days in Asia/Kolkata time. Tested with the browser in IST. |
| 5 | Changing an appointment's status wiped an internal note that was being typed | Lost staff input | The draft note is kept across status changes. Tested. |
| 6 | A second navigation while the "Leave without saving?" prompt was open could throw an error | Error, page stuck | Only one prompt at a time. |
| 7 | Rate limiting keyed on the left-most X-Forwarded-For entry, which a client can forge to dodge the per-connection limit | Weaker spam protection | Prefers the edge-provided client IP (`cf-connecting-ip`, then `x-real-ip`). The global daily cap is unchanged. |
| 8 | Requests aborted by a page reload or sign-out were logged as errors | Console noise | Ignored while the page is unloading. |
| 9 | Clinic facilities and equipment (in the brief) had nowhere to go | Missing feature | Added an editable "Facilities and equipment" section on the Clinic page. It is hidden until the admin fills it in and shows it, so the site looks the same until then. |

## Missing configuration (needs your input)
- Supabase Project URL and publishable or anon key, entered in `.env` and then running `node tools/configure.mjs`.
- Auth settings: sign-ups off, Site/Redirect URLs, custom SMTP, minimum password length 10.
- Website domain (Website settings → Site), used for canonical URLs, Open Graph images and the sitemap.

## Database steps not yet verified live
- Migrations 002 and 003 have **not** been applied to any live project; the earlier approval prompts were cancelled. Every database test ran on a local stack with the same migrations.
- The Storage bucket limits and policies were tested through an emulator that enforces the same `storage.objects` policies. They have not been tested against real Supabase Storage.

## Security review
| Area | Status |
|---|---|
| Secrets in frontend or public files | None. An automated scan checks for secret keys, service-role JWTs, DB URLs and access tokens. `configure.mjs` refuses secret keys. |
| Patient data | No anonymous access to tables. Writes go only through `submit_appointment()`. Reads are limited to Super Admin and Front Desk. Patient fields cannot be edited after submission. Personal data is redacted in the audit log. |
| Permission bypass via the API | Not possible in tests. All writes are checked by RLS, triggers and security-definer functions that check the role. |
| XSS | All database text is written with `textContent`. Links are allow-listed. HTML input is rejected. The dashboard runs under a CSP of `script-src 'self'` with no inline scripts and no eval. SVG uploads are refused. |
| Sessions | Supabase JWTs with refresh. Sign-out after 30 minutes idle and after 12 hours in any case. Sign-out in one tab signs out the others. "Sign out on all devices" is available. |
| Residual risks | The `/admin/` files themselves are public; they contain no secrets and all data needs a session. You may add host-level protection (IP allow-list or basic auth). The audit log grows indefinitely; archive it yearly if needed. Content loaded by JavaScript is indexed by Google, but the sitemap must be re-uploaded after changes. |

## Deployment requirements
Node 18+ only for `tools/configure.mjs`. There is no other build. Upload `Sri_Danvantari_Dental_Care/` to the existing host. The full steps, post-deployment checklist and recovery are in ADMIN_CMS_GUIDE.md.
