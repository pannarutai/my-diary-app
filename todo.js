'use strict';
/* ================= To Do list + reminders =================
   Loaded before app.js. This file only defines functions; they use the shared
   globals from app.js (state, I, $, ...) when they are called.
   A finished task leaves the To Do list and shows up in the Done list, grouped by the day it was finished.
   A task: { id, title, note, cat, folder, due, done, doneAt, steps: [{ id, text, done }], createdAt, updatedAt } */

let taskTimer = null;

// Progress of one task, 0-100: a finished task is 100, otherwise the share of sub-steps done.
function todoPct(t) {
  if (t.done) return 100;
  return t.steps.length ? Math.round(t.steps.filter(s => s.done).length / t.steps.length * 100) : 0;
}
const fmtShort = s => parseDate(s).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });

/* ---------- reminders ---------- */
const daysUntil = due => Math.round((parseDate(due) - parseDate(today())) / 864e5);
const isSoon = t => !t.done && !!t.due && daysUntil(t.due) <= state.settings.remindDays; // includes overdue
const dueSoon = () => state.todos.filter(isSoon).sort((a, b) => a.due.localeCompare(b.due));

function dueText(t) {
  const d = daysUntil(t.due);
  if (d < 0) return `Overdue by ${plural(-d, 'day')}`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d <= 7) return `Due in ${d} days`;
  return `Due ${fmtShort(t.due)}`;
}
const dueClass = t => t.done ? '' : daysUntil(t.due) < 0 ? 'late' : isSoon(t) ? 'soon' : '';

function remindSummary(list) {
  const over = list.filter(t => daysUntil(t.due) < 0).length, soon = list.length - over;
  return [over && `${plural(over, 'task')} overdue`, soon && `${plural(soon, 'task')} due soon`].filter(Boolean).join(' · ');
}

// Number on the app icon (only where the phone supports it and notifications are on).
function updateBadge() {
  const n = state.settings.notify ? dueSoon().length : 0;
  try { if (n) navigator.setAppBadge?.(n); else navigator.clearAppBadge?.(); } catch { }
}

async function setNotify(on) {
  if (on) {
    if (!('Notification' in window)) {
      toast('Notifications are not available here. On iPhone, add the app to your Home Screen first.');
      return false;
    }
    if (await Notification.requestPermission() !== 'granted') {
      toast('Notifications are blocked. Allow them for this app in your phone settings.');
      return false;
    }
  }
  state.settings.notify = on;
  await saveSettings();
  updateBadge();
  if (on) checkReminders(true);
  return on;
}

