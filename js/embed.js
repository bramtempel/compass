// embed.js — on-device embedding via transformers.js. Mirrors the laptop pipeline
// (same model, 80/20 word chunks, mean-pool, L2-normalize) so vectors are comparable.

export const DIM = 384;
const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const CHUNK_WORDS = 80, CHUNK_OVERLAP = 20;

let extractor = null;

export function modelReady() { return !!extractor; }

function chunkText(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= CHUNK_WORDS) return [text];
  const step = CHUNK_WORDS - CHUNK_OVERLAP, out = [];
  for (let s = 0; s < words.length; s += step) {
    out.push(words.slice(s, s + CHUNK_WORDS).join(' '));
    if (s + CHUNK_WORDS >= words.length) break;
  }
  return out;
}

export async function loadModel(onProgress) {
  if (extractor) return;
  // Self-hosted engine — no CDN dependency (the CDN's transformers.esm.min.js 404s now).
  const { pipeline, env } = await import('../vendor/transformers/transformers.js');
  env.allowLocalModels = false;
  // Self-hosted ONNX runtime WASM (single-threaded SIMD build; GitHub Pages has no threads).
  env.backends.onnx.wasm.wasmPaths = new URL('../vendor/transformers/', import.meta.url).href;
  env.backends.onnx.wasm.numThreads = 1;

  // Aggregate per-file download progress into one overall number.
  const files = {};
  extractor = await pipeline('feature-extraction', MODEL_ID, {
    progress_callback: p => {
      if (p.file) {
        const e = files[p.file] || (files[p.file] = { loaded: 0, total: 0 });
        if (p.total) e.total = p.total;
        if (p.status === 'done') e.loaded = e.total || e.loaded;
        else if (p.loaded != null) e.loaded = p.loaded;
      }
      let loaded = 0, total = 0;
      for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
      onProgress && onProgress({
        status: p.status, file: p.file,
        loaded, total, pct: total ? Math.round(100 * loaded / total) : null,
        nFiles: Object.keys(files).length,
      });
    },
  });
}

export async function embedText(text) {
  if (!extractor) throw new Error('Model not loaded');
  const chunks = chunkText(text);
  const pool = new Float32Array(DIM);
  for (const chunk of chunks) {
    const out = await extractor(chunk, { pooling: 'mean', normalize: false });
    for (let i = 0; i < DIM; i++) pool[i] += out.data[i];
  }
  for (let i = 0; i < DIM; i++) pool[i] /= chunks.length;
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += pool[i] * pool[i];
  norm = Math.sqrt(norm);
  if (norm > 1e-9) for (let i = 0; i < DIM; i++) pool[i] /= norm;
  return pool;
}
