'use strict';
/* ================= Life RPG =================
   Real-life activity earns experience for six attributes, gold for a reward shop, and damage on bosses (big goals).
   Everything is stored on this device in IndexedDB "liferpg":
     kv/state  -> S: hero, settings, daily quests, bosses, rewards, badges
     log       -> one record per event (quest done, purchase, penalty ...). The log is also how the app knows
                  what was done on which day and which Diary items were already rewarded.
   This app is a page of the Diary app (folder rpg/), so both share one storage area even on an iPhone
   Home Screen, where separately installed web apps cannot see each other's data. The Diary database is
   read (never written) to reward finished tasks, diary entries, daily answers and gratitude notes.
   The Diary's service worker (../sw.js) also caches these files for offline use. */

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const MAXHP = 100, MISS_HP = 10, KO_LOSS = 0.25, PERFECT_HEAL = 10, PERFECT_GOLD = 10, SPECIAL_BONUS = 1.5;
const POTION = { cost: 30, heal: 30 };

let db, LOG = [];
let S = { hero: null, settings: { lang: 'en', rest: false }, quests: [], bosses: [], rewards: [], badges: {} };
const ui = { tab: 'hero', diary: { state: 'checking' } };
let fx = []; // celebrations waiting to be shown: { icon, title, text }

/* ---------- language ---------- */
const tr = (en, th) => (S.settings.lang === 'th' ? th : en);
const trp = pair => tr(pair[0], pair[1]);
const locale = () => (S.settings.lang === 'th' ? 'th-TH' : 'en-US');
const statName = s => trp(ST[s].name);
const fmtDay = ds => parseDate(ds).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });

