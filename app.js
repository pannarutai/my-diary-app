'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = s => parseDate(s).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtMonth = ym => parseDate(ym + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
const fmtDow = s => parseDate(s).toLocaleDateString('th-TH', { weekday: 'short' });
const fmtSize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  cal: svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>'),
  sliders: svg('<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  image: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>'),
  clip: svg('<path d="M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L14 7"/>'),
  file: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>'),
  download: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
  book: svg('<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>'),
  todo: svg('<path d="M4 7l2 2 3-4M4 16l2 2 3-4M13 7h7M13 17h7"/>'),
  tick: svg('<path d="M5 12l5 5 9-10"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
};
const MOODS = [['great', '😄', 'ดีมาก'], ['good', '🙂', 'ดี'], ['ok', '😐', 'เฉยๆ'], ['bad', '😔', 'แย่'], ['awful', '😢', 'แย่มาก']];
const CATS = [['life', 'ชีวิตทั่วไป'], ['health', 'สุขภาพ'], ['invest', 'การลงทุน']];
const catOf = e => CATS.some(c => c[0] === e.cat) ? e.cat : 'life'; // บันทึกเก่าที่ไม่มีหมวด = ชีวิตทั่วไป
const catName = id => CATS.find(c => c[0] === id)[1];
const inCat = e => state.cat === 'all' || catOf(e) === state.cat;

/* ================= database (IndexedDB, อยู่ในเครื่องเท่านั้น) ================= */
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('diary', 2);
    r.onupgradeneeded = () => {
      // สร้างเฉพาะที่ยังไม่มี เพื่อให้อัปเกรดจากเวอร์ชันเก่าได้โดยข้อมูลเดิมอยู่ครบ
      const d = r.result;
      const stores = [
        ['entries', { keyPath: 'id' }],
        ['attachments', { keyPath: 'id' }], // ข้อมูลไฟล์ + รูปย่อ
        ['blobs'],                          // ตัวไฟล์จริง (ArrayBuffer)
        ['meta'],
        ['todos', { keyPath: 'id' }],       // เพิ่มใน v2
      ];
      for (const [name, opts] of stores) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opts);
    };
    r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); res(r.result); };
    r.onerror = () => rej(r.error);
  });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
const dbGet = (s, k) => req(store(s).get(k));
const dbAll = s => req(store(s).getAll());
const dbPut = (s, v, k) => req(store(s, 'readwrite').put(v, k));
const dbDel = (s, k) => req(store(s, 'readwrite').delete(k));

/* ================= state ================= */
const state = {
  view: 'home', section: 'diary', entries: [], atts: [], q: '', cat: 'all',
  todos: [], task: null, taskSaved: false, showDone: false, calOpen: false, calMonth: today().slice(0, 7), day: null,
  cur: null, curSaved: false, busy: 0, viewer: null, pin: null, locked: false, hiddenAt: 0,
  settings: { compress: true },
};
const attsOf = id => state.atts.filter(a => a.entryId === id).sort((a, b) => a.createdAt - b.createdAt);
const sortEntries = () => state.entries.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

