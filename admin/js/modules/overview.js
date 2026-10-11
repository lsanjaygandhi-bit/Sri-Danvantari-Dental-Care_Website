import { h, fmtDateTime, pill } from '../ui.js';
import { ctx, q, can, pageHead, ROLE_LABEL } from '../core.js';

export async function render(content) {
  const stats = await q(ctx.sb.rpc('admin_dashboard_stats'));
  const cards = [];
  if (can.appointments()) {
    cards.push(stat(stats.appointments_new, 'New appointment requests', '#/appointments?status=new', stats.appointments_new > 0));
    cards.push(stat(stats.appointments_week, 'Requests in the last 7 days', '#/appointments'));
  }
  if (can.editContent()) {
    cards.push(stat(stats.treatments.published, 'Published treatments', '#/treatments'));
    cards.push(stat(stats.doctors.published, 'Published doctor & staff profiles', '#/doctors'));
    cards.push(stat(stats.testimonials.published, 'Published testimonials', '#/testimonials'));
    cards.push(stat(stats.media, 'Images in media library', '#/media'));
  }
  const pending = ['treatments', 'doctors', 'testimonials', 'gallery', 'faqs'].filter(k => stats[k] && (stats[k].pending || stats[k].draft));
  const body = [pageHead(`Welcome, ${ctx.me.display_name || ctx.me.email}`, `Signed in as ${ROLE_LABEL[ctx.me.role]}.`), h('div', { class: 'stats' }, ...cards)];

  if (can.editContent() && (pending.length || stats.sections_pending)) {
    body.push(h('div', { class: 'panel' }, h('h2', { text: 'Waiting to be published' }),
      h('ul', {}, ...pending.map(k => h('li', {}, h('a', { href: '#/' + k, text: `${cap(k)}: ${stats[k].draft} draft, ${stats[k].pending} with unpublished changes` }))),
        stats.sections_pending ? h('li', {}, h('a', { href: '#/pages', text: `Page sections with unpublished changes: ${stats.sections_pending}` })) : null)));
  }
  if (can.appointments()) {
    const recent = await q(ctx.sb.from('appointments').select('id,reference,created_at,patient_name,treatment,preferred_date,status').order('created_at', { ascending: false }).limit(6));
    body.push(h('div', { class: 'panel' }, h('h2', { text: 'Latest appointment requests' }),
      recent.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data stack' },
        h('thead', {}, h('tr', {}, ...['Received', 'Patient', 'Treatment', 'Preferred date', 'Status'].map(t => h('th', { text: t })))),
        h('tbody', {}, ...recent.map(r => h('tr', {},
          h('td', { 'data-label': 'Received', text: fmtDateTime(r.created_at) }),
          h('td', { 'data-label': 'Patient' }, h('a', { href: '#/appointments/' + r.id, text: r.patient_name })),
          h('td', { 'data-label': 'Treatment', text: r.treatment || '—' }),
          h('td', { 'data-label': 'Preferred date', text: r.preferred_date || '—' }),
          h('td', { 'data-label': 'Status' }, pill(r.status))))))) : h('p', { class: 'muted', text: 'No appointment requests yet.' })));
  }
  body.push(h('div', { class: 'panel' }, h('h2', { text: 'Good to know' }), h('ul', {},
    h('li', { text: 'Changes are saved as drafts first. Use Preview to check them on the real page, then Publish.' }),
    h('li', { text: 'Published changes appear on the website within about a minute.' }),
    h('li', { text: 'The homepage hero section is locked to protect the design.' }),
    h('li', { text: 'An appointment is only confirmed when the clinic has confirmed it with the patient.' }))));
  content.replaceChildren(...body);
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function stat(n, label, href, alert) {
  return h('a', { class: 'stat' + (alert ? ' alert' : ''), href }, h('b', { text: String(n ?? 0) }), h('span', { text: label }));
}