/* ---------- database ---------- */
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('liferpg', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('log', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
const dbPut = (s, v, k) => req(store(s, 'readwrite').put(v, k));
const dbDel = (s, k) => req(store(s, 'readwrite').delete(k));
const save = () => dbPut('kv', S, 'state');

/* ---------- levels ----------
   Attribute level L starts at 50*L*(L-1) XP: 0, 100, 300, 600 ...
   Hero level L starts at 100*L*(L-1) total XP: 0, 200, 600, 1200 ... */
const statLevel = xp => Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
const statFloor = L => 50 * L * (L - 1);
const heroLevel = xp => Math.floor((1 + Math.sqrt(1 + xp / 25)) / 2);
const heroFloor = L => 100 * L * (L - 1);
const totalXP = () => STATS.reduce((n, s) => n + S.hero.xp[s], 0);
function progress(xp, levelOf, floorOf) {
  const L = levelOf(xp), into = xp - floorOf(L), need = floorOf(L + 1) - floorOf(L);
  return { L, into, need, pct: Math.round(into / need * 100) };
}

/* ---------- log lookups ---------- */
let idxV = 0, idxC = null;
// Sets rebuilt only when the log changes: which daily / special quests were done on which day, and every reference rewarded so far.
function idx() {
  if (idxC && idxC.v === idxV && idxC.n === LOG.length) return idxC;
  const daily = new Set(), special = new Set(), refs = new Set();
  for (const e of LOG) {
    if (e.type === 'daily') daily.add(e.ref + '|' + e.date);
    else if (e.type === 'special') special.add(e.ref + '|' + e.date);
    if (e.ref) refs.add(e.ref);
  }
  return idxC = { v: idxV, n: LOG.length, daily, special, refs };
}
const QUEST_TYPES = ['daily', 'special', 'act', 'diary'];
const countLog = f => LOG.reduce((n, e) => n + (f(e) ? 1 : 0), 0);
const questsDone = () => countLog(e => QUEST_TYPES.includes(e.type));

const dueOn = (q, d) => q.days.includes(d.getDay());
const dueToday = () => S.quests.filter(q => dueOn(q, new Date()));
const doneToday = q => idx().daily.has(q.id + '|' + today());

// Days in a row a daily quest was done, counting only the weekdays it is scheduled for.
function streak(q) {
  const set = idx().daily, d = new Date();
  if (!set.has(q.id + '|' + ymd(d))) d.setDate(d.getDate() - 1); // today still open: count up to yesterday
  let n = 0;
  for (let i = 0; i < 800; i++) {
    if (dueOn(q, d)) { if (set.has(q.id + '|' + ymd(d))) n++; else break; }
    d.setDate(d.getDate() - 1);
  }
  return n;
}
// Every full week of streak adds 10% to a daily quest's reward, up to +50%.
const streakBonus = n => 1 + Math.min(0.5, Math.floor(n / 7) * 0.1);

/* ---------- special quests ---------- */
// Three quests drawn from SPECIALS, the same three all day, each from a different attribute.
function specialsFor(date) {
  let h = 2166136261;
  for (const c of date) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const order = SPECIALS.map((_, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const picked = [], used = new Set();
  for (const i of order) {
    if (used.has(SPECIALS[i][0])) continue;
    used.add(SPECIALS[i][0]); picked.push(i);
    if (picked.length === 3) break;
  }
  return picked;
}

/* ---------- earning ---------- */
// Records one event and applies it: attribute XP, gold, damage on matching bosses, level-ups.
async function gain(o) {
  const h = S.hero, lvlBefore = heroLevel(totalXP());
  const e = { id: uid(), ts: Date.now(), date: o.date || today(), type: o.type, title: o.title || '', stat: o.stat || '', xp: o.xp || 0, gold: o.gold || 0, ref: o.ref || '', dmg: [] };
  const slain = [];
  if (e.stat && e.xp) {
    const before = statLevel(h.xp[e.stat]);
    h.xp[e.stat] += e.xp;
    const after = statLevel(h.xp[e.stat]);
    if (after > before) fx.push({ icon: ST[e.stat].icon, title: tr('Attribute up', 'ค่าพลังเพิ่มขึ้น'), text: `${statName(e.stat)} ${tr('Lv', 'เลเวล')} ${after}` });
    for (const b of S.bosses) {
      if (b.slainAt || (b.stat !== 'any' && b.stat !== e.stat)) continue;
      const n = Math.min(b.hp, e.xp);
      b.hp -= n; e.dmg.push([b.id, n]);
      if (b.hp <= 0) { b.slainAt = Date.now(); slain.push(b); }
    }
  }
  h.gold += e.gold;
  if (e.gold > 0) h.earned += e.gold;
  LOG.push(e);
  await dbPut('log', e);
  const lvl = heroLevel(totalXP());
  if (lvl > lvlBefore) {
    h.hp = MAXHP;
    fx.push({ icon: '⚜️', title: tr('Level up', 'เลเวลอัป'), text: tr(`You reached level ${lvl}. Health restored.`, `คุณขึ้นเลเวล ${lvl} แล้ว พลังชีวิตเต็ม`) });
  }
  for (const b of slain) {
    fx.push({ icon: b.icon, title: tr('Boss defeated', 'ปราบบอสสำเร็จ'), text: `${b.name} · +${b.reward} 🪙` });
    await gain({ type: 'boss', title: b.name, gold: b.reward, ref: 'boss:' + b.id });
  }
  return e;
}

// Takes back a quest ticked by mistake. Bosses already defeated stay defeated.
async function undo(e) {
  const h = S.hero;
  if (e.stat) h.xp[e.stat] = Math.max(0, h.xp[e.stat] - e.xp);
  h.gold = Math.max(0, h.gold - e.gold);
  h.earned = Math.max(0, h.earned - e.gold);
  for (const [id, n] of e.dmg || []) { const b = S.bosses.find(x => x.id === id); if (b && !b.slainAt) b.hp = Math.min(b.max, b.hp + n); }
  LOG = LOG.filter(x => x !== e); idxV++;
  await dbDel('log', e.id);
}

// A plain note in the chronicle (penalties, purchases): no XP.
async function note(type, title, extra = {}) {
  const e = { id: uid(), ts: Date.now(), date: today(), type, title, stat: '', xp: 0, gold: 0, ref: '', dmg: [], ...extra };
  LOG.push(e);
  await dbPut('log', e);
}

/* ---------- badges ---------- */
const BADGES = [
  ['first', '🌱', ['First Step', 'ก้าวแรก'], ['Complete your first quest', 'ทำเควสต์แรกสำเร็จ'], () => questsDone() >= 1],
  ['q25', '📜', ['Adventurer', 'นักผจญภัย'], ['Complete 25 quests', 'ทำเควสต์ครบ 25 ครั้ง'], () => questsDone() >= 25],
  ['q100', '🎖️', ['Veteran', 'ผู้ช่ำชอง'], ['Complete 100 quests', 'ทำเควสต์ครบ 100 ครั้ง'], () => questsDone() >= 100],
  ['q500', '🏆', ['Legend', 'ตำนาน'], ['Complete 500 quests', 'ทำเควสต์ครบ 500 ครั้ง'], () => questsDone() >= 500],
  ['lv5', '⭐', ['Rising Hero', 'ดาวรุ่ง'], ['Reach level 5', 'ถึงเลเวล 5'], () => heroLevel(totalXP()) >= 5],
  ['lv10', '🌟', ['Seasoned Hero', 'ผู้กล้าเจนศึก'], ['Reach level 10', 'ถึงเลเวล 10'], () => heroLevel(totalXP()) >= 10],
  ['lv25', '👑', ['Champion of the Realm', 'ยอดวีรชน'], ['Reach level 25', 'ถึงเลเวล 25'], () => heroLevel(totalXP()) >= 25],
  ['st7', '🔥', ['Kindled', 'ไฟเริ่มติด'], ['Keep a 7-day streak', 'ทำต่อเนื่อง 7 วัน'], () => S.hero.best >= 7],
  ['st30', '☄️', ['Unbroken', 'ไม่ขาดสาย'], ['Keep a 30-day streak', 'ทำต่อเนื่อง 30 วัน'], () => S.hero.best >= 30],
  ['st100', '🌋', ['Eternal Flame', 'เปลวไฟนิรันดร์'], ['Keep a 100-day streak', 'ทำต่อเนื่อง 100 วัน'], () => S.hero.best >= 100],
  ['perfect7', '💎', ['Flawless', 'ไร้ที่ติ'], ['Have 7 perfect days', 'มีวันสมบูรณ์แบบ 7 วัน'], () => S.hero.perfect >= 7],
  ['sp25', '🎲', ['Fortune Seeker', 'ผู้แสวงโชค'], ['Complete 25 special quests', 'ทำเควสต์พิเศษครบ 25 ครั้ง'], () => countLog(e => e.type === 'special') >= 25],
  ['boss1', '⚔️', ['Slayer', 'ผู้พิชิต'], ['Defeat your first boss', 'ปราบบอสตัวแรก'], () => S.bosses.some(b => b.slainAt)],
  ['boss5', '🐲', ['Dragonbane', 'ผู้ปราบมังกร'], ['Defeat 5 bosses', 'ปราบบอสครบ 5 ตัว'], () => S.bosses.filter(b => b.slainAt).length >= 5],
  ['gold1k', '🪙', ['Treasure Hoard', 'ขุมทรัพย์'], ['Earn 1,000 gold in total', 'สะสมเหรียญรวม 1,000'], () => S.hero.earned >= 1000],
  ['reward1', '🎁', ['Well Earned', 'รางวัลที่คู่ควร'], ['Buy your first reward', 'แลกรางวัลครั้งแรก'], () => LOG.some(e => e.type === 'buy')],
  ['all3', '🧭', ['All-Rounder', 'รอบด้าน'], ['Every attribute at level 3', 'ทุกค่าพลังถึงเลเวล 3'], () => STATS.every(s => statLevel(S.hero.xp[s]) >= 3)],
  ['scribe', '🖋️', ['Chronicler', 'นักบันทึก'], ['Earn 30 rewards from your Diary', 'ได้รางวัลจาก Diary ครบ 30 ครั้ง'], () => countLog(e => e.type === 'diary') >= 30],
  ['phoenix', '🕊️', ['Phoenix', 'ฟีนิกซ์'], ['Rise again after being knocked out', 'ลุกขึ้นใหม่หลังพลังชีวิตหมด'], () => S.hero.kos >= 1 && LOG.some(e => QUEST_TYPES.includes(e.type) && e.ts > S.hero.koAt)],
].map(([id, icon, name, desc, test]) => ({ id, icon, name, desc, test }));

// Call after any change: updates streak record and badges, saves, redraws, then shows what was earned.
async function settle(msg) {
  const h = S.hero;
  h.best = Math.max(h.best, ...S.quests.map(streak), 0);
  for (const b of BADGES) {
    if (S.badges[b.id] || !b.test()) continue;
    S.badges[b.id] = Date.now();
    fx.push({ icon: b.icon, title: tr('Badge unlocked', 'ปลดล็อกเหรียญตรา'), text: trp(b.name) });
  }
  await save();
  render();
  if (fx.length) { const list = fx; fx = []; celebrate(list); }
  else if (msg) toast(msg);
}

/* ---------- missed days ---------- */
// Runs when a new day is first seen. Each daily quest left undone on a past day costs health;
// at zero health the hero is knocked out: a quarter of the gold is lost and health refills.
function processDays() {
  const h = S.hero, t = today();
  if (h.lastDay === t) return null;
  const out = { missed: 0, hp: 0, ko: 0, lost: 0 };
  if (!S.settings.rest) {
    const end = parseDate(t), set = idx().daily;
    let d = parseDate(h.lastDay);
    const oldest = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 14);
    if (d < oldest) d = oldest;
    for (; d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const ds = ymd(d);
      for (const q of S.quests) {
        if (!dueOn(q, d) || q.createdDay >= ds || set.has(q.id + '|' + ds)) continue;
        out.missed++; out.hp += MISS_HP; h.hp -= MISS_HP;
        if (h.hp <= 0) {
          const lost = Math.floor(h.gold * KO_LOSS);
          h.gold -= lost; h.hp = MAXHP; h.kos++; h.koAt = Date.now();
          out.ko++; out.lost += lost;
        }
      }
    }
  }
  h.lastDay = t;
  return out.missed ? out : null;
}

async function newDay() {
  if (!S.hero) return;
  const out = processDays();
  await save();
  if (!out) return;
  await note('miss', tr(`Missed ${out.missed} daily quest${out.missed === 1 ? '' : 's'}`, `พลาดเควสต์ประจำวัน ${out.missed} ครั้ง`), { hp: -out.hp });
  if (out.ko) await note('ko', tr('Knocked out', 'พลังชีวิตหมด'), { gold: -out.lost });
  render();
  const lines = [{ icon: '🩸', title: tr('While you were away', 'ระหว่างที่คุณไม่อยู่'), text: tr(`${out.missed} daily quest${out.missed === 1 ? ' was' : 's were'} missed. You lost ${out.hp} health.`, `พลาดเควสต์ประจำวัน ${out.missed} ครั้ง เสียพลังชีวิต ${out.hp}`) }];
  if (out.ko) lines.push({ icon: '💀', title: tr('Knocked out', 'พลังชีวิตหมด'), text: tr(`You dropped ${out.lost} gold. Health is restored, so stand up and try again.`, `คุณทำเหรียญหล่น ${out.lost} เหรียญ พลังชีวิตกลับมาเต็มแล้ว ลุกขึ้นสู้ใหม่`) });
  celebrate(lines);
}

/* ---------- link to the Diary app ---------- */
// Reads the Diary database if it exists on this web address. Opens it without a version so it is never created or upgraded here.
async function readDiary() {
  if (!indexedDB.databases) return 'unsupported';
  if (!(await indexedDB.databases()).some(d => d.name === 'diary')) return null;
  const d = await new Promise(res => {
    const r = indexedDB.open('diary');
    r.onupgradeneeded = () => r.transaction.abort(); // it did not exist after all: do not create it
    r.onsuccess = () => res(r.result);
    r.onerror = r.onblocked = () => res(null);
  });
  if (!d) return null;
  d.onversionchange = () => d.close();
  try {
    const names = [...d.objectStoreNames];
    const all = n => names.includes(n) ? req(d.transaction(n).objectStore(n).getAll()) : [];
    const pin = names.includes('meta') ? await req(d.transaction('meta').objectStore('meta').get('pin')) : null;
    return { todos: await all('todos'), entries: await all('entries'), answers: await all('answers'), grats: await all('gratitude'), locked: !!pin };
  } finally { d.close(); }
}

// Rewards Diary items made since the hero was created, once each. With a Diary passcode set, titles are not copied here.
async function syncDiary(manual) {
  if (!S.hero) return;
  let d = null;
  try { d = await readDiary(); } catch (err) { console.warn(err); }
  if (!d || d === 'unsupported') {
    ui.diary = { state: d || 'none' };
    if (manual) { render(); toast(tr('No Diary data on this device yet', 'ยังไม่พบข้อมูล Diary ในเครื่องนี้')); }
    return;
  }
  const since = S.hero.createdAt, seen = idx().refs, name = (t, generic) => (d.locked || !t ? generic : t);
  const give = [];
  for (const t of d.todos) {
    if (!t.done || (t.doneAt || 0) < since || seen.has('todo:' + t.id)) continue;
    const xp = Math.min(60, 20 + 5 * (t.steps?.length || 0));
    give.push({ title: name(t.title, tr('Diary task', 'งานใน Diary')), stat: DIARY_STAT[t.cat] || 'spi', xp, gold: Math.round(xp * 0.4), ref: 'todo:' + t.id });
  }
  for (const e of d.entries) {
    if ((e.createdAt || 0) < since || seen.has('entry:' + e.id) || !(e.title || e.text || '').trim()) continue;
    give.push({ title: name(e.title, tr('Diary entry', 'บันทึกประจำวัน')), stat: DIARY_STAT[e.cat] || 'spi', xp: 15, gold: 6, ref: 'entry:' + e.id });
  }
  for (const a of d.answers) {
    if ((a.updatedAt || 0) < since || seen.has('answer:' + a.id)) continue;
    give.push({ title: tr('Question of the day', 'คำถามประจำวัน'), stat: 'spi', xp: 10, gold: 4, ref: 'answer:' + a.id });
  }
  const perDay = {};
  for (const e of LOG) if (e.type === 'diary' && e.ref.startsWith('grat:')) perDay[e.date] = (perDay[e.date] || 0) + 1;
  for (const g of d.grats) {
    if ((g.createdAt || 0) < since || seen.has('grat:' + g.id) || (perDay[g.date] || 0) >= 3) continue; // at most three a day count
    perDay[g.date] = (perDay[g.date] || 0) + 1;
    give.push({ title: tr('Gratitude note', 'โน้ตขอบคุณ'), stat: 'spi', xp: 5, gold: 2, ref: 'grat:' + g.id, date: g.date });
  }
  let xp = 0;
  for (const o of give) { await gain({ type: 'diary', ...o }); xp += o.xp; }
  ui.diary = { state: 'linked', at: Date.now(), locked: d.locked };
  if (give.length) await settle(tr(`Diary: +${xp} XP from ${give.length} item${give.length === 1 ? '' : 's'}`, `Diary: +${xp} XP จาก ${give.length} รายการ`));
  else { render(); if (manual) toast(tr('Diary is up to date', 'ข้อมูล Diary เป็นปัจจุบันแล้ว')); }
}

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

function modal(html) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

function celebrate(list) {
  const el = modal(`<div class="sheet glory">${list.map(x => `<div class="glory-row"><span class="glory-icon">${x.icon}</span><div><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></div></div>`).join('')}
    <button class="btn block">${tr('Continue', 'ไปต่อ')}</button></div>`);
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('.btn')) el.remove(); });
}

