'use strict';
/* ================= Today page: question of the day, on this day, gratitude jar =================
   Loaded before app.js. This file only defines functions; they use the shared
   globals from app.js (state, I, $, ...) when they are called.
   An answer: { id: 'YYYY-MM-DD', text, updatedAt }   (one per day)
   A gratitude note: { id, date, text, createdAt } */

// One question per calendar day. The same question comes back on the same date every year.
const QUESTIONS = [
  [ // January
    'What do you most want from this year?', 'What is one habit you want to keep?', 'What are you looking forward to right now?',
    'What did you learn about yourself last year?', 'What would make this month a good one?', 'What are you putting off that would take ten minutes?',
    'Who do you want to spend more time with?', 'What does a good ordinary day look like for you?', 'What skill do you want to be better at by December?',
    'What is worrying you most right now?', 'What is working well in your life at the moment?', 'What would you try this year if you knew you could not fail?',
    'What is one thing you should stop doing?', 'Where do you feel most like yourself?', 'What did you do today that your future self will thank you for?',
    'What are you saying yes to too often?', 'What is the best money decision you made recently?', 'What small thing made you smile today?',
    'What are you avoiding thinking about?', 'What would you tell a friend who was in your position?', 'What is one thing you want to finish this month?',
    'How is your energy lately, and why?', 'What are you curious about right now?', 'What rule do you live by?',
    'What was the hardest part of today?', 'What do you want more of in your days?', 'What do you want less of in your days?',
    'Who helped you recently, and how?', 'What is one risk worth taking this year?', 'What did this month teach you?',
    'What are you proud of from this month?',
  ],
  [ // February
    'What does being healthy mean to you right now?', 'Who do you love, and do they know it?', 'What is the kindest thing someone did for you lately?',
    'What do you need to forgive yourself for?', 'How did you sleep this week, and what affected it?', 'What makes you feel cared for?',
    'What is one thing your body is asking for?', 'Who would you like to thank today?', 'What conversation do you need to have?',
    'What do you admire in the people closest to you?', 'When did you last feel completely relaxed?', 'What food made you happy recently?',
    'What do you bring to your friendships?', 'What does love look like in your daily life?', 'What is a memory with someone that you treasure?',
    'What boundary do you need to set?', 'How do you usually show people you care?', 'What made you feel strong recently?',
    'Who do you miss?', 'What is one small thing you can do for your health tomorrow?', 'What are you grateful to your family for?',
    'When do you feel lonely, and what helps?', 'What compliment do you still remember?', 'What did you do for someone else this week?',
    'What stresses you that you could simply let go of?', 'How do you rest when you are tired?', 'What would you like to hear from someone today?',
    'What did this month teach you about the people in your life?', 'What would you do with one extra day every year?',
  ],
  [ // March
    'What do you want to learn this month?', 'What is the most useful thing you learned recently?', 'What mistake taught you the most?',
    'What are you better at than you were a year ago?', 'What book, video or talk changed how you think?', 'What question do you wish you had the answer to?',
    'What did you believe a year ago that you no longer believe?', 'What is hard for you that looks easy for others?', 'Whose work do you admire, and why?',
    'What would you study if you had a free year?', 'What feedback was hard to hear but true?', 'What are you practising at the moment?',
    'What do you do when you get stuck?', 'What is one thing you want to understand about money?', 'What is a skill you gave up on too early?',
    'What did you get wrong this week?', 'What do people often ask you for help with?', 'What new thing did you try lately?',
    'What would you teach if you had to give a class tomorrow?', 'What is changing around you right now?', 'What are you a beginner at?',
    'What advice do you keep giving but not following?', 'What habit of thinking holds you back?', 'When did you last change your mind?',
    'What are you pretending not to know?', 'What small improvement would make your days easier?', 'What do you want to remember from this week?',
    'What do you do well without trying?', 'What are you learning the slow way?', 'What did this month teach you about learning?',
    'What do you want to carry into the next three months?',
  ],
  [ // April
    'What made you laugh recently?', 'What does your ideal work day look like?', 'What part of your work do you enjoy most?',
    'What task gives you energy, and which one drains you?', 'What are you building right now?', 'What would you work on even if nobody paid you?',
    'What is the most important thing on your list this week?', 'What are you busy with that does not really matter?', 'Where did your time go today?',
    'What would you do with two extra hours a day?', 'What is a project you are excited about?', 'What is blocking you, and who could help?',
    'What did you finish recently that felt good?', 'What do you want to be known for?', 'When are you most focused during the day?',
    'What distracts you most?', 'What is one thing you can hand off or drop?', 'What does success look like this year?',
    'What did you create this week?', 'What would make your work easier to enjoy?', 'What is a decision you have been delaying?',
    'Which of your goals still matters, and which does not?', 'What are you doing just because you always have?', 'What is the next small step on your biggest goal?',
    'What idea keeps coming back to you?', 'What would you start if you had the courage?', 'What went better than expected lately?',
    'What do you need to say no to?', 'How do you want to feel at the end of a work day?', 'What did this month teach you about how you work?',
  ],
  [ // May
    'What is your relationship with money right now?', 'What purchase made your life better?', 'What purchase do you regret?',
    'What does enough look like for you?', 'What are you saving for?', 'What is your biggest financial worry?',
    'What investing lesson did you learn the hard way?', 'What would you do if money were not a concern?', 'What is one expense you could cut without missing it?',
    'When did patience pay off for you?', 'What decision did you rush, and what happened?', 'How do you decide when to take a risk?',
    'What is a loss that taught you something?', 'What do you spend money on that is truly worth it?', 'What is one rule you follow with money?',
    'When did you last act out of fear, and how did it go?', 'When did you last act out of greed, and how did it go?', 'What would financial freedom let you do?',
    'What plan did you stick to when it was hard?', 'What plan did you abandon too soon?', 'What are you sure about that might be wrong?',
    'How do you feel when you check your accounts?', 'What is the best free thing in your life?', 'What did you do today that had nothing to do with money?',
    'Who taught you about money, and what did they teach?', 'What is a goal you can measure this year?', 'What would you tell yourself five years ago about investing?',
    'What are you waiting for?', 'What is a good decision you made that had a bad result?', 'What is a bad decision you made that had a good result?',
    'What did this month teach you about risk?',
  ],
  [ // June
    'Half the year is nearly gone. What are you proud of so far?', 'What do you want the second half of the year to be about?', 'What goal should you drop?',
    'What surprised you this year?', 'What has changed in you since January?', 'What are you still carrying that you should put down?',
    'What is your favourite memory of this year so far?', 'What does your home say about you?', 'What place do you want to visit?',
    'What do you love about where you live?', 'What would you change about your daily routine?', 'What do you do first thing in the morning, and does it serve you?',
    'What do you do last thing at night?', 'What makes a day feel wasted?', 'What makes a day feel well spent?',
    'What are you doing too much of?', 'What simple pleasure did you enjoy today?', 'What does rest mean to you?',
    'When were you last bored, and what did you do?', 'What is something you own that you love?', 'What could you give away?',
    'What is your favourite time of day?', 'What sound, smell or taste takes you back?', 'What would a perfect weekend look like?',
    'What do you do just for fun?', 'What did you notice today that you usually miss?', 'What is the best thing about this season?',
    'What do you want to remember about this time of your life?', 'What are you grateful for at the halfway point?', 'What did the first half of the year teach you?',
  ],
  [ // July
    'What are you afraid of?', 'What would you do if you were braver?', 'What fear turned out to be nothing?',
    'What is the bravest thing you have done?', 'What do you do when you feel overwhelmed?', 'What is something difficult you got through?',
    'What makes you angry, and what is underneath it?', 'What are you envious of, and what does it tell you?', 'When did you last cry, and why?',
    'What do you do with sadness?', 'What do you need to hear when things go wrong?', 'What calms you down?',
    'What do you worry about that is out of your control?', 'What is in your control today?', 'What would you do differently if nobody was watching?',
    'Whose opinion matters too much to you?', 'What are you hiding from others?', 'What do you criticise yourself for?',
    'What would it mean to be kind to yourself today?', 'What is the worst that could really happen?', 'What discomfort are you avoiding that would help you grow?',
    'When did you feel proud of how you handled something?', 'What pressure are you putting on yourself?', 'What do you need a break from?',
    'What did you survive that you thought you could not?', 'What makes you feel safe?', 'What do you do when you fail?',
    'What is a hard truth you have accepted?', 'What would you ask for if you were not afraid of a no?', 'What gives you courage?',
    'What did this month teach you about your feelings?',
  ],
  [ // August
    'What did you love doing as a child?', 'Who were you ten years ago?', 'What would your younger self think of you now?',
    'What is your earliest happy memory?', 'What did your parents get right?', 'What do you wish you had known at eighteen?',
    'Which teacher or mentor shaped you?', 'What is a turning point in your life?', 'What did you want to be when you grew up?',
    'What is a choice you are glad you made?', 'What is a choice you would make differently?', 'What tradition do you want to keep?',
    'What story does your family tell about you?', 'What place from your past do you miss?', 'What friendship changed you?',
    'What did you lose that you still think about?', 'What is the best gift you ever received?', 'What song takes you back, and to where?',
    'What were you doing this time last year?', 'What is something you used to love and stopped doing?', 'What are you nostalgic for?',
    'What part of your past are you at peace with?', 'What part of your past still hurts?', 'What did a hard time give you?',
    'What do you owe to luck?', 'Who believed in you before you did?', 'What would you thank your past self for?',
    'What chapter of your life are you in now?', 'What title would you give this year of your life?', 'What from the past do you want to pass on?',
    'What did this month remind you of?',
  ],
  [ // September
    'What story do you want to tell?', 'What inspires you right now?', 'What idea are you excited about?',
    'What did you make recently that you like?', 'Where do your best ideas come from?', 'What would you create with unlimited time?',
    'What are you a fan of at the moment?', 'What character in a story is most like you?', 'What makes a story stay with you?',
    'What do you find beautiful?', 'What do you want people to feel from your work?', 'What is your creative routine?',
    'What stops you from starting?', 'What is something you made that surprised you?', 'What would you make if nobody ever saw it?',
    'Who do you make things for?', 'What message do you keep coming back to?', 'What did you watch or read lately that moved you?',
    'What is the best lesson a story ever taught you?', 'What is a small idea you could finish this week?', 'What are you copying, and what is truly yours?',
    'What feedback improved your work?', 'What would you like to be asked about?', 'What is unfinished that deserves finishing?',
    'What do you want to experiment with?', 'What made you say "I wish I had made that"?', 'What is your favourite thing you have ever made?',
    'What does your audience teach you?', 'What do you want to make next?', 'What did this month teach you about creating?',
  ],
  [ // October
    'What do you value most in life?', 'What does a meaningful life look like to you?', 'What are you living for right now?',
    'What principle would you never break?', 'What do you want to be remembered for?', 'What do your actions say you care about?',
    'Where are your values and your calendar out of step?', 'What does freedom mean to you?', 'What does success mean to you now?',
    'What is the difference between what you want and what you need?', 'What would you fight for?', 'What do you believe that most people do not?',
    'What is a promise you made to yourself?', 'What makes a person good?', 'Who do you want to become?',
    'What are you doing out of duty, and what out of love?', 'What do you take for granted?', 'What would you keep if you lost everything else?',
    'What kind of friend do you want to be?', 'What does being honest cost you?', 'What are you willing to be bad at for a while?',
    'What gives your days meaning?', 'What does "enough" look like in your life?', 'What would you do with one year left?',
    'What is a belief you inherited and never checked?', 'What are you responsible for?', 'What do you want to give to the world?',
    'What is your definition of a good day?', 'When do you feel most alive?', 'What scared you this year, and what did you do?',
    'What did this month teach you about what matters?',
  ],
  [ // November
    'What are you grateful for today?', 'Who are you grateful for, and why?', 'What difficulty are you now thankful for?',
    'What do you have now that you once wished for?', 'What part of your health are you thankful for?', 'What ordinary thing would you miss if it were gone?',
    'What did someone teach you that you still use?', 'What made today better than yesterday?', 'What is something beautiful you saw this week?',
    'What comfort do you enjoy every day?', 'Who made your life easier recently?', 'What skill are you glad you have?',
    'What is one good thing that happened today?', 'What about your work are you thankful for?', 'What technology are you glad exists?',
    'What did you receive that you did not earn?', 'What kindness did you witness?', 'What about yourself are you thankful for?',
    'What place are you thankful for?', 'What freedom do you enjoy?', 'What problem do you no longer have?',
    'What food are you thankful for today?', 'Who would you write a thank-you letter to?', 'What made you feel lucky recently?',
    'What mistake are you grateful you made?', 'What do you appreciate about this time of year?', 'What is the best thing about your life right now?',
    'What did you enjoy today that cost nothing?', 'How can you show your thanks to someone this week?', 'What did this month teach you about gratitude?',
  ],
  [ // December
    'What was the best day of this year?', 'What was the hardest day of this year?', 'What did you achieve that you are proud of?',
    'What did you not get done, and does it still matter?', 'Who mattered most to you this year?', 'What did you learn this year?',
    'What would you do differently if you could repeat this year?', 'What was the best decision you made this year?', 'What was the worst decision, and what did it teach you?',
    'What surprised you about yourself this year?', 'What did you spend too much time on?', 'What did you spend too little time on?',
    'What book, film or song defined your year?', 'What new thing did you start this year?', 'What did you let go of this year?',
    'How did your health change this year?', 'How did your finances change this year?', 'How did your relationships change this year?',
    'What was your favourite thing you made this year?', 'What moment do you want to remember forever?', 'What are you ready to leave behind?',
    'What do you want to thank this year for?', 'Who do you want to be next year?', 'What is one word for this year?',
    'What gift would you most like to give?', 'What does the coming year need from you?', 'What goal is worth committing to next year?',
    'What will you do more of next year?', 'What will you do less of next year?', 'What would you tell yourself one year ago?',
    'What do you hope to write here one year from today?',
  ],
];
const questionFor = date => { const [, m, d] = date.split('-').map(Number); return QUESTIONS[m - 1][d - 1]; };

