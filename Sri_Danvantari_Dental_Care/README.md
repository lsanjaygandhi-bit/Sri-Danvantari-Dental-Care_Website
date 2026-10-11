# Sri Danvantari Dental Care — Website

A static HTML/CSS/JS website with no build step. Upload the contents of this folder to any static host.

## Pages
| File | Purpose |
|---|---|
| `index.html` | Home: hero, introduction, six treatments, doctors, Google patient reviews, location, final call-to-action |
| `treatments.html` | Six featured treatments with illustrations and consultation questions, plus six more treatments |
| `doctors.html` | Dental team |
| `dr-k-r-srinivasan.html`, `dr-kruparani.html`, `dr-samyukta.html` | Individual doctor profiles |
| `why-us.html` | Care approach |
| `clinic.html` | Clinic identity: approach, what to expect at a visit, clinic photos (pending), team, treatments, directions |
| `contact.html` | Contact: book, WhatsApp, call, address, provisional hours, map, FAQ |

## Shared files
- `styles.css`: shared stylesheet. Brand colours are sampled from the logo: deep purple `#43128a` and violet `#9442e6` (no teal/green accents).
- `script.js`: mobile menu, hide-on-scroll header, back-to-top, appointment popup, Patient Experiences carousel and the Chat with Us help desk (demo FAQ mode, no AI backend).
- `assets/illustrations/`: the six treatment illustrations and three story illustrations (SVG).
- `assets/dr-k-r-srinivasan-640.webp` / `-1100.webp`: resized copies of the supplied photo (not edited otherwise). The original is kept in `assets/originals/`.

## Appointment popup
- Elements with `data-book="true"` open the appointment popup. The global header booking button and floating booking pill were intentionally removed to avoid duplicated calls to action. The Home page keeps its hero appointment CTA; the Contact page keeps its primary booking action; other pages use a contextual CTA where appropriate. Adding `data-treatment="Teeth whitening"` (matching an option value) preselects that treatment.
- The form opens WhatsApp **+91 98840 48448** with the enquiry prefilled. The patient presses Send. Nothing is stored by the website.
- Mobile opens WhatsApp directly; desktop opens a new tab and keeps the site open.
- Sundays and past dates are blocked. Focus is trapped in the popup; Esc, the close button, the backdrop and the back button all close it.
- The number is set in `script.js` (`clinicWhatsApp`).

## Content rules followed
- Treatment images are illustrations, labelled as such. They are not patient photographs or results.
- The Home page now includes patient review cards based on the Google review screenshots supplied by the clinic owner. The visible review wording and dates are used; longer reviews may be shortened when only a preview was visible. A link directs visitors to the clinic Google Business Profile.
- No qualifications, experience, timings, facilities or reviews were added beyond the supplied content.

## To confirm with the clinic before launch
- Clinic hours (shown as provisional) and that the clinic is closed on Sunday.
- Whether **+91 98840 48448** also accepts phone calls (used for the "Call the clinic" button).
- Dr. Kruparani's visiting card says "Navalar **High** Road"; the rest of the site says "Navalar **Main** Road".
- Doctor credentials, and treatment availability (especially orthodontics, whitening and laser).
- Clinic photographs (reception, treatment room, equipment) for the Clinic page.
- Two Google Maps short links were supplied; the site uses `maps.app.goo.gl/Seyv466ZZs14exZS8` throughout.

## SEO (needs the final domain)
- Each page has its own title and description, Open Graph title and description, favicons, a web manifest and Dentist structured data on the Home and Contact pages.
- No placeholder domain is included. Once the domain is live:
  - add `og:image` with an absolute URL (ideally a 1200×630 photo);
  - create `sitemap.xml` and add a `Sitemap:` line to `robots.txt`;
  - verify the domain in Google Search Console and submit the sitemap.

Website crafted with ❤️ by Sanjaygandhi.


## Chat with Us (demo mode)
- A purple "Chat with Us" button on every page opens an on-page help desk with set answers drawn only from facts already on this site.
- It is labelled as automated (not live AI, not a dentist). It never diagnoses, prescribes, quotes fees or availability, and never opens WhatsApp.
- Urgent symptoms (severe swelling, breathing/swallowing difficulty, uncontrolled bleeding, facial injury) are routed to emergency advice (hospital emergency department, 108 / 112).
- A real AI assistant needs a server-side endpoint; see the integration boundary comment in `script.js` and `REMAINING_DEPENDENCIES.md`. Never put an API key in browser code.

## Header and reviews
- The header hides while scrolling down and reappears when scrolling up, on every page.
- Patient Experiences reviews keep their supplied wording, names, labels and order. They are not re-sorted, because the relative dates ("3 months ago") have no known capture date.

## Admin Dashboard (CMS) — added 10 Oct 2026
- `/admin/` is the Admin Dashboard. Content comes from Supabase and is applied by `js/cms.js`; the static pages remain complete fallbacks. The homepage hero is never modified.
- Setup, first-admin procedure, roles and deployment: see `../ADMIN_CMS_GUIDE.md`. Tests: `../ADMIN_TEST_REPORT.md`.
- Booking requests are now also stored securely for the clinic (configurable in Website settings → Booking form); the Contact FAQ about stored information was updated in the CMS content to say so.
