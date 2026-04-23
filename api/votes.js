import { kv } from '@vercel/kv';
import { json } from './_util.js';

// GET /api/votes — returns { archive: { idx: {up, down}, ... }, capstone: {...}, community: {...} }
// Storage: per (mode, idx) pair, two keys — slidetackled:v:up:<mode>:<idx> and :down:<mode>:<idx>
// We keep an index set per mode to know which indices have any votes.
// For <=1000 voted entries this is fine. If it grows, a hash-per-mode would be more efficient.

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });

  const out = { archive: {}, capstone: {}, community: {} };

  for (const mode of ['archive', 'capstone', 'community']) {
    const members = await kv.smembers(`slidetackled:voted-idx:${mode}`);
    if (!members || !members.length) continue;

    // Batch fetch up/down for each index.
    const keys = [];
    for (const idx of members) {
      keys.push(`slidetackled:v:up:${mode}:${idx}`);
      keys.push(`slidetackled:v:down:${mode}:${idx}`);
    }
    const values = await kv.mget(...keys);
    for (let i = 0; i < members.length; i++) {
      const idx = members[i];
      const up = Number(values[i * 2]) || 0;
      const down = Number(values[i * 2 + 1]) || 0;
      out[mode][idx] = { up, down };
    }
  }

  res.setHeader('cache-control', 'public, max-age=30');
  return json(res, 200, out);
}
