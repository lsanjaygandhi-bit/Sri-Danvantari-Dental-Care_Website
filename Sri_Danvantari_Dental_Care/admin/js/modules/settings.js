// Website settings: contact, hours, booking, announcement, social, branding, privacy, site.
import { h, toast, confirmDialog, fmtDateTime } from '../ui.js';
import { ctx, q, can, pageHead, forbidden, markDirty } from '../core.js';
import { buildForm } from '../fields.js';

const digits = (v, n = '10-13') => v && !new RegExp(`^[0-9]{${n.replace('-', ',')}}$`).test(v) ? 'Digits only, including the country code (e.g. 919884048448).' : null;
const DAYS = [['0', 'Sunday'], ['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday']];

const TABS = {
  contact: { label: 'Clinic contact', intro: 'Used in the header/footer, contact page, map, WhatsApp buttons, booking form and chat answers.', fields: () => [
    { name: 'clinic_name', label: 'Clinic name', type: 'text', required: true, max: 100 },
    { name: 'phone', label: 'Phone number for calls (digits with country code)', type: 'text', required: true, max: 13, inputmode: 'numeric', validate: v => digits(v) },
    { name: 'phone_display', label: 'Phone number as shown on the website', type: 'text', required: true, max: 30 },
    { name: 'whatsapp', label: 'WhatsApp number (digits with country code)', type: 'text', required: true, max: 13, inputmode: 'numeric', validate: v => digits(v), hint: 'Booking requests and all WhatsApp buttons use this number.' },
    { name: 'whatsapp_display', label: 'WhatsApp number as shown on the website', type: 'text', required: true, max: 30 },
    { name: 'whatsapp_message', label: 'Default WhatsApp message', type: 'textarea', max: 300 },
    { name: 'email', label: 'Email (optional)', type: 'email', max: 200 },
    { name: 'address_full', label: 'Full address', type: 'textarea', required: true, max: 300, min: 10 },
    { name: 'address_short', label: 'Short address (footer)', type: 'text', required: true, max: 160 },
    { name: 'landmark', label: 'Landmark', type: 'text', max: 120 },
    { type: 'heading', label: 'Address for search engines (structured data)' },
    { name: 'street', label: 'Street address', type: 'text', max: 200 },
    { name: 'locality', label: 'City', type: 'text', max: 80 },
    { name: 'region', label: 'State', type: 'text', max: 80 },
    { name: 'postal_code', label: 'PIN code', type: 'text', max: 10, pattern: /^[0-9]{6}$/, patternMsg: 'Use the 6-digit PIN code.' },
    { name: 'country', label: 'Country code', type: 'text', max: 2 },
    { type: 'heading', label: 'Map' },
    { name: 'maps_url', label: 'Google Maps directions link', type: 'text', max: 300, required: true, validate: v => v && !/^https:\/\/(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)\/[^\s<>"']*$/i.test(v) ? 'Use a Google Maps https:// link.' : null },
    { name: 'map_query', label: 'Map search text (for the embedded map)', type: 'text', max: 300, hint: 'The embedded map shows the result of this search.' },
  ] },
  hours: { label: 'Opening hours', intro: 'Shown on the Home and Contact pages, and used by the booking form and chat.', fields: () => [
    { name: 'heading', label: 'Heading', type: 'text', required: true, max: 80, hint: 'For example: Clinic hours (or "Clinic hours (provisional)" until confirmed).' },
    { name: 'summary', label: 'One-line summary', type: 'text', required: true, max: 200 },
    { name: 'note_short', label: 'Short note after the summary (Home page)', type: 'text', max: 120 },
    { name: 'note', label: 'Note under the hours table (Contact page)', type: 'text', max: 200 },
    { name: 'rows', label: 'Hours table', type: 'items', min: 1, max: 10, itemLabel: 'row', fields: [
      { name: 'days', label: 'Days', type: 'text', required: true, max: 60 },
      { name: 'times', label: 'Times (one period per line)', type: 'textarea', required: true, max: 120, rows: 2 }] },
    { name: 'closed_days', label: 'Days the booking form will not accept', type: 'select', options: [['0', 'Sunday'], ['', 'None'], ['0,6', 'Saturday and Sunday']], hint: 'Patients cannot choose these days in the booking form.' },
    { name: 'holiday_notice', label: 'Holiday / closure notice (optional)', type: 'textarea', max: 200, hint: 'When filled in, it appears as a banner at the top of every page. Clear it when the closure is over.' },
  ], load: v => ({ ...v, closed_days: (v.closed_days || []).join(',') }), save: v => ({ ...v, closed_days: v.closed_days ? v.closed_days.split(',').map(Number) : [] }) },
  booking: { label: 'Booking form', intro: 'The appointment form that opens from every "Book an Appointment" button.', fields: () => [
    { name: 'mode', label: 'What happens when a patient sends the form', type: 'select', options: [
      ['whatsapp_and_store', 'Save the request in the dashboard AND open WhatsApp (recommended)'],
      ['whatsapp_only', 'Only open WhatsApp (nothing saved)'],
      ['store_only', 'Only save the request in the dashboard (no WhatsApp)']] },
    { name: 'modal_title', label: 'Form title', type: 'text', required: true, max: 60 },
    { name: 'intro', label: 'Introduction text', type: 'textarea', required: true, max: 300, hint: 'Make sure this matches the mode above (e.g. mention WhatsApp only if it opens).' },
    { name: 'submit_label', label: 'Send button label', type: 'text', required: true, max: 40 },
    { name: 'privacy_note', label: 'Privacy note under the button', type: 'textarea', max: 300, hint: 'Shown when requests are saved. Explain who sees the details and why.' },
    { name: 'treatment_options', label: 'Treatment options', type: 'lines', required: true, maxItems: 30, itemMax: 80 },
    { name: 'time_options', label: 'Preferred time options', type: 'lines', required: true, maxItems: 10, itemMax: 40 },
  ] },
  announcement: { label: 'Announcement banner', intro: 'A short message at the top of every page (for example, a holiday closure).', fields: () => [
    { name: 'enabled', label: 'Show the announcement banner', type: 'boolean' },
    { name: 'text', label: 'Message', type: 'text', max: 200, validate: (v, all) => all.enabled && (!v || v.length < 3) ? 'Enter the message to show.' : null },
    { name: 'link_label', label: 'Link text (optional)', type: 'text', max: 40 },
    { name: 'link_url', label: 'Link address (optional)', type: 'url', max: 300 },
    { name: 'tone', label: 'Style', type: 'select', options: [['info', 'Information (lavender)'], ['alert', 'Important (amber)']] },
  ] },
  social: { label: 'Social media', intro: 'Links appear in the footer only when filled in.', fields: () => ['facebook', 'instagram', 'youtube', 'google_business', 'x'].map(k => ({
    name: k, label: { facebook: 'Facebook page', instagram: 'Instagram', youtube: 'YouTube', google_business: 'Google Business Profile', x: 'X (Twitter)' }[k], type: 'text', max: 300,
    validate: v => v && !/^https:\/\/[^\s<>"']+$/.test(v) ? 'Use a full https:// link.' : null })) },
  branding: { label: 'Logo & favicon', intro: 'The logo appears in the header and footer. The favicon appears in browser tabs.', fields: () => [
    { name: 'logo_id', label: 'Logo', type: 'media', required: true },
    { name: 'favicon_id', label: 'Favicon (square PNG)', type: 'media', required: true, favicon: true },
    { name: 'theme_color', label: 'Browser theme colour (mobile address bar)', type: 'color' },
  ] },
  privacy: { label: 'Privacy notice', intro: 'This website does not set advertising or tracking cookies. Turn this on only if you add tools that need a notice.', fields: () => [
    { name: 'cookie_notice_enabled', label: 'Show a privacy / cookie notice', type: 'boolean' },
    { name: 'cookie_notice_text', label: 'Notice text', type: 'textarea', max: 400 },
  ] },
  site: { label: 'Site', intro: 'General website settings.', fields: () => [
    { name: 'site_url', label: 'Website address', type: 'text', max: 200, placeholder: 'https://www.example.com', hint: 'Needed for canonical links, social sharing images and the sitemap.',
      validate: v => v && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/?$/i.test(v) ? 'Use the form https://www.example.com' : null },
    { name: 'footer_tagline', label: 'Footer tagline', type: 'text', required: true, max: 120 },
  ] },
};

export async function render(content, params) {
  if (!can.superAdmin()) return forbidden(content, 'website settings');
  const tab = TABS[params[0]] ? params[0] : 'contact';
  const row = await q(ctx.sb.from('site_settings').select('*').eq('key', tab).single());
  const cfg = TABS[tab];
  const values = cfg.load ? cfg.load(row.value) : row.value;
  const form = buildForm(cfg.fields(), values);
  const save = h('button', { class: 'btn', type: 'button', text: 'Save settings', onclick: async () => {
    if (form.validate().length) return toast('Please fix the highlighted fields.', 'err');
    let v = form.getValues();
    if (cfg.save) v = cfg.save(v);
    if (tab === 'contact' && (v.whatsapp !== row.value.whatsapp || v.phone !== row.value.phone) &&
        !(await confirmDialog('Change clinic numbers?', 'All call and WhatsApp buttons, and new booking requests, will use the new number(s).', 'Save numbers', false))) return;
    save.disabled = true;
    try {
      const rows = await q(ctx.sb.from('site_settings').update({ value: { ...row.value, ...v } }).eq('key', tab).eq('updated_at', row.updated_at).select('*'));
      if (!rows.length) throw new Error('These settings were changed by someone else. Reload and try again.');
      markDirty(false); toast('Settings saved. The website updates within about a minute.', 'ok'); render(content, [tab]);
    } catch (e) { toast(e.message, 'err'); save.disabled = false; }
  } });
  content.replaceChildren(
    pageHead('Website settings', 'Settings apply immediately to the whole website.'),
    h('nav', { class: 'tabs', 'aria-label': 'Settings sections' }, ...Object.entries(TABS).map(([k, t]) => h('a', { href: '#/settings/' + k, 'aria-current': k === tab ? 'page' : null, text: t.label }))),
    h('div', { class: 'editor' },
      h('div', { class: 'panel' }, h('p', { class: 'muted', text: cfg.intro }), form.el),
      h('aside', { class: 'editor-side' }, h('div', { class: 'panel' }, h('p', { class: 'small muted', text: `Last saved ${fmtDateTime(row.updated_at)}` }), save))));
}