function ask(title, text, okLabel) {
  return new Promise(res => {
    const el = modal(`<div class="sheet"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="row end"><button class="btn ghost" data-v="0">${tr('Cancel', 'ยกเลิก')}</button><button class="btn" data-v="1">${esc(okLabel)}</button></div></div>`);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (b || e.target === el) { el.remove(); res(b?.dataset.v === '1'); }
    });
  });
}

// A form in a sheet. Resolves to { fieldName: [values] }, 'del' when the delete button is pressed, or null when cancelled.
function sheet(title, body, { ok, del } = {}) {
  return new Promise(res => {
    const el = modal(`<form class="sheet"><h3>${esc(title)}</h3>${body}
      <div class="row end">${del ? `<button type="button" class="btn danger" data-v="del">${esc(del)}</button>` : ''}<span class="grow"></span>
        <button type="button" class="btn ghost" data-v="x">${tr('Cancel', 'ยกเลิก')}</button><button class="btn">${esc(ok || tr('Save', 'บันทึก'))}</button></div></form>`);
    $('input[type=text]', el)?.focus();
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (b || e.target === el) { el.remove(); res(b?.dataset.v === 'del' ? 'del' : null); }
    });
    $('form', el).onsubmit = e => {
      e.preventDefault();
      const o = {};
      for (const [k, v] of new FormData(e.target)) (o[k] ??= []).push(v);
      el.remove(); res(o);
    };
  });
}
const field = (label, html) => `<label class="field"><span>${esc(label)}</span>${html}</label>`;
const group = (label, html) => `<div class="field"><span>${esc(label)}</span>${html}</div>`;
const textIn = (name, value, ph, max = 80) => `<input type="text" name="${name}" value="${esc(value)}" placeholder="${esc(ph)}" maxlength="${max}" required autocomplete="off" enterkeyhint="done">`;
// options: [[value, label]]. multi = checkboxes, otherwise radio buttons.
const chips = (name, options, sel, multi) => `<div class="chips">${options.map(([v, label]) =>
  `<label><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${v}" ${(multi ? sel.includes(v) : sel === v) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>`;
