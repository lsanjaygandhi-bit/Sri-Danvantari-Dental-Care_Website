# REMAINING DEPENDENCIES — Sri Danvantari Dental Care

These items were not implemented because they need verified clinic information, backend work or a decision from the owner. Nothing below was guessed or invented on the site.

## 1. Clinic facts to verify (from the clinic)
| Item | Current state on the site | Needed |
|---|---|---|
| Clinic hours | Shown as **provisional**: Mon–Sat 10:00–12:00 and 6:30–9:00 pm, Sunday closed. The booking form blocks Sundays. | Confirmed hours, including Sunday and holidays. |
| Phone calls on +91 98840 48448 | Used for WhatsApp and the "Call the clinic" card. | Confirm the number takes calls, or supply the reception landline. |
| Doctor credentials | Dr. K. R. Srinivasan: BDS, Saveetha, ~30 years, all marked "to be verified". Dr. S. Kruparani: B.D.S. (from her visiting card). Dr. Samyukta: details pending. | Verified qualifications, registration numbers, photos of Dr. Kruparani and Dr. Samyukta, and permission to publish. |
| Treatment availability | All treatments are marked "confirm availability", especially orthodontics/Invisalign, whitening and laser. | The clinic's confirmed list of services. |
| Facilities and equipment | Not described; the Clinic page has photo placeholders. | Real photos of the reception, treatment room and equipment, plus a verified list of facilities. |
| Fees and policies | Not published. The chat and FAQ say fees depend on examination. | Only if the clinic wants to publish fee ranges or cancellation, payment or insurance policies. |
| Address wording | Dr. Kruparani's visiting card says "Navalar **High** Road"; the rest of the site says "Navalar **Main** Road". | Which wording is correct. |
| Google Maps link | Two short links were supplied; the site uses `maps.app.goo.gl/Seyv466ZZs14exZS8`. | Confirm this is the right one. |

## 2. Patient reviews
- **Dates:** reviews have relative dates only ("3 months ago") and no capture date, and 12 have no date at all. They were **not** re-sorted. To sort newest-first, provide the original review dates, or the date the screenshots were taken, and the order can then be checked.
- **Permission:** confirm the clinic is happy for reviewers' names and wording to appear on the website. They come from the clinic's Google Business Profile screenshots, as stated in the source README.
- **Wording:** the README notes that some long reviews may have been shortened when only a preview was visible. Check these against the full originals.
- **Photos:** no reviewer or patient photos are used. Adding any needs the patient's written consent.

## 3. Appointment enquiry: a server-side submission endpoint (backend task)
- **Current route (kept):** the form validates the input, then opens WhatsApp with the request prefilled. The patient must press Send. Nothing is stored or sent by the website itself. The status message says the appointment is confirmed only when the clinic contacts the patient.
- **To replace or supplement it:** you need a secure server-side endpoint, for example a form service or a small serverless function, that:
  1. validates input on the server;
  2. stores or forwards the request to the clinic (email, CRM or sheet) with spam protection such as a honeypot or CAPTCHA;
  3. returns a real "request received" response;
  4. has a privacy notice for the patient data it stores.

  It must **not** say "appointment confirmed" unless the clinic or a booking system actually confirms it.
- **No endpoint exists in the source,** so none was invented.

## 4. Real AI assistant for Chat with Us (backend task)
- **Current state:** demo help desk with fixed answers from verified site facts, clearly labelled "not a live AI or a dentist". It makes no network calls.
- **Integration boundary:** `askBackend()` in `script.js` returns `null`, with a comment explaining how to connect a backend. To go live:
  1. Build a server-side endpoint, for example `POST /api/chat`, that holds the AI provider key in server environment variables. **Never put the key in HTML or JavaScript.**
  2. Apply the same safety rules on the server:
     - no diagnosis, prescriptions, fees or availability;
     - urgent symptoms always get emergency advice (hospital emergency department, 108 / 112);
     - only verified clinic facts;
     - never claim an appointment is booked.
  3. Add rate limiting, logging rules and a privacy notice. Decide whether chat transcripts are stored at all.
  4. Implement `askBackend()` to call your endpoint and return `reply`. Keep the local urgent-symptom check in the browser as a first line of safety.
- The current widget only calls `askBackend()` for questions it can't match, so it needs no changes to the rest of the chat code.

## 5. Launch and SEO items (unchanged from the source README)
- No production domain has been set. Once it is known:
  - add an absolute `og:image` (ideally 1200×630);
  - create `sitemap.xml` and add a `Sitemap:` line to `robots.txt`;
  - verify the site in Google Search Console.
- `theme-color` is still `#5b2c83`, as in the source. It can be changed to the logo purple `#43128a` if wanted.
- The logo file `assets/sri-danvantari-tooth-logo.webp` is 1341×1115px (125 KB) but displays at about 54px. A smaller copy would speed up loading. It was left alone because asset changes were outside the approved scope.

## 6. Not tested in this environment
- Real iPhone/Android devices, Safari and Firefox, and screen readers.
- Delivery of real WhatsApp messages.
- Live Google Fonts and the Google Map embed (blocked in the sandbox).

See TEST_REPORT.md for details.
