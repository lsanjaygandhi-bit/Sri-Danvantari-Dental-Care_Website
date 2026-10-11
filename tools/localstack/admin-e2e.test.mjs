// End-to-end tests of the Admin Dashboard through a real browser, against the
// local Auth + PostgREST + storage stack. Each test is independent where possible.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const SITE = 'http://127.0.0.1:8080/';
const ADMIN = SITE + 'admin/index.html';
const PASS = 'Test-pass-2026';
const results = [];
const SHOTS = '/tmp/admin-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const sql = s => execSync(`psql -h 127.0.0.1 -p 54322 -U postgres -Atc ${JSON.stringify(s)}`).toString().trim();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const newCtx = async (opts = {}) => {
  const c = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true, timezoneId: 'Asia/Kolkata', locale: 'en-IN', ...opts });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  return c;
};
let page, ctx;
const errors = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('PASS  ' + name); }
  catch (e) {
    results.push({ name, ok: false, info: e.message.split('\n')[0] });
    console.log('FAIL  ' + name + '  → ' + e.message.split('\n')[0]);
    try { await page.screenshot({ path: `${SHOTS}/fail-${results.length}.png`, fullPage: true }); } catch { /* ignore */ }
    // Close any dialog left open so the next test starts clean.
    try { for (let i = 0; i < 3; i++) { if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape'); } await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }); } catch { /* ignore */ }
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
// Wait for a matching message, then remove it so a later wait can never match this stale one.
const toast = async re => {
  const t = page.locator('.toast:not([data-seen])', { hasText: re }).first();
  await t.waitFor({ timeout: 8000 });
  const text = await t.textContent();
  await t.evaluate(n => { n.setAttribute('data-seen', ''); n.remove(); });
  return text;
};
const confirm = async () => { await page.locator('#confirm-dialog[open] #confirm-ok').click(); };
const go = async hash => {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(300);
  // Leaving a page with unsaved edits asks first; tests that navigate on purpose accept.
  if (await page.locator('#confirm-dialog[open]').count()) { await confirm(); await page.waitForTimeout(300); }
  // Poll with evaluate (waitForFunction needs eval, which the dashboard's CSP rightly forbids).
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(h => location.hash === h && !document.querySelector('#content .view > p.muted:only-child'), hash)) break;
    await page.waitForTimeout(100);
  }
  await page.locator('#content .page-head, #content .banner').first().waitFor();
};
async function login(email, password = PASS) {
  ctx = await newCtx();
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${email}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(`${email}: ${m.text()}`); });
  await page.goto(ADMIN);
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('#login-form [type=submit]');
  await page.locator('#app-view:not([hidden])').waitFor({ timeout: 10000 });
}
const publicPage = async (path, opts = {}) => {
  const c = await newCtx(opts); const p = await c.newPage();
  await p.goto(SITE + path); await p.waitForFunction(() => window.SDDC && (window.SDDC.content || window.SDDC.contentError), null, { timeout: 10000 });
  await p.waitForTimeout(200);
  return { c, p };
};
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Field wrapper whose label is exactly `label` (a trailing " *" marks required fields).
const fieldByLabel = (label, root = page) => root.locator('.field').filter({ has: page.locator('label, span.label').filter({ hasText: new RegExp(`^\\s*${esc(label)}( \\*)?\\s*$`) }) }).first();

// ------------------------------------------------------------- auth -------
await test('wrong password shows an error and does not sign in', async () => {
  const c = await newCtx(); const p = await c.newPage();
  await p.goto(ADMIN); await p.fill('#login-email', 'owner@test.local'); await p.fill('#login-password', 'wrong-password');
  await p.click('#login-form [type=submit]');
  await p.locator('#login-msg', { hasText: 'incorrect' }).waitFor();
  assert(await p.locator('#app-view').isHidden(), 'dashboard visible');
  await c.close();
});
await test('a login without an admin role is refused', async () => {
  const c = await newCtx(); const p = await c.newPage();
  await p.goto(ADMIN); await p.fill('#login-email', 'nobody@test.local'); await p.fill('#login-password', PASS);
  await p.click('#login-form [type=submit]');
  await p.locator('#login-msg', { hasText: 'does not have access' }).waitFor();
  const stored = await p.evaluate(() => Object.keys(localStorage).filter(k => k.includes('auth-token')).length);
  assert(stored === 0, 'session kept');
  await c.close();
});
await test('there is no public sign-up', async () => {
  const r = await fetch('http://127.0.0.1:8000/auth/v1/signup', { method: 'POST', headers: { apikey: fs.readFileSync('/tmp/sddc-anon-key', 'utf8'), 'content-type': 'application/json' }, body: JSON.stringify({ email: 'attacker@test.local', password: 'Attack-2026-x' }) });
  assert(r.status >= 400, 'signup allowed: ' + r.status);
  assert(!(await page?.content?.() || '').includes('Sign up'), 'sign-up UI present');
});
await test('super admin signs in and sees the overview', async () => {
  await login('owner@test.local');
  await page.locator('h1', { hasText: 'Welcome' }).waitFor();
  const nav = await page.locator('#sidebar a').allTextContents();
  for (const n of ['Appointments', 'Pages & sections', 'Doctors & staff', 'Treatments', 'Testimonials', 'Gallery', 'Media library', 'Navigation & footer', 'SEO', 'Website settings', 'Admin users', 'Audit log']) assert(nav.some(t => t.startsWith(n)), 'missing nav ' + n);
  const audit = sql("select count(*) from audit_log where action='login' and actor_email='owner@test.local'");
  assert(Number(audit) >= 1, 'login not audited');
});

