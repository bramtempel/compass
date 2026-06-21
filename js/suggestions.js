// suggestions.js — cached per-cluster suggestions (offline) + persistence of generated
// bespoke results, keyed by capture content hash.

import { idbGet, idbSet } from './db.js';

let _map = null; // cluster_id -> suggestion text

export function setSuggestions(data) {
  if (!data) { _map = null; return; }
  _map = new Map();
  for (const entry of Object.values(data)) _map.set(entry.cluster_id, entry.suggestion);
}

export function suggestionFor(clusterId) {
  return (_map && clusterId != null) ? _map.get(clusterId) : null;
}

// Stable hash of a thought's text (for persisting bespoke results across visits).
export async function textHash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.trim()));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getCachedBespoke(text) {
  const all = (await idbGet('bespoke_cache')) || {};
  return all[await textHash(text)] || null;
}

export async function setCachedBespoke(text, data) {
  const all = (await idbGet('bespoke_cache')) || {};
  all[await textHash(text)] = data;
  await idbSet('bespoke_cache', all);
}
