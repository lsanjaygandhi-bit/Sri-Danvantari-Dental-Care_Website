// Media library: upload, preview, search, alt text, replace, usage check, delete.
import { h, $, $$, toast, confirmDialog, modal, debounce, fmtDateTime } from '../ui.js';
import { ctx, q, can, pageHead, forbidden, mediaUrl, BASE, markDirty } from '../core.js';

const MAX_INPUT = 15 * 1024 * 1024;   // largest file accepted before compression
const MAX_STORED = 5 * 1024 * 1024;   // bucket limit
const MAX_EDGE = 2000;                // longest side after resizing
const COLS = 'id,title,original_name,static_path,storage_path,srcset,mime_type,size_bytes,width,height,alt_text,caption,contains_patient,patient_consent,consent_note,is_builtin,created_at,updated_at';

// --- file checks -----------------------------------------------------------
async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const s = String.fromCharCode(...b);
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b[0] === 0x89 && s.slice(1, 4) === 'PNG') return 'image/png';
  if (s.slice(0, 4) === 'RIFF' && s.slice(8, 12) === 'WEBP') return 'image/webp';
  if (s.slice(4, 12) === 'ftypavif' || s.slice(4, 12) === 'ftypavis') return 'image/avif';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  return null;
}
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/x-icon': 'ico' };

// Validate, resize and compress an image in the browser before upload.
export async function prepareImage(file, { favicon = false } = {}) {
  if (file.size > MAX_INPUT) throw new Error(`${file.name} is larger than 15 MB.`);
  const type = await sniff(file);
  if (!type) throw new Error(`${file.name} is not a supported image. Use JPG, PNG, WebP or AVIF (SVG is not accepted for security reasons).`);
  if (type === 'image/x-icon') {
    if (file.size > MAX_STORED) throw new Error('Icon file is too large.');
    return { blob: file, type, width: null, height: null };
  }
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error(`${file.name} could not be read as an image.`); }
  const { width, height } = bmp;
  if (width < 16 || height < 16) throw new Error('Image is too small.');
  if (favicon) {
    if (type !== 'image/png') throw new Error('Favicons must be PNG files.');
    if (width !== height || width < 32 || width > 1024) throw new Error('Favicons must be square PNGs between 32 and 1024 px.');
    if (file.size > MAX_STORED) throw new Error('Favicon file is too large.');
    return { blob: file, type, width, height };
  }
  // Keep small PNGs (e.g. logos with transparency) as they are; otherwise convert to WebP.
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  if (type === 'image/png' && scale === 1 && file.size <= 800 * 1024) return { blob: file, type, width, height };
  const w = Math.round(width * scale), hh = Math.round(height * scale);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = hh;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, hh);
  let blob = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.85));
  let outType = 'image/webp';
  if (!blob || blob.type !== 'image/webp') { blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85)); outType = 'image/jpeg'; }
  if (blob.size > MAX_STORED) blob = await new Promise(r => canvas.toBlob(r, outType, 0.7));
  if (blob.size > MAX_STORED) throw new Error('Image is still larger than 5 MB after compression. Use a smaller image.');
  return { blob, type: outType, width: w, height: hh };
}

// Upload with progress (XHR) to a generated, safe path.
function uploadBlob(blob, type, onProgress) {
  const now = new Date();
  const path = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${EXT[type]}`;
  return new Promise(async (resolve, reject) => {
    const { data } = await ctx.sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return reject(new Error('Your session has expired. Please sign in again.'));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/storage/v1/object/media/${path}`);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('apikey', window.SDDC_CONFIG.supabaseKey);
    xhr.setRequestHeader('Content-Type', type);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=31536000');
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(path);
      else { let m = 'Upload failed.'; try { m = JSON.parse(xhr.responseText).message || m; } catch { /* keep default */ } reject(new Error(/row-level|403|unauthor/i.test(m) ? 'Your role does not allow uploads.' : m)); }
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.send(blob);
  });
}
async function removeObject(path) {
  if (!path) return;
  const { error } = await ctx.sb.storage.from('media').remove([path]);
  if (error) console.warn('storage remove failed', error);
}

