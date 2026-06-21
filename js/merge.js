// merge.js — weave the captured thought into one or more existing notes.
// Sentence-level diff (tap to include/exclude), editable result (seeded from note bodies),
// optional AI rewrite, then save as a NEW note to inbox/ (additive — originals untouched).

import { K, cfg } from './config.js';
import { driveUpload, getAccessToken, cachedToken } from './drive.js';
import { rewriteMerge } from './bespoke.js';
import { $, el, esc, showScreen } from './ui.js';

let state = { notes: [], thought: '', lines: [], onSaved: null };

const splitSentences = t => (t || '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);

export function openMerge(notes, thought, onSaved) {
  state = { notes, thought, onSaved, lines: [] };
  $('merge-subtitle').textContent = notes.length === 1
    ? notes[0].title : notes.map(n => n.title).join(' + ');

  const lines = [];
  notes.forEach(n => splitSentences(n.body).forEach(text =>
    lines.push({ text, type: 'existing', excluded: false })));
  splitSentences(thought).forEach(text =>
    lines.push({ text, type: 'new', excluded: false }));
  state.lines = lines;

  $('merge-result-ta').value = lines.map(l => l.text).join(' ');
  renderDiff();
  $('overlay-merge').classList.add('open');
}

function renderDiff() {
  const c = $('merge-diff');
  c.innerHTML = '';
  state.lines.forEach((l, i) => {
    const row = el('div', `diff-line ${l.excluded ? 'excluded' : l.type}`);
    const glyph = l.type === 'new' ? '+' : (l.excluded ? '−' : '·');
    row.innerHTML = `<span class="diff-glyph">${glyph}</span><span class="diff-text">${esc(l.text)}</span>`;
    row.addEventListener('click', () => toggleLine(i));
    c.appendChild(row);
  });
}

// String-based toggle so manual edits to the result survive (per spec).
function toggleLine(i) {
  const l = state.lines[i];
  const ta = $('merge-result-ta');
  if (ta.value.includes(l.text)) {
    ta.value = ta.value.split(l.text).join('').replace(/\s{2,}/g, ' ').trim();
    l.excluded = true;
  } else {
    ta.value = (ta.value + ' ' + l.text).trim();
    l.excluded = false;
  }
  renderDiff();
}

function resetDraft() {
  state.lines.forEach(l => { l.excluded = false; });
  $('merge-result-ta').value = state.lines.map(l => l.text).join(' ');
  renderDiff();
}

async function doRewrite() {
  const btn = $('merge-rewrite');
  btn.disabled = true; btn.textContent = 'Rewriting…';
  try {
    const text = await rewriteMerge($('merge-result-ta').value);
    if (text) $('merge-result-ta').value = text;
  } catch (e) { alert('AI rewrite failed: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Rewrite with AI'; }
}

function approve() {
  $('overlay-merge').classList.remove('open');
  const body = $('merge-result-ta').value.trim();
  $('merge-title-input').value = (body.split(/[.!?\n]/)[0] || '').trim().slice(0, 60);
  $('merge-result-body').value = body;
  const tags = [...new Set(state.notes.map(n => n.folder).filter(Boolean))].concat(['merged']);
  $('merge-tags').innerHTML = tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join('');
  showScreen('screen-merge-result');
}

async function save() {
  const title = $('merge-title-input').value.trim() || 'Untitled';
  const body = $('merge-result-body').value.trim();
  const btn = $('merge-save');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const folderId = cfg(K.INBOX_ID);
    if (!folderId) throw new Error('No inbox folder configured (Settings).');
    const token = cachedToken() || await getAccessToken();
    const now = new Date().toISOString();
    const content = `---\ndate: ${now}\ncreated: ${now}\ntags: [merged]\n---\n\n# ${title}\n\n${body}`;
    await driveUpload(`${Date.now()}-merged.md`, folderId, content, token);
    btn.textContent = 'Saved ✓';
    if (state.onSaved) state.onSaved({ title, body });
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Save note'; showScreen('screen-capture'); }, 800);
  } catch (e) {
    alert('Save failed: ' + e.message);
    btn.disabled = false; btn.textContent = 'Save note';
  }
}

export function initMerge() {
  $('merge-close').addEventListener('click', () => $('overlay-merge').classList.remove('open'));
  $('merge-cancel').addEventListener('click', () => $('overlay-merge').classList.remove('open'));
  $('merge-reset').addEventListener('click', resetDraft);
  $('merge-rewrite').addEventListener('click', doRewrite);
  $('merge-approve').addEventListener('click', approve);
  $('merge-save').addEventListener('click', save);
  $('merge-discard').addEventListener('click', () => showScreen('screen-related'));
  $('merge-result-back').addEventListener('click', () => showScreen('screen-related'));
}
