// TEST HARNESS ONLY: a tiny stand-in for the Supabase API gateway.
//   /rest/v1/*    -> real PostgREST
//   /auth/v1/*    -> real GoTrue (Supabase Auth)
//   /storage/v1/* -> minimal storage emulator that writes storage.objects rows
//                    *as the calling user*, so the real RLS policies are enforced.
// Also serves the website on a separate port (different origin, like production).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const SECRET = process.env.JWT_SECRET;
const SITE_DIR = process.env.SITE_DIR;
const STORE = process.env.STORE_DIR || '/tmp/sddc-storage';
fs.mkdirSync(STORE, { recursive: true });
const b64u = b => Buffer.from(b).toString('base64url');
export const sign = payload => { const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })); const body = b64u(JSON.stringify(payload)); return `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`; };
const verify = t => { try { const [h, b, s] = t.split('.'); if (crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url') !== s) return null; const p = JSON.parse(Buffer.from(b, 'base64url')); if (p.exp && p.exp < Date.now() / 1000) return null; return p; } catch { return null; } };
const ANON = sign({ iss: 'supabase', role: 'anon', iat: 1700000000, exp: 2100000000 });
fs.writeFileSync('/tmp/sddc-anon-key', ANON);
const pool = new pg.Pool({ connectionString: 'postgres://postgres@127.0.0.1:54322/postgres' });

const cors = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile,x-upsert,cache-control,x-supabase-api-version');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD');
  res.setHeader('Access-Control-Expose-Headers', 'content-range,content-length,x-total-count');
};
const body = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

function proxy(req, res, port, strip, buf) {
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  // Like Supabase's gateway: a publishable key (or no token) means the anonymous role.
  const bearer = (headers.authorization || '').replace(/^Bearer /, '');
  if (!bearer || /^sb_publishable_/.test(bearer) || bearer === headers.apikey) headers.authorization = `Bearer ${ANON}`;
  headers['x-forwarded-for'] = req.headers['x-test-ip'] || req.socket.remoteAddress;
  delete headers['content-length'];
  const p = http.request({ host: '127.0.0.1', port, path: req.url.replace(strip, '') || '/', method: req.method, headers: { ...headers, 'content-length': buf.length } }, r => {
    const h = { ...r.headers }; delete h['access-control-allow-origin'];
    res.writeHead(r.statusCode, h); r.pipe(res);
  });
  p.on('error', e => json(res, 502, { message: e.message }));
  p.end(buf);
}

async function asUser(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${claims.role === 'authenticated' ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}

async function storage(req, res, buf) {
  const url = new URL(req.url, 'http://x');
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');  // sb_publishable_ keys fail verify() -> anonymous
  const claims = verify(token) || { role: 'anon' };
  let m;
  if (req.method === 'GET' && (m = url.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/))) {
    const b = (await pool.query('select public from storage.buckets where id=$1', [m[1]])).rows[0];
    const file = path.join(STORE, m[1], m[2]);
    if (!b?.public || !file.startsWith(path.join(STORE, m[1])) || !fs.existsSync(file)) return json(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    const meta = (await pool.query('select metadata from storage.objects where bucket_id=$1 and name=$2', [m[1], m[2]])).rows[0];
    res.writeHead(200, { 'content-type': meta?.metadata?.mimetype || 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }
  if (req.method === 'POST' && (m = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/)) && m[1] !== 'list') {
    const [_, bucket, name] = m;
    const b = (await pool.query('select * from storage.buckets where id=$1', [bucket])).rows[0];
    if (!b) return json(res, 400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    const mime = (req.headers['content-type'] || '').split(';')[0];
    if (b.allowed_mime_types && !b.allowed_mime_types.includes(mime)) return json(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${mime} is not supported` });
    if (b.file_size_limit && buf.length > b.file_size_limit) return json(res, 400, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    try {
      const row = await asUser(claims, c => c.query('insert into storage.objects (bucket_id, name, owner, metadata) values ($1,$2,$3,$4) returning id', [bucket, name, claims.sub || null, { mimetype: mime, size: buf.length }]));
      const file = path.join(STORE, bucket, name);
      if (!file.startsWith(path.join(STORE, bucket) + '/')) throw new Error('bad path');
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf);
      return json(res, 200, { Key: `${bucket}/${name}`, Id: row.rows[0].id });
    } catch (e) { return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: /row-level/.test(e.message) ? 'new row violates row-level security policy' : e.message }); }
  }
  if (req.method === 'DELETE' && (m = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)$/))) {
    const names = JSON.parse(buf.toString() || '{}').prefixes || [];
    try {
      const r = await asUser(claims, c => c.query('delete from storage.objects where bucket_id=$1 and name = any($2) returning name', [m[1], names]));
      for (const row of r.rows) { const f = path.join(STORE, m[1], row.name); if (f.startsWith(path.join(STORE, m[1]) + '/')) fs.rmSync(f, { force: true }); }
      return json(res, 200, r.rows.map(x => ({ name: x.name })));
    } catch (e) { return json(res, 400, { statusCode: '403', message: e.message }); }
  }
  return json(res, 404, { message: 'not emulated' });
}

http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const buf = await body(req);
  if (req.url.startsWith('/rest/v1')) return proxy(req, res, 3000, /^\/rest\/v1/, buf);
  if (req.url.startsWith('/auth/v1')) return proxy(req, res, 9999, /^\/auth\/v1/, buf);
  if (req.url.startsWith('/storage/v1')) return storage(req, res, buf).catch(e => json(res, 500, { message: e.message }));
  json(res, 404, { message: 'not found' });
}).listen(8000, '127.0.0.1');

// Static website server (separate origin). Points the site at this local gateway.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE_DIR, p);
  if (!file.startsWith(SITE_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  let data = fs.readFileSync(file);
  const ext = path.extname(file);
  // The site is served exactly as built by tools/configure.mjs (no rewriting).
  res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(data);
}).listen(Number(process.env.SITE_PORT || 8080), '127.0.0.1');
console.log('gateway :8000, site :' + (process.env.SITE_PORT || 8080));
