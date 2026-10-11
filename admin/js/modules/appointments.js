// Appointment requests: search, filter, status, internal notes, CSV export.
import { h, toast, confirmDialog, pill, fmtDate, fmtDateTime, toCsv, download, debounce } from '../ui.js';
import { ctx, q, can, pageHead, forbidden } from '../core.js';

const STATUSES = [['new', 'New'], ['contacted', 'Contacted'], ['confirmed', 'Confirmed'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
const PAGE = 20;
const istStart = d => `${d}T00:00:00+05:30`;
const nextDay = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

export async function render(content, params, _name, query) {
  if (!can.appointments()) return forbidden(content, 'appointment requests');
  if (params[0]) return detail(content, params[0]);

  const state = { page: 0, status: query?.get('status') || '', term: '', from: '', to: '' };
  const search = h('input', { type: 'search', placeholder: 'Name, mobile number or reference', 'aria-label': 'Search appointments' });
  const status = h('select', { 'aria-label': 'Status' }, h('option', { value: '', text: 'All statuses' }), ...STATUSES.map(([v, t]) => h('option', { value: v, text: t })));
  status.value = state.status;
  const from = h('input', { type: 'date', 'aria-label': 'Received from' });
  const to = h('input', { type: 'date', 'aria-label': 'Received to' });
  const results = h('div');

  const load = async () => {
    results.replaceChildren(h('p', { class: 'muted', text: 'Loading…' }));
    let req = ctx.sb.from('appointments').select('id,reference,created_at,patient_name,phone,treatment,preferred_date,preferred_time,status', { count: 'exact' }).order('created_at', { ascending: false });
    if (state.status) req = req.eq('status', state.status);
    // Date filters are whole days in clinic time (IST), whatever the browser's time zone.
    if (state.from) req = req.gte('created_at', istStart(state.from));
    if (state.to) req = req.lt('created_at', istStart(nextDay(state.to)));
    const t = state.term.replace(/[^\p{L}\p{N} .'-]/gu, '').trim();
    if (t) {
      const digits = t.replace(/\D/g, '');
      const ors = [`patient_name.ilike.*${t}*`, `reference.ilike.*${t.toUpperCase()}*`];
      if (digits.length >= 3) ors.push(`phone.like.*${digits}*`);
      req = req.or(ors.join(','));
    }
    req = req.range(state.page * PAGE, state.page * PAGE + PAGE - 1);
    try {
      const { data, count } = await q(req);
      const pages = Math.max(1, Math.ceil((count || 0) / PAGE));
      results.replaceChildren(
        data.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data stack' },
          h('thead', {}, h('tr', {}, ...['Received', 'Patient', 'Mobile', 'Treatment', 'Preferred', 'Status', ''].map(x => h('th', { text: x })))),
          h('tbody', {}, ...data.map(r => {
            const tr = h('tr', { class: 'clickable', tabindex: 0 },
              h('td', { 'data-label': 'Received' }, fmtDateTime(r.created_at), h('div', { class: 'small muted mono', text: r.reference })),
              h('td', { 'data-label': 'Patient' }, h('strong', { text: r.patient_name })),
              h('td', { 'data-label': 'Mobile', text: '+91 ' + r.phone }),
              h('td', { 'data-label': 'Treatment', text: r.treatment || '—' }),
              h('td', { 'data-label': 'Preferred', text: `${r.preferred_date ? fmtDate(r.preferred_date) : 'Any date'} · ${r.preferred_time || '—'}` }),
              h('td', { 'data-label': 'Status' }, pill(r.status)),
              h('td', { class: 'actions' }, h('a', { class: 'btn ghost small', href: '#/appointments/' + r.id, text: 'Open' })));
            tr.addEventListener('click', e => { if (!e.target.closest('a,button')) location.hash = '#/appointments/' + r.id; });
            tr.addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = '#/appointments/' + r.id; });
            return tr;
          })))) : h('div', { class: 'table-wrap' }, h('div', { class: 'empty', text: 'No appointment requests match.' })),
        h('div', { class: 'pager' },
          h('button', { class: 'btn ghost small', type: 'button', text: '← Newer', disabled: state.page === 0, onclick: () => { state.page--; load(); } }),
          h('span', { text: `Page ${state.page + 1} of ${pages} · ${count || 0} requests` }),
          h('button', { class: 'btn ghost small', type: 'button', text: 'Older →', disabled: state.page >= pages - 1, onclick: () => { state.page++; load(); } })));
    } catch (e) { results.replaceChildren(h('div', { class: 'banner bad', text: e.message })); }
  };
  const reset = () => { state.page = 0; load(); };
  search.addEventListener('input', debounce(() => { state.term = search.value; reset(); }, 300));
  status.addEventListener('change', () => { state.status = status.value; reset(); });
  from.addEventListener('change', () => { state.from = from.value; reset(); });
  to.addEventListener('change', () => { state.to = to.value; reset(); });

  const exportBtn = can.superAdmin() ? h('button', { class: 'btn ghost', type: 'button', text: 'Export CSV', onclick: async e => {
    if (!(await confirmDialog('Export patient data?', 'The CSV file will contain patient names and phone numbers. Store it securely and delete it when no longer needed. This export is recorded in the audit log.', 'Export', false))) return;
    e.target.disabled = true;
    try {
      const rows = await q(ctx.sb.rpc('admin_export_appointments', { p_from: state.from || null, p_to: state.to || null, p_status: state.status || null }));
      const csv = toCsv(rows, [
        { label: 'Reference', key: 'reference' }, { label: 'Received', value: r => new Date(r.created_at).toISOString() },
        { label: 'Patient name', key: 'patient_name' }, { label: 'Mobile', value: r => '+91 ' + r.phone }, { label: 'Treatment', key: 'treatment' },
        { label: 'Preferred date', key: 'preferred_date' }, { label: 'Preferred time', key: 'preferred_time' }, { label: 'Message', key: 'message' }, { label: 'Status', key: 'status' }]);
      download(`appointments-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
      toast(`Exported ${rows.length} requests.`, 'ok');
    } catch (err) { toast(err.message, 'err'); }
    e.target.disabled = false;
  } }) : null;

  content.replaceChildren(
    pageHead('Appointment requests', 'Requests sent from the website booking form. A request is not an appointment until the clinic confirms it with the patient.', exportBtn),
    h('div', { class: 'toolbar' }, h('div', { class: 'grow' }, h('label', { text: 'Search' }), search), h('div', {}, h('label', { text: 'Status' }), status), h('div', {}, h('label', { text: 'Received from' }), from), h('div', {}, h('label', { text: 'to' }), to)),
    results);
  load();
}

async function detail(content, id, keep = {}) {
  const a = await q(ctx.sb.from('appointments').select('*').eq('id', id).maybeSingle());
  if (!a) { content.replaceChildren(pageHead('Request not found'), h('a', { href: '#/appointments', text: '← Back' })); return; }
  const notes = await q(ctx.sb.from('appointment_notes').select('*').eq('appointment_id', id).order('created_at'));
  const notesEl = h('div', { class: 'notes' }, ...(notes.length ? notes.map(n => h('div', { class: 'note' }, h('small', { text: `${n.author_email || 'Unknown'} · ${fmtDateTime(n.created_at)}` }), n.note)) : [h('p', { class: 'muted small', text: 'No notes yet.' })]));
  const noteInput = h('textarea', { rows: 3, maxlength: 2000, 'aria-label': 'New internal note', placeholder: 'For example: Called the patient, booked for Tuesday 6:30 pm.' });
  noteInput.value = keep.note || '';  // a note being typed survives a status change

  const setStatus = async s => {
    if (s === a.status) return;
    if (s === 'confirmed' && !(await confirmDialog('Mark as confirmed?', 'Only mark a request as confirmed after the clinic has actually agreed a date and time with the patient.', 'Mark confirmed', false))) return;
    if (s === 'cancelled' && !(await confirmDialog('Cancel this request?', 'The request will be marked as cancelled.', 'Mark cancelled'))) return;
    try {
      const rows = await q(ctx.sb.from('appointments').update({ status: s }).eq('id', a.id).eq('updated_at', a.updated_at).select('id'));
      if (!rows.length) throw new Error('This request was updated by someone else. Reloading…');
      toast(`Status changed to ${s}.`, 'ok');
    } catch (e) { toast(e.message, 'err'); }
    detail(content, id, { note: noteInput.value });
  };
  const addNote = async () => {
    const text = noteInput.value.trim();
    if (!text) return toast('Write a note first.', 'err');
    try { await q(ctx.sb.from('appointment_notes').insert({ appointment_id: a.id, note: text })); toast('Note added.', 'ok'); detail(content, id); }
    catch (e) { toast(e.message, 'err'); }
  };
  const wa = `https://wa.me/91${a.phone}`;
  const del = can.superAdmin() ? h('button', { class: 'btn danger ghost', type: 'button', text: 'Delete request', onclick: async () => {
    if (!(await confirmDialog('Delete this request permanently?', 'Patient details and notes will be deleted. This cannot be undone.', 'Delete'))) return;
    try { await q(ctx.sb.from('appointments').delete().eq('id', a.id)); toast('Request deleted.', 'ok'); location.hash = '#/appointments'; } catch (e) { toast(e.message, 'err'); }
  } }) : null;

  content.replaceChildren(
    h('div', { class: 'crumb' }, h('a', { href: '#/appointments', text: '← Appointment requests' })),
    pageHead(a.patient_name, `Reference ${a.reference} · received ${fmtDateTime(a.created_at)}`, del),
    h('div', { class: 'editor' },
      h('div', {},
        h('div', { class: 'panel' }, h('h2', { text: 'Request details' }),
          h('dl', { class: 'kv' },
            h('dt', { text: 'Patient' }), h('dd', { text: a.patient_name }),
            h('dt', { text: 'Mobile' }), h('dd', {}, h('a', { href: 'tel:+91' + a.phone, text: '+91 ' + a.phone })),
            h('dt', { text: 'Treatment' }), h('dd', { text: a.treatment || '—' }),
            h('dt', { text: 'Preferred date' }), h('dd', { text: a.preferred_date ? fmtDate(a.preferred_date) : 'Not specified' }),
            h('dt', { text: 'Preferred time' }), h('dd', { text: a.preferred_time || '—' }),
            h('dt', { text: 'Message' }), h('dd', { text: a.message || '—' }),
            h('dt', { text: 'Source' }), h('dd', { text: a.source === 'website' ? 'Website booking form' : a.source })),
          h('div', { class: 'btn-row' }, h('a', { class: 'btn ghost small', href: 'tel:+91' + a.phone, text: 'Call patient' }), h('a', { class: 'btn ghost small', href: wa, target: '_blank', rel: 'noopener', text: 'Open WhatsApp chat ↗' })),
          h('p', { class: 'small muted', text: 'Patient details cannot be edited here, so the original request is preserved. Add a note for corrections.' })),
        h('div', { class: 'panel' }, h('h2', { text: 'Internal notes' }), h('p', { class: 'small muted', text: 'Visible only to Super Admins and Front Desk staff. Do not record clinical details here.' }),
          notesEl, noteInput, h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', text: 'Add note', onclick: addNote })))),
      h('aside', { class: 'editor-side' }, h('div', { class: 'panel' }, h('h3', { text: 'Status' }), h('div', { class: 'statusline' }, pill(a.status)),
        h('div', { class: 'btn-row' }, ...STATUSES.map(([v, t]) => h('button', { class: 'btn ' + (v === a.status ? '' : 'ghost') + ' small', type: 'button', text: t, disabled: v === a.status, 'aria-pressed': String(v === a.status), onclick: () => setStatus(v) }))),
        h('p', { class: 'small muted', text: 'Use Confirmed only after the clinic has confirmed the time with the patient.' })))));
}
