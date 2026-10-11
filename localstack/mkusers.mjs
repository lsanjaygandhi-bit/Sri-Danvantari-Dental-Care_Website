// Create local test logins through the real GoTrue admin API (test harness only).
import crypto from 'node:crypto';
const SECRET = process.env.JWT_SECRET;
const b64u = b => Buffer.from(b).toString('base64url');
const sign = p => { const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })); const b = b64u(JSON.stringify(p)); return `${h}.${b}.${crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url')}`; };
const SERVICE = sign({ role: 'service_role', iss: 'supabase', iat: 1700000000, exp: 2100000000 });
for (const email of ['owner@test.local', 'editor@test.local', 'desk@test.local', 'nobody@test.local', 'second@test.local']) {
  const r = await fetch('http://127.0.0.1:9999/admin/users', { method: 'POST', headers: { Authorization: 'Bearer ' + SERVICE, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Test-pass-2026', email_confirm: true }) });
  console.log(email, r.status);
}
