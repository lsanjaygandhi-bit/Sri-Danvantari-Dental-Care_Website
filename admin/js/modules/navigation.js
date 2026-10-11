// Header navigation and footer "Explore" links.
import { h, toast, confirmDialog, modal } from '../ui.js';
import { ctx, q, can, pageHead, forbidden } from '../core.js';
import { buildForm } from '../fields.js';

export async function render(content) {
  if (!can.superAdmin()) return forbidden(content, 'navigation settings');
  const rows = await q(ctx.sb.from('nav_items').select('*').order('location').order('sort_order'));
  const block = loc => {
    const items = rows.filter(r => r.location === loc);
    return h('div', { class: 'panel' },
      h('div', { class: 'page-head' }, h('h2', { text: loc === 'header' ? 'Header menu' : 'Footer “Explore” links' }), h('button', { class: 'btn small', type: 'button', text: '+ Add link', onclick: () => edit(null, loc) })),
      h('div', { class: 'sections-list' }, ...items.map((r, i) => h('div', { class: 'section-row' },
        h('div', { class: 'name' }, h('strong', { text: r.label }), h('small', { text: `${r.href}${r.new_tab ? ' · opens in new tab' : ''}${r.is_visible ? '' : ' · hidden'}${r.is_essential ? ' · essential (cannot be removed or hidden)' : ''}` })),
        h('div', { class: 'btn-row' },
          h('button', { class: 'icon-btn small', type: 'button', 'aria-label': `Move ${r.label} up`, text: '↑', disabled: i === 0, onclick: () => swap(items[i], items[i - 1]) }),
          h('button', { class: 'icon-btn small', type: 'button', 'aria-label': `Move ${r.label} down`, text: '↓', disabled: i === items.length - 1, onclick: () => swap(items[i], items[i + 1]) }),
          r.is_essential ? null : h('button', { class: 'btn ghost small', type: 'button', text: r.is_visible ? 'Hide' : 'Show', onclick: () => save(r.id, { is_visible: !r.is_visible }, r.is_visible ? 'Link hidden.' : 'Link shown.') }),
          h('button', { class: 'btn ghost small', type: 'button', text: 'Edit', onclick: () => edit(r, loc) }),
          r.is_essential ? null : h('button', { class: 'btn danger ghost small', type: 'button', text: 'Delete', onclick: async () => {
            if (!(await confirmDialog('Delete link?', `“${r.label}” will be removed from the ${loc}.`, 'Delete'))) return;
            try { await q(ctx.sb.from('nav_items').delete().eq('id', r.id)); toast('Link deleted.', 'ok'); render(content); } catch (e) { toast(e.message, 'err'); }
          } }))))));
  };
  const save = async (id, patch, msg) => { try { await q(ctx.sb.from('nav_items').update(patch).eq('id', id)); toast(msg, 'ok'); render(content); } catch (e) { toast(e.message, 'err'); } };
  const swap = async (a, b) => {
    try { await q(ctx.sb.from('nav_items').update({ sort_order: b.sort_order }).eq('id', a.id)); await q(ctx.sb.from('nav_items').update({ sort_order: a.sort_order }).eq('id', b.id)); render(content); }
    catch (e) { toast(e.message, 'err'); }
  };
  const edit = (r, loc) => {
    const form = buildForm([
      { name: 'label', label: 'Link text', type: 'text', required: true, max: 40 },
      { name: 'href', label: 'Link address', type: 'url', required: true, readonly: r?.is_essential, hint: r?.is_essential ? 'Essential links keep their address so visitors can always reach this page.' : null },
      { name: 'new_tab', label: 'Open in a new tab', type: 'boolean' },
    ], r || { label: '', href: '', new_tab: false });
    modal(r ? 'Edit link' : 'Add link', form.el, [
      { label: 'Cancel' },
      { label: 'Save', kind: '', onClick: async close => {
        if (form.validate().length) return;
        const v = form.getValues();
        try {
          if (r) await q(ctx.sb.from('nav_items').update(r.is_essential ? { label: v.label, new_tab: v.new_tab } : v).eq('id', r.id));
          else await q(ctx.sb.from('nav_items').insert({ ...v, location: loc, sort_order: (Math.max(0, ...rows.filter(x => x.location === loc).map(x => x.sort_order)) + 10) }));
          toast('Saved. The website menu updates within about a minute.', 'ok'); close(); render(content);
        } catch (e) { toast(e.message, 'err'); }
      } }]);
  };
  content.replaceChildren(pageHead('Navigation & footer', 'Changes apply to every page. Home and Contact are essential and cannot be removed. Footer contact details and social links are in Website settings.'), block('header'), block('footer'));
}