await test('fast navigation: a slow earlier page never overwrites the current one', async () => {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { location.hash = '#/overview'; });
    await page.waitForTimeout(5);
    await page.evaluate(() => { location.hash = '#/pages'; });
    await page.waitForTimeout(1500);
    const h1 = await page.locator('#content h1').first().textContent();
    assert(h1 === 'Pages & sections', `showing "${h1}" for #/pages`);
  }
});
// ------------------------------------------------------ pages/sections ----
await test('homepage hero is shown as locked and cannot be edited', async () => {
  await go('#/pages/index');
  const row = page.locator('.section-row', { hasText: 'Hero' });
  await row.locator('.pill.locked').waitFor();
  assert(await row.locator('a', { hasText: 'Edit' }).count() === 0, 'hero has an edit button');
  assert(await row.locator('button', { hasText: 'Hide' }).count() === 0, 'hero can be hidden');
});
await test('section edit: save draft (not public) → preview shows it → publish (public)', async () => {
  await go('#/pages/index/welcome');
  const input = fieldByLabel('Heading').locator('input');
  await input.fill('Dental care, with a very personal touch.');
  await page.click('button:has-text("Save draft")'); await toast(/Draft saved/);
  let pub = await publicPage('index.html');
  assert((await pub.p.textContent('#welcome-title')) === 'Dental care, with a personal touch.', 'draft leaked to public');
  await pub.c.close();
  // preview in the same browser session (uses the admin's sign-in)
  const prev = await ctx.newPage(); await prev.goto(SITE + 'index.html?preview=1');
  await prev.locator('.cms-preview-bar', { hasText: 'showing draft' }).waitFor();
  assert((await prev.textContent('#welcome-title')) === 'Dental care, with a very personal touch.', 'preview missing draft');
  assert(await prev.getAttribute('meta[name="robots"]', 'content') === 'noindex, nofollow', 'preview indexable');
  await prev.close();
  await page.click('button:has-text("Publish")'); await confirm(); await toast(/Published/);
  pub = await publicPage('index.html');
  assert((await pub.p.textContent('#welcome-title')) === 'Dental care, with a very personal touch.', 'publish not live');
  await pub.c.close();
});
await test('section validation blocks HTML and empty required fields', async () => {
  await go('#/pages/index/welcome');
  await fieldByLabel('Heading').locator('input').fill('<b>bold</b>');
  await fieldByLabel('Introduction').locator('textarea').fill('');
  await page.click('button:has-text("Save draft")');
  await page.locator('.field-error', { hasText: 'HTML tags are not allowed' }).waitFor();
  await page.locator('.field-error', { hasText: 'required' }).waitFor();
});
await test('unsaved changes trigger a warning before leaving', async () => {
  await page.click('[data-nav="overview"]');
  await page.locator('#confirm-dialog[open]', { hasText: 'Leave without saving' }).waitFor();
  await page.locator('#confirm-dialog[open] button[value=cancel]').click();
  await page.waitForTimeout(300);
  assert(page.url().includes('#/pages/index/welcome') && await fieldByLabel('Heading').count() === 1, 'navigated away');
  await page.click('[data-nav="overview"]'); await confirm();
  await page.locator('#content h1', { hasText: 'Welcome, ' }).waitFor();
  assert(page.url().endsWith('#/overview'), 'did not leave after confirming');
});
await test('homepage sections can be reordered and hidden (hero stays first)', async () => {
  await go('#/pages/index');
  const cta = page.locator('.section-row', { hasText: 'Closing call to action' });
  await page.locator('.section-row', { hasText: 'Patient experiences' }).locator('button', { hasText: 'Hide' }).click(); await confirm(); await toast(/hidden/);
  await page.locator('.section-row', { hasText: 'Highlights strip' }).locator('button[aria-label^="Move"][aria-label$="down"]').click(); await toast(/order saved/);
  const pub = await publicPage('index.html');
  const order = await pub.p.evaluate(() => [...document.querySelector('main').children].filter(n => !n.hidden).map(n => n.getAttribute('data-cms-section') || n.className));
  assert(order[0] === 'hero', 'hero not first: ' + order[0]);
  assert(order[1] === 'index:welcome' && order[2] === 'index:features', 'order wrong: ' + order.join(','));
  assert(!order.includes('index:stories'), 'hidden section still visible');
  await pub.c.close();
  // restore
  await page.locator('.section-row', { hasText: 'Patient experiences' }).locator('button', { hasText: 'Show' }).click(); await toast(/shown/);
  await page.locator('.section-row', { hasText: 'Highlights strip' }).locator('button[aria-label$="up"]').click(); await toast(/order saved/);
  void cta;
});
await test('CTA label, link and visibility can be changed', async () => {
  await go('#/pages/index/clinic_care');
  await fieldByLabel('Button label').locator('input').fill('Tour the clinic');
  await fieldByLabel('Button link').locator('input').fill('why-us.html');
  await page.locator('label.check', { hasText: 'Show booking button' }).locator('input').uncheck();
  await page.click('button:has-text("Publish")'); await confirm(); await toast(/Published/);
  const pub = await publicPage('index.html');
  const a = pub.p.locator('[data-cms-section="index:clinic_care"] a.btn').first();
  assert((await a.textContent()).startsWith('Tour the clinic') && (await a.getAttribute('href')) === 'why-us.html', 'cta not updated');
  assert(await pub.p.locator('[data-cms-section="index:clinic_care"] a[data-book]').isHidden(), 'booking button not hidden');
  await pub.c.close();
  await fieldByLabel('Button link').locator('input').fill('javascript:alert(1)');
  await page.click('button:has-text("Save draft")');
  await page.locator('.field-error', { hasText: 'Use a page on this site' }).waitFor();
});

// --------------------------------------------------------------- media ----
let uploadedTitle = 'photo-large';
await test('media upload: validated, resized to ≤2000px, converted, with progress', async () => {
  await go('#/media');
  await page.setInputFiles('.dropzone input[type=file]', '/tmp/fixtures/photo-large.jpg');
  await toast(/uploaded/);
  const row = sql("select mime_type||' '||width||'x'||height||' '||size_bytes from media_assets where original_name='photo-large.jpg'");
  const [mime, dims] = row.split(' ');
  assert(mime === 'image/webp' && dims === '2000x1333', 'not resized/converted: ' + row);
});
await test('media upload rejects a disguised non-image (SVG renamed .png)', async () => {
  await page.setInputFiles('.dropzone input[type=file]', '/tmp/fixtures/fake.png');
  await toast(/not a supported image/);
});
await test('media: set alt text, find usage, replace keeps references, delete blocked while used', async () => {
  await page.locator('.media-card', { hasText: uploadedTitle }).first().click();
  const dlg = page.locator('dialog[open]');
  await dlg.locator('input[type=text]').nth(1).fill('Purple pattern used for testing');
  await dlg.locator('button', { hasText: 'Save' }).click(); await toast(/details saved/);
  assert(sql("select alt_text from media_assets where original_name='photo-large.jpg'") === 'Purple pattern used for testing', 'alt not saved');
  const id = sql("select id from media_assets where original_name='photo-large.jpg'");
  sql(`insert into gallery_items (gallery, media_id, title, caption, alt_text, sort_order, status) values ('clinic','${id}','Test photo','Test caption','Purple test',999,'published')`);
  await go('#/media');
  await page.locator('.media-card', { hasText: uploadedTitle }).first().click();
  await page.locator('dialog[open] dd', { hasText: 'Gallery (clinic): Test photo' }).waitFor();
  const oldPath = sql(`select storage_path from media_assets where id='${id}'`);
  await page.setInputFiles('dialog[open] input[type=file]', '/tmp/fixtures/replacement.webp');
  await confirm(); await toast(/replaced everywhere/);
  const newPath = sql(`select storage_path from media_assets where id='${id}'`);
  assert(newPath !== oldPath && sql(`select media_id from gallery_items where title='Test photo'`) === id, 'reference broken');
  const oldGone = await fetch(`http://127.0.0.1:8000/storage/v1/object/public/media/${oldPath}`);
  assert(oldGone.status === 404, 'old file not deleted');
  const pub = await publicPage('clinic.html');
  const src = await pub.p.locator('figure', { hasText: 'Test photo' }).locator('img').getAttribute('src');
  assert(src.includes(newPath), 'public page not using replaced file: ' + src);
  await pub.c.close();
  await go('#/media');
  await page.locator('.media-card', { hasText: uploadedTitle }).first().click();
  await page.locator('dialog[open] button', { hasText: 'Delete' }).click();
  await toast(/still used/);
  await page.keyboard.press('Escape');
  sql("delete from gallery_items where title='Test photo'");
});
await test('original website images cannot be deleted', async () => {
  await go('#/media');
  await page.locator('.media-card', { hasText: 'Clinic logo' }).click();
  await page.locator('dialog[open] button', { hasText: 'Delete' }).click();
  await toast(/cannot be deleted/);
  await page.keyboard.press('Escape');
});

