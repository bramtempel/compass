// sync.js — pull the four artifacts from Drive, cache in IndexedDB, decode vectors.
// loadCached() gives an instant offline boot; syncFromDrive() refreshes in the background.

import { K, cfg } from './config.js';
import { idbGet, idbSet } from './db.js';
import { driveDownload } from './drive.js';
import { decodeF16 } from './search.js';

export async function loadCached() {
  const [index, vecBuf, suggestions, library, images, labels] = await Promise.all([
    idbGet('index'), idbGet('vectors_buf'), idbGet('suggestions'), idbGet('library'), idbGet('images'), idbGet('labels')]);
  if (!index || !vecBuf) return null;
  return { index, vectors: decodeF16(vecBuf), suggestions, library, images, labels };
}

export async function syncFromDrive(token, onProgress = () => {}) {
  const indexId = cfg(K.INDEX_ID), vectorsId = cfg(K.VECTORS_ID);
  const suggId = cfg(K.SUGGESTIONS_ID), libId = cfg(K.LIBRARY_ID), imgId = cfg(K.IMAGES_MANIFEST_ID);
  const labelsId = cfg(K.LABELS_ID);
  if (!indexId || !vectorsId) throw new Error('Drive file IDs not configured.');

  onProgress('index', 20);
  const index = await (await driveDownload(indexId, token)).json();

  onProgress('vectors', 45);
  const vecBuf = await (await driveDownload(vectorsId, token)).arrayBuffer();

  let suggestions = null, library = null, images = null, labels = null;
  if (suggId) { onProgress('suggestions', 60); try { suggestions = await (await driveDownload(suggId, token)).json(); } catch {} }
  if (libId)  { onProgress('library', 78);     try { library = await (await driveDownload(libId, token)).json(); } catch {} }
  if (imgId)  { onProgress('images', 88);      try { images = await (await driveDownload(imgId, token)).json(); } catch {} }
  if (labelsId) { onProgress('themes', 92);    try { labels = await (await driveDownload(labelsId, token)).json(); } catch {} }

  onProgress('cache', 95);
  await idbSet('index', index);
  await idbSet('vectors_buf', vecBuf);
  if (suggestions) await idbSet('suggestions', suggestions);
  if (library) await idbSet('library', library);
  if (images) await idbSet('images', images);
  if (labels) await idbSet('labels', labels);

  return { index, vectors: decodeF16(vecBuf), suggestions, library, images, labels };
}
