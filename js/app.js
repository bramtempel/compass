// app.js — boots Compass and wires the modules together.

import { K, cfg, isConfigured } from './config.js';
import { idbDel } from './db.js';
import { getAccessToken, driveUpload, cachedToken } from './drive.js';
import { loadModel, embedText, modelReady } from './embed.js';
import { search } from './search.js';
import { setLibrary, libraryCount, fullNote, allNotes, folders, notesIn, noteByHash } from './library.js';
import { isPinned, togglePin, pinnedHashes, recentHashes, pushRecent } from './browse.js';
import { loadCaptures, addCapture, searchCaptures, recent, count as capCount, clearCaptures } from './captures.js';
import { setSuggestions, suggestionFor, getCachedBespoke, setCachedBespoke } from './suggestions.js';
import { setLabels, labelFor } from './labels.js';
import { getBespoke } from './bespoke.js';
import { loadCached, syncFromDrive } from './sync.js';
import { setImageManifest, hasManifest, hydrate as hydrateImages } from './images.js';
import { initMerge, openMerge } from './merge.js';
import { $, el, esc, showScreen, renderMarkdown, setImagesHosted, folderFromPath, relativeTime, highlight, snippet } from './ui.js';

// ── state ──
let index = null;        // index.json
let vectors = null;      // Float32Array
let thought = '';        // current captured text
let results = [];        // current related results (enriched)

function applyData(d) {
  index = d.index; vectors = d.vectors;
  setSuggestions(d.suggestions); setLibrary(d.library);
  setImageManifest(d.images); setImagesHosted(hasManifest());
  setLabels(d.labels);
  buildThemes();
}

// ── splash / sync indicator ──
const setSplash = (msg, pct) => { $('splash-msg').textContent = msg; if (pct != null) $('splash-fill').style.width = pct + '%'; };
const hideSplash = () => $('splash').classList.add('hidden');
const syncPill = on => $('sync-pill').classList.toggle('on', on);

// ── enrich a search result with full library body/folder ──
const enrich = r => ({ ...fullNote(r), score: r.score, _local: r._local });

// ── Capture screen ──
const capInput = $('capture-input'), capBtn = $('capture-btn'), charCount = $('char-count');

function refreshCaptureBtn() {
  const hasText = capInput.value.trim().length > 0;
  capBtn.disabled = !hasText || !modelReady();
  capBtn.textContent = modelReady() ? 'Find related' : 'Loading model…';
}
capInput.addEventListener('input', () => {
  const n = capInput.value.length;
  charCount.textContent = `${n} character${n === 1 ? '' : 's'}`;
  refreshCaptureBtn();
});
capBtn.addEventListener('click', () => {
  if (modelReady()) return doCapture();
  if (!modelLoading) loadModelFlow();          // failed/idle → retry the download
});

let modelLoading = false;
const mb = n => (n / 1048576).toFixed(1);
async function loadModelFlow() {
  modelLoading = true;
  capBtn.disabled = true; capBtn.textContent = 'Loading model…';
  const status = $('model-status');
  status.classList.remove('err');
  status.textContent = 'Starting model download (first time only, ~130 MB)…';
  let lastLogged = 0;
  try {
    await loadModel(p => {
      if (p.total) {
        status.textContent = `Downloading model… ${mb(p.loaded)} / ${mb(p.total)} MB (${p.pct}%)`;
        capBtn.textContent = `Loading model ${p.pct}%`;
        if (p.pct >= lastLogged + 5) { lastLogged = p.pct; console.log(`[model] ${p.pct}% — ${mb(p.loaded)}/${mb(p.total)} MB`); }
      } else {
        status.textContent = `Preparing model… (${p.status}${p.file ? ': ' + p.file : ''})`;
        console.log('[model]', p.status, p.file || '');
      }
    });
    modelLoading = false;
    status.textContent = '';
    console.log('[model] ready');
    refreshCaptureBtn();
  } catch (e) {
    modelLoading = false;
    capBtn.disabled = false;
    capBtn.textContent = 'Model failed — tap to retry';
    status.classList.add('err');
    status.textContent = 'Model failed: ' + (e?.message || e) + ' — tap the button to retry';
    console.warn('[model] load failed:', e);
  }
}