/* ---------- answers ---------- */
let answerTimer = null, answerDraft = null;

function scheduleAnswerSave(rec) {
  answerDraft = rec;
  clearTimeout(answerTimer);
  answerTimer = setTimeout(saveAnswer, 400);
}

// An answer that is emptied again is removed, so blank days are not stored.
async function saveAnswer() {
  clearTimeout(answerTimer); answerTimer = null;
  const a = answerDraft;
  if (!a) return;
  answerDraft = null;
  a.updatedAt = Date.now();
  const i = state.answers.indexOf(a), filled = !!a.text.trim();
  if (filled) { await dbPut('answers', a); if (i < 0) state.answers.push(a); }
  else { await dbDel('answers', a.id); if (i >= 0) state.answers.splice(i, 1); }
  const s = $('#q-saved');
  if (s) s.textContent = filled ? 'Saved' : '';
}

/* ---------- on this day ---------- */
// Diary entries written one month, six months and whole years before the given day.
function memories(day) {
  const d0 = parseDate(day), spots = [];
  for (const n of [1, 6]) {
    const d = new Date(d0.getFullYear(), d0.getMonth() - n, d0.getDate());
    if (d.getDate() === d0.getDate()) spots.push([n === 1 ? '1 month ago' : `${n} months ago`, ymd(d)]); // skips e.g. 31 -> a 30-day month
  }
  const years = [...new Set(state.entries.filter(e => e.date < day && e.date.slice(5) === day.slice(5)).map(e => e.date))].sort().reverse();
  for (const ds of years) spots.push([`${plural(d0.getFullYear() - +ds.slice(0, 4), 'year')} ago`, ds]);
  return spots.map(([label, date]) => ({ label, date, items: state.entries.filter(e => e.date === date) })).filter(g => g.items.length);
}

