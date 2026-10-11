// Shared state for dashboard modules.
import { h, toast, confirmDialog, friendlyError } from './ui.js';

const CFG = window.SDDC_CONFIG || {};
export const BASE = (CFG.supabaseUrl || '').replace(/\/+$/, '');

export const ctx = {
  sb: null,          // supabase client
  me: null,          // { user_id, email, display_name, role }
  dirty: false,      // unsaved changes in the current form
  settings: null,    // cached site settings (for clinic name etc.)
};

export const ROLE_LABEL = { super_admin: 'Super Admin', editor: 'Editor', front_desk: 'Front Desk' };
export const can = {
  editContent: () => ['super_admin', 'editor'].includes(ctx.me?.role),
  appointments: () => ['super_admin', 'front_desk'].includes(ctx.me?.role),
  superAdmin: () => ctx.me?.role === 'super_admin',
};

export const STORAGE_RE = /^uploads\/[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.(jpg|png|webp|avif|ico)$/;
export function mediaUrl(m) {
  if (!m) return null;
  if (m.static_path || m.static) return '../' + (m.static_path || m.static);
  const p = m.storage_path || m.storage;
  if (p && STORAGE_RE.test(p)) return `${BASE}/storage/v1/object/public/media/${p}`;
  return null;
}

// Run a Supabase query; throw a friendly error.
export async function q(promise) {
  const { data, error, count } = await promise;
  if (error) {
    if (/JWT expired|invalid claim|session/i.test(error.message || '')) toast('Your session has expired. Please sign in again.', 'err');
    const e = new Error(friendlyError(error)); e.raw = error; throw e;
  }
  return count != null ? { data, count } : data;
}

export function markDirty(on = true) { ctx.dirty = on; }
export async function leaveOk() {
  if (!ctx.dirty) return true;
  const ok = await confirmDialog('Leave without saving?', 'You have unsaved changes on this page. They will be lost if you leave.', 'Leave page');
  if (ok) ctx.dirty = false;
  return ok;
}
window.addEventListener('beforeunload', e => { if (ctx.dirty) { e.preventDefault(); e.returnValue = ''; } });

export function pageHead(title, subtitle, ...actions) {
  return h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: title }), subtitle ? h('p', { text: subtitle }) : null), actions.length ? h('div', { class: 'btn-row' }, ...actions) : null);
}

export function forbidden(content, what = 'this section') {
  content.replaceChildren(pageHead('Not available'), h('div', { class: 'banner warn', text: `Your role (${ROLE_LABEL[ctx.me?.role] || 'unknown'}) does not have access to ${what}.` }));
}

export const previewUrl = (path) => '../' + path + (path.includes('?') ? '&' : '?') + 'preview=1';