function renderRecent() {
  const list = $('recent-list');
  list.innerHTML = '';
  const items = recent(5);
  if (!items.length) { list.appendChild(el('div', 'empty-hint', 'Thoughts you capture show up here.')); return; }
  for (const c of items) {
    const row = el('div', 'recent-card');
    row.innerHTML = `<span class="recent-title">${esc(c.title)}</span><span class="recent-date">${esc(relativeTime(new Date(c.ts).toISOString()))}</span>`;
    row.addEventListener('click', () => openReadSheet({ title: c.title, body: c.body, path: 'local capture', folder: 'capture' }));
    list.appendChild(row);
  }
}

async function doCapture() {
  const text = capInput.value.trim();
  if (!text) return;
  capBtn.disabled = true; capBtn.textContent = 'Embedding…';
  try {
    const q = await embedText(text);
    const raw = search(q, vectors, index.notes, searchCaptures(), 8);
    thought = text;
    results = raw.map(enrich);
    renderRelated();
    showScreen('screen-related');
    await addCapture(text, q);
    renderRecent();
    saveToInbox(text);            // fire-and-forget, only if a Drive token is active
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    refreshCaptureBtn();
  }
}

function saveToInbox(text) {
  const token = cachedToken();
  const folderId = cfg(K.INBOX_ID);
  if (!token || !folderId) return;
  const now = new Date().toISOString();
  driveUpload(`${Date.now()}.md`, folderId, `---\ndate: ${now}\ncreated: ${now}\n---\n\n${text}`, token)
    .catch(() => {});
}

// ── Related screen ──
function renderRelated() {
  const c = $('related-content');
  c.innerHTML = '';
  c.appendChild(el('div', 'thought-recap', thought));

  const top = results[0];
  if (top && top.cluster_label) {
    const row = el('div');
    row.innerHTML = `<span class="pill pill-accent">◉ ${esc(top.cluster_label)}</span>`;
    c.appendChild(row);
  }

  c.appendChild(el('div', 'section-label', `Related notes · ${results.length} found offline`));
  selected = new Set(); updateFloat();
  results.forEach((r, i) => c.appendChild(noteCard(r, i)));

  const sugg = top ? suggestionFor(top.cluster_id) : null;
  if (sugg) {
    const block = el('div', 'sugg-block');
    block.innerHTML = `<div class="sugg-head"><span class="x">Cluster suggestion</span><span class="pill pill-muted">offline · instant</span></div><div class="sugg-body">${renderMarkdown(sugg)}</div>`;
    c.appendChild(block);
  }

  if (cfg(K.API_KEY)) {
    const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    const btn = el('button', 'btn-secondary', 'Find the most relevant passages');
    btn.addEventListener('click', () => { showScreen('screen-bespoke'); renderBespoke(); });
    wrap.appendChild(btn);
    wrap.appendChild(el('p', 'caveat', 'sends this note + context to the API · only on tap'));
    c.appendChild(wrap);
  }
}

let selected = new Set();

function noteCard(r, idx) {
  const card = el('div', 'note-card' + (r._local ? ' local' : ''));
  const folder = r.folder || folderFromPath(r.path) || '';
  const snippet = (r.body || '').slice(0, 200).trim();
  card.innerHTML = `
    <div class="note-card-top">
      <span class="card-check">✓</span>
      <span class="note-title">${esc(r.title)}</span>
      <span class="note-score">${(r.score * 100).toFixed(0)}%</span>
    </div>
    ${snippet ? `<div class="note-snippet">${esc(snippet)}</div>` : ''}
    <div class="note-card-bottom"><span class="folder-tag">${esc(r._local ? '✦ your capture' : folder)}</span><button class="merge-btn">Merge</button></div>`;
  card.querySelector('.card-check').addEventListener('click', e => { e.stopPropagation(); toggleSelect(idx, card); });
  card.querySelector('.merge-btn').addEventListener('click', e => { e.stopPropagation(); openMerge([results[idx]], thought, mergeSaved); });
  card.addEventListener('click', () => openReadSheet(r));
  return card;
}

function toggleSelect(idx, card) {
  if (selected.has(idx)) { selected.delete(idx); card.classList.remove('sel'); }
  else { selected.add(idx); card.classList.add('sel'); }
  updateFloat();
}
function updateFloat() {
  const n = selected.size;
  $('float-wrap').classList.toggle('on', n > 0);
  $('float-merge').textContent = `Merge selected (${n})`;
}
async function mergeSaved({ body }) {
  try { const q = await embedText(body); await addCapture(body, q); renderRecent(); } catch {}
}

