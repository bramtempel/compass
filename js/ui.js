// ui.js — DOM helpers, screen transitions, tiny markdown renderer.

export const $ = id => document.getElementById(id);
export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function folderFromPath(path) {
  const parts = (path || '').replace(/\\/g, '/').split('/');
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

export function relativeTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return 'yesterday';
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  const node = $(id);
  if (node) node.scrollTop = 0;
}

// Whether note images are hosted (flat Files/ at app root). Off => show placeholders.
let _imagesHosted = false;
export function setImagesHosted(v) { _imagesHosted = !!v; }

function fileName(src) {
  try { return decodeURIComponent(src.split('/').pop()); } catch { return src.split('/').pop(); }
}

// Minimal, safe markdown -> HTML. Escapes first, then applies a small subset.
export function renderMarkdown(md) {
  let s = esc(md || '');
  // images: ![alt](src). Hosted + image ext -> hydratable wrapper (images.js fills it
  // with a Drive blob). Otherwise a tasteful placeholder chip.
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const name = fileName(src);
    const isImg = /\.(jpe?g|png|gif|webp|svg)$/i.test(name);
    const a = alt.replace(/"/g, '&quot;');
    const label = alt || name;
    if (_imagesHosted && isImg) {
      return `<span class="note-img-wrap" data-file="${name.replace(/"/g, '&quot;')}" data-alt="${a}"><span class="img-chip">🖼 ${label}…</span></span>`;
    }
    return `<span class="img-chip">${isImg ? '🖼' : '📎'} ${label}</span>`;
  });
  // links: [text](url) -> external anchor
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  // code spans
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold / italic
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // UpNote exports use literal <br> for line breaks — allow just that tag back
  s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  const lines = s.split('\n');
  const out = [];
  let inList = null; // 'ul' | 'ol'
  const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };
  for (let raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^#{1,6}\s+(.*)$/))) { closeList(); out.push(`<h3>${m[1]}</h3>`); }
    else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { if (inList !== 'ul') { closeList(); out.push('<ul>'); inList = 'ul'; } out.push(`<li>${m[1]}</li>`); }
    else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) { if (inList !== 'ol') { closeList(); out.push('<ol>'); inList = 'ol'; } out.push(`<li>${m[1]}</li>`); }
    else if (line === '') { closeList(); }
    else { closeList(); out.push(`<p>${line}</p>`); }
  }
  closeList();
  return out.join('');
}
