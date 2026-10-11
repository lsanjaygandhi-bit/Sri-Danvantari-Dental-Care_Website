// Admin Dashboard bootstrap: authentication, session safety, routing.
import { $, $$, h, toast, friendlyError } from './ui.js';
import { ctx, BASE, ROLE_LABEL, can, leaveOk, q } from './core.js';

const CFG = window.SDDC_CONFIG || {};
const IDLE_LIMIT_MS = 30 * 60 * 1000;          // sign out after 30 minutes without activity
const MAX_SESSION_MS = 12 * 60 * 60 * 1000;    // and always after 12 hours
const LOGIN_AT_KEY = 'sddc-admin-login-at';
const ACTIVE_KEY = 'sddc-admin-active-at';
const FAIL_KEY = 'sddc-admin-login-fails';

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: k => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

if (!BASE || !CFG.supabaseKey || !window.supabase) {
  // The sign-in form needs the clinic's Supabase project. Until it is connected, explain what to do
  // (there is deliberately no way to sign in without it).
  $('#boot').replaceChildren(h('div', { class: 'auth-card' },
    h('div', { class: 'auth-brand' }, h('img', { src: '../assets/sri-danvantari-tooth-logo.webp', alt: '', width: 56, height: 47 }), h('div', {}, h('strong', { text: 'Sri Danvantari Dental Care' }), h('span', { text: 'Admin Login' }))),
    h('h1', { text: 'Admin Login is not connected yet' }),
    h('p', { class: 'muted', text: 'This is the correct Admin Login page, but the website has not been connected to the clinic\'s Supabase project yet, so sign-in is not available.' }),
    h('p', { class: 'muted', text: 'To connect it: fill in .env (from .env.example) with the Supabase Project URL and publishable key, run "node tools/configure.mjs", run the database migrations and create the first Super Admin. See ADMIN_CMS_GUIDE.md.' }),
    h('p', {}, h('a', { href: '../index.html', text: '← Back to website' }))));
  $('#boot').classList.add('auth');
  throw new Error('missing config');
}

ctx.sb = window.supabase.createClient(BASE, CFG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ------------------------------------------------------------ routing ----
const NAV = [
  { group: 'Dashboard', items: [['overview', 'Overview', () => true]] },
  { group: 'Patients', items: [['appointments', 'Appointments', can.appointments]] },
  { group: 'Website content', items: [
    ['pages', 'Pages & sections', can.editContent], ['doctors', 'Doctors & staff', can.editContent],
    ['treatments', 'Treatments', can.editContent], ['categories', 'Treatment categories', can.editContent],
    ['testimonials', 'Testimonials', can.editContent], ['gallery', 'Gallery', can.editContent],
    ['faqs', 'FAQs', can.editContent], ['media', 'Media library', can.editContent]] },
  { group: 'Site', items: [
    ['navigation', 'Navigation & footer', can.superAdmin], ['seo', 'SEO', can.editContent],
    ['settings', 'Website settings', can.superAdmin]] },
  { group: 'Administration', items: [['users', 'Admin users', can.superAdmin], ['audit', 'Audit log', can.superAdmin], ['account', 'My account', () => true]] },
];
const MODULES = {
  overview: () => import('./modules/overview.js'),
  appointments: () => import('./modules/appointments.js'),
  pages: () => import('./modules/pages.js'),
  doctors: () => import('./modules/collections.js'),
  treatments: () => import('./modules/collections.js'),
  categories: () => import('./modules/collections.js'),
  testimonials: () => import('./modules/collections.js'),
  gallery: () => import('./modules/collections.js'),
  faqs: () => import('./modules/collections.js'),
  media: () => import('./modules/media.js'),
  navigation: () => import('./modules/navigation.js'),
  seo: () => import('./modules/seo.js'),
  settings: () => import('./modules/settings.js'),
  users: () => import('./modules/users.js'),
  audit: () => import('./modules/audit.js'),
  account: () => import('./modules/account.js'),
};

function buildSidebar(current) {
  const side = $('#sidebar');
  side.replaceChildren(...NAV.flatMap(g => {
    const items = g.items.filter(([, , allowed]) => allowed());
    if (!items.length) return [];
    return [h('h4', { text: g.group }), ...items.map(([id, label]) => h('a', { href: '#/' + id, 'aria-current': id === current ? 'page' : null, dataset: { nav: id } }, h('span', { text: label })))];
  }));
}

let lastHash = '';
let leaving = false;
let unloading = false;
window.addEventListener('pagehide', () => { unloading = true; });
let rendering = 0;
async function route() {
  if (!ctx.me) return;
  const hash = location.hash || '#/overview';
  if (hash !== lastHash && lastHash && ctx.dirty) {
    // Only one "leave without saving?" prompt at a time (e.g. Back pressed while it is open).
    if (leaving) { history.replaceState(null, '', lastHash); return; }
    leaving = true;
    const ok = await leaveOk();
    leaving = false;
    if (!ok) { history.replaceState(null, '', lastHash); return; }
  }
  lastHash = hash;
  const [path, qs] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').map(decodeURIComponent);
  const query = new URLSearchParams(qs || '');
  const name = MODULES[parts[0]] ? parts[0] : 'overview';
  buildSidebar(name);
  $('#sidebar').classList.remove('open');
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
  const content = $('#content');
  const token = ++rendering;
  // Each navigation renders into its own view. If an earlier, slower page finishes
  // loading after the user has moved on, it only writes into its detached view.
  const view = h('div', { class: 'view' }, h('p', { class: 'muted', text: 'Loading…' }));
  content.replaceChildren(view);
  try {
    const mod = await MODULES[name]();
    if (token !== rendering) return;
    ctx.dirty = false;
    await mod.render(view, parts.slice(1), name, query);
    if (token !== rendering) return;
    content.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    refreshBadges();
  } catch (e) {
    if (unloading) return;  // requests cut off by a reload/sign-out are not errors
    console.error('[admin] could not load', hash, e);
    if (token === rendering) view.replaceChildren(h('div', { class: 'banner bad', text: 'Could not load this section: ' + friendlyError(e) }));
  }
}
window.addEventListener('hashchange', route);

async function refreshBadges() {
  if (!can.appointments()) return;
  try {
    const { count } = await ctx.sb.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'new');
    const link = $('[data-nav="appointments"]');
    if (link) { $('.count', link)?.remove(); if (count) link.append(h('span', { class: 'count', text: String(count), 'aria-label': `${count} new` })); }
  } catch { /* badge is optional */ }
}

