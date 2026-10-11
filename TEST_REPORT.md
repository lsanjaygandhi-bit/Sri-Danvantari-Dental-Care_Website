# TEST REPORT — Sri Danvantari Dental Care

**Date:** 9 Oct 2026
**Environment:** headless Chromium (Playwright) in a cloud sandbox, loading the site from local files (`file://`).
**Emulated devices:**
- **Mobile:** iPhone 13 (390×844, touch).
- **Desktop:** 1440×900.
- **Extra widths for layout checks:** 375, 768 and 1024px.

Every result below comes from tests that were actually run. Anything not run is listed in "Not tested".

## 1. Baseline (original source, before any edits)
The same checks were first run on the unmodified source to give a comparison point:
- The popup opened on all 9 pages.
- The carousel scrolled.
- There were no JS errors, no broken images and no horizontal overflow.
- The floating WhatsApp button was present on every page and there was no chat widget.

## 2. Automated regression suite (new build): **316 / 316 passed**

The checks were run on both mobile and desktop for each of the 9 pages unless noted. "18×" means 9 pages × 2 devices.

| Check | Runs | Result |
|---|---|---|
| Page title and meta description identical to the source | 18 | Pass |
| Structured data (schema) the same as the source | 18 | Pass |
| No floating WhatsApp button and no top strip | 18 | Pass |
| No horizontal overflow | 18 | Pass |
| At least as many booking triggers as the source | 18 | Pass |
| All images load (after scrolling, to trigger lazy loading) | 18 | Pass |
| Header hides on scroll down and reappears on scroll up | 15¹ | Pass |
| Mobile: header stays visible while the menu is open | 1 | Pass |
| Back-to-top does not overlap the chat launcher | 15² | Pass |
| Back-to-top scrolls to the top | 15² | Pass |
| Back-to-top has an accessible label | 15² | Pass |
| Back-to-top is hidden while the chat is open | 4 | Pass |
| Appointment popup opens from a visible booking button | 18 | Pass |
| Appointment popup closes with Esc | 18 | Pass |
| Chat launcher is hidden while the popup is open | 18 | Pass |
| Chat opens with focus in the input | 18 | Pass |
| Chat panel stays inside the viewport | 4³ | Pass |
| Chat answers a location question with the verified address | 4³ | Pass |
| Chat sends urgent symptoms ("face is swollen… cannot swallow") to emergency advice (108/112) | 4³ | Pass |
| Chat shows typed HTML as plain text (`<img onerror>` test) | 4³ | Pass |
| "Fees" chip says fees aren't published and quotes no figures | 4³ | Pass |
| Chat "Open booking form" opens the popup with no WhatsApp request and no navigation | 4³ | Pass |
| Chat panel contains no WhatsApp links | 4³ | Pass |
| Chat closes with Esc and focus returns to the launcher | 4³ | Pass |
| No JS or console errors | 18 | Pass |
| Carousel: review wording, names, labels and order identical to the source | 2 | Pass |
| Carousel: a single flex track (no grid/flex conflict) | 2 | Pass |
| Carousel: "previous" is disabled at the start | 2 | Pass |
| Desktop carousel: "next" moves one card, then "previous" is enabled | 2 | Pass |
| Desktop carousel: "previous" scrolls back | 1 | Pass |
| Desktop carousel: the right-arrow key scrolls | 1 | Pass |
| Desktop carousel: "next" is disabled at the end | 1 | Pass |
| Mobile carousel: touch swipe (simulated touch events) scrolls the track | 1 | Pass |
| Mobile carousel: arrow buttons also work | 1 | Pass |
| Form: an empty submit is blocked by validation and nothing is sent | 2 | Pass |
| Form: a Sunday date is rejected | 2 | Pass |
| Form: a valid request hands off to the existing WhatsApp route with name, mobile and formatted date | 2 | Pass |
| Form (desktop): the site stays open in the original tab | 1 | Pass |
| Form (desktop): the status message says the appointment is confirmed only when the clinic contacts you | 1 | Pass |

**Notes on the table:**
1. Skipped on the three doctor-profile pages at desktop size: they're too short at 1440×900 to scroll far enough. Those pages were tested on mobile.
2. Skipped on the same three desktop doctor-profile pages, because back-to-top only appears after scrolling 320px.
3. The full chat conversation was tested on Home and Contact. On every page, the chat was tested opening (with focus in the input) and closing.

## 3. Additional checks
- **Extra widths:** 375, 768 and 1024px on all 9 pages (27 combinations). No overflow, the chat panel stays inside the viewport, and there are no JS errors.
- **Chat question matching:** sample questions were checked offline against the live question patterns in `script.js`, in three rounds. The misroutes found were fixed before the final run:
  - "gums bleed **when**…" went to timings;
  - "bleeding **won't stop**" wasn't flagged as urgent;
  - "are you open today" went to the "are you a bot?" answer.

  These now go correctly:

  | Question | Answer it gets |
  |---|---|
  | "Can you prescribe antibiotics?" | Refuses to recommend medicine |
  | "I cannot swallow and my jaw hurts" | Urgent-care advice |
  | "what is the weather" | Fallback |
- **JavaScript syntax** (`node --check script.js`): OK.
- **Security scan of the HTML/JS/CSS:**
  - No API keys, tokens, bearer headers or AI-provider names.
  - No `fetch`, XHR, WebSocket or `sendBeacon` calls.
- **Local links, anchors and asset paths:** no broken references and no duplicate IDs on any page.
- **HTML validator** (html-validate 8.18.2, recommended preset):
  - Original source: 4 errors. New build: 3 errors.
  - The 3 left were already in the source: a style rule about non-breaking spaces inside the Contact page "Call the clinic" card link.
  - The one this work fixed was a carousel `aria-label` without a role.
  - The only new error this work introduced (an `aria-label` without a role on the chat suggestion chips) was fixed.
- **Colour contrast:**

  | Text / background | Ratio |
  |---|---|
  | "Dental Care" `#9442e6` on white | 5.0:1 |
  | Brand purple `#43128a` on white | 12.4:1 |
  | White on brand purple | 12.4:1 |

- **Original ZIP:** SHA-256 unchanged after the work, and the extracted original still matches the backup copy exactly.
- **Visual review:** screenshots were checked for the home hero, the carousel, the chat on desktop and mobile, the floating controls and the Clinic guidance section. Two problems were found and fixed:
  - the chat suggestion chips took up too much space on mobile; they are now one row that scrolls sideways;
  - the decorative quote mark overlapped review text.

## 4. Not tested (and why)
- **Real phones and real Safari/Firefox.** Only Chromium was used, with an emulated iPhone 13. Touch swipe was simulated with Chrome DevTools touch events, not a physical device.
- **Google Fonts and the live Google Map.** The sandbox blocks these sites, so screenshots show fallback fonts and an empty map frame. The embed code is unchanged from the source.
- **Real WhatsApp delivery.** WhatsApp requests were intercepted. The test only confirmed the correct prefilled URL; no message reached the clinic.
- **Screen readers.** Roles, labels and focus order were checked in code and by automated tests, but no screen reader (NVDA, VoiceOver) was used.
- **Production hosting and deployment.** None was done or attempted, as required by the brief.
