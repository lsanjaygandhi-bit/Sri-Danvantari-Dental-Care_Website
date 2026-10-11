const menu = document.getElementById('menu');
const nav = document.getElementById('nav');
if (menu && nav) {
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open menu'); menu.focus(); } });
  menu.setAttribute('aria-expanded', 'false');
  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open menu');
  }));
}
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
const backToTop = document.querySelector('.back-to-top');
if (backToTop) {
  const update = () => backToTop.classList.toggle('visible', window.scrollY > 320);
  window.addEventListener('scroll', update, {passive:true}); update();
  backToTop.addEventListener('click', e => {e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});});
}
(() => {
  const modal=document.getElementById('appointmentModal'); if(!modal) return;
  const form=document.getElementById('appointmentPopupForm');
  const status=document.getElementById('appointmentPopupStatus');
  const date=document.getElementById('popupDate');
  const phone=document.getElementById('popupPhone');
  const dialog=modal.querySelector('[role="dialog"]');
  let lastFocus=null, historyOpen=false;
  // Clinic numbers and booking options come from the Admin Dashboard settings when available.
  const settings=()=>(window.SDDC&&window.SDDC.settings)||{};
  const clinicWhatsApp=()=>{const n=(settings().contact||{}).whatsapp;return /^[0-9]{10,13}$/.test(n||'')?n:'919884048448'};
  const bookingMode=()=>{const b=window.SDDC&&window.SDDC.booking;return (b&&b.mode&&window.SDDC.submitAppointment)?b.mode:'whatsapp_only'};
  const closedDays=()=>{const d=(settings().hours||{}).closed_days;return Array.isArray(d)?d.map(Number):[0]};
  const submitLabel=()=>(window.SDDC&&window.SDDC.submitLabel)||'Send via WhatsApp';
  const resetSubmit=submit=>{if(!submit)return;submit.disabled=false;submit.textContent=submitLabel()+' ';const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent='→';submit.appendChild(arrow)};
  const idleStatus=()=>bookingMode()==='store_only'?'Your request will be sent securely to the clinic for appointment follow-up.':'Your details will be sent to the clinic via WhatsApp for appointment follow-up.';
  const localISO=(offsetDays=0)=>{const d=new Date();d.setDate(d.getDate()+offsetDays);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
  const setDateMin=()=>{if(date){date.min=localISO();date.max=localISO(365)}}; setDateMin();
  const validateDate=()=>{if(!date||!date.value)return true;const d=new Date(date.value+'T12:00:00');const closed=closedDays();if(closed.includes(d.getDay())){date.setCustomValidity(closed.length===1&&closed[0]===0?'The clinic is listed as open Monday to Saturday. Please choose another date.':'The clinic is closed on that day. Please choose another date.');date.reportValidity();return false;}date.setCustomValidity('');return true};
  date?.addEventListener('change',validateDate);
  phone?.addEventListener('input',()=>{let digits=phone.value.replace(/\D/g,'');if(digits.length===12&&digits.startsWith('91'))digits=digits.slice(2);else if(digits.length===11&&digits.startsWith('0'))digits=digits.slice(1);phone.value=digits.length>10?digits.slice(-10):digits;phone.setCustomValidity('')});
  const treatmentSelect=document.getElementById('popupTreatment');
  const openModal=(e,trigger)=>{if(e)e.preventDefault();lastFocus=document.activeElement;const wanted=trigger?.dataset?.treatment;if(wanted&&treatmentSelect){const opt=[...treatmentSelect.options].find(o=>o.value===wanted);if(opt)treatmentSelect.value=wanted;}modal.classList.add('is-open');document.body.classList.add('appointment-modal-open');setDateMin();if(!historyOpen){history.pushState({appointmentModal:true},'','#book-appointment');historyOpen=true;}setTimeout(()=>document.getElementById('popupName')?.focus(),20)};
  const resetAndClose=()=>{modal.classList.remove('is-open');document.body.classList.remove('appointment-modal-open');if(form){form.reset();if(status)status.textContent=idleStatus();resetSubmit(form.querySelector('[type="submit"]'))}setDateMin();historyOpen=false;if(lastFocus?.focus)lastFocus.focus()};
  const closeModal=(fromPop=false)=>{if(!modal.classList.contains('is-open'))return;if(historyOpen&&!fromPop){historyOpen=false;history.back();}resetAndClose()};
  // Delegated, so buttons added later by the content loader also open the form.
  document.addEventListener('click',e=>{const trigger=e.target.closest&&e.target.closest('[data-book="true"]');if(trigger&&!modal.contains(trigger))openModal(e,trigger)});
  window.SDDC=window.SDDC||{};window.SDDC.openAppointment=()=>openModal();
  modal.querySelectorAll('[data-close-appointment]').forEach(el=>el.addEventListener('click',()=>closeModal()));
  window.addEventListener('popstate',()=>{if(modal.classList.contains('is-open'))closeModal(true)});
  document.addEventListener('keydown',e=>{if(!modal.classList.contains('is-open'))return;if(e.key==='Escape'){e.preventDefault();closeModal();return}if(e.key==='Tab'){const nodes=[...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
  const openWhatsApp=url=>{if(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)){window.location.href=url}else{const w=window.open(url,'_blank');if(w){w.opener=null}else{window.location.href=url}}};
  form?.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity()||!validateDate())return;const digits=(phone?.value||'').replace(/\D/g,'');if(!/^[6-9]\d{9}$/.test(digits)){phone?.setCustomValidity('Enter a valid 10-digit Indian mobile number.');phone?.reportValidity();return}
    const name=document.getElementById('popupName')?.value.trim()||'';const treatment=document.getElementById('popupTreatment')?.value||'General consultation';const rawDate=date?.value||'';const dateValue=rawDate?new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date(rawDate+'T12:00:00')):'Not specified';const time=document.getElementById('popupTime')?.value||'Clinic to advise';const message=document.getElementById('popupMessage')?.value.trim()||'';const website=document.getElementById('popupWebsite')?.value||'';
    const request={name,phone:digits,treatment,date:rawDate||null,time,message,website};
    const mode=bookingMode();const submit=form.querySelector('[type="submit"]');
    const body=`Appointment enquiry - Sri Danvantari Dental Care\nName: ${name}\nPatient mobile: +91 ${digits}\nTreatment: ${treatment}\nPreferred date: ${dateValue}\nPreferred time: ${time}\nAdditional details: ${message||'None'}`;
    const url='https://wa.me/'+clinicWhatsApp()+'?text='+encodeURIComponent(body);
    if(mode==='store_only'){
      if(submit){submit.disabled=true;submit.textContent='Sending…'}
      if(status)status.textContent='Sending your request…';
      try{const res=await window.SDDC.submitAppointment(request);const ref=res&&res.reference?` Your reference is ${res.reference}.`:'';
        if(status)status.textContent=`Thank you. Your request has been received.${ref} The clinic will contact you to confirm. Your appointment is confirmed only when the clinic contacts you.`;
        form.reset();setDateMin();if(submit){submit.textContent='Request sent';setTimeout(()=>{if(submit.isConnected)resetSubmit(submit)},4000)}
      }catch(err){if(status){status.textContent=(err&&err.message?err.message+' ':'Sorry, your request could not be sent. ')+'You can also message the clinic on WhatsApp. ';const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent='Open WhatsApp';status.appendChild(a)}resetSubmit(submit)}
      return;
    }
    // Store a copy for the clinic's dashboard (fire-and-forget; WhatsApp still opens).
    if(mode==='whatsapp_and_store'){try{window.SDDC.submitAppointment(request,{keepalive:true}).catch(()=>{})}catch(_){}}
    if(status)status.textContent='Opening WhatsApp. Press Send there to share your request. Your appointment is confirmed only when the clinic contacts you.';
    if(submit){submit.disabled=true;submit.textContent='Opening WhatsApp…';setTimeout(()=>{if(submit.isConnected)resetSubmit(submit);if(status)status.textContent=idleStatus()},3000)}
    openWhatsApp(url)});
})();

