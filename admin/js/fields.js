// Generic form builder with validation, character counters and dirty tracking.
import { h, $, $$, slugify, MD_HELP, INLINE_HELP } from './ui.js';
import { ctx, markDirty, mediaUrl, q } from './core.js';

const SAFE_URL = /^(https:\/\/[^\s<>"'`]+|tel:\+?[0-9]{6,15}|mailto:[^\s<>"'`@]+@[^\s<>"'`]+|[a-z0-9-]+\.html(\?[a-z0-9=&_-]*)?(#[a-z0-9-]+)?|#[a-z0-9-]+)$/i;
export const isSafeUrl = u => SAFE_URL.test(String(u || '').trim());
const HTML_RE = /<\s*\/?\s*[a-z!][^>]*>/i;

let uid = 0;
const id = name => `f-${name}-${++uid}`;

export function buildForm(fields, values = {}, opts = {}) {
  const form = h('div', { class: 'form' });
  const getters = {};
  const fieldEls = {};
  const onInput = () => { markDirty(true); opts.onChange?.(); };

  for (const f of fields) {
    if (f.type === 'heading') { form.append(h('h3', { class: 'form-heading', text: f.label }), f.hint ? h('p', { class: 'muted small', text: f.hint }) : null); continue; }
    const wrap = h('div', { class: 'field', dataset: { field: f.name } });
    const fid = id(f.name);
    const v = values[f.name];
    let input;
    const label = (txt = f.label) => h('label', { for: fid }, txt, f.required ? h('span', { class: 'muted', text: ' *' }) : null);
    const counter = (el, max) => {
      if (!max) return null;
      const c = h('span', { class: 'counter' });
      const upd = () => { const n = el.value.length; c.textContent = `${n}/${max}`; c.classList.toggle('over', n > max); };
      el.addEventListener('input', upd); upd();
      return c;
    };

    switch (f.type) {
      case 'boolean': {
        input = h('input', { id: fid, type: 'checkbox', checked: v === undefined ? !!f.default : !!v, oninput: onInput, onchange: onInput, disabled: f.readonly });
        wrap.append(h('label', { class: 'check', for: fid }, input, h('span', {}, f.label, f.hint ? h('span', { class: 'hint', text: f.hint }) : null)));
        getters[f.name] = () => input.checked;
        break;
      }
      case 'select': {
        input = h('select', { id: fid, oninput: onInput, disabled: f.readonly }, ...(f.options || []).map(o => {
          const [val, txt] = Array.isArray(o) ? o : [o, o];
          const op = h('option', { text: txt }); op.value = val ?? ''; return op;
        }));
        input.value = v ?? f.default ?? '';
        wrap.append(label(), input);
        getters[f.name] = () => (f.nullable && input.value === '' ? null : input.value);
        break;
      }
      case 'textarea': case 'rich': case 'md': case 'json': case 'lines': {
        const isJson = f.type === 'json';
        input = h('textarea', { id: fid, class: (f.type === 'md' || isJson ? 'tall' : '') + (isJson ? ' code' : ''), rows: f.rows || (f.type === 'md' ? 10 : 4), maxlength: f.max ? f.max + 200 : null, oninput: onInput, readonly: f.readonly, placeholder: f.placeholder || null, spellcheck: isJson ? 'false' : null });
        input.value = f.type === 'lines' ? (Array.isArray(v) ? v.join('\n') : '') : isJson ? (v == null ? '' : JSON.stringify(v, null, 2)) : (v ?? '');
        wrap.append(h('div', {}, label(), counter(input, f.type === 'lines' ? null : f.max)), input);
        if (f.type === 'md') wrap.append(MD_HELP());
        if (f.type === 'rich') wrap.append(INLINE_HELP());
        if (f.type === 'lines') wrap.append(h('div', { class: 'md-help', text: 'One item per line.' }));
        getters[f.name] = () => {
          if (f.type === 'lines') return input.value.split('\n').map(s => s.trim()).filter(Boolean);
          if (isJson) { const t = input.value.trim(); if (!t) return null; try { return JSON.parse(t); } catch { return Symbol.for('invalid-json'); } }
          return input.value.replace(/\r/g, '').trim();
        };
        break;
      }
      case 'media': {
        let current = v || null;
        const preview = h('div');
        const info = h('div', { class: 'small muted' });
        const showPreview = async () => {
          if (!current) { preview.replaceChildren(h('div', { class: 'noimg', text: 'No image' })); info.textContent = ''; return; }
          const m = await q(ctx.sb.from('media_assets').select('id,title,static_path,storage_path,alt_text,width,height,contains_patient,patient_consent').eq('id', current).maybeSingle()).catch(() => null);
          if (!m) { preview.replaceChildren(h('div', { class: 'noimg', text: 'Missing image' })); return; }
          preview.replaceChildren(h('img', { src: mediaUrl(m), alt: '' }));
          info.textContent = `${m.title || 'Untitled'}${m.width ? ` · ${m.width}×${m.height}` : ''}${m.contains_patient && !m.patient_consent ? ' · ⚠ patient image without recorded consent' : ''}`;
        };
        const choose = h('button', { class: 'btn ghost small', type: 'button', text: 'Choose or upload…', onclick: async () => {
          const { pickMedia } = await import('./modules/media.js');
          const picked = await pickMedia({ favicon: f.favicon });
          if (picked) { current = picked.id; onInput(); showPreview(); }
        } });
        const clear = f.required ? null : h('button', { class: 'btn ghost small', type: 'button', text: 'Remove', onclick: () => { current = null; onInput(); showPreview(); } });
        wrap.append(h('span', { class: 'label', text: f.label + (f.required ? ' *' : '') }), h('div', { class: 'media-field' }, preview, h('div', {}, info, h('div', { class: 'btn-row' }, choose, clear))));
        showPreview();
        getters[f.name] = () => current;
        break;
      }
      case 'items': {
        const sub = f.fields;
        const list = h('div', { class: 'repeater' });
        const rows = [];
        const addRow = (val = {}) => {
          const form2 = buildForm(sub, val, { onChange: onInput });
          const item = h('div', { class: 'repeater-item' });
          const tools = h('div', { class: 'item-tools' },
            h('button', { class: 'icon-btn small', type: 'button', title: 'Move up', 'aria-label': 'Move up', text: '↑', onclick: () => move(item, -1) }),
            h('button', { class: 'icon-btn small', type: 'button', title: 'Move down', 'aria-label': 'Move down', text: '↓', onclick: () => move(item, 1) }),
            f.fixed ? null : h('button', { class: 'icon-btn small', type: 'button', title: 'Remove', 'aria-label': 'Remove item', text: '✕', onclick: () => {
              if (rows.length <= (f.min || 0)) return alertMin();
              const i = rows.findIndex(r => r.item === item); rows.splice(i, 1); item.remove(); onInput();
            } }));
          item.append(tools, form2.el);
          rows.push({ item, form: form2 });
          list.append(item);
        };
        const alertMin = () => { wrap.querySelector('.field-error')?.remove(); wrap.append(h('div', { class: 'field-error', text: `At least ${f.min} item(s) required.` })); };
        const move = (item, dir) => {
          const i = rows.findIndex(r => r.item === item); const j = i + dir;
          if (j < 0 || j >= rows.length) return;
          [rows[i], rows[j]] = [rows[j], rows[i]];
          list.replaceChildren(...rows.map(r => r.item)); onInput();
        };
        (Array.isArray(v) ? v : []).forEach(addRow);
        wrap.append(h('span', { class: 'label', text: f.label }), f.hint ? h('p', { class: 'hint', text: f.hint }) : null, list);
        if (!f.fixed) wrap.append(h('button', { class: 'btn ghost small', type: 'button', text: '+ Add ' + (f.itemLabel || 'item'), onclick: () => { if (rows.length >= (f.max || 50)) return; addRow({}); onInput(); } }));
        getters[f.name] = () => rows.map(r => r.form.getValues());
        fieldEls[f.name + '__rows'] = rows;
        break;
      }
      default: { // text, url, slug, number, color, date, email
        const type = f.type === 'number' ? 'number' : f.type === 'color' ? 'color' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text';
        input = h('input', { id: fid, type, maxlength: f.max ? f.max + 50 : null, oninput: onInput, readonly: f.readonly, placeholder: f.placeholder || null, inputmode: f.inputmode || null, autocomplete: 'off', spellcheck: f.type === 'slug' || f.type === 'url' ? 'false' : null });
        input.value = v ?? f.default ?? '';
        wrap.append(h('div', {}, label(), counter(input, f.type === 'text' ? f.max : null)), input);
        if (f.type === 'slug') {
          const src = () => getters[f.from]?.();
          let touched = !!v;
          input.addEventListener('input', () => { touched = true; });
          opts.slugSync = () => { if (!touched && f.from) { input.value = slugify(src()); } };
          wrap.append(h('div', { class: 'md-help', text: 'Lower-case letters, numbers and hyphens. Changing it later keeps the old link working (automatic redirect).' }));
        }
        if (f.type === 'url') wrap.append(h('div', { class: 'md-help', text: 'A page on this site (e.g. contact.html), an https:// link, tel: or mailto:.' }));
        getters[f.name] = () => f.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value.trim();
      }
    }
    if (f.hint && !['boolean', 'items'].includes(f.type)) wrap.append(h('span', { class: 'hint', text: f.hint }));
    fieldEls[f.name] = wrap;
    form.append(wrap);
  }
  // keep slug in step with its source until edited by hand
  form.addEventListener('input', () => opts.slugSync?.());

  const getValues = () => Object.fromEntries(Object.entries(getters).map(([k, g]) => [k, g()]));
  const validate = () => {
    $$('.field-error', form).forEach(e => e.remove());
    $$('.has-error', form).forEach(e => e.classList.remove('has-error'));
    const vals = getValues();
    const errors = [];
    const fail = (name, msg) => { errors.push({ name, msg }); const w = fieldEls[name]; if (w) { w.classList.add('has-error'); w.append(h('div', { class: 'field-error', text: msg })); } };
    for (const f of fields) {
      if (f.type === 'heading') continue;
      const v = vals[f.name];
      if (f.type === 'items') {
        const rows = fieldEls[f.name + '__rows'] || [];
        if (f.min && rows.length < f.min) fail(f.name, `At least ${f.min} item(s) required.`);
        rows.forEach(r => errors.push(...r.form.validate()));
        continue;
      }
      if (f.required && (v == null || v === '' || (Array.isArray(v) && !v.length))) { fail(f.name, 'This field is required.'); continue; }
      if (typeof v === 'string') {
        if (f.max && v.length > f.max) fail(f.name, `Too long: ${v.length} characters (max ${f.max}).`);
        if (f.min && v.length && v.length < f.min) fail(f.name, `Too short (min ${f.min} characters).`);
        if (['text', 'textarea', 'rich', 'md', 'lines'].includes(f.type) && HTML_RE.test(v)) fail(f.name, 'HTML tags are not allowed. Use plain text (and the link format shown).');
        if (f.type === 'url' && v && !isSafeUrl(v)) fail(f.name, 'Use a page on this site (e.g. contact.html), an https:// link, tel: or mailto:.');
        if (f.type === 'slug' && v && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) fail(f.name, 'Use lower-case letters, numbers and single hyphens only.');
        if (f.type === 'email' && v && !/^[^@\s<>]+@[^@\s<>]+\.[a-z]{2,}$/i.test(v)) fail(f.name, 'Enter a valid email address.');
        if (f.pattern && v && !f.pattern.test(v)) fail(f.name, f.patternMsg || 'Invalid format.');
        if (['rich', 'md'].includes(f.type)) {
          const bad = [...v.matchAll(/\[[^\]]*\]\(([^)]*)\)/g)].map(m => m[1]).filter(u => !isSafeUrl(u));
          if (bad.length) fail(f.name, `Link not allowed: ${bad[0]}`);
        }
      }
      if (Array.isArray(v) && f.type === 'lines') {
        if (f.maxItems && v.length > f.maxItems) fail(f.name, `At most ${f.maxItems} items.`);
        if (f.itemMax && v.some(x => x.length > f.itemMax)) fail(f.name, `Each item can be at most ${f.itemMax} characters.`);
        if (v.some(x => HTML_RE.test(x))) fail(f.name, 'HTML tags are not allowed.');
      }
      if (f.type === 'json' && v === Symbol.for('invalid-json')) fail(f.name, 'This is not valid JSON.');
      if (f.type === 'number' && v != null && (Number.isNaN(v) || (f.minValue != null && v < f.minValue) || (f.maxValue != null && v > f.maxValue))) fail(f.name, 'Enter a valid number.');
      if (f.validate) { const m = f.validate(v, vals); if (m) fail(f.name, m); }
    }
    if (errors.length && opts.scrollToError !== false) setTimeout(() => $('.has-error', form)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 10);
    return errors;
  };
  return { el: form, getValues, validate, fields: fieldEls };
}