const statChips = (sel, withAny) => chips('stat', [...(withAny ? [['any', `✨ ${tr('Any', 'ทุกค่าพลัง')}`]] : []), ...STATS.map(s => [s, `${ST[s].icon} ${statName(s)}`])], sel);
const diffChips = sel => chips('diff', Object.keys(DIFF).map(k => [k, `${trp(DIFF_NAME[k])} · ${DIFF[k][0]} XP`]), sel);

const bar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${clamp(pct, 0, 100)}%"></i></div>`;
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  hero: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.600 8 7"/>'),
  quests: svg('<path d="M7 4h11v13a3 3 0 01-3 3H6a2 2 0 01-2-2v-1h10v1a2 2 0 002 2"/><path d="M7 4a2 2 0 00-2 2v11M10 9h5M10 13h5"/>'),
  boss: svg('<path d="M5 11a7 7 0 0114 0v3l-2 2v3H7v-3l-2-2z"/><circle cx="9.500" cy="11.500" r="1.500"/><circle cx="14.500" cy="11.500" r="1.500"/><path d="M11 19v-2M13 19v-2"/>'),
  shop: svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 016 0v2"/>'),
  badges: svg('<circle cx="12" cy="9" r="5"/><path d="M9 13.500L7 21l5-3 5 3-2-7.500"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  tick: svg('<path d="M5 12l5 5 9-10"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  book: svg('<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>'),
};

/* ================= screens ================= */
function render() {
  if (!S.hero) return renderWelcome();
  const tabs = [['hero', I.hero, tr('Hero', 'ตัวละคร')], ['quests', I.quests, tr('Quests', 'เควสต์')], ['boss', I.boss, tr('Bosses', 'บอส')], ['shop', I.shop, tr('Shop', 'ร้านค้า')], ['badges', I.badges, tr('Badges', 'เหรียญตรา')]];
  const title = ui.tab === 'settings' ? tr('Settings', 'ตั้งค่า') : tabs.find(t => t[0] === ui.tab)[2];
  const open = dueToday().filter(q => !doneToday(q)).length;
  app.innerHTML = `
    <header class="top">
      ${ui.tab === 'settings' ? `<button class="icon-btn" data-act="tab" data-tab="hero" aria-label="${tr('Back', 'กลับ')}">${I.back}</button>`
        : `<a class="icon-btn" href="../" aria-label="${tr('Open the Diary', 'เปิด Diary')}" title="${tr('Open the Diary', 'เปิด Diary')}">${I.book}</a>`}
      <h1>${title}</h1>
      <div class="row"><span class="purse" title="${tr('Gold', 'เหรียญ')}">🪙 ${S.hero.gold}</span>
        <button class="lang" data-act="lang" aria-label="${tr('Switch to Thai', 'เปลี่ยนเป็นภาษาอังกฤษ')}">${tr('ไทย', 'EN')}</button>
        ${ui.tab === 'settings' ? '' : `<button class="icon-btn" data-act="tab" data-tab="settings" aria-label="${tr('Settings', 'ตั้งค่า')}">${I.gear}</button>`}</div>
    </header>
    <main class="page">${{ hero: heroPage, quests: questsPage, boss: bossPage, shop: shopPage, badges: badgesPage, settings: settingsPage }[ui.tab]()}</main>
    ${ui.tab === 'quests' ? `<button class="fab" data-act="act-new" aria-label="${tr('Log an activity', 'บันทึกกิจกรรม')}">${I.plus}</button>` : ''}
    <nav class="bottom-nav">${tabs.map(([id, icon, label]) => `<button data-act="tab" data-tab="${id}" class="${ui.tab === id ? 'on' : ''}">${icon}<span>${label}${id === 'quests' && open ? ` <em>${open}</em>` : ''}</span></button>`).join('')}</nav>`;
}

/* ---------- welcome ---------- */
function renderWelcome() {
  app.innerHTML = `<main class="welcome">
    <div class="row welcome-bar"><a class="icon-btn" href="../" aria-label="${tr('Open the Diary', 'เปิด Diary')}">${I.book}</a><span class="grow"></span><button class="lang" data-act="lang">${tr('ไทย', 'EN')}</button></div>
    <div class="crest">⚜️</div>
    <h1>Life RPG</h1>
    <p>${tr('Your real life is the adventure. Finish quests, grow six attributes, defeat the bosses that stand for your biggest goals.', 'ชีวิตจริงของคุณคือการผจญภัย ทำเควสต์ให้สำเร็จ พัฒนาค่าพลังทั้งหก และปราบบอสที่เป็นตัวแทนของเป้าหมายใหญ่')}</p>
    <form id="create" class="frame">
      ${field(tr('Hero name', 'ชื่อตัวละคร'), textIn('name', '', tr('Your name', 'ชื่อของคุณ'), 24))}
      ${group(tr('Class', 'อาชีพ'), chips('cls', Object.entries(CLASSES).map(([k, c]) => [k, `${c[0]} ${trp(c[1])}`]), 'warrior'))}
      <button class="btn block">${tr('Begin the adventure', 'เริ่มการผจญภัย')}</button>
    </form></main>`;
  $('#create').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target), now = Date.now(), t = today();
    S.hero = { name: String(fd.get('name')).trim() || 'Hero', cls: fd.get('cls'), createdAt: now, lastDay: t, hp: MAXHP, gold: 0, earned: 0, best: 0, perfect: 0, kos: 0, koAt: 0, xp: Object.fromEntries(STATS.map(s => [s, 0])) };
    S.quests = STARTER_QUESTS.map(([stat, diff, title]) => ({ id: uid(), title: trp(title), stat, diff, days: [0, 1, 2, 3, 4, 5, 6], createdDay: t }));
    S.rewards = STARTER_REWARDS.map(([cost, name]) => ({ id: uid(), name: trp(name), cost, bought: 0 }));
    await save();
    render();
    syncDiary();
  };
}

/* ---------- hero ---------- */
const EVENT_ICON = { daily: '📜', special: '🎲', act: '⚡', diary: '🖋️', boss: '⚔️', perfect: '💎', buy: '🎁', potion: '🧪', miss: '🩸', ko: '💀' };

