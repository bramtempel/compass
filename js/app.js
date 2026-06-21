// app.js — boots Compass and wires the modules together.

import { K, cfg, isConfigured } from './config.js';
import { idbDel } from './db.js';
import { getAccessToken, driveUpload, cachedToken } from './drive.js';
import { loadModel, embedText, modelReady } from './embed.js';
import { search } from './search.js';
import { setLibrary, libraryCount, fullNote, filterNotes } from './library.js';
import { loadCaptures, addCapture, searchCaptures, recent, count as capCount, clearCaptures } from './captures.js';
import { setSuggestions, suggestionFor, getCachedBespoke, setCachedBespoke } from './suggestions.js';
import { getBespoke } from './bespoke.js';
import { loadCached, syncFromDrive } from './sync.js';
import { setImageManifest, hasManifest, hydrate as hydrateImages } from './images.js';
import { initMerge, openMerge } from './merge.js';
import { $, el, esc, showScreen, renderMarkdown, setImagesHosted, folderFromPath, relativeTime } from './ui.js';

// ── state ──
let index = null;        // index.json
let vectors = null;      // Float32Array
let thought = '';        // current captured text
let results = [];        // current related results (enriched)

function applyData(d) {
  index = d.index; vectors = d.vectors;
  setSuggestions(d.suggestions); setLibrary(d.library);
  setImageManifest(d.images); setImagesHosted(hasManifest());
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
async function loadModelFlow() {
  modelLoading = true;
  capBtn.disabled = true; capBtn.textContent = 'Loading model…';
  try {
    await loadModel(p => { if (p.total) capBtn.textContent = `Loading model ${Math.round(100 * p.loaded / p.total)}%`; });
    modelLoading = false;
    refreshCaptureBtn();
  } catch (e) {
    modelLoading = false;
    capBtn.disabled = false;
    capBtn.textContent = 'Model failed — tap to retry';
    console.warn('model load failed:', e);
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
function renderBrowse(query = '') {
  const list = $('browse-list');
  list.innerHTML = '';
  const notes = filterNotes(query);
  $('browse-count').textContent = `${notes.length} notes`;
  // group by folder
  const groups = {};
  for (const n of notes) (groups[n.folder || 'Other'] ??= []).push(n);
  for (const folder of Object.keys(groups).sort()) {
    list.appendChild(el('div', 'browse-group-label', folder || 'Other'));
    for (const n of groups[folder].slice(0, query ? 9999 : 200)) {
      const row = el('div', 'browse-row');
      row.innerHTML = `<span class="t">${esc(n.title)}</span><span class="s">${esc((n.body || '').slice(0, 120))}</span>`;
      row.addEventListener('click', () => openReadSheet(n));
      list.appendChild(row);
    }
  }
}
$('browse-search').addEventListener('input', e => renderBrowse(e.target.value));
$('open-browse').addEventListener('click', () => { renderBrowse($('browse-search').value); showScreen('screen-browse'); });
$('float-merge').addEventListener('click', () => {
  const ns = [...selected].map(i => results[i]).filter(Boolean);
  if (ns.length) openMerge(ns, thought, mergeSaved);
});

// ── Read sheet ──
function openReadSheet(note) {
  const full = note.body !== undefined && note._full === undefined ? note : fullNote(note);
  $('sheet-folder').textContent = full.folder || folderFromPath(full.path) || '';
  $('sheet-title').textContent = full.title || 'Untitled';
  $('sheet-meta').textContent = full.modified ? relativeTime(full.modified) : '';
  $('sheet-text').innerHTML = renderMarkdown(full.body || '(no body)');
  $('read-sheet').classList.add('open');
  if (hasManifest()) hydrateImages($('sheet-text'), cachedToken());
}
$('sheet-close').addEventListener('click', () => $('read-sheet').classList.remove('open'));
$('read-sheet').addEventListener('click', e => { if (e.target.id === 'read-sheet') $('read-sheet').classList.remove('open'); });

// ── back buttons ──
document.querySelectorAll('[data-back]').forEach(b =>
  b.addEventListener('click', () => showScreen(b.dataset.back)));

// ── Settings ──
const sFields = { 's-api-key': K.API_KEY, 's-worker-url': K.WORKER_URL, 's-library-id': K.LIBRARY_ID,
  's-images-id': K.IMAGES_MANIFEST_ID,
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
  if (!modelReady()) loadModelFlow();
}

// ── boot ──
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  initMerge();
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
