// Compares every original page with the same page after the CMS has loaded the
// seeded content: text, hero markup and full-page pixels must match.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ORIG = 'http://127.0.0.1:8090/', CMS = 'http://127.0.0.1:8080/';
const PAGES = ['index', 'treatments', 'doctors', 'dr-k-r-srinivasan', 'dr-kruparani', 'dr-samyukta', 'why-us', 'clinic', 'contact'];
const VIEWPORTS = { desktop: { viewport: { width: 1440, height: 900 } }, mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } };
const OUT = '/tmp/parity'; fs.mkdirSync(OUT, { recursive: true });
const results = [];
const staffLinks = [];
const adminLinks = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + info}`); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
async function open(base, page, vp, waitCms) {
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], reducedMotion: 'reduce' });
  // External resources (Google Fonts, Maps) are unreachable here; block them the same way for both.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + page + '.html', { waitUntil: 'load' });
  if (waitCms) await p.waitForFunction(() => window.SDDC && window.SDDC.content, null, { timeout: 10000 });
  if (waitCms) {
    // Intended change: every page's footer has a "· Staff login" link. Record it, then remove it so the
    // rest of the page can be compared pixel by pixel with the original.
    const link = await p.evaluate(() => { const a = document.querySelectorAll('.foot-base .staff-login'); return a.length === 1 ? { href: a[0].getAttribute('href'), rel: a[0].getAttribute('rel'), text: a[0].textContent } : null; });
    staffLinks.push({ page: base + page, link });
    // Intended change: the "Admin Login" button after Contact in the main menu. Record it, then remove it.
    const admin = await p.evaluate(() => { const a = [...document.querySelectorAll('#nav a')]; const i = a.findIndex(x => x.classList.contains('nav-admin')); return i < 0 ? null : { href: a[i].getAttribute('href'), text: a[i].textContent, afterContact: i > 0 && a[i - 1].textContent === 'Contact', last: i === a.length - 1 }; });
    adminLinks.push({ page: base + page, admin });
    await p.evaluate(() => document.querySelectorAll('#nav .nav-admin').forEach(a => a.remove()));
    await p.evaluate(() => document.querySelectorAll('.staff-login').forEach(a => { const t = a.previousSibling; if (t && t.nodeType === 3) t.data = t.data.replace(/ · $/, ''); a.remove(); }));
  }
  await p.addStyleTag({ content: '*{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  // Load every lazy image in both versions so screenshots compare like with like.
  await p.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager'; });
    await Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
  });
  await p.waitForTimeout(300);
  return { ctx, p, errors };
}
const pngDiff = (a, b) => {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return { diff: -1, size: `${A.width}x${A.height} vs ${B.width}x${B.height}` };
  const d = new PNG({ width: A.width, height: A.height });
  return { diff: pixelmatch(A.data, B.data, d.data, A.width, A.height, { threshold: 0.05 }), png: PNG.sync.write(d) };
};

for (const vp of Object.keys(VIEWPORTS)) {
  for (const page of PAGES) {
    const o = await open(ORIG, page, vp, false);
    const c = await open(CMS, page, vp, true);
    const text = async p => p.evaluate(() => document.querySelector('main').innerText.replace(/\s+/g, ' ').trim());
    const ot = await text(o.p), ct = await text(c.p);
    let firstDiff = '';
    if (ot !== ct) { let i = 0; while (ot[i] === ct[i]) i++; firstDiff = `@${i}: "${ot.slice(i - 30, i + 60)}" vs "${ct.slice(i - 30, i + 60)}"`; }
    check(`[${vp}] ${page}: visible text identical after CMS load`, ot === ct, firstDiff);
    // The footer gained one intended item, "· Staff login"; everything else must match.
    const chrome = async p => p.evaluate(() => [document.querySelector('.site-header').innerText, document.querySelector('.site-footer').innerText.replace(' · Staff login', ''), document.title].join('|'));
    check(`[${vp}] ${page}: header, footer and title identical`, (await chrome(o.p)) === (await chrome(c.p)), `${await chrome(o.p)} || ${await chrome(c.p)}`);
    if (page === 'index') {
      const hero = async p => p.evaluate(() => document.querySelector('section.hero').outerHTML);
      check(`[${vp}] hero markup byte-identical`, (await hero(o.p)) === (await hero(c.p)));
      const hs = pngDiff(await o.p.locator('section.hero').screenshot(), await c.p.locator('section.hero').screenshot());
      check(`[${vp}] hero renders pixel-identical`, hs.diff === 0, `${hs.diff} px ${hs.size || ''}`);
    }
    const so = await o.p.screenshot({ fullPage: true }), sc = await c.p.screenshot({ fullPage: true });
    const d = pngDiff(so, sc);
    if (d.diff !== 0) { fs.writeFileSync(`${OUT}/${vp}-${page}-orig.png`, so); fs.writeFileSync(`${OUT}/${vp}-${page}-cms.png`, sc); if (d.png) fs.writeFileSync(`${OUT}/${vp}-${page}-diff.png`, d.png); }
    // Up to 50 pixels of sub-pixel anti-aliasing noise (text wrapped in a <span>) is tolerated; the count is reported.
    check(`[${vp}] ${page}: full page renders identically (${d.diff} anti-aliasing px)`, d.diff >= 0 && d.diff <= 50, `${d.diff} px differ ${d.size || ''}`);
    check(`[${vp}] ${page}: no JavaScript errors`, !c.errors.length, c.errors.join(' | '));
    if (vp === 'mobile') {
      const overflow = await c.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`[mobile] ${page}: no horizontal scrolling`, overflow <= 0, `${overflow}px`);
    }
    await o.ctx.close(); await c.ctx.close();
  }
}

// The site must keep working when the content service is unreachable.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1:8080)/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(CMS + 'index.html');
  await p.waitForFunction(() => window.SDDC && window.SDDC.contentError, null, { timeout: 15000 });
  const o = await open(ORIG, 'index', 'desktop', false);
  const same = (await p.evaluate(() => document.querySelector('main').innerText)) === (await o.p.evaluate(() => document.querySelector('main').innerText));
  check('content service down: page still shows the original content', same);
  check('content service down: no uncaught errors', !errs.length, errs.join('|'));
  await p.click('a.btn[data-book="true"]');
  check('content service down: booking form still opens', await p.locator('#appointmentModal.is-open').count() === 1);
  await ctx.close(); await o.ctx.close();
}
{
  const bad = staffLinks.filter(x => !x.link || x.link.href !== 'admin/index.html' || x.link.rel !== 'nofollow' || x.link.text !== 'Staff login');
  check(`footer "Staff login" link present on every page view (${staffLinks.length}) and points to admin/index.html (nofollow)`, staffLinks.length >= 18 && !bad.length, JSON.stringify(bad.slice(0, 3)));
}
{
  const bad = adminLinks.filter(x => !x.admin || x.admin.href !== 'admin/index.html' || x.admin.text !== 'Admin Login' || !x.admin.afterContact);
  check(`header "Admin Login" button right after Contact on every page view (${adminLinks.length}), after the CMS rebuilt the menu`, adminLinks.length >= 18 && !bad.length, JSON.stringify(bad.slice(0, 3)));
}
await browser.close();
const failed = results.filter(r => !r.ok);
fs.writeFileSync('/tmp/public-parity-results.json', JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