/* ================= small UI pieces ================= */
let toastTimer;
function toast(msg) {
  $('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2800);
}

function ask(title, text, okLabel = 'ตกลง') {
  return new Promise(res => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `<div class="sheet"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="row end"><button class="btn ghost" data-v="0">ยกเลิก</button><button class="btn" data-v="1">${esc(okLabel)}</button></div></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (b || e.target === el) { el.remove(); res(b?.dataset.v === '1'); }
    });
    document.body.append(el);
  });
}

function askPin(title) {
  return new Promise(res => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `<form class="sheet"><h3>${esc(title)}</h3>
      <input class="pin-input" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••">
      <p>ตัวเลข 4–8 หลัก</p>
      <div class="row end"><button type="button" class="btn ghost">ยกเลิก</button><button class="btn">ตกลง</button></div></form>`;
    document.body.append(el);
    const inp = $('input', el);
    inp.focus();
    const done = v => { el.remove(); res(v); };
    $('.ghost', el).onclick = () => done(null);
    $('form', el).onsubmit = ev => {
      ev.preventDefault();
      if (/^\d{4,8}$/.test(inp.value)) done(inp.value);
      else { inp.value = ''; inp.focus(); }
    };
  });
}

async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ================= render ================= */
function render() {
  if (state.locked) return renderLock();
  ({ home: renderHome, editor: renderEditor, settings: renderSettings, task: renderTask })[state.view]();
  window.scrollTo(0, 0);
}

/* ---------- lock ---------- */
function renderLock() {
  app.innerHTML = `<main class="lock">
    <div class="lock-icon">${I.lock}</div><h1>ไดอารี่</h1>
    <form id="unlock">
      <input class="pin-input" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="ใส่รหัส" aria-label="รหัสล็อก">
      <button class="btn">ปลดล็อก</button><p id="lock-msg" class="err"></p>
    </form></main>`;
  const inp = $('.pin-input');
  inp.focus();
  $('#unlock').onsubmit = async e => {
    e.preventDefault();
    if (await hashPin(inp.value, state.pin.salt) === state.pin.hash) { state.locked = false; render(); }
    else { $('#lock-msg').textContent = 'รหัสไม่ถูกต้อง'; inp.value = ''; inp.focus(); }
  };
}

/* ---------- home ---------- */
function renderHome() {
  const todo = state.section === 'todo';
  const openCount = state.todos.filter(t => !t.done).length;
  app.innerHTML = `
    <header class="top"><h1>${todo ? 'สิ่งที่ต้องทำ' : 'ไดอารี่'}</h1><div class="row">
      ${todo ? '' : `<button class="icon-btn ${state.calOpen ? 'on' : ''}" data-act="cal" aria-label="ปฏิทิน">${I.cal}</button>`}
      <button class="icon-btn" data-act="settings" aria-label="ตั้งค่า">${I.sliders}</button>
    </div></header>
    ${todo ? '' : `<div class="search">${I.search}<input type="search" id="q" placeholder="ค้นหาบันทึก" autocomplete="off" value="${esc(state.q)}"></div>`}
    <nav class="tabs" aria-label="หมวด">${[['all', 'ทั้งหมด'], ...CATS].map(c => `<button data-act="tab" data-cat="${c[0]}" class="c-${c[0]} ${state.cat === c[0] ? 'on' : ''}">${c[1]}</button>`).join('')}</nav>
    ${todo ? `<main id="todos" class="list"></main>` : `<div id="cal"></div><main id="list" class="list"></main>`}
    <button class="fab" data-act="${todo ? 'new-task' : 'new'}" aria-label="${todo ? 'เพิ่มสิ่งที่ต้องทำ' : 'เขียนบันทึกใหม่'}">${I.plus}</button>
    <nav class="bottom-nav" aria-label="เมนูหลัก">
      <button data-act="nav" data-section="diary" class="${todo ? '' : 'on'}">${I.book}<span>ไดอารี่</span></button>
      <button data-act="nav" data-section="todo" class="${todo ? 'on' : ''}">${I.todo}<span>สิ่งที่ต้องทำ${openCount ? ` <em>${openCount}</em>` : ''}</span></button>
    </nav>`;
  if (todo) return renderTodos();
  $('#q').addEventListener('input', e => { state.q = e.target.value; renderList(); });
  renderCal();
  renderList();
}

function renderCal() {
  const el = $('#cal');
  if (!el) return;
  if (!state.calOpen) { el.innerHTML = ''; return; }
  const [y, m] = state.calMonth.split('-').map(Number);
  const lead = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const has = new Set(state.entries.filter(inCat).map(e => e.date));
  const t = today();
  let cells = '<i></i>'.repeat(lead);
  for (let d = 1; d <= days; d++) {
    const ds = `${state.calMonth}-${pad(d)}`;
    const cls = [has.has(ds) && 'has', ds === state.day && 'sel', ds === t && 'today'].filter(Boolean).join(' ');
    cells += `<button data-act="day" data-date="${ds}" class="${cls}">${d}</button>`;
  }
  el.innerHTML = `<section class="cal">
    <div class="cal-head">
      <button class="icon-btn" data-act="cal-prev" aria-label="เดือนก่อนหน้า">${I.back}</button>
      <strong>${fmtMonth(state.calMonth)}</strong>
      <button class="icon-btn flip" data-act="cal-next" aria-label="เดือนถัดไป">${I.back}</button>
    </div>
    <div class="cal-grid dow">${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => `<span>${d}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div></section>`;
}

function renderList() {
  const el = $('#list');
  if (!el) return;
  const q = state.q.trim().toLowerCase();
  let items = state.entries.filter(inCat);
  if (state.day) items = items.filter(e => e.date === state.day);
  if (q) items = items.filter(e => (e.title + '\n' + e.text).toLowerCase().includes(q) || attsOf(e.id).some(a => a.name.toLowerCase().includes(q)));

  let html = '';
  if (state.day) html += `<div class="chip-row"><span class="chip">${fmtDate(state.day)}<button data-act="day-clear" aria-label="ล้างตัวกรองวัน">${I.close}</button></span></div>`;
  if (!items.length) {
    html += q || state.day
      ? `<div class="empty"><b>ไม่พบบันทึก</b>${state.day ? 'ยังไม่มีบันทึกของวันนี้ กด + เพื่อเขียน' : 'ลองค้นหาด้วยคำอื่น'}</div>`
      : state.cat !== 'all'
        ? `<div class="empty"><b>ยังไม่มีบันทึกในหมวด${catName(state.cat)}</b>กดปุ่ม + ด้านล่างเพื่อเขียนบันทึกในหมวดนี้</div>`
        : `<div class="empty"><b>ยังไม่มีบันทึก</b>กดปุ่ม + ด้านล่างเพื่อเริ่มเขียนไดอารี่หน้าแรก</div>`;
  } else {
    let month = '';
    for (const e of items) {
      const mk = e.date.slice(0, 7);
      if (mk !== month) { month = mk; html += `<h2 class="month">${fmtMonth(mk)}</h2>`; }
      html += card(e);
    }
  }
  el.innerHTML = html;
}

function card(e) {
  const atts = attsOf(e.id);
  const imgs = atts.filter(a => a.thumb);
  const files = atts.length - imgs.length;
  const mood = MOODS.find(m => m[0] === e.mood);
  const text = e.text.trim();
  return `<article class="card" data-act="open" data-id="${e.id}" role="button" tabindex="0">
    <div class="date"><b>${parseDate(e.date).getDate()}</b><span>${fmtDow(e.date)}</span></div>
    <div class="body">
      <div class="card-head">${e.title ? `<h3>${esc(e.title)}</h3>` : text ? `<p class="solo" style="flex:1;margin:0">${esc(text)}</p>` : `<h3 style="color:var(--muted);font-weight:400">ไม่มีข้อความ</h3>`}
        ${mood ? `<span class="mood" title="${mood[2]}">${mood[1]}</span>` : ''}</div>
      ${e.title && text ? `<p>${esc(text)}</p>` : ''}
      ${state.cat === 'all' ? `<span class="tag c-${catOf(e)}">${catName(catOf(e))}</span>` : ''}
      ${imgs.length ? `<div class="thumbs">${imgs.slice(0, 4).map(a => `<img src="${a.thumb}" alt="" loading="lazy">`).join('')}${imgs.length > 4 ? `<span class="more">+${imgs.length - 4}</span>` : ''}</div>` : ''}
      ${files ? `<div class="files">${I.clip} ${files} ไฟล์แนบ</div>` : ''}
    </div></article>`;
}

/* ---------- editor ---------- */
let saveTimer = null;

function openEditor(entry, saved) {
  state.cur = entry; state.curSaved = saved; state.view = 'editor';
  history.pushState({ v: 'editor' }, '');
  render();
}

function renderEditor() {
  const e = state.cur;
  app.innerHTML = `
    <header class="top">
      <button class="icon-btn" data-act="back" aria-label="กลับ">${I.back}</button>
      <span id="saved" class="saved"></span>
      <button class="icon-btn danger" data-act="del-entry" aria-label="ลบบันทึก">${I.trash}</button>
    </header>
    <main class="editor">
      <label class="date-pick">${I.cal}<span id="date-label">${fmtDate(e.date)}</span>
        <input type="date" id="e-date" value="${e.date}" aria-label="วันที่"></label>
      <div class="cats" role="group" aria-label="หมวด">${CATS.map(c => `<button data-act="set-cat" data-cat="${c[0]}" class="c-${c[0]} ${catOf(e) === c[0] ? 'on' : ''}">${c[1]}</button>`).join('')}</div>
      <div class="moods">${MOODS.map(m => `<button data-act="mood" data-mood="${m[0]}" class="${e.mood === m[0] ? 'on' : ''}" aria-label="${m[2]}" title="${m[2]}">${m[1]}</button>`).join('')}</div>
      <input id="e-title" class="e-title" placeholder="หัวข้อ" maxlength="120" value="${esc(e.title)}">
      <textarea id="e-text" placeholder="วันนี้เป็นอย่างไรบ้าง…">${esc(e.text)}</textarea>
      <div id="atts" class="atts"></div>
    </main>
    <footer class="toolbar">
      <button data-act="camera">${I.camera}<span>ถ่ายรูป</span></button>
      <button data-act="gallery">${I.image}<span>รูปจากเครื่อง</span></button>
      <button data-act="file">${I.clip}<span>แนบไฟล์</span></button>
    </footer>`;
  const ta = $('#e-text');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  ta.addEventListener('input', () => { e.text = ta.value; grow(); scheduleSave(); });
  $('#e-title').addEventListener('input', ev => { e.title = ev.target.value; scheduleSave(); });
  const di = $('#e-date');
  di.addEventListener('click', () => { try { di.showPicker(); } catch { } });
  di.addEventListener('change', () => {
    if (!di.value) { di.value = e.date; return; }
    e.date = di.value; $('#date-label').textContent = fmtDate(e.date); scheduleSave();
  });
  grow();
  renderAtts();
  if (!state.curSaved) ta.focus();
}

function renderAtts() {
  const el = $('#atts');
  if (!el || !state.cur) return;
  el.innerHTML = attsOf(state.cur.id).map(a => a.thumb
    ? `<div class="att img" data-act="view" data-id="${a.id}"><img src="${a.thumb}" alt="${esc(a.name)}">
        <button class="x" data-act="del-att" data-id="${a.id}" aria-label="ลบรูป">${I.close}</button></div>`
    : `<div class="att file" data-act="view" data-id="${a.id}">${I.file}<div><b>${esc(a.name)}</b><small>${fmtSize(a.size)}</small></div>
        <button class="x" data-act="del-att" data-id="${a.id}" aria-label="ลบไฟล์">${I.close}</button></div>`
  ).join('') + (state.busy ? `<div class="att busy">กำลังเพิ่มไฟล์…</div>` : '');
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 400);
}

async function persist() {
  clearTimeout(saveTimer); saveTimer = null;
  const e = state.cur;
  if (!e) return;
  e.updatedAt = Date.now();
  await dbPut('entries', e);
  if (!state.curSaved) { state.entries.push(e); state.curSaved = true; }
  sortEntries();
  const s = $('#saved');
  if (s) s.textContent = 'บันทึกแล้ว';
}

async function removeEntry(e) {
  for (const a of attsOf(e.id)) { await dbDel('attachments', a.id); await dbDel('blobs', a.id); }
  state.atts = state.atts.filter(a => a.entryId !== e.id);
  await dbDel('entries', e.id);
  state.entries = state.entries.filter(x => x !== e);
}

async function leaveEditor() {
  const e = state.cur;
  if (!e) return;
  if (saveTimer) await persist();
  const empty = !e.title.trim() && !e.text.trim() && !e.mood && !attsOf(e.id).length;
  if (empty && state.curSaved) await removeEntry(e);
  state.cur = null;
}

/* ---------- attachments ---------- */
async function loadImage(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { }
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.src = url;
  });
}
function scaled(src, max) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const MAX_SIDE = 2000, BIG_FILE = 100 * 1048576;

