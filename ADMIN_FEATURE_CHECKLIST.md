# Page-by-page admin feature checklist

✔ = editable from the dashboard. 🔒 = intentionally locked.

## Every page
- 🔒 "Admin Login" button in the header, right after Contact (inside the ☰ menu on phones). It is fixed in the page files, so menu edits in the dashboard cannot remove it. It opens `admin/index.html`, which still requires a Supabase sign-in and an admin role.
- ✔ Header menu (labels, links, order, show/hide, new links; Home and Contact are essential) — *Navigation & footer*
- ✔ Footer "Explore" links, tagline, short address, WhatsApp number, social links — *Navigation*, *Settings*
- ✔ Announcement / holiday banner — *Settings → Announcement*, *Settings → Opening hours*
- ✔ Logo, favicon, browser theme colour — *Settings → Logo & favicon*
- ✔ Booking popup: title, intro, button label, privacy note, treatment and time options, closed days, mode — *Settings → Booking form*
- ✔ All WhatsApp/call links and numbers, Google Maps link and embedded map — *Settings → Clinic contact*
- ✔ Page title, meta description, canonical, Open Graph title/description/image, indexing, JSON-LD — *SEO*
- ✔ Optional privacy notice — *Settings → Privacy notice*

## Home (`index.html`)
- 🔒 Hero section (text, images, buttons, layout) — locked in the database
- ✔ Highlights strip (3 items) · Welcome + commitments · Treatments heading/intro/note · Care at our clinic (image, texts, both buttons: label, link, visibility) · Patient experiences texts and booking button · Visit us texts and buttons · Closing call to action
- ✔ Show/hide and reorder every section except the hero
- ✔ Treatment cards (*Treatments → Show on homepage*), review cards (*Testimonials*), address/hours (*Settings*)

## Treatments (`treatments.html`, `treatment.html?slug=`)
- ✔ Page heading, featured rows, case examples (*Gallery → Case examples*), More treatments, closing CTA
- ✔ Each treatment: title, slug (old links redirect), category, featured/more, homepage card, summary, description, benefits, procedure, consultation questions, FAQs, image + alt, booking pre-selection, button label, SEO, publish/unpublish/archive
- ✔ A treatment with benefits/procedure/FAQs automatically gets its own page with a "Read full details" link

## Our Doctors, profiles (`doctors.html`, `dr-*.html`, `doctor.html?slug=`)
- ✔ Page heading, cards, closing CTA
- ✔ Each doctor/staff profile: name, slug, qualifications, designation, specialisations, experience, card text, biography, photo + alt, placeholder text, SEO, order, publish state
- ✔ Staff profiles appear in their own "Our clinic team" block when published

## Why Us · Clinic · Contact
- ✔ Every heading, introduction and list on these pages (quick facts, approach, visit steps, before-you-come list, urgent note, photos, team list, treatments chips, finding the clinic, contact cards, address, landmark, hours table, FAQ, closing CTA)
- ✔ **Facilities and equipment** (Clinic page): a list of items. It is hidden until the clinic fills it in and switches it on in *Pages & sections → Clinic*.
- "About Us": the site has no separate About page. The clinic's about content is the Clinic page introduction and the Why Us page, both fully editable.

## Dashboard-only features
- ✔ Appointment requests: list, search (name/phone/reference), filter (status/date), detail, status (New/Contacted/Confirmed/Completed/Cancelled), internal notes, CSV export (Super Admin, audited)
- ✔ Media library: upload (checked, resized, compressed), alt text, captions, patient-consent flags, replace everywhere, "where used", safe delete
- ✔ Admin users and roles, audit log, change password, password reset, sign out everywhere