function heroPage() {
  const h = S.hero, p = progress(totalXP(), heroLevel, heroFloor), cls = CLASSES[h.cls] || CLASSES.warrior;
  const due = dueToday(), done = due.filter(doneToday).length;
  const sp = specialsFor(today()), spDone = sp.filter(i => idx().special.has('sp:' + i + '|' + today())).length;
  const recent = LOG.slice(-20).reverse();
  return `
    <section class="frame hero-card">
      <div class="avatar"><span>${cls[0]}</span><b>${p.L}</b></div>
      <div class="who"><h2>${esc(h.name)}</h2><p>${tr(`Level ${p.L} ${cls[1][0]}`, `${cls[1][1]} เลเวล ${p.L}`)}</p></div>
      <div class="meter"><label><span>${tr('Health', 'พลังชีวิต')}</span><b>${h.hp} / ${MAXHP}</b></label>${bar(h.hp / MAXHP * 100, 'hp')}</div>
      <div class="meter"><label><span>${tr('Experience', 'ค่าประสบการณ์')}</span><b>${p.into} / ${p.need}</b></label>${bar(p.pct, 'xp')}</div>
      ${S.settings.rest ? `<p class="rest-note">🛌 ${tr('Rest mode is on: missed quests cost no health.', 'โหมดพักเปิดอยู่ พลาดเควสต์แล้วไม่เสียพลังชีวิต')}</p>` : ''}
    </section>
    <section class="frame"><h3>${tr('Attributes', 'ค่าพลัง')}</h3>
      <div class="stats">${STATS.map(s => { const q = progress(h.xp[s], statLevel, statFloor); return `<div class="stat s-${s}" title="${esc(trp(ST[s].hint))}">
        <span class="stat-icon">${ST[s].icon}</span><div><label><span>${statName(s)}</span><b>${tr('Lv', 'Lv')} ${q.L}</b></label>${bar(q.pct)}<small>${q.into} / ${q.need} XP</small></div></div>`; }).join('')}</div>
    </section>
    <section class="frame"><h3>${tr('Today', 'วันนี้')}</h3>
      <button class="today-row" data-act="tab" data-tab="quests"><span>📜 ${tr('Daily quests', 'เควสต์ประจำวัน')}</span><b>${done} / ${due.length}</b></button>
      <button class="today-row" data-act="tab" data-tab="quests"><span>🎲 ${tr('Special quests', 'เควสต์พิเศษ')}</span><b>${spDone} / ${sp.length}</b></button>
      <button class="today-row" data-act="tab" data-tab="boss"><span>⚔️ ${tr('Bosses alive', 'บอสที่ยังอยู่')}</span><b>${S.bosses.filter(b => !b.slainAt).length}</b></button>
    </section>
    <section class="frame"><h3>${tr('Chronicle', 'บันทึกการผจญภัย')}</h3>
      ${recent.length ? recent.map(e => `<div class="log-row"><span>${EVENT_ICON[e.type] || '•'}</span><p>${esc(e.title)}</p>
        <b class="${e.xp || e.gold > 0 ? '' : 'neg'}">${e.xp ? `+${e.xp} XP` : e.hp ? `${e.hp} HP` : e.gold ? `${e.gold > 0 ? '+' : ''}${e.gold} 🪙` : ''}</b></div>`).join('')
      : `<p class="hint">${tr('Nothing yet. Open Quests and complete your first one.', 'ยังไม่มีอะไร เปิดหน้าเควสต์แล้วทำเควสต์แรกให้สำเร็จ')}</p>`}
    </section>`;
}

/* ---------- quests ---------- */
const reward = (xp, gold) => `<span class="reward">+${xp} XP · ${gold} 🪙</span>`;

function questsPage() {
  const t = today(), now = new Date();
  const due = S.quests.filter(q => dueOn(q, now)), off = S.quests.filter(q => !dueOn(q, now));
  const dailyRow = (q, active) => {
    const on = active && doneToday(q), n = streak(q), m = streakBonus(on ? n : n + 1), [xp, gold] = DIFF[q.diff];
    return `<div class="quest s-${q.stat} ${on ? 'done' : ''} ${active ? '' : 'off'}">
      ${active ? `<button class="check ${on ? 'on' : ''}" data-act="daily-toggle" data-id="${q.id}" role="checkbox" aria-checked="${on}" aria-label="${esc(q.title)}">${I.tick}</button>` : `<span class="check idle"></span>`}
      <button class="quest-body" data-act="daily-edit" data-id="${q.id}"><h4>${esc(q.title)}</h4>
        <p><span class="pill">${ST[q.stat].icon} ${statName(q.stat)}</span>${active ? reward(Math.round(xp * m), Math.round(gold * m)) : `<span class="reward">${tr('Not scheduled today', 'วันนี้ไม่มีกำหนด')}</span>`}${n ? `<span class="streak">🔥 ${n}</span>` : ''}</p></button></div>`;
  };
  const d = ui.diary;
  return `
    <p class="date-line">${fmtDay(t)}</p>
    <section class="frame"><h3>${tr('Daily quests', 'เควสต์ประจำวัน')}</h3>
      ${due.map(q => dailyRow(q, true)).join('')}${off.map(q => dailyRow(q, false)).join('')}
      ${S.quests.length ? '' : `<p class="hint">${tr('No daily quests yet. Add habits you want to repeat.', 'ยังไม่มีเควสต์ประจำวัน เพิ่มกิจวัตรที่อยากทำซ้ำ')}</p>`}
      <button class="btn ghost block" data-act="daily-new">${I.plus}${tr('New daily quest', 'เพิ่มเควสต์ประจำวัน')}</button>
      <p class="hint">${tr(`A missed daily quest costs ${MISS_HP} health. Finish them all for a perfect day: +${PERFECT_HEAL} health and ${PERFECT_GOLD} gold.`, `พลาดเควสต์ประจำวันเสียพลังชีวิต ${MISS_HP} ทำครบทุกข้อได้วันสมบูรณ์แบบ: พลังชีวิต +${PERFECT_HEAL} และ ${PERFECT_GOLD} เหรียญ`)}</p>
    </section>
    <section class="frame"><h3>${tr('Special quests', 'เควสต์พิเศษ')}</h3>
      ${specialsFor(t).map(i => { const [stat, diff, en, th] = SPECIALS[i], on = idx().special.has('sp:' + i + '|' + t);
        return `<div class="quest s-${stat} ${on ? 'done' : ''}"><button class="check ${on ? 'on' : ''}" data-act="special-toggle" data-i="${i}" role="checkbox" aria-checked="${on}" aria-label="${esc(tr(en, th))}">${I.tick}</button>
          <div class="quest-body"><h4>${esc(tr(en, th))}</h4><p><span class="pill">${ST[stat].icon} ${statName(stat)}</span>${reward(Math.round(DIFF[diff][0] * SPECIAL_BONUS), Math.round(DIFF[diff][1] * SPECIAL_BONUS))}</p></div></div>`; }).join('')}
      <p class="hint">${tr('Three new quests are drawn every day and pay a bonus. Skipping them costs nothing.', 'ทุกวันจะสุ่มเควสต์ใหม่สามข้อ ให้รางวัลเพิ่มพิเศษ ไม่ทำก็ไม่เสียอะไร')}</p>
    </section>
    <section class="frame"><h3>${tr('From your Diary', 'จาก Diary ของคุณ')}</h3>
      <p class="link-state ${d.state}">${d.state === 'linked' ? `● ${tr('Linked', 'เชื่อมแล้ว')}` : d.state === 'checking' ? tr('Checking…', 'กำลังตรวจสอบ…') : `○ ${tr('Not linked', 'ยังไม่ได้เชื่อม')}`}</p>
      <p class="hint">${d.state === 'linked'
        ? tr('Finished To Do tasks, diary entries, daily answers and gratitude notes are rewarded here automatically.', 'งานที่เสร็จใน To Do บันทึกประจำวัน คำตอบประจำวัน และโน้ตขอบคุณ จะได้รางวัลที่นี่อัตโนมัติ')
        : d.state === 'unsupported' ? tr('This browser cannot look up other apps on the same address.', 'เบราว์เซอร์นี้ตรวจหาแอปอื่นบนที่อยู่เดียวกันไม่ได้')
        : tr('No Diary data was found on this device yet. Open the Diary once (the book button at the top left), then come back.', 'ยังไม่พบข้อมูล Diary ในเครื่องนี้ เปิด Diary หนึ่งครั้ง (ปุ่มรูปหนังสือมุมซ้ายบน) แล้วกลับมาใหม่')}</p>
      <button class="btn ghost block" data-act="diary-sync">${tr('Check the Diary now', 'ตรวจ Diary ตอนนี้')}</button>
    </section>`;
}

