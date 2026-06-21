// drive.js — Google OAuth (GIS) + Drive read/write.

import { K, cfg } from './config.js';

let _gisLoaded = false;
let _accessToken = null;

async function loadGIS() {
  if (_gisLoaded) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  _gisLoaded = true;
}

export function cachedToken() { return _accessToken; }

export async function getAccessToken(forcePrompt = false) {
  await loadGIS();
  const clientId = cfg(K.CLIENT_ID);
  if (!clientId) throw new Error('No Google Client ID configured.');
  return new Promise((res, rej) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: r => {
        if (r.error) return rej(new Error(r.error));
        _accessToken = r.access_token;
        res(r.access_token);
      },
    });
    client.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
  });
}

export async function driveDownload(fileId, token) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Drive download failed (${r.status})`);
  return r;
}

export async function driveUpload(name, folderId, content, token) {
  const meta = { name, ...(folderId ? { parents: [folderId] } : {}) };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'text/markdown' }));
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!r.ok) throw new Error(`Drive upload failed (${r.status})`);
  return r.json();
}
