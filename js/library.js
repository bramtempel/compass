// library.js — the full-note library (library.json), decoupled from the AI index.
// Joins to search results by NORMALIZED path (D12).

function normPath(p) { return (p || '').replace(/\\/g, '/').toLowerCase(); }

let _byPath = new Map();   // normalized path -> library note
let _list = [];            // all notes, for Browse

export function setLibrary(libraryData) {
  _byPath = new Map();
  _list = (libraryData && libraryData.notes) ? libraryData.notes : [];
  for (const n of _list) _byPath.set(normPath(n.path), n);
}

export function libraryCount() { return _list.length; }
export function allNotes() { return _list; }

// Full note for a search-result/index note (by path). Falls back to the index note itself.
export function fullNote(indexNote) {
  const hit = _byPath.get(normPath(indexNote.path));
  if (hit) return { ...indexNote, body: hit.body, folder: hit.folder, created: hit.created, modified: hit.modified, _full: true };
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
