'use strict';
/* ================= Movies & Animation =================
   Loaded before app.js. This file only defines functions; they use the shared
   globals from app.js (state, I, $, ...) when they are called.
   A title: { id, kind: 'movie' | 'anime', title, genres: [names], rating: 0-5 in half steps (0 = not rated),
              status: 'done' | 'watching' | 'want', fav, date: day watched or '', text, createdAt, updatedAt }
   Its pictures are ordinary attachments (entryId = the title's id); the first picture is the poster.
   Genres the user adds are kept per kind in meta/genres: { movie: [], anime: [] }. */

const KINDS = [['movie', 'Movies', 'Movie'], ['anime', 'Anime', 'Anime']];
const GENRES = {
  movie: ['Action', 'Adventure', 'Comedy', 'Drama', 'Romance', 'Horror', 'Thriller', 'Mystery', 'Sci-Fi', 'Fantasy', 'Crime', 'Animation', 'Family', 'Musical', 'War', 'Documentary'],
  anime: ['Shounen', 'Seinen', 'Shoujo', 'Isekai', 'Slice of Life', 'Romance', 'Comedy', 'Action', 'Adventure', 'Fantasy', 'Sci-Fi', 'Mecha', 'Sports', 'Mystery', 'Horror', 'Psychological', 'Drama'],
};
const STATUSES = [['done', 'Watched'], ['watching', 'Watching'], ['want', 'Want to watch']];
const SORTS = [['date', 'Recently watched'], ['rating', 'Highest rated'], ['title', 'Title A to Z']];

let filmTimer = null;
const kindOf = f => (f.kind === 'anime' ? 'anime' : 'movie');
const genresFor = kind => [...GENRES[kind], ...state.genres[kind].filter(g => !GENRES[kind].includes(g))];
const posterOf = f => attsOf(f.id).find(a => a.thumb);
const fmtWatched = s => parseDate(s).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });

// Five stars, each filled 0%, 50% or 100%.
function starsHTML(r) {
  return `<span class="stars" role="img" aria-label="${r ? `${r} out of 5 stars` : 'Not rated'}">${[1, 2, 3, 4, 5].map(i => `<i style="--f:${Math.max(0, Math.min(1, r - i + 1)) * 100}%"></i>`).join('')}</span>`;
}

/* ---------- list ---------- */
function renderWatch() {
  const el = $('#watch');
  if (!el) return;
  const w = state.watch, all = state.films;
  const inKind = w.kind === 'all' ? all : all.filter(f => kindOf(f) === w.kind);
  // Only genres that are in use are offered as filters, most used first.
  const used = {};
  for (const f of inKind) for (const g of f.genres) used[g] = (used[g] || 0) + 1;
  const genres = Object.keys(used).sort((a, b) => used[b] - used[a] || a.localeCompare(b));
  if (w.genre && !used[w.genre]) w.genre = '';
  const chip = (act, v, label, on) => `<button data-act="${act}" data-v="${esc(v)}" class="${on ? 'on' : ''}">${label}</button>`;

  el.innerHTML = `
    <div class="search watch-search">${I.search}<input type="search" id="q-watch" placeholder="Search titles" autocomplete="off" value="${esc(w.q)}"></div>
    <nav class="tabs watch-tabs c-life" aria-label="Movies or anime">
      ${chip('watch-kind', 'all', `All <small>${all.length}</small>`, w.kind === 'all')}
      ${KINDS.map(k => chip('watch-kind', k[0], `${k[1]} <small>${all.filter(f => kindOf(f) === k[0]).length}</small>`, w.kind === k[0])).join('')}
    </nav>
    ${w.kind !== 'all' && genres.length ? `<nav class="tabs folders watch-tabs c-life" aria-label="Genres">
      ${chip('watch-genre', '', `All ${KINDS.find(k => k[0] === w.kind)[1].toLowerCase()}`, !w.genre)}
      ${genres.map(g => chip('watch-genre', g, `${esc(g)} <small>${used[g]}</small>`, w.genre === g)).join('')}
    </nav>` : ''}
    <nav class="tabs folders watch-tabs c-life" aria-label="Filters">
      ${chip('watch-status', '', 'Any status', !w.status)}
      ${STATUSES.map(s => chip('watch-status', s[0], s[1], w.status === s[0])).join('')}
      ${chip('watch-fav', '', `${I.heart}Favourites`, w.fav)}
    </nav>
    <div id="watch-grid"></div>`;
  $('#q-watch').addEventListener('input', e => { w.q = e.target.value; renderWatchGrid(); });
  renderWatchGrid();
}