// Shows at most one notification a day. A web app cannot wake itself up, so this
// runs when the app is opened or brought back to the front.
async function checkReminders(force) {
  updateBadge();
  if (!state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const list = dueSoon();
  if (!list.length) return;
  const day = today();
  if (!force && await dbGet('meta', 'lastNotified') === day) return;
  await dbPut('meta', day, 'lastNotified');
  const title = remindSummary(list).replace(/^./, c => c.toUpperCase());
  // With a passcode set, keep task names off the lock screen.
  const body = state.pin
    ? 'Open Diary to see them.'
    : list.slice(0, 3).map(t => `${t.title || 'Untitled task'}: ${dueText(t).toLowerCase()}`).join('\n') + (list.length > 3 ? `\n…and ${list.length - 3} more` : '');
  const opts = { body, icon: 'icons/icon-192.png', tag: 'due-tasks' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
  } catch (err) { console.warn(err); }
}

// Calendar file with an alarm, so the phone's own calendar can alert while this app is closed.
function taskICS(t) {
  const e = s => String(s).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
  const day = t.due.replace(/-/g, '');
  const next = ymd(new Date(parseDate(t.due).getTime() + 26 * 36e5)).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const hours = state.settings.remindDays * 24 - 9; // alarm at 09:00, remindDays before the due date
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Diary//To Do//EN', 'BEGIN:VEVENT',
    `UID:${t.id}@diary-app`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${e(t.title || 'Untitled task')}`, t.note ? `DESCRIPTION:${e(t.note)}` : '',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(t.title || 'Task due')}`, `TRIGGER:${hours > 0 ? `-PT${hours}H` : `PT${-hours}H`}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

/* ---------- list ---------- */
function renderTodos() {
  const el = $('#todos');
  if (!el) return;
  const items = state.todos.filter(inCat);
  const open = items.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt);
  const done = items.filter(t => t.done);
  const folder = state.folder && state.folders.find(f => f.id === state.folder);
  const scope = folder ? folder.name : state.cat === 'all' ? '' : catName(state.cat);

  if (!items.length) {
    el.innerHTML = `<div class="empty"><b>No tasks${scope ? ` in ${esc(scope)}` : ''} yet</b>Tap + below to add ${scope ? 'one here' : 'your first task'}.</div>`;
    return;
  }
  const pct = Math.round(items.reduce((n, t) => n + todoPct(t), 0) / items.length);
  const late = open.filter(t => t.due && daysUntil(t.due) < 0).length;
  const soon = open.filter(isSoon).length - late;
  let html = `<section class="progress-card c-${state.cat}">
      <div class="pc-head"><span>${scope ? `${esc(scope)} progress` : 'Overall progress'}</span><b>${pct}%</b></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      <small>${done.length} of ${plural(items.length, 'task')} done${late ? ` · <span class="late">${late} overdue</span>` : ''}${soon ? ` · <span class="soon">${soon} due soon</span>` : ''}</small>
    </section>`;
  html += open.length ? open.map(todoRow).join('') : `<div class="empty compact"><b>Everything here is done</b></div>`;
  if (done.length) html += `<button class="done-toggle" data-act="nav" data-section="done">${I.back}<span>See ${plural(done.length, 'finished task')} in Done</span></button>`;
  el.innerHTML = html;
}

/* ---------- done list ---------- */
const doneDay = t => ymd(new Date(t.doneAt || t.updatedAt));
function dayLabel(ds) {
  const d = daysUntil(ds);
  return d === 0 ? 'Today' : d === -1 ? 'Yesterday' : fmtDate(ds);
}

function renderDone() {
  const el = $('#done');
  if (!el) return;
  const items = state.todos.filter(t => t.done && inCat(t)).sort((a, b) => (b.doneAt || b.updatedAt) - (a.doneAt || a.updatedAt));
  const week = items.filter(t => daysUntil(doneDay(t)) > -7).length;
  const cat = state.cat === 'all' ? 'life' : state.cat;
  let html = `<form id="done-form" class="step-add done-add c-${cat}">
      <input id="done-new" placeholder="Something you got done" maxlength="120" enterkeyhint="done" autocomplete="off" aria-label="Something you got done">
      <button class="icon-btn" aria-label="Add to the Done list">${I.plus}</button>
    </form>`;
  if (!items.length) {
    html += `<div class="empty"><b>Nothing here yet</b>Tasks you tick off in To Do land here. You can also write down anything else you got done, big or small.</div>`;
  } else {
    html += `<section class="progress-card"><div class="pc-head"><span>Done in the last 7 days</span><b>${week}</b></div>
      <small>${plural(items.length, 'thing')} done in total${state.cat === 'all' && !state.folder ? '' : ' here'}</small></section>`;
    let day = '';
    for (const t of items) {
      const d = doneDay(t);
      if (d !== day) { day = d; html += `<h2 class="month">${dayLabel(d)}</h2>`; }
      html += todoRow(t);
    }
  }
  el.innerHTML = html;
  $('#done-form').addEventListener('submit', async e => {
    e.preventDefault();
    const title = $('#done-new').value.trim();
    if (!title) return;
    const now = Date.now();
    const t = { id: uid(), title, note: '', cat, folder: state.folder, due: '', done: true, doneAt: now, steps: [], createdAt: now, updatedAt: now };
    await dbPut('todos', t);
    state.todos.push(t);
    renderDone();
    $('#done-new').focus();
  });
}

function todoRow(t) {
  const n = t.steps.length, k = t.steps.filter(s => s.done).length;
  const meta = [
    n ? `<span>${k}/${n} steps</span>` : '',
    t.due ? `<span class="${dueClass(t)}">${t.done ? `Due ${fmtShort(t.due)}` : dueText(t)}</span>` : '',
    tagHTML(t),
  ].join('');
  return `<article class="todo c-${catOf(t)} ${t.done ? 'done' : ''}">
    <button class="check ${t.done ? 'on' : ''}" data-act="todo-toggle" data-id="${t.id}" role="checkbox" aria-checked="${!!t.done}" aria-label="Done: ${esc(t.title)}">${I.tick}</button>
    <div class="body" data-act="todo-open" data-id="${t.id}" role="button" tabindex="0">
      <h3>${esc(t.title) || 'Untitled task'}</h3>
      ${n && !t.done ? `<div class="bar sm"><i style="width:${todoPct(t)}%"></i></div>` : ''}
      ${meta ? `<div class="meta">${meta}</div>` : ''}
    </div></article>`;
}

// Ticking a task off also ticks all of its sub-steps.
function setTaskDone(t, done) {
  setTaskDoneOnly(t, done);
  if (done) t.steps.forEach(s => { s.done = true; });
}
function setTaskDoneOnly(t, done) { t.done = done; t.doneAt = done ? Date.now() : 0; }

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
      <button class="icon-btn" data-act="back" aria-label="Back">${I.back}</button>
      <span id="saved" class="saved"></span>
      <button class="icon-btn danger" data-act="del-task" aria-label="Delete this task">${I.trash}</button>
    </header>
    <main class="editor">
      <input id="t-title" class="e-title" placeholder="What needs to be done?" maxlength="120" value="${esc(t.title)}">
      <div id="picker">${pickerHTML(t)}</div>
      <div class="row due-row">
        <label class="date-pick">${I.cal}<span id="due-label"></span>
          <input type="date" id="t-due" value="${t.due}" aria-label="Due date"></label>
        <button class="link" id="due-clear" data-act="due-clear">Clear</button>
        <button class="link" id="due-cal" data-act="due-cal">Add to Calendar</button>
      </div>
      <div id="t-progress"></div>
      <h2 class="sub">Steps</h2>
      <div id="steps"></div>
      <form id="step-form" class="step-add">
        <input id="step-new" placeholder="Add a step" maxlength="120" enterkeyhint="done" autocomplete="off" aria-label="New step">
        <button class="icon-btn" aria-label="Add step">${I.plus}</button>
      </form>
      <h2 class="sub">Notes</h2>
      <textarea id="t-note" class="note" placeholder="More details">${esc(t.note)}</textarea>
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
    if (t.done) setTaskDoneOnly(t, false); // a new step on a finished task reopens it
    inp.value = ''; inp.focus();
    renderSteps(); renderDue(); scheduleTaskSave();
  });
  renderDue();
  renderSteps();
  if (!state.taskSaved) $('#t-title').focus();
}

function renderDue() {
  const t = state.task;
  const label = $('#due-label');
  const when = t.due && parseDate(t.due).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
  label.textContent = !t.due ? 'Set a due date' : t.done ? `Due ${when}` : daysUntil(t.due) > 7 || daysUntil(t.due) < 0 ? `${daysUntil(t.due) < 0 ? 'Overdue' : 'Due'} ${when}` : `${dueText(t)} (${fmtShort(t.due)})`;
  label.className = t.due ? dueClass(t) : '';
  $('#due-clear').hidden = $('#due-cal').hidden = !t.due;
}

function renderSteps() {
  const t = state.task;
  const n = t.steps.length, k = t.steps.filter(s => s.done).length, pct = todoPct(t);
  $('#t-progress').innerHTML = `<section class="progress-card c-${catOf(t)}">
      <div class="pc-head"><span>${n ? `${k} of ${plural(n, 'step')} done` : 'Progress'}</span><b>${pct}%</b></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      <button class="mark-done ${t.done ? 'on' : ''}" data-act="task-done" role="checkbox" aria-checked="${!!t.done}">
        <span class="check ${t.done ? 'on' : ''}">${I.tick}</span>${t.done ? 'This task is done' : 'Mark this task as done'}</button>
    </section>`;
  $('#steps').className = `c-${catOf(t)}`;
  $('#steps').innerHTML = t.steps.map(s => `<div class="step ${s.done ? 'done' : ''}">
      <button class="check ${s.done ? 'on' : ''}" data-act="step-toggle" data-id="${s.id}" role="checkbox" aria-checked="${s.done}" aria-label="${esc(s.text)}">${I.tick}</button>
      <span data-act="step-toggle" data-id="${s.id}">${esc(s.text)}</span>
      <button class="icon-btn x" data-act="step-del" data-id="${s.id}" aria-label="Remove step">${I.close}</button>
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
  if (s) s.textContent = 'Saved';
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

/* ---------- actions (merged into the actions table in app.js) ---------- */
const todoActions = {
  nav: el => { state.section = el.dataset.section; state.day = null; renderHome(); window.scrollTo(0, 0); },
  'new-task': () => {
    const now = Date.now();
    openTask({ id: uid(), title: '', note: '', cat: state.cat === 'all' ? 'life' : state.cat, folder: state.folder, due: '', done: false, doneAt: 0, steps: [], createdAt: now, updatedAt: now }, false);
  },
  'todo-open': el => { const t = state.todos.find(x => x.id === el.dataset.id); if (t) openTask(t, true); },
  'todo-toggle': async el => {
    const t = state.todos.find(x => x.id === el.dataset.id);
    if (!t) return;
    setTaskDone(t, !t.done);
    t.updatedAt = Date.now();
    await dbPut('todos', t);
    renderHome();
    toast(t.done ? 'Moved to your Done list' : 'Moved back to To Do');
  },
  'due-clear': () => { state.task.due = ''; $('#t-due').value = ''; renderDue(); scheduleTaskSave(); },
  'due-cal': () => {
    const t = state.task;
    if (t.due) saveOut(new Blob([taskICS(t)], { type: 'text/calendar' }), 'task.ics');
  },
  'task-done': () => { const t = state.task; setTaskDone(t, !t.done); renderSteps(); renderDue(); scheduleTaskSave(); },
  'step-toggle': el => {
    const t = state.task, s = t.steps.find(x => x.id === el.dataset.id);
    if (!s) return;
    s.done = !s.done;
    setTaskDoneOnly(t, t.steps.every(x => x.done)); // all steps ticked = task done
    renderSteps(); renderDue(); scheduleTaskSave();
  },
  'step-del': el => {
    const t = state.task;
    t.steps = t.steps.filter(x => x.id !== el.dataset.id);
    if (t.steps.length && !t.done && t.steps.every(x => x.done)) setTaskDoneOnly(t, true);
    renderSteps(); renderDue(); scheduleTaskSave();
  },
  'del-task': async () => {
    const t = state.task;
    if (state.taskSaved) {
      if (!await ask('Delete this task?', t.title || 'This task and all of its steps will be permanently deleted.', 'Delete')) return;
      clearTimeout(taskTimer); taskTimer = null;
      await removeTask(t);
    }
    state.task = null;
    history.back();
  },
};

// Validates a task read from storage or from a backup file.
function cleanTodo(t) {
  if (!t?.id) return null;
  return {
    id: String(t.id), title: String(t.title || ''), note: String(t.note || ''), cat: catOf(t), folder: String(t.folder || ''),
    due: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : '', done: !!t.done, doneAt: +t.doneAt || 0,
    steps: (Array.isArray(t.steps) ? t.steps : []).filter(s => s?.id).map(s => ({ id: String(s.id), text: String(s.text || ''), done: !!s.done })),
    createdAt: +t.createdAt || Date.now(), updatedAt: +t.updatedAt || Date.now(),
  };
}
