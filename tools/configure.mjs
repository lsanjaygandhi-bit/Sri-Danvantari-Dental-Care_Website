#!/usr/bin/env node
// Writes the public Supabase settings into the website (the "build" step).
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<publishable or anon key> node tools/configure.mjs
//   (or put both in a .env file next to this project's README and run: node tools/configure.mjs)
//
// Options: --site <dir>  website folder to configure (default: Sri_Danvantari_Dental_Care)
//          --out <dir>   write a configured copy there instead of changing --site in place
//          --check       only validate the values, write nothing
// Refuses secret keys. Updates js/site-config.js and the Admin Dashboard's Content-Security-Policy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const fail = m => { console.error('✘ ' + m); process.exit(1); };

// .env support (simple KEY=value lines)
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
if (!url || !key) fail('Set SUPABASE_URL and SUPABASE_ANON_KEY (see .env.example).');

let u;
try { u = new URL(url); } catch { fail('SUPABASE_URL is not a valid URL.'); }
const local = ['127.0.0.1', 'localhost'].includes(u.hostname);
if (!local && u.protocol !== 'https:') fail('SUPABASE_URL must start with https://');
if (!local && !/^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname)) console.warn(`! ${u.hostname} is not a standard <project-ref>.supabase.co address. Continuing (custom domain?).`);
if (u.pathname !== '/' && u.pathname !== '') fail('SUPABASE_URL must be the project root, e.g. https://<ref>.supabase.co');

// Refuse anything that is not a public client key.
if (/^sb_secret_/.test(key)) fail('That is a SECRET key. Use the publishable key (sb_publishable_...) or the anon key.');
if (/^sb_/.test(key) && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) fail('Unrecognised key format. Use the publishable key (sb_publishable_...) or the anon key.');
if (/^eyJ/.test(key)) {
  let payload;
  try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { fail('The anon key is not a valid JWT.'); }
  if (payload.role !== 'anon') fail(`This key has role "${payload.role}". Only the anon (public) key may be used in the website. NEVER publish a service_role key.`);
  const ref = u.hostname.split('.')[0];
  if (!local && payload.ref && payload.ref !== ref) fail(`The anon key belongs to project "${payload.ref}" but SUPABASE_URL points to "${ref}".`);
} else if (!/^sb_publishable_/.test(key)) fail('Unrecognised key format.');

const project = u.hostname.split('.')[0];
console.log(`✔ Project: ${u.origin}  (ref ${project})`);
console.log(`✔ Key type: ${/^sb_publishable_/.test(key) ? 'publishable' : 'anon (legacy JWT)'} — public key, safe for the browser`);
if (args.includes('--check')) process.exit(0);

const site = path.resolve(opt('--site') || path.join(root, 'Sri_Danvantari_Dental_Care'));
let target = site;
if (opt('--out')) {
  target = path.resolve(opt('--out'));
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(site, target, { recursive: true, filter: s => !/[\\/](supabase|node_modules)([\\/]|$)/.test(s.slice(site.length)) });
}
const cfgPath = path.join(target, 'js', 'site-config.js');
let cfg = fs.readFileSync(cfgPath, 'utf8');
cfg = cfg.replace(/supabaseUrl:\s*'[^']*'/, `supabaseUrl: '${u.origin}'`).replace(/supabaseKey:\s*'[^']*'/, `supabaseKey: '${key}'`);
if (!cfg.includes(u.origin) || !cfg.includes(key)) fail('Could not update js/site-config.js (unexpected format).');
fs.writeFileSync(cfgPath, cfg);

const adminPath = path.join(target, 'admin', 'index.html');
let admin = fs.readFileSync(adminPath, 'utf8');
admin = admin.replace(/(img-src 'self' data: blob: )\S+(;)/, `$1${u.origin}$2`).replace(/(connect-src 'self' )\S+(;)/, `$1${u.origin}$2`);
if ((admin.match(new RegExp(u.origin.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'g')) || []).length !== 2) fail('Could not update the Admin Dashboard Content-Security-Policy.');
fs.writeFileSync(adminPath, admin);
console.log(`✔ Configured ${path.relative(process.cwd(), target) || '.'}: js/site-config.js and admin/index.html (CSP)`);
