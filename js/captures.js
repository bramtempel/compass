// captures.js — optimistic local captures: a thought you just wrote joins future
// searches immediately, before the laptop folds it into the canonical index.

import { idbGet, idbSet } from './db.js';

let captures = []; // [{ ts, text, title, body, vec:number[], vector:Float32Array }]

export async function loadCaptures() {
  const stored = (await idbGet('local_captures')) || [];
  captures = stored.map(c => ({ ...c, vector: Float32Array.from(c.vec) }));
}

async function persist() {
  await idbSet('local_captures',
    captures.map(({ ts, text, title, body, vec }) => ({ ts, text, title, body, vec })));
}

export async function addCapture(text, vector) {
  const trimmed = text.trim();
  if (trimmed.length < 15) return;                                  // skip throwaway searches
  if (captures.some(c => c.text.trim() === trimmed)) return;        // dedup re-searches
  const title = trimmed.split('\n')[0].slice(0, 80);
  captures.push({ ts: Date.now(), text: trimmed, title, body: trimmed.slice(0, 4000),
                  vec: Array.from(vector), vector });
  await persist();
}

// shape used by search(): {vector, note}
export function searchCaptures() {
  return captures.map(c => ({
    vector: c.vector,
    note: { id: 'local-' + c.ts, path: 'local capture', title: c.title, body: c.body,
            folder: 'capture', cluster_id: null, cluster_label: '', _local: true },
  }));
}

export function recent(n = 5) {
  return [...captures].sort((a, b) => b.ts - a.ts).slice(0, n);
}

export function count() { return captures.length; }

export async function clearCaptures() { captures = []; await persist(); }
