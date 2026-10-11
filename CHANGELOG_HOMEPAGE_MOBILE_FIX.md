# Targeted corrections

- Homepage `index.html`: the `#doctors` teaser section is removed. Doctor listing/profile pages are untouched.
- `styles.css`: mobile-only rules target the actual selectors in this project (`.wrap.hero-grid`, `.wrap.intro-grid`, `.wrap.features`, `.t-grid`, `.review-grid`, `.section-head`). The rules set equal side gutters, center the hero and section headings, and constrain cards to the viewport.

Desktop styling is not intentionally changed. This package has been source-inspected, but it has not been visually tested in a real browser; verify using a fresh extracted folder and Live Server.