async function addFiles(fileList, fromCamera) {
  const files = [...fileList];
  if (!files.length || !state.cur) return;
  const entry = state.cur;
  await persist();
  state.busy++; renderAtts();
  let failed = 0;
  for (const file of files) {
    try {
      if (file.size > BIG_FILE && !await ask('ไฟล์ขนาดใหญ่', `${file.name} มีขนาด ${fmtSize(file.size)} อาจทำให้พื้นที่เครื่องเต็มเร็ว ต้องการแนบต่อไหม`, 'แนบ')) continue;
      let blob = file, name = file.name || 'file', type = file.type || 'application/octet-stream', thumb = '';
      if (type.startsWith('image/')) {
        try {
          const img = await loadImage(file);
          thumb = scaled(img, 240).toDataURL('image/jpeg', 0.7);
          const keepAsIs = /gif|svg/.test(type) || !state.settings.compress || (Math.max(img.width, img.height) <= MAX_SIDE && file.size < 1.5 * 1048576);
          if (!keepAsIs) {
            const small = await new Promise(r => scaled(img, MAX_SIDE).toBlob(r, 'image/jpeg', 0.85));
            if (small && small.size < file.size) { blob = small; type = 'image/jpeg'; name = name.replace(/\.[^.]+$/, '') + '.jpg'; }
          }
          img.close?.();
        } catch { /* เปิดเป็นรูปไม่ได้ (เช่น HEIC) เก็บเป็นไฟล์ธรรมดา */ }
        if (fromCamera) {
          const d = new Date();
          name = `photo-${ymd(d).replace(/-/g, '')}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${type === 'image/png' ? 'png' : 'jpg'}`;
        }
      }
      const a = { id: uid(), entryId: entry.id, name, type, size: blob.size, thumb, createdAt: Date.now() };
      await dbPut('blobs', await blob.arrayBuffer(), a.id);
      await dbPut('attachments', a);
      state.atts.push(a);
      renderAtts();
    } catch (err) {
      console.error(err); failed++;
    }
  }
  state.busy--; renderAtts();
  if (failed) toast(`เพิ่มไม่สำเร็จ ${failed} ไฟล์ (พื้นที่เครื่องอาจเต็ม)`);
}

