// config.js — localStorage-backed config. Defaults are Bram's deployment (not secret);
// the API key is never defaulted.

export const K = {
  CLIENT_ID:      'compass_client_id',
  INDEX_ID:       'compass_index_id',
  VECTORS_ID:     'compass_vectors_id',
  SUGGESTIONS_ID: 'compass_suggestions_id',
  LIBRARY_ID:     'compass_library_id',
  INBOX_ID:       'compass_inbox_id',
  API_KEY:            'compass_api_key',
  WORKER_URL:         'compass_worker_url',
  IMAGES_MANIFEST_ID: 'compass_images_manifest_id', // images.json (basename->driveId)
};

const DEFAULTS = {
  [K.CLIENT_ID]:      '1001895233991-ijq4c9ve5f7kptjoirf2ai7ej5geojlb.apps.googleusercontent.com',
  [K.INDEX_ID]:       '14yaaCo34DGG9y8g4hEOOMhnwYC7Svcg7',
  [K.VECTORS_ID]:     '1E_OVRCv3XA2ck5zvmqluyC2hjlxwVMIM',
  [K.SUGGESTIONS_ID]: '1MhHN8EVdBVSNubVbcBJURjya-1ddxh7d',
  [K.LIBRARY_ID]:     '1n0DyGF5neSJOq0D7_IRFbX8Q7QPq9r-A',
  [K.INBOX_ID]:       '1FDXJ26ilwm8f6NTVl8hOyrkKI9-tyowz',
  [K.WORKER_URL]:     'https://snowy-frog-5917.bramtempelaere1.workers.dev',
};

export function cfg(key, val) {
  if (val !== undefined) { localStorage.setItem(key, val); return val; }
  const stored = localStorage.getItem(key);
  if (stored !== null) return stored;
  return DEFAULTS[key] || '';
}

export function isConfigured() {
  return !!(cfg(K.CLIENT_ID) && cfg(K.INDEX_ID) && cfg(K.VECTORS_ID));
}
