// tags.js — curated tag system. State = a controlled vocabulary + per-note assignments,
// keyed by the library content hash (D7). The phone is the single writer: every mutation
// caches to IndexedDB immediately and schedules a debounced upload of tags.json to Drive.
// Decoupled artifact (D10/D11); falls back to local-only if Drive/auth is unavailable.

import { idbSet } from './db.js';

let _vocab = [];                 // ordered tag list (the curated "taglist")
let _byHash = new Map();         // hash -> Set<tag>
let _saver = null;               // async (jsonObject) => {}  registered by app.js for Drive
let _timer = null;

const norm = t => (t || '').trim().toLowerCase().replace(/\s+/g, '-');

export function setTags(data) {
  _vocab = (data && Array.isArray(data.vocab)) ? data.vocab.map(norm).filter(Boolean) : [];
  _byHash = new Map();
  const notes = (data && data.notes) || {};
  for (const [h, tags] of Object.entries(notes)) {
    const set = new Set((tags || []).map(norm).filter(Boolean));
    if (set.size) _byHash.set(h, set);
  }
  dedupeVocab();
}

function dedupeVocab() { _vocab = [...new Set(_vocab)]; }

export function serialize() {
  const notes = {};
  for (const [h, set] of _byHash) if (set.size) notes[h] = [..._vocab.filter(t => set.has(t)), ...[...set].filter(t => !_vocab.includes(t))];
  return { version: 1, vocab: _vocab.slice(), notes };
}

export function setTagSaver(fn) { _saver = fn; }

function touch() {
  const data = serialize();
  idbSet('tags', data).catch(() => {});
  if (!_saver) return;
  clearTimeout(_timer);
  _timer = setTimeout(() => { try { _saver(data); } catch {} }, 1500);
}

// ── reads ──
export function allTags() { return _vocab.slice(); }
export function tagsOf(hash) { return hash && _byHash.has(hash) ? [..._byHash.get(hash)] : []; }
export function hasTag(hash, tag) { return _byHash.has(hash) && _byHash.get(hash).has(norm(tag)); }
export function tagCounts() {
  const c = new Map(_vocab.map(t => [t, 0]));
  for (const set of _byHash.values()) for (const t of set) c.set(t, (c.get(t) || 0) + 1);
  return c;
}

// ── per-note mutations ──
export function addTag(hash, tag) {
  const t = norm(tag); if (!hash || !t) return;
  if (!_vocab.includes(t)) _vocab.push(t);
  if (!_byHash.has(hash)) _byHash.set(hash, new Set());
  _byHash.get(hash).add(t);
  touch();
}
export function removeTag(hash, tag) {
  const t = norm(tag); if (!_byHash.has(hash)) return;
  _byHash.get(hash).delete(t);
  if (!_byHash.get(hash).size) _byHash.delete(hash);
  touch();
}

// ── vocabulary curation ──
export function createTag(name) {
  const t = norm(name); if (!t || _vocab.includes(t)) return false;
  _vocab.push(t); touch(); return true;
}
export function deleteTag(name) {
  const t = norm(name);
  _vocab = _vocab.filter(x => x !== t);
  for (const set of _byHash.values()) set.delete(t);
  for (const [h, set] of [..._byHash]) if (!set.size) _byHash.delete(h);
  touch();
}
export function renameTag(oldName, newName) {
  const a = norm(oldName), b = norm(newName);
  if (!b || a === b) return;
  _vocab = _vocab.map(x => (x === a ? b : x));
  dedupeVocab();
  for (const set of _byHash.values()) if (set.delete(a)) set.add(b);
  touch();
}
export function mergeTag(from, into) {
  const a = norm(from), b = norm(into);
  if (!a || !b || a === b) return;
  if (!_vocab.includes(b)) _vocab.push(b);
  for (const set of _byHash.values()) if (set.delete(a)) set.add(b);
  _vocab = _vocab.filter(x => x !== a);
  touch();
}