/* ---------- page ---------- */
const fmtLong = s => parseDate(s).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

function gratRow(g, withDate) {
  return `<div class="grat"><span>${esc(g.text)}${withDate ? `<small>${fmtLong(g.date)}</small>` : ''}</span>
    <button class="icon-btn x" data-act="grat-del" data-id="${g.id}" aria-label="Remove this note">${I.close}</button></div>`;
}

function renderToday() {
  const el = $('#today');
  if (!el) return;
  const day = today();
  const rec = (answerDraft?.id === day && answerDraft) || state.answers.find(a => a.id === day) || { id: day, text: '', updatedAt: 0 };
  const past = state.answers.filter(a => a.id !== day && a.id.slice(5) === day.slice(5)).sort((a, b) => b.id.localeCompare(a.id));
  const mem = memories(day);
  const mine = state.grats.filter(g => g.date === day).sort((a, b) => a.createdAt - b.createdAt);
  const all = [...state.grats].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  el.innerHTML = `
    <p class="today-date">${fmtDate(day)}</p>

    <section class="panel">
      <div class="panel-head"><h2>Question of the day</h2><span id="q-saved" class="saved"></span></div>
      <p class="question">${esc(questionFor(day))}</p>
      <textarea id="q-answer" class="note" placeholder="Your answer for today" aria-label="Your answer">${esc(rec.text)}</textarea>
      ${past.length ? past.map(a => `<div class="past"><b>${a.id.slice(0, 4)}</b><p>${esc(a.text)}</p></div>`).join('')
        : `<p class="hint">This question comes back on this date every year, with your earlier answers next to it.</p>`}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>On this day</h2></div>
      ${mem.length ? mem.map(g => `<h3 class="mem-label">${g.label} <span>${fmtLong(g.date)}</span></h3>${g.items.map(card).join('')}`).join('')
        : `<p class="hint">Nothing from this date yet. Diary entries come back here one month, six months and every year after you write them.</p>`}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Gratitude jar</h2><span class="saved">${state.grats.length ? plural(state.grats.length, 'note') : ''}</span></div>
      ${mine.map(g => gratRow(g)).join('')}
      <form id="grat-form" class="step-add">
        <input id="grat-new" placeholder="${mine.length ? 'Another good thing' : 'One good thing about today'}" maxlength="200" enterkeyhint="done" autocomplete="off" aria-label="Something you are grateful for">
        <button class="icon-btn" aria-label="Add to the jar">${I.plus}</button>
      </form>
      ${state.grats.length ? `<button class="btn ghost block jar-pick" data-act="grat-pick">Pick a note from the jar</button>
        <button class="done-toggle ${state.showJar ? 'open' : ''}" data-act="grat-all" aria-expanded="${state.showJar}">${I.back}<span>All notes (${state.grats.length})</span></button>
        ${state.showJar ? all.map(g => gratRow(g, true)).join('') : ''}`
        : `<p class="hint">Add one to three good things a day. On a bad day, pick a note at random.</p>`}
    </section>`;

  const ta = $('#q-answer');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  ta.addEventListener('input', () => { rec.text = ta.value; grow(); scheduleAnswerSave(rec); });
  grow();
  $('#grat-form').addEventListener('submit', async e => {
    e.preventDefault();
    const text = $('#grat-new').value.trim();
    if (!text) return;
    const g = { id: uid(), date: today(), text, createdAt: Date.now() };
    await dbPut('gratitude', g);
    state.grats.push(g);
    renderToday();
    $('#grat-new').focus();
  });
}