async function getBlob(a) {
  const buf = await dbGet('blobs', a.id);
  return buf ? new Blob([buf], { type: a.type }) : null;
}

async function saveOut(blob, name) {
  if (isIOS && navigator.canShare) {
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
}

async function openAttachment(id) {
  const a = state.atts.find(x => x.id === id);
  const blob = a && await getBlob(a);
  if (!blob) return toast('ไม่พบไฟล์นี้');
  const kind = a.thumb ? 'img' : a.type.startsWith('video/') ? 'video' : a.type.startsWith('audio/') ? 'audio' : null;
  if (!kind) return saveOut(blob, a.name);
  const url = URL.createObjectURL(blob);
  state.viewer = { a, blob, url };
  history.pushState({ v: 'viewer' }, '');
  const el = document.createElement('div');
  el.className = 'viewer'; el.id = 'viewer';
  el.innerHTML = `<div class="viewer-bar">
      <button class="icon-btn" data-act="back" aria-label="ปิด">${I.close}</button>
      <span>${esc(a.name)}</span>
      <button class="icon-btn" data-act="save-att" aria-label="บันทึกไฟล์ลงเครื่อง">${I.download}</button></div>
    <div class="viewer-body">${kind === 'img' ? `<img src="${url}" alt="${esc(a.name)}">` : kind === 'video' ? `<video src="${url}" controls playsinline></video>` : `<audio src="${url}" controls></audio>`}</div>`;
  document.body.append(el);
}
function closeViewer() {
  URL.revokeObjectURL(state.viewer.url);
  $('#viewer')?.remove();
  state.viewer = null;
}

/* ---------- settings ---------- */
function renderSettings() {
  app.innerHTML = `
    <header class="top"><div class="row"><button class="icon-btn" data-act="back" aria-label="กลับ">${I.back}</button><h1>ตั้งค่า</h1></div></header>
    <main class="settings">
      <section><h2>ความเป็นส่วนตัว</h2>
        <div class="set-row"><span>รหัสล็อกแอป</span>
          ${state.pin ? `<div class="row end"><button class="btn ghost" data-act="pin-set">เปลี่ยน</button><button class="btn ghost" data-act="pin-off">ปิด</button></div>` : `<button class="btn" data-act="pin-set">ตั้งรหัส</button>`}</div>
        <p>รหัสใช้กันคนอื่นเปิดแอปดู ถ้าลืมรหัสจะกู้คืนไม่ได้ ควรสำรองข้อมูลไว้ก่อน</p></section>
      <section><h2>รูปภาพ</h2>
        <div class="set-row"><span>ย่อขนาดรูปเพื่อประหยัดพื้นที่</span>
          <input type="checkbox" class="switch" id="s-compress" ${state.settings.compress ? 'checked' : ''} aria-label="ย่อขนาดรูป"></div>
        <p>รูปใหญ่จะถูกย่อให้ด้านยาวไม่เกิน ${MAX_SIDE} พิกเซล ปิดไว้ถ้าต้องการเก็บไฟล์ต้นฉบับ</p></section>
      <section><h2>สำรองข้อมูล</h2>
        <div class="set-row"><span>ส่งออกทั้งหมดเป็นไฟล์</span><button class="btn" data-act="export">ส่งออก</button></div>
        <div class="set-row"><span>นำเข้าจากไฟล์สำรอง</span><button class="btn ghost" data-act="import">นำเข้า</button></div>
        <p>ข้อมูลทั้งหมดอยู่ในโทรศัพท์เครื่องนี้เท่านั้น ถ้าล้างข้อมูลเบราว์เซอร์ ลบแอป หรือเปลี่ยนเครื่อง ข้อมูลจะหาย ควรส่งออกเก็บไว้เป็นระยะ</p></section>
      <section><h2>ข้อมูลในเครื่อง</h2>
        <div class="set-row"><span>บันทึก</span><span>${state.entries.length} รายการ</span></div>
        <div class="set-row"><span>สิ่งที่ต้องทำ</span><span>${state.todos.length} งาน</span></div>
        <div class="set-row"><span>รูปและไฟล์แนบ</span><span>${state.atts.length} ไฟล์ (${fmtSize(state.atts.reduce((n, a) => n + a.size, 0))})</span></div>
        <div class="set-row"><span>การเก็บถาวร</span><span id="s-persist">…</span></div></section>
    </main>`;
  $('#s-compress').addEventListener('change', async e => {
    state.settings.compress = e.target.checked;
    await dbPut('meta', state.settings, 'settings');
  });
  navigator.storage?.persisted?.().then(ok => {
    const el = $('#s-persist');
    if (el) el.textContent = ok ? 'เปิดอยู่' : 'ยังไม่เปิด (ติดตั้งแอปลงหน้าจอหลัก)';
  });
}

async function setPin() {
  const a = await askPin(state.pin ? 'ตั้งรหัสใหม่' : 'ตั้งรหัสล็อก');
  if (!a) return;
  const b = await askPin('ใส่รหัสอีกครั้งเพื่อยืนยัน');
  if (b === null) return;
  if (a !== b) return toast('รหัสสองครั้งไม่ตรงกัน');
  const salt = uid();
  state.pin = { salt, hash: await hashPin(a, salt) };
  await dbPut('meta', state.pin, 'pin');
  toast('ตั้งรหัสล็อกแล้ว'); render();
}
async function removePin() {
  const a = await askPin('ใส่รหัสปัจจุบันเพื่อปิดการล็อก');
  if (!a) return;
  if (await hashPin(a, state.pin.salt) !== state.pin.hash) return toast('รหัสไม่ถูกต้อง');
  state.pin = null;
  await dbDel('meta', 'pin');
  toast('ปิดรหัสล็อกแล้ว'); render();
}

/* ---------- backup ---------- */
const toB64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.slice(r.result.indexOf(',') + 1));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

