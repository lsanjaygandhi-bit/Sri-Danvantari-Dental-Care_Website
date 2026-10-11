// Doctors, treatments, categories, testimonials, gallery and FAQs.
// Workflow: Draft → Preview → Publish → Edit (saved as pending changes) → Unpublish / Archive.
import { h, $, toast, confirmDialog, dataTable, pill, fmtDateTime, debounce, slugify } from '../ui.js';
import { ctx, q, can, pageHead, forbidden, markDirty, mediaUrl, previewUrl } from '../core.js';
import { buildForm } from '../fields.js';

const STATUS_FILTER = [['', 'All statuses'], ['published', 'Published'], ['draft', 'Draft'], ['archived', 'Archived'], ['pending', 'Has unpublished changes']];

const CONFIG = {
  doctors: {
    table: 'doctors', title: 'Doctors & staff', single: 'profile', workflow: true,
    subtitle: 'Doctor and clinic staff profiles shown on the Doctors page, the Clinic page and profile pages.',
    select: '*, photo:media_assets!doctors_photo_id_fkey(id,static_path,storage_path)',
    order: ['sort_order', 'name'],
    label: r => r.name,
    search: r => `${r.name} ${r.qualifications} ${r.designation} ${r.slug}`,
    columns: [
      { label: 'Photo', render: r => thumb(r.photo) },
      { label: 'Name', render: r => h('div', {}, h('strong', { text: r.name }), h('div', { class: 'small muted', text: [r.qualifications, r.designation].filter(Boolean).join(' · ') })) },
      { label: 'Type', render: r => r.kind === 'staff' ? 'Staff' : 'Doctor' },
    ],
    preview: v => v.legacy_page ? v.legacy_page : `doctor.html?slug=${encodeURIComponent(v.slug)}`,
    fields: () => [
      { name: 'name', label: 'Full name', type: 'text', required: true, max: 100, min: 2 },
      { name: 'slug', label: 'URL slug', type: 'slug', from: 'name', required: true, max: 80 },
      { name: 'kind', label: 'Profile type', type: 'select', options: [['doctor', 'Doctor'], ['staff', 'Clinic staff']], default: 'doctor' },
      { name: 'qualifications', label: 'Qualifications', type: 'text', max: 120, hint: 'For example: BDS, MDS. Shown before the designation.' },
      { name: 'designation', label: 'Designation / role', type: 'text', max: 120, hint: 'For example: Dental Surgeon.' },
      { name: 'specialisations', label: 'Specialisations', type: 'lines', maxItems: 20, itemMax: 80, hint: 'Shown as a list on the profile page when filled in.' },
      { name: 'experience', label: 'Experience', type: 'text', max: 120, hint: 'For example: 15 years. Shown on the profile page when filled in. Only publish verified details.' },
      { name: 'card_text', label: 'Short summary (card)', type: 'textarea', max: 400 },
      { name: 'bio', label: 'Biography / profile text', type: 'md', max: 8000, hint: 'Use :::note Title on its own line, then list items, then ::: to show a highlighted box.' },
      { type: 'heading', label: 'Photograph' },
      { name: 'photo_id', label: 'Photo', type: 'media' },
      { name: 'photo_alt', label: 'Photo description (alt text)', type: 'text', max: 200, hint: 'Describe the photo for screen-reader users, e.g. "Dr. Name at the clinic".' },
      { name: 'initials', label: 'Initials (shown when there is no photo)', type: 'text', max: 3 },
      { name: 'photo_placeholder', label: 'Text shown when there is no photo', type: 'text', max: 40, default: 'Photo not provided' },
      { type: 'heading', label: 'Search engines' },
      { name: 'seo_title', label: 'Page title', type: 'text', max: 120 },
      { name: 'seo_description', label: 'Meta description', type: 'textarea', max: 320 },
      { name: 'noindex', label: 'Hide this profile from search engines (noindex)', type: 'boolean' },
      { name: 'sort_order', label: 'Display order', type: 'number', default: 100, hint: 'Lower numbers appear first.' },
    ],
  },
  treatments: {
    table: 'treatments', title: 'Treatments', single: 'treatment', workflow: true,
    subtitle: 'Treatments on the Home and Treatments pages, and individual treatment pages.',
    select: '*, image:media_assets!treatments_image_id_fkey(id,static_path,storage_path), category:treatment_categories(name)',
    order: ['sort_order', 'title'],
    label: r => r.title,
    search: r => `${r.title} ${r.slug} ${r.category?.name || ''}`,
    columns: [
      { label: 'Image', render: r => thumb(r.image) },
      { label: 'Treatment', render: r => h('div', {}, h('strong', { text: r.title }), h('div', { class: 'small muted', text: r.category?.name || 'No category' })) },
      { label: 'Shown as', render: r => (r.display === 'featured' ? 'Featured' : 'More treatments') + (r.show_on_home ? ' · Home' : '') },
    ],
    preview: v => `treatment.html?slug=${encodeURIComponent(v.slug)}`,
    previewAlt: () => 'treatments.html',
    fields: async () => {
      const cats = await q(ctx.sb.from('treatment_categories').select('id,name').order('sort_order'));
      const booking = await q(ctx.sb.from('site_settings').select('value').eq('key', 'booking').maybeSingle());
      const opts = booking?.value?.treatment_options || [];
      return [
        { name: 'title', label: 'Treatment name', type: 'text', required: true, max: 120, min: 2 },
        { name: 'slug', label: 'URL slug', type: 'slug', from: 'title', required: true, max: 80 },
        { name: 'category_id', label: 'Category', type: 'select', nullable: true, options: [['', 'No category'], ...cats.map(c => [c.id, c.name])] },
        { name: 'display', label: 'Show on the Treatments page as', type: 'select', options: [['featured', 'Featured (large row with image)'], ['more', 'More treatments (small card)']], default: 'more' },
        { name: 'show_on_home', label: 'Show as a card on the homepage', type: 'boolean' },
        { name: 'card_summary', label: 'Short summary (cards)', type: 'textarea', max: 400 },
        { name: 'description', label: 'Description', type: 'md', max: 4000 },
        { name: 'benefits', label: 'Benefits', type: 'lines', maxItems: 20, itemMax: 200 },
        { name: 'procedure_details', label: 'Procedure details', type: 'md', max: 6000 },
        { name: 'consult_questions', label: 'Questions to ask at the consultation', type: 'lines', maxItems: 12, itemMax: 200 },
        { name: 'faqs', label: 'Treatment FAQs', type: 'items', itemLabel: 'question', max: 20, fields: [
          { name: 'q', label: 'Question', type: 'text', required: true, max: 200 },
          { name: 'a', label: 'Answer', type: 'rich', required: true, max: 1500 }] },
        { type: 'heading', label: 'Image and booking' },
        { name: 'image_id', label: 'Image', type: 'media' },
        { name: 'image_alt', label: 'Image description (alt text)', type: 'text', max: 300 },
        { name: 'booking_value', label: 'Pre-select in the booking form', type: 'select', options: [['', 'Nothing (general)'], ...opts.map(o => [o, o])], hint: 'Options come from Website settings → Booking.' },
        { name: 'cta_label', label: 'Button label', type: 'text', max: 60, required: true, default: 'Ask about this treatment' },
        { type: 'heading', label: 'Search engines', hint: 'Used on the individual treatment page (treatment.html?slug=…).' },
        { name: 'seo_title', label: 'Page title', type: 'text', max: 120 },
        { name: 'seo_description', label: 'Meta description', type: 'textarea', max: 320 },
        { name: 'og_image_id', label: 'Social sharing image', type: 'media' },
        { name: 'noindex', label: 'Hide this treatment page from search engines (noindex)', type: 'boolean' },
        { name: 'sort_order', label: 'Display order', type: 'number', default: 100, hint: 'Lower numbers appear first.' },
      ];
    },
  },
  categories: {
    table: 'treatment_categories', title: 'Treatment categories', single: 'category', workflow: false,
    subtitle: 'Used to group treatments in the dashboard and on treatment pages.',
    select: '*', order: ['sort_order', 'name'], label: r => r.name, search: r => r.name,
    columns: [{ label: 'Name', key: 'name' }, { label: 'Slug', key: 'slug' }, { label: 'Order', key: 'sort_order' }],
    fields: () => [
      { name: 'name', label: 'Category name', type: 'text', required: true, max: 80, min: 2 },
      { name: 'slug', label: 'Slug', type: 'slug', from: 'name', required: true, max: 80 },
      { name: 'sort_order', label: 'Display order', type: 'number', default: 100 },
    ],
  },
  testimonials: {
    table: 'testimonials', title: 'Testimonials', single: 'testimonial', workflow: true,
    subtitle: 'Patient feedback in the homepage carousel. Publish only feedback the patient agreed to share.',
    select: '*', order: ['sort_order', 'created_at'], label: r => r.author_name,
    search: r => `${r.author_name} ${r.quote}`,
    columns: [
      { label: 'Patient', render: r => h('div', {}, h('strong', { text: r.author_name }), h('div', { class: 'small muted', text: r.label })) },
      { label: 'Feedback', render: r => r.quote.length > 110 ? r.quote.slice(0, 110) + '…' : r.quote },
      { label: 'Consent', render: r => ({ written_consent: 'Written consent', public_google_review: 'Public Google review', not_confirmed: '⚠ Not confirmed' })[r.consent_basis] },
    ],
    preview: () => 'index.html#stories',
    fields: () => [
      { name: 'author_name', label: 'Patient name (as it should appear)', type: 'text', required: true, max: 80 },
      { name: 'initials', label: 'Initials for the avatar', type: 'text', max: 3, hint: 'Leave empty to use the first and last initials.' },
      { name: 'quote', label: 'Feedback', type: 'textarea', required: true, max: 1200, min: 5, hint: 'Do not add quotation marks; they are added automatically.' },
      { name: 'label', label: 'Small label', type: 'text', max: 80, default: 'Patient feedback', hint: 'For example: Patient feedback · 3 months ago' },
      { name: 'source', label: 'Source (internal)', type: 'text', max: 120 },
      { name: 'consent_basis', label: 'Consent', type: 'select', required: true, options: [['not_confirmed', 'Not confirmed — cannot be published'], ['written_consent', 'Patient gave written consent'], ['public_google_review', 'Public Google review shared by the patient']], default: 'not_confirmed' },
      { name: 'consent_note', label: 'Consent notes (internal)', type: 'textarea', max: 500 },
      { name: 'sort_order', label: 'Display order', type: 'number', default: 100 },
    ],
    beforePublish: v => v.consent_basis === 'not_confirmed' ? 'Record how consent was obtained before publishing this testimonial.' : null,
  },
  gallery: {
    table: 'gallery_items', title: 'Gallery', single: 'photo', workflow: true,
    subtitle: 'Clinic photographs (Clinic page) and treatment case examples (Treatments page).',
    select: '*, media:media_assets(id,static_path,storage_path,contains_patient,patient_consent)', order: ['gallery', 'sort_order'],
    label: r => r.title || 'Untitled photo', search: r => `${r.title} ${r.caption} ${r.gallery}`,
    filters: [['gallery', [['', 'All galleries'], ['clinic', 'Clinic photos'], ['cases', 'Case examples']]]],
    columns: [
      { label: 'Image', render: r => thumb(r.media) },
      { label: 'Title', render: r => h('div', {}, h('strong', { text: r.title || 'Untitled' }), h('div', { class: 'small muted', text: r.caption })) },
      { label: 'Gallery', render: r => r.gallery === 'clinic' ? 'Clinic photos' : 'Case examples' },
      { label: 'Consent', render: r => r.media?.contains_patient ? (r.media.patient_consent ? 'Patient consent recorded' : '⚠ Patient image, no consent') : 'No identifiable patient' },
    ],
    preview: v => v.gallery === 'cases' ? 'treatments.html' : 'clinic.html',
    fields: () => [
      { name: 'gallery', label: 'Gallery', type: 'select', options: [['clinic', 'Clinic photos (Clinic page)'], ['cases', 'Treatment case examples (Treatments page)']], default: 'clinic' },
      { name: 'media_id', label: 'Image', type: 'media', required: true },
      { name: 'title', label: 'Title', type: 'text', max: 120 },
      { name: 'caption', label: 'Caption', type: 'text', max: 300 },
      { name: 'alt_text', label: 'Image description (alt text)', type: 'text', max: 300, required: true },
      { name: 'sort_order', label: 'Display order', type: 'number', default: 100 },
    ],
  },
  faqs: {
    table: 'faqs', title: 'FAQs', single: 'question', workflow: true,
    subtitle: 'Frequently asked questions on the Contact page.',
    select: '*', order: ['sort_order'], label: r => r.question, search: r => `${r.question} ${r.answer}`,
    columns: [{ label: 'Question', render: r => h('strong', { text: r.question }) }, { label: 'Answer', render: r => r.answer.length > 120 ? r.answer.slice(0, 120) + '…' : r.answer }],
    preview: () => 'contact.html',
    fields: () => [
      { name: 'question', label: 'Question', type: 'text', required: true, max: 200, min: 3 },
      { name: 'answer', label: 'Answer', type: 'rich', required: true, max: 2000, min: 3 },
      { name: 'sort_order', label: 'Display order', type: 'number', default: 100 },
    ],
  },
};