export async function uploadFile(file, opts = {}) {
  const prep = await prepareImage(file, opts);
  const path = await uploadBlob(prep.blob, prep.type, opts.onProgress);
  try {
    return await q(ctx.sb.from('media_assets').insert({
      storage_path: path, title: (opts.title || file.name.replace(/\.[^.]+$/, '')).slice(0, 120), original_name: file.name.slice(0, 200),
      mime_type: prep.type, size_bytes: prep.blob.size, width: prep.width, height: prep.height,
      alt_text: (opts.alt || '').slice(0, 300), contains_patient: !!opts.contains_patient, patient_consent: !!opts.patient_consent,
    }).select(COLS).single());
  } catch (e) { await removeObject(path); throw e; }
}

async function replaceFile(asset, file, onProgress) {
  const prep = await prepareImage(file, { favicon: /favicon|icon/i.test(asset.title) && asset.mime_type === 'image/png' && asset.width === asset.height });
  const path = await uploadBlob(prep.blob, prep.type, onProgress);
  try {
    const rows = await q(ctx.sb.from('media_assets').update({ storage_path: path, static_path: null, srcset: null, mime_type: prep.type, size_bytes: prep.blob.size, width: prep.width, height: prep.height, original_name: file.name.slice(0, 200) })
      .eq('id', asset.id).eq('updated_at', asset.updated_at).select(COLS));
    if (!rows.length) throw new Error('This image was changed by someone else. Reload and try again.');
    if (asset.storage_path) await removeObject(asset.storage_path);  // original website files are never deleted
    return rows[0];
  } catch (e) { await removeObject(path); throw e; }
}

// --- library page ----------------------------------------------------------
export async function render(content) {
  if (!can.editContent()) return forbidden(content, 'the media library');
  let assets = await q(ctx.sb.from('media_assets').select(COLS).order('created_at', { ascending: false }));
  const grid = h('div', { class: 'media-grid' });
  const search = h('input', { type: 'search', placeholder: 'Search by title, file name or description…', 'aria-label': 'Search media' });
  const kind = h('select', { 'aria-label': 'Filter' }, ...[['', 'All images'], ['uploads', 'Uploaded'], ['builtin', 'Original website files'], ['patient', 'Patient images'], ['noalt', 'Missing description']].map(([v, t]) => { const o = h('option', { text: t }); o.value = v; return o; }));
  const draw = () => {
    const t = search.value.trim().toLowerCase();
    const k = kind.value;
    const list = assets.filter(a => (!t || `${a.title} ${a.original_name} ${a.alt_text} ${a.caption}`.toLowerCase().includes(t))
      && (!k || (k === 'uploads' && a.storage_path) || (k === 'builtin' && a.is_builtin) || (k === 'patient' && a.contains_patient) || (k === 'noalt' && !a.alt_text)));
    grid.replaceChildren(...(list.length ? list.map(a => card(a, () => details(a, updated => {
      if (updated === null) assets = assets.filter(x => x.id !== a.id); else assets = assets.map(x => x.id === a.id ? updated : x);
      draw();
    }))) : [h('p', { class: 'empty', text: 'No images match.' })]));
  };
  search.addEventListener('input', debounce(draw, 150));
  kind.addEventListener('change', draw);
  const zone = dropzone(async files => {
    for (const f of files) {
      const prog = h('progress', { max: 1, value: 0 });
      const row = h('div', { class: 'small' }, `Uploading ${f.name}…`, prog);
      zone.append(row);
      try { const a = await uploadFile(f, { onProgress: p => { prog.value = p; } }); assets.unshift(a); toast(`${f.name} uploaded. Add a description (alt text) next.`, 'ok'); }
      catch (e) { toast(e.message, 'err'); }
      row.remove();
    }
    draw();
  });
  draw();
  content.replaceChildren(pageHead('Media library', 'All images used on the website. Uploads are checked, resized to at most 2000 px and compressed automatically (max 5 MB).'),
    zone, h('div', { class: 'toolbar' }, h('div', { class: 'grow' }, search), kind), grid);
}