async function exportAll() {
  toast('กำลังเตรียมไฟล์สำรอง…');
  const parts = [`{"app":"diary","version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"entries":${JSON.stringify(state.entries)},"todos":${JSON.stringify(state.todos)},"attachments":[`];
  let first = true;
  for (const a of state.atts) {
    const buf = await dbGet('blobs', a.id);
    if (!buf) continue;
    parts.push((first ? '' : ',') + JSON.stringify({ ...a, data: await toB64(new Blob([buf])) }));
    first = false;
  }
  parts.push(']}');
  await saveOut(new Blob(parts, { type: 'application/json' }), `diary-backup-${today()}.json`);
}

async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast('อ่านไฟล์ไม่ได้'); }
  if (data?.app !== 'diary' || !Array.isArray(data.entries)) return toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของไดอารี่');
  if (!await ask('นำเข้าข้อมูล', `พบ ${data.entries.length} บันทึก ${data.todos?.length || 0} งาน และ ${data.attachments?.length || 0} ไฟล์แนบ รายการที่ซ้ำกันจะถูกแทนที่ด้วยข้อมูลจากไฟล์`, 'นำเข้า')) return;
  toast('กำลังนำเข้า…');
  try {
    for (const e of data.entries) {
      if (!e?.id || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
      await dbPut('entries', { id: String(e.id), date: e.date, cat: catOf(e), title: String(e.title || ''), text: String(e.text || ''), mood: String(e.mood || ''), createdAt: +e.createdAt || Date.now(), updatedAt: +e.updatedAt || Date.now() });
    }
    for (const raw of Array.isArray(data.todos) ? data.todos : []) {
      const t = cleanTodo(raw);
      if (t) await dbPut('todos', t);
    }
    for (const a of data.attachments || []) {
      if (!a?.id || !a.entryId || typeof a.data !== 'string') continue;
      const buf = await (await fetch('data:application/octet-stream;base64,' + a.data)).arrayBuffer();
      const thumb = typeof a.thumb === 'string' && a.thumb.startsWith('data:image/') ? a.thumb : '';
      await dbPut('blobs', buf, String(a.id));
      await dbPut('attachments', { id: String(a.id), entryId: String(a.entryId), name: String(a.name || 'file'), type: String(a.type || ''), size: buf.byteLength, thumb, createdAt: +a.createdAt || Date.now() });
    }
  } catch (err) {
    console.error(err);
    toast('นำเข้าไม่ครบ พื้นที่เครื่องอาจเต็ม');
  }
  await loadAll();
  render();
  toast('นำเข้าเรียบร้อย');
}