// ---------------------------------------------------------- treatments ----
await test('treatment: create draft with details → not public → publish → appears with its own page', async () => {
  await go('#/treatments/new');
  await fieldByLabel('Treatment name').locator('input').fill('Night Guards');
  assert((await fieldByLabel('URL slug').locator('input').inputValue()) === 'night-guards', 'slug not generated');
  await fieldByLabel('Short summary (cards)').locator('textarea').fill('A custom mouth guard worn at night to protect teeth from grinding.');
  await fieldByLabel('Description').locator('textarea').fill('A night guard is a thin, custom-made tray.\n\nIt is worn while sleeping.');
  await fieldByLabel('Benefits').locator('textarea').fill('Protects enamel\nMay ease jaw discomfort');
  await fieldByLabel('Procedure details').locator('textarea').fill('Impressions are taken.\n\n- First visit: impressions\n- Second visit: fitting');
  await page.click('button:has-text("+ Add question")');
  await page.locator('.repeater-item').last().locator('input').fill('How long does it last?');
  await page.locator('.repeater-item').last().locator('textarea').fill('Usually several years. See [contact](contact.html).');
  await page.click('button:has-text("Save draft")'); await toast(/Draft saved/);
  await page.waitForURL(/#\/treatments\/[0-9a-f-]{36}/);
  let pub = await publicPage('treatments.html');
  assert(!(await pub.p.textContent('main')).includes('Night Guards'), 'draft is public');
  await pub.c.close();
  await page.click('button:has-text("Publish")'); await confirm(); await toast(/Published/);
  pub = await publicPage('treatments.html');
  await pub.p.locator('#more article', { hasText: 'Night Guards' }).waitFor();
  await pub.c.close();
  pub = await publicPage('treatment.html?slug=night-guards');
  assert((await pub.p.textContent('h1')) === 'Night Guards', 'detail page h1');
  const main = await pub.p.textContent('main');
  assert(main.includes('Protects enamel') && main.includes('Second visit: fitting') && main.includes('How long does it last?'), 'detail content missing');
  assert((await pub.p.title()).startsWith('Night Guards'), 'title');
  const link = pub.p.locator('.faq a', { hasText: 'contact' });
  assert((await link.getAttribute('href')) === 'contact.html', 'faq link');
  await pub.p.click('main a[data-book="true"]');
  assert(await pub.p.locator('#appointmentModal.is-open').count() === 1, 'booking from re-rendered button failed');
  await pub.c.close();
});
await test('treatment: editing a published item keeps the live version until "Publish changes"', async () => {
  await fieldByLabel('Treatment name').locator('input').fill('Night Guards (Bruxism)');
  await page.click('button:has-text("Save changes as draft")'); await toast(/saved as a draft/);
  await page.locator('.banner.warn', { hasText: 'not published yet' }).waitFor();
  let pub = await publicPage('treatment.html?slug=night-guards');
  assert((await pub.p.textContent('h1')) === 'Night Guards', 'pending change leaked');
  await pub.c.close();
  await page.click('button:has-text("Publish changes")'); await confirm(); await toast(/published/);
  pub = await publicPage('treatment.html?slug=night-guards');
  assert((await pub.p.textContent('h1')) === 'Night Guards (Bruxism)', 'change not live');
  await pub.c.close();
});
await test('treatment: slug change keeps the old link working (redirect)', async () => {
  await fieldByLabel('URL slug').locator('input').fill('night-guard');
  await page.click('button:has-text("Publish")'); await confirm(); await confirm(); await toast(/published/i);
  const pub = await publicPage('treatment.html?slug=night-guards');
  await pub.p.waitForURL(/slug=night-guard$/);
  assert((await pub.p.textContent('h1')) === 'Night Guards (Bruxism)', 'redirect target');
  await pub.c.close();
});
await test('treatment: slug collision is caught with a clear message', async () => {
  await fieldByLabel('URL slug').locator('input').fill('implants');
  await page.click('button:has-text("Save changes as draft")');
  await toast(/already used/);
  await fieldByLabel('URL slug').locator('input').fill('night-guard');
});
await test('treatment: unpublish removes it; archive hides it; delete removes it', async () => {
  await page.click('button:has-text("Unpublish")'); await confirm(); await toast(/Unpublished/);
  let pub = await publicPage('treatment.html?slug=night-guard');
  await pub.p.locator('h1', { hasText: 'Treatment not found' }).waitFor();
  assert(await pub.p.getAttribute('meta[name="robots"]', 'content') === 'noindex, follow', 'not found page indexable');
  await pub.c.close();
  await page.click('button:has-text("Archive")'); await confirm(); await toast(/Archived/);
  await page.click('button:has-text("Delete permanently")'); await confirm(); await toast(/Deleted/);
  assert(sql("select count(*) from treatments where slug='night-guard'") === '0', 'not deleted');
});
await test('treatment list: search and status filter', async () => {
  await go('#/treatments');
  await page.fill('input[type=search]', 'root');
  await page.waitForTimeout(300);
  assert(await page.locator('tbody tr').count() === 1, 'search');
  await page.fill('input[type=search]', '');
  await page.selectOption('select[aria-label="Filter by status"]', 'draft');
  await page.waitForTimeout(200);
  assert(await page.locator('.empty').count() === 1, 'draft filter');
});

// ---------------------------------------------------- doctors and staff ---
await test('staff profile with uploaded photo appears on the Doctors page', async () => {
  await go('#/doctors/new');
  await fieldByLabel('Full name').locator('input').fill('Priya Raman');
  await fieldByLabel('Profile type').locator('select').selectOption('staff');
  await fieldByLabel('Designation / role').locator('input').fill('Dental Assistant');
  await fieldByLabel('Short summary (card)').locator('textarea').fill('Helps patients feel comfortable during their visit.');
  await fieldByLabel('Photo').locator('button', { hasText: 'Choose or upload' }).click();
  await page.setInputFiles('dialog[open] .dropzone input[type=file]', '/tmp/fixtures/staff.png');
  await toast(/Uploaded/);
  await page.locator('dialog[open] button', { hasText: 'Use selected image' }).click();
  await fieldByLabel('Photo description (alt text)').locator('input').fill('Priya Raman');
  await page.click('button:has-text("Publish")'); await confirm(); await toast(/Published/);
  const pub = await publicPage('doctors.html');
  await pub.p.locator('#cms-staff h2', { hasText: 'Our clinic team' }).waitFor();
  const img = pub.p.locator('#cms-staff img[alt="Priya Raman"]');
  assert(await img.evaluate(i => i.complete && i.naturalWidth > 0), 'staff photo not loaded');
  await pub.c.close();
  const prof = await publicPage('doctor.html?slug=priya-raman');
  assert((await prof.p.textContent('h1')) === 'Priya Raman' && (await prof.p.textContent('.profile .role')) === 'Dental Assistant', 'profile page');
  await prof.c.close();
});
await test('doctor: editing a doctor updates the legacy profile page, cards and clinic team list', async () => {
  await go('#/doctors');
  await page.locator('tr', { hasText: 'Dr. Samyukta' }).click();
  await fieldByLabel('Qualifications').locator('input').fill('BDS');
  await fieldByLabel('Designation / role').locator('input').fill('Dental Surgeon');
  await fieldByLabel('Experience').locator('input').fill('5 years');
  await page.click('button:has-text("Publish")'); await confirm(); await toast(/published/i);
  for (const [path, sel] of [['dr-samyukta.html', '.profile .role'], ['doctors.html', '.doc-card:has-text("Dr. Samyukta") .role'], ['clinic.html', '.team-list li:has-text("Dr. Samyukta") span:not(.av)']]) {
    const pub = await publicPage(path);
    const t = (await pub.p.locator(sel).first().textContent()).trim();
    assert(t === 'BDS · Dental Surgeon', `${path}: ${t}`);
    if (path === 'dr-samyukta.html') assert((await pub.p.textContent('main')).includes('Experience: 5 years'), 'experience');
    await pub.c.close();
  }
});

// -------------------------------------------------------- testimonials ----
await test('testimonial cannot be published without consent; with consent it appears in the carousel', async () => {
  await go('#/testimonials/new');
  await fieldByLabel('Patient name (as it should appear)').locator('input').fill('Meena S');
  await fieldByLabel('Feedback').locator('textarea').fill('The team explained everything clearly and I felt at ease.');
  await page.click('button:has-text("Publish")');
  await toast(/consent/);
  await fieldByLabel('Consent').locator('select').selectOption('written_consent');
  await fieldByLabel('Display order').locator('input').fill('1');
  await page.click('button:has-text("Publish")'); await confirm(); await toast(/Published/);
  const pub = await publicPage('index.html');
  const first = pub.p.locator('#review-track .review-card').first();
  assert((await first.locator('strong').textContent()) === 'Meena S' && (await first.locator('.review-avatar').textContent()) === 'MS', 'carousel');
  assert(await pub.p.locator('[data-review-scroll="1"]').isEnabled(), 'carousel arrows not refreshed');
  await pub.c.close();
});

// ------------------------------------------------------------- gallery ----
await test('gallery: add a clinic photo; it appears on the Clinic page', async () => {
  await go('#/gallery/new');
  await fieldByLabel('Image').locator('button', { hasText: 'Choose or upload' }).click();
  await page.locator('dialog[open] .media-card', { hasText: 'Clinic exterior' }).click();
  await page.locator('dialog[open] button', { hasText: 'Use selected image' }).click();
  await fieldByLabel('Title').locator('input').fill('Reception');
  await fieldByLabel('Image description (alt text)').locator('input').fill('Clinic reception area');
  await page.click('button:has-text("Publish")'); await confirm(); await toast(/Published/);
  const pub = await publicPage('clinic.html');
  await pub.p.locator('.clinic-photo-grid figure', { hasText: 'Reception' }).waitFor();
  await pub.c.close();
});

// ---------------------------------------------------------------- faqs ----
await test('FAQ edit with a link renders safely on the Contact page', async () => {
  await go('#/faqs');
  await page.locator('tr', { hasText: 'What should I bring' }).click();
  await fieldByLabel('Answer').locator('textarea').fill('Bring previous X-rays. [See the clinic page](clinic.html). <script>x</script>');
  await page.click('button:has-text("Publish")');
  await page.locator('.field-error', { hasText: 'HTML tags' }).waitFor();
  await fieldByLabel('Answer').locator('textarea').fill('Bring previous X-rays. [See the clinic page](clinic.html).');
  await page.click('button:has-text("Publish")'); await confirm(); await toast(/published/i);
  const pub = await publicPage('contact.html');
  const d = pub.p.locator('details', { hasText: 'What should I bring' });
  await d.locator('summary').click();
  assert((await d.locator('a').getAttribute('href')) === 'clinic.html', 'faq link');
  await pub.c.close();
});


await test('treatment categories: create, rename (slug kept), delete', async () => {
  await go('#/categories/new');
  await fieldByLabel('Category name').locator('input').fill('Preventive care');
  await page.click('#content button:text-is("Create")'); await toast(/Saved/);
  await page.waitForURL(/#\/categories\/[0-9a-f-]{36}/);
  await page.waitForTimeout(400);
  await fieldByLabel('Category name').locator('input').fill('Preventive dentistry');
  await page.click('#content button:text-is("Save changes")'); await toast(/Saved/);
  assert(sql("select slug from treatment_categories where name='Preventive dentistry'") === 'preventive-care', 'slug changed unexpectedly');
  await page.click('button:has-text("Delete permanently")'); await confirm(); await toast(/Deleted/);
  assert(sql("select count(*) from treatment_categories where slug='preventive-care'") === '0', 'not deleted');
});
await test('clinic facilities: hidden by default; fill in, publish and show', async () => {
  let pub = await publicPage('clinic.html');
  assert(await pub.p.locator('[data-cms-section="clinic:facilities"]').isHidden(), 'facilities visible before being filled in');
  await pub.c.close();
  await go('#/pages/clinic/facilities');
  const item = page.locator('.repeater-item').first();
  await item.locator('input').first().fill('Digital X-ray');
  await item.locator('textarea').first().fill('Low-dose digital radiography in the treatment room.');
  await page.click('button:has-text("Publish")'); await confirm(); await toast(/Published/);
  await go('#/pages/clinic');
  await page.locator('.section-row', { hasText: 'Facilities' }).locator('button', { hasText: 'Show' }).click(); await toast(/shown/);
  pub = await publicPage('clinic.html');
  await pub.p.locator('[data-cms-section="clinic:facilities"] h3', { hasText: 'Digital X-ray' }).waitFor({ state: 'visible' });
  await pub.c.close();
});
await test('discard unpublished changes; archive hides; restore and re-publish', async () => {
  await go('#/faqs');
  await page.locator('tr', { hasText: 'Is my appointment confirmed' }).click();
  await fieldByLabel('Question').locator('input').fill('Is my appointment confirmed straight away?');
  await page.click('button:has-text("Save changes as draft")'); await toast(/saved as a draft/);
  await page.click('button:has-text("Discard unpublished changes")'); await confirm(); await toast(/discarded/);
  assert(sql("select count(*) from faqs where question='Is my appointment confirmed when I send the form?' and draft_data is null") === '1', 'discard failed');
  await page.click('button:has-text("Archive")'); await confirm(); await toast(/Archived/);
  let pub = await publicPage('contact.html');
  assert(!(await pub.p.textContent('.faq')).includes('Is my appointment confirmed'), 'archived item still public');
  await pub.c.close();
  await page.click('button:has-text("Restore as draft")'); await toast(/Restored/);
  await page.click('button:has-text("Publish")'); await confirm(); await toast(/Published/);
  pub = await publicPage('contact.html');
  assert((await pub.p.textContent('.faq')).includes('Is my appointment confirmed'), 're-published item missing');
  await pub.c.close();
});

// ------------------------------------------------------------ settings ----
await test('settings: clinic WhatsApp number updates every WhatsApp link and the booking target', async () => {
  await go('#/settings/contact');
  await fieldByLabel('WhatsApp number (digits with country code)').locator('input').fill('919000012345');
  await fieldByLabel('WhatsApp number as shown on the website').locator('input').fill('+91 90000 12345');
  await page.click('button:has-text("Save settings")'); await confirm(); await toast(/Settings saved/);
  const pub = await publicPage('contact.html');
  const hrefs = await pub.p.$$eval('a[href^="https://wa.me/"]', as => as.map(a => a.getAttribute('href')));
  assert(hrefs.length >= 3 && hrefs.every(h => h.startsWith('https://wa.me/919000012345?')), hrefs.join());
  assert((await pub.p.textContent('main')).includes('+91 90000 12345'), 'display number');
  await pub.c.close();
});
await test('settings: invalid values are rejected with a message', async () => {
  await fieldByLabel('Phone number for calls (digits with country code)').locator('input').fill('98-84');
  await page.click('button:has-text("Save settings")');
  await page.locator('.field-error', { hasText: 'Digits only' }).waitFor();
});
await test('settings: announcement banner and holiday notice', async () => {
  await go('#/settings/announcement');
  await page.locator('label.check', { hasText: 'Show the announcement banner' }).locator('input').check();
  await fieldByLabel('Message').locator('input').fill('The clinic is closed on 2 November for Deepavali.');
  await fieldByLabel('Link text (optional)').locator('input').fill('Contact us');
  await fieldByLabel('Link address (optional)').locator('input').fill('contact.html');
  await page.click('button:has-text("Save settings")'); await toast(/Settings saved/);
  const pub = await publicPage('why-us.html');
  await pub.p.locator('.cms-announcement', { hasText: 'Deepavali' }).waitFor();
  assert((await pub.p.locator('.cms-announcement a').getAttribute('href')) === 'contact.html', 'link');
  await pub.c.close();
  await page.locator('label.check', { hasText: 'Show the announcement banner' }).locator('input').uncheck();
  await page.click('button:has-text("Save settings")'); await toast(/Settings saved/);
});
await test('settings: opening hours update the Contact page table', async () => {
  await go('#/settings/hours');
  await page.locator('.repeater-item').first().locator('textarea').fill('10:00 am–1:00 pm\n6:00–9:00 pm');
  await page.click('button:has-text("Save settings")'); await toast(/Settings saved/);
  const pub = await publicPage('contact.html');
  const cell = await pub.p.locator('[data-cms-hours-table] td').first().innerText();
  assert(cell.replace(/\s+/g, ' ') === '10:00 am–1:00 pm 6:00–9:00 pm', cell);
  await pub.c.close();
});
await test('settings: booking options flow into the booking form', async () => {
  await go('#/settings/booking');
  const ta = fieldByLabel('Treatment options').locator('textarea');
  await ta.fill((await ta.inputValue()) + '\nNight guards');
  await page.click('button:has-text("Save settings")'); await toast(/Settings saved/);
  const pub = await publicPage('index.html');
  const opts = await pub.p.$$eval('#popupTreatment option', o => o.map(x => x.value));
  assert(opts.includes('Night guards') && opts[0] === 'General consultation', opts.join());
  await pub.c.close();
});
await test('settings: social links appear in the footer only when set', async () => {
  let pub = await publicPage('index.html');
  assert(await pub.p.locator('.cms-social').count() === 0, 'empty social shown'); await pub.c.close();
  await go('#/settings/social');
  await fieldByLabel('Instagram').locator('input').fill('https://www.instagram.com/example');
  await page.click('button:has-text("Save settings")'); await toast(/Settings saved/);
  pub = await publicPage('index.html');
  assert((await pub.p.locator('.cms-social a').getAttribute('href')) === 'https://www.instagram.com/example', 'social');
  await pub.c.close();
});
await test('settings: favicon must be a square PNG; logo can be replaced', async () => {
  await go('#/settings/branding');
  await fieldByLabel('Favicon (square PNG)').locator('button', { hasText: 'Choose or upload' }).click();
  await page.setInputFiles('dialog[open] .dropzone input[type=file]', '/tmp/fixtures/photo-large.jpg');
  await toast(/must be PNG/);
  await page.setInputFiles('dialog[open] .dropzone input[type=file]', '/tmp/fixtures/fav.png');
  await toast(/Uploaded/);
  await page.locator('dialog[open] button', { hasText: 'Use selected image' }).click();
  await page.click('button:has-text("Save settings")'); await toast(/Settings saved/);
  const pub = await publicPage('index.html');
  const fav = await pub.p.getAttribute('link[rel="icon"][type="image/png"]', 'href');
  assert(fav.includes('/storage/v1/object/public/media/uploads/'), fav);
  await pub.c.close();
});

// ---------------------------------------------------------- navigation ----
await test('navigation: add, hide and reorder links; essential links are protected', async () => {
  await go('#/navigation');
  const essential = page.locator('.panel').first().locator('.section-row', { hasText: 'Home' });
  assert(await essential.locator('button', { hasText: 'Delete' }).count() === 0 && await essential.locator('button', { hasText: 'Hide' }).count() === 0, 'essential editable');
  await page.locator('.panel').first().locator('button', { hasText: '+ Add link' }).click();
  await fieldByLabel('Link text', page.locator('dialog[open]')).locator('input').fill('Book');
  await fieldByLabel('Link address', page.locator('dialog[open]')).locator('input').fill('javascript:alert(1)');
  await page.locator('dialog[open] button', { hasText: 'Save' }).click();
  await page.locator('.field-error', { hasText: 'Use a page' }).waitFor();
  await fieldByLabel('Link address', page.locator('dialog[open]')).locator('input').fill('contact.html');
  await page.locator('dialog[open] button', { hasText: 'Save' }).click(); await toast(/Saved/);
  await page.locator('.panel').first().locator('.section-row', { hasText: 'Why Us' }).locator('button', { hasText: 'Hide' }).click(); await toast(/hidden/);
  const pub = await publicPage('clinic.html');
  // The fixed "Admin Login" button always stays at the end of the menu, after the CMS-managed links.
  const labels = await pub.p.$$eval('#nav a:not(.nav-admin)', as => as.map(a => a.textContent));
  assert(labels.at(-1) === 'Book' && !labels.includes('Why Us'), labels.join());
  assert((await pub.p.$$eval('#nav a', as => as.at(-1).textContent)) === 'Admin Login', 'Admin Login button kept after the menu was rebuilt');
  assert((await pub.p.getAttribute('#nav a:text-is("Clinic")', 'aria-current')) === 'page', 'current page marker');
  await pub.c.close();
  await page.locator('.panel').first().locator('.section-row', { hasText: 'Why Us' }).locator('button', { hasText: 'Show' }).click(); await toast(/shown/);
  await page.locator('.panel').first().locator('.section-row', { hasText: 'Book' }).locator('button', { hasText: 'Delete' }).click(); await confirm(); await toast(/deleted/);
});

// ----------------------------------------------------------------- seo ----
await test('SEO: title/description update the public page; invalid JSON-LD is rejected; sitemap generated', async () => {
  await go('#/seo/why-us.html');
  await fieldByLabel('Page title').locator('input').fill('Why Choose Sri Danvantari Dental Care | Saligramam');
  await fieldByLabel('Structured data (JSON-LD)').locator('textarea').fill('{ not json');
  await page.click('#content button:text-is("Save")');
  await page.locator('.field-error', { hasText: 'not valid JSON' }).waitFor();
  await page.click('button:has-text("Fill structured data from clinic details")');
  await toast(/Structured data filled/);
  await page.click('#content button:text-is("Save")'); await toast(/SEO settings saved/);
  const pub = await publicPage('why-us.html');
  assert((await pub.p.title()) === 'Why Choose Sri Danvantari Dental Care | Saligramam', await pub.p.title());
  const ld = JSON.parse(await pub.p.textContent('script[type="application/ld+json"]'));
  assert(ld['@type'] === 'Dentist' && ld.telephone === '+919884048448', JSON.stringify(ld));
  await pub.c.close();
  await go('#/settings/site');
  await fieldByLabel('Website address').locator('input').fill('https://www.sridanvantaridental.in');
  await page.click('button:has-text("Save settings")'); await toast(/Settings saved/);
  await go('#/seo');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download sitemap.xml")')]);
  const xml = fs.readFileSync(await dl.path(), 'utf8');
  assert(xml.includes('<loc>https://www.sridanvantaridental.in/</loc>') && xml.includes('dr-samyukta.html') && xml.includes('doctor.html?slug=priya-raman'), xml.slice(0, 400));
  const pub2 = await publicPage('why-us.html');
  assert((await pub2.p.getAttribute('link[rel="canonical"]', 'href')) === 'https://www.sridanvantaridental.in/why-us.html', 'canonical');
  await pub2.c.close();
});

// ------------------------------------------------------- appointments -----
await test('appointment from the public form is stored and appears in the dashboard', async () => {
  const pub = await publicPage('treatments.html');
  await pub.p.evaluate(() => { window.open = () => ({}); });   // keep WhatsApp from opening in the test
  await pub.p.click('#implants a[data-book="true"]');
  assert((await pub.p.inputValue('#popupTreatment')) === 'Dental implants', 'treatment preselect');
  await pub.p.fill('#popupName', 'Ravi Kumar');
  await pub.p.fill('#popupPhone', '9876501234');
  const d = new Date(); d.setDate(d.getDate() + ((9 - d.getDay()) % 7 || 7)); // next Tuesday
  await pub.p.fill('#popupDate', d.toISOString().slice(0, 10));
  await pub.p.fill('#popupMessage', 'Evening preferred');
  await pub.p.click('#appointmentPopupForm [type=submit]');
  await pub.p.locator('#appointmentPopupStatus', { hasText: 'confirmed only when the clinic contacts you' }).waitFor();
  await pub.p.waitForTimeout(800);
  await pub.c.close();
  assert(sql("select count(*) from appointments where patient_name='Ravi Kumar' and treatment='Dental implants' and phone='9876501234'") === '1', 'not stored');
  await go('#/appointments');
  await page.fill('input[type=search]', 'Ravi');
  await page.locator('tbody tr', { hasText: 'Ravi Kumar' }).waitFor();
});
await test('appointment: status workflow with confirmation, notes, search by phone and filter', async () => {
  await page.locator('tbody tr', { hasText: 'Ravi Kumar' }).click();
  await page.fill('textarea[aria-label="New internal note"]', 'Typed before the status change');
  await page.click('button:has-text("Contacted")'); await toast(/contacted/);
  await page.locator('.statusline .pill', { hasText: 'contacted' }).waitFor();
  assert((await page.inputValue('textarea[aria-label="New internal note"]')) === 'Typed before the status change', 'draft note lost on status change');
  await page.click('button:has-text("Confirmed")');
  await page.locator('#confirm-dialog[open]', { hasText: 'actually agreed' }).waitFor(); await confirm(); await toast(/confirmed/);
  await page.locator('.statusline .pill', { hasText: 'confirmed' }).waitFor();
  await page.fill('textarea[aria-label="New internal note"]', 'Booked Tuesday 6:30 pm.');
  await page.click('button:has-text("Add note")'); await toast(/Note added/);
  await page.locator('.note', { hasText: 'Booked Tuesday' }).waitFor();
  await page.locator('.note small', { hasText: 'owner@test.local' }).waitFor();
  await go('#/appointments');
  await page.fill('input[type=search]', '98765012');
  await page.locator('tbody tr', { hasText: 'Ravi Kumar' }).waitFor();
  await page.fill('input[type=search]', '');
  await page.selectOption('select[aria-label="Status"]', 'confirmed');
  await page.waitForTimeout(600);
  assert(await page.locator('tbody tr').count() === 1, 'filter');
});
await test('appointment date filter uses clinic time (IST) and includes the end date', async () => {
  await go('#/appointments');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  await page.fill('input[aria-label="Received from"]', today);
  await page.fill('input[aria-label="Received to"]', today);
  await page.waitForTimeout(800);
  await page.locator('tbody tr', { hasText: 'Ravi Kumar' }).waitFor();
});
await test('appointment: HTML submitted by a visitor is shown as plain text in the dashboard', async () => {
  sql("insert into appointments (patient_name, phone, message) values ('<img src=x onerror=window.__xss=1>', '9876500000', '<script>window.__xss=1</script>')");
  await go('#/appointments');
  await page.selectOption('select[aria-label="Status"]', '');
  await page.locator('tbody tr', { hasText: '<img src=x' }).click();
  await page.locator('dd', { hasText: '<script>' }).waitFor();
  assert(!(await page.evaluate(() => window.__xss)), 'XSS executed');
});
await test('appointment: CSV export (super admin) downloads and is audited', async () => {
  await go('#/appointments');
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('button:has-text("Export CSV")'); await confirm(); })()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  assert(csv.includes('Ravi Kumar') && csv.includes("'=") === false, 'csv content');
  assert(csv.includes('"\'<img') || csv.includes('<img'), 'csv row');
  assert(Number(sql("select count(*) from audit_log where action='export'")) >= 1, 'export not audited');
});
await test('CSV export neutralises spreadsheet formulas', async () => {
  sql("insert into appointments (patient_name, phone, message) values ('=HYPERLINK(\"http://x\")', '9876500001', '+cmd')");
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('button:has-text("Export CSV")'); await confirm(); })()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  assert(csv.includes(`"'=HYPERLINK(""http://x"")"`) && csv.includes("'+cmd"), csv.split('\n').find(l => l.includes('HYPERLINK')));
});

