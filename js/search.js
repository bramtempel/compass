// search.js — float16 decode + brute-force cosine over canonical index + local captures.

import { DIM } from './embed.js';

export function decodeF16(buffer) {
  const u16 = new Uint16Array(buffer);
  const f32 = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i], s = (h >> 15) & 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    let v;
    if (e === 0) v = m * 5.960464477539063e-8;
    else if (e === 31) v = m ? NaN : Infinity;
    else v = (1 + m / 1024) * (2 ** (e - 15));
    f32[i] = s ? -v : v;
  }
  return f32;
}

// query: Float32Array(DIM); vectors: Float32Array(N*DIM); notes: index.notes[]
// captures: [{vector:Float32Array, note}] (optimistic local). Returns top-k note-like objs + score.
export function search(query, vectors, notes, captures, k = 8) {
  const scores = [];
  const N = notes.length;
  for (let i = 0; i < N; i++) {
    let dot = 0; const off = i * DIM;
    for (let j = 0; j < DIM; j++) dot += query[j] * vectors[off + j];
    scores.push({ note: notes[i], score: dot });
  }
  for (const cap of captures) {
    let dot = 0; const v = cap.vector;
    for (let j = 0; j < DIM; j++) dot += query[j] * v[j];
    scores.push({ note: cap.note, score: dot });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, k).map(s => ({ ...s.note, score: s.score }));
}
