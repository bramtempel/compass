// library.js — the full-note library (library.json), decoupled from the AI index.
// Joins to search results by NORMALIZED path (D12).

function normPath(p) { return (p || '').replace(/\\/g, '/').toLowerCase(); }

let _byPath = new Map();   // normalized path -> library note
let _byHash = new Map();   // stable content hash -> library note (for pins/recents, D7)
let _list = [];            // all notes, for Browse

export function setLibrary(libraryData) {
  _byPath = new Map();
  _byHash = new Map();
  _list = (libraryData && libraryData.notes) ? libraryData.notes : [];
  for (const n of _list) { _byPath.set(normPath(n.path), n); if (n.hash) _byHash.set(n.hash, n); }
}

export function libraryCount() { return _list.length; }
export function allNotes() { return _list; }
export function noteByHash(hash) { return _byHash.get(hash) || null; }

// Full note for a search-result/index note (by path). Falls back to the index note itself.
export function fullNote(indexNote) {
  const hit = _byPath.get(normPath(indexNote.path));
  if (hit) return { ...indexNote, hash: hit.hash, body: hit.body, folder: hit.folder, created: hit.created, modified: hit.modified, _full: true };
  return { ...indexNote, _full: false };
}

export function fullBody(path) {
  const hit = _byPath.get(normPath(path));
  return hit ? hit.body : null;
}

// Simple client-side text filter for Browse.
export function filterNotes(q) {
  const t = q.trim().toLowerCase();
  if (!t) return _list;
  return _list.filter(n =>
    (n.title || '').toLowerCase().includes(t) || (n.body || '').toLowerCase().includes(t));
}

// Folders with note counts, alphabetical — for Browse navigation ("All Notes" is the caller's job).
export function folders() {
  const counts = new Map();
  for (const n of _list) {
    const f = n.folder || 'Other';
    counts.set(f, (counts.get(f) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

// Notes scoped to a folder (null/'' = all), optionally text-filtered. No cap.
export function notesIn(folder, q) {
  let list = folder ? _list.filter(n => (n.folder || 'Other') === folder) : _list;
  const t = (q || '').trim().toLowerCase();
  if (t) list = list.filter(n =>
    (n.title || '').toLowerCase().includes(t) || (n.body || '').toLowerCase().includes(t));
  return list;
}