// ── Bespoke screen ──
async function renderBespoke() {
  const c = $('bespoke-content');
  c.innerHTML = '';
  c.appendChild(el('div', 'thought-recap', thought));

  const cached = await getCachedBespoke(thought);
  if (cached) return paintPassages(c, cached);

  const loading = el('div', 'loading-state');
  loading.innerHTML = `<div class="spinner"></div><div class="loading-label">Reading your notes…</div>`;
  c.appendChild(loading);
  try {
    const passages = await getBespoke(thought, results);
    await setCachedBespoke(thought, passages);
    loading.remove();
    paintPassages(c, passages);
  } catch (e) {
    loading.remove();
    const err = el('div', 'card');
    err.innerHTML = `<p class="err-text">Couldn't reach the API: ${esc(e.message)}</p>`;
    const retry = el('button', 'btn-secondary', 'Try again');
    retry.addEventListener('click', renderBespoke);
    err.appendChild(retry); c.appendChild(err);
  }
}

function paintPassages(c, passages) {
  c.appendChild(el('div', 'section-label', 'Most relevant passages'));
  if (!passages.length) { c.appendChild(el('p', 'empty-hint', 'Nothing stood out as directly relevant.')); return; }
  for (const p of passages) {
    const card = el('div', 'bespoke-card');
    card.innerHTML = `<div class="bespoke-card-top"><span class="bespoke-card-title">${esc(p.title || '')}</span></div>
      <div class="bespoke-excerpt">${esc(p.excerpt || '')}</div>
      ${p.folder ? `<div><span class="folder-tag">${esc(p.folder)}</span></div>` : ''}`;
    c.appendChild(card);
  }
}

// ── Browse screen ──
let browseFolder = null;        // null = All Notes
let browseSort = 'modified';    // 'modified' | 'created' | 'title'
let browseSearchAll = false;    // while searching: ignore the folder scope
let browseTheme = null;         // active cluster label, or null
let themesOpen = false;         // theme chip strip expanded?
let browseObserver = null;      // incremental-reveal IntersectionObserver
const BROWSE_CHUNK = 60;
const DAY = 86400000;

// Themes are read-only from the AI index (cluster_label, joined by path — D10/D12).
let themeByPath = new Map();    // normalized path -> cluster_label
let themeList = [];             // [{label, short, count}] substantial themes only
const normP = p => (p || '').replace(/\\/g, '/').toLowerCase();

function buildThemes() {
  themeByPath = new Map();
  themeList = [];
  // Prefer the readable cluster name (cluster_labels.json); fall back to the raw keyword label.
  if (index && index.notes) for (const n of index.notes) {
    const lbl = labelFor(n.cluster_id) || n.cluster_label;
    if (lbl) themeByPath.set(normP(n.path), lbl);
  }
  const counts = new Map();
  for (const n of allNotes()) {
    const lbl = themeByPath.get(normP(n.path));
    if (lbl) counts.set(lbl, (counts.get(lbl) || 0) + 1);
  }
  themeList = [...counts.entries()]
    .filter(([, c]) => c >= 3)                  // skip orphans / tiny clusters — too noisy
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count, short: label.split(' · ').slice(0, 2).join(' · ') }));
}
const themeOf = path => themeByPath.get(normP(path)) || null;
function notesInTheme(label, q) {
  const t = (q || '').trim().toLowerCase();
  return allNotes().filter(n => themeOf(n.path) === label &&
    (!t || (n.title || '').toLowerCase().includes(t) || (n.body || '').toLowerCase().includes(t)));
}

function renderFolderChips() {
  const bar = $('browse-folders');
  bar.innerHTML = '';
  const mk = (name, count, value) => {
    const c = el('button', 'folder-chip' + (browseFolder === value && !browseTheme ? ' active' : ''));
    c.innerHTML = `${esc(name)} <span class="n">${count}</span>`;
    c.addEventListener('click', () => {
      browseFolder = value; browseTheme = null; browseSearchAll = false;
      renderBrowse($('browse-search').value);
    });
    return c;
  };
  bar.appendChild(mk('All Notes', allNotes().length, null));
  for (const f of folders()) bar.appendChild(mk(f.name, f.count, f.name));
}

