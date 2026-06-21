// sync.js — pull the four artifacts from Drive, cache in IndexedDB, decode vectors.
// loadCached() gives an instant offline boot; syncFromDrive() refreshes in the background.

import { K, cfg } from './config.js';
import { idbGet, idbSet } from './db.js';
import { driveDownload } from './drive.js';
import { decodeF16 } from './search.js';

export async function loadCached() {
  const [index, vecBuf, suggestions, library] = await Promise.all([
    idbGet('index'), idbGet('vectors_buf'), idbGet('suggestions'), idbGet('library')]);
  if (!index || !vecBuf) return null;
  return { index, vectors: decodeF16(vecBuf), suggestions, library };
}

export async function syncFromDrive(token, onProgress = () => {}) {
  const indexId = cfg(K.INDEX_ID), vectorsId = cfg(K.VECTORS_ID);
  const suggId = cfg(K.SUGGESTIONS_ID), libId = cfg(K.LIBRARY_ID);
  if (!indexId || !vectorsId) throw new Error('Drive file IDs not configured.');

  onProgress('index', 20);
  const index = await (await driveDownload(indexId, token)).json();

  onProgress('vectors', 45);
  const vecBuf = await (await driveDownload(vectorsId, token)).arrayBuffer();

  let suggestions = null, library = null;
  if (suggId) { onProgress('suggestions', 65); try { suggestions = await (await driveDownload(suggId, token)).json(); } catch {} }
  if (libId)  { onProgress('library', 85);     try { library = await (await driveDownload(libId, token)).json(); } catch {} }

  onProgress('cache', 95);
  await idbSet('index', index);
  await idbSet('vectors_buf', vecBuf);
  if (suggestions) await idbSet('suggestions', suggestions);
  if (library) await idbSet('library', library);

  return { index, vectors: decodeF16(vecBuf), suggestions, library };
}