/* ================= events ================= */
const actions = {
  ...todoActions,
  new: () => { const now = Date.now(); openEditor({ id: uid(), date: state.day || today(), cat: state.cat === 'all' ? 'life' : state.cat, title: '', text: '', mood: '', createdAt: now, updatedAt: now }, false); },
  tab: el => { state.cat = el.dataset.cat; renderHome(); },
  'set-cat': el => {
    const e = state.cur; e.cat = el.dataset.cat;
    document.querySelectorAll('.cats button').forEach(b => b.classList.toggle('on', b.dataset.cat === e.cat));
    if (state.curSaved) scheduleSave();
  },
  open: el => { const e = state.entries.find(x => x.id === el.dataset.id); if (e) openEditor(e, true); },
  back: () => history.back(),
  settings: () => { state.view = 'settings'; history.pushState({ v: 'settings' }, ''); render(); },
  cal: () => { state.calOpen = !state.calOpen; if (!state.calOpen) state.day = null; renderHome(); },
  'cal-prev': () => shiftMonth(-1),
  'cal-next': () => shiftMonth(1),
  day: el => { state.day = state.day === el.dataset.date ? null : el.dataset.date; renderCal(); renderList(); },
  'day-clear': () => { state.day = null; renderCal(); renderList(); },
  mood: el => {
    const e = state.cur; e.mood = e.mood === el.dataset.mood ? '' : el.dataset.mood;
    document.querySelectorAll('.moods button').forEach(b => b.classList.toggle('on', b.dataset.mood === e.mood));
    scheduleSave();
  },
  camera: () => $('#pick-camera').click(),
  gallery: () => $('#pick-gallery').click(),
  file: () => $('#pick-file').click(),
  view: el => openAttachment(el.dataset.id),
  'save-att': () => state.viewer && saveOut(state.viewer.blob, state.viewer.a.name),
  'del-att': async el => {
    const a = state.atts.find(x => x.id === el.dataset.id);
    if (!a || !await ask('ลบไฟล์นี้?', a.name, 'ลบ')) return;
    await dbDel('attachments', a.id); await dbDel('blobs', a.id);
    state.atts = state.atts.filter(x => x !== a);
    renderAtts();
  },
  'del-entry': async () => {
    const e = state.cur;
    if (state.curSaved) {
      if (!await ask('ลบบันทึกนี้?', 'ข้อความ รูป และไฟล์แนบของบันทึกนี้จะถูกลบถาวร', 'ลบ')) return;
      clearTimeout(saveTimer); saveTimer = null;
      await removeEntry(e);
    }
    state.cur = null;
    history.back();
  },
  'pin-set': setPin,
  'pin-off': removePin,
  export: exportAll,
  import: () => $('#pick-import').click(),
};

