// The header "Admin Login" button: position, mobile menu, click-through, and the login page it opens.
import { chromium } from 'playwright';
import fs from 'node:fs';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + info}`); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const ORIG = 'http://127.0.0.1:8090/';
const SITES = { 'not yet connected': 'http://127.0.0.1:8301/', 'connected to Supabase (local)': 'http://127.0.0.1:8080/' };
const PAGES = ['index', 'doctors', 'treatments', 'why-us', 'clinic', 'contact', 'dr-k-r-srinivasan', 'treatment', 'doctor'];
const ctxFor = async (w) => { const c = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: w < 800, hasTouch: w < 800 }); await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); return c; };
const measure = p => p.evaluate(() => {
  const nav = [...document.querySelectorAll('#nav a')], a = document.querySelector('#nav .nav-admin'), h = document.querySelector('.site-header');
  const r = e => e.getBoundingClientRect();
  const contact = nav.find(x => x.textContent === 'Contact');
  return { headerH: Math.round(r(h).height), overflow: document.documentElement.scrollWidth - innerWidth,
    visible: !!a && getComputedStyle(a).display !== 'none' && r(a).width > 0 && getComputedStyle(document.getElementById('nav')).display !== 'none',
    afterContact: !!a && a.previousElementSibling === contact, sameRow: !!a && !!contact && Math.abs(r(a).top + r(a).height / 2 - (r(contact).top + r(contact).height / 2)) < 4,
    inHeader: !!a && r(a).bottom <= r(h).bottom + 1, href: a?.getAttribute('href'), text: a?.textContent };
});
for (const [label, base] of Object.entries(SITES)) {
  // Desktop and tablet widths where the full menu shows
  for (const w of [1440, 1280, 1100, 1024, 990]) {
    const c = await ctxFor(w); const p = await c.newPage();
    await p.goto(base + 'index.html'); await p.waitForTimeout(label.startsWith('connected') ? 1200 : 300);
    const m = await measure(p);
    const c0 = await ctxFor(w); const p0 = await c0.newPage(); await p0.goto(ORIG + 'index.html');
    const origH = await p0.evaluate(() => Math.round(document.querySelector('.site-header').getBoundingClientRect().height)); await c0.close();
    check(`[${label}] ${w}px: Admin Login visible in the header, right after Contact, on the same row`, m.visible && m.afterContact && m.sameRow && m.inHeader, JSON.stringify(m));
    check(`[${label}] ${w}px: header height unchanged (${m.headerH}px vs original ${origH}px), no sideways scroll`, m.headerH === origH && m.overflow <= 0, JSON.stringify(m));
    if (w === 1440) await p.locator('.site-header').screenshot({ path: `/tmp/btn-${label.split(' ')[0]}-1440.png` });
    if (w === 990) await p.locator('.site-header').screenshot({ path: `/tmp/btn-${label.split(' ')[0]}-990.png` });
    await c.close();
  }
  // Every page
  const c = await ctxFor(1280); const p = await c.newPage(); const missing = [];
  for (const pg of PAGES) { await p.goto(base + pg + '.html' + (pg === 'treatment' ? '?slug=implants' : pg === 'doctor' ? '?slug=dr-samyukta' : '')); await p.waitForTimeout(label.startsWith('connected') ? 900 : 150); const m = await measure(p); if (!(m.visible && m.afterContact && m.href === 'admin/index.html')) missing.push(pg); }
  check(`[${label}] button present after Contact on all ${PAGES.length} page types`, !missing.length, missing.join(','));
  // Click opens the real Admin Login page
  await p.goto(base + 'index.html'); await p.waitForTimeout(label.startsWith('connected') ? 1200 : 200);
  await p.click('#nav .nav-admin'); await p.waitForLoadState('load'); await p.waitForTimeout(1200);
  const url = p.url();
  if (label.startsWith('connected')) {
    const form = await p.locator('#login-form').isVisible();
    check(`[${label}] clicking opens ${url.replace(base, '/')} with the sign-in form`, url.endsWith('/admin/index.html') && form, url);
    await p.fill('#login-email', 'owner@test.local'); await p.fill('#login-password', 'Test-pass-2026'); await p.click('#login-form [type=submit]');
    const ok = await p.locator('#app-view:not([hidden])').waitFor({ timeout: 10000 }).then(() => true, () => false);
    check(`[${label}] signing in on that page opens the dashboard (real Supabase Auth, role checked)`, ok);
    await p.screenshot({ path: '/tmp/btn-dashboard.png' });
  } else {
    const txt = await p.textContent('#boot');
    check(`[${label}] clicking opens ${url.replace(base, '/')}, which explains that sign-in needs the Supabase connection`, url.endsWith('/admin/index.html') && /not connected yet/.test(txt), txt.slice(0, 80));
    await p.screenshot({ path: '/tmp/btn-not-connected.png' });
  }
  await c.close();
  // Phones: inside the ☰ menu
  for (const w of [390, 768]) {
    const c = await ctxFor(w); const p = await c.newPage();
    await p.goto(base + 'index.html'); await p.waitForTimeout(label.startsWith('connected') ? 1200 : 300);
    const closed = await measure(p);
    const c0 = await ctxFor(w); const p0 = await c0.newPage(); await p0.goto(ORIG + 'index.html');
    const origH = await p0.evaluate(() => Math.round(document.querySelector('.site-header').getBoundingClientRect().height)); await c0.close();
    check(`[${label}] ${w}px phone: header bar unchanged (${closed.headerH}px vs ${origH}px), button not squeezed into it`, !closed.visible && closed.headerH === origH && closed.overflow <= 0, JSON.stringify(closed));
    await p.click('#menu');
    const item = p.locator('#nav.open .nav-admin');
    const vis = await item.isVisible();
    const order = await p.$$eval('#nav a', as => as.map(a => a.textContent));
    check(`[${label}] ${w}px phone: ☰ menu shows Admin Login after Contact`, vis && order.at(-1) === 'Admin Login' && order.at(-2) === 'Contact', order.join(' | '));
    if (w === 390) await p.screenshot({ path: `/tmp/btn-${label.split(' ')[0]}-390-menu.png` });
    await item.click(); await p.waitForLoadState('load');
    check(`[${label}] ${w}px phone: tapping it opens /admin/index.html`, p.url().endsWith('/admin/index.html'), p.url());
    await c.close();
  }
}
await browser.close();
fs.writeFileSync('/tmp/header-button-results.json', JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
