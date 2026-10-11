// Page sections: edit text, buttons, images and lists on each page.
// Homepage sections can also be hidden and reordered. The hero is locked.
import { h, toast, confirmDialog, pill, fmtDateTime } from '../ui.js';
import { ctx, q, can, pageHead, forbidden, markDirty, previewUrl } from '../core.js';
import { buildForm } from '../fields.js';

const PAGES = [
  ['index', 'Home', 'index.html'], ['treatments', 'Treatments', 'treatments.html'], ['doctors', 'Our Doctors', 'doctors.html'],
  ['why-us', 'Why Us', 'why-us.html'], ['clinic', 'Clinic', 'clinic.html'], ['contact', 'Contact', 'contact.html'],
];
const LINKED = {
  'index.treatments': ['Treatment cards come from', 'treatments', 'Treatments'],
  'index.stories': ['Review cards come from', 'testimonials', 'Testimonials'],
  'index.find_us': ['Address, hours and WhatsApp come from', 'settings/contact', 'Website settings'],
  'treatments.featured': ['Treatment rows come from', 'treatments', 'Treatments'],
  'treatments.more': ['Cards come from', 'treatments', 'Treatments'],
  'treatments.cases': ['Photos come from', 'gallery', 'Gallery'],
  'doctors.team': ['Doctor cards come from', 'doctors', 'Doctors & staff'],
  'clinic.photos': ['Photos come from', 'gallery', 'Gallery'],
  'clinic.team': ['The team list comes from', 'doctors', 'Doctors & staff'],
  'clinic.location': ['The address comes from', 'settings/contact', 'Website settings'],
  'contact.faq': ['Questions come from', 'faqs', 'FAQs'],
  'contact.address': ['Address and opening hours come from', 'settings/hours', 'Website settings'],
};

export async function render(content, params) {
  if (!can.editContent()) return forbidden(content, 'page content');
  const [page, key] = params;
  if (page && key) return editSection(content, page, key);
  if (page) return pageSections(content, page);
  const rows = await q(ctx.sb.from('page_sections').select('page,draft_content,is_visible'));
  content.replaceChildren(pageHead('Pages & sections', 'Edit the text, buttons and images on each page. Lists such as treatments, doctors and reviews are edited in their own sections.'),
    h('div', { class: 'sections-list' }, ...PAGES.map(([id, label, file]) => {
      const mine = rows.filter(r => r.page === id);
      const pend = mine.filter(r => r.draft_content).length;
      return h('a', { class: 'section-row', href: `#/pages/${id}` }, h('div', { class: 'name' }, h('strong', { text: label }), h('small', { text: `${file} · ${mine.length} sections` })), pend ? pill('pending', `${pend} unpublished`) : null, h('span', { 'aria-hidden': 'true', text: '›' }));
    })));
}

