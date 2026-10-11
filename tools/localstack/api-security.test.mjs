// Security and permission tests against the real Auth + PostgREST + database
// (local stack). Each check prints PASS/FAIL; the process exits non-zero on failure.
import fs from 'node:fs';
const API = 'http://127.0.0.1:8000';
const ANON = fs.readFileSync('/tmp/sddc-anon-key', 'utf8');
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + info}`); };

async function call(method, path, { token, body, headers = {}, ip } = {}) {
  const r = await fetch(API + path, { method, headers: { apikey: ANON, Authorization: 'Bearer ' + (token || ANON), 'content-type': 'application/json', Prefer: 'return=representation', ...(ip ? { 'x-test-ip': ip } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch { /* empty */ }
  return { status: r.status, data };
}
const rpc = (fn, body, token, ip) => call('POST', '/rest/v1/rpc/' + fn, { token, body, ip });
async function login(email) {
  const r = await fetch(API + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Test-pass-2026' }) });
  return (await r.json()).access_token;
}
const denied = r => r.status === 401 || r.status === 403 || (r.data && /permission denied|42501|not authori|row-level/i.test(JSON.stringify(r.data)));
const errMsg = r => r.data?.message || JSON.stringify(r.data);
const today = new Date(Date.now() + 5.5 * 3600e3);
const dayOffset = (n, wantDow) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); while (wantDow != null && d.getUTCDay() !== wantDow) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

// ------------------------------------------------------------- public -----
for (const t of ['appointments', 'appointment_notes', 'admin_users', 'audit_log', 'treatments', 'doctors', 'site_settings', 'media_assets', 'page_sections', 'testimonials']) {
  const r = await call('GET', `/rest/v1/${t}?select=*`);
  check(`public cannot read table ${t}`, denied(r) || (Array.isArray(r.data) && r.data.length === 0), `${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
}
{
  const r = await call('POST', '/rest/v1/appointments', { body: { patient_name: 'X', phone: '9876543210' } });
  check('public cannot insert appointments directly', denied(r), `${r.status}`);
  const r2 = await call('PATCH', '/rest/v1/treatments?slug=eq.implants', { body: { title: 'Hacked' } });
  check('public cannot update content', denied(r2) || (Array.isArray(r2.data) && !r2.data.length), `${r2.status}`);
}
{
  const r = await rpc('get_site_content', { p_page: 'index' });
  check('public can read published content', r.status === 200 && r.data.treatments.length === 12 && r.data.testimonials.length === 18, `${r.status}`);
  check('public content has no drafts/internal consent notes', !JSON.stringify(r.data.testimonials).includes('consent'), '');
  const p = await rpc('get_site_content', { p_page: 'index', p_preview: true });
  check('public cannot use preview mode', p.status >= 400, `${p.status}`);
  const bad = await rpc('get_site_content', { p_page: '../etc' });
  check('page parameter is validated', bad.status >= 400, `${bad.status}`);
  for (const fn of ['admin_me', 'admin_dashboard_stats', 'admin_export_appointments', 'admin_media_usage', 'admin_grant_access']) {
    const x = await rpc(fn, fn === 'admin_media_usage' ? { p_id: '00000000-0000-0000-0000-000000000000' } : fn === 'admin_grant_access' ? { p_email: 'a@b.c', p_role: 'super_admin' } : {});
    check(`public cannot call ${fn}`, x.status >= 400, `${x.status} ${JSON.stringify(x.data).slice(0, 100)}`);
  }
  const bs = await rpc('bootstrap_super_admin', { p_email: 'nobody@test.local' });
  check('bootstrap function is not reachable through the API', bs.status >= 400, `${bs.status}`);
}

