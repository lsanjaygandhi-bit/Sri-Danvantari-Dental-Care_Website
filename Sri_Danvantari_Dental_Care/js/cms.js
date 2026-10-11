/*
 * Sri Danvantari Dental Care — public content loader.
 *
 * The HTML pages are complete on their own. This script fetches the content
 * published from the Admin Dashboard and applies it on top of the static
 * markup. If the content service cannot be reached, the static pages remain
 * exactly as they are.
 *
 * Safety rules:
 *   - All text is written with textContent / createTextNode. No HTML from the
 *     database is ever parsed, so content fields cannot inject script.
 *   - Links are accepted only if they match a strict allow-list (https, tel,
 *     mailto, local .html pages, #anchors).
 *   - The homepage hero (<section class="hero">) is never read or modified.
 */
(() => {
  'use strict';
  const CFG = window.SDDC_CONFIG || {};
  const SDDC = (window.SDDC = window.SDDC || {});
  if (!CFG.supabaseUrl || !CFG.supabaseKey) return;

  const BASE = CFG.supabaseUrl.replace(/\/+$/, '');
  const file = (location.pathname.split('/').pop() || '').toLowerCase();
  const PAGE = (file.replace(/\.html?$/, '') || 'index').replace(/[^a-z0-9-]/g, '') || 'index';
  const PAGE_FILE = PAGE + '.html';
  const params = new URLSearchParams(location.search);
  const PREVIEW = params.get('preview') === '1';
  const CACHE_KEY = 'sddc-cms-v1:' + PAGE;
  const FRESH_MS = Math.max(0, Math.min(Number(CFG.freshSeconds ?? 60), 600)) * 1000;

  // ------------------------------------------------------------ helpers ----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };
  const SAFE_URL = /^(https:\/\/[^\s<>"'`]+|tel:\+?[0-9]{6,15}|mailto:[^\s<>"'`@]+@[^\s<>"'`]+|[a-z0-9-]+\.html(\?[a-z0-9=&_-]*)?(#[a-z0-9-]+)?|#[a-z0-9-]+)$/i;
  const safeUrl = u => (typeof u === 'string' && SAFE_URL.test(u.trim()) ? u.trim() : null);
  const STATIC_RE = /^assets\/[A-Za-z0-9_./-]+\.(jpg|jpeg|png|webp|svg|ico)$/;
  const STORAGE_RE = /^uploads\/[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.(jpg|png|webp|avif|ico)$/;
  const mediaUrl = m => {
    if (!m) return null;
    if (m.static && STATIC_RE.test(m.static) && !m.static.includes('..')) return m.static;
    if (m.storage && STORAGE_RE.test(m.storage)) return `${BASE}/storage/v1/object/public/media/${m.storage}`;
    return null;
  };
  const absUrl = (u, siteUrl) => {
    if (!u) return null;
    if (/^https:\/\//.test(u)) return u;
    try { return new URL(u, siteUrl ? siteUrl.replace(/\/?$/, '/') : location.href).href; } catch { return null; }
  };
  const isStr = v => typeof v === 'string';
  const initialsOf = name => {
    const parts = String(name || '').replace(/^dr\.?\s+/i, '').split(/[\s.]+/).filter(Boolean);
    if (!parts.length) return '';
    return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  const roleLine = d => [d.qualifications, d.designation].filter(Boolean).join(' · ');
  const profileUrl = d => (d.legacy_page && /^[a-z0-9-]+\.html$/.test(d.legacy_page) ? d.legacy_page : `doctor.html?slug=${encodeURIComponent(d.slug)}`);
  const readStore = (store, key) => { try { return store.getItem(key); } catch { return null; } };
  const writeStore = (store, key, value) => { try { store.setItem(key, value); } catch { /* storage unavailable */ } };

  // Inline "lite markdown": [label](url) links and line breaks only.
  const renderInline = text => {
    const frag = document.createDocumentFragment();
    const lines = String(text || '').split('\n');
    lines.forEach((line, i) => {
      if (i) frag.append(el('br'));
      const re = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g;
      let last = 0, m;
      while ((m = re.exec(line))) {
        if (m.index > last) frag.append(document.createTextNode(line.slice(last, m.index)));
        const href = safeUrl(m[2]);
        if (href) {
          const a = el('a', { href, text: m[1] });
          if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
          frag.append(a);
        } else frag.append(document.createTextNode(m[1]));
        last = re.lastIndex;
      }
      if (last < line.length) frag.append(document.createTextNode(line.slice(last)));
    });
    return frag;
  };

  // Block "lite markdown": paragraphs, "## heading", "- list", ":::note Title ... :::".
  const renderBlocks = (md, opts = {}) => {
    const frag = document.createDocumentFragment();
    const lines = String(md || '').replace(/\r/g, '').split('\n');
    const H = opts.heading || 'h2';
    let i = 0;
    const flushPara = buf => { if (buf.length) frag.append(el('p', {}, renderInline(buf.join('\n')))); };
    let para = [];
    while (i < lines.length) {
      const line = lines[i];
      if (/^:::note\b/.test(line)) {
        flushPara(para); para = [];
        const title = line.replace(/^:::note\s*/, '');
        const inner = [];
        i++;
        while (i < lines.length && lines[i].trim() !== ':::') inner.push(lines[i++]);
        i++;
        const box = el('div', { class: 'note-box' }, el('strong', { text: title }));
        const body = renderBlocks(inner.join('\n'), opts);
        $$('ul', body).forEach(u => u.setAttribute('style', 'margin-top:8px'));
        box.append(body);
        frag.append(box);
        continue;
      }
      if (/^##\s+/.test(line)) { flushPara(para); para = []; frag.append(el(H, { text: line.replace(/^##\s+/, '') })); i++; continue; }
      if (/^-\s+/.test(line)) {
        flushPara(para); para = [];
        const ul = el('ul');
        while (i < lines.length && /^-\s+/.test(lines[i])) ul.append(el('li', {}, renderInline(lines[i++].replace(/^-\s+/, ''))));
        frag.append(ul);
        continue;
      }
      if (!line.trim()) { flushPara(para); para = []; i++; continue; }
      para.push(line); i++;
    }
    flushPara(para);
    return frag;
  };

  // Replace an element's visible text. If it contains other elements (an icon,
  // an arrow), only its leading text is replaced so those stay in place.
  const setText = (node, value, rich) => {
    if (!isStr(value)) return;
    if (rich) { node.replaceChildren(renderInline(value)); return; }
    if (!node.children.length) { if (node.textContent !== value) node.textContent = value; return; }
    const t = Array.from(node.childNodes).find(n => n.nodeType === 3 && n.data.trim());
    if (t) {
      const trailing = /\s$/.test(t.data) ? ' ' : '';
      t.data = value + trailing;
    } else node.prepend(document.createTextNode(value + ' '));
  };

  const setImage = (img, m, alt, opts = {}) => {
    const url = mediaUrl(m);
    if (!url) return;
    if (img.getAttribute('src') !== url) img.setAttribute('src', url);
    if (m.srcset && m.static && !opts.noSrcset) img.setAttribute('srcset', m.srcset); else img.removeAttribute('srcset');
    if (!m.srcset || opts.noSrcset) img.removeAttribute('sizes');
    if (m.w && m.h) { img.setAttribute('width', m.w); img.setAttribute('height', m.h); }
    if (isStr(alt)) img.setAttribute('alt', alt);
  };

  // Card-size image: use the smallest srcset candidate for built-in photos.
  const cardImage = (m, alt, extra = {}) => {
    if (!m) return null;
    let src = mediaUrl(m), w = m.w, h = m.h;
    if (m.srcset && m.static) {
      const first = m.srcset.split(',')[0].trim().split(/\s+/);
      if (STATIC_RE.test(first[0])) { src = first[0]; const cw = parseInt(first[1], 10); if (w && h && cw) { h = Math.round(h * cw / w); w = cw; } }
    }
    if (!src) return null;
    return el('img', { src, alt: alt || '', width: w, height: h, loading: 'lazy', ...extra });
  };

  // ------------------------------------------------------------- fetch -----
  const sessionToken = () => {
    try {
      const ref = new URL(BASE).hostname.split('.')[0];
      const raw = readStore(localStorage, `sb-${ref}-auth-token`);
      const s = raw && JSON.parse(raw);
      return (s && (s.access_token || (s.currentSession && s.currentSession.access_token))) || null;
    } catch { return null; }
  };

  const rpc = async (fn, body, opts = {}) => {
    const headers = { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' };
    const token = opts.auth ? sessionToken() : null;
    headers.Authorization = 'Bearer ' + (token || CFG.supabaseKey);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 8000);
    try {
      const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal, keepalive: !!opts.keepalive, credentials: 'omit' });
      const data = await res.json().catch(() => null);
      if (!res.ok) { const err = new Error((data && (data.message || data.hint)) || 'Request failed'); err.status = res.status; throw err; }
      return data;
    } finally { clearTimeout(timer); }
  };

  // ------------------------------------------------------- settings --------
  const applySettings = data => {
    const s = data.settings || {};
    const c = s.contact || {}, h = s.hours || {}, b = s.booking || {};
    SDDC.settings = s;
    SDDC.booking = b;

    $$('[data-cms-setting]').forEach(n => {
      const [group, key] = n.getAttribute('data-cms-setting').split('.');
      const v = s[group] && s[group][key];
      if (isStr(v) && (v !== '' || key === 'note_short')) setText(n, v);
    });

    if (/^[0-9]{10,13}$/.test(c.whatsapp || '')) {
      const wa = `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(c.whatsapp_message || '')}`;
      $$('a[href^="https://wa.me/"]').forEach(a => { if (a.getAttribute('href') !== wa) a.setAttribute('href', wa); });
    }
    if (/^[0-9]{10,13}$/.test(c.phone || '')) $$('[data-cms-tel]').forEach(a => a.setAttribute('href', 'tel:+' + c.phone));
    const maps = safeUrl(c.maps_url);
    if (maps) $$('[data-cms-maps]').forEach(a => a.setAttribute('href', maps));
    if (isStr(c.map_query) && c.map_query) {
      const src = `https://www.google.com/maps?q=${encodeURIComponent(c.map_query)}&z=16&output=embed`;
      $$('[data-cms-map-embed]').forEach(f => { if (f.getAttribute('src') !== src) f.setAttribute('src', src); });
    }

    const table = $('[data-cms-hours-table]');
    if (table && Array.isArray(h.rows) && h.rows.length) {
      table.replaceChildren(...h.rows.map(r => el('tr', {}, el('th', { scope: 'row', text: r.days || '' }), el('td', {}, renderInline(r.times || '')))));
    }

    // Booking form
    const title = $('#appointmentModalTitle'); if (title && isStr(b.modal_title) && b.modal_title) title.textContent = b.modal_title;
    const intro = $('#appointmentModalIntro'); if (intro && isStr(b.intro) && b.intro) intro.textContent = b.intro;
    const fillSelect = (sel, opts) => {
      if (!sel || !Array.isArray(opts) || !opts.length) return;
      const cur = sel.value;
      sel.replaceChildren(...opts.map(o => { const op = el('option', { text: o }); op.value = o; return op; }));
      if (opts.includes(cur)) sel.value = cur;
    };
    fillSelect($('#popupTreatment'), b.treatment_options);
    fillSelect($('#popupTime'), b.time_options);
    const submit = $('#appointmentPopupForm [type="submit"]');
    if (submit && isStr(b.submit_label) && b.submit_label && !submit.disabled) {
      SDDC.submitLabel = b.submit_label;
      setText(submit, b.submit_label);
    }
    let privacy = $('#appointmentPrivacyNote');
    if (isStr(b.privacy_note) && b.privacy_note && b.mode !== 'whatsapp_only') {
      if (!privacy) { privacy = el('p', { id: 'appointmentPrivacyNote', class: 'fine appointment-privacy' }); $('#appointmentPopupStatus')?.after(privacy); }
      privacy.textContent = b.privacy_note;
    } else privacy?.remove();

    // Branding
    const br = data.branding_media || {};
    const logo = mediaUrl(br.logo);
    if (logo) $$('.brand img').forEach(i => { if (i.getAttribute('src') !== logo) i.setAttribute('src', logo); });
    const fav = mediaUrl(br.favicon);
    if (fav) $$('link[rel="icon"][type="image/png"], link[rel="apple-touch-icon"]').forEach(l => { if (l.getAttribute('href') !== fav) l.setAttribute('href', fav); });
    const brand = s.branding || {};
    if (/^#[0-9a-f]{6}$/i.test(brand.theme_color || '')) $('meta[name="theme-color"]')?.setAttribute('content', brand.theme_color);

    // Social links in the footer (added only when at least one is set)
    const foot = $('[data-cms-social]');
    if (foot) {
      $('.cms-social', foot.parentNode)?.remove();
      const NAMES = { facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', google_business: 'Google', x: 'X' };
      const links = Object.entries(s.social || {}).filter(([k, v]) => NAMES[k] && safeUrl(v) && /^https:/.test(v));
      if (links.length) {
        const nav = el('nav', { class: 'cms-social', 'aria-label': 'Social media' }, ...links.map(([k, v]) => el('a', { href: v, target: '_blank', rel: 'noopener', text: NAMES[k] })));
        foot.before(nav);
      }
    }

    // Announcement banner (and holiday notice)
    $('.cms-announcement')?.remove();
    const ann = s.announcement || {};
    const holiday = isStr(h.holiday_notice) && h.holiday_notice.trim();
    if ((ann.enabled && isStr(ann.text) && ann.text.trim()) || holiday) {
      const bar = el('div', { class: 'cms-announcement' + (ann.tone === 'alert' || (holiday && !ann.enabled) ? ' is-alert' : ''), role: 'region', 'aria-label': 'Clinic announcement' });
      const wrap = el('div', { class: 'wrap' });
      if (holiday) wrap.append(el('p', { text: holiday }));
      if (ann.enabled && ann.text) {
        const p = el('p', { text: ann.text + ' ' });
        const href = safeUrl(ann.link_url);
        if (href && ann.link_label) p.append(el('a', { href, text: ann.link_label }));
        wrap.append(p);
      }
      bar.append(wrap);
      const header = $('.site-header');
      header ? header.before(bar) : document.body.prepend(bar);
    }

    // Optional cookie / privacy notice
    $('.cms-cookie')?.remove();
    const pv = s.privacy || {};
    if (pv.cookie_notice_enabled && isStr(pv.cookie_notice_text) && pv.cookie_notice_text && readStore(localStorage, 'sddc-cookie-ok') !== '1') {
      const btn = el('button', { type: 'button', text: 'OK' });
      const box = el('div', { class: 'cms-cookie', role: 'region', 'aria-label': 'Privacy notice' }, el('p', { text: pv.cookie_notice_text }), btn);
      btn.addEventListener('click', () => { writeStore(localStorage, 'sddc-cookie-ok', '1'); box.remove(); });
      document.body.append(box);
    }
  };

  // ------------------------------------------------------------ nav --------
  const applyNav = data => {
    const items = Array.isArray(data.nav) ? data.nav : [];
    const header = $('[data-cms-nav="header"]');
    const head = items.filter(i => i.location === 'header' && safeUrl(i.href));
    if (header && head.length) {
      // Links marked data-nav-fixed (the Admin Login button) are not managed by the CMS:
      // keep them, after the CMS links, so they can never disappear from the menu.
      const fixed = $$('[data-nav-fixed]', header);
      header.replaceChildren(...head.map(i => {
        const a = el('a', { href: i.href, text: i.label });
        if (i.new_tab) { a.target = '_blank'; a.rel = 'noopener'; }
        const target = i.href.split('#')[0].split('?')[0].toLowerCase();
        const current = PAGE.startsWith('dr-') || PAGE === 'doctor' ? 'doctors.html' : PAGE === 'treatment' ? 'treatments.html' : PAGE_FILE;
        if (target === current) a.setAttribute('aria-current', 'page');
        return a;
      }), ...fixed);
      // The mobile menu closes when a link is chosen (links were re-created).
      const menu = $('#menu');
      $$('a', header).forEach(a => a.addEventListener('click', () => { header.classList.remove('open'); menu?.setAttribute('aria-expanded', 'false'); menu?.setAttribute('aria-label', 'Open menu'); }));
    }
    const footer = $('[data-cms-nav="footer"]');
    const foot = items.filter(i => i.location === 'footer' && safeUrl(i.href));
    if (footer && foot.length) {
      footer.replaceChildren(...foot.map(i => { const a = el('a', { href: i.href, text: i.label }); if (i.new_tab) { a.target = '_blank'; a.rel = 'noopener'; } return el('li', {}, a); }));
    }
  };

  // ------------------------------------------------------------ SEO --------
  const setMeta = (attr, key, value) => {
    let m = $(`meta[${attr}="${key}"]`);
    if (!isStr(value) || !value) { return; }
    if (!m) { m = el('meta', { [attr]: key }); document.head.append(m); }
    if (m.getAttribute('content') !== value) m.setAttribute('content', value);
  };
  const applySeo = (seo, data) => {
    if (!seo) return;
    const siteUrl = (data.settings && data.settings.site && data.settings.site.site_url) || '';
    if (isStr(seo.title) && seo.title) document.title = seo.title;
    setMeta('name', 'description', seo.description);
    setMeta('property', 'og:title', seo.og_title || seo.title);
    setMeta('property', 'og:description', seo.og_description || seo.description);
    const og = absUrl(mediaUrl(seo.og_image), siteUrl);
    if (og && /^https:/.test(og)) setMeta('property', 'og:image', og);
    if (seo.robots && seo.robots !== 'index,follow') setMeta('name', 'robots', seo.robots.replace(',', ', '));
    else $('meta[name="robots"]:not([data-preview])')?.remove();
    const canon = (isStr(seo.canonical) && /^https:\/\//.test(seo.canonical) && seo.canonical) || (siteUrl ? absUrl(PAGE === 'index' ? '' : PAGE_FILE, siteUrl) : null);
    let link = $('link[rel="canonical"]');
    if (canon) { if (!link) { link = el('link', { rel: 'canonical' }); document.head.append(link); } link.setAttribute('href', canon); }
    if (seo.structured_data && typeof seo.structured_data === 'object') {
      let script = $('script[type="application/ld+json"]');
      if (!script) { script = el('script', { type: 'application/ld+json' }); document.head.append(script); }
      script.textContent = JSON.stringify(seo.structured_data).replace(/</g, '\\u003c');
    }
  };

  // ------------------------------------------------------- sections --------
  const applySections = data => {
    const sections = data.sections || {};
    const main = $('#main');
    const nodes = $$('[data-cms-section]');
    nodes.forEach(sec => {
      const id = sec.getAttribute('data-cms-section').replace(':', '.');
      const d = sections[id];
      if (!d) return;
      sec.hidden = d.visible === false;
      if (!d.visible) return;
      const c = d.content || {};
      const owned = n => n.closest('[data-cms-section]') === sec;
      $$('[data-cms-list]', sec).filter(owned).forEach(list => {
        const items = c[list.getAttribute('data-cms-list')];
        if (!Array.isArray(items) || !items.length) return;
        const kids = Array.from(list.children);
        items.forEach((item, i) => {
          let node = kids[i];
          if (!node) { node = kids[kids.length - 1].cloneNode(true); list.append(node); }
          $$('[data-cms-item]', node).forEach(f => setText(f, item[f.getAttribute('data-cms-item')], f.getAttribute('data-cms-type') === 'rich'));
        });
        kids.slice(items.length).forEach(k => k.remove());
      });
      $$('[data-cms],[data-cms-href],[data-cms-toggle],[data-cms-image]', sec).filter(n => owned(n) && !n.closest('[data-cms-list]')).forEach(n => {
        const f = n.getAttribute('data-cms');
        if (f) setText(n, c[f], n.getAttribute('data-cms-type') === 'rich');
        const hf = n.getAttribute('data-cms-href');
        if (hf) { const u = safeUrl(c[hf]); if (u) n.setAttribute('href', u); }
        const tf = n.getAttribute('data-cms-toggle');
        if (tf) n.hidden = c[tf] === false;
        const imf = n.getAttribute('data-cms-image');
        if (imf && d.media && d.media[imf]) setImage(n, d.media[imf], c[imf + '_alt'], { noSrcset: !(d.media[imf].srcset) });
      });
    });
    // Homepage section order (the hero always stays first and untouched).
    if (PAGE === 'index' && main) {
      const movable = nodes.filter(n => n.parentNode === main && sections[n.getAttribute('data-cms-section').replace(':', '.')]);
      const sorted = movable.slice().sort((a, b) => sections[a.getAttribute('data-cms-section').replace(':', '.')].order - sections[b.getAttribute('data-cms-section').replace(':', '.')].order);
      if (sorted.some((n, i) => n !== movable[i])) sorted.forEach(n => main.append(n));
    }
  };
  const sectionContent = (data, key) => ((data.sections || {})[key] || {}).content || {};

  // ---------------------------------------------------- collections --------
  const published = (arr, pred = () => true) => (Array.isArray(arr) ? arr.filter(x => x.status !== 'archived' && pred(x)) : []);
  const bookBtn = (cls, label, value) => el('a', { class: cls, href: 'contact.html', 'data-book': 'true', 'data-treatment': value || null, text: label });
  const hasDetails = t => (t.benefits && t.benefits.length) || (t.procedure_details && t.procedure_details.trim()) || (t.faqs && t.faqs.length);

  const R = {};
  R['home-treatments'] = (box, data) => {
    const learn = sectionContent(data, 'index.treatments').learn_label || 'Learn more';
    const list = published(data.treatments, t => t.show_on_home);
    if (!list.length) return false;
    box.replaceChildren(...list.map(t => el('article', { class: 't-card' },
      t.image ? cardImage(t.image, t.image_alt || t.image.alt) : null,
      el('div', { class: 'body' }, el('h3', { text: t.title }), el('p', { text: t.card_summary || '' }),
        el('a', { class: 'text-link', href: `treatments.html#${t.slug}` }, learn, el('span', { class: 'sr-only', text: ` about ${t.title}` }))))));
  };
  R['treatment-rows'] = (box, data) => {
    const sc = sectionContent(data, 'treatments.featured');
    const list = published(data.treatments, t => t.display === 'featured');
    box.replaceChildren(...list.map(t => {
      const body = el('div', {}, el('h2', { text: t.title }));
      body.append(renderBlocks(t.description || ''));
      if (t.consult_questions && t.consult_questions.length) {
        body.append(el('h3', { text: sc.questions_heading || 'Questions to ask at your consultation' }), el('ul', {}, ...t.consult_questions.map(q => el('li', { text: q }))));
      }
      const row = el('div', { class: 'btn-row' }, bookBtn('btn', t.cta_label || 'Ask about this treatment', t.booking_value));
      if (hasDetails(t)) row.append(el('a', { class: 'btn ghost', href: `treatment.html?slug=${encodeURIComponent(t.slug)}`, text: sc.details_label || 'Read full details' }));
      body.append(row);
      const img = t.image ? cardImage(t.image, t.image_alt || t.image.alt) : null;
      return el('article', { class: 't-row', id: t.slug }, el('div', { class: 't-visual' }, img), body);
    }));
  };
  R['treatment-more'] = (box, data) => {
    const list = published(data.treatments, t => t.display === 'more');
    const sec = box.closest('[data-cms-section]');
    if (sec) sec.hidden = sec.hidden || !list.length;
    box.replaceChildren(...list.map(t => {
      const a = el('article', {}, el('h3', { text: t.title }), el('p', { text: t.card_summary || '' }));
      a.append(hasDetails(t) ? el('a', { class: 'text-link', href: `treatment.html?slug=${encodeURIComponent(t.slug)}`, text: 'Read more' }) : bookBtn('text-link', t.cta_label || 'Ask about this treatment', t.booking_value));
      return a;
    }));
  };
  const chips = (prefix) => (box, data) => {
    const featured = published(data.treatments, t => t.display === 'featured');
    const more = published(data.treatments, t => t.display === 'more');
    box.replaceChildren(...featured.map(t => el('a', { href: `${prefix}#${t.slug}`, text: t.title })), ...(more.length ? [el('a', { href: `${prefix}#more`, text: 'More treatments' })] : []));
  };
  R['treatment-chips'] = chips('');
  R['treatment-chips-clinic'] = chips('treatments.html');

  const docPhoto = (d, opts) => {
    if (d.photo) { const img = cardImage(d.photo, isStr(d.photo_alt) && d.photo_alt ? d.photo_alt : (opts.alt ?? d.name), opts.imgAttrs || {}); if (img) return img; }
    return null;
  };
  const docCard = (d, data, sc) => {
    const img = docPhoto(d, {});
    const photo = el('div', { class: 'photo' }, img || el('div', { class: 'no-photo' }, el('b', { text: d.initials || initialsOf(d.name) }), el('small', { text: d.photo_placeholder || 'Photo not provided' })));
    return el('article', { class: 'doc-card' }, photo, el('div', { class: 'body' },
      el('h3', { text: d.name }), el('p', { class: 'role', text: roleLine(d) }), d.card_text ? el('p', { text: d.card_text }) : null,
      el('a', { class: 'text-link', href: profileUrl(d) }, sc.view_label || 'View profile', el('span', { class: 'sr-only', text: ` of ${d.name}` }))));
  };
  R['doctor-cards'] = (box, data) => {
    const sc = sectionContent(data, 'doctors.team');
    box.replaceChildren(...published(data.doctors, d => d.kind !== 'staff').map(d => docCard(d, data, sc)));
    // Staff profiles appear in their own block, only when published.
    const staff = published(data.doctors, d => d.kind === 'staff');
    const host = box.closest('section');
    let staffSec = $('#cms-staff');
    if (!staff.length) { staffSec?.remove(); return; }
    if (!staffSec) { staffSec = el('section', { class: 'section soft', id: 'cms-staff', 'aria-labelledby': 'cms-staff-title' }); host.after(staffSec); }
    staffSec.replaceChildren(el('div', { class: 'wrap' }, el('div', { class: 'section-head' }, el('h2', { id: 'cms-staff-title', text: sc.staff_heading || 'Our clinic team' })),
      el('div', { class: 'doc-grid' }, ...staff.map(d => docCard(d, data, sc)))));
  };
  R['doctor-team'] = (box, data) => {
    const sc = sectionContent(data, 'clinic.team');
    box.replaceChildren(...published(data.doctors, d => d.kind !== 'staff').map(d => {
      const img = docPhoto(d, { alt: '' });
      if (img) img.setAttribute('alt', '');
      return el('li', {}, el('span', { class: 'av' }, img || (d.initials || initialsOf(d.name))),
        el('div', {}, el('strong', { text: d.name }), el('span', { text: roleLine(d) })),
        el('a', { class: 'text-link', href: profileUrl(d) }, sc.profile_label || 'Profile', el('span', { class: 'sr-only', text: ` of ${d.name}` })));
    }));
  };
  R.testimonials = (box, data) => {
    const list = published(data.testimonials);
    if (!list.length) { const sec = box.closest('[data-cms-section]'); if (sec) sec.hidden = true; return; }
    box.replaceChildren(...list.map(r => el('article', { class: 'review-card', 'data-review-age': r.review_age ?? null },
      el('blockquote', { text: `“${r.quote}”` }),
      el('div', { class: 'review-author' }, el('span', { class: 'review-avatar', 'aria-hidden': 'true', text: r.initials || initialsOf(r.author_name) }),
        el('span', { class: 'review-author-copy' }, el('strong', { text: r.author_name }), el('span', { class: 'review-label', text: r.label || '' }))))));
    box.scrollLeft = 0;
  };
  const galleryFigure = (g, cls) => {
    const img = g.media ? el('img', { src: mediaUrl(g.media), alt: g.alt_text || g.media.alt || '', width: g.media.w, height: g.media.h, loading: 'lazy' }) : null;
    const cap = (g.title || g.caption) ? el('figcaption', {}, g.title ? el('strong', { text: g.title }) : null, g.caption ? el('span', { text: g.caption }) : null) : null;
    return el('figure', { class: cls }, img, cap);
  };
  R['gallery-clinic'] = (box, data) => {
    const list = published(data.gallery, g => g.gallery === 'clinic' && mediaUrl(g.media));
    const sec = box.closest('[data-cms-section]'); if (sec && !list.length) sec.hidden = true;
    box.replaceChildren(...list.map((g, i) => galleryFigure(g, 'clinic-photo-card' + (i === 0 ? ' clinic-photo-main' : ''))));
  };
  R['gallery-cases'] = (box, data) => {
    const list = published(data.gallery, g => g.gallery === 'cases' && mediaUrl(g.media));
    const sec = box.closest('[data-cms-section]'); if (sec && !list.length) sec.hidden = true;
    box.replaceChildren(...list.map(g => galleryFigure(g, 'case-card')));
  };
  R.faqs = (box, data) => {
    const list = published(data.faqs, f => f.page === 'contact');
    if (!list.length) return false;
    box.replaceChildren(...list.map(f => el('details', {}, el('summary', { text: f.question }), el('p', {}, renderInline(f.answer)))));
  };

  const applyCollections = data => {
    $$('[data-cms-collection]').forEach(box => {
      const fn = R[box.getAttribute('data-cms-collection')];
      if (fn) { try { fn(box, data); } catch (e) { if (PREVIEW) console.warn('[cms]', e); } }
    });
  };

  // ------------------------------------------------- doctor profiles -------
  const findBySlug = (list, entity, slug, data) => {
    const hit = (list || []).find(x => x.slug === slug);
    if (hit) return { item: hit };
    const r = (data.redirects || []).find(x => x.entity === entity && x.from === slug);
    if (r) return { redirect: r.to };
    return {};
  };
  const notAvailable = (main, text, back, backLabel) => {
    main.replaceChildren(el('section', { class: 'page-head' }, el('div', { class: 'wrap' },
      el('h1', { text }), el('p', { class: 'lede', text: 'The page you are looking for is not available at the moment.' }),
      el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: back, text: backLabel })))));
    setMeta('name', 'robots', 'noindex, follow');
  };
  const fillProfile = (main, d) => {
    const crumb = $('.crumbs [aria-current="page"]', main); if (crumb) crumb.textContent = d.name;
    const profile = $('.profile', main);
    if (!profile) return;
    const [photoCol, textCol] = profile.children;
    const img = d.photo && mediaUrl(d.photo);
    if (photoCol) {
      if (img) {
        const i = el('img', { alt: d.photo_alt || d.name });
        setImage(i, d.photo, d.photo_alt || d.name);
        if (d.photo.srcset && d.photo.static) i.setAttribute('sizes', '(max-width:760px) 92vw, 40vw');
        photoCol.replaceChildren(el('figure', { class: 'portrait' }, i));
      } else {
        photoCol.replaceChildren(el('div', { class: 'profile-photo-empty' }, el('div', { class: 'no-photo' }, el('b', { text: d.initials || initialsOf(d.name) }), el('small', { text: d.photo_placeholder || 'Photo not provided' }))));
      }
    }
    if (textCol) {
      const h1 = $('h1', textCol); if (h1) h1.textContent = d.name;
      const role = $('p.role', textCol); if (role) role.textContent = roleLine(d);
      const btns = $('.btn-row', textCol);
      if (role) { let n = role.nextSibling; while (n && n !== btns) { const next = n.nextSibling; n.remove(); n = next; } }
      const body = renderBlocks(d.bio || '');
      if (d.experience) body.append(el('p', {}, el('strong', { text: 'Experience: ' }), d.experience));
      if (d.specialisations && d.specialisations.length) body.append(el('h2', { text: 'Specialisations' }), el('ul', {}, ...d.specialisations.map(s => el('li', { text: s }))));
      btns ? btns.before(body) : textCol.append(body);
    }
    if (d.seo_title) document.title = d.seo_title;
    setMeta('name', 'description', d.seo_description);
    setMeta('property', 'og:title', d.seo_title || d.name);
    setMeta('property', 'og:description', d.seo_description);
    if (d.noindex) setMeta('name', 'robots', 'noindex, follow');
  };
  const applyDoctorPage = data => {
    const main = $('[data-cms-doctor]');
    if (!main) return;
    const res = findBySlug(data.doctors, 'doctor', main.getAttribute('data-cms-doctor'), data);
    if (res.item) fillProfile(main, res.item);
    else notAvailable(main, 'Profile not available', 'doctors.html', 'View all doctors');
  };
  const buildProfileShell = () => el('section', { class: 'page-head' }, el('div', { class: 'wrap' },
    el('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, el('a', { href: 'index.html', text: 'Home' }), ' / ', el('a', { href: 'doctors.html', text: 'Our Doctors' }), ' / ', el('span', { 'aria-current': 'page' })),
    el('div', { class: 'profile' }, el('div'), el('div', {}, el('h1'), el('p', { class: 'role' }),
      el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: 'contact.html', 'data-book': 'true', text: 'Book an Appointment' }), el('a', { class: 'btn ghost', href: 'doctors.html', text: 'All doctors' }))))));
  const applyDynamicDoctor = data => {
    const main = $('[data-cms-doctor-page]');
    if (!main) return;
    const slug = (params.get('slug') || '').toLowerCase();
    const res = findBySlug(data.doctors, 'doctor', slug, data);
    if (res.redirect) { const t = (data.doctors || []).find(x => x.slug === res.redirect); location.replace(t ? profileUrl(t) : `doctor.html?slug=${encodeURIComponent(res.redirect)}`); return; }
    if (!res.item) { notAvailable(main, 'Profile not available', 'doctors.html', 'View all doctors'); return; }
    if (res.item.legacy_page && !PREVIEW) { location.replace(res.item.legacy_page); return; }
    main.replaceChildren(buildProfileShell());
    fillProfile(main, res.item);
    if (!res.item.seo_title) document.title = `${res.item.name} | ${(data.settings.contact || {}).clinic_name || 'Sri Danvantari Dental Care'}`;
  };

  // --------------------------------------------- treatment detail page -----
  const applyTreatmentPage = data => {
    const main = $('[data-cms-treatment-page]');
    if (!main) return;
    const slug = (params.get('slug') || '').toLowerCase();
    const res = findBySlug(data.treatments, 'treatment', slug, data);
    if (res.redirect) { location.replace(`treatment.html?slug=${encodeURIComponent(res.redirect)}${PREVIEW ? '&preview=1' : ''}`); return; }
    const t = res.item;
    if (!t) { notAvailable(main, 'Treatment not found', 'treatments.html', 'View all treatments'); return; }
    const sc = sectionContent(data, 'treatments.featured');
    const clinic = (data.settings.contact || {}).clinic_name || 'Sri Danvantari Dental Care';
    const head = el('section', { class: 'page-head' }, el('div', { class: 'wrap' },
      el('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, el('a', { href: 'index.html', text: 'Home' }), ' / ', el('a', { href: 'treatments.html', text: 'Treatments' }), ' / ', el('span', { 'aria-current': 'page', text: t.title })),
      el('h1', { text: t.title }), t.card_summary ? el('p', { class: 'lede', text: t.card_summary }) : null));
    const body = el('div', {});
    body.append(renderBlocks(t.description || ''));
    if (t.benefits && t.benefits.length) body.append(el('h3', { text: 'Benefits' }), el('ul', {}, ...t.benefits.map(b => el('li', { text: b }))));
    if (t.procedure_details) { body.append(el('h3', { text: 'What the treatment involves' })); body.append(renderBlocks(t.procedure_details, { heading: 'h3' })); }
    if (t.consult_questions && t.consult_questions.length) body.append(el('h3', { text: sc.questions_heading || 'Questions to ask at your consultation' }), el('ul', {}, ...t.consult_questions.map(q => el('li', { text: q }))));
    body.append(el('div', { class: 'btn-row' }, bookBtn('btn', t.cta_label || 'Ask about this treatment', t.booking_value), el('a', { class: 'btn ghost', href: 'treatments.html', text: 'All treatments' })));
    const rowImg = t.image ? cardImage(t.image, t.image_alt || t.image.alt) : null;
    const sections = [head, el('section', { class: 'section' }, el('div', { class: 'wrap' }, el('div', { class: 't-rows' }, el('article', { class: 't-row' }, el('div', { class: 't-visual' }, rowImg), body))))];
    if (t.faqs && t.faqs.length) {
      sections.push(el('section', { class: 'section soft', 'aria-labelledby': 'tfaq' }, el('div', { class: 'wrap' }, el('div', { class: 'section-head stack' }, el('h2', { id: 'tfaq', text: 'Frequently asked questions' })),
        el('div', { class: 'faq' }, ...t.faqs.filter(f => f && f.q && f.a).map(f => el('details', {}, el('summary', { text: f.q }), el('p', {}, renderInline(f.a))))))));
    }
    if (rowImg && t.image.static && /illustrations\//.test(t.image.static)) sections[1].firstChild.append(el('p', { class: 'fine illus-note', text: 'Images are illustrations of each treatment, not patient photographs.' }));
    main.replaceChildren(...sections);
    document.title = t.seo_title || `${t.title} | ${clinic}`;
    setMeta('name', 'description', t.seo_description || t.card_summary);
    setMeta('property', 'og:title', t.seo_title || t.title);
    setMeta('property', 'og:description', t.seo_description || t.card_summary);
    const og = absUrl(mediaUrl(t.og_image), (data.settings.site || {}).site_url);
    if (og && /^https:/.test(og)) setMeta('property', 'og:image', og);
    if (t.noindex) setMeta('name', 'robots', 'noindex, follow');
  };

  // ------------------------------------------------------ preview bar ------
  const showPreviewBar = (msg, isError) => {
    let bar = $('.cms-preview-bar');
    if (!bar) {
      const exit = new URL(location.href); exit.searchParams.delete('preview');
      bar = el('div', { class: 'cms-preview-bar', role: 'status' }, el('span'), el('a', { href: exit.pathname.split('/').pop() + exit.search + exit.hash, text: 'Exit preview' }));
      document.body.prepend(bar);
      setMeta('name', 'robots', 'noindex, nofollow');
      $('meta[name="robots"]')?.setAttribute('data-preview', '');
    }
    bar.classList.toggle('is-error', !!isError);
    bar.firstChild.textContent = msg;
  };

  // ------------------------------------------------------------ apply ------
  const apply = data => {
    if (!data || typeof data !== 'object') return;
    const steps = [applySettings, applyNav, d => applySeo((d.seo || {})[PAGE_FILE], d), applySections, applyCollections, applyDoctorPage, applyDynamicDoctor, applyTreatmentPage];
    steps.forEach(fn => { try { fn(data); } catch (e) { if (PREVIEW) console.warn('[cms]', e); } });
    SDDC.content = data;
    document.dispatchEvent(new CustomEvent('sddc:content', { detail: data }));
  };

  // Public: appointment submission used by script.js
  SDDC.submitAppointment = (p, opts = {}) => rpc('submit_appointment', {
    p_name: p.name, p_phone: p.phone, p_treatment: p.treatment || '', p_date: p.date || null,
    p_time: p.time || '', p_message: p.message || '', p_website: p.website || ''
  }, { keepalive: !!opts.keepalive, timeout: 10000 });

  const run = async () => {
    if (PREVIEW) showPreviewBar('Preview mode: loading draft content…');
    else {
      const cached = readStore(localStorage, CACHE_KEY);
      if (cached) {
        try { const c = JSON.parse(cached); if (c && c.t && Date.now() - c.t < 7 * 24 * 3600 * 1000) apply(c.d); } catch { /* ignore bad cache */ }
      }
      const c2 = (() => { try { return JSON.parse(readStore(localStorage, CACHE_KEY) || 'null'); } catch { return null; } })();
      if (c2 && Date.now() - c2.t < FRESH_MS) return;  // fetched moments ago: skip the network
    }
    try {
      const data = await rpc('get_site_content', { p_page: PAGE, p_preview: PREVIEW }, { auth: PREVIEW });
      apply(data);
      if (PREVIEW) showPreviewBar('Preview mode: showing draft and unpublished changes. Visitors cannot see this.');
      else writeStore(localStorage, CACHE_KEY, JSON.stringify({ t: Date.now(), d: data }));
    } catch (e) {
      if (PREVIEW) showPreviewBar('Preview unavailable: ' + (e.status === 401 || e.status === 403 || /administrator/i.test(e.message) ? 'please sign in to the Admin Dashboard in this browser first.' : e.message), true);
      SDDC.contentError = e;
      const dyn = $('[data-cms-treatment-page],[data-cms-doctor-page]');
      if (dyn) {
        const isT = dyn.hasAttribute('data-cms-treatment-page');
        const lede = $('.lede', dyn);
        if (lede) { lede.replaceChildren('This page could not be loaded right now. Please try again shortly, or ', el('a', { href: isT ? 'treatments.html' : 'doctors.html', text: isT ? 'view all treatments' : 'view all doctors' }), '.'); }
      }
      document.dispatchEvent(new CustomEvent('sddc:content-error', { detail: e }));
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