function shiftMonth(n) {
  const [y, m] = state.calMonth.split('-').map(Number);
  state.calMonth = ymd(new Date(y, m - 1 + n, 1)).slice(0, 7);
  renderCal();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches?.('.card, .todo .body')) e.target.click();
});

for (const [id, cam] of [['pick-camera', true], ['pick-gallery', false], ['pick-file', false]]) {
  $('#' + id).addEventListener('change', async e => { const files = [...e.target.files]; e.target.value = ''; await addFiles(files, cam); });
}
$('#pick-import').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importFile(f); });

window.addEventListener('popstate', async () => {
  if (state.viewer) return closeViewer();
  if (state.view !== 'home') { await leaveEditor(); await leaveTask(); state.view = 'home'; render(); }
});

const RELOCK_MS = 5 * 60 * 1000;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    state.hiddenAt = Date.now();
    if (saveTimer) await persist();
    if (taskTimer) await saveTask();
  } else if (state.pin && !state.locked && state.hiddenAt && Date.now() - state.hiddenAt > RELOCK_MS && !state.busy) {
    if (state.viewer) closeViewer();
    await leaveEditor();
    await leaveTask();
    state.view = 'home'; state.locked = true; render();
  }
});
window.addEventListener('pagehide', () => { if (saveTimer) persist(); if (taskTimer) saveTask(); });

/* ================= boot ================= */
async function loadAll() {
  state.entries = await dbAll('entries');
  state.atts = await dbAll('attachments');
  state.todos = (await dbAll('todos')).map(cleanTodo).filter(Boolean);
  sortEntries();
}

(async function boot() {
  try {
    db = await openDB();
    await loadAll();
    state.pin = await dbGet('meta', 'pin') || null;
    Object.assign(state.settings, await dbGet('meta', 'settings') || {});
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="empty"><b>เปิดที่เก็บข้อมูลไม่ได้</b>เบราว์เซอร์นี้อาจอยู่ในโหมดส่วนตัว ลองเปิดในโหมดปกติ</div>`;
    return;
  }
  state.locked = !!state.pin;
  history.replaceState({ v: 'home' }, '');
  render();
  navigator.storage?.persist?.();
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && !local) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