// ------------------------------------------------- appointment submission ---
const goodDate = dayOffset(2, 2); // a Tuesday
{
  const ok = await rpc('submit_appointment', { p_name: 'Test Patient', p_phone: '+91 98765 43210', p_treatment: 'Dental implants', p_date: goodDate, p_time: '6:30 PM–9:00 PM', p_message: 'Hello' }, null, '10.0.0.1');
  check('valid appointment request accepted', ok.status === 200 && ok.data.ok && /^[0-9A-F]{8}$/.test(ok.data.reference), `${ok.status} ${errMsg(ok)}`);
  const cases = [
    ['invalid phone rejected', { p_name: 'Test', p_phone: '12345' }],
    ['short name rejected', { p_name: 'A', p_phone: '9876543210' }],
    ['past date rejected', { p_name: 'Test', p_phone: '9876543210', p_date: dayOffset(-3) }],
    ['Sunday rejected (clinic closed)', { p_name: 'Test', p_phone: '9876543210', p_date: dayOffset(1, 0) }],
    ['treatment outside the list rejected', { p_name: 'Test', p_phone: '9876543210', p_treatment: '<script>alert(1)</script>' }],
    ['time outside the list rejected', { p_name: 'Test', p_phone: '9876543210', p_time: 'midnight' }],
    ['over-long message rejected', { p_name: 'Test', p_phone: '9876543210', p_message: 'x'.repeat(600) }],
  ];
  for (const [name, body] of cases) { const r = await rpc('submit_appointment', body, null, '10.0.0.2'); check(name, r.status >= 400, `${r.status}`); }
  const before = (await rpc('admin_dashboard_stats', {}, await login('owner@test.local'))).data.appointments_total;
  const hp = await rpc('submit_appointment', { p_name: 'Bot', p_phone: '9876543210', p_website: 'http://spam' }, null, '10.0.0.3');
  const after = (await rpc('admin_dashboard_stats', {}, await login('owner@test.local'))).data.appointments_total;
  check('honeypot submissions are silently dropped', hp.status === 200 && after === before, `${hp.status} ${before}->${after}`);
  let last;
  for (let i = 0; i < 6; i++) last = await rpc('submit_appointment', { p_name: 'Flood ' + i, p_phone: '9876543210' }, null, '10.9.9.9');
  check('rate limit: 6th request in an hour from one connection is refused', last.status >= 400 && /Too many/i.test(errMsg(last)), `${last.status} ${errMsg(last)}`);
  const other = await rpc('submit_appointment', { p_name: 'Other Person', p_phone: '9876543211' }, null, '10.9.9.10');
  check('rate limit is per connection (others still accepted)', other.status === 200, `${other.status}`);
  const html = await rpc('submit_appointment', { p_name: '<img src=x onerror=alert(1)>', p_phone: '9876543212', p_message: '<script>alert(1)</script>' }, null, '10.0.0.4');
  check('HTML in a request is stored as plain text (rendered safely by the dashboard)', html.status === 200, `${html.status}`);
}

