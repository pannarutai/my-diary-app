'use strict';
/* ================= To Do List =================
   โหลดก่อน app.js — ไฟล์นี้มีแต่ฟังก์ชัน ใช้ตัวแปรร่วม (state, I, $ ฯลฯ) จาก app.js ตอนถูกเรียก
   งานหนึ่งชิ้น: { id, title, note, cat, due, done, doneAt, steps: [{ id, text, done }], createdAt, updatedAt } */

let taskTimer = null;

// ความคืบหน้าของงาน 0–100: งานที่เสร็จ = 100, ไม่เช่นนั้นคิดจากสัดส่วนขั้นตอนย่อยที่ทำแล้ว
function todoPct(t) {
  if (t.done) return 100;
  return t.steps.length ? Math.round(t.steps.filter(s => s.done).length / t.steps.length * 100) : 0;
}
const fmtShort = s => parseDate(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

/* ---------- list ---------- */
function renderTodos() {
  const el = $('#todos');
  if (!el) return;
  const items = state.todos.filter(inCat);
  const open = items.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt);
  const done = items.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

  if (!items.length) {
    el.innerHTML = `<div class="empty"><b>ยังไม่มีสิ่งที่ต้องทำ${state.cat === 'all' ? '' : 'ในหมวด' + catName(state.cat)}</b>กดปุ่ม + ด้านล่างเพื่อเพิ่มงานแรก</div>`;
    return;
  }
  const pct = Math.round(items.reduce((n, t) => n + todoPct(t), 0) / items.length);
  const late = open.filter(t => t.due && t.due < today()).length;
  let html = `<section class="progress-card c-${state.cat}">
      <div class="pc-head"><span>ความคืบหน้า${state.cat === 'all' ? 'ทั้งหมด' : 'หมวด' + catName(state.cat)}</span><b>${pct}%</b></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      <small>เสร็จแล้ว ${done.length} จาก ${items.length} งาน${late ? ` · <span class="late">เลยกำหนด ${late} งาน</span>` : ''}</small>
    </section>`;
  html += open.length ? open.map(todoRow).join('') : `<div class="empty compact"><b>เสร็จครบทุกงานแล้ว</b></div>`;
  if (done.length) {
    html += `<button class="done-toggle ${state.showDone ? 'open' : ''}" data-act="toggle-done" aria-expanded="${state.showDone}">${I.back}<span>เสร็จแล้ว ${done.length} งาน</span></button>`;
    if (state.showDone) html += done.map(todoRow).join('');
  }
  el.innerHTML = html;
}

function todoRow(t) {
  const n = t.steps.length, k = t.steps.filter(s => s.done).length;
  const late = !t.done && t.due && t.due < today();
  const meta = [
    n ? `<span>${k}/${n} ขั้นตอน</span>` : '',
    t.due ? `<span class="${late ? 'late' : ''}">${late ? 'เลยกำหนด' : 'กำหนด'} ${fmtShort(t.due)}</span>` : '',
    state.cat === 'all' ? `<span class="tag c-${catOf(t)}">${catName(catOf(t))}</span>` : '',
  ].join('');
  return `<article class="todo c-${catOf(t)} ${t.done ? 'done' : ''}">
    <button class="check ${t.done ? 'on' : ''}" data-act="todo-toggle" data-id="${t.id}" role="checkbox" aria-checked="${!!t.done}" aria-label="ทำเสร็จแล้ว: ${esc(t.title)}">${I.tick}</button>
    <div class="body" data-act="todo-open" data-id="${t.id}" role="button" tabindex="0">
      <h3>${esc(t.title) || 'ไม่มีชื่อ'}</h3>
      ${n && !t.done ? `<div class="bar sm"><i style="width:${todoPct(t)}%"></i></div>` : ''}
      ${meta ? `<div class="meta">${meta}</div>` : ''}
    </div></article>`;
}

function setTaskDone(t, done) {
  t.done = done;
  t.doneAt = done ? Date.now() : 0;
  if (done) t.steps.forEach(s => { s.done = true; }); // ติ๊กงานเสร็จ = ขั้นตอนย่อยเสร็จทั้งหมด
}

/* ---------- task editor ---------- */
function openTask(task, saved) {
  state.task = task; state.taskSaved = saved; state.view = 'task';
  history.pushState({ v: 'task' }, '');
  render();
}

