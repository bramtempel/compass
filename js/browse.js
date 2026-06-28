// browse.js — persisted user signals for Browse: pinned notes + recently viewed.
// Keyed on the note's stable content hash (library.json `hash`), per D7 — never cluster id.
// Pure localStorage; no DOM, no app-data dependencies (D11: one concern per file).

const PINS_KEY = 'compass.pins';
const RECENTS_KEY = 'compass.recents';
const RECENTS_MAX = 24;

const load = (k, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fallback; }
  catch { return fallback; }
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let _pins = new Set(load(PINS_KEY, []));
let _recents = load(RECENTS_KEY, []);   // hashes, most-recent first

export function isPinned(hash) { return !!hash && _pins.has(hash); }
export function pinnedHashes() { return [..._pins]; }
export function togglePin(hash) {
  if (!hash) return false;
  if (_pins.has(hash)) _pins.delete(hash); else _pins.add(hash);
  save(PINS_KEY, [..._pins]);
  return _pins.has(hash);
}

export function recentHashes() { return _recents.slice(); }
export function pushRecent(hash) {
  if (!hash) return;
  _recents = [hash, ..._recents.filter(h => h !== hash)].slice(0, RECENTS_MAX);
  save(RECENTS_KEY, _recents);
}