async function editDaily(q) {
  const o = await sheet(q ? tr('Edit daily quest', 'แก้ไขเควสต์ประจำวัน') : tr('New daily quest', 'เควสต์ประจำวันใหม่'),
    field(tr('Quest', 'เควสต์'), textIn('title', q?.title || '', tr('For example: Meditate 10 minutes', 'เช่น นั่งสมาธิ 10 นาที'))) +
    group(tr('Attribute', 'ค่าพลัง'), statChips(q?.stat || 'str')) +
    group(tr('Difficulty', 'ความยาก'), diffChips(q?.diff || 'medium')) +
    group(tr('Days', 'วัน'), chips('days', DAYS.map((d, i) => [String(i), trp(d)]), (q?.days || [0, 1, 2, 3, 4, 5, 6]).map(String), true)),
    { del: q && tr('Delete', 'ลบ') });
  if (!o) return;
  if (o === 'del') {
    if (!await ask(tr('Delete this quest?', 'ลบเควสต์นี้?'), q.title, tr('Delete', 'ลบ'))) return;
    S.quests = S.quests.filter(x => x !== q);
  } else {
    const days = (o.days || []).map(Number);
    if (!days.length) return toast(tr('Pick at least one day', 'เลือกอย่างน้อยหนึ่งวัน'));
    const v = { title: o.title[0].trim(), stat: o.stat[0], diff: o.diff[0], days };
    if (q) Object.assign(q, v); else S.quests.push({ id: uid(), createdDay: today(), ...v });
  }
  await save(); render();
}

/* ---------- bosses ---------- */
function bossPage() {
  const alive = S.bosses.filter(b => !b.slainAt), dead = S.bosses.filter(b => b.slainAt).sort((a, b) => b.slainAt - a.slainAt);
  const weak = b => b.stat === 'any' ? `✨ ${tr('Any attribute', 'ทุกค่าพลัง')}` : `${ST[b.stat].icon} ${statName(b.stat)}`;
  return `
    ${alive.map(b => `<section class="frame boss"><div class="boss-art">${b.icon}</div>
      <div class="boss-info"><h2>${esc(b.name)}</h2><p>${tr('Weak to', 'แพ้ทาง')}: ${weak(b)} · ${tr('Bounty', 'ค่าหัว')} ${b.reward} 🪙</p>
        <div class="meter"><label><span>${tr('Health', 'พลังชีวิต')}</span><b>${b.hp} / ${b.max}</b></label>${bar(b.hp / b.max * 100, 'hp')}</div></div>
      <button class="link" data-act="boss-drop" data-id="${b.id}">${tr('Abandon', 'ยกเลิก')}</button></section>`).join('')}
    ${alive.length ? '' : `<section class="frame empty"><div class="boss-art">🏰</div><h2>${tr('No boss in sight', 'ยังไม่มีบอส')}</h2>
      <p>${tr('A boss is a big goal. Every point of experience you earn in its attribute deals one point of damage.', 'บอสคือเป้าหมายใหญ่ ค่าประสบการณ์ทุกแต้มที่ได้ในค่าพลังของมัน จะสร้างความเสียหายหนึ่งแต้ม')}</p></section>`}
    <button class="btn block" data-act="boss-new">${I.plus}${tr('Summon a boss', 'อัญเชิญบอส')}</button>
    ${dead.length ? `<section class="frame"><h3>${tr('Defeated', 'ปราบแล้ว')}</h3>${dead.map(b => `<div class="log-row"><span>${b.icon}</span><p>${esc(b.name)}</p><b>${new Date(b.slainAt).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>`).join('')}</section>` : ''}`;
}

async function newBoss() {
  const o = await sheet(tr('Summon a boss', 'อัญเชิญบอส'),
    field(tr('The goal this boss stands for', 'เป้าหมายที่บอสตัวนี้เป็นตัวแทน'), textIn('name', '', tr('For example: Publish 30 clips', 'เช่น ปล่อยคลิปให้ครบ 30 คลิป'), 60)) +
    group(tr('Form', 'ร่าง'), chips('icon', BOSS_ICONS.map(i => [i, i]), BOSS_ICONS[0])) +
    group(tr('Weak to', 'แพ้ทาง'), statChips('any', true)) +
    group(tr('Size', 'ขนาด'), chips('size', Object.keys(BOSS_SIZE).map(k => [k, `${trp(BOSS_SIZE_NAME[k])} · ${BOSS_SIZE[k][0]} HP`]), 'champion')),
    { ok: tr('Summon', 'อัญเชิญ') });
  if (!o) return;
  const [hp, gold] = BOSS_SIZE[o.size[0]];
  S.bosses.push({ id: uid(), name: o.name[0].trim(), icon: o.icon[0], stat: o.stat[0], max: hp, hp, reward: gold, createdAt: Date.now(), slainAt: 0 });
  await save(); render();
}

