// bespoke.js — the one on-tap online step. Sends the new thought + related snippets to
// Haiku (via the Cloudflare Worker proxy) and returns the most relevant passages.

import { K, cfg } from './config.js';

export async function getBespoke(noteText, results) {
  const apiKey = cfg(K.API_KEY);
  const workerUrl = cfg(K.WORKER_URL);
  if (!apiKey) throw new Error('No Anthropic API key set (Settings).');
  if (!workerUrl) throw new Error('No Worker URL set (Settings).');

  const snippets = results.slice(0, 5).map((r, i) =>
    `[${i}] "${r.title}": ${(r.body || '').slice(0, 220).trim()}`).join('\n\n');

  const prompt = `You are helping someone reconnect with their own past writing.

New thought:
"${noteText}"

Their related past notes:
${snippets}

Pick the 2-3 MOST relevant passages — verbatim excerpts from the notes above (their own words, do not invent). Respond with JSON only:
{"passages":[{"title":"note title","excerpt":"the verbatim passage","folder":"folder if known"}]}`;

  const r = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`API error ${r.status}`);
  const data = await r.json();
  const text = data.content?.[0]?.text ?? '';
  try {
    const clean = text.replace(/```json\s*|\s*```/g, '').trim();
    const parsed = JSON.parse(clean);
    return parsed.passages || [];
  } catch {
    return [{ title: 'Response', excerpt: text, folder: '' }];
  }
}

// Weave an assembled merge draft into one cohesive note, in the writer's voice.
export async function rewriteMerge(draft) {
  const apiKey = cfg(K.API_KEY), workerUrl = cfg(K.WORKER_URL);
  if (!apiKey) throw new Error('No Anthropic API key set (Settings).');
  if (!workerUrl) throw new Error('No Worker URL set (Settings).');

  const prompt = `Weave the following fragments — drawn from the writer's own past notes plus a new thought — into ONE clear, cohesive note in their first-person voice. Preserve their meaning and phrasing where possible; do not invent new claims or add commentary. Return only the woven note prose, no preamble.\n\n${draft}`;

  const r = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`API error ${r.status}`);
  const data = await r.json();
  return (data.content?.[0]?.text ?? '').trim();
}