// --------------------------------------------------------- session ------
let idleTimer = null;
function markActive() { store.set(ACTIVE_KEY, String(Date.now())); }
function startSessionGuards() {
  markActive();
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, throttle(markActive, 15000), { passive: true }));
  clearInterval(idleTimer);
  idleTimer = setInterval(checkSessionAge, 30000);
}
function throttle(fn, ms) { let last = 0; return () => { const n = Date.now(); if (n - last > ms) { last = n; fn(); } }; }
async function checkSessionAge() {
  const loginAt = Number(store.get(LOGIN_AT_KEY) || 0);
  const activeAt = Number(store.get(ACTIVE_KEY) || Date.now());
  if (!loginAt || Date.now() - loginAt > MAX_SESSION_MS) return signOut('Your session reached its 12-hour limit. Please sign in again.');
  if (Date.now() - activeAt > IDLE_LIMIT_MS) return signOut('You were signed out after 30 minutes of inactivity.');
}

async function signOut(message) {
  clearInterval(idleTimer);
  ctx.me = null; ctx.dirty = false;
  store.del(LOGIN_AT_KEY);
  try { await ctx.sb.auth.signOut(); } catch { /* already signed out */ }
  showAuth('login');
  if (message) setMsg('#login-msg', message, 'err');
}

// ----------------------------------------------------------- views ------
function setMsg(sel, text, kind = '') { const m = $(sel); m.textContent = text; m.className = 'form-msg ' + kind; }
function showAuth(which) {
  $('#boot').hidden = true; $('#app-view').hidden = true; $('#auth-view').hidden = false;
  $('#login-form').hidden = which !== 'login';
  $('#forgot-form').hidden = which !== 'forgot';
  $('#recovery-form').hidden = which !== 'recovery';
  setMsg('#login-msg', ''); setMsg('#forgot-msg', ''); setMsg('#recovery-msg', '');
  const first = $(`#${which === 'login' ? 'login-email' : which === 'forgot' ? 'forgot-email' : 'recovery-pass'}`);
  setTimeout(() => first?.focus(), 30);
}

async function enterApp() {
  let me = null;
  try { me = await q(ctx.sb.rpc('admin_me')); } catch (e) { return signOut(friendlyError(e)); }
  if (!me) return signOut('This account does not have access to the Admin Dashboard. Ask a Super Admin to grant access.');
  ctx.me = me;
  if (!store.get(LOGIN_AT_KEY)) store.set(LOGIN_AT_KEY, String(Date.now()));
  await checkSessionAge();
  if (!ctx.me) return;
  $('#who').replaceChildren(h('b', { text: me.display_name || me.email }), ROLE_LABEL[me.role] || me.role);
  $('#boot').hidden = true; $('#auth-view').hidden = true; $('#app-view').hidden = false;
  startSessionGuards();
  lastHash = '';
  route();
}