function renderThemeChips() {
  const bar = $('browse-themes');
  bar.hidden = !themesOpen;
  bar.innerHTML = '';
  if (!themesOpen) return;
  if (!themeList.length) { bar.appendChild(el('div', 'themes-empty', 'No themes yet — sync your notes.')); return; }
  for (const t of themeList) {
    const c = el('button', 'theme-chip' + (browseTheme === t.label ? ' active' : ''));
    c.title = t.label;
    c.innerHTML = `${esc(t.short)} <span class="n">${t.count}</span>`;
    c.addEventListener('click', () => {
      browseTheme = (browseTheme === t.label) ? null : t.label;   // toggle off if re-clicked
      renderBrowse($('browse-search').value);
    });
    bar.appendChild(c);
  }
}

// Bucket a note for the current sort: date buckets for date sorts, first letter for title.
function bucketOf(n) {
  if (browseSort === 'title') {
    const ch = (n.title || '').trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(ch) ? ch : '#';
  }
  const t = Date.parse(browseSort === 'created' ? n.created : n.modified);
  if (isNaN(t)) return 'Undated';
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const d = Math.floor((startToday.getTime() - t) / DAY);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d <= 7) return 'Previous 7 days';
  if (d <= 30) return 'Previous 30 days';
  return 'Older';
}

function sortNotes(list) {
  const key = browseSort === 'created' ? 'created' : 'modified';
  return [...list].sort((a, b) =>
    browseSort === 'title'
      ? (a.title || '').localeCompare(b.title || '')
      : (Date.parse(b[key]) || 0) - (Date.parse(a[key]) || 0));
}

function browseRow(n, query) {
  const row = el('div', 'browse-row');
  const date = relativeTime(browseSort === 'created' ? n.created : n.modified);
  const pin = isPinned(n.hash) ? '<span class="row-pin">★</span> ' : '';
  row.innerHTML =
    `<div class="browse-row-top"><span class="t">${pin}${highlight(n.title, query)}</span>` +
    (date ? `<span class="d">${esc(date)}</span>` : '') + '</div>' +
    `<span class="s">${highlight(snippet(n.body, query), query)}</span>` +
    (n.folder ? `<div class="browse-row-foot"><span class="folder-tag">${esc(n.folder)}</span></div>` : '');
  row.addEventListener('click', () => openReadSheet(n));
  return row;
}

// Scope hint: while searching inside a folder, offer to widen to all notes (and back).
function renderScopeHint(query) {
  const hint = $('browse-scope');
  if (!query || !browseFolder) { hint.textContent = ''; return; }
  if (browseSearchAll) {
    hint.innerHTML = `All notes · <button class="link-btn" id="scope-folder">only ${esc(browseFolder)}</button>`;
    $('scope-folder').addEventListener('click', () => { browseSearchAll = false; renderBrowse(query); });
  } else {
    hint.innerHTML = `In <b>${esc(browseFolder)}</b> · <button class="link-btn" id="scope-all">search all notes</button>`;
    $('scope-all').addEventListener('click', () => { browseSearchAll = true; renderBrowse(query); });
  }
}