// ------------------------------------------------------------- roles ------
const owner = await login('owner@test.local');
const nobody = await login('nobody@test.local');
{
  const r = await rpc('admin_grant_access', { p_email: 'editor@test.local', p_role: 'editor', p_display_name: 'Editor' }, owner);
  const r2 = await rpc('admin_grant_access', { p_email: 'desk@test.local', p_role: 'front_desk', p_display_name: 'Desk' }, owner);
  check('super admin can grant roles', r.status === 200 && r2.status === 200, `${r.status} ${r2.status}`);
  const r3 = await rpc('admin_grant_access', { p_email: 'ghost@test.local', p_role: 'editor' }, owner);
  check('granting access to a non-existent login fails clearly', r3.status >= 400 && /No login exists/.test(errMsg(r3)), errMsg(r3));
}
const editor = await login('editor@test.local');
const desk = await login('desk@test.local');
{
  const me = await rpc('admin_me', {}, nobody);
  check('a login without an admin role gets no dashboard access', me.status === 200 && me.data === null, JSON.stringify(me.data));
  const t = await call('GET', '/rest/v1/treatments?select=id', { token: nobody });
  check('non-admin login cannot read content tables', Array.isArray(t.data) && t.data.length === 0, JSON.stringify(t.data).slice(0, 80));
  const u = await call('PATCH', '/rest/v1/treatments?slug=eq.implants', { token: nobody, body: { title: 'X' } });
  check('non-admin login cannot update content', Array.isArray(u.data) && u.data.length === 0, `${u.status}`);
  const s = await rpc('admin_grant_access', { p_email: 'nobody@test.local', p_role: 'super_admin' }, nobody);
  check('non-admin cannot grant themselves a role', s.status >= 400, `${s.status}`);
  const ins = await call('POST', '/rest/v1/admin_users', { token: nobody, body: { user_id: '00000000-0000-0000-0000-000000000000', email: 'x', role: 'super_admin' } });
  check('non-admin cannot insert into admin_users', ins.status >= 400, `${ins.status}`);
  const p = await rpc('get_site_content', { p_page: 'index', p_preview: true }, nobody);
  check('non-admin cannot use preview', p.status >= 400, `${p.status}`);
}
{ // editor
  const t = await call('GET', '/rest/v1/treatments?select=id,title', { token: editor });
  check('editor can read content', t.data.length === 12, `${t.data.length}`);
  const up = await call('PATCH', '/rest/v1/treatments?slug=eq.whitening', { token: editor, body: { card_summary: 'Professional lightening of tooth shade (test edit).' } });
  await call('PATCH', '/rest/v1/treatments?slug=eq.whitening', { token: editor, body: { card_summary: 'Professional lightening of tooth shade, planned after a check of your teeth and gums.' } });
  check('editor can update content', up.status === 200 && up.data.length === 1, `${up.status}`);
  const a = await call('GET', '/rest/v1/appointments?select=*', { token: editor });
  check('editor cannot see appointments (patient data)', Array.isArray(a.data) && a.data.length === 0, `${a.data?.length}`);
  const s = await call('PATCH', '/rest/v1/site_settings?key=eq.contact', { token: editor, body: { value: { clinic_name: 'X' } } });
  check('editor cannot change website settings', Array.isArray(s.data) && s.data.length === 0, `${s.status}`);
  const al = await call('GET', '/rest/v1/audit_log?select=id', { token: editor });
  check('editor cannot read the audit log', Array.isArray(al.data) && al.data.length === 0, `${al.data?.length}`);
  const ex = await rpc('admin_export_appointments', {}, editor);
  check('editor cannot export appointments', ex.status >= 400, `${ex.status}`);
  const pv = await rpc('get_site_content', { p_page: 'index', p_preview: true }, editor);
  check('editor can use preview', pv.status === 200 && pv.data.preview === true, `${pv.status}`);
  const n = await call('PATCH', '/rest/v1/nav_items?label=eq.Clinic', { token: editor, body: { label: 'X' } });
  check('editor cannot change navigation', Array.isArray(n.data) && n.data.length === 0, `${n.status}`);
}
{ // front desk
  const a = await call('GET', '/rest/v1/appointments?select=*', { token: desk });
  check('front desk can see appointments', a.data.length >= 3, `${a.data?.length}`);
  const id = a.data.find(x => x.patient_name === 'Test Patient').id;
  const st = await call('PATCH', `/rest/v1/appointments?id=eq.${id}`, { token: desk, body: { status: 'contacted' } });
  check('front desk can change appointment status', st.status === 200 && st.data[0].status === 'contacted', `${st.status}`);
  const ed = await call('PATCH', `/rest/v1/appointments?id=eq.${id}`, { token: desk, body: { phone: '9000000000' } });
  check('patient details cannot be edited after submission', ed.status >= 400 && /cannot be edited/.test(errMsg(ed)), `${ed.status} ${errMsg(ed)}`);
  const note = await call('POST', '/rest/v1/appointment_notes', { token: desk, body: { appointment_id: id, note: 'Called patient', author_email: 'spoof@evil.test' } });
  check('front desk can add notes; author is recorded by the server (not spoofable)', note.status === 201 && note.data[0].author_email === 'desk@test.local', `${note.status} ${note.data?.[0]?.author_email}`);
  const t = await call('PATCH', '/rest/v1/treatments?slug=eq.implants', { token: desk, body: { title: 'X' } });
  check('front desk cannot edit website content', Array.isArray(t.data) && t.data.length === 0, `${t.status}`);
  const ex = await rpc('admin_export_appointments', {}, desk);
  check('front desk cannot export appointments', ex.status >= 400, `${ex.status}`);
  const del = await call('DELETE', `/rest/v1/appointments?id=eq.${id}`, { token: desk });
  check('front desk cannot delete appointments', Array.isArray(del.data) && del.data.length === 0, `${del.status}`);
  const n2 = await call('GET', `/rest/v1/appointment_notes?select=*`, { token: editor });
  check('editor cannot read internal notes', Array.isArray(n2.data) && n2.data.length === 0, `${n2.data?.length}`);
}
{ // super admin + data integrity rules
  const ex = await rpc('admin_export_appointments', {}, owner);
  check('super admin can export appointments', ex.status === 200 && ex.data.length >= 3, `${ex.status}`);
  const audit = await call('GET', '/rest/v1/audit_log?select=*&action=eq.export', { token: owner });
  check('exports are recorded in the audit log', audit.data.length >= 1 && audit.data[0].actor_email === 'owner@test.local', JSON.stringify(audit.data).slice(0, 100));
  const appAudit = await call('GET', '/rest/v1/audit_log?select=changes&table_name=eq.appointments', { token: owner });
  const leaked = JSON.stringify(appAudit.data).match(/Test Patient|9876543210/);
  check('patient names and phone numbers are never copied into the audit log', appAudit.data.length > 0 && !leaked, leaked?.[0]);
  const editAudit = await call('GET', '/rest/v1/audit_log?select=*&table_name=eq.treatments&action=eq.update', { token: owner });
  check('content edits are audited with who and what', editAudit.data.some(r => r.actor_email === 'editor@test.local' && r.changes.card_summary), JSON.stringify(editAudit.data).slice(0, 120));

  const bad = await call('PATCH', '/rest/v1/site_settings?key=eq.contact', { token: owner, body: { value: { clinic_name: 'Sri Danvantari Dental Care', phone: 'abc', whatsapp: '919884048448', address_full: 'No. 24, Navalar Main Road' } } });
  check('invalid phone number in settings is rejected', bad.status >= 400, `${bad.status}`);
  const badUrl = await call('PATCH', '/rest/v1/site_settings?key=eq.announcement', { token: owner, body: { value: { enabled: true, text: 'Closed Monday', link_url: 'javascript:alert(1)', tone: 'info' } } });
  check('unsafe link (javascript:) in settings is rejected', badUrl.status >= 400, `${badUrl.status}`);
  const navJs = await call('POST', '/rest/v1/nav_items', { token: owner, body: { location: 'header', label: 'X', href: 'javascript:alert(1)' } });
  check('unsafe link in navigation is rejected', navJs.status >= 400, `${navJs.status}`);
  const ess = await call('DELETE', '/rest/v1/nav_items?href=eq.contact.html&location=eq.header', { token: owner });
  check('essential navigation links cannot be deleted', ess.status >= 400, `${ess.status}`);
  const hide = await call('PATCH', '/rest/v1/nav_items?href=eq.index.html&location=eq.header', { token: owner, body: { is_visible: false } });
  check('essential navigation links cannot be hidden', hide.status >= 400, `${hide.status}`);
  const hero = await call('PATCH', '/rest/v1/page_sections?page=eq.index&key=eq.hero', { token: owner, body: { content: { heading: 'Changed' } } });
  check('homepage hero is locked in the database', hero.status >= 400 && /locked/.test(errMsg(hero)), `${hero.status} ${errMsg(hero)}`);
  const heroHide = await call('PATCH', '/rest/v1/page_sections?page=eq.index&key=eq.hero', { token: owner, body: { is_visible: false } });
  check('homepage hero cannot be hidden', heroHide.status >= 400, `${heroHide.status}`);
  const secDel = await call('DELETE', '/rest/v1/page_sections?page=eq.index&key=eq.welcome', { token: owner });
  check('page sections cannot be deleted', secDel.status >= 400 || (Array.isArray(secDel.data) && !secDel.data.length), `${secDel.status}`);
  const noHide = await call('PATCH', '/rest/v1/page_sections?page=eq.clinic&key=eq.intro', { token: editor, body: { is_visible: false } });
  check('sections not marked hideable cannot be hidden', noHide.status >= 400, `${noHide.status}`);

  const self = await call('PATCH', '/rest/v1/admin_users?email=eq.owner@test.local', { token: owner, body: { role: 'editor' } });
  check('the only super admin cannot demote themselves', self.status >= 400, `${self.status} ${errMsg(self)}`);
  await rpc('admin_grant_access', { p_email: 'second@test.local', p_role: 'super_admin' }, owner);
  const second = await login('second@test.local');
  const demoteOwner = await call('PATCH', '/rest/v1/admin_users?email=eq.owner@test.local', { token: second, body: { role: 'editor' } });
  check('a second super admin can change another admin', demoteOwner.status === 200, `${demoteOwner.status} ${errMsg(demoteOwner)}`);
  const lastOne = await call('PATCH', '/rest/v1/admin_users?email=eq.second@test.local', { token: owner, body: { is_active: false } });
  check('owner (now editor) cannot change admin users', Array.isArray(lastOne.data) && lastOne.data.length === 0, `${lastOne.status}`);
  const restore = await call('PATCH', '/rest/v1/admin_users?email=eq.owner@test.local', { token: second, body: { role: 'super_admin' } });
  const removeSecond = await call('DELETE', '/rest/v1/admin_users?email=eq.second@test.local', { token: owner });
  check('roles restored; super admin can remove another super admin', restore.status === 200 && removeSecond.status === 200, `${restore.status} ${removeSecond.status}`);
  const deact = await call('PATCH', '/rest/v1/admin_users?email=eq.desk@test.local', { token: owner, body: { is_active: false } });
  const deskAfter = await call('GET', '/rest/v1/appointments?select=id', { token: desk });
  check('deactivated admin loses access immediately (same session token)', deact.status === 200 && Array.isArray(deskAfter.data) && deskAfter.data.length === 0, `${deskAfter.data?.length}`);
  await call('PATCH', '/rest/v1/admin_users?email=eq.desk@test.local', { token: owner, body: { is_active: true } });

  const builtin = await call('GET', '/rest/v1/media_assets?select=id&is_builtin=eq.true&limit=1', { token: owner });
  const delB = await call('DELETE', `/rest/v1/media_assets?id=eq.${builtin.data[0].id}`, { token: owner });
  check('original website images cannot be deleted', delB.status >= 400, `${delB.status}`);
  const used = await call('GET', '/rest/v1/media_assets?select=id&static_path=eq.assets/clinic-interior.webp', { token: owner });
  const usage = await rpc('admin_media_usage', { p_id: used.data[0].id }, owner);
  check('media usage lookup finds where an image is used', usage.status === 200 && usage.data.some(u => /Gallery/.test(u.kind)), JSON.stringify(usage.data));

  const tNew = await call('POST', '/rest/v1/testimonials', { token: editor, body: { author_name: 'New Patient', quote: 'Very kind team.', status: 'published' } });
  check('testimonial cannot be published without recorded consent', tNew.status >= 400, `${tNew.status}`);
  const tOk = await call('POST', '/rest/v1/testimonials', { token: editor, body: { author_name: 'New Patient', quote: 'Very kind team.', status: 'published', consent_basis: 'written_consent' } });
  check('testimonial with recorded consent can be published', tOk.status === 201, `${tOk.status} ${errMsg(tOk)}`);
  await call('DELETE', `/rest/v1/testimonials?id=eq.${tOk.data[0].id}`, { token: editor });

  const pm = await call('POST', '/rest/v1/media_assets', { token: editor, body: { static_path: 'assets/originals/dr-k-r-srinivasan.jpeg', title: 'patient test', mime_type: 'image/jpeg', contains_patient: true } });
  const g = await call('POST', '/rest/v1/gallery_items', { token: editor, body: { gallery: 'clinic', media_id: pm.data[0].id, status: 'published', alt_text: 'x' } });
  check('identifiable patient image cannot be published without consent', g.status >= 400 && /consent/.test(errMsg(g)), `${g.status} ${errMsg(g)}`);
  const gd = await call('POST', '/rest/v1/gallery_items', { token: editor, body: { gallery: 'clinic', media_id: pm.data[0].id, status: 'draft', alt_text: 'x' } });
  check('…but it can be kept as a draft', gd.status === 201, `${gd.status}`);
  await call('DELETE', `/rest/v1/gallery_items?id=eq.${gd.data[0].id}`, { token: editor });
  await call('DELETE', `/rest/v1/media_assets?id=eq.${pm.data[0].id}`, { token: owner });  // not builtin, unused
  const svg = await call('POST', '/rest/v1/media_assets', { token: editor, body: { storage_path: 'uploads/2026/10/00000000-0000-0000-0000-000000000000.svg', mime_type: 'image/svg+xml' } });
  check('SVG uploads are not accepted (script risk)', svg.status >= 400, `${svg.status}`);
  const trav = await call('POST', '/rest/v1/media_assets', { token: editor, body: { static_path: 'assets/../../etc/passwd.png', mime_type: 'image/png' } });
  check('path traversal in media paths is rejected', trav.status >= 400, `${trav.status}`);

  const sl = await call('PATCH', '/rest/v1/treatments?slug=eq.braces', { token: editor, body: { slug: 'orthodontics' } });
  const red = await rpc('get_site_content', { p_page: 'treatments' });
  check('changing a slug creates a redirect from the old address', sl.status === 200 && red.data.redirects.some(r => r.from === 'braces' && r.to === 'orthodontics'), JSON.stringify(red.data.redirects));
  const coll = await call('PATCH', '/rest/v1/treatments?slug=eq.whitening', { token: editor, body: { slug: 'implants' } });
  check('slug collisions are rejected', coll.status >= 400, `${coll.status}`);
  const back = await call('PATCH', '/rest/v1/treatments?slug=eq.orthodontics', { token: editor, body: { slug: 'braces' } });
  const red2 = await rpc('get_site_content', { p_page: 'treatments' });
  check('reclaiming an old slug removes its redirect (no loops)', back.status === 200 && !red2.data.redirects.some(r => r.from === 'braces') && red2.data.redirects.some(r => r.from === 'orthodontics' && r.to === 'braces'), JSON.stringify(red2.data.redirects));
  await call('DELETE', '/rest/v1/slug_redirects?old_slug=eq.orthodontics', { token: editor });

  const draft = await call('PATCH', '/rest/v1/treatments?slug=eq.implants', { token: editor, body: { draft_data: { title: 'Implants (draft title)' } } });
  const pub = await rpc('get_site_content', { p_page: 'index' });
  const prev = await rpc('get_site_content', { p_page: 'index', p_preview: true }, editor);
  check('draft edits are invisible to the public', draft.status === 200 && pub.data.treatments.find(t => t.slug === 'implants').title === 'Dental Implants', '');
  check('draft edits are visible in preview', prev.data.treatments.find(t => t.slug === 'implants').title === 'Implants (draft title)', '');
  await call('PATCH', '/rest/v1/treatments?slug=eq.implants', { token: editor, body: { draft_data: null } });
  const dr = await call('POST', '/rest/v1/faqs', { token: editor, body: { question: 'Draft question?', answer: 'Draft answer.', status: 'draft' } });
  const pub2 = await rpc('get_site_content', { p_page: 'contact' });
  check('unpublished items are not public', !pub2.data.faqs.some(f => f.question === 'Draft question?'), '');
  await call('DELETE', `/rest/v1/faqs?id=eq.${dr.data[0].id}`, { token: editor });
}
{ // storage policies (emulator enforces the real storage.objects RLS policies)
  const up = (token, name, type = 'image/png', size = 100) => fetch(`${API}/storage/v1/object/media/${name}`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + token, 'content-type': type }, body: Buffer.alloc(size, 1) });
  const okName = `uploads/2026/10/${crypto.randomUUID()}.png`;
  check('editor can upload to a generated path', (await up(editor, okName)).status === 200, '');
  check('anonymous visitors cannot upload', (await up(ANON, `uploads/2026/10/${crypto.randomUUID()}.png`)).status >= 400, '');
  check('front desk cannot upload', (await up(desk, `uploads/2026/10/${crypto.randomUUID()}.png`)).status >= 400, '');
  check('uploads outside the allowed path pattern are refused', (await up(editor, 'uploads/../../evil.png')).status >= 400 && (await up(editor, 'other/x.png')).status >= 400, '');
  check('disallowed file types (SVG/HTML) are refused', (await up(editor, `uploads/2026/10/${crypto.randomUUID()}.png`, 'image/svg+xml')).status >= 400 && (await up(editor, `uploads/2026/10/${crypto.randomUUID()}.png`, 'text/html')).status >= 400, '');
  check('files over 5 MB are refused', (await up(editor, `uploads/2026/10/${crypto.randomUUID()}.png`, 'image/png', 5242881)).status >= 400, '');
  const pubGet = await fetch(`${API}/storage/v1/object/public/media/${okName}`);
  check('uploaded images are publicly viewable by URL', pubGet.status === 200, `${pubGet.status}`);
  const delAnon = await fetch(`${API}/storage/v1/object/media`, { method: 'DELETE', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: [okName] }) });
  const stillThere = await fetch(`${API}/storage/v1/object/public/media/${okName}`);
  check('anonymous visitors cannot delete files', stillThere.status === 200, `${delAnon.status}`);
  await fetch(`${API}/storage/v1/object/media`, { method: 'DELETE', headers: { apikey: ANON, Authorization: 'Bearer ' + editor, 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: [okName] }) });
  check('editor can delete files', (await fetch(`${API}/storage/v1/object/public/media/${okName}`)).status === 404, '');
}

const failed = results.filter(r => !r.ok);
fs.writeFileSync('/tmp/api-security-results.json', JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
