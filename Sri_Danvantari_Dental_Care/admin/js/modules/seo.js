// SEO: page titles, descriptions, canonical, Open Graph, robots, structured data, sitemap.
import { h, toast, confirmDialog, dataTable, download, fmtDateTime } from '../ui.js';
import { ctx, q, can, pageHead, forbidden, markDirty, mediaUrl } from '../core.js';
import { buildForm } from '../fields.js';

export async function render(content, params) {
  if (!can.editContent()) return forbidden(content, 'SEO settings');
  if (params[0]) return edit(content, params[0]);
  const rows = await q(ctx.sb.from('seo_pages').select('*').order('path'));
  const t = dataTable({
    rows, onRowClick: r => { location.hash = '#/seo/' + r.path; },
    columns: [
      { label: 'Page', render: r => h('div', {}, h('strong', { text: r.label || r.path }), h('div', { class: 'small muted', text: r.path })) },
      { label: 'Title', render: r => `${r.title} (${r.title.length})` },
      { label: 'Description', render: r => r.description ? `${r.description.slice(0, 90)}${r.description.length > 90 ? '…' : ''} (${r.description.length})` : '⚠ missing' },
      { label: 'Indexing', render: r => r.robots === 'index,follow' ? 'Indexed' : 'Not indexed' },
      { label: 'Updated', render: r => fmtDateTime(r.updated_at) },
    ],
  });
  const settings = await q(ctx.sb.from('site_settings').select('key,value').in('key', ['site']));
  const siteUrl = settings.find(s => s.key === 'site')?.value?.site_url || '';
  content.replaceChildren(
    pageHead('SEO', 'Search-engine settings for each page. Doctor and treatment pages have their own SEO fields in their editors.'),
    t.el,
    h('div', { class: 'panel' }, h('h2', { text: 'sitemap.xml and robots.txt' }),
      siteUrl ? h('p', { text: `Generated for ${siteUrl}. Upload both files to the website's main folder (replacing the old ones) after you change pages, slugs or indexing.` })
        : h('div', { class: 'banner warn' }, 'Set the website address in ', h('a', { href: '#/settings/site', text: 'Website settings → Site' }), ' first. A sitemap needs the full domain.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn ghost', type: 'button', text: 'Download sitemap.xml', disabled: !siteUrl, onclick: () => sitemap(siteUrl, rows) }),
        h('button', { class: 'btn ghost', type: 'button', text: 'Download robots.txt', disabled: !siteUrl, onclick: () => robots(siteUrl) }))));
}

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function sitemap(siteUrl, pages) {
  const base = siteUrl.replace(/\/?$/, '/');
  const [treat, docs] = await Promise.all([
    q(ctx.sb.from('treatments').select('slug,noindex,updated_at,benefits,procedure_details,faqs').eq('status', 'published')),
    q(ctx.sb.from('doctors').select('slug,legacy_page,noindex,updated_at').eq('status', 'published')),
  ]);
  const urls = [];
  for (const p of pages) if (p.in_sitemap && p.robots.startsWith('index')) urls.push([p.path === 'index.html' ? base : base + p.path, p.updated_at]);
  for (const d of docs) if (!d.noindex) urls.push([base + (d.legacy_page || `doctor.html?slug=${d.slug}`), d.updated_at]);
  for (const t of treat) if (!t.noindex && ((t.benefits || []).length || t.procedure_details || (t.faqs || []).length)) urls.push([base + `treatment.html?slug=${t.slug}`, t.updated_at]);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `  <url><loc>${xmlEsc(u)}</loc><lastmod>${new Date(d).toISOString().slice(0, 10)}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  download('sitemap.xml', xml, 'application/xml');
  toast(`sitemap.xml created with ${urls.length} pages.`, 'ok');
}
function robots(siteUrl) {
  download('robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${siteUrl.replace(/\/?$/, '/')}sitemap.xml\n`);
}

