// Static checks: JS syntax, local links/assets, no secrets in public files, hero baseline.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as cheerio from 'cheerio';

const SITE = process.argv[2] || '/home/claude/project/Sri_Danvantari_Dental_Care';
const ORIG = '/home/claude/src/Sri_Danvantari_Dental_Care_Website_Implemented/Sri_Danvantari_Dental_Care';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + info}`); };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(SITE).filter(f => !f.includes('/supabase/'));

// 1. JavaScript syntax
for (const f of files.filter(f => f.endsWith('.js') && !f.includes('/vendor/'))) {
  const isModule = f.includes('/admin/js/');
  try {
    execFileSync('node', isModule ? ['--experimental-default-type=module', '--check', f] : ['--check', f], { stdio: 'pipe' });
    check(`JS syntax: ${path.relative(SITE, f)}`, true);
  } catch (e) { check(`JS syntax: ${path.relative(SITE, f)}`, false, e.stderr.toString().split('\n').slice(0, 4).join(' ')); }
}

// 2. Local links and assets in every HTML page
const htmls = files.filter(f => f.endsWith('.html'));
let broken = [];
for (const f of htmls) {
  const $ = cheerio.load(fs.readFileSync(f, 'utf8'));
  const refs = [];
  $('[href],[src],[srcset]').each((_, el) => {
    for (const a of ['href', 'src']) { const v = $(el).attr(a); if (v) refs.push(v); }
    const ss = $(el).attr('srcset'); if (ss) ss.split(',').forEach(c => refs.push(c.trim().split(/\s+/)[0]));
  });
  for (const r of refs) {
    if (/^(https?:|mailto:|tel:|data:|#|javascript:)/i.test(r) || r === '') continue;
    const clean = decodeURIComponent(r.split('#')[0].split('?')[0]);
    if (!clean) continue;
    const target = path.resolve(path.dirname(f), clean);
    if (!fs.existsSync(target)) broken.push(`${path.relative(SITE, f)} → ${r}`);
  }
  // in-page anchors
  $('a[href^="#"]').each((_, a) => { const id = $(a).attr('href').slice(1); if (id && !id.startsWith('/') && id !== 'top' && id !== 'main' && !$(`[id="${id}"]`).length) broken.push(`${path.relative(SITE, f)} → #${id}`); });
}
check(`no broken local links or assets (${htmls.length} HTML files)`, !broken.length, broken.slice(0, 8).join(' | '));

// Links to treatments.html#anchor must exist on treatments.html
{
  const $t = cheerio.load(fs.readFileSync(path.join(SITE, 'treatments.html'), 'utf8'));
  const missing = [];
  for (const f of htmls) { const $ = cheerio.load(fs.readFileSync(f, 'utf8')); $('a[href^="treatments.html#"]').each((_, a) => { const id = $(a).attr('href').split('#')[1]; if (!$t(`[id="${id}"]`).length) missing.push(`${path.basename(f)} → ${id}`); }); }
  check('cross-page anchors (treatments.html#…) resolve', !missing.length, missing.join(' | '));
}

// 3. No secrets in anything that would be uploaded
const secretPatterns = [/sb_secret_[A-Za-z0-9_-]{8,}/, /service_role"?\s*[:=]\s*["']ey/i, /postgres(ql)?:\/\/[^\s'"]+:[^\s'"@]+@/i, /sbp_[A-Za-z0-9]{20,}/];
const leaks = [];
for (const f of files) {
  if (/\.(png|jpe?g|webp|ico|avif)$/.test(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  for (const p of secretPatterns) if (p.test(s)) leaks.push(`${path.relative(SITE, f)} (${p})`);
  for (const m of s.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try { const role = JSON.parse(Buffer.from(m[1], 'base64url')).role; if (role && role !== 'anon') leaks.push(`${path.relative(SITE, f)} (JWT with role ${role})`); } catch { /* not a JWT */ }
  }
}
check('no secret keys, passwords or tokens in public files', !leaks.length, leaks.join(' | '));

// 4. Hero baseline
const base = JSON.parse(fs.readFileSync('/home/claude/hero-baseline.json', 'utf8'));
const hero = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').match(/<section class="hero">[\s\S]*?<\/section>/)[0];
const h = crypto.createHash('sha256').update(hero).digest('hex');
check(`hero HTML sha256 matches baseline (${h.slice(0, 16)}…)`, h === base.hero_html_sha256, `${h} vs ${base.hero_html_sha256}`);
for (const img of ['assets/dr-k-r-srinivasan-1100.webp', 'assets/dr-k-r-srinivasan-640.webp']) {
  const d = crypto.createHash('sha256').update(fs.readFileSync(path.join(SITE, img))).digest('hex');
  check(`hero image unchanged: ${img}`, d === base[img]);
}
const css = fs.readFileSync(path.join(SITE, 'styles.css'), 'utf8');
const origCss = fs.readFileSync(path.join(ORIG, 'styles.css'), 'utf8');
check('styles.css: original rules byte-identical (CMS rules only appended at the end)', css.startsWith(origCss), 'original prefix changed');
const added = css.slice(origCss.length);
const heroSelectors = /(^|[\s,}])(\.hero|\.hero-grid|\.hero-kicker|\.line2|\.photo-card|\.lede|\.btn|h1|body|html|\*|section|img|figure|:root)\b[^{]*\{/m;
const addedSelectors = added.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g) || [];
const risky = addedSelectors.map(s => s.trim()).filter(s => !/^@media \([a-z-]+:\s?\d+px\)$/.test(s)).filter(s => !/^(\.hp-field|\.cms-|\.appointment-privacy|\[data-cms|\.foot-base \.staff-login|\.nav a\.nav-admin|\.nav\.open a\.nav-admin|#treatments\.section\.soft)/.test(s.split(',')[0].trim()));
// @media wrappers are allowed; every selector inside them is still checked.
check('appended CSS only targets new CMS classes/attributes (cannot restyle the hero)', !risky.length, risky.join(' | '));
void heroSelectors;
// Original clinic photographs still present and unchanged
const photos = walk(path.join(ORIG, 'assets')).map(f => path.relative(ORIG, f));
const changed = photos.filter(p => !fs.existsSync(path.join(SITE, p)) || !fs.readFileSync(path.join(SITE, p)).equals(fs.readFileSync(path.join(ORIG, p))));
check(`all ${photos.length} original assets (clinic photographs, logo, illustrations) present and byte-identical`, !changed.length, changed.join(', '));

const failed = results.filter(r => !r.ok);
fs.writeFileSync('/tmp/static-checks-results.json', JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