// Shows one random note. Notes from earlier days come first, so the jar feels like a surprise.
function pickGrat() {
  let last = null;
  const draw = () => {
    const pool = state.grats.filter(g => g !== last);
    const older = pool.filter(g => g.date !== today());
    const from = older.length ? older : pool.length ? pool : state.grats;
    return last = from[Math.floor(Math.random() * from.length)];
  };
  const body = g => `<div class="sheet jar-note"><p class="jar-text">${esc(g.text)}</p><p>${fmtDate(g.date)}</p>
    <div class="row end">${state.grats.length > 1 ? `<button class="btn ghost" data-v="again">Another</button>` : ''}<button class="btn" data-v="close">Close</button></div></div>`;
  const el = modal(body(draw()));
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (b?.dataset.v === 'again') el.innerHTML = body(draw());
    else if (b || e.target === el) el.remove();
  });
}

/* ---------- actions (merged into the actions table in app.js) ---------- */
const reflectActions = {
  'grat-pick': pickGrat,
  'grat-all': () => { state.showJar = !state.showJar; renderToday(); },
  'grat-del': async el => {
    const g = state.grats.find(x => x.id === el.dataset.id);
    if (!g || !await ask('Remove this note?', g.text, 'Remove')) return;
    await dbDel('gratitude', g.id);
    state.grats = state.grats.filter(x => x !== g);
    renderToday();
  },
};

// Validate records read from a backup file.
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
function cleanAnswer(a) {
  if (!isDay(a?.id) || !String(a.text || '').trim()) return null;
  return { id: a.id, text: String(a.text), updatedAt: +a.updatedAt || Date.now() };
}
function cleanGrat(g) {
  if (!g?.id || !isDay(g.date) || !String(g.text || '').trim()) return null;
  return { id: String(g.id), date: g.date, text: String(g.text).slice(0, 200), createdAt: +g.createdAt || Date.now() };
}
