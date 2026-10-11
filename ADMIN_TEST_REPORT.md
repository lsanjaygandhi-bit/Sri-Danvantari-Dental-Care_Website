# Admin CMS — Test Report

**Run:** 10 Oct 2026, after the audit fixes, with one command (`tools/localstack/run-all.sh`) from a clean database. **Result: 337 checks passed, 0 failed** (re-run on 11 Oct 2026 after adding the visible header "Admin Login" button; this added the 37-check header-button suite and one admin E2E assertion). The raw log is in `tools/localstack/run-all-final.log`.

**Environment:** cloud sandbox. Database: PostgreSQL 16 with the same migrations. Auth: the real Supabase Auth server (GoTrue v2.180.0). API: real PostgREST v12.2.3. File storage: a small emulator that writes `storage.objects` rows as the signed-in user, so the real storage RLS policies apply. Browser: headless Chromium (Playwright) running in the Asia/Kolkata time zone. The site was configured with `tools/configure.mjs` using a publishable-format key, so the new key path was exercised. Hero checksums were compared with **your original upload**.

| Suite | Result |
|---|---|
| Migrations: fresh, re-run, live project state | 11/11 |
| Pre-flight, verification and rollback SQL | 6/6 |
| configure.mjs key/URL safety | 8/8 |
| Static: JS syntax, links/assets, secrets, hero baseline | 27/27 |
| Database security and permissions (direct API calls) | 99/99 |
| Public site unchanged after CMS loads (9 pages × desktop and mobile) | 89/89 |
| Admin Dashboard end to end (real browser) | 59/59 |

## Migrations: fresh, re-run, live project state

- ✔ fresh install of 001, 002, 003 in order
- ✔ re-run 20261010000001_cms_schema.sql succeeds
- ✔ re-run 20261010000002_cms_security_and_api.sql succeeds
- ✔ re-run 20261010000003_cms_seed_content.sql succeeds
- ✔ re-running everything creates no duplicate rows or policies (34/12/3/18/6/10/11/16/8/6/56)
- ✔ re-running the seed keeps content edited in the dashboard
- ✔ live-like state: 001 applied twice
- ✔ live-like state: 002 applies on top
- ✔ live-like state: 003 applies on top
- ✔ live-like path ends in the same state as a fresh install (34/12/3/18/6/10/11/16/8/6/56)
- ✔ RLS is enabled on every table

## Pre-flight, verification and rollback SQL

- ✔ pre-flight reports a complete install correctly
- ✔ verification: anonymous visitor reads content but not appointments, audit log or admin users
- ✔ rollback script runs
- ✔ rollback removes every CMS table, function and policy
- ✔ pre-flight works on a project with nothing installed
- ✔ migrations install again cleanly after a rollback

## configure.mjs key/URL safety

- ✔ accepts a publishable key
- ✔ accepts a legacy anon JWT for the same project
- ✔ refuses a service_role JWT
- ✔ refuses a secret key (sb_secret_)
- ✔ refuses an anon key from a different project
- ✔ refuses http:// for a remote project
- ✔ refuses a URL with a path
- ✔ refuses missing values

## Static: JS syntax, links/assets, secrets, hero baseline