async function edit(content, path) {
  const row = await q(ctx.sb.from('seo_pages').select('*').eq('path', path).maybeSingle());
  if (!row) { content.replaceChildren(pageHead('Page not found'), h('a', { href: '#/seo', text: '← SEO' })); return; }
  const form = buildForm([
    { name: 'title', label: 'Page title', type: 'text', required: true, max: 120, hint: 'Shown in search results and the browser tab. Aim for 50–60 characters.' },
    { name: 'description', label: 'Meta description', type: 'textarea', max: 320, hint: 'Aim for 120–160 characters.' },
    { name: 'canonical_url', label: 'Canonical URL (optional)', type: 'text', max: 300, hint: 'Full https:// address of the preferred version of this page. Leave empty to use the website address from settings.',
      validate: v => v && !/^https:\/\/[^\s<>"']+$/.test(v) ? 'Must be a full https:// address.' : null },
    { name: 'og_title', label: 'Social sharing title', type: 'text', max: 120, hint: 'Leave empty to use the page title.' },
    { name: 'og_description', label: 'Social sharing description', type: 'textarea', max: 320 },
    { name: 'og_image_id', label: 'Social sharing image', type: 'media', hint: 'Ideally 1200×630 pixels. Needs the website address to be set in settings.' },
    { name: 'robots', label: 'Search engine indexing', type: 'select', options: [['index,follow', 'Show in search results (index)'], ['noindex,follow', 'Hide from search results (noindex)'], ['noindex,nofollow', 'Hide and do not follow links (noindex, nofollow)']] },
    { name: 'in_sitemap', label: 'Include in sitemap.xml', type: 'boolean' },
    { name: 'structured_data', label: 'Structured data (JSON-LD)', type: 'json', hint: 'Optional schema.org data. Must be valid JSON. Scripts and HTML are not allowed.',
      validate: v => { if (v == null || typeof v === 'symbol') return null; const s = JSON.stringify(v); if (/<\/?script|<[a-z]/i.test(s)) return 'HTML is not allowed in structured data.'; if (!v['@context'] && !(Array.isArray(v))) return 'Add "@context": "https://schema.org".'; return null; } },
  ], { ...row, canonical_url: row.canonical_url || '' });

  const genLd = h('button', { class: 'btn ghost small', type: 'button', text: 'Fill structured data from clinic details', onclick: async () => {
    const s = await q(ctx.sb.from('site_settings').select('key,value').in('key', ['contact', 'site']));
    const c = s.find(x => x.key === 'contact')?.value || {}, site = s.find(x => x.key === 'site')?.value || {};
    const ld = { '@context': 'https://schema.org', '@type': 'Dentist', name: c.clinic_name, address: { '@type': 'PostalAddress', streetAddress: c.street, addressLocality: c.locality, postalCode: c.postal_code, addressRegion: c.region, addressCountry: c.country }, medicalSpecialty: 'Dentistry' };
    if (c.phone) ld.telephone = '+' + c.phone;
    if (site.site_url) ld.url = site.site_url;
    const wrap = form.fields.structured_data;
    wrap.querySelector('textarea').value = JSON.stringify(ld, null, 2); markDirty(true);
    wrap.classList.remove('has-error'); wrap.querySelector('.field-error')?.remove();
    toast('Structured data filled in. Review it, then Save.', 'ok');
  } });

  content.replaceChildren(
    h('div', { class: 'crumb' }, h('a', { href: '#/seo', text: '← SEO' })),
    pageHead(row.label || path, path),
    h('div', { class: 'editor' }, h('div', { class: 'panel' }, form.el, genLd),
      h('aside', { class: 'editor-side' }, h('div', { class: 'panel' },
        h('p', { class: 'small muted', text: `Last saved ${fmtDateTime(row.updated_at)}. SEO changes go live when saved.` }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', text: 'Save', onclick: async e => {
            if (form.validate().length) return toast('Please fix the highlighted fields.', 'err');
            const v = form.getValues();
            if (v.robots !== 'index,follow' && row.robots === 'index,follow' && !(await confirmDialog('Hide this page from search engines?', 'Search engines will stop showing this page in results.', 'Hide from search', true))) return;
            e.target.disabled = true;
            try {
              const rows = await q(ctx.sb.from('seo_pages').update({ ...v, canonical_url: v.canonical_url || null }).eq('path', path).eq('updated_at', row.updated_at).select('*'));
              if (!rows.length) throw new Error('Someone else changed this page. Reload and try again.');
              markDirty(false); toast('SEO settings saved.', 'ok'); edit(content, path);
            } catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
          } }),
          h('a', { class: 'btn ghost', href: '../' + path, target: '_blank', rel: 'noopener', text: 'View page ↗' }))))));
}