function renderBrowse(query = '') {
  renderFolderChips();
  renderThemeChips();
  renderScopeHint(query);
  const list = $('browse-list');
  list.innerHTML = '';
  if (browseObserver) { browseObserver.disconnect(); browseObserver = null; }

  const notes = browseTheme
    ? sortNotes(notesInTheme(browseTheme, query))
    : sortNotes(notesIn((query && browseSearchAll) ? null : browseFolder, query));
  $('browse-count').textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
  if (!notes.length) {
    list.appendChild(el('div', 'browse-empty', query ? 'No notes match your search.' : 'No notes here.'));
    return;
  }

  const queue = [];
  const shown = new Set();   // hashes surfaced in Pinned/Recent, so they aren't repeated below

  // Quick-access Pinned + Recent, only on the "home" view (no search / folder / theme).
  if (!query && browseFolder == null && !browseTheme) {
    const pins = pinnedHashes().map(noteByHash).filter(Boolean);
    if (pins.length) {
      queue.push({ header: 'Pinned' });
      for (const n of pins) { queue.push({ note: n }); shown.add(n.hash); }
    }
    const recents = recentHashes().map(noteByHash).filter(n => n && !shown.has(n.hash)).slice(0, 6);
    if (recents.length) {
      queue.push({ header: 'Recent' });
      for (const n of recents) { queue.push({ note: n }); shown.add(n.hash); }
    }
  }

  // Main list, grouped into buckets driven by the sort (dates, or first letter for Title).
  let last = null;
  for (const n of notes) {
    if (shown.has(n.hash)) continue;
    const b = bucketOf(n);
    if (b !== last) { queue.push({ header: b }); last = b; }
    queue.push({ note: n });
  }

  // Reveal in chunks as the sentinel scrolls into view — keeps 764+ notes smooth.
  let i = 0;
  const sentinel = el('div', 'browse-sentinel');
  const renderChunk = () => {
    const frag = document.createDocumentFragment();
    let added = 0;
    while (i < queue.length && added < BROWSE_CHUNK) {
      const item = queue[i++];
      if (item.header) frag.appendChild(el('div', 'browse-group-label', item.header));
      else { frag.appendChild(browseRow(item.note, query)); added++; }
    }
    list.insertBefore(frag, sentinel);
    if (i >= queue.length) {
      if (browseObserver) { browseObserver.disconnect(); browseObserver = null; }
      sentinel.remove();
    }
  };
  list.appendChild(sentinel);
  browseObserver = new IntersectionObserver(
    entries => { if (entries.some(e => e.isIntersecting)) renderChunk(); },
    { rootMargin: '300px' });
  browseObserver.observe(sentinel);
  renderChunk();
}
$('browse-search').addEventListener('input', e => {
  if (!e.target.value.trim()) browseSearchAll = false;   // reset widen-scope when search clears
  renderBrowse(e.target.value);
});
$('browse-sort').addEventListener('change', e => { browseSort = e.target.value; renderBrowse($('browse-search').value); });
$('themes-toggle').addEventListener('click', () => {
  themesOpen = !themesOpen;
  const t = $('themes-toggle');
  t.setAttribute('aria-expanded', String(themesOpen));
  t.classList.toggle('open', themesOpen);
  if (!themesOpen) browseTheme = null;   // collapsing clears the theme filter
  renderBrowse($('browse-search').value);
});
$('open-browse').addEventListener('click', () => { renderBrowse($('browse-search').value); showScreen('screen-browse'); });
$('float-merge').addEventListener('click', () => {
  const ns = [...selected].map(i => results[i]).filter(Boolean);
  if (ns.length) openMerge(ns, thought, mergeSaved);
});

// ── Read sheet ──
let sheetHash = null;
function updateSheetPin() {
  const btn = $('sheet-pin');
  btn.style.display = sheetHash ? '' : 'none';
  const on = isPinned(sheetHash);
  btn.textContent = on ? '★' : '☆';
  btn.classList.toggle('on', on);
  btn.title = on ? 'Unpin' : 'Pin';
}
function openReadSheet(note) {
  const full = note.body !== undefined && note._full === undefined ? note : fullNote(note);
  $('sheet-folder').textContent = full.folder || folderFromPath(full.path) || '';
  $('sheet-title').textContent = full.title || 'Untitled';
  $('sheet-meta').textContent = full.modified ? relativeTime(full.modified) : '';
  $('sheet-text').innerHTML = renderMarkdown(full.body || '(no body)');
  sheetHash = full.hash || null;
  updateSheetPin();
  if (sheetHash) pushRecent(sheetHash);
  $('read-sheet').classList.add('open');
  if (hasManifest()) hydrateImages($('sheet-text'), cachedToken());
}
$('sheet-pin').addEventListener('click', () => {
  if (!sheetHash) return;
  togglePin(sheetHash);
  updateSheetPin();
  if ($('screen-browse').classList.contains('active')) renderBrowse($('browse-search').value);
});
function closeSheet() {
  $('read-sheet').classList.remove('open');
  // keep Browse's Recent/Pinned/stars current after viewing a note
  if ($('screen-browse').classList.contains('active')) renderBrowse($('browse-search').value);
}
$('sheet-close').addEventListener('click', closeSheet);
$('read-sheet').addEventListener('click', e => { if (e.target.id === 'read-sheet') closeSheet(); });

// ── back buttons ──
document.querySelectorAll('[data-back]').forEach(b =>
  b.addEventListener('click', () => showScreen(b.dataset.back)));

