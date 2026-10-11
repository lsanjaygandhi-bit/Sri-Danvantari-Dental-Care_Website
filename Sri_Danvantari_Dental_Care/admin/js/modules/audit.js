// Audit log: who changed what and when (Super Admin only). Patient details are redacted at source.
import { h, fmtDateTime, debounce } from '../ui.js';
import { ctx, q, can, pageHead, forbidden } from '../core.js';

const PAGE = 30;
const TABLES = ['', 'appointments', 'appointment_notes', 'page_sections', 'doctors', 'treatments', 'treatment_categories', 'testimonials', 'gallery_items', 'faqs', 'media_assets', 'nav_items', 'seo_pages', 'site_settings', 'admin_users', 'slug_redirects'];

export async function render(content) {
  if (!can.superAdmin()) return forbidden(content, 'the audit log');
  const state = { page: 0, table: '', action: '', actor: '' };
  const table = h('select', { 'aria-label': 'Area' }, ...TABLES.map(t => h('option', { value: t, text: t ? t.replace(/_/g, ' ') : 'All areas' })));
  const action = h('select', { 'aria-label': 'Action' }, ...['', 'insert', 'update', 'delete', 'login', 'export'].map(t => h('option', { value: t, text: t || 'All actions' })));
  const actor = h('input', { type: 'search', placeholder: 'Filter by email', 'aria-label': 'Filter by email' });
  const out = h('div');
  const load = async () => {
    let req = ctx.sb.from('audit_log').select('*', { count: 'exact' }).order('occurred_at', { ascending: false }).range(state.page * PAGE, state.page * PAGE + PAGE - 1);
    if (state.table) req = req.eq('table_name', state.table);
    if (state.action) req = req.eq('action', state.action);
    const a = state.actor.replace(/[^a-z0-9@._+-]/gi, '');
    if (a) req = req.ilike('actor_email', `*${a}*`);
    const { data, count } = await q(req);
    const pages = Math.max(1, Math.ceil((count || 0) / PAGE));
    out.replaceChildren(h('div', { class: 'table-wrap' }, data.length ? h('table', { class: 'data stack' },
      h('thead', {}, h('tr', {}, ...['When', 'Who', 'Action', 'Area', 'Details'].map(t => h('th', { text: t })))),
      h('tbody', {}, ...data.map(r => h('tr', {},
        h('td', { 'data-label': 'When', text: fmtDateTime(r.occurred_at) }),
        h('td', { 'data-label': 'Who', text: r.actor_email || 'System' }),
        h('td', { 'data-label': 'Action', text: r.action }),
        h('td', { 'data-label': 'Area' }, r.table_name.replace(/_/g, ' '), h('div', { class: 'small muted mono', text: r.record_id || '' })),
        h('td', { 'data-label': 'Details' }, r.changes ? h('details', {}, h('summary', { text: summary(r) }), h('pre', { class: 'changes', text: JSON.stringify(r.changes, null, 2) })) : '—'))))) : h('div', { class: 'empty', text: 'No entries.' })),
      h('div', { class: 'pager' },
        h('button', { class: 'btn ghost small', type: 'button', text: '← Newer', disabled: state.page === 0, onclick: () => { state.page--; load(); } }),
        h('span', { text: `Page ${state.page + 1} of ${pages} · ${count} entries` }),
        h('button', { class: 'btn ghost small', type: 'button', text: 'Older →', disabled: state.page >= pages - 1, onclick: () => { state.page++; load(); } })));
  };
  table.addEventListener('change', () => { state.table = table.value; state.page = 0; load(); });
  action.addEventListener('change', () => { state.action = action.value; state.page = 0; load(); });
  actor.addEventListener('input', debounce(() => { state.actor = actor.value; state.page = 0; load(); }, 300));
  content.replaceChildren(pageHead('Audit log', 'Every change made in the dashboard, plus sign-ins and exports. Patient details are never copied into this log.'),
    h('div', { class: 'toolbar' }, table, action, h('div', { class: 'grow' }, actor)), out);
  load();
}

function summary(r) {
  if (r.action === 'update' && r.changes) return 'Changed: ' + Object.keys(r.changes).join(', ');
  if (r.action === 'export') return `Exported ${r.changes.rows} rows`;
  return 'View details';
}