// Patient feedback carousel: arrow buttons (desktop), native touch swipe (mobile), keyboard arrows on the track.
// Review order is preserved exactly as supplied (see CHANGELOG.md): no reliable capture date exists, so reviews are not re-sorted.
(() => {
  const track = document.getElementById('review-track');
  if (!track) return;
  const buttons = [...document.querySelectorAll('[data-review-scroll]')];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const step = () => {
    const card = track.querySelector('.review-card');
    const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 20;
    return card ? card.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
  };
  const scrollByCards = dir => track.scrollBy({ left: dir * step(), behavior: reduce.matches ? 'auto' : 'smooth' });
  const update = () => {
    const max = track.scrollWidth - track.clientWidth - 2;
    buttons.forEach(btn => { btn.disabled = Number(btn.dataset.reviewScroll) < 0 ? track.scrollLeft <= 2 : track.scrollLeft >= max; });
  };
  buttons.forEach(btn => btn.addEventListener('click', () => scrollByCards(Number(btn.dataset.reviewScroll))));
  track.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); scrollByCards(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); scrollByCards(-1); }
  });
  let raf = 0;
  track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
  window.addEventListener('resize', update);
  document.addEventListener('sddc:content', () => requestAnimationFrame(update));
  update();
})();


// Header hides while scrolling down and reappears when scrolling up (same behaviour on every page).
// It stays visible near the top, while the mobile menu is open, while it has keyboard focus, and while the appointment popup is open.
(() => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const navEl = document.getElementById('nav');
  let previousY = window.scrollY;
  let ticking = false;
  const mustStay = () => navEl?.classList.contains('open') || header.contains(document.activeElement) || document.body.classList.contains('appointment-modal-open');
  const updateHeader = () => {
    const currentY = Math.max(0, window.scrollY);
    const delta = currentY - previousY;
    if (currentY < 80 || mustStay() || delta < -6) header.classList.remove('header-hidden');
    else if (delta > 6) header.classList.add('header-hidden');
    if (Math.abs(delta) > 6 || currentY < 80) previousY = currentY;
    ticking = false;
  };
  window.addEventListener('scroll', () => { if (!ticking) { window.requestAnimationFrame(updateHeader); ticking = true; } }, { passive: true });
  header.addEventListener('focusin', () => header.classList.remove('header-hidden'));
})();