async function pageSections(content, page) {
  const meta = PAGES.find(p => p[0] === page);
  if (!meta) { location.hash = '#/pages'; return; }
  const rows = await q(ctx.sb.from('page_sections').select('id,key,label,sort_order,is_visible,is_locked,can_hide,can_reorder,draft_content,updated_at').eq('page', page).order('sort_order'));
  const listEl = h('div', { class: 'sections-list' });
  const draw = () => listEl.replaceChildren(...rows.map((r, i) => {
    const row = h('div', { class: 'section-row' + (r.is_visible ? '' : ' is-hidden') });
    const name = h('div', { class: 'name' }, h('strong', { text: r.label }), h('small', { text: r.is_locked ? 'Locked to preserve the design. It cannot be edited, hidden or moved.' : (r.is_visible ? 'Visible' : 'Hidden from visitors') + ` · updated ${fmtDateTime(r.updated_at)}` }));
    const tools = h('div', { class: 'btn-row' });
    if (r.is_locked) tools.append(pill('locked', 'locked'));
    if (r.draft_content) tools.append(pill('pending', 'unpublished changes'));
    if (r.can_reorder) {
      tools.append(h('button', { class: 'icon-btn small', type: 'button', 'aria-label': `Move ${r.label} up`, text: '↑', disabled: i <= 1 || rows[i - 1].is_locked, onclick: () => move(i, -1) }));
      tools.append(h('button', { class: 'icon-btn small', type: 'button', 'aria-label': `Move ${r.label} down`, text: '↓', disabled: i >= rows.length - 1, onclick: () => move(i, 1) }));
    }
    if (r.can_hide) tools.append(h('button', { class: 'btn ghost small', type: 'button', text: r.is_visible ? 'Hide' : 'Show', onclick: () => toggle(r) }));
    if (!r.is_locked) tools.append(h('a', { class: 'btn small', href: `#/pages/${page}/${r.key}`, text: 'Edit' }));
    row.append(name, tools);
    return row;
  }));
  const move = async (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length || rows[j].is_locked || rows[i].is_locked) return;
    const a = rows[i], b = rows[j];
    try {
      await q(ctx.sb.from('page_sections').update({ sort_order: b.sort_order }).eq('id', a.id));
      await q(ctx.sb.from('page_sections').update({ sort_order: a.sort_order }).eq('id', b.id));
      [a.sort_order, b.sort_order] = [b.sort_order, a.sort_order];
      rows.sort((x, y) => x.sort_order - y.sort_order);
      draw(); toast('Section order saved. The homepage is updated.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
  const toggle = async r => {
    if (r.is_visible && !(await confirmDialog(`Hide “${r.label}”?`, 'Visitors will no longer see this section. You can show it again at any time.', 'Hide section'))) return;
    try { await q(ctx.sb.from('page_sections').update({ is_visible: !r.is_visible }).eq('id', r.id)); r.is_visible = !r.is_visible; draw(); toast(r.is_visible ? 'Section shown.' : 'Section hidden.', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
  draw();
  content.replaceChildren(h('div', { class: 'crumb' }, h('a', { href: '#/pages', text: '← Pages' })),
    pageHead(meta[1] + ' page', page === 'index' ? 'Edit, hide or reorder homepage sections. Hide/show and order changes are applied immediately.' : 'Edit the sections on this page.',
      h('a', { class: 'btn ghost', href: '../' + meta[2], target: '_blank', rel: 'noopener', text: 'View page ↗' }),
      h('a', { class: 'btn ghost', href: previewUrl(meta[2]), target: '_blank', rel: 'noopener', text: 'Preview drafts ↗' })),
    listEl);
}

async function editSection(content, page, key) {
  const row = await q(ctx.sb.from('page_sections').select('*').eq('page', page).eq('key', key).maybeSingle());
  if (!row || row.is_locked) { content.replaceChildren(pageHead('Section not editable'), h('p', {}, h('a', { href: `#/pages/${page}`, text: '← Back' }))); return; }
  const meta = PAGES.find(p => p[0] === page);
  const fields = (row.schema || []).map(toField);
  const values = { ...row.content, ...(row.draft_content || {}) };
  const form = buildForm(fields, values);
  let loaded = row;
  const linked = LINKED[`${page}.${key}`];

  const collect = () => {
    if (form.validate().length) { toast('Please fix the highlighted fields.', 'err'); return null; }
    return form.getValues();
  };
  const write = async (patch, msg) => {
    const rows = await q(ctx.sb.from('page_sections').update(patch).eq('id', loaded.id).eq('updated_at', loaded.updated_at).select('*'));
    if (!rows.length) throw new Error('Someone else changed this section since you opened it. Reload to see their changes.');
    loaded = rows[0]; markDirty(false); toast(msg, 'ok');
    editSection(content, page, key);
  };
  const guard = fn => async e => { const b = e.currentTarget; b.disabled = true; try { await fn(); } catch (err) { toast(err.message, 'err'); } finally { b.disabled = false; } };
  const anchor = { index: '', treatments: '', doctors: '', 'why-us': '', clinic: '', contact: '' }[page];

  const actions = [
    h('button', { class: 'btn ghost', type: 'button', text: 'Save draft', onclick: guard(async () => { const v = collect(); if (v) await write({ draft_content: v }, 'Draft saved. Visitors still see the published version.'); }) }),
    h('button', { class: 'btn success', type: 'button', text: 'Publish', onclick: guard(async () => {
      const v = collect(); if (!v) return;
      if (!(await confirmDialog('Publish this section?', 'The live page will be updated with these changes.', 'Publish', false))) return;
      await write({ content: { ...row.content, ...v }, draft_content: null }, 'Published. The page updates within about a minute.');
    }) }),
    h('button', { class: 'btn ghost', type: 'button', text: 'Preview on page ↗', onclick: guard(async () => {
      const v = collect(); if (!v) return;
      if (JSON.stringify(v) !== JSON.stringify({ ...row.content, ...(row.draft_content || {}) }) || !row.draft_content) {
        const rows = await q(ctx.sb.from('page_sections').update({ draft_content: v }).eq('id', loaded.id).eq('updated_at', loaded.updated_at).select('*'));
        if (!rows.length) throw new Error('Someone else changed this section. Reload first.');
        loaded = rows[0]; markDirty(false);
      }
      window.open(previewUrl(meta[2] + anchor), '_blank', 'noopener');
    }) }),
  ];
  if (row.draft_content) actions.push(h('button', { class: 'btn ghost', type: 'button', text: 'Discard unpublished changes', onclick: guard(async () => {
    if (!(await confirmDialog('Discard changes?', 'The unpublished changes will be deleted.', 'Discard'))) return;
    await write({ draft_content: null }, 'Unpublished changes discarded.');
  }) }));

  content.replaceChildren(
    h('div', { class: 'crumb' }, h('a', { href: `#/pages/${page}`, text: `← ${meta[1]} page` })),
    pageHead(row.label, `${meta[2]} · section “${key}”`),
    row.draft_content ? h('div', { class: 'banner warn', text: 'This section has unpublished changes. Visitors still see the published version.' }) : null,
    linked ? h('div', { class: 'banner info' }, `${linked[0]} `, h('a', { href: '#/' + linked[1], text: linked[2] }), '. This form edits the headings and text around them.') : null,
    h('div', { class: 'editor' }, h('div', { class: 'panel' }, form.el),
      h('aside', { class: 'editor-side' }, h('div', { class: 'panel' },
        h('div', { class: 'statusline' }, pill(row.is_visible ? 'published' : 'archived', row.is_visible ? 'visible' : 'hidden'), row.draft_content ? pill('pending', 'unpublished changes') : null),
        h('p', { class: 'small muted', text: `Last published ${fmtDateTime(row.published_at)}` }),
        h('div', { class: 'btn-row' }, ...actions)))));
}

// Section schemas are stored with the section in the database.
function toField(s) {
  const base = { name: s.name, label: s.label };
  switch (s.type) {
    case 'list': return { ...base, type: 'items', fields: s.fields.map(toField), min: s.min || 1, max: s.max || 12, fixed: !!s.fixed, itemLabel: 'item', hint: s.fixed ? 'This list has a fixed number of items to match the design.' : null };
    case 'image': return { ...base, type: 'media', required: true };
    case 'url': return { ...base, type: 'url', required: true, max: 300 };
    case 'boolean': return { ...base, type: 'boolean' };
    case 'rich': return { ...base, type: 'rich', required: true, max: 1000 };
    case 'textarea': return { ...base, type: 'textarea', required: !/note|footnote|hint|disclaimer/.test(s.name), max: 600 };
    default: return { ...base, type: 'text', required: !/note|eyebrow|hint/.test(s.name), max: /heading|title/.test(s.name) ? 140 : 300 };
  }
}