// Login form (with a short client-side lockout; Supabase Auth also rate-limits server-side).
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  if (!email || !password) return setMsg('#login-msg', 'Enter your email and password.', 'err');
  const fails = JSON.parse(store.get(FAIL_KEY) || '{"n":0,"t":0}');
  if (fails.n >= 5 && Date.now() - fails.t < 60000) return setMsg('#login-msg', 'Too many attempts. Please wait a minute and try again.', 'err');
  const btn = $('#login-form [type=submit]'); btn.disabled = true; btn.textContent = 'Signing in…';
  const { error } = await ctx.sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Sign in';
  if (error) {
    store.set(FAIL_KEY, JSON.stringify({ n: (Date.now() - fails.t < 600000 ? fails.n : 0) + 1, t: Date.now() }));
    return setMsg('#login-msg', /rate|too many/i.test(error.message) ? 'Too many attempts. Please wait and try again.' : 'Email or password is incorrect.', 'err');
  }
  store.del(FAIL_KEY);
  $('#login-password').value = '';
  store.set(LOGIN_AT_KEY, String(Date.now()));
  try { await ctx.sb.rpc('admin_record_login'); } catch { /* audit is best-effort here */ }
  enterApp();
});

$('#forgot-btn').addEventListener('click', () => { $('#forgot-email').value = $('#login-email').value; showAuth('forgot'); });
$('#back-login').addEventListener('click', () => showAuth('login'));
$('#forgot-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#forgot-email').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setMsg('#forgot-msg', 'Enter a valid email address.', 'err');
  const redirectTo = location.origin + location.pathname;
  const { error } = await ctx.sb.auth.resetPasswordForEmail(email, { redirectTo });
  // Same message either way, so the form does not reveal which emails exist.
  setMsg('#forgot-msg', error && /rate/i.test(error.message) ? 'Too many requests. Please wait a few minutes.' : 'If this email belongs to an admin account, a reset link has been sent. Check your inbox.', error && /rate/i.test(error.message) ? 'err' : 'ok');
});

let recovering = false;
$('#recovery-form').addEventListener('submit', async e => {
  e.preventDefault();
  const p1 = $('#recovery-pass').value, p2 = $('#recovery-pass2').value;
  const problem = passwordProblem(p1);
  if (problem) return setMsg('#recovery-msg', problem, 'err');
  if (p1 !== p2) return setMsg('#recovery-msg', 'The two passwords do not match.', 'err');
  const { error } = await ctx.sb.auth.updateUser({ password: p1 });
  if (error) return setMsg('#recovery-msg', friendlyError(error), 'err');
  recovering = false;
  history.replaceState(null, '', location.pathname);
  await ctx.sb.auth.signOut({ scope: 'global' });
  showAuth('login');
  setMsg('#login-msg', 'Password updated. Sign in with your new password.', 'ok');
});

export function passwordProblem(p) {
  if (!p || p.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Include at least one letter and one number.';
  if (/^(.)\1+$/.test(p)) return 'Choose a less predictable password.';
  return '';
}

$('#logout-btn').addEventListener('click', async () => { if (await leaveOk()) signOut('You have signed out.'); });
$('#menu-toggle').addEventListener('click', () => {
  const open = $('#sidebar').classList.toggle('open');
  $('#menu-toggle').setAttribute('aria-expanded', String(open));
});

ctx.sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') { recovering = true; showAuth('recovery'); return; }
  if (event === 'SIGNED_OUT' && ctx.me) { ctx.me = null; showAuth('login'); setMsg('#login-msg', 'You have been signed out.', ''); }
  if (event === 'TOKEN_REFRESHED' && !session) signOut('Your session has expired. Please sign in again.');
});

// Sign-out in another tab signs this tab out too.
window.addEventListener('storage', e => { if (e.key === LOGIN_AT_KEY && !e.newValue && ctx.me) signOut('You signed out in another tab.'); });

(async () => {
  // A password-recovery link puts "type=recovery" in the URL hash.
  if (/type=recovery/.test(location.hash)) { recovering = true; }
  const { data } = await ctx.sb.auth.getSession();
  if (recovering) { showAuth('recovery'); return; }
  if (data.session) enterApp(); else showAuth('login');
})();