function renderTask() {
  const t = state.task;
  app.innerHTML = `
    <header class="top">
      <button class="icon-btn" data-act="back" aria-label="กลับ">${I.back}</button>
      <span id="saved" class="saved"></span>
      <button class="icon-btn danger" data-act="del-task" aria-label="ลบงานนี้">${I.trash}</button>
    </header>
    <main class="editor">
      <input id="t-title" class="e-title" placeholder="สิ่งที่ต้องทำ" maxlength="120" value="${esc(t.title)}">
      <div class="cats" role="group" aria-label="หมวด">${CATS.map(c => `<button data-act="task-cat" data-cat="${c[0]}" class="c-${c[0]} ${catOf(t) === c[0] ? 'on' : ''}">${c[1]}</button>`).join('')}</div>
      <div class="row due-row">
        <label class="date-pick">${I.cal}<span id="due-label"></span>
          <input type="date" id="t-due" value="${t.due}" aria-label="วันกำหนดเสร็จ"></label>
        <button class="link" id="due-clear" data-act="due-clear">ล้างวัน</button>
      </div>
      <div id="t-progress"></div>
      <h2 class="sub">ขั้นตอนย่อย</h2>
      <div id="steps"></div>
      <form id="step-form" class="step-add">
        <input id="step-new" placeholder="เพิ่มขั้นตอน เช่น นัดหมอ, โอนเงิน" maxlength="120" enterkeyhint="done" autocomplete="off" aria-label="ขั้นตอนใหม่">
        <button class="icon-btn" aria-label="เพิ่มขั้นตอน">${I.plus}</button>
      </form>
      <h2 class="sub">โน้ต</h2>
      <textarea id="t-note" class="note" placeholder="รายละเอียดเพิ่มเติม">${esc(t.note)}</textarea>
    </main>`;
  $('#t-title').addEventListener('input', e => { t.title = e.target.value; scheduleTaskSave(); });
  const note = $('#t-note');
  const grow = () => { note.style.height = 'auto'; note.style.height = note.scrollHeight + 'px'; };
  note.addEventListener('input', () => { t.note = note.value; grow(); scheduleTaskSave(); });
  grow();
  const due = $('#t-due');
  due.addEventListener('click', () => { try { due.showPicker(); } catch { } });
  due.addEventListener('change', () => { t.due = due.value || ''; renderDue(); scheduleTaskSave(); });
  $('#step-form').addEventListener('submit', e => {
    e.preventDefault();
    const inp = $('#step-new'), text = inp.value.trim();
    if (!text) return;
    t.steps.push({ id: uid(), text, done: false });
    if (t.done) setTaskDoneOnly(t, false); // เพิ่มขั้นตอนใหม่ให้งานที่เสร็จแล้ว = งานยังไม่เสร็จ
    inp.value = ''; inp.focus();
    renderSteps(); scheduleTaskSave();
  });
  renderDue();
  renderSteps();
  if (!state.taskSaved) $('#t-title').focus();
}

function setTaskDoneOnly(t, done) { t.done = done; t.doneAt = done ? Date.now() : 0; }

function renderDue() {
  const t = state.task;
  const late = !t.done && t.due && t.due < today();
  const label = $('#due-label');
  const when = t.due && parseDate(t.due).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  label.textContent = t.due ? `${late ? 'เลยกำหนด' : 'กำหนดเสร็จ'} ${when}` : 'ตั้งวันกำหนดเสร็จ';
  label.classList.toggle('late', !!late);
  $('#due-clear').hidden = !t.due;
}

function renderSteps() {
  const t = state.task;
  const n = t.steps.length, k = t.steps.filter(s => s.done).length, pct = todoPct(t);
  $('#t-progress').innerHTML = `<section class="progress-card c-${catOf(t)}">
      <div class="pc-head"><span>${n ? `ทำแล้ว ${k} จาก ${n} ขั้นตอน` : 'ความคืบหน้า'}</span><b>${pct}%</b></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      <button class="mark-done ${t.done ? 'on' : ''}" data-act="task-done" role="checkbox" aria-checked="${!!t.done}">
        <span class="check ${t.done ? 'on' : ''}">${I.tick}</span>${t.done ? 'งานนี้เสร็จแล้ว' : 'ทำเครื่องหมายว่างานนี้เสร็จ'}</button>
    </section>`;
  $('#steps').className = `c-${catOf(t)}`;
  $('#steps').innerHTML = t.steps.map(s => `<div class="step ${s.done ? 'done' : ''}">
      <button class="check ${s.done ? 'on' : ''}" data-act="step-toggle" data-id="${s.id}" role="checkbox" aria-checked="${s.done}" aria-label="${esc(s.text)}">${I.tick}</button>
      <span data-act="step-toggle" data-id="${s.id}">${esc(s.text)}</span>
      <button class="icon-btn x" data-act="step-del" data-id="${s.id}" aria-label="ลบขั้นตอน">${I.close}</button>
    </div>`).join('');
}