// -------------------------------------------------------- users & audit ---
await test('users: grant Editor and Front Desk roles from the dashboard', async () => {
  await go('#/users');
  for (const [email, role] of [['editor@test.local', 'editor'], ['desk@test.local', 'front_desk']]) {
    await page.click('button:has-text("+ Give access")');
    await fieldByLabel('Email of the existing login', page.locator('dialog[open]')).locator('input').fill(email);
    await fieldByLabel('Role', page.locator('dialog[open]')).locator('select').selectOption(role);
    await page.locator('dialog[open] button', { hasText: 'Grant access' }).click(); await toast(/Access granted/);
  }
  await page.locator('tr', { hasText: 'desk@test.local' }).waitFor();
  assert(await page.locator('tr', { hasText: 'owner@test.local' }).locator('select').isDisabled(), 'own role editable');
});
await test('audit log lists changes with who/when and redacts patient data', async () => {
  await go('#/audit');
  await page.locator('tbody tr', { hasText: 'owner@test.local' }).first().waitFor();
  await page.selectOption('select[aria-label="Area"]', 'appointments');
  await page.waitForTimeout(600);
  const text = await page.textContent('#content');
  assert(!text.includes('Ravi Kumar') && !text.includes('9876501234'), 'patient data in audit view');
});
await test('sign out', async () => {
  await page.click('#logout-btn');
  await page.locator('#login-msg', { hasText: 'signed out' }).waitFor();
  await ctx.close();
});