- ✔ JS syntax: admin/js/app.js
- ✔ JS syntax: admin/js/core.js
- ✔ JS syntax: admin/js/fields.js
- ✔ JS syntax: admin/js/modules/account.js
- ✔ JS syntax: admin/js/modules/appointments.js
- ✔ JS syntax: admin/js/modules/audit.js
- ✔ JS syntax: admin/js/modules/collections.js
- ✔ JS syntax: admin/js/modules/media.js
- ✔ JS syntax: admin/js/modules/navigation.js
- ✔ JS syntax: admin/js/modules/overview.js
- ✔ JS syntax: admin/js/modules/pages.js
- ✔ JS syntax: admin/js/modules/seo.js
- ✔ JS syntax: admin/js/modules/settings.js
- ✔ JS syntax: admin/js/modules/users.js
- ✔ JS syntax: admin/js/ui.js
- ✔ JS syntax: js/cms.js
- ✔ JS syntax: js/site-config.js
- ✔ JS syntax: script.js
- ✔ no broken local links or assets (12 HTML files)
- ✔ cross-page anchors (treatments.html#…) resolve
- ✔ no secret keys, passwords or tokens in public files
- ✔ hero HTML sha256 matches baseline (957fbb0bbf3dfe46…)
- ✔ hero image unchanged: assets/dr-k-r-srinivasan-1100.webp
- ✔ hero image unchanged: assets/dr-k-r-srinivasan-640.webp
- ✔ styles.css: original rules byte-identical (CMS rules only appended at the end)
- ✔ appended CSS only targets new CMS classes/attributes (cannot restyle the hero)
- ✔ all 25 original assets (clinic photographs, logo, illustrations) present and byte-identical

## Database security and permissions (direct API calls)

- ✔ public cannot read table appointments
- ✔ public cannot read table appointment_notes
- ✔ public cannot read table admin_users
- ✔ public cannot read table audit_log
- ✔ public cannot read table treatments
- ✔ public cannot read table doctors
- ✔ public cannot read table site_settings
- ✔ public cannot read table media_assets
- ✔ public cannot read table page_sections
- ✔ public cannot read table testimonials
- ✔ public cannot insert appointments directly
- ✔ public cannot update content
- ✔ public can read published content
- ✔ public content has no drafts/internal consent notes
- ✔ public cannot use preview mode
- ✔ page parameter is validated
- ✔ public cannot call admin_me
- ✔ public cannot call admin_dashboard_stats
- ✔ public cannot call admin_export_appointments
- ✔ public cannot call admin_media_usage
- ✔ public cannot call admin_grant_access
- ✔ bootstrap function is not reachable through the API
- ✔ valid appointment request accepted
- ✔ invalid phone rejected
- ✔ short name rejected
- ✔ past date rejected
- ✔ Sunday rejected (clinic closed)
- ✔ treatment outside the list rejected
- ✔ time outside the list rejected
- ✔ over-long message rejected
- ✔ honeypot submissions are silently dropped
- ✔ rate limit: 6th request in an hour from one connection is refused
- ✔ rate limit is per connection (others still accepted)
- ✔ HTML in a request is stored as plain text (rendered safely by the dashboard)
- ✔ super admin can grant roles
- ✔ granting access to a non-existent login fails clearly
- ✔ a login without an admin role gets no dashboard access
- ✔ non-admin login cannot read content tables
- ✔ non-admin login cannot update content
- ✔ non-admin cannot grant themselves a role
- ✔ non-admin cannot insert into admin_users
- ✔ non-admin cannot use preview
- ✔ editor can read content
- ✔ editor can update content
- ✔ editor cannot see appointments (patient data)
- ✔ editor cannot change website settings
- ✔ editor cannot read the audit log
- ✔ editor cannot export appointments
- ✔ editor can use preview
- ✔ editor cannot change navigation
- ✔ front desk can see appointments
- ✔ front desk can change appointment status
- ✔ patient details cannot be edited after submission
- ✔ front desk can add notes; author is recorded by the server (not spoofable)
- ✔ front desk cannot edit website content
- ✔ front desk cannot export appointments
- ✔ front desk cannot delete appointments
- ✔ editor cannot read internal notes
- ✔ super admin can export appointments
- ✔ exports are recorded in the audit log
- ✔ patient names and phone numbers are never copied into the audit log
- ✔ content edits are audited with who and what
- ✔ invalid phone number in settings is rejected
- ✔ unsafe link (javascript:) in settings is rejected
- ✔ unsafe link in navigation is rejected
- ✔ essential navigation links cannot be deleted
- ✔ essential navigation links cannot be hidden
- ✔ homepage hero is locked in the database
- ✔ homepage hero cannot be hidden
- ✔ page sections cannot be deleted
- ✔ sections not marked hideable cannot be hidden
- ✔ the only super admin cannot demote themselves
- ✔ a second super admin can change another admin
- ✔ owner (now editor) cannot change admin users
- ✔ roles restored; super admin can remove another super admin
- ✔ deactivated admin loses access immediately (same session token)
- ✔ original website images cannot be deleted
- ✔ media usage lookup finds where an image is used
- ✔ testimonial cannot be published without recorded consent
- ✔ testimonial with recorded consent can be published
- ✔ identifiable patient image cannot be published without consent
- ✔ …but it can be kept as a draft
- ✔ SVG uploads are not accepted (script risk)
- ✔ path traversal in media paths is rejected
- ✔ changing a slug creates a redirect from the old address
- ✔ slug collisions are rejected
- ✔ reclaiming an old slug removes its redirect (no loops)
- ✔ draft edits are invisible to the public
- ✔ draft edits are visible in preview
- ✔ unpublished items are not public
- ✔ editor can upload to a generated path
- ✔ anonymous visitors cannot upload
- ✔ front desk cannot upload
- ✔ uploads outside the allowed path pattern are refused
- ✔ disallowed file types (SVG/HTML) are refused
- ✔ files over 5 MB are refused
- ✔ uploaded images are publicly viewable by URL
- ✔ anonymous visitors cannot delete files
- ✔ editor can delete files

## Public site unchanged after CMS loads (9 pages × desktop and mobile)

- ✔ [desktop] index: visible text identical after CMS load
- ✔ [desktop] index: header, footer and title identical
- ✔ [desktop] hero markup byte-identical
- ✔ [desktop] hero renders pixel-identical
- ✔ [desktop] index: full page renders identically (10 anti-aliasing px)
- ✔ [desktop] index: no JavaScript errors
- ✔ [desktop] treatments: visible text identical after CMS load
- ✔ [desktop] treatments: header, footer and title identical
- ✔ [desktop] treatments: full page renders identically (0 anti-aliasing px)
- ✔ [desktop] treatments: no JavaScript errors
- ✔ [desktop] doctors: visible text identical after CMS load
- ✔ [desktop] doctors: header, footer and title identical
- ✔ [desktop] doctors: full page renders identically (0 anti-aliasing px)
- ✔ [desktop] doctors: no JavaScript errors
- ✔ [desktop] dr-k-r-srinivasan: visible text identical after CMS load
- ✔ [desktop] dr-k-r-srinivasan: header, footer and title identical
- ✔ [desktop] dr-k-r-srinivasan: full page renders identically (16 anti-aliasing px)
- ✔ [desktop] dr-k-r-srinivasan: no JavaScript errors
- ✔ [desktop] dr-kruparani: visible text identical after CMS load
- ✔ [desktop] dr-kruparani: header, footer and title identical
- ✔ [desktop] dr-kruparani: full page renders identically (0 anti-aliasing px)
- ✔ [desktop] dr-kruparani: no JavaScript errors
- ✔ [desktop] dr-samyukta: visible text identical after CMS load
- ✔ [desktop] dr-samyukta: header, footer and title identical
- ✔ [desktop] dr-samyukta: full page renders identically (0 anti-aliasing px)
- ✔ [desktop] dr-samyukta: no JavaScript errors
- ✔ [desktop] why-us: visible text identical after CMS load
- ✔ [desktop] why-us: header, footer and title identical
- ✔ [desktop] why-us: full page renders identically (0 anti-aliasing px)
- ✔ [desktop] why-us: no JavaScript errors
- ✔ [desktop] clinic: visible text identical after CMS load
- ✔ [desktop] clinic: header, footer and title identical
- ✔ [desktop] clinic: full page renders identically (0 anti-aliasing px)
- ✔ [desktop] clinic: no JavaScript errors
- ✔ [desktop] contact: visible text identical after CMS load
- ✔ [desktop] contact: header, footer and title identical
- ✔ [desktop] contact: full page renders identically (0 anti-aliasing px)
- ✔ [desktop] contact: no JavaScript errors
- ✔ [mobile] index: visible text identical after CMS load
- ✔ [mobile] index: header, footer and title identical
- ✔ [mobile] hero markup byte-identical
- ✔ [mobile] hero renders pixel-identical
- ✔ [mobile] index: full page renders identically (24 anti-aliasing px)
- ✔ [mobile] index: no JavaScript errors
- ✔ [mobile] index: no horizontal scrolling
- ✔ [mobile] treatments: visible text identical after CMS load
- ✔ [mobile] treatments: header, footer and title identical
- ✔ [mobile] treatments: full page renders identically (0 anti-aliasing px)
- ✔ [mobile] treatments: no JavaScript errors
- ✔ [mobile] treatments: no horizontal scrolling
- ✔ [mobile] doctors: visible text identical after CMS load
- ✔ [mobile] doctors: header, footer and title identical
- ✔ [mobile] doctors: full page renders identically (0 anti-aliasing px)
- ✔ [mobile] doctors: no JavaScript errors
- ✔ [mobile] doctors: no horizontal scrolling
- ✔ [mobile] dr-k-r-srinivasan: visible text identical after CMS load
- ✔ [mobile] dr-k-r-srinivasan: header, footer and title identical
- ✔ [mobile] dr-k-r-srinivasan: full page renders identically (16 anti-aliasing px)
- ✔ [mobile] dr-k-r-srinivasan: no JavaScript errors
- ✔ [mobile] dr-k-r-srinivasan: no horizontal scrolling
- ✔ [mobile] dr-kruparani: visible text identical after CMS load
- ✔ [mobile] dr-kruparani: header, footer and title identical
- ✔ [mobile] dr-kruparani: full page renders identically (0 anti-aliasing px)
- ✔ [mobile] dr-kruparani: no JavaScript errors
- ✔ [mobile] dr-kruparani: no horizontal scrolling
- ✔ [mobile] dr-samyukta: visible text identical after CMS load
- ✔ [mobile] dr-samyukta: header, footer and title identical
- ✔ [mobile] dr-samyukta: full page renders identically (0 anti-aliasing px)
- ✔ [mobile] dr-samyukta: no JavaScript errors
- ✔ [mobile] dr-samyukta: no horizontal scrolling
- ✔ [mobile] why-us: visible text identical after CMS load
- ✔ [mobile] why-us: header, footer and title identical
- ✔ [mobile] why-us: full page renders identically (0 anti-aliasing px)
- ✔ [mobile] why-us: no JavaScript errors
- ✔ [mobile] why-us: no horizontal scrolling
- ✔ [mobile] clinic: visible text identical after CMS load
- ✔ [mobile] clinic: header, footer and title identical
- ✔ [mobile] clinic: full page renders identically (0 anti-aliasing px)
- ✔ [mobile] clinic: no JavaScript errors
- ✔ [mobile] clinic: no horizontal scrolling
- ✔ [mobile] contact: visible text identical after CMS load
- ✔ [mobile] contact: header, footer and title identical
- ✔ [mobile] contact: full page renders identically (0 anti-aliasing px)
- ✔ [mobile] contact: no JavaScript errors
- ✔ [mobile] contact: no horizontal scrolling
- ✔ content service down: page still shows the original content
- ✔ content service down: no uncaught errors
- ✔ content service down: booking form still opens
- ✔ footer "Staff login" link present on every page view (18) and points to admin/index.html (nofollow)
- ✔ header "Admin Login" button right after Contact on every page view (18), after the CMS rebuilt the menu

## Header "Admin Login" button (real browser, `header-button.test.mjs`)

Run on two copies of the site: the package as delivered (not yet connected to Supabase) and a copy connected to the local Supabase-equivalent stack.

- ✔ [not yet connected] 1440px: Admin Login visible in the header, right after Contact, on the same row
- ✔ [not yet connected] 1440px: header height unchanged (83px vs original 83px), no sideways scroll
- ✔ [not yet connected] 1280px: Admin Login visible in the header, right after Contact, on the same row
- ✔ [not yet connected] 1280px: header height unchanged (83px vs original 83px), no sideways scroll
- ✔ [not yet connected] 1100px: Admin Login visible in the header, right after Contact, on the same row
- ✔ [not yet connected] 1100px: header height unchanged (83px vs original 83px), no sideways scroll
- ✔ [not yet connected] 1024px: Admin Login visible in the header, right after Contact, on the same row
- ✔ [not yet connected] 1024px: header height unchanged (83px vs original 83px), no sideways scroll
- ✔ [not yet connected] 990px: Admin Login visible in the header, right after Contact, on the same row
- ✔ [not yet connected] 990px: header height unchanged (83px vs original 83px), no sideways scroll
- ✔ [not yet connected] button present after Contact on all 9 page types
- ✔ [not yet connected] clicking opens /admin/index.html, which explains that sign-in needs the Supabase connection
- ✔ [not yet connected] 390px phone: header bar unchanged (71px vs 71px), button not squeezed into it
- ✔ [not yet connected] 390px phone: ☰ menu shows Admin Login after Contact
- ✔ [not yet connected] 390px phone: tapping it opens /admin/index.html
- ✔ [not yet connected] 768px phone: header bar unchanged (73px vs 73px), button not squeezed into it
- ✔ [not yet connected] 768px phone: ☰ menu shows Admin Login after Contact
- ✔ [not yet connected] 768px phone: tapping it opens /admin/index.html
- ✔ [connected to Supabase (local)] 1440px: Admin Login visible in the header, right after Contact, on the same row
- ✔ [connected to Supabase (local)] 1440px: header height unchanged (83px vs original 83px), no sideways scroll
- ✔ [connected to Supabase (local)] 1280px: Admin Login visible in the header, right after Contact, on the same row
- ✔ [connected to Supabase (local)] 1280px: header height unchanged (83px vs original 83px), no sideways scroll
- ✔ [connected to Supabase (local)] 1100px: Admin Login visible in the header, right after Contact, on the same row
- ✔ [connected to Supabase (local)] 1100px: header height unchanged (83px vs original 83px), no sideways scroll
- ✔ [connected to Supabase (local)] 1024px: Admin Login visible in the header, right after Contact, on the same row
- ✔ [connected to Supabase (local)] 1024px: header height unchanged (83px vs original 83px), no sideways scroll
- ✔ [connected to Supabase (local)] 990px: Admin Login visible in the header, right after Contact, on the same row
- ✔ [connected to Supabase (local)] 990px: header height unchanged (83px vs original 83px), no sideways scroll
- ✔ [connected to Supabase (local)] button present after Contact on all 9 page types
- ✔ [connected to Supabase (local)] clicking opens /admin/index.html with the sign-in form
- ✔ [connected to Supabase (local)] signing in on that page opens the dashboard (real Supabase Auth, role checked)
- ✔ [connected to Supabase (local)] 390px phone: header bar unchanged (71px vs 71px), button not squeezed into it
- ✔ [connected to Supabase (local)] 390px phone: ☰ menu shows Admin Login after Contact
- ✔ [connected to Supabase (local)] 390px phone: tapping it opens /admin/index.html
- ✔ [connected to Supabase (local)] 768px phone: header bar unchanged (73px vs 73px), button not squeezed into it
- ✔ [connected to Supabase (local)] 768px phone: ☰ menu shows Admin Login after Contact
- ✔ [connected to Supabase (local)] 768px phone: tapping it opens /admin/index.html

## Admin Dashboard end to end (real browser)

- ✔ wrong password shows an error and does not sign in
- ✔ a login without an admin role is refused
- ✔ there is no public sign-up
- ✔ super admin signs in and sees the overview
- ✔ fast navigation: a slow earlier page never overwrites the current one
- ✔ homepage hero is shown as locked and cannot be edited
- ✔ section edit: save draft (not public) → preview shows it → publish (public)
- ✔ section validation blocks HTML and empty required fields
- ✔ unsaved changes trigger a warning before leaving
- ✔ homepage sections can be reordered and hidden (hero stays first)
- ✔ CTA label, link and visibility can be changed
- ✔ media upload: validated, resized to ≤2000px, converted, with progress
- ✔ media upload rejects a disguised non-image (SVG renamed .png)
- ✔ media: set alt text, find usage, replace keeps references, delete blocked while used
- ✔ original website images cannot be deleted
- ✔ treatment: create draft with details → not public → publish → appears with its own page
- ✔ treatment: editing a published item keeps the live version until "Publish changes"
- ✔ treatment: slug change keeps the old link working (redirect)
- ✔ treatment: slug collision is caught with a clear message
- ✔ treatment: unpublish removes it; archive hides it; delete removes it
- ✔ treatment list: search and status filter
- ✔ staff profile with uploaded photo appears on the Doctors page
- ✔ doctor: editing a doctor updates the legacy profile page, cards and clinic team list
- ✔ testimonial cannot be published without consent; with consent it appears in the carousel
- ✔ gallery: add a clinic photo; it appears on the Clinic page
- ✔ FAQ edit with a link renders safely on the Contact page
- ✔ treatment categories: create, rename (slug kept), delete
- ✔ clinic facilities: hidden by default; fill in, publish and show
- ✔ discard unpublished changes; archive hides; restore and re-publish
- ✔ settings: clinic WhatsApp number updates every WhatsApp link and the booking target
- ✔ settings: invalid values are rejected with a message
- ✔ settings: announcement banner and holiday notice
- ✔ settings: opening hours update the Contact page table
- ✔ settings: booking options flow into the booking form
- ✔ settings: social links appear in the footer only when set
- ✔ settings: favicon must be a square PNG; logo can be replaced
- ✔ navigation: add, hide and reorder links; essential links are protected (the Admin Login button stays in the menu after the rebuild)
- ✔ SEO: title/description update the public page; invalid JSON-LD is rejected; sitemap generated
- ✔ appointment from the public form is stored and appears in the dashboard
- ✔ appointment: status workflow with confirmation, notes, search by phone and filter
- ✔ appointment date filter uses clinic time (IST) and includes the end date
- ✔ appointment: HTML submitted by a visitor is shown as plain text in the dashboard
- ✔ appointment: CSV export (super admin) downloads and is audited
- ✔ CSV export neutralises spreadsheet formulas
- ✔ users: grant Editor and Front Desk roles from the dashboard
- ✔ audit log lists changes with who/when and redacts patient data
- ✔ sign out
- ✔ editor: sees content sections only; settings and appointments are blocked
- ✔ front desk: sees appointments only, no export button
- ✔ session expires after 30 minutes of inactivity
- ✔ session expires after 12 hours regardless of activity
- ✔ protected admin data is unreachable without a session (API returns nothing)
- ✔ change password (requires current password)
- ✔ sign out on all devices ends the session
- ✔ password reset by email link
- ✔ dashboard works at phone width (menu, tables, editor) without sideways scrolling
- ✔ every dashboard screen (33) renders without stray null/undefined text
- ✔ hero is still byte-identical to the original after all the edits
- ✔ no JavaScript errors in the dashboard during the whole run

## Failures seen during this revision, and what they were

Every failure was investigated before re-running anything.

- **App defects found by the tests and fixed:** stray "null" text on dashboard screens; a router race where a slow page overwrote the current one; the IST date filter excluding the end date; a typed note lost on status change; a hidden CTA button still showing (found earlier); migrations failing on re-run; the pre-flight script failing on projects without migration history or tables; the rollback dropping objects in the wrong order. All are covered by tests above.
- **Test defects, fixed:** a test matched a "Published" message left over from a previous action; another treated an editor titled "Welcome" as the Overview page; a link the test expected to be rejected (`contact.html#book-appointment`) is in fact safe; Playwright polling needed `eval`, which the dashboard's CSP (correctly) forbids; overlapping test runs shared one database.
- **One unexplained failure:** in one run, the password-reset test failed. The flow was then traced step by step and works (reset email → link → recovery form → new password saved → sign-in), and it has passed in all four full runs since. Supabase Auth's 60-second per-user cooldown on reset emails is the likely cause, but this was not proven. The test now reports which step fails if it ever recurs.

## Not tested

- **Anything against a live Supabase project.** Migrations 002 and 003 have not been applied to any live project. Only one read-only status query was run against `aywservzotejmoprxsir`.
- Real Supabase Storage (an emulator enforcing the same policies was used), real email delivery (captured by a local mail sink), and the platform's handling of publishable keys (emulated in the gateway as documented by Supabase).
- Safari, Firefox, real phones and screen readers.
- Google Fonts and the embedded Google Map (blocked in the sandbox, identically for the original and CMS versions).
- Deployment to your host (not authorised and not attempted).
