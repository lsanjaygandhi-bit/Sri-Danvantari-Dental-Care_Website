// Small DOM and UI helpers for the Admin Dashboard.
// All user/database text is written with textContent — never innerHTML.

// Optional parts of a screen are written as `condition ? element : null`. The DOM's
// append/replaceChildren would print those as the text "null", so skip empty values.
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const m of ['append', 'prepend', 'replaceChildren']) {
    const orig = proto[m];
    proto[m] = function (...kids) { return orig.apply(this, kids.filter(k => k != null && k !== false)); };
  }
}
for (const m of ['before', 'after']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...kids) { return orig.apply(this, kids.filter(k => k != null && k !== false)); };
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else if (k === 'checked') n.checked = !!v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return n;
}

export function toast(msg, kind = '') {
  const t = h('div', { class: 'toast ' + kind, role: kind === 'err' ? 'alert' : 'status', text: msg });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 8000 : 4000);
}

export function confirmDialog(title, text, okLabel = 'Confirm', danger = true) {
  const d = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  const ok = $('#confirm-ok');
  ok.textContent = okLabel;
  ok.className = 'btn ' + (danger ? 'danger' : 'primary');
  d.returnValue = '';
  d.showModal();
  return new Promise(resolve => d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }));
}

export function modal(title, body, actions = [], opts = {}) {
  const d = h('dialog', { class: 'dialog' + (opts.wide ? ' wide' : '') });
  const close = () => { d.close(); };
  d.append(h('h2', { text: title }), body, h('div', { class: 'dialog-actions' }, ...actions.map(a => h('button', { class: 'btn ' + (a.kind || 'ghost'), type: 'button', text: a.label, onclick: () => a.onClick ? a.onClick(close) : close() }))));
  d.addEventListener('close', () => { d.remove(); opts.onClose?.(); });
  document.body.append(d);
  d.showModal();
  return { dialog: d, close };
}

export const fmtDate = v => v ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(v.length === 10 ? v + 'T12:00:00' : v)) : '—';
export const fmtDateTime = v => v ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(v)) : '—';
export const pill = (status, label) => h('span', { class: 'pill ' + status, text: label || status.replace(/_/g, ' ') });

export const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export function friendlyError(err) {
  if (!err) return 'Something went wrong.';
  const m = err.message || String(err);
  if (/duplicate key.*slug/i.test(m) || /slug_key/.test(m)) return 'That URL slug is already used by another item. Choose a different slug.';
  if (/duplicate key/i.test(m)) return 'An item with the same unique value already exists.';
  if (/violates foreign key.*on table "(\w+)"/i.test(m) || /still referenced/i.test(m)) return 'This item is still used elsewhere on the website, so it cannot be deleted. Remove it from those places first.';
  if (/check constraint "testimonial_consent_before_publish"/.test(m)) return 'Record how consent was obtained before publishing this testimonial.';
  if (/check constraint/i.test(m)) return 'One of the values is not valid (too long or in the wrong format). Please check the form.';
  if (/row-level security|permission denied|42501|not authori[sz]ed/i.test(m)) return 'Your role does not allow this action.';
  if (/JWT expired|invalid jwt|refresh token/i.test(m)) return 'Your session has expired. Please sign in again.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Could not reach the server. Check your internet connection and try again.';
  return m;
}

// CSV with protection against spreadsheet formula injection.
export function toCsv(rows, columns) {
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [columns.map(c => cell(c.label)).join(','), ...rows.map(r => columns.map(c => cell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','))].join('\r\n');
}

export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// Simple client-side table with search, filters and pagination.
export function dataTable({ columns, rows, onRowClick, pageSize = 25, empty = 'Nothing here yet.', stack = true }) {
  const wrap = h('div');
  let page = 0;
  const render = () => {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (page >= pages) page = pages - 1;
    const slice = rows.slice(page * pageSize, page * pageSize + pageSize);
    const table = h('table', { class: 'data' + (stack ? ' stack' : '') },
      h('thead', {}, h('tr', {}, ...columns.map(c => h('th', { scope: 'col', text: c.label })))),
      h('tbody', {}, ...slice.map(r => {
        const tr = h('tr', { class: onRowClick ? 'clickable' : '' }, ...columns.map(c => {
          const v = c.render ? c.render(r) : r[c.key];
          return h('td', { 'data-label': c.label, class: c.class || '' }, v instanceof Node ? v : (v == null || v === '' ? '—' : String(v)));
        }));
        if (onRowClick) {
          tr.tabIndex = 0;
          tr.addEventListener('click', e => { if (!e.target.closest('button,a,input,select')) onRowClick(r); });
          tr.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === tr) onRowClick(r); });
        }
        return tr;
      })));
    wrap.replaceChildren(h('div', { class: 'table-wrap' }, total ? table : h('div', { class: 'empty', text: empty })));
    if (pages > 1) {
      wrap.append(h('div', { class: 'pager' },
        h('button', { class: 'btn ghost small', type: 'button', disabled: page === 0, text: '← Previous', onclick: () => { page--; render(); } }),
        h('span', { text: `Page ${page + 1} of ${pages} · ${total} items` }),
        h('button', { class: 'btn ghost small', type: 'button', disabled: page >= pages - 1, text: 'Next →', onclick: () => { page++; render(); } })));
    }
  };
  render();
  return { el: wrap, update(newRows) { rows = newRows; page = 0; render(); } };
}

export const MD_HELP = () => h('div', { class: 'md-help' }, 'Formatting: blank line = new paragraph · ', h('code', { text: '## Heading' }), ' · ', h('code', { text: '- list item' }), ' · ', h('code', { text: '[link text](contact.html)' }), '. HTML is not allowed.');
export const INLINE_HELP = () => h('div', { class: 'md-help' }, 'Links: ', h('code', { text: '[link text](treatments.html)' }), ' or ', h('code', { text: '[text](https://…)' }), '. HTML is not allowed.');