// -------------------------------------------------- role restrictions UI --
await test('editor: sees content sections only; settings and appointments are blocked', async () => {
  await login('editor@test.local');
  const nav = await page.locator('#sidebar a').allTextContents();
  assert(!nav.some(t => /Appointments|Website settings|Admin users|Audit log|Navigation/.test(t)), nav.join());
  await go('#/appointments');
  await page.locator('.banner.warn', { hasText: 'does not have access' }).waitFor();
  await go('#/settings/contact');
  await page.locator('.banner.warn', { hasText: 'does not have access' }).waitFor();
  await ctx.close();
});
await test('front desk: sees appointments only, no export button', async () => {
  await login('desk@test.local');
  const nav = await page.locator('#sidebar a').allTextContents();
  assert(nav.some(t => t.startsWith('Appointments')) && !nav.some(t => /Treatments|Pages|Media/.test(t)), nav.join());
  await go('#/appointments');
  assert(await page.locator('button', { hasText: 'Export CSV' }).count() === 0, 'export visible');
  await go('#/treatments');
  await page.locator('.banner.warn', { hasText: 'does not have access' }).waitFor();
  await ctx.close();
});

// ------------------------------------------------------------ sessions ----
await test('session expires after 30 minutes of inactivity', async () => {
  await login('owner@test.local');
  await page.evaluate(() => localStorage.setItem('sddc-admin-active-at', String(Date.now() - 31 * 60 * 1000)));
  await page.locator('#login-msg', { hasText: '30 minutes of inactivity' }).waitFor({ timeout: 40000 });
  const tok = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('auth-token')).length);
  assert(tok === 0, 'token left behind');
  await ctx.close();
});
await test('session expires after 12 hours regardless of activity', async () => {
  await login('owner@test.local');
  await page.evaluate(() => localStorage.setItem('sddc-admin-login-at', String(Date.now() - 13 * 3600 * 1000)));
  await page.reload();
  await page.locator('#login-msg', { hasText: '12-hour limit' }).waitFor({ timeout: 15000 });
  await ctx.close();
});
await test('protected admin data is unreachable without a session (API returns nothing)', async () => {
  const c = await newCtx(); const p = await c.newPage(); await p.goto(ADMIN);
  const r = await p.evaluate(async () => { const sb = window.supabase.createClient(window.SDDC_CONFIG.supabaseUrl, window.SDDC_CONFIG.supabaseKey); const a = await sb.from('appointments').select('*'); const s = await sb.from('site_settings').select('*'); return [a.error?.code || a.data.length, s.error?.code || s.data.length]; });
  assert(r.every(x => x === '42501' || x === 0), JSON.stringify(r));
  await c.close();
});