function thumb(m) {
  const url = mediaUrl(m);
  return url ? h('img', { class: 'thumb', src: url, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb', 'aria-hidden': 'true' });
}
const statusCell = r => h('div', { class: 'statusline' }, pill(r.status), r.draft_data ? pill('pending', 'unpublished changes') : null);

export async function render(content, params, name, query) {
  if (!can.editContent()) return forbidden(content, 'website content');
  const cfg = CONFIG[name];
  if (params[0]) return editor(content, cfg, name, params[0]);
  return list(content, cfg, name, query);
}

// ------------------------------------------------------------- list -------
async function list(content, cfg, name, query) {
  const [col, col2] = cfg.order;
  let req = ctx.sb.from(cfg.table).select(cfg.select).order(col, { ascending: true });
  if (col2) req = req.order(col2, { ascending: true });
  const rows = await q(req);
  const search = h('input', { type: 'search', placeholder: 'Search…', 'aria-label': 'Search' });
  const status = cfg.workflow ? h('select', { 'aria-label': 'Filter by status' }, ...STATUS_FILTER.map(([v, t]) => { const o = h('option', { text: t }); o.value = v; return o; })) : null;
  if (status && query?.get('status')) status.value = query.get('status');
  const extra = (cfg.filters || []).map(([key, opts]) => {
    const s = h('select', { 'aria-label': 'Filter' }, ...opts.map(([v, t]) => { const o = h('option', { text: t }); o.value = v; return o; }));
    s.dataset.key = key; return s;
  });
  const columns = [...cfg.columns];
  if (cfg.workflow) columns.push({ label: 'Status', render: statusCell });
  columns.push({ label: 'Updated', render: r => fmtDateTime(r.updated_at) });
  columns.push({ label: '', class: 'actions', render: r => h('a', { class: 'btn ghost small', href: `#/${name}/${r.id}`, text: 'Edit' }) });
  const table = dataTable({ columns, rows, onRowClick: r => { location.hash = `#/${name}/${r.id}`; }, empty: `No ${cfg.title.toLowerCase()} yet.` });
  const apply = () => {
    const term = search.value.trim().toLowerCase();
    const st = status?.value;
    table.update(rows.filter(r => (!term || cfg.search(r).toLowerCase().includes(term))
      && (!st || (st === 'pending' ? !!r.draft_data : r.status === st))
      && extra.every(s => !s.value || r[s.dataset.key] === s.value)));
  };
  search.addEventListener('input', debounce(apply, 150));
  status?.addEventListener('change', apply);
  extra.forEach(s => s.addEventListener('change', apply));
  apply();
  content.replaceChildren(
    pageHead(cfg.title, cfg.subtitle, h('a', { class: 'btn', href: `#/${name}/new`, text: `+ Add ${cfg.single}` })),
    h('div', { class: 'toolbar' }, h('div', { class: 'grow' }, search), status, ...extra),
    table.el);
}

// ----------------------------------------------------------- editor -------
async function editor(content, cfg, name, id) {
  const isNew = id === 'new';
  const row = isNew ? null : await q(ctx.sb.from(cfg.table).select('*').eq('id', id).maybeSingle());
  if (!isNew && !row) { content.replaceChildren(pageHead('Not found'), h('p', {}, h('a', { href: `#/${name}`, text: '← Back to list' }))); return; }
  const fields = await cfg.fields();
  const names = fields.filter(f => f.name).map(f => f.name);
  const pending = row?.draft_data || null;
  const values = { ...(row || {}), ...(pending || {}) };
  const form = buildForm(fields, values);
  let loaded = row;

  const status = row?.status || 'draft';
  const isPublished = status === 'published';
  const msg = h('div');
  const banners = [];
  if (pending) banners.push(h('div', { class: 'banner warn', text: 'This item has saved changes that are not published yet. Visitors still see the published version. Use Preview to check, then Publish changes.' }));
  if (status === 'archived') banners.push(h('div', { class: 'banner info', text: 'This item is archived and hidden from the website.' }));

  const collect = () => {
    const errs = form.validate();
    if (errs.length) { toast('Please fix the highlighted fields.', 'err'); return null; }
    const v = form.getValues();
    const out = {};
    for (const n of names) out[n] = v[n];
    return out;
  };

  // Every write includes the version we loaded, so two people editing at once cannot silently overwrite each other.
  const write = async (patch, label) => {
    let res;
    if (isNew) res = await q(ctx.sb.from(cfg.table).insert(patch).select('*').single());
    else {
      const rows = await q(ctx.sb.from(cfg.table).update(patch).eq('id', loaded.id).eq('updated_at', loaded.updated_at).select('*'));
      if (!rows.length) throw new Error('Someone else changed this item since you opened it. Reload the page to see their changes, then try again.');
      res = rows[0];
    }
    markDirty(false);
    toast(label, 'ok');
    return res;
  };
  const go = r => { location.hash = `#/${name}/${r.id}`; if (!isNew) render(content, [r.id], name); };
  const guard = fn => async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try { await fn(); } catch (err) { toast(err.message, 'err'); } finally { btn.disabled = false; }
  };
  const slugCheck = async v => {
    if (!('slug' in v) || cfg.table === 'treatment_categories') return true;
    const entity = cfg.table === 'treatments' ? 'treatment' : 'doctor';
    const clash = await q(ctx.sb.from(cfg.table).select('id').eq('slug', v.slug).neq('id', loaded?.id || '00000000-0000-0000-0000-000000000000'));
    if (clash.length) { toast('That URL slug is already used. Choose a different one.', 'err'); return false; }
    if (loaded && loaded.slug !== v.slug) {
      const redirect = await q(ctx.sb.from('slug_redirects').select('new_slug').eq('entity', entity).eq('old_slug', v.slug).maybeSingle());
      const ok = await confirmDialog('Change the URL?', `The address will change from “${loaded.slug}” to “${v.slug}”. Old links will redirect automatically.${redirect ? ` (“${v.slug}” was used before and currently redirects to “${redirect.new_slug}”; that redirect will be removed.)` : ''}`, 'Change URL', false);
      if (!ok) return false;
    }
    return true;
  };

  const actions = [];
  if (!cfg.workflow) {
    actions.push(h('button', { class: 'btn', type: 'button', text: isNew ? 'Create' : 'Save changes', onclick: guard(async () => {
      const v = collect(); if (!v || !(await slugCheck(v))) return;
      go(await write(v, 'Saved.'));
    }) }));
  } else if (!isPublished) {
    actions.push(h('button', { class: 'btn ghost', type: 'button', text: 'Save draft', onclick: guard(async () => {
      const v = collect(); if (!v || !(await slugCheck(v))) return;
      go(await write({ ...v, draft_data: null, ...(isNew ? { status: 'draft' } : {}) }, 'Draft saved. It is not visible on the website.'));
    }) }));
    actions.push(h('button', { class: 'btn success', type: 'button', text: 'Publish', onclick: guard(async () => {
      const v = collect(); if (!v || !(await slugCheck(v))) return;
      const problem = cfg.beforePublish?.(v); if (problem) return toast(problem, 'err');
      if (!(await confirmDialog('Publish?', 'This will make it visible on the public website.', 'Publish', false))) return;
      go(await write({ ...v, draft_data: null, status: 'published' }, 'Published. Visible on the website within about a minute.'));
    }) }));
  } else {
    actions.push(h('button', { class: 'btn ghost', type: 'button', text: 'Save changes as draft', onclick: guard(async () => {
      const v = collect(); if (!v || !(await slugCheck(v))) return;
      go(await write({ draft_data: v }, 'Changes saved as a draft. The website still shows the published version.'));
    }) }));
    actions.push(h('button', { class: 'btn success', type: 'button', text: pending ? 'Publish changes' : 'Publish', onclick: guard(async () => {
      const v = collect(); if (!v || !(await slugCheck(v))) return;
      const problem = cfg.beforePublish?.(v); if (problem) return toast(problem, 'err');
      if (!(await confirmDialog('Publish changes?', 'The website will be updated with these changes.', 'Publish', false))) return;
      go(await write({ ...v, draft_data: null }, 'Changes published.'));
    }) }));
    if (pending) actions.push(h('button', { class: 'btn ghost', type: 'button', text: 'Discard unpublished changes', onclick: guard(async () => {
      if (!(await confirmDialog('Discard changes?', 'Your unpublished changes will be deleted. The published version stays as it is.', 'Discard'))) return;
      go(await write({ draft_data: null }, 'Unpublished changes discarded.'));
    }) }));
  }
  if (cfg.workflow && cfg.preview) {
    actions.push(h('button', { class: 'btn ghost', type: 'button', text: 'Preview on website ↗', onclick: guard(async () => {
      if (isNew) return toast('Save a draft first, then preview.', 'err');
      if (document.querySelector('.has-error')) return toast('Fix the highlighted fields first.', 'err');
      // Preview shows what is saved, so save the current form as draft first.
      const v = collect(); if (!v) return;
      if (JSON.stringify(v) !== JSON.stringify(pick(values, names))) {
        if (!(await slugCheck(v))) return;
        loaded = await write(isPublished ? { draft_data: v } : { ...v }, 'Draft saved for preview.');
        Object.assign(values, v);
      }
      window.open(previewUrl(cfg.preview(v)), '_blank', 'noopener');
    }) }));
  }
  if (!isNew && cfg.workflow) {
    if (isPublished) actions.push(h('button', { class: 'btn ghost', type: 'button', text: 'Unpublish', onclick: guard(async () => {
      if (!(await confirmDialog('Unpublish?', 'It will be removed from the website and kept as a draft.', 'Unpublish'))) return;
      go(await write({ status: 'draft', ...(pending ? pick({ ...row, ...pending }, names) : {}), draft_data: null }, 'Unpublished. Saved as draft.'));
    }) }));
    if (status !== 'archived') actions.push(h('button', { class: 'btn ghost', type: 'button', text: 'Archive', onclick: guard(async () => {
      if (!(await confirmDialog('Archive?', 'It will be hidden from the website and from normal lists. You can restore it later.', 'Archive'))) return;
      go(await write({ status: 'archived' }, 'Archived.'));
    }) }));
    else actions.push(h('button', { class: 'btn ghost', type: 'button', text: 'Restore as draft', onclick: guard(async () => { go(await write({ status: 'draft' }, 'Restored as draft.')); }) }));
  }
  if (!isNew) actions.push(h('button', { class: 'btn danger ghost', type: 'button', text: 'Delete permanently', onclick: guard(async () => {
    if (!(await confirmDialog('Delete permanently?', `“${cfg.label(row)}” will be deleted. This cannot be undone. Consider Archive instead.`, 'Delete'))) return;
    await q(ctx.sb.from(cfg.table).delete().eq('id', row.id));
    markDirty(false); toast('Deleted.', 'ok'); location.hash = `#/${name}`;
  }) }));

  const side = h('aside', { class: 'editor-side' },
    h('div', { class: 'panel' },
      h('div', { class: 'statusline' }, cfg.workflow ? pill(isNew ? 'draft' : status) : null, pending ? pill('pending', 'unpublished changes') : null),
      row ? h('p', { class: 'small muted', text: `Last saved ${fmtDateTime(row.updated_at)}${row.published_at ? ` · Published ${fmtDateTime(row.published_at)}` : ''}` }) : h('p', { class: 'small muted', text: 'New item — not saved yet.' }),
      h('div', { class: 'btn-row' }, ...actions)),
    cfg.workflow ? h('div', { class: 'panel small muted' }, h('strong', { text: 'How publishing works' }),
      h('p', { text: 'Drafts are never shown to visitors. Edits to a published item are kept as unpublished changes until you publish them. Preview shows the real page with your saved changes (only visible to you).' })) : null);

  content.replaceChildren(
    h('div', { class: 'crumb' }, h('a', { href: `#/${name}`, text: `← ${cfg.title}` })),
    pageHead(isNew ? `New ${cfg.single}` : cfg.label(values)),
    ...banners, msg,
    h('div', { class: 'editor' }, h('div', { class: 'panel' }, form.el), side));
}

const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