function dropzone(onFiles, { multiple = true } = {}) {
  const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/avif,image/x-icon,.ico', multiple, class: 'sr-only', id: 'dz-' + Math.random().toString(36).slice(2) });
  const zone = h('div', { class: 'dropzone' }, input, h('p', {}, 'Drag images here or ', h('label', { for: input.id, class: 'linkish', text: 'choose files' }), '.'), h('p', { class: 'small muted', text: 'JPG, PNG, WebP or AVIF. Do not upload identifiable patient photos without written consent.' }));
  input.addEventListener('change', () => { onFiles([...input.files]); input.value = ''; });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); onFiles([...e.dataTransfer.files]); });
  return zone;
}

function card(a, onClick, selected) {
  return h('button', { class: 'media-card' + (selected ? ' selected' : ''), type: 'button', onclick: onClick, 'aria-label': `${a.title || a.original_name}` },
    h('span', { class: 'img' }, h('img', { src: mediaUrl(a), alt: '', loading: 'lazy' })),
    h('span', { class: 'meta' }, h('b', { text: a.title || a.original_name || 'Untitled' }),
      h('span', { text: `${a.width ? `${a.width}×${a.height}` : a.mime_type.replace('image/', '')}${a.is_builtin ? ' · original' : ''}${!a.alt_text ? ' · no description' : ''}${a.contains_patient ? ' · patient' : ''}` })));
}

async function details(a, onChange) {
  const usage = await q(ctx.sb.rpc('admin_media_usage', { p_id: a.id }));
  const title = h('input', { type: 'text', maxlength: 120, value: a.title });
  const alt = h('input', { type: 'text', maxlength: 300, value: a.alt_text });
  const caption = h('input', { type: 'text', maxlength: 300, value: a.caption });
  const patient = h('input', { type: 'checkbox', checked: a.contains_patient });
  const consent = h('input', { type: 'checkbox', checked: a.patient_consent });
  const note = h('textarea', { rows: 2, maxlength: 500 }); note.value = a.consent_note;
  const prog = h('progress', { max: 1, value: 0, hidden: true });
  const replaceInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/avif', class: 'sr-only', id: 'rep-' + a.id });
  let current = a;
  replaceInput.addEventListener('change', async () => {
    const f = replaceInput.files[0]; replaceInput.value = '';
    if (!f) return;
    if (!(await confirmDialog('Replace this image?', `Every place that uses this image (${usage.length || 'none'}) will show the new file.${current.is_builtin ? ' The original website file is kept on the server.' : ' The old file will be deleted.'}`, 'Replace', false))) return;
    prog.hidden = false;
    try { current = await replaceFile(current, f, p => { prog.value = p; }); toast('Image replaced everywhere it is used.', 'ok'); onChange(current); m.close(); }
    catch (e) { toast(e.message, 'err'); }
    prog.hidden = true;
  });
  const body = h('div', {},
    h('img', { src: mediaUrl(a), alt: '', class: 'thumb', style: null }),
    h('dl', { class: 'kv' },
      h('dt', { text: 'File' }), h('dd', { text: a.static_path || a.storage_path }),
      h('dt', { text: 'Type / size' }), h('dd', { text: `${a.mime_type}${a.width ? ` · ${a.width}×${a.height}px` : ''}${a.size_bytes ? ` · ${Math.round(a.size_bytes / 1024)} KB` : ''}` }),
      h('dt', { text: 'Added' }), h('dd', { text: fmtDateTime(a.created_at) }),
      h('dt', { text: 'Used in' }), h('dd', {}, usage.length ? h('ul', {}, ...usage.map(u => h('li', { text: `${u.kind}: ${u.label}` }))) : 'Not used anywhere')),
    h('label', { text: 'Title (internal)' }), title,
    h('label', { text: 'Description for screen readers (alt text)' }), alt,
    h('span', { class: 'hint', text: 'Describe what the image shows. Used wherever a page does not set its own description.' }),
    h('label', { text: 'Caption' }), caption,
    h('label', { class: 'check' }, patient, h('span', {}, 'Shows an identifiable patient', h('span', { class: 'hint', text: 'Faces, names or anything that could identify a patient.' }))),
    h('label', { class: 'check' }, consent, h('span', {}, 'Written patient consent is on file', h('span', { class: 'hint', text: 'Required before an identifiable patient image can be published.' }))),
    h('label', { text: 'Consent notes (internal)' }), note,
    h('div', { class: 'btn-row' }, h('label', { for: replaceInput.id, class: 'btn ghost small', text: 'Replace image…' }), replaceInput), prog);
  const m = modal(a.title || 'Image', body, [
    { label: 'Delete', kind: 'danger ghost', onClick: async close => {
      if (a.is_builtin) return toast('Original website images cannot be deleted. Use Replace instead.', 'err');
      if (usage.length) return toast('This image is still used. Remove it from those places first.', 'err');
      if (!(await confirmDialog('Delete image?', 'The file will be permanently deleted.', 'Delete'))) return;
      try { await q(ctx.sb.from('media_assets').delete().eq('id', a.id)); await removeObject(a.storage_path); toast('Image deleted.', 'ok'); onChange(null); close(); }
      catch (e) { toast(e.message, 'err'); }
    } },
    { label: 'Cancel' },
    { label: 'Save', kind: '', onClick: async close => {
      if (/<[^>]+>/.test(alt.value + title.value + caption.value)) return toast('HTML is not allowed.', 'err');
      try {
        const rows = await q(ctx.sb.from('media_assets').update({ title: title.value.trim(), alt_text: alt.value.trim(), caption: caption.value.trim(), contains_patient: patient.checked, patient_consent: consent.checked, consent_note: note.value.trim() })
          .eq('id', a.id).eq('updated_at', current.updated_at).select(COLS));
        if (!rows.length) throw new Error('This image was changed by someone else. Reload and try again.');
        toast('Image details saved.', 'ok'); onChange(rows[0]); close();
      } catch (e) { toast(e.message, 'err'); }
    } },
  ], { wide: true });
}