// ── Settings ──
const sFields = { 's-api-key': K.API_KEY, 's-worker-url': K.WORKER_URL, 's-library-id': K.LIBRARY_ID,
  's-images-id': K.IMAGES_MANIFEST_ID, 's-labels-id': K.LABELS_ID,
  's-index-id': K.INDEX_ID, 's-vectors-id': K.VECTORS_ID, 's-suggestions-id': K.SUGGESTIONS_ID,
  's-inbox-id': K.INBOX_ID, 's-client-id': K.CLIENT_ID };
function openSettings() {
  for (const [id, key] of Object.entries(sFields)) $(id).value = cfg(key);
  $('s-cap-count').textContent = capCount();
  $('s-status').textContent = '';
  $('settings-overlay').classList.add('open');
}
$('open-settings').addEventListener('click', openSettings);
$('s-close').addEventListener('click', () => $('settings-overlay').classList.remove('open'));
$('s-save').addEventListener('click', () => {
  for (const [id, key] of Object.entries(sFields)) cfg(key, $(id).value.trim());
  $('settings-overlay').classList.remove('open');
});
$('s-resync').addEventListener('click', async () => {
  $('s-status').textContent = 'Authenticating…';
  try { const token = await getAccessToken(); await doSync(token); $('s-status').textContent = `Synced — ${index.notes.length} notes, ${libraryCount()} in library`; }
  catch (e) { $('s-status').textContent = 'Error: ' + e.message; }
});
$('s-clear-captures').addEventListener('click', async () => {
  if (!capCount() || !confirm(`Clear ${capCount()} local capture(s)? Your notes on Drive are untouched.`)) return;
  await clearCaptures(); $('s-cap-count').textContent = '0'; renderRecent();
});

// ── Setup (first run) ──
$('setup-connect').addEventListener('click', async () => {
  const key = $('setup-api-key').value.trim();
  if (key) cfg(K.API_KEY, key);
  $('setup-err').style.display = 'none';
  const btn = $('setup-connect'); btn.disabled = true; btn.textContent = 'Connecting…';
  try {
    const token = await getAccessToken(true);
    $('setup-status').textContent = 'Downloading…';
    await doSync(token);
    await enterApp();
  } catch (e) {
    $('setup-err').textContent = e.message; $('setup-err').style.display = 'block';
  } finally { btn.disabled = false; btn.textContent = 'Connect Drive & download'; }
});

// ── sync helpers ──
async function doSync(token) {
  syncPill(true);
  try {
    const data = await syncFromDrive(token, (stage, pct) => setSplash(`Syncing ${stage}…`, pct));
    applyData(data);
  } finally { syncPill(false); }
}

async function backgroundSync() {
  // best-effort silent refresh on open; never blocks the UI, never forces a popup loop
  syncPill(true);
  try {
    const token = await Promise.race([
      getAccessToken(false),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
    ]);
    const data = await syncFromDrive(token);
    applyData(data);
    if ($('screen-browse').classList.contains('active')) renderBrowse($('browse-search').value);
    renderRecent();
  } catch { /* stay on cached data */ }
  finally { syncPill(false); }
}

// ── enter app ──
async function enterApp() {
  showScreen('screen-capture');
  hideSplash();
  renderRecent();
  refreshCaptureBtn();
  // model download was already kicked off in boot()
}

// ── boot ──
async function boot() {
  if ('serviceWorker' in navigator) {
    // Whether a SW already controls this page (false on a first-ever load / after a cache clear).
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
      // Actively check for a new SW: on boot, whenever the tab regains focus, and hourly —
      // so a long-open or installed PWA picks up deploys without a manual cache clear.
      const check = () => reg.update().catch(() => {});
      check();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      setInterval(check, 60 * 60 * 1000);
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return;   // skip the one-time claim on a fresh load
      reloaded = true; location.reload();        // a new SW took over -> run fresh code
    });
  }
  initMerge();
  loadModelFlow();                       // start the ~120MB model download immediately, in parallel
  setSplash('Loading cached notes…', 15);
  await loadCaptures();
  const cached = await loadCached();
  if (cached) {
    applyData(cached);
    setSplash('Ready', 100);
    await enterApp();
    backgroundSync();                    // refresh in the background
  } else if (isConfigured()) {
    // configured but nothing cached yet — needs a user gesture to OAuth
    hideSplash(); showScreen('screen-setup');
  } else {
    hideSplash(); showScreen('screen-setup');
  }
}

boot();
