# CHANGELOG — Sri Danvantari Dental Care

**Source:** `Sri_Danvantari_Dental_Care_UI_Refinements.zip`, left unchanged (SHA-256 verified after the work).
**Output:** `Sri_Danvantari_Dental_Care_Website_Implemented.zip`

These are targeted edits to the supplied source. Nothing was rebuilt from scratch. No pages, assets, SEO titles, meta descriptions or structured data were removed. No asset files were added, renamed or deleted.

## Changed files

### `styles.css`
- **Brand colours.** The palette now uses colours sampled from the supplied logo (`assets/sri-danvantari-tooth-logo.webp`): deep purple `#43128a` (`--brand-dark`) and violet `#9442e6` (`--brand-light`). The brief's ivory `#FAF8FC` and pale lavender `#EAE5F7` are also used. These replace the teal `#138c91` / `#168b91` accents and the green WhatsApp button colour `#20b866`.
  - The wordmark is two-tone: "Sri Danvantari" in deep purple, "Dental Care" in violet.
  - The nav hover underline and the footer wordmark now use the purple pair.
  - "Dental Care" in violet is 5.0:1 against white, and the deep purple is 12.4:1.
- **Top strip.** Removed the leftover `.topbar` rules. The strip's markup had already been removed from every page in the source.
- **Reviews carousel.** Three conflicting layout definitions of `.review-grid` (two CSS grids, then `display:flex!important`) were consolidated into one flex + scroll-snap track that the JavaScript works with. The disabled arrow state and the keyboard focus outline are now styled.
- **Header.** Hide-on-scroll rules are kept in one place. The header also reappears when anything in it has keyboard focus, and the transition is turned off for users who prefer reduced motion.
- **Floating controls.** Removed the green `.floating-whatsapp` rules and added styles for the Chat with Us launcher and panel: a bottom sheet on mobile, and a panel of up to 390×600px on desktop.
  - The back-to-top button now sits above the chat launcher and is hidden while the chat is open.
  - The chat launcher hides while the appointment popup is open.
- **New styles:** the Clinic page "Before you come in" list and the urgent-symptoms note.

### `script.js`
- **Appointment popup.** The existing behaviour and WhatsApp route are unchanged. Two additions:
  - `window.SDDC.openAppointment()` is exposed so the chat can open the same form.
  - The submit feedback is reworded and no longer shows a "✓". It now says "Press Send there to share your request. Your appointment is confirmed only when the clinic contacts you."
- **Reviews carousel.**
  - Previous/next buttons move one card at a time, and disable themselves at the start and end of the track.
  - The left and right arrow keys scroll the track when it has focus.
  - Native touch swipe still works.
  - Reviews are not re-sorted; see the review-order decision below.
- **Header hide/reveal.**
  - A 6px threshold stops the header flickering.
  - The header stays visible near the top of the page, while the mobile menu is open, while it has keyboard focus, and while the appointment popup is open.
  - The behaviour is the same on all pages.
- **New "Chat with Us" help desk (demo mode):**
  - Fixed answers use only facts already published on the site: address, provisional timings, the doctors' listed titles, the listed treatments, and how booking works.
  - It also gives general guidance on brushing, check-up frequency, bleeding gums, toothache and what to bring to a first visit.
  - It refuses to quote fees, give availability, prescribe or diagnose.
  - Messages mentioning urgent symptoms (swelling, breathing or swallowing difficulty, bleeding that won't stop, fever, injury, emergency) always get urgent-care advice: the nearest hospital emergency department, or 108 / 112.
  - User text is rendered with `textContent` only, so typed HTML is never run.
  - There are no network calls and no WhatsApp links. Its "Open booking form" action opens the existing appointment popup.
  - `askBackend()` is a stub that returns `null`. A comment marks the integration boundary for a future server-side AI endpoint, and no keys are included.

### All 9 HTML pages
`index`, `treatments`, `doctors`, `why-us`, `clinic`, `contact`, `dr-k-r-srinivasan`, `dr-kruparani`, `dr-samyukta`:
- The green floating WhatsApp button is replaced by the purple **Chat with Us** launcher and an accessible chat panel.
  - The panel is a non-modal dialog with a live message log, a labelled input and a close button.
  - Esc closes it and returns focus to the launcher.
- `<script src="script.js">` now has `defer`. The old WhatsApp button sat after the script tag, so the chat markup that replaced it did too; `defer` makes the script run after the whole page is parsed.
- Every other link, including the in-page WhatsApp text links and buttons outside the chat widget, is unchanged.

### `index.html`
- The "Book an Appointment" button under Patient Experiences now opens the appointment popup (`data-book="true"`), with `contact.html` kept as the fallback link.
- The review track and its wrapper have proper roles and labels, including a keyboard hint. This also fixes one validator error that was already in the source.
- **All 18 reviews keep the same wording, names, labels and order.** This was verified by automated comparison with the source.

### `contact.html`
- **FAQ:** five new answers that can be given safely:
  - what to bring to a first visit;
  - fees aren't published;
  - sending the form doesn't confirm an appointment;
  - what to do in a dental emergency;
  - the chat isn't a dentist.
- The "Is my information stored?" answer now also mentions the chat.

### `clinic.html`
- **New "Before you come in" section** with general guidance: bring records, list your medicines, note your symptoms, and wait for the clinic to confirm.
- **New urgent-symptoms note** pointing to emergency care.

### `README.md`
- Corrected statements that would otherwise be wrong: the brand colours (no teal), what `script.js` now does, and the Chat with Us, header and review-order behaviour.

## Decisions to note

- **Review order.** The reviews only have relative dates ("3 months ago", "7 years ago") and no known capture date. Several have no date at all. Following the brief, they were **not re-sorted**: the supplied order is kept, which already puts the relative-dated reviews first and the undated ones after.
  - The existing `data-review-age` attributes are inferred values. They are left untouched and are **not** used for sorting.
- **The appointment form still opens WhatsApp.** No secure server-side endpoint exists, so the existing working route is kept, as the brief allows. The chat widget itself never opens WhatsApp.
- **Contact options outside the chat.** The WhatsApp text links, the CTA-band button and the Contact page WhatsApp/Call cards are not part of the floating widget, so they were kept.
- **Hero headline wrapping.** The source sets `max-width:12ch` on the headline, which wraps "Confident / Smiles." on desktop. That earlier refinement was left as it is.
