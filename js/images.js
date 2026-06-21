// images.js — note images hosted on Drive (decoupled). Resolves a note's image
// placeholders to authenticated blob URLs on demand. Needs an active Drive token;
// degrades to a labelled chip when offline / not synced / missing.

import { driveDownload } from './drive.js';

let _manifest = {};            // basename -> Drive file id
const _cache = new Map();      // fileId -> objectURL (per session)

export function setImageManifest(m) { _manifest = m || {}; }
export function hasManifest() { return Object.keys(_manifest).length > 0; }

export async function hydrate(container, token) {
  if (!container) return;
  const wraps = container.querySelectorAll('.note-img-wrap[data-file]');
  for (const w of wraps) {
    const name = w.dataset.file, alt = w.dataset.alt || '';
    const chip = w.querySelector('.img-chip');
    const fid = _manifest[name];
    if (!fid) { if (chip) chip.textContent = `🖼 ${alt || name} (missing)`; continue; }
    if (!token) { if (chip) chip.textContent = `🖼 ${alt || name} (sync to load)`; continue; }
    try {
      let url = _cache.get(fid);
      if (!url) {
        const blob = await (await driveDownload(fid, token)).blob();
        url = URL.createObjectURL(blob);
        _cache.set(fid, url);
      }
      const img = document.createElement('img');
      img.className = 'note-img'; img.loading = 'lazy'; img.src = url; img.alt = alt;
      w.replaceWith(img);
    } catch {
      if (chip) chip.textContent = `🖼 ${alt || name} (failed to load)`;
    }
  }
}
