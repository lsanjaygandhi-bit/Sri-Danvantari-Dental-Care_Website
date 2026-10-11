// Admin users and roles (Super Admin only).
import { h, toast, confirmDialog, modal, pill, fmtDateTime } from '../ui.js';
import { ctx, q, can, pageHead, forbidden, ROLE_LABEL } from '../core.js';
import { buildForm } from '../fields.js';

const ROLES = [['editor', 'Editor — website content, media and SEO'], ['front_desk', 'Front Desk — appointment requests only'], ['super_admin', 'Super Admin — everything, including settings and users']];

export async function render(content) {
  if (!can.superAdmin()) return forbidden(content, 'admin users');
  const rows = await q(ctx.sb.from('admin_users').select('*').order('created_at'));
  const grant = () => {
    const form = buildForm([
      { name: 'email', label: 'Email of the existing login', type: 'email', required: true, max: 200 },
      { name: 'display_name', label: 'Display name', type: 'text', max: 80 },
      { name: 'role', label: 'Role', type: 'select', options: ROLES, default: 'editor' },
    ], {});
    modal('Give dashboard access', h('div', {},
      h('div', { class: 'banner info', text: 'First create or invite the person in Supabase → Authentication → Users (they set their own password). Then grant their role here. There is no public sign-up.' }), form.el), [
      { label: 'Cancel' },
      { label: 'Grant access', kind: '', onClick: async close => {
        if (form.validate().length) return;
        const v = form.getValues();
        if (v.role === 'super_admin' && !(await confirmDialog('Grant Super Admin?', 'Super Admins can change every setting, manage users and export patient data.', 'Grant', false))) return;
        try { await q(ctx.sb.rpc('admin_grant_access', { p_email: v.email, p_role: v.role, p_display_name: v.display_name || '' })); toast('Access granted.', 'ok'); close(); render(content); }
        catch (e) { toast(e.message, 'err'); }
      } }]);
  };
  const update = async (r, patch, msg) => {
    try { const res = await q(ctx.sb.from('admin_users').update(patch).eq('user_id', r.user_id).select('user_id')); if (!res.length) throw new Error('Not updated.'); toast(msg, 'ok'); render(content); }
    catch (e) { toast(e.message, 'err'); }
  };
  content.replaceChildren(
    pageHead('Admin users', 'Who can sign in to this dashboard, and what they can do.', h('button', { class: 'btn', type: 'button', text: '+ Give access', onclick: grant })),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data stack' },
      h('thead', {}, h('tr', {}, ...['User', 'Role', 'Status', 'Since', ''].map(t => h('th', { text: t })))),
      h('tbody', {}, ...rows.map(r => {
        const self = r.user_id === ctx.me.user_id;
        const roleSel = h('select', { 'aria-label': `Role for ${r.email}`, disabled: self }, ...ROLES.map(([v]) => h('option', { value: v, text: ROLE_LABEL[v] })));
        roleSel.value = r.role;
        roleSel.addEventListener('change', async () => {
          if (!(await confirmDialog('Change role?', `${r.email} will become ${ROLE_LABEL[roleSel.value]}.`, 'Change role', false))) { roleSel.value = r.role; return; }
          update(r, { role: roleSel.value }, 'Role changed.');
        });
        return h('tr', {},
          h('td', { 'data-label': 'User' }, h('strong', { text: r.display_name || r.email }), h('div', { class: 'small muted', text: r.email + (self ? ' (you)' : '') })),
          h('td', { 'data-label': 'Role' }, roleSel),
          h('td', { 'data-label': 'Status' }, pill(r.is_active ? 'active' : 'inactive')),
          h('td', { 'data-label': 'Since', text: fmtDateTime(r.created_at) }),
          h('td', { class: 'actions' }, self ? h('span', { class: 'small muted', text: 'Manage in My account' }) : h('div', { class: 'btn-row' },
            h('button', { class: 'btn ghost small', type: 'button', text: r.is_active ? 'Deactivate' : 'Reactivate', onclick: async () => {
              if (r.is_active && !(await confirmDialog('Deactivate?', `${r.email} will lose dashboard access immediately.`, 'Deactivate'))) return;
              update(r, { is_active: !r.is_active }, r.is_active ? 'Access removed.' : 'Access restored.');
            } }),
            h('button', { class: 'btn danger ghost small', type: 'button', text: 'Remove', onclick: async () => {
              if (!(await confirmDialog('Remove dashboard access?', `${r.email} will be removed from the admin list. Their login still exists in Supabase Auth; delete it there if needed.`, 'Remove'))) return;
              try { await q(ctx.sb.from('admin_users').delete().eq('user_id', r.user_id)); toast('Removed.', 'ok'); render(content); } catch (e) { toast(e.message, 'err'); }
            } }))));
      })))),
    h('div', { class: 'panel small' }, h('h3', { text: 'Roles' }), h('ul', {}, ...ROLES.map(([, t]) => h('li', { text: t }))),
      h('p', { class: 'muted', text: 'At least one active Super Admin must always remain. Permissions are enforced by the database, not only by this screen.' })));
}