/* ---------- shop ---------- */
function shopPage() {
  const h = S.hero;
  return `
    <section class="frame"><h3>${tr('Apothecary', 'ร้านยา')}</h3>
      <div class="ware"><span class="ware-icon">🧪</span><div><h4>${tr('Healing potion', 'ยาฟื้นพลัง')}</h4><p>${tr(`Restores ${POTION.heal} health`, `ฟื้นพลังชีวิต ${POTION.heal}`)}</p></div>
        <button class="btn price" data-act="potion" ${h.gold < POTION.cost || h.hp >= MAXHP ? 'disabled' : ''}>${POTION.cost} 🪙</button></div>
    </section>
    <section class="frame"><h3>${tr('Your rewards', 'รางวัลของคุณ')}</h3>
      ${S.rewards.map(r => `<div class="ware"><span class="ware-icon">🎁</span><button class="ware-body" data-act="reward-edit" data-id="${r.id}"><h4>${esc(r.name)}</h4><p>${r.bought ? tr(`Bought ${r.bought} time${r.bought === 1 ? '' : 's'}`, `แลกแล้ว ${r.bought} ครั้ง`) : tr('Not bought yet', 'ยังไม่เคยแลก')}</p></button>
        <button class="btn price" data-act="reward-buy" data-id="${r.id}" ${h.gold < r.cost ? 'disabled' : ''}>${r.cost} 🪙</button></div>`).join('')}
      ${S.rewards.length ? '' : `<p class="hint">${tr('No rewards yet.', 'ยังไม่มีรางวัล')}</p>`}
      <button class="btn ghost block" data-act="reward-new">${I.plus}${tr('New reward', 'เพิ่มรางวัล')}</button>
      <p class="hint">${tr('Rewards are real treats you allow yourself. Set a price that makes you work for it.', 'รางวัลคือสิ่งที่คุณอนุญาตให้ตัวเองในชีวิตจริง ตั้งราคาให้ต้องลงแรงถึงจะได้')}</p>
    </section>`;
}

async function editReward(r) {
  const o = await sheet(r ? tr('Edit reward', 'แก้ไขรางวัล') : tr('New reward', 'รางวัลใหม่'),
    field(tr('Reward', 'รางวัล'), textIn('name', r?.name || '', tr('For example: An evening of games', 'เช่น เล่นเกมหนึ่งคืน'), 60)) +
    field(tr('Price in gold', 'ราคาเป็นเหรียญ'), `<input type="number" name="cost" min="1" max="99999" step="1" value="${r?.cost || 100}" required inputmode="numeric">`),
    { del: r && tr('Delete', 'ลบ') });
  if (!o) return;
  if (o === 'del') S.rewards = S.rewards.filter(x => x !== r);
  else {
    const v = { name: o.name[0].trim(), cost: clamp(Math.round(+o.cost[0]) || 1, 1, 99999) };
    if (r) Object.assign(r, v); else S.rewards.push({ id: uid(), bought: 0, ...v });
  }
  await save(); render();
}

/* ---------- badges ---------- */
function badgesPage() {
  const got = BADGES.filter(b => S.badges[b.id]).length;
  return `<p class="date-line">${tr(`${got} of ${BADGES.length} unlocked`, `ปลดล็อกแล้ว ${got} จาก ${BADGES.length}`)}</p>
    <div class="badges">${BADGES.map(b => { const at = S.badges[b.id]; return `<div class="badge ${at ? 'on' : ''}"><span>${at ? b.icon : '🔒'}</span><h4>${trp(b.name)}</h4><p>${trp(b.desc)}</p></div>`; }).join('')}</div>`;
}

/* ---------- settings ---------- */
function settingsPage() {
  const h = S.hero;
  return `
    <section class="frame"><h3>${tr('Hero', 'ตัวละคร')}</h3>
      <div class="set-row"><span>${esc(h.name)} · ${trp((CLASSES[h.cls] || CLASSES.warrior)[1])}</span><button class="btn ghost" data-act="hero-edit">${tr('Change', 'เปลี่ยน')}</button></div></section>
    <section class="frame"><h3>${tr('Rest mode', 'โหมดพัก')}</h3>
      <div class="set-row"><span>${tr('Pause penalties', 'หยุดบทลงโทษชั่วคราว')}</span><input type="checkbox" class="switch" id="s-rest" ${S.settings.rest ? 'checked' : ''} aria-label="${tr('Rest mode', 'โหมดพัก')}"></div>
      <p class="hint">${tr('Use it when you are ill or travelling. Missed daily quests cost no health while it is on.', 'ใช้เมื่อป่วยหรือเดินทาง ระหว่างเปิดอยู่ พลาดเควสต์ประจำวันจะไม่เสียพลังชีวิต')}</p></section>
    <section class="frame"><h3>${tr('Backup', 'สำรองข้อมูล')}</h3>
      <div class="set-row"><span>${tr('Export everything to a file', 'ส่งออกทั้งหมดเป็นไฟล์')}</span><button class="btn" data-act="export">${tr('Export', 'ส่งออก')}</button></div>
      <div class="set-row"><span>${tr('Import from a backup file', 'นำเข้าจากไฟล์สำรอง')}</span><button class="btn ghost" data-act="import">${tr('Import', 'นำเข้า')}</button></div>
      <p class="hint">${tr('Everything is stored only on this device. Clearing browser data erases it, so export a backup from time to time.', 'ข้อมูลทั้งหมดเก็บอยู่ในเครื่องนี้เท่านั้น การล้างข้อมูลเบราว์เซอร์จะลบทิ้ง ควรส่งออกไฟล์สำรองเป็นระยะ')}</p></section>
    <section class="frame"><h3>${tr('Start over', 'เริ่มใหม่')}</h3>
      <div class="set-row"><span>${tr('Delete this hero and all progress', 'ลบตัวละครและความคืบหน้าทั้งหมด')}</span><button class="btn danger" data-act="reset">${tr('Delete', 'ลบ')}</button></div></section>`;
}