// ---------------------------------------------------------------------------
// Chat with Us — website-native help desk (DEMO MODE: fixed answers, no AI).
// All answers below use only facts already published on this website.
// It never diagnoses, prescribes, quotes fees or availability, and never opens WhatsApp.
//
// AI INTEGRATION BOUNDARY (not implemented): to add a real assistant, create a
// server-side endpoint you control (for example POST /api/chat) that holds the AI
// provider key, applies the same safety rules, and returns { reply: "..." }.
// Then implement askBackend() to call that endpoint. NEVER put an API key in
// this file or anywhere in browser-side code.
// ---------------------------------------------------------------------------
(() => {
  const launcher = document.getElementById('chatLauncher');
  const panel = document.getElementById('chatPanel');
  if (!launcher || !panel) return;
  const log = document.getElementById('chatLog');
  const chips = document.getElementById('chatChips');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const closeBtn = document.getElementById('chatClose');

  const askBackend = async () => null; // TODO(backend): see integration boundary above. Returns null in demo mode.

  let MAP = 'https://maps.app.goo.gl/Seyv466ZZs14exZS8?g_st=ic';
  const URGENT = {
    urgent: true,
    text: 'This could need urgent care. If you have severe facial swelling, swelling spreading towards the eye or neck, difficulty breathing or swallowing, bleeding that will not stop, a high fever with dental pain, or a facial injury, please seek urgent medical care now: go to the nearest hospital emergency department or call 108 (ambulance) or 112 (emergency).\n\nPlease do not wait for a chat reply or an appointment request.'
  };
  const ANSWERS = {
    location: { text: 'Sri Danvantari Dental Care is at No. 24, Navalar Main Road, Devaraj Nagar, near Shankar Narayanan Temple, Saligramam, Chennai 600093.', actions: [{ label: 'Get directions', href: MAP, external: true }, { label: 'Contact page', href: 'contact.html' }] },
    hours: { text: 'The current reference timings are Monday to Saturday, 10:00 am–12:00 pm and 6:30–9:00 pm. These timings are provisional, so please confirm with the clinic before visiting.', actions: [{ label: 'Contact page', href: 'contact.html' }] },
    booking: { text: 'You can request an appointment with the booking form. Add your name, mobile number and preferred date and time. The form opens WhatsApp with your request ready; you press Send there.\n\nYour appointment is confirmed only when the clinic contacts you.', actions: [{ label: 'Open booking form', book: true, primary: true }] },
    doctors: { text: 'The dental team listed on this website:\n• Dr. K. R. Srinivasan, BDS, Dentist & Implantologist\n• Dr. S. Kruparani, B.D.S., Dental Surgeon\n• Dr. Samyukta (profile details to be added)', actions: [{ label: 'Our doctors', href: 'doctors.html' }] },
    treatments: { text: 'Treatments listed for the clinic include dental implants, root canal treatment, braces and clear aligners, teeth whitening, smile designing, crowns and bridges, children\'s dental care, gum treatment, fillings, tooth extraction, dentures and laser treatments.\n\nPlease confirm availability and suitability with the clinic.', actions: [{ label: 'Treatments page', href: 'treatments.html' }] },
    fees: { text: 'Fees are not published on this website because they depend on an examination and your treatment plan. Please ask the clinic when you book.', actions: [{ label: 'Open booking form', book: true, primary: true }] },
    toothache: { text: 'Tooth pain has many possible causes, and only an examination can find the cause. Please book an appointment so a dentist can check it.\n\nIf the pain comes with facial swelling, fever, or difficulty opening your mouth, swallowing or breathing, please seek urgent medical care.', actions: [{ label: 'Open booking form', book: true, primary: true }] },
    gums: { text: 'Bleeding gums when brushing are common and are often linked to gum inflammation, but a dentist needs to check the cause. Keep brushing gently twice a day and book a check-up.\n\nIf bleeding is heavy or will not stop, seek urgent medical care.', actions: [{ label: 'Open booking form', book: true, primary: true }] },
    care: { text: 'General tips for healthy teeth:\n• Brush twice a day for about two minutes with a fluoride toothpaste.\n• Clean between your teeth once a day.\n• Cut down on sugary snacks and drinks between meals.\n• Visit a dentist for regular check-ups; the dentist will advise how often you need them.' },
    checkup: { text: 'How often you need a check-up depends on your teeth and gums, so the dentist will advise the right interval for you.', actions: [{ label: 'Open booking form', book: true, primary: true }] },
    meds: { text: 'I cannot recommend or prescribe any medicine. Please ask the dentist, or a doctor or pharmacist, before taking anything.\n\nIf you have severe swelling, fever, or difficulty breathing or swallowing, seek urgent medical care.', actions: [{ label: 'Open booking form', book: true, primary: true }] },
    prepare: { text: 'For your first visit, bring any previous dental records or X-rays, a list of the medicines you take, and details of any medical conditions or allergies.' },
    privacy: { text: 'This chat works entirely in your browser. Your messages are not sent anywhere or stored. Please do not share private medical details here.' },
    about: { text: 'I am an automated help desk with set answers about the clinic and general dental care. I am not a live AI or a dentist, so I cannot diagnose, prescribe, quote fees or book appointments.' },
    hello: { text: 'Hello! How can I help? You can ask about the clinic location, timings, doctors, treatments or how to book.' },
    thanks: { text: 'You are welcome. Take care!' },
    fallback: { text: 'Sorry, I can only answer basic questions about the clinic and general dental care. For anything about your own teeth, please book an appointment so a dentist can advise you.', actions: [{ label: 'Open booking form', book: true, primary: true }, { label: 'Contact page', href: 'contact.html' }] }
  };
  const INTENTS = [
    ['privacy', /\b(privacy|private|data|stored|store|safe to share)\b/],
    ['about', /\b(are you (a |an )?(bot|ai|robot|human|real|live|dentist|doctor|person)|who are you|chatbot|bot|robot|real person|live agent)\b/],
    ['meds', /\b(prescribe|prescription|antibiotic|antibiotics|medicine|medicines|medication|tablet|tablets|painkiller|painkillers|drug|drugs)\b/],
    ['prepare', /\b(bring|first visit|prepare|documents|records|x-?ray)\b/],
    ['location', /\b(where|address|location|located|direction|map|reach|landmark|saligramam|navalar)\b/],
    ['fees', /\b(fee|fees|cost|price|charge|charges|rate|how much|expensive|cheap|payment)\b/],
    ['toothache', /\b(pain|ache|toothache|hurt|hurts|hurting|sensitive|sensitivity)\b/],
    ['gums', /\b(gum|gums|bleed|bleeding)\b/],
    ['hours', /\b(time|timing|timings|hour|hours|open|opening|close|closed|closing|sunday|working days)\b/],
    ['booking', /\b(book|booking|appointment|appoint|slot|visit|consult|consultation|schedule)\b/],
    ['doctors', /\b(doctor|doctors|dentist|dr|srinivasan|kruparani|krupa|samyukta|team|qualification)\b/],
    ['checkup', /\b(check ?up|checkup|how often|regular)\b/],
    ['care', /\b(brush|brushing|floss|clean|hygiene|care tips|tips|healthy teeth|toothpaste)\b/],
    ['treatments', /\b(treatment|treatments|service|services|implant|implants|root canal|rct|braces|aligner|aligners|invisalign|whitening|crown|crowns|bridge|bridges|denture|dentures|filling|fillings|extraction|smile|laser|kids|children|child)\b/],
    ['thanks', /\b(thanks|thank you|thank|ok thanks)\b/],
    ['hello', /^(hi|hello|hey|vanakkam|good (morning|evening|afternoon))\b/]
  ];
  const URGENT_RE = /(bleeding (won'?t|will not|does ?n'?t|not|is not) stop|won'?t stop|will not stop|swell|swollen|swelling|can'?t breathe|cannot breathe|breathing|difficulty swallowing|can'?t swallow|cannot swallow|swallow|won'?t stop bleeding|not stopping|heavy bleeding|uncontrolled|bleeding a lot|accident|injury|injured|trauma|fell|fall|broken jaw|knocked out|fever|emergency|urgent|unbearable|severe)/;
  const CHIPS = [['Clinic location', 'location'], ['Timings', 'hours'], ['Book an appointment', 'booking'], ['Treatments', 'treatments'], ['Doctors', 'doctors'], ['Fees', 'fees'], ['Urgent dental problem', 'urgent'], ['Tips for healthy teeth', 'care']];

  const addMsg = (who, answer) => {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + who + (answer.urgent ? ' urgent' : '');
    if (answer.urgent) { const st = document.createElement('strong'); st.textContent = 'Urgent symptoms: '; div.appendChild(st); }
    div.appendChild(document.createTextNode(answer.text)); // textContent only: user input is never parsed as HTML
    if (answer.actions?.length) {
      const row = document.createElement('div'); row.className = 'chat-actions';
      answer.actions.forEach(a => {
        let el;
        if (a.book) { el = document.createElement('button'); el.type = 'button'; el.addEventListener('click', () => { close(false); window.SDDC?.openAppointment?.(); }); }
        else { el = document.createElement('a'); el.href = a.href; if (a.external) { el.target = '_blank'; el.rel = 'noopener'; } }
        if (a.primary) el.className = 'primary';
        el.textContent = a.label; row.appendChild(el);
      });
      div.appendChild(row);
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };
  const classify = raw => {
    const q = raw.toLowerCase();
    if (URGENT_RE.test(q)) return 'urgent';
    for (const [key, re] of INTENTS) if (re.test(q)) return key;
    return 'fallback';
  };
  // Keep the clinic facts in step with the Admin Dashboard settings.
  const DEFAULT_ADDRESS = 'No. 24, Navalar Main Road, Devaraj Nagar, near Shankar Narayanan Temple, Saligramam, Chennai, Tamil Nadu 600093.';
  const DEFAULT_HOURS = 'Monday to Saturday, 10:00 am–12:00 pm and 6:30–9:00 pm.';
  const refreshFacts = () => {
    const s = (window.SDDC && window.SDDC.settings) || {};
    const c = s.contact || {}, h = s.hours || {};
    if (/^https:\/\//.test(c.maps_url || '')) MAP = c.maps_url;
    // Answers are only rewritten when the clinic has changed these facts.
    if (c.address_full && c.address_full !== DEFAULT_ADDRESS) ANSWERS.location = { text: `${c.clinic_name || 'Sri Danvantari Dental Care'} is at ${c.address_full.replace(/\.$/, '')}.`, actions: [{ label: 'Get directions', href: MAP, external: true }, { label: 'Contact page', href: 'contact.html' }] };
    else ANSWERS.location.actions[0].href = MAP;
    if ((h.summary && h.summary !== DEFAULT_HOURS) || h.holiday_notice) ANSWERS.hours = { text: `Clinic timings: ${h.summary || ''} ${h.note_short || ''}`.trim() + (h.holiday_notice ? '\n\n' + h.holiday_notice : ''), actions: [{ label: 'Contact page', href: 'contact.html' }] };
    const docs = ((window.SDDC && window.SDDC.content && window.SDDC.content.doctors) || []).filter(d => d.kind !== 'staff' && d.status !== 'archived');
    const names = docs.map(d => d.name).join('|');
    if (docs.length && names !== 'Dr. K. R. Srinivasan|Dr. S. Kruparani|Dr. Samyukta') {
      ANSWERS.doctors = { text: 'The dental team listed on this website:\n' + docs.map(d => '• ' + [d.name, d.qualifications, d.designation].filter(Boolean).join(', ')).join('\n'), actions: [{ label: 'Our doctors', href: 'doctors.html' }] };
    }
  };
  document.addEventListener('sddc:content', refreshFacts);
  const reply = async (key, raw) => {
    let answer = key === 'urgent' ? URGENT : ANSWERS[key] || ANSWERS.fallback;
    if (key === 'fallback' && raw) { const remote = await askBackend(raw); if (remote) answer = { text: remote }; }
    window.setTimeout(() => addMsg('bot', answer), 250);
  };
  CHIPS.forEach(([label, key]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.addEventListener('click', () => { addMsg('user', { text: label }); reply(key); });
    chips.appendChild(b);
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const q = input.value.trim(); if (!q) return;
    addMsg('user', { text: q }); input.value = ''; reply(classify(q), q);
  });

  let greeted = false;
  const open = () => {
    panel.hidden = false; launcher.setAttribute('aria-expanded', 'true'); document.body.classList.add('chat-open');
    if (!greeted) { addMsg('bot', { text: 'Hello! I am the clinic\'s automated help desk. I can answer basic questions about Sri Danvantari Dental Care and general dental care.\n\nI am not a dentist and cannot diagnose. If you have urgent symptoms, please seek emergency care.' }); greeted = true; }
    input.focus();
  };
  const close = (restoreFocus = true) => {
    panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); document.body.classList.remove('chat-open');
    if (restoreFocus) launcher.focus();
  };
  launcher.addEventListener('click', open);
  closeBtn.addEventListener('click', () => close());
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
})();