function scheduleTaskSave() {
  clearTimeout(taskTimer);
  taskTimer = setTimeout(saveTask, 400);
}

async function saveTask() {
  clearTimeout(taskTimer); taskTimer = null;
  const t = state.task;
  if (!t) return;
  t.updatedAt = Date.now();
  await dbPut('todos', t);
  if (!state.taskSaved) { state.todos.push(t); state.taskSaved = true; }
  const s = $('#saved');
  if (s) s.textContent = 'บันทึกแล้ว';
}

async function removeTask(t) {
  await dbDel('todos', t.id);
  state.todos = state.todos.filter(x => x !== t);
}

async function leaveTask() {
  const t = state.task;
  if (!t) return;
  if (taskTimer) await saveTask();
  const empty = !t.title.trim() && !t.note.trim() && !t.steps.length;
  if (empty && state.taskSaved) await removeTask(t);
  state.task = null;
}

/* ---------- actions (รวมเข้ากับ actions ของ app.js) ---------- */
const todoActions = {
  nav: el => { state.section = el.dataset.section; state.day = null; renderHome(); window.scrollTo(0, 0); },
  'new-task': () => {
    const now = Date.now();
    openTask({ id: uid(), title: '', note: '', cat: state.cat === 'all' ? 'life' : state.cat, due: '', done: false, doneAt: 0, steps: [], createdAt: now, updatedAt: now }, false);
  },
  'todo-open': el => { const t = state.todos.find(x => x.id === el.dataset.id); if (t) openTask(t, true); },
  'todo-toggle': async el => {
    const t = state.todos.find(x => x.id === el.dataset.id);
    if (!t) return;
    setTaskDone(t, !t.done);
    t.updatedAt = Date.now();
    await dbPut('todos', t);
    renderTodos();
  },
  'toggle-done': () => { state.showDone = !state.showDone; renderTodos(); },
  'task-cat': el => {
    const t = state.task; t.cat = el.dataset.cat;
    document.querySelectorAll('.cats button').forEach(b => b.classList.toggle('on', b.dataset.cat === t.cat));
    renderSteps();
    if (state.taskSaved) scheduleTaskSave();
  },
  'due-clear': () => { state.task.due = ''; $('#t-due').value = ''; renderDue(); scheduleTaskSave(); },
  'task-done': () => { const t = state.task; setTaskDone(t, !t.done); renderSteps(); renderDue(); scheduleTaskSave(); },
  'step-toggle': el => {
    const t = state.task, s = t.steps.find(x => x.id === el.dataset.id);
    if (!s) return;
    s.done = !s.done;
    setTaskDoneOnly(t, t.steps.every(x => x.done)); // ครบทุกขั้นตอน = งานเสร็จอัตโนมัติ
    renderSteps(); renderDue(); scheduleTaskSave();
  },
  'step-del': el => {
    const t = state.task;
    t.steps = t.steps.filter(x => x.id !== el.dataset.id);
    if (t.steps.length && !t.done && t.steps.every(x => x.done)) setTaskDoneOnly(t, true);
    renderSteps(); scheduleTaskSave();
  },
  'del-task': async () => {
    const t = state.task;
    if (state.taskSaved) {
      if (!await ask('ลบงานนี้?', t.title || 'งานนี้และขั้นตอนย่อยทั้งหมดจะถูกลบถาวร', 'ลบ')) return;
      clearTimeout(taskTimer); taskTimer = null;
      await removeTask(t);
    }
    state.task = null;
    history.back();
  },
};

// ตรวจข้อมูลงานจากไฟล์สำรองก่อนนำเข้า
function cleanTodo(t) {
  if (!t?.id) return null;
  return {
    id: String(t.id), title: String(t.title || ''), note: String(t.note || ''), cat: catOf(t),
    due: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : '', done: !!t.done, doneAt: +t.doneAt || 0,
    steps: (Array.isArray(t.steps) ? t.steps : []).filter(s => s?.id).map(s => ({ id: String(s.id), text: String(s.text || ''), done: !!s.done })),
    createdAt: +t.createdAt || Date.now(), updatedAt: +t.updatedAt || Date.now(),
  };
}