function renderWatchGrid() {
  const el = $('#watch-grid');
  if (!el) return;
  const w = state.watch, q = w.q.trim().toLowerCase();
  let items = state.films.filter(f => (w.kind === 'all' || kindOf(f) === w.kind) && (!w.genre || f.genres.includes(w.genre))
    && (!w.status || f.status === w.status) && (!w.fav || f.fav)
    && (!q || (f.title + '\n' + f.text + '\n' + f.genres.join(' ')).toLowerCase().includes(q)));
  const by = {
    date: (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt,
    rating: (a, b) => b.rating - a.rating || a.title.localeCompare(b.title),
    title: (a, b) => a.title.localeCompare(b.title),
  };
  items = items.sort(by[w.sort] || by.date);
  if (!items.length) {
    el.innerHTML = state.films.length
      ? `<div class="empty"><b>Nothing matches</b>Try another filter or search.</div>`
      : `<div class="empty"><b>No titles yet</b>Tap + below to add the first movie or anime you watched.</div>`;
    return;
  }
  const rated = items.filter(f => f.rating);
  const avg = rated.length ? (rated.reduce((n, f) => n + f.rating, 0) / rated.length).toFixed(1) : '';
  el.innerHTML = `<div class="watch-bar"><span>${plural(items.length, 'title')}${avg ? ` · average ${avg} ★` : ''}</span>
      <select class="select" id="watch-sort" aria-label="Sort by">${SORTS.map(s => `<option value="${s[0]}" ${w.sort === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}</select></div>
    <div class="posters">${items.map(posterCard).join('')}</div>`;
  $('#watch-sort').addEventListener('change', e => { w.sort = e.target.value; renderWatchGrid(); });
}

function posterCard(f) {
  const p = posterOf(f), st = STATUSES.find(s => s[0] === f.status);
  return `<article class="poster" data-act="film-open" data-id="${f.id}" role="button" tabindex="0">
    <div class="poster-img">${p ? `<img src="${p.thumb}" alt="" loading="lazy">` : `<span>${I.film}</span>`}
      ${f.fav ? `<b class="fav" title="Favourite">${I.heart}</b>` : ''}
      ${f.status !== 'done' && st ? `<em>${st[1]}</em>` : ''}</div>
    <h3>${esc(f.title) || 'Untitled'}</h3>
    ${f.rating ? starsHTML(f.rating) : `<small>${state.watch.kind === 'all' ? KINDS.find(k => k[0] === kindOf(f))[2] : 'Not rated'}</small>`}
  </article>`;
}

/* ---------- editor ---------- */
function openFilm(film, saved) {
  state.film = film; state.filmSaved = saved; state.view = 'film';
  history.pushState({ v: 'film' }, '');
  render();
}

function renderFilm() {
  const f = state.film;
  app.innerHTML = `
    <header class="top">
      <button class="icon-btn" data-act="back" aria-label="Back">${I.back}</button>
      <span id="saved" class="saved"></span>
      <button class="icon-btn danger" data-act="del-film" aria-label="Delete this title">${I.trash}</button>
    </header>
    <main class="editor">
      <div id="f-kind"></div>
      <input id="f-title" class="e-title" placeholder="Title" maxlength="160" value="${esc(f.title)}">
      <div id="f-rate"></div>
      <div id="f-status"></div>
      <div class="row due-row">
        <label class="date-pick">${I.cal}<span id="f-date-label"></span>
          <input type="date" id="f-date" value="${f.date}" aria-label="Date watched"></label>
        <button class="link" id="f-date-clear" data-act="film-date-clear">Clear</button>
      </div>
      <h2 class="sub">Genres</h2>
      <div id="f-genres"></div>
      <h2 class="sub">Your thoughts</h2>
      <textarea id="f-text" class="note" placeholder="What did you think of it?">${esc(f.text)}</textarea>
      <h2 class="sub">Pictures</h2>
      <p class="hint">The first picture is used as the poster.</p>
      <div id="atts" class="atts"></div>
    </main>
    <footer class="toolbar">
      <button data-act="camera">${I.camera}<span>Take photo</span></button>
      <button data-act="gallery">${I.image}<span>Photo library</span></button>
    </footer>`;
  $('#f-title').addEventListener('input', e => { f.title = e.target.value; scheduleFilmSave(); });
  const ta = $('#f-text');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  ta.addEventListener('input', () => { f.text = ta.value; grow(); scheduleFilmSave(); });
  grow();
  const di = $('#f-date');
  di.addEventListener('click', () => { try { di.showPicker(); } catch { } });
  di.addEventListener('change', () => { f.date = di.value || ''; renderFilmParts(); scheduleFilmSave(); });
  renderFilmParts();
  renderAtts();
  if (!state.filmSaved) $('#f-title').focus();
}

// The parts of the editor that change when a button is tapped (typing fields are left alone).
function renderFilmParts() {
  const f = state.film, kind = kindOf(f);
  const btn = (act, v, label, on) => `<button data-act="${act}" data-v="${esc(v)}" class="${on ? 'on' : ''}" aria-pressed="${!!on}">${label}</button>`;
  $('#f-kind').innerHTML = `<div class="cats folders c-life" role="group" aria-label="Movie or anime">${KINDS.map(k => btn('film-kind', k[0], k[2], kind === k[0])).join('')}</div>`;
  $('#f-rate').innerHTML = `<div class="rate" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map(i => `<span class="rate-star"><i style="--f:${Math.max(0, Math.min(1, f.rating - i + 1)) * 100}%"></i>
      <button data-act="film-rate" data-v="${i - 0.5}" aria-label="${i - 0.5} stars"></button><button data-act="film-rate" data-v="${i}" aria-label="${plural(i, 'star')}"></button></span>`).join('')}
    <b>${f.rating ? `${f.rating} / 5` : 'Tap to rate'}</b></div>`;
  $('#f-status').innerHTML = `<div class="cats folders c-life" role="group" aria-label="Status">${STATUSES.map(s => btn('film-status', s[0], s[1], f.status === s[0])).join('')}
    ${btn('film-fav', '', `${I.heart}Favourite`, f.fav)}</div>`;
  $('#f-date-label').textContent = f.date ? `Watched ${fmtWatched(f.date)}` : 'Set the date watched';
  $('#f-date-clear').hidden = !f.date;
  // Genres already on the title stay visible even if they are not in this kind's list.
  const list = [...genresFor(kind), ...f.genres.filter(g => !genresFor(kind).includes(g))];
  $('#f-genres').innerHTML = `<div class="cats folders c-life" role="group" aria-label="Genres">${list.map(g => btn('film-genre', g, esc(g), f.genres.includes(g))).join('')}
    <button data-act="film-genre-new" class="add">${I.plus}New genre</button></div>`;
}

function scheduleFilmSave() {
  clearTimeout(filmTimer);
  filmTimer = setTimeout(saveFilm, 400);
}

async function saveFilm() {
  clearTimeout(filmTimer); filmTimer = null;
  const f = state.film;
  if (!f) return;
  f.updatedAt = Date.now();
  await dbPut('watch', f);
  if (!state.filmSaved) { state.films.push(f); state.filmSaved = true; }
  const s = $('#saved');
  if (s) s.textContent = 'Saved';
}

async function removeFilm(f) {
  for (const a of attsOf(f.id)) { await dbDel('attachments', a.id); await dbDel('blobs', a.id); }
  state.atts = state.atts.filter(a => a.entryId !== f.id);
  await dbDel('watch', f.id);
  state.films = state.films.filter(x => x !== f);
}

async function leaveFilm() {
  const f = state.film;
  if (!f) return;
  if (filmTimer) await saveFilm();
  const empty = !f.title.trim() && !f.text.trim() && !f.rating && !f.genres.length && !attsOf(f.id).length;
  if (empty && state.filmSaved) await removeFilm(f);
  state.film = null;
}

/* ---------- actions (merged into the actions table in app.js) ---------- */
const filmChanged = () => { renderFilmParts(); scheduleFilmSave(); };
const watchActions = {
  'watch-kind': el => { state.watch.kind = el.dataset.v; state.watch.genre = ''; renderWatch(); },
  'watch-genre': el => { state.watch.genre = el.dataset.v; renderWatch(); },
  'watch-status': el => { state.watch.status = el.dataset.v; renderWatch(); },
  'watch-fav': () => { state.watch.fav = !state.watch.fav; renderWatch(); },
  'film-new': () => {
    const now = Date.now(), w = state.watch;
    openFilm({ id: uid(), kind: w.kind === 'anime' ? 'anime' : 'movie', title: '', genres: w.genre ? [w.genre] : [], rating: 0,
      status: w.status || 'done', fav: false, date: w.status === 'want' ? '' : today(), text: '', createdAt: now, updatedAt: now }, false);
  },
  'film-open': el => { const f = state.films.find(x => x.id === el.dataset.id); if (f) openFilm(f, true); },
  'film-kind': el => {
    const f = state.film;
    if (kindOf(f) === el.dataset.v) return;
    f.kind = el.dataset.v;
    f.genres = f.genres.filter(g => genresFor(f.kind).includes(g)); // genres belong to one kind
    filmChanged();
  },
  'film-rate': el => { const f = state.film, v = +el.dataset.v; f.rating = f.rating === v ? 0 : v; filmChanged(); }, // tap the same value again to clear
  'film-status': el => {
    const f = state.film;
    f.status = el.dataset.v;
    if (f.status === 'want') f.date = ''; else if (!f.date) f.date = today();
    $('#f-date').value = f.date;
    filmChanged();
  },
  'film-fav': () => { state.film.fav = !state.film.fav; filmChanged(); },
  'film-genre': el => {
    const f = state.film, g = el.dataset.v;
    f.genres = f.genres.includes(g) ? f.genres.filter(x => x !== g) : [...f.genres, g];
    filmChanged();
  },
  'film-genre-new': async () => {
    const f = state.film, kind = kindOf(f);
    const name = await askText(`New ${kind} genre`, '', 'Genre name');
    if (!name) return;
    const g = genresFor(kind).find(x => x.toLowerCase() === name.toLowerCase()) || name;
    if (!genresFor(kind).includes(g)) { state.genres[kind].push(g); await dbPut('meta', state.genres, 'genres'); }
    if (!f.genres.includes(g)) f.genres.push(g);
    filmChanged();
  },
  'film-date-clear': () => { state.film.date = ''; $('#f-date').value = ''; filmChanged(); },
  'del-film': async () => {
    const f = state.film;
    if (state.filmSaved) {
      if (!await ask('Delete this title?', `${f.title || 'This title'}, its notes and pictures will be permanently deleted.`, 'Delete')) return;
      clearTimeout(filmTimer); filmTimer = null;
      await removeFilm(f);
    }
    state.film = null;
    history.back();
  },
};

// Validates a title read from storage or from a backup file.
function cleanFilm(f) {
  if (!f?.id) return null;
  const rating = Math.round((+f.rating || 0) * 2) / 2;
  return {
    id: String(f.id), kind: kindOf(f), title: String(f.title || ''),
    genres: (Array.isArray(f.genres) ? f.genres : []).map(g => String(g).trim().slice(0, 40)).filter(Boolean),
    rating: Math.max(0, Math.min(5, rating)), status: STATUSES.some(s => s[0] === f.status) ? f.status : 'done', fav: !!f.fav,
    date: /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? f.date : '', text: String(f.text || ''),
    createdAt: +f.createdAt || Date.now(), updatedAt: +f.updatedAt || Date.now(),
  };
}
function cleanGenres(g) {
  const list = v => [...new Set((Array.isArray(v) ? v : []).map(x => String(x).trim().slice(0, 40)).filter(Boolean))];
  return { movie: list(g?.movie), anime: list(g?.anime) };
}
