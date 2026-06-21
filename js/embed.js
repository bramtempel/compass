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
  const { pipeline, env } = await import(
    'https://cdn.jsdelivr.net/npm/@xenova/transformers@2/dist/transformers.esm.min.js');
  env.allowLocalModels = false;
  extractor = await pipeline('feature-extraction', MODEL_ID, {
    progress_callback: p => { if (p.status === 'progress' && onProgress) onProgress(p); },
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