// ------------------------------------------------------ password flows ----
await test('change password (requires current password)', async () => {
  await login('editor@test.local');
  await go('#/account');
  await page.fill('#acc-cur', 'wrong'); await page.fill('#acc-p1', 'NewPass-2026a'); await page.fill('#acc-p2', 'NewPass-2026a');
  await page.click('button:has-text("Change password")');
  await page.locator('.form-msg', { hasText: 'incorrect' }).waitFor();
  await page.fill('#acc-cur', PASS); await page.fill('#acc-p1', 'short'); await page.fill('#acc-p2', 'short');
  await page.click('button:has-text("Change password")');
  await page.locator('.form-msg', { hasText: 'at least 10' }).waitFor();
  await page.fill('#acc-p1', 'NewPass-2026a'); await page.fill('#acc-p2', 'NewPass-2026a');
  await page.click('button:has-text("Change password")'); await toast(/Password changed/);
  await ctx.close();
  await login('editor@test.local', 'NewPass-2026a');
  await ctx.close();
});
await test('sign out on all devices ends the session', async () => {
  await login('editor@test.local', 'NewPass-2026a');
  await go('#/account');
  await page.click('button:has-text("Sign out on all devices")'); await confirm();
  await page.locator('#auth-view:not([hidden])').waitFor({ timeout: 10000 });
  await ctx.close();
});
await test('password reset by email link', async () => {
  let step = 'request reset';
  try {
    fs.rmSync('/tmp/mails', { recursive: true, force: true });
    const c = await newCtx(); const p = await c.newPage(); await p.goto(ADMIN);
    await p.click('#forgot-btn'); await p.fill('#forgot-email', 'desk@test.local'); await p.click('#forgot-form [type=submit]');
    await p.locator('#forgot-msg', { hasText: 'If this email belongs' }).waitFor({ timeout: 10000 });
    step = 'receive email';
    let mail = '';
    for (let i = 0; i < 30 && !mail; i++) { await p.waitForTimeout(300); if (fs.existsSync('/tmp/mails')) { const f = fs.readdirSync('/tmp/mails'); if (f.length) mail = fs.readFileSync('/tmp/mails/' + f[0], 'utf8'); } }
    const raw = mail.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
    const link = (raw.match(/https?:\/\/127\.0\.0\.1:8000\/auth\/v1\/verify\?[^"\s<]+/) || [])[0]?.replace(/&amp;/g, '&');
    assert(link, 'no reset link in email');
    step = 'open link';
    await p.goto(link);
    await p.locator('#recovery-form:not([hidden])').waitFor({ timeout: 10000 });
    step = 'set new password';
    await p.fill('#recovery-pass', 'Reset-pass-2026'); await p.fill('#recovery-pass2', 'Reset-pass-2026');
    await p.click('#recovery-form [type=submit]');
    await p.locator('#login-msg', { hasText: 'Password updated' }).waitFor({ timeout: 10000 });
    await c.close();
    step = 'sign in with new password';
    await login('desk@test.local', 'Reset-pass-2026'); await ctx.close();
    step = 'unknown email gets the same answer';
    const c2 = await newCtx(); const p2 = await c2.newPage(); await p2.goto(ADMIN);
    await p2.click('#forgot-btn'); await p2.fill('#forgot-email', 'unknown@test.local'); await p2.click('#forgot-form [type=submit]');
    await p2.locator('#forgot-msg', { hasText: 'If this email belongs' }).waitFor({ timeout: 10000 });  // no account enumeration
    await c2.close();
  } catch (e) { throw new Error(`step "${step}": ${e.message.split('\n')[0]}`); }
});

// ---------------------------------------------------------------- mobile --
await test('dashboard works at phone width (menu, tables, editor) without sideways scrolling', async () => {
  ctx = await newCtx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await ctx.newPage();
  await page.goto(ADMIN); await page.fill('#login-email', 'owner@test.local'); await page.fill('#login-password', PASS); await page.click('#login-form [type=submit]');
  await page.locator('#app-view:not([hidden])').waitFor();
  for (const hsh of ['#/overview', '#/appointments', '#/treatments', '#/pages/index/welcome', '#/media', '#/settings/hours']) {
    await go(hsh);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(over <= 0, `${hsh} overflows by ${over}px`);
    await page.screenshot({ path: `${SHOTS}/mobile-${hsh.replace(/[#/]/g, '_')}.png` });
  }
  await page.click('#menu-toggle');
  await page.locator('#sidebar.open').waitFor();
  await page.click('#sidebar a:has-text("Testimonials")');
  await page.locator('h1', { hasText: 'Testimonials' }).waitFor();
  await ctx.close();
});
await test('every dashboard screen (33) renders without stray null/undefined text', async () => {
  await login('owner@test.local');
  const screens = ['#/overview', '#/appointments', '#/pages', '#/pages/index', '#/pages/index/welcome', '#/pages/clinic/intro', '#/pages/contact/address', '#/doctors', '#/doctors/new',
    '#/treatments', '#/treatments/new', '#/categories', '#/testimonials', '#/testimonials/new', '#/gallery', '#/gallery/new', '#/faqs', '#/faqs/new', '#/media', '#/navigation',
    '#/seo', '#/seo/index.html', '#/settings/contact', '#/settings/hours', '#/settings/booking', '#/settings/announcement', '#/settings/social', '#/settings/branding', '#/settings/privacy', '#/settings/site',
    '#/users', '#/audit', '#/account'];
  const bad = [];
  for (const hsh of screens) {
    await go(hsh); await page.waitForTimeout(250);
    const txt = await page.evaluate(() => document.querySelector('#content').innerText);
    const m = txt.match(/\b(null|undefined|NaN|\[object Object\])\b/);
    if (m) bad.push(`${hsh}: "${m[0]}"`);
    if (['#/overview', '#/appointments', '#/pages/index', '#/treatments', '#/media', '#/settings/contact', '#/audit'].includes(hsh)) await page.screenshot({ path: `${SHOTS}/desktop-${hsh.replace(/[#/]/g, '_')}.png`, fullPage: false });
  }
  assert(!bad.length, 'stray text: ' + bad.join(', '));
  await go('#/treatments'); await page.locator('tbody tr').first().click(); await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/desktop-treatment-editor.png` });
  await ctx.close();
});
await test('hero is still byte-identical to the original after all the edits', async () => {
  const pub = await publicPage('index.html');
  const cms = await pub.p.evaluate(() => document.querySelector('section.hero').outerHTML);
  const orig = fs.readFileSync('/home/claude/src/Sri_Danvantari_Dental_Care_Website_Implemented/Sri_Danvantari_Dental_Care/index.html', 'utf8');
  const c2 = await newCtx(); const p2 = await c2.newPage(); await p2.setContent(orig);
  const o = await p2.evaluate(() => document.querySelector('section.hero').outerHTML);
  assert(cms === o, 'hero changed');
  await pub.c.close(); await c2.close();
});
await test('no JavaScript errors in the dashboard during the whole run', async () => {
  assert(!errors.length, errors.slice(0, 5).join(' | '));
});

await browser.close();
const failed = results.filter(r => !r.ok);
fs.writeFileSync('/tmp/admin-e2e-results.json', JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