async function exportAll() {
  const blob = new Blob([JSON.stringify({ app: 'liferpg', version: 1, exportedAt: new Date().toISOString(), state: S, log: LOG })], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `life-rpg-backup-${today()}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
}

async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast(tr('This file could not be read', 'อ่านไฟล์นี้ไม่ได้')); }
  if (data?.app !== 'liferpg' || !data.state?.hero || !Array.isArray(data.log)) return toast(tr('This is not a Life RPG backup file', 'ไฟล์นี้ไม่ใช่ไฟล์สำรองของ Life RPG'));
  if (!await ask(tr('Import backup', 'นำเข้าไฟล์สำรอง'), tr('This replaces the hero and all progress on this device with the ones in the file.', 'ตัวละครและความคืบหน้าทั้งหมดในเครื่องนี้จะถูกแทนที่ด้วยข้อมูลในไฟล์'), tr('Import', 'นำเข้า'))) return;
  await req(store('log', 'readwrite').clear());
  for (const e of data.log) if (e?.id) await dbPut('log', e);
  await dbPut('kv', data.state, 'state');
  await load();
  render();
  toast(tr('Import finished', 'นำเข้าเสร็จแล้ว'));
}

/* ================= actions ================= */
const actions = {
  tab: el => { ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  lang: async () => { S.settings.lang = S.settings.lang === 'th' ? 'en' : 'th'; document.documentElement.lang = S.settings.lang; await save(); render(); },

  'daily-new': () => editDaily(null),
  'daily-edit': el => editDaily(S.quests.find(q => q.id === el.dataset.id)),
  'daily-toggle': async el => {
    const q = S.quests.find(x => x.id === el.dataset.id), t = today(), h = S.hero;
    if (!q) return;
    const was = LOG.find(e => e.type === 'daily' && e.ref === q.id && e.date === t);
    if (was) { await undo(was); return settle(tr('Taken back', 'ยกเลิกแล้ว')); }
    const m = streakBonus(streak(q) + 1), xp = Math.round(DIFF[q.diff][0] * m), gold = Math.round(DIFF[q.diff][1] * m);
    await gain({ type: 'daily', title: q.title, stat: q.stat, xp, gold, ref: q.id });
    if (dueToday().every(doneToday) && !LOG.some(e => e.type === 'perfect' && e.date === t)) {
      h.hp = Math.min(MAXHP, h.hp + PERFECT_HEAL); h.perfect++;
      await gain({ type: 'perfect', title: tr('Perfect day', 'วันสมบูรณ์แบบ'), gold: PERFECT_GOLD });
      fx.push({ icon: '💎', title: tr('Perfect day', 'วันสมบูรณ์แบบ'), text: tr(`Every daily quest is done. +${PERFECT_HEAL} health, +${PERFECT_GOLD} gold.`, `ทำเควสต์ประจำวันครบทุกข้อ พลังชีวิต +${PERFECT_HEAL} เหรียญ +${PERFECT_GOLD}`) });
    }
    settle(`+${xp} XP · +${gold} 🪙`);
  },
  'special-toggle': async el => {
    const i = +el.dataset.i, t = today(), ref = 'sp:' + i;
    const was = LOG.find(e => e.type === 'special' && e.ref === ref && e.date === t);
    if (was) { await undo(was); return settle(tr('Taken back', 'ยกเลิกแล้ว')); }
    const [stat, diff, en, th] = SPECIALS[i], xp = Math.round(DIFF[diff][0] * SPECIAL_BONUS), gold = Math.round(DIFF[diff][1] * SPECIAL_BONUS);
    await gain({ type: 'special', title: tr(en, th), stat, xp, gold, ref });
    settle(`+${xp} XP · +${gold} 🪙`);
  },
  'act-new': async () => {
    const o = await sheet(tr('Log an activity', 'บันทึกกิจกรรม'),
      field(tr('What did you do?', 'คุณทำอะไรมา?'), textIn('title', '', tr('For example: Edited a clip', 'เช่น ตัดต่อคลิปหนึ่งคลิป'))) +
      group(tr('Attribute', 'ค่าพลัง'), statChips('int')) + group(tr('Difficulty', 'ความยาก'), diffChips('medium')),
      { ok: tr('Claim reward', 'รับรางวัล') });
    if (!o) return;
    const [xp, gold] = DIFF[o.diff[0]];
    await gain({ type: 'act', title: o.title[0].trim(), stat: o.stat[0], xp, gold });
    settle(`+${xp} XP · +${gold} 🪙`);
  },
  'diary-sync': () => syncDiary(true),

  'boss-new': newBoss,
  'boss-drop': async el => {
    const b = S.bosses.find(x => x.id === el.dataset.id);
    if (!b || !await ask(tr('Abandon this boss?', 'ยกเลิกบอสตัวนี้?'), b.name, tr('Abandon', 'ยกเลิกบอส'))) return;
    S.bosses = S.bosses.filter(x => x !== b);
    await save(); render();
  },

  potion: async () => {
    const h = S.hero;
    if (h.gold < POTION.cost || h.hp >= MAXHP) return;
    h.gold -= POTION.cost; h.hp = Math.min(MAXHP, h.hp + POTION.heal);
    await note('potion', tr('Healing potion', 'ยาฟื้นพลัง'), { gold: -POTION.cost });
    settle(tr(`+${POTION.heal} health`, `พลังชีวิต +${POTION.heal}`));
  },
  'reward-new': () => editReward(null),
  'reward-edit': el => editReward(S.rewards.find(r => r.id === el.dataset.id)),
  'reward-buy': async el => {
    const r = S.rewards.find(x => x.id === el.dataset.id), h = S.hero;
    if (!r || h.gold < r.cost) return;
    if (!await ask(tr('Buy this reward?', 'แลกรางวัลนี้?'), `${r.name} · ${r.cost} 🪙`, tr('Buy', 'แลก'))) return;
    h.gold -= r.cost; r.bought++;
    await note('buy', r.name, { gold: -r.cost });
    settle(tr('Enjoy it. You earned it.', 'ขอให้สนุก คุณคู่ควรแล้ว'));
  },

  'hero-edit': async () => {
    const h = S.hero;
    const o = await sheet(tr('Your hero', 'ตัวละครของคุณ'),
      field(tr('Hero name', 'ชื่อตัวละคร'), textIn('name', h.name, '', 24)) +
      group(tr('Class', 'อาชีพ'), chips('cls', Object.entries(CLASSES).map(([k, c]) => [k, `${c[0]} ${trp(c[1])}`]), h.cls)));
    if (!o) return;
    h.name = o.name[0].trim() || h.name; h.cls = o.cls[0];
    await save(); render();
  },
  export: exportAll,
  import: () => $('#pick-import').click(),
  reset: async () => {
    if (!await ask(tr('Delete this hero?', 'ลบตัวละครนี้?'), tr('All levels, gold, quests, bosses and badges on this device will be permanently deleted.', 'เลเวล เหรียญ เควสต์ บอส และเหรียญตราทั้งหมดในเครื่องนี้จะถูกลบถาวร'), tr('Delete', 'ลบ'))) return;
    await req(store('log', 'readwrite').clear());
    await dbDel('kv', 'state');
    await load();
    ui.tab = 'hero';
    render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act] && !el.disabled) { e.preventDefault(); actions[el.dataset.act](el); }
});
document.addEventListener('change', async e => {
  if (e.target.id === 's-rest') { S.settings.rest = e.target.checked; await save(); render(); }
});
$('#pick-import').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importFile(f); });
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !S.hero) return;
  await newDay();
  syncDiary();
});

/* ================= boot ================= */
async function load() {
  const saved = await req(store('kv').get('state'));
  S = { hero: null, quests: [], bosses: [], rewards: [], badges: {}, ...saved, settings: { lang: 'en', rest: false, ...saved?.settings } };
  LOG = (await req(store('log').getAll())).sort((a, b) => a.ts - b.ts);
  idxV++;
  document.documentElement.lang = S.settings.lang;
}

(async function boot() {
  try {
    db = await openDB();
    await load();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<main class="welcome"><h1>Life RPG</h1><p>Storage could not be opened. This browser may be in private mode.</p></main>`;
    return;
  }
  render();
  navigator.storage?.persist?.();
  await newDay();
  syncDiary();
})();