// --- picker used by forms --------------------------------------------------
export function pickMedia(opts = {}) {
  return new Promise(async resolve => {
    let chosen = null, confirmed = false;
    let assets = await q(ctx.sb.from('media_assets').select(COLS).order('created_at', { ascending: false })).catch(() => []);
    if (opts.favicon) assets = assets.filter(a => a.mime_type === 'image/png' || a.mime_type.includes('icon'));
    const grid = h('div', { class: 'media-grid' });
    const search = h('input', { type: 'search', placeholder: 'Search…', 'aria-label': 'Search media' });
    const draw = () => {
      const t = search.value.trim().toLowerCase();
      grid.replaceChildren(...assets.filter(a => !t || `${a.title} ${a.original_name} ${a.alt_text}`.toLowerCase().includes(t)).map(a => card(a, () => { chosen = a; draw(); }, chosen?.id === a.id)));
    };
    search.addEventListener('input', debounce(draw, 150));
    const zone = dropzone(async files => {
      const prog = h('progress', { max: 1, value: 0 }); zone.append(prog);
      try { const a = await uploadFile(files[0], { favicon: opts.favicon, onProgress: p => { prog.value = p; } }); assets.unshift(a); chosen = a; draw(); toast('Uploaded. Remember to add a description in the media library.', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
      prog.remove();
    }, { multiple: false });
    draw();
    const m = modal('Choose an image', h('div', {}, zone, h('div', { class: 'toolbar' }, h('div', { class: 'grow' }, search)), grid), [
      { label: 'Cancel', onClick: close => { chosen = null; close(); } },
      { label: 'Use selected image', kind: '', onClick: close => { if (!chosen) return toast('Select an image first.', 'err'); if (chosen.contains_patient && !chosen.patient_consent) toast('Warning: this image is marked as an identifiable patient without consent. It cannot be published.', 'err'); confirmed = true; close(); } },
    ], { wide: true, onClose: () => resolve(confirmed ? chosen : null) });
  });
}
